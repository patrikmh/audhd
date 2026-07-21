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
