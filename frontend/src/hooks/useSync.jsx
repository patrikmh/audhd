/**
 * useSync hook - manages data synchronization with server
 */

import { useCallback, useRef, useEffect } from 'react';
import { SyncClient } from '../services/sync';
import { mergeServerChanges, toWireChanges } from '../services/syncData';
import { APIClient } from '../services/api';

export function useSync(apiBase, getAuth, username, state, setState) {
  const syncClientRef = useRef(null);
  const apiClientRef = useRef(null);
  const syncInProgressRef = useRef(false);
  const quickSyncTimer = useRef(null);

  // Initialize clients
  useEffect(() => {
    const syncClient = new SyncClient(apiBase, getAuth, username);
    syncClientRef.current = syncClient;
    apiClientRef.current = new APIClient(apiBase, getAuth);
    return () => {
      syncClient.dispose();
      syncClientRef.current = null;
      apiClientRef.current = null;
      clearTimeout(quickSyncTimer.current);
    };
  }, [apiBase, getAuth, username]);

  // Merge server data into local state
  const mergeServerData = useCallback((serverChanges) => {
    if (!serverChanges) return Promise.resolve();

    return new Promise((resolve, reject) => {
      setState(prevState => {
        const merged = mergeServerChanges(prevState, serverChanges);

        try {
          localStorage.setItem(`varv-state:${username}`, JSON.stringify(merged));
          resolve();
          return merged;
        } catch (error) {
          reject(error);
          return prevState;
        }
      });
    });
  }, [setState, username]);

  // Perform sync
  const performSync = useCallback(async () => {
    if (syncInProgressRef.current || !syncClientRef.current) {
      return { success: false, reason: 'sync_in_progress' };
    }

    syncInProgressRef.current = true;

    try {
      const pullAll = async () => {
        let firstChanges = null;
        let hasMore = false;
        const applyPage = async (page, alreadyStaged = false) => {
          if (!alreadyStaged) syncClientRef.current.stagePage(page);
          if (firstChanges === null) firstChanges = page.changes;
          await mergeServerData(page.changes);
          syncClientRef.current.commitCursor(page.next_cursor);
          syncClientRef.current.clearStagedPage();
          return page.has_more;
        };

        const stagedPage = syncClientRef.current.loadStagedPage();
        if (stagedPage) hasMore = await applyPage(stagedPage, true);
        do {
          const page = await syncClientRef.current.pullPage();
          hasMore = await applyPage(page);
        } while (hasMore);
        return firstChanges || {};
      };

      // Pull first to get latest server state
      const pullResult = await pullAll();

      // Then push local changes
      const pushResult = await syncClientRef.current.push();

      // Pull again to get any changes that happened during our push
      await pullAll();

      return {
        success: true,
        push: pushResult,
        pull: pullResult
      };
    } catch (error) {
      console.error('Sync failed:', error);
      return { success: false, reason: error.message };
    } finally {
      syncInProgressRef.current = false;
    }
  }, [mergeServerData]);

  // Track a state change
  const trackChange = useCallback((kind, id, op, data) => {
    if (syncClientRef.current) {
      for (const change of toWireChanges(kind, id, op, data)) {
        syncClientRef.current.track(change.kind, change.id, change.op, change.data);
      }
    }
    // Push soon after a change instead of waiting for the periodic/focus sync —
    // otherwise something you just typed (e.g. an idea) doesn't exist server-side
    // yet if you immediately open a server-computed view like the idea mindmap.
    // Debounced so a burst of edits coalesces into one push, not one per keystroke.
    clearTimeout(quickSyncTimer.current);
    quickSyncTimer.current = setTimeout(() => performSync(), 2500);
  }, [performSync]);

  // Initial sync on mount
  useEffect(() => {
    const auth = getAuth();
    if (auth?.token && state.settings?.autoSync !== false) {
      // Delay initial sync slightly to avoid blocking initial render
      const timer = setTimeout(() => {
        performSync();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, []);

  return {
    performSync,
    trackChange,
    mergeServerData,
    apiClient: apiClientRef.current,
    syncClient: syncClientRef.current
  };
}
