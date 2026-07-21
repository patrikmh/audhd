/**
 * useSync hook - manages data synchronization with server
 */

import { useCallback, useRef, useEffect } from 'react';
import { SyncClient, trackStateChange } from '../services/sync';
import { APIClient } from '../services/api';

export function useSync(apiBase, getAuth, state, setState) {
  const syncClientRef = useRef(null);
  const apiClientRef = useRef(null);
  const syncInProgressRef = useRef(false);

  // Initialize clients
  useEffect(() => {
    syncClientRef.current = new SyncClient(apiBase, getAuth);
    apiClientRef.current = new APIClient(apiBase, getAuth);
  }, [apiBase, getAuth]);

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
          title: item.title,
          done: item.done,
          position: item.position,
          updatedAt: item.updated_at,
          deletedAt: item.deleted_at
        });
      });

      localState.lists = Object.entries(itemsByList).map(([listId, items]) => ({
        id: listId,
        name: listId === 'shopping' ? 'Inköp' : listId,
        items
      }));
    }

    return localState;
  }, []);

  // Merge server data into local state
  const mergeServerData = useCallback((serverChanges) => {
    if (!serverChanges) return;

    const serverLocal = serverToLocal(serverChanges);

    setState(prevState => {
      const merged = { ...prevState };

      // Merge tasks (server wins on conflicts)
      if (serverLocal.tasks.length > 0) {
        const taskMap = new Map([...prevState.tasks, ...serverLocal.tasks].map(t => [t.id, t]));
        merged.tasks = Array.from(taskMap.values())
          .filter(t => !t.deletedAt)
          .sort((a, b) => {
            // Sort by priority first, then time
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

      // Merge lists
      if (serverLocal.lists.length > 0) {
        merged.lists = serverLocal.lists;
      }

      return merged;
    });
  }, [serverToLocal, setState]);

  // Perform sync
  const performSync = useCallback(async () => {
    if (syncInProgressRef.current || !syncClientRef.current) {
      return { success: false, reason: 'sync_in_progress' };
    }

    syncInProgressRef.current = true;

    try {
      // Pull first to get latest server state
      const pullResult = await syncClientRef.current.pull();
      mergeServerData(pullResult);

      // Then push local changes
      const pushResult = await syncClientRef.current.push();

      // Pull again to get any changes that happened during our push
      const finalPull = await syncClientRef.current.pull();
      mergeServerData(finalPull);

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