/**
 * useSync hook - manages data synchronization with server
 */

import { useCallback, useRef, useEffect } from 'react';
import { SyncClient, trackStateChange } from '../services/sync';
import { APIClient } from '../services/api';

export function useSync(apiBase, getAuth, username, state, setState) {
  const syncClientRef = useRef(null);
  const apiClientRef = useRef(null);
  const syncInProgressRef = useRef(false);

  // Initialize clients
  useEffect(() => {
    const syncClient = new SyncClient(apiBase, getAuth, username);
    syncClientRef.current = syncClient;
    apiClientRef.current = new APIClient(apiBase, getAuth);
    return () => {
      syncClient.dispose();
      syncClientRef.current = null;
      apiClientRef.current = null;
    };
  }, [apiBase, getAuth, username]);

  // Convert server data to local state format
  const serverToLocal = useCallback((serverData) => {
    const localState = {
      tasks: [],
      ideas: [],
      wins: [],
      energyLog: [],
      lists: [{ id: "shopping", name: "Inköp", items: [] }],
      agentLog: [],
    };

    // Convert tasks
    if (serverData.task) {
      localState.tasks = serverData.task.map(t => ({
        id: t.id,
        title: t.title,
        icon: t.icon,
        trigger: t.trigger,
        energy: t.energy,
        time: t.time,
        minutes: t.minutes,
        essential: t.essential,
        priority: t.priority,
        inbox: t.inbox,
        done: t.done,
        doneAt: t.done_at,
        createdAt: t.created_at,
        updatedAt: t.updated_at,
        deletedAt: t.deleted_at,
        day: t.day,
        steps: []
      }));
    }

    // Convert task steps
    if (serverData.task_step) {
      const stepsByTask = {};
      serverData.task_step.forEach(st => {
        if (!stepsByTask[st.task_id]) {
          stepsByTask[st.task_id] = [];
        }
        stepsByTask[st.task_id].push({
          id: st.id,
          title: st.title,
          minutes: st.minutes,
          position: st.position,
          done: st.done,
          updatedAt: st.updated_at,
          deletedAt: st.deleted_at
        });
      });

      localState.tasks.forEach(task => {
        task.steps = stepsByTask[task.id] || [];
      });
    }

    // Convert ideas
    if (serverData.idea) {
      localState.ideas = serverData.idea.map(i => ({
        id: i.id,
        raw: i.raw,
        title: i.title,
        note: i.note,
        tags: i.tags || [],
        status: i.status,
        attempts: i.attempts || 0,
        ts: i.created_at,
        updatedAt: i.updated_at,
        deletedAt: i.deleted_at
      }));
    }

    // Convert wins
    if (serverData.win) {
      localState.wins = serverData.win.map(w => ({
        id: w.id,
        text: w.text,
        day: w.day,
        ts: w.created_at
      }));
    }

    // Convert energy events
    if (serverData.energy_event) {
      localState.energyLog = serverData.energy_event.map(e => ({
        id: e.id,
        delta: e.delta,
        label: e.label,
        day: e.day,
        ts: e.created_at
      }));
    }

    // Convert list items
    if (serverData.list_item) {
      const itemsByList = {};
      serverData.list_item.forEach(item => {
        if (!itemsByList[item.list_id]) {
          itemsByList[item.list_id] = [];
        }
        itemsByList[item.list_id].push({
          id: item.id,
          text: item.text,
          done: item.done,
          updatedAt: item.updated_at,
          deletedAt: item.deleted_at
        });
      });

      localState.lists = Object.entries(itemsByList).map(([listId, items]) => ({
        id: listId,
        name: listId === 'shopping' ? 'Inköp' : 'Lista',
        items
      }));
    }

    return localState;
  }, []);

  // Merge server data into local state
  const mergeServerData = useCallback((serverChanges) => {
    if (!serverChanges) return Promise.resolve();

    const serverLocal = serverToLocal(serverChanges);

    return new Promise((resolve, reject) => {
      setState(prevState => {
        const merged = { ...prevState };

        // Merge tasks (server wins on conflicts)
        if (serverLocal.tasks.length > 0) {
          const taskMap = new Map([...prevState.tasks, ...serverLocal.tasks].map(t => [t.id, t]));
          merged.tasks = Array.from(taskMap.values())
            .filter(t => !t.deletedAt)
            .sort((a, b) => {
              const pOrder = { A: 0, B: 1, C: 2 };
              const pa = pOrder[a.priority] ?? 3;
              const pb = pOrder[b.priority] ?? 3;
              if (pa !== pb) return pa - pb;
              return (a.time || '23:59').localeCompare(b.time || '23:59');
            });
        }

        // Merge ideas
        if (serverLocal.ideas.length > 0) {
          const ideaMap = new Map([...prevState.ideas, ...serverLocal.ideas].map(i => [i.id, i]));
          merged.ideas = Array.from(ideaMap.values())
            .filter(i => !i.deletedAt)
            .sort((a, b) => (b.ts || '').localeCompare(a.ts || ''));
        }

        // Merge wins
        if (serverLocal.wins.length > 0) {
          const winMap = new Map([...prevState.wins, ...serverLocal.wins].map(w => [w.id, w]));
          merged.wins = Array.from(winMap.values())
            .sort((a, b) => (b.ts || '').localeCompare(a.ts || ''));
        }

        // Merge energy log
        if (serverLocal.energyLog.length > 0) {
          const energyMap = new Map([...prevState.energyLog, ...serverLocal.energyLog].map(e => [e.id, e]));
          merged.energyLog = Array.from(energyMap.values())
            .sort((a, b) => (b.ts || '').localeCompare(a.ts || ''));
        }

        // Merge lists — keep local names, only update items from server
        if (serverLocal.lists.length > 0) {
          const localNames = new Map(prevState.lists.map((l) => [l.id, l.name]));
          const serverIds = new Set(serverLocal.lists.map((l) => l.id));
          const mergedLists = serverLocal.lists.map((sl) => ({
            ...sl,
            name: localNames.get(sl.id) || (sl.id === 'shopping' ? 'Inköp' : sl.name),
            items: sl.items.filter((i) => !i.deletedAt),
          }));
          for (const list of prevState.lists) {
            if (!serverIds.has(list.id)) mergedLists.push(list);
          }
          merged.lists = mergedLists;
        }

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
  }, [serverToLocal, setState, username]);

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
      syncClientRef.current.track(kind, id, op, data);
    }
  }, []);

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
