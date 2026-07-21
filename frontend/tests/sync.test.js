import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import { SyncClient } from "../src/services/sync.js";


class MemoryStorage {
  constructor() {
    this.values = new Map();
  }

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  setItem(key, value) {
    this.values.set(key, String(value));
  }

  removeItem(key) {
    this.values.delete(key);
  }
}


beforeEach(() => {
  globalThis.localStorage = new MemoryStorage();
  delete globalThis.fetch;
});


test("pending changes and cursors are isolated by username", () => {
  const aliceAuth = () => ({ username: "alice", token: "alice-token" });
  const bobAuth = () => ({ username: "bob", token: "bob-token" });
  const alice = new SyncClient("http://example.test", aliceAuth, "alice");

  alice.track("task", "task-1", "upsert", { title: "Privat" });
  alice.saveCursor("2026-07-21T20:00:00Z");

  const bob = new SyncClient("http://example.test", bobAuth, "bob");
  assert.deepEqual(bob.tracker.getPending(), []);
  assert.equal(bob.cursor, null);

  const aliceReloaded = new SyncClient("http://example.test", aliceAuth, "alice");
  assert.equal(aliceReloaded.tracker.getPending().length, 1);
  assert.equal(aliceReloaded.cursor, "2026-07-21T20:00:00Z");
});


test("a client refuses to sync after the authenticated account changes", async () => {
  let auth = { username: "alice", token: "alice-token" };
  const client = new SyncClient("http://example.test", () => auth, "alice");
  client.track("task", "task-1", "upsert", { title: "Privat" });
  auth = { username: "bob", token: "bob-token" };

  await assert.rejects(client.push(), /Authenticated account changed/);
  assert.equal(client.tracker.getPending().length, 1);
});


test("an older push response cannot clear a newer queued edit", async () => {
  const auth = () => ({ username: "alice", token: "alice-token" });
  const client = new SyncClient("http://example.test", auth, "alice");
  client.track("task", "task-1", "upsert", { title: "Först" });

  globalThis.fetch = async (_url, options) => {
    const [sent] = JSON.parse(options.body);
    client.track("task", "task-1", "upsert", { title: "Nyare" });
    return {
      ok: true,
      json: async () => ({
        created: 0,
        updated: 1,
        deleted: 0,
        skipped: 0,
        results: [{ ...sent, status: "updated" }],
      }),
    };
  };

  await client.push();

  const [pending] = client.tracker.getPending();
  assert.equal(pending.data.title, "Nyare");
});


test("a pull cursor is stored only after the page is accepted", async () => {
  const auth = () => ({ username: "alice", token: "alice-token" });
  const client = new SyncClient("http://example.test", auth, "alice");
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ changes: { task: [] }, next_cursor: 7, has_more: false }),
  });

  const page = await client.pullPage();
  assert.equal(client.cursor, null);

  client.commitCursor(page.next_cursor);
  assert.equal(client.cursor, "7");
});


test("a staged pull page survives a client remount until it is cleared", () => {
  const auth = () => ({ username: "alice", token: "alice-token" });
  const firstClient = new SyncClient("http://example.test", auth, "alice");
  const page = {
    changes: { task: [{ id: "task-1", title: "Från servern" }] },
    next_cursor: 9,
    has_more: false,
  };
  firstClient.stagePage(page);

  const remountedClient = new SyncClient("http://example.test", auth, "alice");
  assert.deepEqual(remountedClient.loadStagedPage(), page);
  assert.equal(remountedClient.cursor, null);

  remountedClient.clearStagedPage();
  assert.equal(remountedClient.loadStagedPage(), null);
});
