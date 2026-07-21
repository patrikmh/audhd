import assert from "node:assert/strict";
import { test } from "node:test";

import { todayKey, todayWeekday, nowHM } from "../src/utils/helpers.js";

test("todayKey uses Stockholm local date, not UTC, near midnight", () => {
  // 2026-03-04 23:30 UTC is already 2026-03-05 00:30 in Stockholm (CET, UTC+1) —
  // a UTC-based todayKey would report the wrong day for a user opening the app then.
  const lateUtc = new Date("2026-03-04T23:30:00Z");
  assert.equal(todayKey(lateUtc), "2026-03-05");
});

test("todayKey and todayWeekday agree on the same Stockholm day", () => {
  const d = new Date("2026-03-04T23:30:00Z"); // Stockholm: Thursday 2026-03-05
  assert.equal(todayKey(d), "2026-03-05");
  assert.equal(todayWeekday(d), "thu");
});

test("nowHM reports Stockholm wall-clock time, not the instant's UTC hour", () => {
  const d = new Date("2026-03-04T23:30:00Z"); // Stockholm (CET, UTC+1): 00:30
  assert.equal(nowHM(d), "00:30");
});

test("todayKey handles the summer DST offset (CEST, UTC+2) too", () => {
  const d = new Date("2026-07-20T22:15:00Z"); // Stockholm (CEST): 2026-07-21 00:15
  assert.equal(todayKey(d), "2026-07-21");
  assert.equal(nowHM(d), "00:15");
});
