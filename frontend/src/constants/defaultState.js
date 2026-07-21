/**
 * Default application state
 */

import { todayKey } from "../utils/helpers";

export const DEFAULT_STATE = {
  capacity: "steady",
  tasks: [],
  wins: [],
  checkins: [],
  energyLog: [], // {delta, label, day}
  meds: [], // {day, status: 'taken'|'skipped'|'off'}
  morningLapDay: null,
  calibration: [], // {est, actual, ts} minutes
  settings: {
    wake: "07:00",
    winddown: "22:00",
    ouraToken: "",
    autoSync: true,
    voiceLang: "sv-SE",
    defaultCapacity: "steady",
    visibleTools: {
      focus: true,
      movement: true,
      checkin: true,
      wins: true,
      sleep: true,
      breathing: true,
      week: true,
      why: false,
      agents: true,
      connections: true
    }
  },
  lists: [{ id: "shopping", name: "Inköp", slug: "shopping", items: [] }],
  ideas: [], // {id, raw, title, note, tags, ts, status: 'refining'|'klar'|'fail'}
  tagLog: [], // {day, tag} — för statistik och organisering
  agents: {
    classify: true,
    refine: true,
    sync: true,
    breakdown: true,
    observer: true
  },
  observerDismissed: { day: null, keys: [] }, // vilka förslag som avfärdats idag
  agentLog: [], // {ts, agent, text} — senaste agentaktivitet
  breakdownBudget: { day: null, n: 0 }, // max 3 auto-nedbrytningar per dag
  gcal: { day: null, events: [] }, // {title, start "HH:MM", end "HH:MM"}
  mailSug: { day: null, items: [], dismissed: [] }, // dismissed: "from|subject"-nycklar för dagen
  oura: { day: null, sleepScore: null, readiness: null, manual: null },
  sync: { day: null, last: null, cal: null, mail: null, oura: null, notion: null }, // last = epoch ms
  capacityBy: { day: null, by: null }, // 'auto' | 'user'
  notionArchivedDay: null,
  day: todayKey(),
  setupDone: false,
  lastCheckinDate: null,
  externalAiEnabled: false,
  activeFocus: null, // { goal, mins, startedAt } — survives reload so a running lap can resume
};

export const DEFAULT_TASK = {
  title: "",
  icon: "📌",
  trigger: "",
  energy: 2,
  time: null,
  minutes: 30,
  essential: false,
  priority: null,
  inbox: true,
  done: false,
  note: null,
  image: null,
  steps: [],
};
