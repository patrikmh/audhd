/**
 * Sync service - handles push/pull with server database
 * Implements change tracking and conflict resolution (LWW - last write wins)
 */

const SYNCABLE = {
  task: true,
  task_step: true,
  idea: true,
  list_item: true,
  win: true,
  energy_event: true,
};

// Generate UUIDv7 for client-side IDs
function uuidv7() {
  const now = Date.now();
  const sec = Math.floor(now / 1000);
  const ms = now % 1000;
  const rand = crypto.getRandomValues(new Uint16Array(5));

  const timestamp = (sec & 0x0fffffff) * 1000 + ms;
  const version = 0x7 << 12; // UUID version 7
  const variant = 0x8 << 12; // UUID variant

  const timeHi = (timestamp >> 16) & 0xffff;
  const timeLo = timestamp & 0xffff;
  const clkSeqHiAndRes = ((rand[0] & 0x3fff) | variant) >>> 8;
  const clkSeqLo = (rand[0] & 0xff) | ((rand[1] & 0x3f) << 8);
  const node0 = rand[2];
  const node1 = rand[3];
  const node2 = rand[4];

  const hex = (n, w) => n.toString(16).padStart(w, '0');
  const octets = [
    hex(timeHi, 4),
    hex(timeLo, 4),
    hex(((rand[0] & 0x0f) << 12) | (clkSeqHiAndRes << 8) | clkSeqLo, 4),
    hex(node0, 2), hex(node1, 2), hex(node2, 2)
  ];

  return octets.join('-').padEnd(36, '0').slice(0, 36);
}

/**
 * Track local changes for sync
 */
class ChangeTracker {
  constructor() {
    this.changes = new Map(); // id -> {kind, op, data, updated_at}
    this.loadPending();
  }

  loadPending() {
    try {
      const saved = localStorage.getItem('varv-pending-changes');
      if (saved) {
        const parsed = JSON.parse(saved);
        this.changes = new Map(Object.entries(parsed));
      }
    } catch (e) {
      console.error('Failed to load pending changes:', e);
    }
  }

  savePending() {
    try {
      const obj = Object.fromEntries(this.changes);
      localStorage.setItem('varv-pending-changes', JSON.stringify(obj));
    } catch (e) {
      console.error('Failed to save pending changes:', e);
    }
  }

  track(kind, id, op, data = {}) {
    const key = `${kind}:${id}`;
    this.changes.set(key, {
      kind,
      id,
      op,
      data,
      updated_at: new Date().toISOString()
    });
    this.savePending();
  }

  remove(kind, id) {
    const key = `${kind}:${id}`;
    this.changes.delete(key);
    this.savePending();
  }

  getPending() {
    return Array.from(this.changes.values());
  }

  clear() {
    this.changes.clear();
    this.savePending();
  }
}

/**
 * Sync client - handles push/pull operations
 */
class SyncClient {
  constructor(apiBase, getAuth) {
    this.apiBase = apiBase;
    this.getAuth = getAuth;
    this.tracker = new ChangeTracker();
    this.cursor = this.loadCursor();
  }

  loadCursor() {
    try {
      return localStorage.getItem('varv-sync-cursor') || null;
    } catch (e) {
      return null;
    }
  }

  saveCursor(cursor) {
    try {
      localStorage.setItem('varv-sync-cursor', cursor || '');
    } catch (e) {
      console.error('Failed to save cursor:', e);
    }
  }

  async push() {
    const auth = this.getAuth();
    if (!auth?.token) {
      throw new Error('Not authenticated');
    }

    const changes = this.tracker.getPending();
    if (changes.length === 0) {
      return { created: 0, updated: 0, deleted: 0, skipped: 0 };
    }

    const response = await fetch(`${this.apiBase}/api/sync/push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${auth.token}`
      },
      body: JSON.stringify(changes)
    });

    if (!response.ok) {
      throw new Error(`Sync push failed: ${response.status}`);
    }

    const result = await response.json();

    // Clear pending changes on success
    if (result.created + result.updated + result.deleted > 0) {
      this.tracker.clear();
    }

    return result;
  }

  async pull() {
    const auth = this.getAuth();
    if (!auth?.token) {
      throw new Error('Not authenticated');
    }

    const url = this.cursor
      ? `${this.apiBase}/api/sync/pull?since=${encodeURIComponent(this.cursor)}`
      : `${this.apiBase}/api/sync/pull`;

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${auth.token}`
      }
    });

    if (!response.ok) {
      throw new Error(`Sync pull failed: ${response.status}`);
    }

    const result = await response.json();

    // Update cursor to latest server time
    if (result.server_time) {
      this.saveCursor(result.server_time);
    }

    return result.changes;
  }

  /**
   * Track a change for next sync
   */
  track(kind, id, op, data) {
    this.tracker.track(kind, id, op, data);
  }

  /**
   * Remove pending change (if sync happened elsewhere)
   */
  removePending(kind, id) {
    this.tracker.remove(kind, id);
  }

  /**
   * Full sync: push local changes, then pull remote changes
   */
  async sync() {
    const pushResult = await this.push();
    const pullResult = await this.pull();
    return { push: pushResult, pull: pullResult };
  }
}

/**
 * Helper to track state changes automatically
 */
function trackStateChange(syncClient, kind, oldState, newState, idField = 'id') {
  if (!oldState && newState) {
    // Insert
    syncClient.track(kind, newState[idField], 'upsert', newState);
  } else if (oldState && !newState) {
    // Delete
    syncClient.track(kind, oldState[idField], 'delete', {});
  } else if (oldState && newState && JSON.stringify(oldState) !== JSON.stringify(newState)) {
    // Update
    syncClient.track(kind, newState[idField], 'upsert', newState);
  }
}

export { SyncClient, trackStateChange, uuidv7, SYNCABLE };