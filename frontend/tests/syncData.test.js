import assert from "node:assert/strict";
import { test } from "node:test";

import { mergeServerChanges, toWireChanges } from "../src/services/syncData.js";


test("a rich recurring task and its steps use a lossless wire contract", () => {
  const localTask = {
    id: "task-1",
    title: "Ge Bubba medicin",
    icon: "💊",
    trigger: "När jag ska lägga mig",
    energy: 1,
    time: "22:00",
    minutes: 10,
    essential: true,
    priority: "A",
    inbox: false,
    done: false,
    doneAt: null,
    day: "2026-07-21",
    scheduled_date: "2026-07-24",
    note: "Med mat",
    image: "data:image/png;base64,abc",
    tags: ["bubba", "medicin"],
    repeatDays: ["mon", "fri"],
    steps: [{ id: "step-1", title: "Hämta medicinen", minutes: 2, done: false }],
  };

  const changes = toWireChanges("task", localTask.id, "upsert", localTask);

  assert.equal(changes.length, 2);
  assert.deepEqual(changes[0].data.repeat_days, ["mon", "fri"]);
  assert.equal(changes[0].data.scheduled_date, "2026-07-24");
  assert.equal(changes[0].data.note, "Med mat");
  assert.equal(changes[0].data.steps, undefined);
  assert.equal(changes[1].data.task_id, "task-1");
  assert.equal(changes[1].data.position, 0);
});


test("incremental step pulls preserve all existing task fields", () => {
  const previous = {
    tasks: [{
      id: "task-1",
      title: "Ge Bubba medicin",
      note: "Med mat",
      scheduled_date: "2026-07-24",
      repeatDays: ["fri"],
      steps: [],
    }],
    ideas: [],
    lists: [],
    wins: [],
    energyLog: [],
  };

  const merged = mergeServerChanges(previous, {
    task_step: [{
      id: "step-1",
      task_id: "task-1",
      title: "Hämta medicinen",
      minutes: 2,
      position: 0,
      done: false,
      updated_at: "2026-07-21T20:00:00Z",
    }],
  });

  assert.equal(merged.tasks[0].note, "Med mat");
  assert.equal(merged.tasks[0].scheduled_date, "2026-07-24");
  assert.deepEqual(merged.tasks[0].repeatDays, ["fri"]);
  assert.equal(merged.tasks[0].steps[0].title, "Hämta medicinen");
});


test("a floater task's dueBy round-trips through the wire contract", () => {
  const localTask = { id: "task-1", title: "Boka tandläkare", dueBy: "2026-08-01", scheduled_date: null };
  const changes = toWireChanges("task", localTask.id, "upsert", localTask);
  const taskChange = changes.find((c) => c.kind === "task");
  assert.equal(taskChange.data.due_by, "2026-08-01");
  assert.equal(taskChange.data.scheduled_date, null);

  const merged = mergeServerChanges({ tasks: [], ideas: [], lists: [], wins: [], energyLog: [] }, {
    task: [{ id: "task-1", title: "Boka tandläkare", due_by: "2026-08-01", updated_at: "2026-07-21T00:00:00Z" }],
  });
  assert.equal(merged.tasks[0].dueBy, "2026-08-01");
});


test("completing a recurring task's occurrence sends a task_occurrence change, not a task update", () => {
  const localTask = {
    id: "task-1",
    title: "Vattna blommorna",
    repeatDays: ["mon", "wed", "fri"],
    done: false,
    occurrences: {
      "2026-07-20": { id: "occ-1", done: true, doneAt: 1753000000000, stepsSnapshot: [{ title: "Häll vatten", done: true }] },
    },
  };

  const changes = toWireChanges("task", localTask.id, "upsert", localTask);

  assert.equal(changes.length, 2); // task + one occurrence, no steps this time
  const occChange = changes.find((c) => c.kind === "task_occurrence");
  assert.equal(occChange.id, "occ-1");
  assert.equal(occChange.data.task_id, "task-1");
  assert.equal(occChange.data.date, "2026-07-20");
  assert.equal(occChange.data.done, true);
  assert.deepEqual(occChange.data.steps_snapshot, [{ title: "Häll vatten", done: true }]);
  // The task change itself must not carry done:true — the template never completes.
  const taskChange = changes.find((c) => c.kind === "task");
  assert.equal(taskChange.data.done, false);
});


test("pulled task_occurrence rows nest under the owning task, keyed by date", () => {
  const previous = {
    tasks: [{ id: "task-1", title: "Vattna blommorna", repeatDays: ["mon"], occurrences: {} }],
    ideas: [], lists: [], wins: [], energyLog: [],
  };

  const merged = mergeServerChanges(previous, {
    task_occurrence: [{
      id: "occ-1", task_id: "task-1", date: "2026-07-20", done: true,
      done_at: "2026-07-20T08:00:00Z", steps_snapshot: [{ title: "Häll vatten", done: true }],
      updated_at: "2026-07-20T08:00:00Z",
    }],
  });

  assert.equal(merged.tasks[0].occurrences["2026-07-20"].done, true);
  assert.deepEqual(merged.tasks[0].occurrences["2026-07-20"].stepsSnapshot, [{ title: "Häll vatten", done: true }]);

  // A tombstoned occurrence (reopened from another device) is removed from the map, not left dangling.
  const reopened = mergeServerChanges(merged, {
    task_occurrence: [{ id: "occ-1", task_id: "task-1", date: "2026-07-20", deleted_at: "2026-07-20T09:00:00Z", updated_at: "2026-07-20T09:00:00Z" }],
  });
  assert.equal(reopened.tasks[0].occurrences["2026-07-20"], undefined);
});


test("idea tags and shopping list identity survive server merges", () => {
  const previous = {
    tasks: [],
    ideas: [],
    lists: [{ id: "shopping", name: "Inköp", slug: "shopping", items: [] }],
    wins: [],
    energyLog: [],
  };
  const merged = mergeServerChanges(previous, {
    idea: [{
      id: "idea-1",
      raw: "Odla tomater",
      title: "Tomatidé",
      tags: ["odling"],
      status: "klar",
      attempts: 1,
      created_at: "2026-07-21T20:00:00Z",
      updated_at: "2026-07-21T20:00:00Z",
    }],
    shopping_list: [{ id: "list-1", name: "Inköp", slug: "shopping" }],
    list_item: [{ id: "item-1", list_id: "list-1", text: "Mjölk", done: false }],
  });

  assert.deepEqual(merged.ideas[0].tags, ["odling"]);
  assert.equal(merged.lists.length, 1);
  assert.equal(merged.lists[0].id, "list-1");
  assert.equal(merged.lists[0].items[0].text, "Mjölk");
});
