/**
 * Sync service - handles push/pull with server database
 * Implements change tracking and conflict resolution (LWW - last write wins)
 */

/**
 * Track local changes for sync
 */
class ChangeTracker {
  constructor(username) {
    this.storageKey = `varv-sync:${encodeURIComponent(username)}:pending`;
    this.changes = new Map(); // id -> {kind, op, data, updated_at}
    this.lastTimestampMs = 0;
    this.loadPending();
  }

  loadPending() {
    try {
      const saved = localStorage.getItem(this.storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        this.changes = new Map(Object.entries(parsed));
        this.lastTimestampMs = Math.max(
          0,
          ...Array.from(this.changes.values(), change => Date.parse(change.updated_at) || 0),
        );
      }
    } catch (e) {
      console.error('Failed to load pending changes:', e);
    }
  }

  savePending() {
    try {
      const obj = Object.fromEntries(this.changes);
      localStorage.setItem(this.storageKey, JSON.stringify(obj));
    } catch (e) {
      console.error('Failed to save pending changes:', e);
    }
  }

  track(kind, id, op, data = {}) {
    const key = `${kind}:${id}`;
    this.lastTimestampMs = Math.max(Date.now(), this.lastTimestampMs + 1);
    this.changes.set(key, {
      kind,
      id,
      op,
      data,
      updated_at: new Date(this.lastTimestampMs).toISOString()
    });
    this.savePending();
  }

  remove(kind, id) {
    const key = `${kind}:${id}`;
    this.changes.delete(key);
    this.savePending();
  }

  ack(change) {
    const key = `${change.kind}:${change.id}`;
    const current = this.changes.get(key);
    if (current?.updated_at !== change.updated_at) return false;
    this.changes.delete(key);
    this.savePending();
    return true;
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
  constructor(apiBase, getAuth, username) {
    if (!username) throw new Error('Sync requires a username');
    this.apiBase = apiBase;
    this.getAuth = getAuth;
    this.username = username;
    this.cursorKey = `varv-sync:${encodeURIComponent(username)}:cursor`;
    this.inboxKey = `varv-sync:${encodeURIComponent(username)}:inbox`;
    this.abortController = new AbortController();
    this.tracker = new ChangeTracker(username);
    this.cursor = this.loadCursor();
  }

  requireAuth() {
    const auth = this.getAuth();
    if (!auth?.token) throw new Error('Not authenticated');
    if (auth.username !== this.username) throw new Error('Authenticated account changed');
    return auth;
  }

  loadCursor() {
    try {
      return localStorage.getItem(this.cursorKey) || null;
    } catch (e) {
      return null;
    }
  }

  saveCursor(cursor) {
    try {
      localStorage.setItem(this.cursorKey, cursor || '');
      this.cursor = cursor || null;
    } catch (e) {
      console.error('Failed to save cursor:', e);
    }
  }

  async push() {
    const auth = this.requireAuth();

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
      signal: this.abortController.signal,
      body: JSON.stringify(changes)
    });

    if (!response.ok) {
      throw new Error(`Sync push failed: ${response.status}`);
    }

    const result = await response.json();

    const acknowledged = new Set(['created', 'updated', 'deleted', 'stale', 'idempotent']);
    const sentByKey = new Map(changes.map(change => [`${change.kind}:${change.id}`, change]));
    for (const item of result.results || []) {
      if (!acknowledged.has(item.status)) continue;
      const sent = sentByKey.get(`${item.kind}:${item.id}`);
      if (sent) this.tracker.ack(sent);
    }

    return result;
  }

  async pullPage() {
    const auth = this.requireAuth();

    const cursor = this.cursor || '0';
    const url = `${this.apiBase}/api/sync/pull?cursor=${encodeURIComponent(cursor)}&limit=200`;

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${auth.token}`
      },
      signal: this.abortController.signal,
    });

    if (!response.ok) {
      throw new Error(`Sync pull failed: ${response.status}`);
    }

    return response.json();
  }

  commitCursor(cursor) {
    this.saveCursor(String(cursor ?? this.cursor ?? 0));
  }

  loadStagedPage() {
    const saved = localStorage.getItem(this.inboxKey);
    return saved ? JSON.parse(saved) : null;
  }

  stagePage(page) {
    localStorage.setItem(this.inboxKey, JSON.stringify(page));
  }

  clearStagedPage() {
    localStorage.removeItem(this.inboxKey);
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

  dispose() {
    this.abortController.abort();
  }
}

export { SyncClient };
