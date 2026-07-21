const compact = (value) => Object.fromEntries(
  Object.entries(value).filter(([, field]) => field !== undefined),
);

const isoOrNull = (value) => {
  if (value == null || value === '') return null;
  return typeof value === 'number' ? new Date(value).toISOString() : value;
};

export function toWireTask(task) {
  return compact({
    title: task.title,
    icon: task.icon,
    trigger: task.trigger,
    energy: task.energy,
    time: task.time || null,
    minutes: task.minutes,
    essential: task.essential,
    priority: task.priority,
    inbox: task.inbox,
    synced_to_calendar: task.syncedToCalendar ?? task.synced_to_calendar,
    done: task.done,
    done_at: isoOrNull(task.doneAt),
    day: task.day,
    scheduled_date: task.scheduled_date || null,
    note: task.note ?? null,
    image: task.image ?? null,
    tags: task.tags || [],
    repeat_days: task.repeatDays || [],
  });
}

export function toWireStep(step, taskId, position) {
  return compact({
    task_id: taskId,
    title: step.title,
    minutes: step.minutes,
    position: step.position ?? position,
    done: step.done,
  });
}

export function toWireOccurrence(occurrence, taskId, date) {
  return compact({
    task_id: taskId,
    date,
    done: occurrence.done,
    done_at: isoOrNull(occurrence.doneAt),
    steps_snapshot: occurrence.stepsSnapshot || [],
  });
}

export function toWireChanges(kind, id, op, data = {}) {
  if (op === 'delete') return [{ kind, id, op, data: {} }];
  if (kind === 'task') {
    return [
      { kind, id, op, data: toWireTask(data) },
      ...(data.steps || []).map((step, position) => ({
        kind: 'task_step',
        id: step.id,
        op: 'upsert',
        data: toWireStep(step, id, position),
      })),
      ...Object.entries(data.occurrences || {}).map(([date, occurrence]) => ({
        kind: 'task_occurrence',
        id: occurrence.id,
        op: 'upsert',
        data: toWireOccurrence(occurrence, id, date),
      })),
    ];
  }
  const adapters = {
    task_step: (step) => toWireStep(step, step.taskId || step.task_id, step.position || 0),
    task_occurrence: (occurrence) => toWireOccurrence(occurrence, occurrence.taskId || occurrence.task_id, occurrence.date),
    idea: (idea) => compact({
      raw: idea.raw,
      title: idea.title ?? null,
      note: idea.note ?? null,
      status: idea.status,
      attempts: idea.attempts,
      day: idea.day,
      image: idea.image ?? null,
      tags: idea.tags || [],
    }),
    shopping_list: (list) => compact({ name: list.name, slug: list.slug }),
    list_item: (item) => compact({
      list_id: item.listId || item.list_id,
      text: item.text,
      done: item.done,
    }),
    win: (win) => compact({ text: win.text, day: win.day }),
    energy_event: (event) => compact({ delta: event.delta, label: event.label, day: event.day }),
  };
  return [{ kind, id, op, data: adapters[kind](data) }];
}

const tombstone = (row) => ({ id: row.id, deletedAt: row.deleted_at, updatedAt: row.updated_at });

function fromWireTask(row) {
  if (row.deleted_at) return tombstone(row);
  return {
    id: row.id,
    title: row.title,
    icon: row.icon,
    trigger: row.trigger,
    energy: row.energy,
    time: row.time || '',
    minutes: row.minutes,
    essential: row.essential,
    priority: row.priority,
    inbox: row.inbox,
    syncedToCalendar: row.synced_to_calendar,
    done: row.done,
    doneAt: row.done_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    day: row.day,
    scheduled_date: row.scheduled_date,
    note: row.note,
    image: row.image,
    tags: row.tags || [],
    repeatDays: row.repeat_days || [],
  };
}

function upsertById(items, incoming) {
  const index = items.findIndex(item => item.id === incoming.id);
  if (incoming.deletedAt) return index < 0 ? items : items.filter(item => item.id !== incoming.id);
  if (index < 0) return [...items, incoming];
  return items.map((item, itemIndex) => itemIndex === index ? { ...item, ...incoming } : item);
}

export function mergeServerChanges(previous, changes) {
  const next = { ...previous };
  let tasks = [...(previous.tasks || [])];
  for (const row of changes.task || []) tasks = upsertById(tasks, fromWireTask(row));
  for (const row of changes.task_step || []) {
    const taskIndex = tasks.findIndex(task => task.id === row.task_id);
    if (taskIndex < 0) continue;
    const incoming = row.deleted_at ? tombstone(row) : {
      id: row.id,
      title: row.title,
      minutes: row.minutes,
      position: row.position,
      done: row.done,
      updatedAt: row.updated_at,
    };
    const steps = upsertById(tasks[taskIndex].steps || [], incoming)
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    tasks[taskIndex] = { ...tasks[taskIndex], steps };
  }
  for (const row of changes.task_occurrence || []) {
    const taskIndex = tasks.findIndex(task => task.id === row.task_id);
    if (taskIndex < 0) continue;
    const occurrences = { ...(tasks[taskIndex].occurrences || {}) };
    if (row.deleted_at) {
      delete occurrences[row.date];
    } else {
      occurrences[row.date] = {
        id: row.id,
        done: row.done,
        doneAt: row.done_at,
        stepsSnapshot: row.steps_snapshot || [],
        updatedAt: row.updated_at,
      };
    }
    tasks[taskIndex] = { ...tasks[taskIndex], occurrences };
  }
  next.tasks = tasks.sort((a, b) => {
    const priority = { A: 0, B: 1, C: 2 };
    return (priority[a.priority] ?? 3) - (priority[b.priority] ?? 3)
      || (a.time || '23:59').localeCompare(b.time || '23:59');
  });

  let ideas = [...(previous.ideas || [])];
  for (const row of changes.idea || []) {
    const incoming = row.deleted_at ? tombstone(row) : {
      id: row.id,
      raw: row.raw,
      title: row.title,
      note: row.note,
      tags: row.tags || [],
      status: row.status,
      attempts: row.attempts || 0,
      ts: row.created_at,
      day: row.day,
      image: row.image,
      updatedAt: row.updated_at,
    };
    ideas = upsertById(ideas, incoming);
  }
  next.ideas = ideas.sort((a, b) => String(b.ts || '').localeCompare(String(a.ts || '')));

  let lists = [...(previous.lists || [])];
  for (const row of changes.shopping_list || []) {
    if (row.deleted_at) {
      lists = lists.filter(list => list.id !== row.id);
      continue;
    }
    const index = lists.findIndex(list => list.id === row.id || (row.slug && list.slug === row.slug));
    const incoming = {
      id: row.id,
      name: row.name,
      slug: row.slug,
      updatedAt: row.updated_at,
      items: index >= 0 ? lists[index].items || [] : [],
    };
    lists = index < 0
      ? [...lists, incoming]
      : lists.map((list, listIndex) => listIndex === index ? { ...list, ...incoming } : list);
  }
  for (const row of changes.list_item || []) {
    let listIndex = lists.findIndex(list => list.id === row.list_id);
    if (listIndex < 0 && !row.deleted_at) {
      lists.push({ id: row.list_id, name: 'Lista', slug: null, items: [] });
      listIndex = lists.length - 1;
    }
    if (listIndex < 0) continue;
    const incoming = row.deleted_at ? tombstone(row) : {
      id: row.id,
      listId: row.list_id,
      text: row.text,
      done: row.done,
      updatedAt: row.updated_at,
    };
    lists[listIndex] = {
      ...lists[listIndex],
      items: upsertById(lists[listIndex].items || [], incoming),
    };
  }
  next.lists = lists;

  let wins = [...(previous.wins || [])];
  for (const row of changes.win || []) {
    wins = upsertById(wins, { id: row.id, text: row.text, day: row.day, ts: row.created_at });
  }
  next.wins = wins.sort((a, b) => String(b.ts || '').localeCompare(String(a.ts || '')));

  let energyLog = [...(previous.energyLog || [])];
  for (const row of changes.energy_event || []) {
    energyLog = upsertById(energyLog, {
      id: row.id,
      delta: row.delta,
      label: row.label,
      day: row.day,
      ts: row.created_at,
    });
  }
  next.energyLog = energyLog.sort((a, b) => String(b.ts || '').localeCompare(String(a.ts || '')));
  return next;
}
