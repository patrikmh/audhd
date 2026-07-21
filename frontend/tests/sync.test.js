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
