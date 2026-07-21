import { useState, useEffect, useRef, useMemo } from "react";
import { useSync } from "./hooks/useSync";
import { WorkingMemoryDisplay } from "./components/WorkingMemoryDisplay";
import { SystemStatus } from "./components/SystemStatus";
import SetupWizard from "./components/SetupWizard";
import DailyCheckin from "./components/DailyCheckin";
import { TaskInitiationSupport } from "./components/TaskInitiationSupport";
import { TimeAnchor } from "./components/TimeBlindnessSupport";
import A2UIRenderer from "./components/A2UIRenderer";
import { useAgentStream } from "./hooks/useAgentStream";
import { AgentProgress } from "./components/AgentProgress";
import { useAgUI } from "./hooks/useAgUI";
import { T, MODES, ENERGY_LABELS, MOVEMENT_IDEAS, REST_MENU, EDU_CARDS, ICON_CHOICES, WEEKDAYS, ICON_KEYWORDS, PRIORITY_ORDER, API_BASE, AUTH_KEY } from "./constants/tokens";
import { uid, todayKey, todayWeekday, guessIcon, energyColor, nowHM, hmToMin } from "./utils/helpers";
import { getAuth, setAuth, clearAuth, login } from "./utils/auth";

/* ============================================================
   VARV — an AuDHD day companion
   Design tokens:
   paper #F2F1EC · ink #33393B · spruce #46564F · petrol #4C6E75
   moss #8A977F · track #DFDED6 · card #FAF9F5 · warn #A66A4F
   Type: Fraunces (display) · Atkinson Hyperlegible (body) · IBM Plex Mono (data)
   Signature: the energy dial — a chronograph-style subdial that
   shows today's remaining capacity as an arc with tick marks.
   ============================================================ */

// triggerSuggestion is used by TaskInitiationSupport component
const triggerSuggestion = (taskTitle) => {
  const lowerTitle = taskTitle.toLowerCase();
  if (lowerTitle.includes('kaffe') || lowerTitle.includes('frukost')) return 'jag har ätit';
  if (lowerTitle.includes('jobb') || lowerTitle.includes('arbet')) return 'jag sitter vid skrivbordet';
  if (lowerTitle.includes('motion') || lowerTitle.includes('träning')) return 'jag har träningskläder på mig';
  if (lowerTitle.includes('läsa') || lowerTitle.includes('bok')) return 'jag har boken framför mig';
  return 'jag är redo att börja';
};

async function apiPost(path, body) {
  const auth = getAuth();
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(auth?.token ? { Authorization: `Bearer ${auth.token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`varv-server ${path} → ${response.status}`);
  return response.json();
}

async function apiPatch(path, body) {
  const auth = getAuth();
  const response = await fetch(`${API_BASE}${path}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...(auth?.token ? { Authorization: `Bearer ${auth.token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`varv-server ${path} error ${response.status}`);
  return response.json();
}

async function apiGet(path) {
  const auth = getAuth();
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { ...(auth?.token ? { Authorization: `Bearer ${auth.token}` } : {}) },
  });
  if (!response.ok) throw new Error(`varv-server ${path} error ${response.status}`);
  return response.json();
}

// Agenterna (Nedbrytaren/Förfinaren/Sorteraren) körs server-side mot
// OpenRouter — frontend anropar bara varv-server, aldrig LLM-API:et direkt.
// Legacy non-streaming fallbacks (kept for sync/sweep flows):
async function aiBreakdown(title) {
  const data = await apiPost("/api/agents/breakdown", { title });
  return data.steps.map((st) => ({ id: uid(), title: st.title, minutes: st.minutes, done: false }));
}

async function aiRefineIdea(raw) {
  return apiPost("/api/agents/refine", { raw });
}

async function aiClassify(raw) {
  return apiPost("/api/agents/classify", { raw });
}

async function fetchOura(token) {
  const today = todayKey();
  const opts = { headers: { Authorization: `Bearer ${token}` } };
  const [sleepRes, readyRes] = await Promise.all([
    fetch(`https://api.ouraring.com/v2/usercollection/daily_sleep?start_date=${today}&end_date=${today}`, opts),
    fetch(`https://api.ouraring.com/v2/usercollection/daily_readiness?start_date=${today}&end_date=${today}`, opts),
  ]);
  if (!sleepRes.ok || !readyRes.ok) throw new Error("oura http");
  const sleep = await sleepRes.json();
  const ready = await readyRes.json();
  return {
    sleepScore: sleep.data?.[0]?.score ?? null,
    readiness: ready.data?.[0]?.score ?? null,
  };
}



const DEFAULT_STATE = {
  capacity: "steady",
  tasks: [],
  wins: [],
  checkins: [],
  energyLog: [], // {delta, label, day}
  meds: [], // {day, status: 'taken'|'skipped'|'off'}
  morningLapDay: null,
  calibration: [], // {est, actual, ts} minutes
  settings: { wake: "07:00", winddown: "22:00", ouraToken: "", autoSync: true, voiceLang: "sv-SE" },
  lists: [{ id: "shopping", name: "Inköp", items: [] }],
  ideas: [], // {id, raw, title, note, tags, ts, status: 'refining'|'klar'|'fail'}
  tagLog: [], // {day, tag} — för statistik och organisering
  agents: { classify: true, refine: true, sync: true, breakdown: true, observer: true },
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
};

function VarvApp({ username, onLogout }) {
  const storageKey = `varv-state:${username}`;
  const [state, setState] = useState(DEFAULT_STATE);
  const [loaded, setLoaded] = useState(false);
  const [tool, setTool] = useState(null); // 'focus' | 'move' | 'checkin' | 'wins' | 'sleep'
  const [showAdd, setShowAdd] = useState(false);
  const [lapRunning, setLapRunning] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null); // For task initiation support
  const [view, setView] = useState("today"); // 'today' | 'lists' | 'tools'
  const [captureOpen, setCaptureOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const [unstick, setUnstick] = useState(false);
  const [ideaMode, setIdeaMode] = useState("list"); // 'list' | 'map'
  const [unstickBusy, setUnstickBusy] = useState(false);
  const [focusPrefill, setFocusPrefill] = useState(null);
  const [, setTick] = useState(0); // minute tick so time-based UI stays current
  const [calBusy, setCalBusy] = useState(false);
  const [mailBusy, setMailBusy] = useState(false);
  const [syncErr, setSyncErr] = useState("");
  const saveTimer = useRef(null);

  // Sync integration
  const sync = useSync(
    API_BASE,
    getAuth,
    state,
    setState
  );

  // AG-UI streaming agent panel
  const agui = useAgUI();
  const [aguiAgent, setAguiAgent] = useState("classify");
  const [aguiInput, setAguiInput] = useState("");

  // Streaming agent for main app flows (classify, refine, breakdown)
  const streamAgent = useAgentStream();

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30000);
    return () => clearInterval(t);
  }, []);

  /* ---------- fonts ---------- */
  useEffect(() => {
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href =
      "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300;9..144,500&family=Atkinson+Hyperlegible:wght@400;700&family=IBM+Plex+Mono:wght@400;500&display=swap";
    document.head.appendChild(l);
    return () => document.head.removeChild(l);
  }, []);

  /* ---------- load / save (localStorage — vanlig webbläsare, ingen sandlåda) ---------- */
  useEffect(() => {
    (async () => {
      try {
        const raw = localStorage.getItem(storageKey);
        if (raw) {
          const s = JSON.parse(raw);
          if (s.day !== todayKey()) {
            s.day = todayKey();
            const cutoff = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
            const medCutoff = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
            s.energyLog = (s.energyLog || []).filter((e) => e.day >= cutoff);
            s.meds = (s.meds || []).filter((m) => m.day >= medCutoff);
            s.tagLog = (s.tagLog || []).filter((t) => t.day >= medCutoff);
            // Återkommande uppgifter (repeatDays) tas aldrig bort — de återställs till
            // ogjorda när deras nästa schemalagda veckodag kommer, istället för att bara
            // rensas bort som en engångsuppgift.
            const today = todayWeekday();
            s.tasks = (s.tasks || [])
              .map((t) => ((t.repeatDays || []).includes(today) ? { ...t, done: false } : t))
              .filter((t) => (t.repeatDays || []).length > 0 || !t.done);
          }
          s.settings = { ...DEFAULT_STATE.settings, ...(s.settings || {}) };
          s.lists = s.lists || DEFAULT_STATE.lists;
          const oldIdeas = s.lists.find((l) => l.id === "ideas");
          if (oldIdeas) {
            s.ideas = [
              ...(oldIdeas.items || []).map((it) => ({ id: it.id, raw: it.text, title: null, note: null, tags: [], ts: Date.now(), status: "raw" })),
              ...(s.ideas || []),
            ];
            s.lists = s.lists.filter((l) => l.id !== "ideas");
          }
          setState({ ...DEFAULT_STATE, ...s });
        }
      } catch (e) {
        /* first run — nothing stored yet */
      }
      setLoaded(true);
      // Sync setupDone / lastCheckinDate from server (survives device switch)
      try {
        const me = await apiGet("/api/me");
        setState((s) => ({
          ...s,
          setupDone: me.setup_done || s.setupDone,
          lastCheckinDate: me.last_checkin_date || s.lastCheckinDate,
        }));
      } catch (_) { /* offline or first run */ }
    })();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      try {
        const { _selIdea, ...persist } = state; // transienta UI-nycklar sparas inte
        localStorage.setItem(storageKey, JSON.stringify(persist));
      } catch (e) {
        console.error("Could not save", e);
      }
    }, 400);
  }, [state, loaded]);

  /* ---------- derived ---------- */
  const mode = MODES[state.capacity];
  const todayLog = state.energyLog.filter((e) => e.day === todayKey());
  const spent = todayLog.filter((e) => e.delta > 0).reduce((a, e) => a + e.delta, 0);
  const recharged = todayLog.filter((e) => e.delta < 0).reduce((a, e) => a - e.delta, 0);
  const remaining = Math.max(0, Math.min(mode.budget, mode.budget - spent + recharged));
  const overBudget = spent - recharged > mode.budget;
  const winsToday = state.wins.filter((w) => new Date(w.ts).toDateString() === new Date().toDateString());

  // Selected date for viewing tasks (default: today)
  const [selectedDate, setSelectedDate] = useState(todayKey());
  const isToday = selectedDate === todayKey();

  const visibleTasks = useMemo(() => {
    const today = todayWeekday();
    let open = state.tasks.filter((t) => {
      if (t.done) return false;
      // Filter by scheduled_date if set, otherwise show on creation day
      // Recurring tasks (repeatDays) with no day/scheduled_date show on matching weekdays
      const hasRepeat = (t.repeatDays || []).length > 0;
      if (hasRepeat) {
        // Recurring task: show if today matches repeatDays
        if (!t.repeatDays.includes(today)) return false;
      } else {
        const taskDay = t.scheduled_date || t.day;
        if (taskDay !== selectedDate) return false;
      }
      return true;
    });
    if (state.capacity === "recovery" && isToday) open = open.filter((t) => t.essential);
    return [...open].sort((a, b) => {
      const pa = a.priority ? PRIORITY_ORDER[a.priority] : 3;
      const pb = b.priority ? PRIORITY_ORDER[b.priority] : 3;
      return pa - pb;
    });
  }, [state.tasks, state.capacity, selectedDate, isToday]);

  const doneToday = useMemo(
    () => state.tasks.filter((t) => t.done && t.doneAt && new Date(t.doneAt).toDateString() === new Date().toDateString()),
    [state.tasks]
  );

  const medToday = state.meds.find((m) => m.day === todayKey());
  const lapDoneToday = state.morningLapDay === todayKey();
  const pastWinddown = hmToMin(nowHM()) >= hmToMin(state.settings?.winddown || "22:00");

  // Observatören: föreslår ett verktyg utifrån läge/tid, aldrig påtvingat — bara en
  // avfärdbar banner i huvudvyn. Prioritetsordning, första träff vinner. Avfärdat
  // förslag döljs resten av dagen (observerDismissed), inte permanent.
  const dismissedToday = (key) =>
    state.observerDismissed.day === todayKey() && (state.observerDismissed.keys || []).includes(key);

  const checkedInToday = state.checkins.some((c) => new Date(c.ts).toDateString() === new Date().toDateString());

  const observerSuggestion = useMemo(() => {
    if (!state.agents.observer) return null;
    const candidates = [
      pastWinddown && { key: "winddown", tool: "sleep", text: "Nedvarvningstid — dags att förbereda sömnen?", cta: "Öppna sömnankaret" },
      state.capacity === "recovery" && { key: "recovery-ground", tool: "ground", text: "Återhämtningsläge — en kort andningspaus?", cta: "Öppna andningsankaret" },
      overBudget && { key: "overbudget-move", tool: "move", text: "Energin är över budget — en rörelsepaus kan hjälpa.", cta: "Öppna rörelsepausen" },
      (!checkedInToday && hmToMin(nowHM()) >= hmToMin("14:00")) && { key: "checkin-1400", tool: "checkin", text: "Ingen tankekoll idag än — hur går dagen?", cta: "Öppna tankekoll" },
    ].filter(Boolean);
    return candidates.find((c) => !dismissedToday(c.key)) || null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.agents.observer, pastWinddown, state.capacity, overBudget, checkedInToday, state.observerDismissed]);

  const dismissObserverSuggestion = (key) =>
    setState((st) => ({
      ...st,
      observerDismissed: {
        day: todayKey(),
        keys: [...(st.observerDismissed.day === todayKey() ? st.observerDismissed.keys : []), key],
      },
    }));

  const scheduled = useMemo(() => {
    const nowM = hmToMin(nowHM());
    const taskItems = visibleTasks
      .filter((t) => t.time)
      .map((t) => ({ ...t, m: hmToMin(t.time) }));
    const eventItems =
      state.gcal.day === todayKey()
        ? state.gcal.events.map((ev, i) => ({
            id: `ev-${i}`,
            title: ev.title,
            time: ev.start,
            m: hmToMin(ev.start),
            minutes: Math.max(15, (hmToMin(ev.end) || hmToMin(ev.start) + 30) - hmToMin(ev.start)),
            icon: "🗓️",
            isEvent: true,
          }))
        : [];
    return [...taskItems, ...eventItems]
      .filter((t) => t.m != null && t.m >= nowM - 30 && t.m <= nowM + 8 * 60)
      .sort((a, b) => a.m - b.m);
  }, [visibleTasks, state.gcal]);

  const unscheduled = visibleTasks.filter((t) => !t.time);
  const nextTask = scheduled.find((t) => !t.isEvent) || unscheduled[0] || null;
  const upcoming = useMemo(() => {
    const nowM = hmToMin(nowHM());
    const u = scheduled.find((t) => t.m > nowM && t.m - nowM <= 20);
    return u ? { ...u, inMin: u.m - nowM } : null;
  }, [scheduled]);

  /* ---------- actions ---------- */
  const patch = (p) => setState((s) => ({ ...s, ...p }));

  const addWin = (text) => {
    const id = uid();
    const win = { id, text, ts: Date.now(), day: todayKey() };
    setState((s) => ({ ...s, wins: [win, ...s.wins].slice(0, 200) }));
    sync.trackChange('win', id, 'upsert', win);
    setToast(text);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  };

  const logEnergy = (delta, label) => {
    const id = uid();
    const energyEvent = { id, delta, label, day: todayKey(), ts: Date.now() };
    setState((s) => ({ ...s, energyLog: [...s.energyLog, energyEvent] }));
    sync.trackChange('energy_event', id, 'upsert', energyEvent);
  };

  const [undoTask, setUndoTask] = useState(null);
  const undoTimer = useRef(null);
  const [contextMenu, setContextMenu] = useState(null); // { x, y, items }
  const [showSetup, setShowSetup] = useState(() => !state.setupDone);
  const [showCheckin, setShowCheckin] = useState(() => {
    if (!state.setupDone) return false;
    return state.lastCheckinDate !== todayKey();
  });

  // Update overlay flags when server data arrives (async load)
  useEffect(() => {
    if (!loaded) return;
    if (state.setupDone) setShowSetup(false);
    if (state.setupDone && state.lastCheckinDate !== todayKey()) setShowCheckin(true);
  }, [state.setupDone, state.lastCheckinDate, loaded]);

  const completeTask = (task) => {
    if (task.done) return;
    setState((s) => ({
      ...s,
      tasks: s.tasks.map((t) => (t.id === task.id ? { ...t, done: true, doneAt: Date.now() } : t)),
    }));
    logEnergy(task.energy, task.title);
    addWin(`Klart: ${task.title}`);
    // Show undo option for 8 seconds
    setUndoTask(task);
    clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => setUndoTask(null), 8000);
  };

  const undoCompleteTask = (task) => {
    setState((s) => ({
      ...s,
      tasks: s.tasks.map((t) => (t.id === task.id ? { ...t, done: false, doneAt: null } : t)),
    }));
    setUndoTask(null);
    clearTimeout(undoTimer.current);
  };

  /* --- Setup wizard completion --- */
  const handleSetupComplete = ({ settings, capacity, tasks: newTasks }) => {
    setState((s) => ({
      ...s,
      setupDone: true,
      settings: { ...s.settings, ...settings },
      capacity,
      tasks: [...s.tasks, ...newTasks],
    }));
    setShowSetup(false);
    setShowCheckin(true);
    // Persist to server
    apiPatch("/api/me", { setup_done: true, capacity }).catch(() => {});
  };

  /* --- Daily check-in --- */
  const handleCheckinEnergy = (cap) => {
    setState((s) => ({ ...s, capacity: cap, capacityBy: { day: todayKey(), by: "user" } }));
  };
  const handleCheckinDismiss = () => {
    setState((s) => ({ ...s, lastCheckinDate: todayKey() }));
    setShowCheckin(false);
    // Persist to server
    apiPatch("/api/me", { last_checkin_date: todayKey(), capacity: state.capacity }).catch(() => {});
  };

  const updateTask = (id, p) => {
    const task = state.tasks.find(t => t.id === id);
    const updatedTask = { ...task, ...p, updatedAt: new Date().toISOString() };
    setState((s) => ({ ...s, tasks: s.tasks.map((t) => (t.id === id ? updatedTask : t)) }));
    sync.trackChange('task', id, 'upsert', updatedTask);
  };

  const removeTask = (id) => {
    const task = state.tasks.find(t => t.id === id);
    if (!task) return;
    const deletedTask = { ...task, deletedAt: new Date().toISOString() };
    setState((s) => ({ ...s, tasks: s.tasks.filter((t) => t.id !== id) }));
    sync.trackChange('task', id, 'delete', deletedTask);
  };

  // Nedbrytaren körs direkt när en uppgift skapas — inte bara i bakgrundssvepet — så
  // det första steget redan finns när man möter uppgiften. Tyst vid fel: man kan
  // fortfarande be om det manuellt via "Jag kommer inte igång".
  const breakdownTask = async (taskId, title) => {
    try {
      // Check cache first for recurring tasks
      const cached = stateRef.current.stepCache?.[title];
      if (cached && cached.length > 0) {
        updateTask(taskId, { steps: cached });
        return;
      }
      const result = await streamAgent.run("breakdown", title);
      if (!result?.steps) throw new Error("Nedbrytning misslyckades");
      const steps = result.steps.map((st) => ({ id: uid(), title: st.title, minutes: st.minutes, done: false }));
      updateTask(taskId, { steps });
      // Cache for future recurring instances
      setState((st) => ({
        ...st,
        stepCache: { ...(st.stepCache || {}), [title]: steps },
      }));
    } catch (e) { /* tyst — nedbrytning kan alltid begäras manuellt senare */ }
  };

  const DEFAULT_TASK = {
    icon: "📌", trigger: "", energy: 2, time: "", essential: false, steps: [],
    done: false, doneAt: null, minutes: 30, priority: null, inbox: true, tags: [], repeatDays: [],
  };

  const addTask = (draft) => {
    const task = { ...DEFAULT_TASK, id: uid(), icon: guessIcon(draft.title), day: todayKey(), ...draft, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    setState((st) => ({ ...st, tasks: [...st.tasks, task] }));
    sync.trackChange('task', task.id, 'upsert', task);
    breakdownTask(task.id, task.title);
    return task;
  };

  // Task selection for initiation support
  const selectTask = (task) => {
    setSelectedTask(prev => prev?.id === task.id ? null : task);
  };

  const deselectTask = () => {
    setSelectedTask(null);
  };

  const startTaskStep = (task, step = null) => {
    if (step) {
      // Mark the specific step as done
      const updatedSteps = task.steps.map((s, i) =>
        (i === 0 ? { ...s, done: true } : s)
      );
      updateTask(task.id, { steps: updatedSteps });
    }
    // Could add timer start here
    setTool("focus");
    deselectTask();
  };

  const setTaskTrigger = (task) => {
    const trigger = prompt("När vill du göra detta?", `när ${triggerSuggestion(task.title)}`);
    if (trigger) {
      updateTask(task.id, { trigger });
    }
  };

  /* ---------- Google-synk ----------
     varv-server har (ännu) ingen Gmail/Calendar/Notion-integration — dessa
     körde tidigare direkt mot Anthropics mcp_servers utan nyckel, vilket
     aldrig fungerade utanför artifact-sandlådan. Stubbade tills servern
     har motsvarande endpoints. */
  const NOT_WIRED = "Den här integrationen är inte kopplad till servern än.";

  const syncCalendar = async () => {
    setSyncErr(NOT_WIRED);
    return "skip";
  };

  const checkGmail = async () => {
    setSyncErr(NOT_WIRED);
    return "skip";
  };

  const pushTaskToCalendar = async () => {
    throw new Error(NOT_WIRED);
  };

  /* ---------- Oura + kapacitetsautomatik ---------- */
  const applyCapacityFromScore = (score) => {
    setState((st) => {
      if (st.capacityBy.day === todayKey() && st.capacityBy.by === "user") return st; // användarens val vinner alltid
      if (score < 70 && st.capacity === "steady") {
        setToast(`Kort sömn inatt. Sänkte till Lågt batteri — tryck för att ändra.`);
        clearTimeout(toastTimer.current);
        toastTimer.current = setTimeout(() => setToast(null), 4000);
        return { ...st, capacity: "low", capacityBy: { day: todayKey(), by: "auto" } };
      }
      return st;
    });
  };

  const syncOura = async () => {
    const token = state.settings.ouraToken;
    if (!token) return "skip";
    try {
      const o = await fetchOura(token);
      setState((st) => ({ ...st, oura: { day: todayKey(), ...o, manual: null } }));
      const score = Math.min(o.sleepScore ?? 100, o.readiness ?? 100);
      if (o.sleepScore != null || o.readiness != null) applyCapacityFromScore(score);
      return "ok";
    } catch (e) {
      return "fail";
    }
  };

  const setManualSleep = (bucket) => {
    // fallback när Oura inte nås: '<6' | '6-7' | '>7'
    setState((st) => ({ ...st, oura: { day: todayKey(), sleepScore: null, readiness: null, manual: bucket } }));
    if (bucket === "<6") applyCapacityFromScore(60);
  };

  /* ---------- Notion-arkiv ---------- */
  const archiveToNotion = async () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const yWins = state.wins.filter((w) => new Date(w.ts).toISOString().slice(0, 10) === yesterday);
    const yLog = state.energyLog.filter((e) => e.day === yesterday);
    if (yWins.length === 0 && yLog.length === 0) return "skip";
    setSyncErr(NOT_WIRED);
    return "skip";
  };

  /* ---------- agentlogg ---------- */
  const logAgent = (agent, text) =>
    setState((st) => ({ ...st, agentLog: [{ ts: Date.now(), agent, text }, ...st.agentLog].slice(0, 30) }));

  /* ---------- idéer: spara direkt, förfina i bakgrunden ---------- */
  const refineIdea = async (id, raw) => {
    const updatingIdea = state.ideas.find(i => i.id === id);
    const refiningIdea = { ...updatingIdea, status: "refining", attempts: (updatingIdea.attempts || 0) + 1, updatedAt: new Date().toISOString() };

    setState((st) => ({ ...st, ideas: st.ideas.map((i) => (i.id === id ? refiningIdea : i)) }));
    sync.trackChange('idea', id, 'upsert', refiningIdea);

    try {
      const r = await streamAgent.run("refine", raw);
      if (!r) throw new Error("Förfining misslyckades");
      const refinedIdea = { ...updatingIdea, title: r.title, note: r.note, tags: (r.tags || []).slice(0, 3), status: "klar", updatedAt: new Date().toISOString() };
      setState((st) => ({
        ...st,
        ideas: st.ideas.map((i) => (i.id === id ? refinedIdea : i)),
      }));
      sync.trackChange('idea', id, 'upsert', refinedIdea);
      logAgent("Förfinaren", `städade "${(r.title || raw).slice(0, 40)}"`);
    } catch (e) {
      const failedIdea = { ...updatingIdea, status: "fail", updatedAt: new Date().toISOString() };
      setState((st) => ({ ...st, ideas: st.ideas.map((i) => (i.id === id ? failedIdea : i)) }));
      sync.trackChange('idea', id, 'upsert', failedIdea);
    }
  };

  const addIdea = (raw) => {
    const id = uid();
    const newIdea = { id, raw, title: null, note: null, tags: [], ts: Date.now(), status: "refining", updatedAt: new Date().toISOString() };
    setState((st) => ({
      ...st,
      ideas: [newIdea, ...st.ideas].slice(0, 100),
    }));
    sync.trackChange('idea', id, 'upsert', newIdea);
    setToast(`💡 Sparad — förfinas i bakgrunden`);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
    refineIdea(id, raw); // fire-and-forget: fångsten väntar aldrig på AI
  };

  const ideaToTask = (idea) => {
    const title = idea.title || idea.raw.slice(0, 60);
    addTask({ title, icon: "💡" });
    addWin(`Idé → uppgift: ${title}`);
  };

  const removeIdea = (id) => {
    const idea = state.ideas.find(i => i.id === id);
    if (!idea) return;
    const deletedIdea = { ...idea, deletedAt: new Date().toISOString() };
    setState((st) => ({ ...st, ideas: st.ideas.filter((i) => i.id !== id) }));
    sync.trackChange('idea', id, 'delete', deletedIdea);
  };

  const updateIdea = (id, updates) => {
    const idea = state.ideas.find(i => i.id === id);
    if (!idea) return;
    const updatedIdea = { ...idea, ...updates, updatedAt: new Date().toISOString() };
    setState((st) => ({ ...st, ideas: st.ideas.map((i) => (i.id === id ? updatedIdea : i)) }));
    sync.trackChange('idea', id, 'upsert', updatedIdea);
  };

  /* ---------- auto-klassificering: agenten sorterar när du inte väljer ---------- */
  const logTags = (tags) =>
    setState((st) => ({ ...st, tagLog: [...st.tagLog, ...(tags || []).map((tag) => ({ day: todayKey(), tag }))] }));

  // Delad placeringslogik: tar ett redan klassificerat resultat ({type,title,tags,energy,time,note})
  // och lägger det i rätt lokal hink. Används av både textfångst (klassificerar client-side via
  // aiClassify) och röstfångst (redan klassificerad server-side av /api/capture/voice).
  const placeClassified = (raw, c) => {
    const tags = (c.tags || []).slice(0, 3);
    logTags(tags);
    if (c.type === "shopping") {
      setState((st) => {
        const target = st.lists.find((l) => l.id === "shopping") || st.lists[0];
        return {
          ...st,
          lists: st.lists.map((l) => (l.id === target.id ? { ...l, items: [...l.items, { id: uid(), text: c.title || raw, done: false }] } : l)),
        };
      });
      setToast(`→ Inköp: ${c.title || raw}`);
      logAgent("Sorteraren", `→ Inköp: "${(c.title || raw).slice(0, 40)}"`);
    } else if (c.type === "task") {
      addTask({ title: c.title || raw, energy: c.energy || 2, time: c.time || "", tags });
      setToast(`→ Uppgift: ${c.title || raw}${tags[0] ? ` · #${tags[0]}` : ""}`);
      logAgent("Sorteraren", `→ Uppgift: "${(c.title || raw).slice(0, 40)}" [${tags.join(", ")}]`);
    } else {
      setState((st) => ({
        ...st,
        ideas: [{ id: uid(), raw, title: c.title || null, note: c.note || null, tags, ts: Date.now(), status: c.title ? "klar" : "raw" }, ...st.ideas].slice(0, 100),
      }));
      setToast(`→ Idé: ${c.title || raw.slice(0, 40)}`);
      logAgent("Sorteraren", `→ Idé: "${(c.title || raw).slice(0, 40)}"`);
    }
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  };

  const autoCapture = async (raw) => {
    if (!stateRef.current.agents.classify) { addIdea(raw); return; } // agent av → allt landar som idé
    try {
      const c = await streamAgent.run("classify", raw);
      if (!c) throw new Error("Klassificering misslyckades");
      placeClassified(raw, c);
    } catch (e) {
      // felsäkert: ingenting får försvinna — landa som rå idé
      setState((st) => ({
        ...st,
        ideas: [{ id: uid(), raw, title: null, note: null, tags: [], ts: Date.now(), status: "raw" }, ...st.ideas].slice(0, 100),
      }));
      setToast("Sorteringen misslyckades — sparad som rå idé");
      clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => setToast(null), 3000);
    }
  };

  const onVoiceCapture = async (blob, voiceLang) => {
    const form = new FormData();
    form.append("file", blob, "memo.webm");
    form.append("language", (voiceLang || "sv-SE").split("-")[0]);
    const auth = getAuth();
    const response = await fetch(`${API_BASE}/api/capture/voice`, {
      method: "POST",
      headers: auth?.token ? { Authorization: `Bearer ${auth.token}` } : {},
      body: form,
    });
    if (!response.ok) throw new Error(`capture/voice → ${response.status}`);
    const out = await response.json(); // CaptureOut: redan klassificerad av Sorteraren på servern
    placeClassified(out.title, { type: out.routed_type, title: out.title, tags: out.tags });
  };

  /* ---------- agent-tick: en gemensam bakgrundsloop ---------- */
  const SYNC_INTERVAL = 3 * 3600 * 1000;
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);
  const syncingRef = useRef(false);
  const sweepingRef = useRef(false);

  const runSync = async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    setState((st) => ({ ...st, sync: { ...st.sync, day: todayKey(), last: Date.now() } })); // lås direkt mot dubbelkörning

    try {
      // Main data sync
      const syncResult = await sync.performSync();
      if (!syncResult.success) {
        setSyncErr(syncResult.reason || "Sync failed");
      } else {
        setSyncErr("");
      }

      const ouraStatus = await syncOura();
      setState((st) => ({ ...st, sync: { ...st.sync, oura: ouraStatus } }));
      const calStatus = await syncCalendar();
      setState((st) => ({ ...st, sync: { ...st.sync, cal: calStatus } }));
      const mailStatus = await checkGmail();
      setState((st) => ({ ...st, sync: { ...st.sync, mail: mailStatus } }));
      const notionStatus = stateRef.current.notionArchivedDay === todayKey() ? "ok" : await archiveToNotion();
      setState((st) => ({ ...st, sync: { ...st.sync, notion: notionStatus } }));

      const syncStats = syncResult.success ?
        `data ${syncResult.push.created + syncResult.push.updated + syncResult.push.deleted} changes` :
        `data sync failed: ${syncResult.reason}`;

      logAgent("Synkaren", `körning klar: ${syncStats}, kalender ${calStatus}, mejl ${mailStatus}, oura ${ouraStatus}, notion ${notionStatus}`);
    } catch (error) {
      setSyncErr(error.message);
      logAgent("Synkaren", `körning misslyckades: ${error.message}`);
    } finally {
      syncingRef.current = false;
    }
  };

  // Förfinaren som svepare: plockar upp råa/misslyckade idéer, max 2 per tick, max 3 försök per idé
  const refineSweep = async () => {
    const s = stateRef.current;
    if (!s.agents.refine) return;
    const pending = s.ideas.filter((i) => (i.status === "raw" || i.status === "fail") && (i.attempts || 0) < 3).slice(0, 2);
    for (const i of pending) await refineIdea(i.id, i.raw);
  };

  // Nedbrytaren: förbereder första steg för A-prioriterade eller tunga uppgifter innan du ber om det
  const breakdownSweep = async () => {
    const s = stateRef.current;
    if (!s.agents.breakdown) return;
    const budget = s.breakdownBudget.day === todayKey() ? s.breakdownBudget.n : 0;
    if (budget >= 3) return;
    const candidate = s.tasks.find((t) => !t.done && (!t.steps || t.steps.length === 0) && (t.priority === "A" || t.energy >= 4));
    if (!candidate) return;
    try {
      const steps = await aiBreakdown(candidate.title);
      setState((st) => ({
        ...st,
        tasks: st.tasks.map((t) => (t.id === candidate.id ? { ...t, steps } : t)),
        breakdownBudget: { day: todayKey(), n: (st.breakdownBudget.day === todayKey() ? st.breakdownBudget.n : 0) + 1 },
      }));
      logAgent("Nedbrytaren", `förberedde ${steps.length} steg för "${candidate.title.slice(0, 40)}"`);
    } catch (e) { /* tyst — försöker nästa tick */ }
  };

  const agentTick = async () => {
    if (sweepingRef.current) return;
    sweepingRef.current = true;
    const s = stateRef.current;
    if (s.agents.sync && s.settings.autoSync && Date.now() - (s.sync.last || 0) > SYNC_INTERVAL) await runSync();
    await refineSweep();
    await breakdownSweep();
    sweepingRef.current = false;
  };

  useEffect(() => {
    if (!loaded) return;
    const startT = setTimeout(agentTick, 1500);
    const guard = setInterval(agentTick, 5 * 60 * 1000); // vakt: agenterna tittar var 5:e minut
    return () => { clearTimeout(startT); clearInterval(guard); };
  }, [loaded]);

  if (!loaded)
    return (
      <div style={{ minHeight: "100vh", background: T.paper, display: "grid", placeItems: "center", color: T.soft, fontFamily: "'Atkinson Hyperlegible', sans-serif" }}>
        Öppnar din dag…
      </div>
    );

  const s = styles;
  const recoveryTint = state.capacity === "recovery";

  return (
    <div style={{ ...s.page, background: recoveryTint ? "#EFEDE6" : T.paper }}>
      <style>{`
        *:focus-visible { outline: 2px solid ${T.petrol}; outline-offset: 2px; border-radius: 4px; }
        button { touch-action: manipulation; }
        input, button, select { -webkit-tap-highlight-color: transparent; }
        @media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }
        html { -webkit-font-smoothing: antialiased; }
      `}</style>
      <div style={s.shell}>
        {/* ============ header ============ */}
        <header style={s.header}>
          <div style={s.wordmark}>Varv</div>
          <div style={s.tagline}>{view === "today" ? "ett varv i taget" : view === "ideas" ? "tänk högt" : view === "lists" ? "ut ur huvudet" : "verktygslådan"}</div>
          <button style={{ ...s.linkBtn, marginLeft: "auto", fontSize: 12, color: T.soft }} onClick={onLogout}>
            {username} · logga ut
          </button>
        </header>

        {/* ============ wind-down banner ============ */}
        {pastWinddown && (
          <div style={s.winddownBanner}>
            Nedvarvning. Skärmarna dämpas, kraven sänks — imorgon börjar {state.settings.wake}.
          </div>
        )}

        {view === "today" && (
          <>
        {/* ============ observatören: kontextuellt verktygsförslag ============ */}
        {observerSuggestion && (
          <div style={s.nudge}>
            {observerSuggestion.text}
            <span style={{ display: "flex", gap: 10, marginTop: 6 }}>
              <button
                style={s.linkBtn}
                onClick={() => { setView("tools"); setTool(observerSuggestion.tool); }}
              >
                {observerSuggestion.cta}
              </button>
              <button
                style={{ ...s.linkBtn, color: T.soft }}
                onClick={() => dismissObserverSuggestion(observerSuggestion.key)}
              >
                ej nu
              </button>
            </span>
          </div>
        )}

        {/* ============ hero: working memory display (ADHD-optimized) ============ */}
        <section style={{ marginBottom: 20 }}>
          <WorkingMemoryDisplay
            state={state}
            settings={state.settings}
            onWinddownClick={() => setTool("sleep")}
          />

          {/* Mode switching - kept minimal */}
          <div style={{
            display: 'flex',
            gap: '8px',
            justifyContent: 'center',
            marginTop: '12px'
          }}>
            {Object.entries(MODES).map(([k, m]) => (
              <button
                key={k}
                onClick={() => patch({ capacity: k, capacityBy: { day: todayKey(), by: "user" } })}
                style={{
                  background: state.capacity === k ? T.petrol : 'transparent',
                  color: state.capacity === k ? 'white' : T.petrol,
                  border: `1px solid ${T.petrol}`,
                  borderRadius: '6px',
                  padding: '6px 12px',
                  fontFamily: 'Atkinson Hyperlegible',
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
              >
                {m.label}
              </button>
            ))}
          </div>

          {/* Time anchor - temporal context for ADHD time blindness */}
          <div style={{ marginTop: '12px' }}>
            <TimeAnchor settings={state.settings} />
          </div>

          {overBudget && state.capacity !== "recovery" && (
            <div style={s.nudge}>
              Du har passerat dagens budget. Inget är trasigt — men att växla ner skyddar morgondagen.
              <button
                style={{ ...s.linkBtn, marginLeft: 8 }}
                onClick={() => patch({ capacity: state.capacity === "steady" ? "low" : "recovery" })}
              >
                byt till {state.capacity === "steady" ? "Lågt batteri" : "Återhämtning"}
              </button>
            </div>
          )}

          {/* medication — discreet daily check */}
          <div style={s.medRow}>
            <span style={{ fontSize: 13, color: T.soft }}>Medicin idag</span>
            {medToday ? (
              <button
                style={s.medStatus}
                onClick={() => setState((st) => ({ ...st, meds: st.meds.filter((m) => m.day !== todayKey()) }))}
              >
                {medToday.status === "taken" ? "✓ tagen" : medToday.status === "skipped" ? "hoppade över" : "inte idag"} · ändra
              </button>
            ) : (
              <span style={{ display: "flex", gap: 6 }}>
                {[["taken", "Tagen"], ["skipped", "Hoppade över"], ["off", "Inte idag"]].map(([v, l]) => (
                  <button key={v} style={s.medBtn} onClick={() => setState((st) => ({ ...st, meds: [...st.meds, { day: todayKey(), status: v }] }))}>
                    {l}
                  </button>
                ))}
              </span>
            )}
          </div>
        </section>

        {/* ============ Google-synk ============ */}
        <div style={s.syncRow}>
          <button style={{ ...s.ghostBtn, flex: 1, fontSize: 13, padding: "9px 8px" }} onClick={syncCalendar} disabled={calBusy}>
            {calBusy ? "hämtar…" : state.gcal.day === todayKey() ? `🗓️ Kalender · ${state.gcal.events.length} idag` : "🗓️ Hämta kalendern"}
          </button>
          <button style={{ ...s.ghostBtn, flex: 1, fontSize: 13, padding: "9px 8px" }} onClick={checkGmail} disabled={mailBusy}>
            {mailBusy ? "kollar…" : "✉️ Kolla mejlen"}
          </button>
        </div>
        {syncErr && <div style={{ fontSize: 13, color: T.warn, marginTop: 6 }}>{syncErr}</div>}
        {state.sync.last && (
          <div style={{ fontSize: 12, color: T.soft, marginTop: 6, fontFamily: "'IBM Plex Mono', monospace" }}>
            {[["kalender", state.sync.cal], ["mejl", state.sync.mail], ["oura", state.sync.oura], ["notion", state.sync.notion]]
              .map(([n, v]) => `${n} ${v === "ok" ? "✓" : v === "skip" ? "–" : v === "fail" ? "✗" : "…"}`)
              .join(" · ")}
            {state.oura.day === todayKey() && state.oura.sleepScore != null && ` · sömn ${state.oura.sleepScore}`}
            {` · ${new Date(state.sync.last).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" })}, sedan var 3:e h`}
          </div>
        )}

        {state.mailSug.day === todayKey() && state.mailSug.items.length > 0 && (
          <section style={{ ...s.card, borderLeft: `4px solid ${T.petrol}` }}>
            <div style={s.eyebrow}>Från mejlen — vill du göra uppgifter av dessa?</div>
            {state.mailSug.items.map((m) => (
              <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px solid ${T.line}` }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{m.title}</div>
                  <div style={{ fontSize: 12, color: T.soft, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.from} · {m.subject}</div>
                </div>
                <button
                  style={{ ...s.medBtn, flexShrink: 0 }}
                  onClick={() => {
                    addTask({ title: m.title, icon: "✉️" });
                    setState((st) => ({
                      ...st,
                      mailSug: { ...st.mailSug, items: st.mailSug.items.filter((x) => x.id !== m.id), dismissed: [...(st.mailSug.dismissed || []), `${m.from}|${m.subject}`] },
                    }));
                  }}
                >
                  Lägg till
                </button>
                <button
                  style={{ ...s.linkBtn, color: T.soft, fontSize: 13, flexShrink: 0 }}
                  onClick={() => setState((st) => ({ ...st, mailSug: { ...st.mailSug, items: st.mailSug.items.filter((x) => x.id !== m.id), dismissed: [...(st.mailSug.dismissed || []), `${m.from}|${m.subject}`] } }))}
                >
                  nej
                </button>
              </div>
            ))}
          </section>
        )}

        {/* ============ morning lap ============ */}
        {!recoveryTint && !lapDoneToday && visibleTasks.length > 0 && (
          <MorningLap
            tasks={visibleTasks}
            onSkip={() => patch({ morningLapDay: todayKey() })}
            onDone={(ranked) => {
              setState((st) => ({
                ...st,
                morningLapDay: todayKey(),
                tasks: st.tasks.map((t) => {
                  const idx = ranked.indexOf(t.id);
                  return { ...t, priority: idx === 0 ? "A" : idx === 1 ? "B" : idx === 2 ? "C" : t.priority, inbox: false };
                }),
              }));
              addWin("Morgonvarv: dagen planerad");
            }}
          />
        )}

        {/* ============ recovery rest menu ============ */}
        {recoveryTint && (
          <section style={{ ...s.card, background: T.rest }}>
            <div style={s.eyebrow}>Vilomeny</div>
            <p style={{ ...s.body, marginTop: 6 }}>
              I återhämtningsläge krymper planen med flit. Välj en, sluta sedan besluta.
            </p>
            {(() => {
              const offset = new Date().getDate() % REST_MENU.length;
              const items = [0, 1, 2].map((i) => REST_MENU[(offset + i) % REST_MENU.length]);
              const restedToday = new Set(
                winsToday.filter((w) => w.text.startsWith("Vilade: ")).map((w) => w.text.slice(8))
              );
              return items.map((r, i) => {
                const done = restedToday.has(r);
                return (
                  <button
                    key={i}
                    style={{ ...s.restItem, opacity: done ? 0.55 : 1 }}
                    disabled={done}
                    onClick={() => {
                      logEnergy(-2, "Vila");
                      addWin(`Vilade: ${r}`);
                    }}
                  >
                    <span>{r}</span>
                    <span style={s.restPlus}>{done ? "✓ +2" : "+2"}</span>
                  </button>
                );
              });
            })()}
          </section>
        )}

        {/* ============ transition cue ============ */}
        {upcoming && (
          <div style={s.transitionCue}>
            Snart — <b>{upcoming.title}</b> börjar om {upcoming.inMin} min. Dags att börja landa det du håller på med.
          </div>
        )}

        {/* ============ now / next ============ */}
        <section style={{ ...s.card, borderLeft: `4px solid ${T.petrol}` }}>
          <div style={s.eyebrow}>{nextTask ? "En tydlig nästa sak" : "Inget i kön"}</div>
          {nextTask ? (
            <>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginTop: 8 }}>
                <span style={s.coinLg}>{nextTask.icon || "📌"}</span>
                <div style={{ ...s.nextTitle, marginTop: 4, flex: 1 }}>{nextTask.title}</div>
                <button style={s.doneBtn} onClick={() => completeTask(nextTask)} aria-label="Markera klar">✓</button>
              </div>
              <div style={s.metaRow}>
                {nextTask.time && <span style={s.mono}>{nextTask.time}</span>}
                <span style={{ ...s.chip, background: "transparent", border: `1.5px solid ${energyColor(nextTask.energy)}`, color: T.spruce }}>{nextTask.energy}⚡</span>
                {nextTask.trigger && <span style={s.chipSoft}>när {nextTask.trigger}</span>}
              </div>
              {nextTask.steps && nextTask.steps.length > 0 && (
                <div style={{ marginTop: 8, color: T.soft, fontSize: 14 }}>
                  Första steget: {nextTask.steps.find((st) => !st.done)?.title || "alla steg klara"}
                </div>
              )}
              <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                <button style={s.primaryBtn} onClick={() => { setView("tools"); setTool("focus"); }}>
                  Starta ett fokusvarv
                </button>
                <button style={{ ...s.ghostBtn, borderColor: T.warn, color: T.warn }} onClick={() => setUnstick((v) => !v)}>
                  Jag kommer inte igång
                </button>
              </div>

              {unstick && (
                <div style={s.unstickBox}>
                  {(() => {
                    const firstStep = (nextTask.steps || []).find((st) => !st.done);
                    if (firstStep)
                      return (
                        <>
                          <div style={{ fontSize: 13, color: T.soft }}>Glöm hela uppgiften. Bara detta:</div>
                          <div style={{ fontFamily: "'Fraunces', serif", fontSize: 20, marginTop: 4 }}>{firstStep.title}</div>
                          <p style={{ ...s.body, marginTop: 8 }}>
                            Tio minuter, sedan får du sluta. Para ihop det med något du bara tillåter under uppgifter — en viss spellista eller podd. Motivationen följer intresset; låna det.
                          </p>
                          <button
                            style={{ ...s.primaryBtn, marginTop: 10 }}
                            onClick={() => {
                              setFocusPrefill({ goal: firstStep.title, mins: 10 });
                              setView("tools");
                              setTool("focus");
                              setUnstick(false);
                            }}
                          >
                            Bara 10 minuter
                          </button>
                        </>
                      );
                    return (
                      <>
                        <div style={{ fontSize: 14, color: T.ink }}>
                          Uppgiften är för stor för att börja — det är problemet, inte du. Vi hittar minsta första steget.
                        </div>
                        <button
                          style={{ ...s.primaryBtn, marginTop: 10 }}
                          disabled={unstickBusy}
                          onClick={async () => {
                            setUnstickBusy(true);
                            try {
                              const steps = await aiBreakdown(nextTask.title);
                              updateTask(nextTask.id, { steps });
                            } catch (e) { /* stays open, user can retry */ }
                            setUnstickBusy(false);
                          }}
                        >
                          {unstickBusy ? "letar…" : "Hitta minsta första steget"}
                        </button>
                      </>
                    );
                  })()}
                </div>
              )}
            </>
          ) : (
            <p style={s.body}>
              Tryck på + där nere för att fånga en uppgift, eller ta pausen. En tom kö är tillåten.
            </p>
          )}
        </section>

        {/* ============ timeline ============ */}
        {!recoveryTint && (
          <section style={s.section}>
            <div style={s.eyebrow}>Nästa halvdag</div>
            {scheduled.length === 0 ? (
              <p style={s.body}>Inga tidsatta punkter de närmaste timmarna. Oschemalagda uppgifter finns nedanför.</p>
            ) : (
              <div style={s.timeline}>
                <NowMarker />
                {scheduled.map((t, i) => {
                  const next = scheduled[i + 1];
                  const gap = next ? next.m - (t.m + (t.minutes || 30)) : null;
                  return (
                    <div key={t.id}>
                      <div style={s.tlRow}>
                        <div style={s.tlTime}>{t.time}</div>
                        <div style={t.isEvent ? { ...s.tlDot, background: "transparent", border: `2px solid ${T.petrol}` } : { ...s.tlDot, background: energyColor(t.energy) }} />
                        <div style={{ ...s.tlBody, display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={s.coin}>{t.icon || "📌"}</span>
                          <span>
                            <span style={{ fontWeight: 700 }}>{t.title}</span>
                            <span style={{ color: T.soft }}>{t.isEvent ? ` · ${t.minutes} min` : ` · ${t.energy}⚡`}</span>
                          </span>
                        </div>
                      </div>
                      {gap !== null && gap < 15 && (
                        <div style={s.bufferRow}>
                          {gap >= 0 ? (
                            <span style={s.bufferWarn}>bara {gap} min emellan — snäv övergång</span>
                          ) : (
                            <span style={s.bufferWarn}>överlapp — överväg att flytta en</span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* ============ dagsöversikt ============ */}
        <section style={{ ...s.section, display: "flex", gap: 14, flexWrap: "wrap", fontSize: 13, color: T.soft }}>
          <span><b style={{ color: T.ink }}>{doneToday.length}</b> klara idag</span>
          <span><b style={{ color: T.ink }}>{visibleTasks.length}</b> kvar</span>
          <span><b style={{ color: T.ink }}>{spent}⚡</b> förbrukat · <b style={{ color: T.ink }}>{recharged}⚡</b> återladdat</span>
          <span><b style={{ color: T.ink }}>{winsToday.length}</b> vinster</span>
        </section>

        {/* ============ tasks ============ */}
        <section style={s.section}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <div style={s.eyebrow}>Uppgifter</div>
            <button style={s.linkBtn} onClick={() => setShowAdd((v) => !v)}>
              {showAdd ? "stäng" : "+ lägg till"}
            </button>
          </div>

          {/* Day selector */}
          <div style={{ display: "flex", gap: 6, marginBottom: 12, overflowX: "auto", paddingBottom: 4 }}>
            {[-2, -1, 0, 1, 2, 3].map((offset) => {
              const d = new Date();
              d.setDate(d.getDate() + offset);
              const dateStr = d.toISOString().split('T')[0];
              const isSelected = dateStr === selectedDate;
              const isTodayDate = offset === 0;
              const dayName = d.toLocaleDateString('sv-SE', { weekday: 'short' });
              const dayNum = d.getDate();
              return (
                <button
                  key={dateStr}
                  onClick={() => setSelectedDate(dateStr)}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 8,
                    border: `1px solid ${isSelected ? T.petrol : '#E8E7E2'}`,
                    background: isSelected ? T.petrol : 'transparent',
                    color: isSelected ? 'white' : T.ink,
                    fontSize: 12,
                    fontFamily: "'IBM Plex Mono', monospace",
                    cursor: 'pointer',
                    flexShrink: 0,
                    fontWeight: isTodayDate ? 600 : 400,
                  }}
                >
                  <div>{dayName}</div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{dayNum}</div>
                </button>
              );
            })}
          </div>

          {showAdd && (
            <AddTask
              defaultDate={selectedDate}
              onAdd={(draft) => {
                addTask(draft);
                setShowAdd(false);
              }}
            />
          )}

          {visibleTasks.length === 0 && !showAdd && (
            <p style={s.body}>
              {recoveryTint
                ? "Inga nödvändiga i kön. Vila är planen."
                : "Inget här ännu. Fånga en uppgift innan den dunstar."}
            </p>
          )}

          {visibleTasks.map((t) => (
            <div
              key={t.id}
              onClick={() => selectTask(t)}
              onContextMenu={(e) => {
                e.preventDefault();
                setContextMenu({
                  x: e.clientX, y: e.clientY,
                  items: [
                    { icon: "✎", label: "Redigera", action: () => selectTask(t) },
                    { icon: t.done ? "↩" : "✓", label: t.done ? "Återställ" : "Markera klar", action: () => t.done ? undoCompleteTask(t) : completeTask(t) },
                    { icon: "📅", label: "Schemalägg", action: () => { selectTask(t); setTool(null); } },
                    { separator: true },
                    { icon: "🗑", label: "Ta bort", danger: true, action: () => removeTask(t.id) },
                  ],
                });
              }}
              style={{ cursor: 'pointer' }}
            >
              <TaskCard
                task={t}
                onDone={() => completeTask(t)}
                onUpdate={(p) => updateTask(t.id, p)}
                onRemove={() => removeTask(t.id)}
                onWin={addWin}
                onPushCal={pushTaskToCalendar}
                agentBusy={streamAgent.isRunning && streamAgent.activeInput === t.title}
              />
            </div>
          ))}
        </section>

        {/* ============ task initiation support (ADHD) ============ */}
        {selectedTask && (
          <TaskInitiationSupport
            task={selectedTask}
            onStartStep={(task, step) => startTaskStep(task, step)}
            onSetTrigger={(task) => setTaskTrigger(task)}
          />
        )}

        {/* ============ klart idag ============ */}
        {doneToday.length > 0 && (
          <section style={s.section}>
            <div style={s.eyebrow}>Klart idag ({doneToday.length})</div>
            {doneToday.map((t) => (
              <div key={t.id} style={{ ...s.card, marginTop: 8, opacity: 0.75 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={s.coin}>{t.icon || "📌"}</span>
                  <span style={{ textDecoration: "line-through", color: T.soft, flex: 1 }}>{t.title}</span>
                  <span style={{ fontSize: 12, color: T.soft }}>{new Date(t.doneAt).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" })}</span>
                </div>
                {(t.steps || []).length > 0 && (
                  <div style={{ marginTop: 6, paddingLeft: 34 }}>
                    {t.steps.map((st) => (
                      <div key={st.id} style={{ fontSize: 13, color: T.soft, textDecoration: st.done ? "line-through" : "none" }}>
                        {st.done ? "✓" : "·"} {st.title}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </section>
        )}
          </>
        )}

        {/* ============ idéer view ============ */}
        {view === "ideas" && (
          <section style={{ marginTop: 4 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <p style={{ ...s.body, marginTop: 4 }}>
                Tala eller skriv in rått — sparas direkt, städas av AI efteråt.
              </p>
              <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                {[["list", "lista"], ["map", "karta"]].map(([m, l]) => (
                  <button
                    key={m}
                    onClick={() => setIdeaMode(m)}
                    style={{ ...s.medBtn, background: ideaMode === m ? "#E5EBE9" : "transparent", fontWeight: ideaMode === m ? 700 : 400 }}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>
            {state.ideas.length === 0 && (
              <p style={{ ...s.body, marginTop: 14 }}>
                Tomt. Tryck på + och sedan 💡 Idé — eller 🎙 och prata på.
              </p>
            )}
            {ideaMode === "map" && state.ideas.length > 0 && (
              <IdeaMap ideas={state.ideas} onSelect={(id) => setState((st) => ({ ...st, _selIdea: id }))} selectedId={state._selIdea} />
            )}
            {ideaMode === "map" && state._selIdea && state.ideas.find((i) => i.id === state._selIdea) && (
              <IdeaCard
                idea={state.ideas.find((i) => i.id === state._selIdea)}
                onRefine={() => refineIdea(state._selIdea, state.ideas.find((i) => i.id === state._selIdea).raw)}
                onToTask={() => ideaToTask(state.ideas.find((i) => i.id === state._selIdea))}
                onRemove={() => { removeIdea(state._selIdea); setState((st) => ({ ...st, _selIdea: null })); }}
                onUpdate={updateIdea}
              />
            )}
            {ideaMode === "list" && state.ideas.map((idea) => (
              <IdeaCard
                key={idea.id}
                idea={idea}
                onRefine={() => refineIdea(idea.id, idea.raw)}
                onToTask={() => ideaToTask(idea)}
                onRemove={() => removeIdea(idea.id)}
                onUpdate={updateIdea}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setContextMenu({
                    x: e.clientX, y: e.clientY,
                    items: [
                      { icon: "✎", label: "Redigera", action: () => {} },
                      { icon: "→", label: "Till uppgift", action: () => ideaToTask(idea) },
                      { icon: "✨", label: "Förfina", action: () => refineIdea(idea.id, idea.raw) },
                      { separator: true },
                      { icon: "🗑", label: "Ta bort", danger: true, action: () => removeIdea(idea.id) },
                    ],
                  });
                }}
              />
            ))}
          </section>
        )}

        {/* ============ lists view ============ */}
        {view === "lists" && (
          <section style={{ marginTop: 4 }}>
            <p style={{ ...s.body, marginTop: 4 }}>
              Om det är viktigt bor det på en lista — aldrig i huvudet.
            </p>
            <Lists
              lists={state.lists}
              onChange={(lists) => setState((st) => ({ ...st, lists }))}
            />
          </section>
        )}

        {/* ============ tools view ============ */}
        {view === "tools" && (
          <section style={{ marginTop: 4 }}>
          <div style={s.toolGrid}>
            <ToolBtn active={tool === "focus" || lapRunning} onClick={() => setTool(tool === "focus" ? null : "focus")} label="Fokusvarv" sub={lapRunning ? "pågår…" : "timer + mål"} />
            <ToolBtn active={tool === "move"} onClick={() => setTool(tool === "move" ? null : "move")} label="Rörelsepaus" sub="5 min, +2⚡" />
            <ToolBtn active={tool === "checkin"} onClick={() => setTool(tool === "checkin" ? null : "checkin")} label="Tankekoll" sub="en snällare läsning" />
            <ToolBtn active={tool === "wins"} onClick={() => setTool(tool === "wins" ? null : "wins")} label="Vinster" sub={`${winsToday.length} idag`} />
            <ToolBtn active={tool === "sleep"} onClick={() => setTool(tool === "sleep" ? null : "sleep")} label="Sömnankare" sub={`vakna ${state.settings.wake}`} />
            <ToolBtn active={tool === "ground"} onClick={() => setTool(tool === "ground" ? null : "ground")} label="Andningsankare" sub="3 min, +1⚡" />
            <ToolBtn active={tool === "week"} onClick={() => setTool(tool === "week" ? null : "week")} label="Veckoöversikt" sub="energimönster" />
            <ToolBtn active={tool === "edu"} onClick={() => setTool(tool === "edu" ? null : "edu")} label="Varför det funkar" sub="evidensen" />
            <ToolBtn active={tool === "connect"} onClick={() => setTool(tool === "connect" ? null : "connect")} label="Kopplingar" sub="Google · Notion · Oura" />
            <ToolBtn active={tool === "agents"} onClick={() => setTool(tool === "agents" ? null : "agents")} label="Agenter" sub={`${Object.values(state.agents).filter(Boolean).length}/5 aktiva`} />
            <ToolBtn active={tool === "agui"} onClick={() => setTool(tool === "agui" ? null : "agui")} label="AG-UI" sub="streaming demo" />
            <ToolBtn onClick={() => setShowCheckin(true)} label="Morgoncheck" sub="översikt + energi" />
            <ToolBtn onClick={() => setShowSetup(true)} label="Inställningar" sub="guidad setup" />
          </div>

          {tool === "agents" && (
            <div style={{ ...s.card, marginTop: 10 }}>
              {[
                ["classify", "Sorteraren", "Klassar varje fångst som uppgift, idé eller inköp och sätter taggar. Av = allt landar som rå idé."],
                ["refine", "Förfinaren", "Städar råa idéer i bakgrunden till titel + anteckning. Plockar upp misslyckade, max 3 försök."],
                ["sync", "Synkaren", "Hämtar kalender, mejl och Oura var 3:e timme och arkiverar gårdagen till Notion."],
                ["breakdown", "Nedbrytaren", "Förbereder första steg för A-prioriterade och tunga uppgifter innan du fastnar. Max 3 per dag."],
                ["observer", "Observatören", "Håller koll på energi, tid och läge — föreslår rätt verktyg från verktygslådan som en avfärdbar banner, öppnar aldrig något åt dig."],
              ].map(([key, name, desc]) => (
                <div key={key} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 0", borderBottom: `1px solid ${T.line}` }}>
                  <input
                    type="checkbox"
                    checked={state.agents[key]}
                    onChange={(e) => setState((st) => ({ ...st, agents: { ...st.agents, [key]: e.target.checked } }))}
                    style={{ marginTop: 3, width: 18, height: 18 }}
                  />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{name}</div>
                    <div style={{ fontSize: 12, color: T.soft, lineHeight: 1.5 }}>{desc}</div>
                  </div>
                </div>
              ))}
              <div style={{ ...s.eyebrow, marginTop: 12 }}>Senaste aktivitet</div>
              {state.agentLog.length === 0 ? (
                <p style={s.body}>Inget ännu — agenterna loggar här när de jobbar.</p>
              ) : (
                state.agentLog.slice(0, 8).map((l, i) => (
                  <div key={i} style={{ fontSize: 12, color: T.soft, padding: "5px 0", fontFamily: "'IBM Plex Mono', monospace" }}>
                    {new Date(l.ts).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" })} <span style={{ color: T.spruce, fontWeight: 700 }}>{l.agent}</span> {l.text}
                  </div>
                ))
              )}
            </div>
          )}

          {tool === "agui" && (
            <div style={{ ...s.card, marginTop: 10 }}>
              <div style={{ ...s.eyebrow }}>AG-UI live</div>
              <div style={{ fontSize: 13, color: T.soft, marginBottom: 10 }}>
                Strömmande agent via AG-UI protokollet — testa riktigt flöde.
              </div>

              <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                {["classify", "refine", "breakdown", "observer"].map((a) => (
                  <button
                    key={a}
                    onClick={() => setAguiAgent(a)}
                    style={{
                      ...s.ghostBtn,
                      fontSize: 12,
                      padding: "4px 10px",
                      background: aguiAgent === a ? T.spruce + "22" : "transparent",
                      border: `1px solid ${aguiAgent === a ? T.spruce : T.line}`,
                      color: aguiAgent === a ? T.spruce : T.soft,
                    }}
                  >
                    {a}
                  </button>
                ))}
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <input
                  type="text"
                  value={aguiInput}
                  onChange={(e) => setAguiInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && aguiInput.trim() && agui.run(aguiAgent, aguiInput, state, true)}
                  placeholder={aguiAgent === "observer" ? "Analyserar state..." : aguiAgent === "classify" ? "Beskriv en fångst..." : aguiAgent === "refine" ? "Rå idé att förfinа..." : "Uppgift att bryta ner..."}
                  style={{ ...s.input, flex: 1 }}
                />
                <button
                  onClick={() => aguiInput.trim() && agui.run(aguiAgent, aguiInput, state, true)}
                  disabled={agui.active || !aguiInput.trim()}
                  style={{
                    ...s.solidBtn,
                    fontSize: 13,
                    opacity: agui.active || !aguiInput.trim() ? 0.5 : 1,
                  }}
                >
                  {agui.active ? "..." : "Kör"}
                </button>
              </div>

              {/* Streaming progress */}
              {agui.steps.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ ...s.eyebrow }}>Steg</div>
                  {agui.steps.map((step, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0" }}>
                      <span style={{ fontSize: 14 }}>{step.status === "done" ? "✓" : step.status === "active" ? "⏳" : "○"}</span>
                      <span style={{ fontSize: 13, color: T.soft }}>{step.name}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Tool calls */}
              {agui.toolCalls.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ ...s.eyebrow }}>Verktyg</div>
                  {agui.toolCalls.map((tc) => (
                    <div key={tc.id} style={{ fontSize: 12, fontFamily: "IBM Plex Mono", color: T.soft, padding: "3px 0" }}>
                      <span style={{ color: T.spruce }}>{tc.name}</span>
                      {tc.status === "done" ? " ✓" : " ⏳"}
                    </div>
                  ))}
                </div>
              )}

              {/* Messages */}
              {agui.messages.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ ...s.eyebrow }}>Svar</div>
                  {agui.messages.map((msg) => (
                    <div key={msg.id} style={{ fontSize: 14, color: T.ink, padding: "4px 0", lineHeight: 1.5 }}>
                      {msg.text}
                    </div>
                  ))}
                </div>
              )}

              {/* Error */}
              {agui.error && (
                <div style={{ marginTop: 10, padding: "8px 12px", background: T.warn + "15", borderRadius: 8, fontSize: 13, color: T.warn }}>
                  {agui.error}
                </div>
              )}

              {/* A2UI generative surfaces */}
              {agui.a2uiSurfaces.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ ...s.eyebrow }}>Genererad UI</div>
                  <A2UIRenderer surfaces={agui.a2uiSurfaces} onAction={(action, payload) => console.log("A2UI action:", action, payload)} />
                </div>
              )}

              {/* Raw events (collapsed) */}
              {agui.events.length > 0 && (
                <details style={{ marginTop: 12 }}>
                  <summary style={{ fontSize: 12, color: T.soft, cursor: "pointer" }}>
                    {agui.events.length} händelser (klicka för att visa)
                  </summary>
                  <pre style={{ fontSize: 10, fontFamily: "IBM Plex Mono", color: T.soft, maxHeight: 200, overflow: "auto", marginTop: 6, padding: 8, background: T.track, borderRadius: 6 }}>
                    {JSON.stringify(agui.events, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          )}

          {tool === "connect" && (
            <div style={{ ...s.card, marginTop: 10 }}>
              <label style={{ ...s.smallLabel, flexDirection: "row", alignItems: "center", gap: 8, marginTop: 0 }}>
                <input
                  type="checkbox"
                  checked={state.settings.autoSync}
                  onChange={(e) => setState((st) => ({ ...st, settings: { ...st.settings, autoSync: e.target.checked } }))}
                />
                auto-synk var 3:e timme medan appen är öppen
              </label>

              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button style={{ ...s.ghostBtn, fontSize: 13 }} onClick={runSync}>Synka allt nu</button>
              </div>

              <div style={{ ...s.eyebrow, marginTop: 14 }}>Oura</div>
              <label style={s.smallLabel}>
                personlig access-token (skapas på cloud.ouraring.com)
                <input
                  type="password"
                  style={{ ...s.input, marginTop: 4 }}
                  value={state.settings.ouraToken}
                  onChange={(e) => setState((st) => ({ ...st, settings: { ...st.settings, ouraToken: e.target.value } }))}
                  placeholder="OURA_..."
                />
              </label>
              {state.sync.oura === "fail" && (
                <p style={{ ...s.body, color: T.warn }}>
                  Oura gick inte att nå härifrån — artefaktmiljön kan blockera externa API:er. Ange nattens sömn manuellt så driver den samma automatik:
                </p>
              )}
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                {[["<6", "Sov <6h"], ["6-7", "6–7h"], [">7", ">7h"]].map(([v, l]) => (
                  <button
                    key={v}
                    style={{ ...s.medBtn, background: state.oura.day === todayKey() && state.oura.manual === v ? "#E5EBE9" : "transparent" }}
                    onClick={() => setManualSleep(v)}
                  >
                    {l}
                  </button>
                ))}
              </div>

              <div style={{ ...s.eyebrow, marginTop: 16 }}>Notion</div>
              <p style={s.body}>
                Gårdagens vinster och energisiffror arkiveras automatiskt till sidan "Varv – logg". Kräver att Notion är anslutet i Claudes kopplingsinställningar.
                {state.sync.notion === "fail" && " Senaste försöket misslyckades — kontrollera anslutningen."}
              </p>

              <div style={{ ...s.eyebrow, marginTop: 16 }}>Kör om nu</div>
              <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                <button style={s.medBtn} onClick={async () => { const r = await syncOura(); setState((st) => ({ ...st, sync: { ...st.sync, day: todayKey(), oura: r } })); }}>Oura</button>
                <button style={s.medBtn} onClick={async () => { const r = await syncCalendar(); setState((st) => ({ ...st, sync: { ...st.sync, day: todayKey(), cal: r } })); }}>Kalender</button>
                <button style={s.medBtn} onClick={async () => { const r = await checkGmail(); setState((st) => ({ ...st, sync: { ...st.sync, day: todayKey(), mail: r } })); }}>Mejl</button>
                <button style={s.medBtn} onClick={async () => { const r = await archiveToNotion(); setState((st) => ({ ...st, sync: { ...st.sync, day: todayKey(), notion: r } })); }}>Notion-arkiv</button>
              </div>
            </div>
          )}

          {tool === "ground" && (
            <BreathingSpace
              onDone={() => {
                logEnergy(-1, "Andning");
                addWin("Andningsankare, 3 min");
                setTool(null);
              }}
            />
          )}
          {tool === "week" && <WeekReview energyLog={state.energyLog} wins={state.wins} tagLog={state.tagLog} />}
          {tool === "edu" && <EduCards />}
          {tool === "sleep" && (
            <SleepPanel
              settings={state.settings}
              onChange={(p) => setState((st) => ({ ...st, settings: { ...st.settings, ...p } }))}
            />
          )}
          {tool === "move" && (
            <MovementSnack
              onDone={(idea) => {
                logEnergy(-2, "Rörelse");
                addWin(`Rörde mig: ${idea}`);
                setTool(null);
              }}
            />
          )}
          {tool === "checkin" && (
            <CheckIn
              past={state.checkins}
              onSave={(c) => {
                setState((st) => ({ ...st, checkins: [c, ...st.checkins].slice(0, 40) }));
                addWin("Gjorde en tankekoll");
                setTool(null);
              }}
            />
          )}
          {tool === "wins" && <WinsList wins={state.wins} calibration={state.calibration} />}
          </section>
        )}

        {/* ============ focus lap — mounted globally so a running timer survives navigation ============ */}
        {((view === "tools" && tool === "focus") || lapRunning) && (
          <FocusLap
            key={focusPrefill ? focusPrefill.goal : "default"}
            taskTitle={nextTask?.title}
            initialGoal={focusPrefill?.goal}
            initialMins={focusPrefill?.mins}
            mini={lapRunning && !(view === "tools" && tool === "focus")}
            onExpand={() => { setView("tools"); setTool("focus"); }}
            onRunning={setLapRunning}
            onPark={(text) => addTask({ title: text })}
            onDone={(goal, mins, est, actualMin) => {
              addWin(`Fokusvarv (${actualMin} min): ${goal || "utan titel"}`);
              if (est > 0)
                setState((st) => ({ ...st, calibration: [...st.calibration, { est, actual: actualMin, ts: Date.now() }].slice(-40) }));
              setLapRunning(false);
              setFocusPrefill(null);
              setTool(null);
            }}
          />
        )}

        <footer style={s.footer}>
          Inga streaks. Varje dag börjar på noll.
        </footer>
      </div>

      {/* ============ capture sheet ============ */}
      {captureOpen && (
        <CaptureSheet
          onClose={() => setCaptureOpen(false)}
          voiceLang={state.settings.voiceLang}
          onLangChange={(lang) => setState((st) => ({ ...st, settings: { ...st.settings, voiceLang: lang } }))}
          onIdea={addIdea}
          onAuto={autoCapture}
          onVoiceCapture={onVoiceCapture}
          onTask={(title) => {
            addTask({ title });
            setToast(`Fångad: ${title}`);
            clearTimeout(toastTimer.current);
            toastTimer.current = setTimeout(() => setToast(null), 2200);
          }}
          onListItem={(text) => {
            setState((st) => {
              const target = st.lists.find((l) => l.id === "shopping") || st.lists[0];
              if (!target) return st;
              return {
                ...st,
                lists: st.lists.map((l) => (l.id === target.id ? { ...l, items: [...l.items, { id: uid(), text, done: false }] } : l)),
              };
            });
            setToast(`→ Inköp: ${text}`);
            clearTimeout(toastTimer.current);
            toastTimer.current = setTimeout(() => setToast(null), 2200);
          }}
        />
      )}

      {/* ============ toast ============ */}
      {toast && <div style={s.toast}>{toast}</div>}
      <AgentProgress step={streamAgent.step} text={streamAgent.text} isRunning={streamAgent.isRunning} />
      {undoTask && (
        <div style={{ ...s.toast, background: T.petrol, display: 'flex', gap: 10, alignItems: 'center' }}>
          <span>✓ {undoTask.title}</span>
          <button
            onClick={() => undoCompleteTask(undoTask)}
            style={{ background: 'white', color: T.petrol, border: 'none', borderRadius: 6, padding: '4px 12px', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}
          >
            Ångra
          </button>
        </div>
      )}

      {/* ============ setup wizard ============ */}
      {showSetup && <SetupWizard onComplete={handleSetupComplete} />}

      {/* ============ daily check-in ============ */}
      {showCheckin && !showSetup && (
        <DailyCheckin
          state={state}
          onSetEnergy={handleCheckinEnergy}
          onDismiss={handleCheckinDismiss}
          onAddTask={addTask}
        />
      )}

      {/* ============ bottom navigation ============ */}
      <nav style={s.nav}>
        {[["today", "Idag"], ["ideas", "Idéer"], ["capture", "+"], ["lists", "Listor"], ["tools", "Verktyg"]].map(([k, label]) =>
          k === "capture" ? (
            <button key={k} style={s.navPlus} onClick={() => setCaptureOpen(true)} aria-label="Fånga en tanke">
              +
            </button>
          ) : (
            <button
              key={k}
              onClick={() => setView(k)}
              style={{ ...s.navBtn, color: view === k ? T.petrolDark : T.soft, fontWeight: view === k ? 700 : 400 }}
            >
              <span style={{ ...s.navDash, opacity: view === k ? 1 : 0 }} />
              {label}
              {k === "tools" && lapRunning && <span style={s.navDot} />}
            </button>
          )
        )}
      </nav>

      {/* ============ System Status (ADHD anxiety reduction) ============ */}
      <SystemStatus
        sync={state.sync}
        agents={state.agents}
        lastSync={state.sync.last}
        onSyncClick={() => runSync()}
      />

      {/* ============ context menu ============ */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}

/* ============================================================ */
/* Inloggning — varje person har eget separat dataset            */
/* ============================================================ */
function Login({ onLoggedIn }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const { token, username: u } = await login(username.trim(), password);
      setAuth({ token, username: u });
      onLoggedIn(u);
    } catch (e) {
      setErr(e.message || "Kunde inte logga in");
    }
    setBusy(false);
  };

  return (
    <div style={{ minHeight: "100vh", background: T.paper, display: "grid", placeItems: "center", fontFamily: "'Atkinson Hyperlegible', sans-serif" }}>
      <form onSubmit={submit} style={{ background: T.card, padding: 28, borderRadius: 16, width: 280, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 300, fontSize: 28, color: T.ink }}>Varv</div>
        <input
          autoFocus
          placeholder="Användarnamn"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          style={{ padding: "10px 12px", borderRadius: 10, border: `1.5px solid ${T.line}`, fontSize: 15 }}
        />
        <input
          type="password"
          placeholder="Lösenord"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ padding: "10px 12px", borderRadius: 10, border: `1.5px solid ${T.line}`, fontSize: 15 }}
        />
        {err && <div style={{ color: T.warn, fontSize: 13 }}>{err}</div>}
        <button
          type="submit"
          disabled={busy || !username || !password}
          style={{ padding: "10px 12px", borderRadius: 10, border: "none", background: T.spruce, color: T.card, fontSize: 15, fontWeight: 700, opacity: busy ? 0.6 : 1 }}
        >
          {busy ? "loggar in…" : "Logga in"}
        </button>
      </form>
    </div>
  );
}

export default function Varv() {
  const [username, setUsername] = useState(() => getAuth()?.username || null);

  if (!username) return <Login onLoggedIn={setUsername} />;

  return (
    <VarvApp
      username={username}
      onLogout={() => {
        clearAuth();
        setUsername(null);
      }}
    />
  );
}

/* ============================================================ */
/* Capture sheet — the 3-second window                           */
/* ============================================================ */
function CaptureSheet({ onClose, onTask, onListItem, onIdea, onAuto, onVoiceCapture, voiceLang, onLangChange }) {
  const [v, setV] = useState("");
  const [rec, setRec] = useState(false);
  const [vBusy, setVBusy] = useState(false);
  const [vErr, setVErr] = useState("");
  const ref = useRef(null);
  const recRef = useRef(null);
  const streamRef = useRef(null);
  const s = styles;
  useEffect(() => { ref.current && ref.current.focus(); }, []);
  useEffect(() => () => {
    try { recRef.current && recRef.current.state !== "inactive" && recRef.current.stop(); } catch (e) {}
    try { streamRef.current && streamRef.current.getTracks().forEach((t) => t.stop()); } catch (e) {}
  }, []);

  const task = () => { if (v.trim()) { onTask(v.trim()); onClose(); } };
  const listItem = () => { if (v.trim()) { onListItem(v.trim()); onClose(); } };
  const idea = () => { if (v.trim()) { onIdea(v.trim()); onClose(); } };
  const auto = () => { if (v.trim()) { onAuto(v.trim()); onClose(); } };

  // Riktig mikrofoninspelning → uppladdning till varv-server (KB-Whisper), inte
  // webbläsarens inbyggda taligenkänning som skickar ljudet till Google.
  const startVoice = async () => {
    setVErr("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setVErr("Mikrofonen stöds inte i den här webbläsaren — skriv istället.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mr = new MediaRecorder(stream);
      const chunks = [];
      mr.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setVBusy(true);
        try {
          const blob = new Blob(chunks, { type: mr.mimeType || "audio/webm" });
          await onVoiceCapture(blob, voiceLang);
          onClose();
        } catch (e) {
          setVErr("Transkribering misslyckades — testa igen eller skriv istället.");
        }
        setVBusy(false);
      };
      recRef.current = mr;
      mr.start();
      setRec(true);
    } catch (e) {
      setVErr("Mikrofonen nekades eller kunde inte startas — skriv istället.");
    }
  };
  const stopVoice = () => {
    try { recRef.current && recRef.current.stop(); } catch (e) {}
    setRec(false);
  };

  return (
    <div style={s.sheetBackdrop} onClick={onClose}>
      <div style={s.sheet} onClick={(e) => e.stopPropagation()}>
        <div style={s.sheetHandle} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: -6 }}>
          <button
            style={{ ...s.linkBtn, fontSize: 13, color: T.soft }}
            onClick={() => onLangChange(voiceLang === "sv-SE" ? "en-US" : "sv-SE")}
          >
            röst: {voiceLang === "sv-SE" ? "svenska" : "engelska"} · byt
          </button>
          <button style={{ ...s.linkBtn, fontSize: 14 }} onClick={onClose}>Klar</button>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6 }}>
          <input
            ref={ref}
            style={{ ...s.captureInput, fontSize: 17, padding: "13px 16px" }}
            placeholder={rec ? "lyssnar…" : "Fånga den innan den försvinner…"}
            value={v}
            onChange={(e) => setV(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && auto()}
          />
          <button
            style={{ ...s.micBtn, background: rec ? T.warn : T.petrol, opacity: vBusy ? 0.5 : 1 }}
            onClick={rec ? stopVoice : startVoice}
            disabled={vBusy}
            aria-label={rec ? "Sluta spela in" : "Tala in"}
          >
            {vBusy ? "…" : rec ? "■" : "🎙"}
          </button>
        </div>
        {rec && <div style={{ fontSize: 12, color: T.warn, textAlign: "center", marginTop: 6 }}>● spelar in — tala fritt, tryck ■ när du är klar</div>}
        {vBusy && <div style={{ fontSize: 12, color: T.soft, textAlign: "center", marginTop: 6 }}>transkriberar…</div>}
        {vErr && <div style={{ fontSize: 12, color: T.warn, marginTop: 6 }}>{vErr}</div>}
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <button style={{ ...s.primaryBtn, flex: 1, opacity: v.trim() ? 1 : 0.5 }} disabled={!v.trim()} onClick={auto}>
            Fånga — agenten sorterar
          </button>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button style={{ ...s.ghostBtn, flex: 1, fontSize: 13, padding: "8px 6px", opacity: v.trim() ? 1 : 0.5 }} disabled={!v.trim()} onClick={task}>
            Uppgift
          </button>
          <button style={{ ...s.ghostBtn, flex: 1, fontSize: 13, padding: "8px 6px", opacity: v.trim() ? 1 : 0.5 }} disabled={!v.trim()} onClick={idea}>
            💡 Idé
          </button>
          <button style={{ ...s.ghostBtn, flex: 1, fontSize: 13, padding: "8px 6px", opacity: v.trim() ? 1 : 0.5 }} disabled={!v.trim()} onClick={listItem}>
            Inköp
          </button>
        </div>
        <div style={{ fontSize: 12, color: T.soft, textAlign: "center", marginTop: 10 }}>
          Enter = agenten sorterar åt dig. Knapparna styr själv.
        </div>
      </div>
    </div>
  );
}

/* ============================================================ */
/* Energy dial — the signature element                           */
/* ============================================================ */
function EnergyDial({ budget, remaining }) {
  const pct = budget === 0 ? 0 : remaining / budget;
  const R = 56;
  const C = Math.PI * R; // half circle
  const ticks = Array.from({ length: 11 }, (_, i) => i);
  return (
    <div style={{ textAlign: "center" }}>
      <svg width="160" height="94" viewBox="0 0 160 94">
        {/* ticks */}
        {ticks.map((i) => {
          const a = Math.PI * (1 - i / 10);
          const x1 = 80 + Math.cos(a) * 70;
          const y1 = 86 - Math.sin(a) * 70;
          const x2 = 80 + Math.cos(a) * (i % 5 === 0 ? 61 : 65);
          const y2 = 86 - Math.sin(a) * (i % 5 === 0 ? 61 : 65);
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={T.track} strokeWidth="1.5" />;
        })}
        <path d={`M 24 86 A ${R} ${R} 0 0 1 136 86`} fill="none" stroke={T.track} strokeWidth="9" strokeLinecap="round" />
        <path
          d={`M 24 86 A ${R} ${R} 0 0 1 136 86`}
          fill="none"
          stroke={pct > 0.35 ? T.petrol : T.warn}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={`${C * pct} ${C}`}
          style={{ transition: "stroke-dasharray 0.6s ease" }}
        />
        <text x="80" y="72" textAnchor="middle" style={{ font: "500 28px 'IBM Plex Mono', monospace", fill: T.ink }}>
          {remaining}
        </text>
        <text x="80" y="88" textAnchor="middle" style={{ font: "400 11px 'IBM Plex Mono', monospace", fill: T.soft }}>
          of {budget} ⚡
        </text>
      </svg>
    </div>
  );
}

function NowMarker() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "2px 0 10px" }}>
      <span style={{ font: "500 12px 'IBM Plex Mono', monospace", color: T.petrolDark }}>{nowHM()}</span>
      <div style={{ flex: 1, height: 1, background: T.petrol, opacity: 0.5 }} />
      <span style={{ fontSize: 11, color: T.petrolDark }}>nu</span>
    </div>
  );
}

/* ============================================================ */
/* Context menu — right-click on tasks, ideas, list items       */
/* ============================================================ */
function ContextMenu({ x, y, items, onClose }) {
  const menuRef = useRef(null);
  const s = styles;

  useEffect(() => {
    const handleClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) onClose();
    };
    const handleKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  // Keep menu within viewport
  const [pos, setPos] = useState({ x, y });
  useEffect(() => {
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const nx = x + rect.width > window.innerWidth ? x - rect.width : x;
    const ny = y + rect.height > window.innerHeight ? y - rect.height : y;
    setPos({ x: Math.max(0, nx), y: Math.max(0, ny) });
  }, [x, y]);

  return (
    <div
      ref={menuRef}
      style={{
        position: "fixed",
        left: pos.x,
        top: pos.y,
        zIndex: 1000,
        background: T.card,
        border: `1px solid ${T.line}`,
        borderRadius: 10,
        boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
        padding: "6px 0",
        minWidth: 160,
        fontFamily: "'Atkinson Hyperlegible', sans-serif",
        fontSize: 14,
      }}
    >
      {items.map((item, i) => {
        if (item.separator) {
          return <div key={i} style={{ height: 1, background: T.line, margin: "4px 0" }} />;
        }
        return (
          <button
            key={i}
            onClick={() => { item.action(); onClose(); }}
            style={{
              display: "block",
              width: "100%",
              textAlign: "left",
              padding: "8px 16px",
              background: "none",
              border: "none",
              cursor: "pointer",
              color: item.danger ? T.warn : T.ink,
              fontFamily: "inherit",
              fontSize: "inherit",
            }}
            onMouseEnter={(e) => e.target.style.background = T.track}
            onMouseLeave={(e) => e.target.style.background = "none"}
          >
            {item.icon && <span style={{ marginRight: 8 }}>{item.icon}</span>}
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

/* ============================================================ */
/* Voice Input Button — attach to any text field                 */
/* ============================================================ */
function VoiceInputButton({ onResult, language = "sv-SE", style: btnStyle }) {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [fadeClass, setFadeClass] = useState("");
  const recognitionRef = useRef(null);

  const toggle = () => {
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert("Taligenkänning stöds inte i denna webbläsare."); return; }
    const rec = new SR();
    rec.lang = language;
    rec.continuous = false;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let final = "";
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) final += t;
        else interim += t;
      }
      const display = final || interim;
      if (display) {
        setTranscript(display);
        setFadeClass("voice-fade-in");
        if (final) onResult(final);
      }
    };
    rec.onend = () => { setListening(false); setTimeout(() => setTranscript(""), 2000); };
    rec.onerror = () => setListening(false);
    recognitionRef.current = rec;
    rec.start();
    setListening(true);
  };

  return (
    <div style={{ position: "relative", display: "inline-flex", alignItems: "center", ...btnStyle }}>
      <button
        onClick={toggle}
        title={"Talskning"}
        style={{
          width: 32, height: 32, borderRadius: "50%",
          border: `1.5px solid ${listening ? T.warn : T.line}`,
          background: listening ? T.warn : "transparent",
          color: listening ? "white" : T.soft,
          cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 16,
          transition: "all 0.25s ease",
          flexShrink: 0,
        }}
      >
        {listening ? "■" : "🎤"}
      </button>
      {transcript && (
        <div
          className={fadeClass}
          style={{
            position: "absolute",
            left: 40,
            top: "50%",
            transform: "translateY(-50%)",
            background: T.card,
            border: `1px solid ${T.line}`,
            borderRadius: 8,
            padding: "4px 10px",
            fontSize: 13,
            color: T.petrol,
            whiteSpace: "nowrap",
            maxWidth: 200,
            overflow: "hidden",
            textOverflow: "ellipsis",
            pointerEvents: "none",
          }}
        >
          {listening ? transcript + "…" : transcript}
        </div>
      )}
    </div>
  );
}

/* ============================================================ */
/* Fade-in animation class (injected once)                       */
/* ============================================================ */
const voiceStyle = document.createElement("style");
voiceStyle.textContent = `
  @keyframes voiceFadeIn { from { opacity: 0; transform: translateY(-50%) translateX(-6px); } to { opacity: 1; transform: translateY(-50%) translateX(0); } }
  .voice-fade-in { animation: voiceFadeIn 0.3s ease; }
  @keyframes pulseGlow { 0%,100% { box-shadow: 0 0 0 0 rgba(166,106,79,0.4); } 50% { box-shadow: 0 0 0 8px rgba(166,106,79,0); } }
  .voice-pulse { animation: pulseGlow 1.5s infinite; }
  @keyframes slideUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
  .slide-up { animation: slideUp 0.35s ease; }
  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
  .fade-in { animation: fadeIn 0.4s ease; }
  @keyframes textAppear { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
  .text-appear { animation: textAppear 0.3s ease; }
`;
if (!document.getElementById("varv-voice-styles")) {
  voiceStyle.id = "varv-voice-styles";
  document.head.appendChild(voiceStyle);
}

/* ============================================================ */
/* Add task — trigger, energy, time, essential                   */
/* ============================================================ */
function AddTask({ onAdd, defaultDate }) {
  const [title, setTitle] = useState("");
  const [trigger, setTrigger] = useState("");
  const [energy, setEnergy] = useState(2);
  const [time, setTime] = useState("");
  const [essential, setEssential] = useState(false);
  const [icon, setIcon] = useState(null);
  const [pickIcon, setPickIcon] = useState(false);
  const [repeatDays, setRepeatDays] = useState([]);
  const [scheduledDate, setScheduledDate] = useState(defaultDate || todayKey());
  const s = styles;
  const shownIcon = icon || guessIcon(title || " ");
  const toggleDay = (key) =>
    setRepeatDays((days) => (days.includes(key) ? days.filter((d) => d !== key) : [...days, key]));
  return (
    <div style={{ ...s.card, marginTop: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input style={{ ...s.input, flex: 1 }} placeholder="Vad behöver göras?" value={title} onChange={(e) => setTitle(e.target.value)} />
        <VoiceInputButton onResult={(t) => setTitle((prev) => prev ? prev + " " + t : t)} language={"sv-SE"} />
      </div>
      <button style={{ ...s.linkBtn, fontSize: 13, marginTop: 6 }} onClick={() => setPickIcon((v) => !v)}>
        ikon {shownIcon} · {pickIcon ? "klar" : "ändra"}
      </button>
      {pickIcon && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
          {ICON_CHOICES.map((ic) => (
            <button
              key={ic}
              onClick={() => { setIcon(ic); setPickIcon(false); }}
              style={{
                fontSize: 18, padding: "4px 7px", borderRadius: 8, cursor: "pointer",
                border: shownIcon === ic ? `2px solid ${T.petrol}` : `1px solid ${T.line}`,
                background: shownIcon === ic ? "#E5EBE9" : "transparent",
              }}
            >
              {ic}
            </button>
          ))}
        </div>
      )}
      <input
        style={s.input}
        placeholder="Om-så-trigger, t.ex. 'efter morgonkaffet' eller 'när jag kommer hem'"
        value={trigger}
        onChange={(e) => setTrigger(e.target.value)}
      />
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 4 }}>
        <label style={s.smallLabel}>
          energikostnad
          <select style={s.select} value={energy} onChange={(e) => setEnergy(Number(e.target.value))}>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n} — {ENERGY_LABELS[n]}
              </option>
            ))}
          </select>
        </label>
        <label style={s.smallLabel}>
          tid (valfritt)
          <input type="time" style={s.select} value={time} onChange={(e) => setTime(e.target.value)} />
        </label>
        <label style={{ ...s.smallLabel, flexDirection: "row", alignItems: "center", gap: 6 }}>
          <input type="checkbox" checked={essential} onChange={(e) => setEssential(e.target.checked)} />
          nödvändig (visas i återhämtningsläge)
        </label>
      </div>
      <div style={{ marginTop: 8 }}>
        <span style={s.smallLabel}>schema</span>
        <input
          type="date"
          style={s.select}
          value={scheduledDate}
          onChange={(e) => setScheduledDate(e.target.value)}
          min={todayKey()}
        />
        {scheduledDate !== todayKey() && (
          <div style={{ fontSize: 12, color: T.soft, marginTop: 4 }}>
            schemalagt för {new Date(scheduledDate + 'T12:00:00').toLocaleDateString('sv-SE', { weekday: 'long', month: 'long', day: 'numeric' })}
          </div>
        )}
      </div>
      <div style={{ marginTop: 8 }}>
        <span style={s.smallLabel}>upprepas</span>
        <div style={{ display: "flex", gap: 4, marginTop: 4, flexWrap: "wrap" }}>
          {WEEKDAYS.map((d) => (
            <button
              key={d.key}
              type="button"
              onClick={() => toggleDay(d.key)}
              style={{
                fontSize: 12, padding: "5px 9px", borderRadius: 8, cursor: "pointer",
                border: `1.5px solid ${T.spruce}`,
                background: repeatDays.includes(d.key) ? T.spruce : "transparent",
                color: repeatDays.includes(d.key) ? T.card : T.spruce,
              }}
            >
              {d.label}
            </button>
          ))}
        </div>
        {repeatDays.length > 0 && (
          <div style={{ fontSize: 12, color: T.soft, marginTop: 4 }}>
            Återkommer varje {repeatDays.map((k) => WEEKDAYS.find((d) => d.key === k).label).join(", ")} — dyker upp igen nästa gång den dagen kommer, även efter att den bockats av.
          </div>
        )}
      </div>
      <button
        style={{ ...s.primaryBtn, marginTop: 12, opacity: title.trim() ? 1 : 0.5 }}
        disabled={!title.trim()}
        onClick={() =>
          onAdd({ title: title.trim(), icon: shownIcon, trigger: trigger.trim(), energy, time, essential, priority: null, inbox: false, repeatDays, scheduled_date: scheduledDate !== todayKey() ? scheduledDate : null })
        }
      >
        Lägg till uppgift
      </button>
    </div>
  );
}

/* ============================================================ */
/* Task card with AI breakdown                                   */
/* ============================================================ */
function TaskCard({ task, onDone, onUpdate, onRemove, onWin, onPushCal, agentBusy }) {
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [calBusy, setCalBusy] = useState(false);
  const [err, setErr] = useState("");
  const s = styles;

  const breakDown = async () => {
    setBusy(true);
    setErr("");
    try {
      const steps = await aiBreakdown(task.title);
      onUpdate({ steps });
    } catch (e) {
      setErr("Nedbrytningen misslyckades — försök igen eller lägg till steg för hand.");
    }
    setBusy(false);
  };

  const toggleStep = (id) => {
    const steps = task.steps.map((st) => (st.id === id ? { ...st, done: !st.done } : st));
    onUpdate({ steps });
    const st = task.steps.find((x) => x.id === id);
    if (st && !st.done) onWin(`Steg klart: ${st.title}`);
  };

  const stepsLeft = (task.steps || []).filter((st) => !st.done).length;

  return (
    <div style={{ ...s.card, marginTop: 10, padding: expanded ? 16 : "12px 16px" }}>
      {/* collapsed row — the whole row is the expand toggle */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button
          onClick={() => setExpanded((v) => !v)}
          style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit", textAlign: "left", minWidth: 0 }}
          aria-expanded={expanded} aria-label="Visa detaljer"
        >
          <span style={s.coin}>{task.icon || "📌"}</span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontWeight: 700, fontSize: 15, color: T.ink }}>
              {task.priority && <span style={s.prioBadge}>{task.priority}</span>}
              {task.title}
            </span>
            <span style={{ display: "block", fontSize: 12, color: T.soft, marginTop: 2 }}>
              {agentBusy && (
                <span style={{ color: T.petrol, fontWeight: 500 }}>
                  🤖 Nedbrytaren jobbar… · 
                </span>
              )}
              {task.scheduled_date && task.scheduled_date !== todayKey() && (
                <span style={{ color: T.petrol, fontWeight: 500 }}>
                  {new Date(task.scheduled_date + 'T12:00:00').toLocaleDateString('sv-SE', { weekday: 'short', month: 'short', day: 'numeric' })} · 
                </span>
              )}
              {task.time ? `${task.time} · ` : ""}{task.energy}⚡{stepsLeft > 0 ? ` · ${stepsLeft} steg kvar` : ""}{expanded ? "" : " · tryck för mer"}
            </span>
          </span>
        </button>
        <button style={s.doneBtn} onClick={onDone} aria-label="Markera klar">✓</button>
      </div>

      {/* expanded details */}
      {expanded && (
        <>
          {(task.trigger || task.essential || (task.tags || []).length > 0 || (task.repeatDays || []).length > 0) && (
            <div style={s.metaRow}>
              {task.trigger && <span style={s.chipSoft}>när {task.trigger}</span>}
              {task.essential && <span style={s.chipSoft}>nödvändig</span>}
              {(task.repeatDays || []).length > 0 && (
                <span style={s.chipSoft}>🔁 {task.repeatDays.map((k) => WEEKDAYS.find((d) => d.key === k).label).join(", ")}</span>
              )}
              {(task.tags || []).map((tg) => <span key={tg} style={s.chipSoft}>#{tg}</span>)}
            </div>
          )}

          <div style={{ display: "flex", gap: 4, marginTop: 8, flexWrap: "wrap" }}>
            {WEEKDAYS.map((d) => {
              const active = (task.repeatDays || []).includes(d.key);
              return (
                <button
                  key={d.key}
                  onClick={() => {
                    const days = task.repeatDays || [];
                    onUpdate({ repeatDays: active ? days.filter((k) => k !== d.key) : [...days, d.key] });
                  }}
                  style={{
                    fontSize: 11, padding: "3px 7px", borderRadius: 7, cursor: "pointer",
                    border: `1.5px solid ${T.spruce}`,
                    background: active ? T.spruce : "transparent",
                    color: active ? T.card : T.spruce,
                  }}
                >
                  {d.label}
                </button>
              );
            })}
          </div>

          <div style={{ display: "flex", gap: 12, marginTop: 10, flexWrap: "wrap" }}>
            <button style={s.linkBtn} onClick={breakDown} disabled={busy}>
              {busy ? "bryter ner…" : task.steps.length ? "bryt ner igen (AI)" : "bryt ner (AI)"}
            </button>
            {task.time && !task.synced && onPushCal && (
              <button
                style={s.linkBtn}
                disabled={calBusy}
                onClick={async () => {
                  setCalBusy(true);
                  setErr("");
                  try { await onPushCal(task); } catch (e) { setErr("Kunde inte lägga i kalendern — testa igen."); }
                  setCalBusy(false);
                }}
              >
                {calBusy ? "läggs till…" : "lägg i kalendern"}
              </button>
            )}
            {task.synced && <span style={{ fontSize: 13, color: T.moss, alignSelf: "center" }}>✓ i kalendern</span>}
            <button style={{ ...s.linkBtn, color: T.soft }} onClick={onRemove}>ta bort</button>
          </div>
          {err && <div style={{ color: T.warn, fontSize: 13, marginTop: 6 }}>{err}</div>}

          {task.steps.length > 0 && (
            <div style={{ marginTop: 4 }}>
              {task.steps.map((st) => (
                <button key={st.id} style={s.stepRow} onClick={() => toggleStep(st.id)}>
                  <span style={{ ...s.stepBox, background: st.done ? T.moss : "transparent" }}>{st.done ? "✓" : ""}</span>
                  <span style={{ textDecoration: st.done ? "line-through" : "none", color: st.done ? T.soft : T.ink, textAlign: "left" }}>
                    {st.title} <span style={{ color: T.soft }}>· {st.minutes} min</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ============================================================ */
/* Morning lap — the daily planning ritual (Safren-style)        */
/* ============================================================ */
function MorningLap({ tasks, onDone, onSkip }) {
  const [ranked, setRanked] = useState([]);
  const s = styles;
  const toggle = (id) => {
    setRanked((r) => (r.includes(id) ? r.filter((x) => x !== id) : r.length < 3 ? [...r, id] : r));
  };
  return (
    <section style={{ ...s.card, borderLeft: `4px solid ${T.moss}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <div style={s.eyebrow}>Morgonvarv · 2 min</div>
        <button style={{ ...s.linkBtn, color: T.soft, fontSize: 13 }} onClick={onSkip}>hoppa över idag</button>
      </div>
      <p style={s.body}>Tryck på upp till tre uppgifter i den ordning de betyder något idag. Första trycket = A, sedan B, sedan C. Resten kan vänta utan skuld.</p>
      <div style={{ marginTop: 10 }}>
        {tasks.slice(0, 8).map((t) => {
          const idx = ranked.indexOf(t.id);
          return (
            <button key={t.id} style={s.lapRow} onClick={() => toggle(t.id)}>
              <span style={{ ...s.lapBadge, background: idx >= 0 ? T.spruce : "transparent", color: idx >= 0 ? T.card : T.soft }}>
                {idx >= 0 ? ["A", "B", "C"][idx] : "·"}
              </span>
              <span style={{ textAlign: "left" }}>{t.title}{t.inbox ? <span style={{ color: T.soft }}> · inkorg</span> : null}</span>
            </button>
          );
        })}
      </div>
      <button
        style={{ ...s.primaryBtn, marginTop: 12, opacity: ranked.length ? 1 : 0.5 }}
        disabled={!ranked.length}
        onClick={() => onDone(ranked)}
      >
        Sätt dagen
      </button>
    </section>
  );
}

/* ============================================================ */
/* Sleep anchors — CBT-I basics: fixed wake, wind-down cue       */
/* ============================================================ */
function SleepPanel({ settings, onChange }) {
  const s = styles;
  return (
    <div style={{ ...s.card, marginTop: 10 }}>
      <p style={s.body}>
        Två ankare gör det mesta av jobbet: samma väckningstid varje dag (även helger), och en nedvarvningssignal när kvällens skärmar ska dämpas. Varv visar en stillsam banner efter nedvarvningen.
      </p>
      <div style={{ display: "flex", gap: 14, marginTop: 10, flexWrap: "wrap" }}>
        <label style={s.smallLabel}>
          väckningstid
          <input type="time" style={s.select} value={settings.wake} onChange={(e) => onChange({ wake: e.target.value })} />
        </label>
        <label style={s.smallLabel}>
          nedvarvning börjar
          <input type="time" style={s.select} value={settings.winddown} onChange={(e) => onChange({ winddown: e.target.value })} />
        </label>
      </div>
    </div>
  );
}

/* ============================================================ */
/* Focus lap — goal declaration + timer, body-doubling friendly  */
/* ============================================================ */
function FocusLap({ taskTitle, initialGoal, initialMins, onDone, onRunning, onPark, mini, onExpand }) {
  const [goal, setGoal] = useState(initialGoal || taskTitle || "");
  const [mins, setMins] = useState(initialMins || 25);
  const [est, setEst] = useState("");
  const [left, setLeft] = useState(null);
  const [park, setPark] = useState("");
  const [parked, setParked] = useState(0);
  const startedAt = useRef(null);
  const timer = useRef(null);
  const s = styles;

  useEffect(() => () => clearInterval(timer.current), []);

  const elapsedMin = () => Math.max(1, Math.round((Date.now() - startedAt.current) / 60000));

  const start = () => {
    onRunning && onRunning(true);
    startedAt.current = Date.now();
    setLeft(mins * 60);
    clearInterval(timer.current);
    timer.current = setInterval(() => {
      setLeft((l) => {
        if (l <= 1) {
          clearInterval(timer.current);
          return 0;
        }
        return l - 1;
      });
    }, 1000);
  };

  if (left !== null && mini)
    return (
      <button style={s.miniLap} onClick={onExpand}>
        <span style={{ font: "500 14px 'IBM Plex Mono', monospace" }}>
          {left > 0 ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}` : "klart"}
        </span>
        <span style={{ fontSize: 13, opacity: 0.85, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {left > 0 ? `varv — ${goal || "fokuserar"}` : "varvet klart — tryck för att avsluta"}
        </span>
        <span style={{ fontSize: 12, opacity: 0.7 }}>öppna ›</span>
      </button>
    );

  if (left === 0) {
    const actual = elapsedMin();
    const e = Number(est) || 0;
    return (
      <div style={{ ...s.card, marginTop: 10, textAlign: "center" }}>
        <div style={{ fontFamily: "'Fraunces', serif", fontSize: 22 }}>Varvet klart.</div>
        <p style={s.body}>Hur långt du än kom räknas det.</p>
        {e > 0 && (
          <p style={{ ...s.body, fontFamily: "'IBM Plex Mono', monospace" }}>
            gissning {e} min · faktisk {actual} min
          </p>
        )}
        <button style={{ ...s.primaryBtn, marginTop: 8 }} onClick={() => onDone(goal, mins, e, actual)}>Notera som vinst</button>
      </div>
    );
  }

  if (left !== null)
    return (
      <div style={{ ...s.card, marginTop: 10, textAlign: "center" }}>
        <div style={{ font: "500 40px 'IBM Plex Mono', monospace", color: T.petrolDark }}>
          {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}
        </div>
        <div style={{ color: T.soft, marginTop: 4 }}>{goal || "fokuserar"}</div>
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <input
            style={{ ...s.captureInput, fontSize: 14 }}
            placeholder="Förströdd tanke? Parkera den här, ta den efteråt."
            value={park}
            onChange={(e) => setPark(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && park.trim()) {
                onPark && onPark(park.trim());
                setParked((n) => n + 1);
                setPark("");
              }
            }}
          />
        </div>
        {parked > 0 && (
          <div style={{ fontSize: 12, color: T.moss, marginTop: 6 }}>
            {parked} {parked > 1 ? "tankar parkerade" : "tanke parkerad"} i inkorgen — trygga, inte borta.
          </div>
        )}
        <button style={{ ...s.ghostBtn, marginTop: 12 }} onClick={() => { clearInterval(timer.current); setLeft(0); }}>
          Sluta tidigt — räknas ändå
        </button>
      </div>
    );

  return (
    <div style={{ ...s.card, marginTop: 10 }}>
      <input style={s.input} placeholder="Vad gör du detta varv? (att säga det hjälper dig börja)" value={goal} onChange={(e) => setGoal(e.target.value)} />
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        {[10, 25, 45].map((m) => (
          <button key={m} onClick={() => setMins(m)} style={{ ...s.modeBtn, borderColor: T.petrol, background: mins === m ? T.petrol : "transparent", color: mins === m ? T.card : T.petrolDark }}>
            {m} min
          </button>
        ))}
      </div>
      <label style={s.smallLabel}>
        din gissning: hur många minuter tar det egentligen? (bygger tidskalibrering)
        <input type="number" min="1" style={{ ...s.select, width: 90 }} value={est} onChange={(e) => setEst(e.target.value)} placeholder="min" />
      </label>
      <p style={{ ...s.body, marginTop: 10 }}>
        Vill du ha sällskap? Kör tillsammans med en vän på samtal eller en coworkingpartner — närvaro sänker starttröskeln. Ensam funkar också.
      </p>
      <button style={{ ...s.primaryBtn, marginTop: 6 }} onClick={start}>Börja</button>
    </div>
  );
}

/* ============================================================ */
function MovementSnack({ onDone }) {
  const [idea, setIdea] = useState(() => MOVEMENT_IDEAS[Math.floor(Math.random() * MOVEMENT_IDEAS.length)]);
  const s = styles;
  return (
    <div style={{ ...s.card, marginTop: 10 }}>
      <div style={{ fontWeight: 700 }}>{idea}</div>
      <p style={s.body}>Fem minuters rörelse hjälper uppmärksamheten mätbart. Intensiteten spelar ingen roll — rörelsen gör det.</p>
      <div style={{ display: "flex", gap: 10, marginTop: 8, alignItems: "center" }}>
        <button style={s.primaryBtn} onClick={() => onDone(idea)}>Klart (+2⚡)</button>
        <button style={s.linkBtn} onClick={() => setIdea(MOVEMENT_IDEAS[(MOVEMENT_IDEAS.indexOf(idea) + 1) % MOVEMENT_IDEAS.length])}>
          ett annat förslag
        </button>
      </div>
    </div>
  );
}

/* ============================================================ */
function CheckIn({ onSave, past = [] }) {
  const [what, setWhat] = useState("");
  const [thought, setThought] = useState("");
  const [kinder, setKinder] = useState("");
  const s = styles;
  return (
    <div style={{ ...s.card, marginTop: 10 }}>
      <label style={s.smallLabel}>Vad hände?</label>
      <input style={s.input} value={what} onChange={(e) => setWhat(e.target.value)} placeholder="t.ex. kom inte igång med rapporten igen" />
      <label style={s.smallLabel}>Vad säger din hjärna om det?</label>
      <input style={s.input} value={thought} onChange={(e) => setThought(e.target.value)} placeholder="t.ex. jag är lat, jag gör alltid så här" />
      <label style={s.smallLabel}>En snällare, mer korrekt läsning</label>
      <input style={s.input} value={kinder} onChange={(e) => setKinder(e.target.value)} placeholder="t.ex. igångsättning är svårt för min hjärna — ett 5-minuterssteg skulle hjälpa" />
      <button
        style={{ ...s.primaryBtn, marginTop: 10, opacity: what && kinder ? 1 : 0.5 }}
        disabled={!what || !kinder}
        onClick={() => onSave({ id: uid(), what, thought, kinder, ts: Date.now() })}
      >
        Spara omtolkningen
      </button>
      {past.length > 0 && (
        <div style={{ marginTop: 14, paddingTop: 10, borderTop: `1px solid ${T.line}` }}>
          <div style={{ fontSize: 12, color: T.soft, marginBottom: 4 }}>Snällare läsningar du skrivit förut:</div>
          {past.slice(0, 2).map((c) => (
            <div key={c.id} style={{ fontSize: 13, color: T.spruce, padding: "4px 0" }}>
              "{c.kinder}"
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ============================================================ */
function WinsList({ wins, calibration = [] }) {
  const s = styles;
  const withEst = calibration.filter((c) => c.est > 0);
  const ratio = withEst.length >= 3 ? withEst.reduce((a, c) => a + c.actual / c.est, 0) / withEst.length : null;
  return (
    <div style={{ ...s.card, marginTop: 10 }}>
      {ratio && (
        <div style={{ fontSize: 13, color: T.spruce, paddingBottom: 8, borderBottom: `1px solid ${T.line}`, marginBottom: 4 }}>
          Tidskalibrering över {withEst.length} varv: saker tar ungefär {ratio.toFixed(1)}× din gissning.
          {ratio > 1.2 ? " Lägg på marginal så slutar planerna rasa." : ratio < 0.9 ? " Du överskattar — uppgifterna är mindre än de ser ut." : " Dina gissningar är nära. Lita på dem."}
        </div>
      )}
      {wins.length === 0 ? (
        <p style={s.body}>Vinster samlas här allteftersom. Steg räknas. Vila räknas.</p>
      ) : (
        wins.slice(0, 12).map((w) => {
          const d = new Date(w.ts);
          const isToday = d.toDateString() === new Date().toDateString();
          return (
            <div key={w.id} style={{ padding: "7px 0", borderBottom: `1px solid ${T.line}`, fontSize: 14 }}>
              {w.text}
              <span style={{ color: T.soft, fontSize: 12, marginLeft: 8 }}>
                {isToday
                  ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                  : d.toLocaleDateString("sv-SE", { month: "short", day: "numeric" })}
              </span>
            </div>
          );
        })
      )}
    </div>
  );
}

/* ============================================================ */
/* Grounding breaths — box breathing, 3 minutes                  */
/* ============================================================ */
function BreathingSpace({ onDone }) {
  const TOTAL = 180;
  const [sec, setSec] = useState(null);
  const timer = useRef(null);
  const s = styles;
  useEffect(() => () => clearInterval(timer.current), []);

  const start = () => {
    setSec(0);
    timer.current = setInterval(() => {
      setSec((v) => {
        if (v + 1 >= TOTAL) { clearInterval(timer.current); return TOTAL; }
        return v + 1;
      });
    }, 1000);
  };

  if (sec === null)
    return (
      <div style={{ ...s.card, marginTop: 10 }}>
        <p style={s.body}>
          Boxandning: in på 4, håll 4, ut på 4, håll 4. Tre minuter räcker för att växla ner nervsystemet. Ögon öppna eller stängda — det som känns rätt.
        </p>
        <button style={{ ...s.primaryBtn, marginTop: 10 }} onClick={start}>Börja</button>
      </div>
    );

  if (sec >= TOTAL)
    return (
      <div style={{ ...s.card, marginTop: 10, textAlign: "center" }}>
        <div style={{ fontFamily: "'Fraunces', serif", fontSize: 22 }}>Landat.</div>
        <button style={{ ...s.primaryBtn, marginTop: 10 }} onClick={onDone}>Klart (+1⚡)</button>
      </div>
    );

  const phase = Math.floor((sec % 16) / 4);
  const count = 4 - (sec % 4);
  const words = ["Andas in", "Håll", "Andas ut", "Håll"];
  const grow = phase === 0 ? 1 : phase === 2 ? 0.7 : phase === 1 ? 1 : 0.7;
  return (
    <div style={{ ...s.card, marginTop: 10, textAlign: "center" }}>
      <div
        style={{
          width: 90, height: 90, borderRadius: 45, margin: "10px auto",
          background: "#DDE5E2", border: `2px solid ${T.petrol}`,
          transform: `scale(${grow})`, transition: "transform 3.5s ease-in-out",
        }}
      />
      <div style={{ fontFamily: "'Fraunces', serif", fontSize: 22 }}>{words[phase]}</div>
      <div style={{ font: "500 16px 'IBM Plex Mono', monospace", color: T.soft, marginTop: 4 }}>{count}</div>
      <div style={{ fontSize: 12, color: T.soft, marginTop: 8 }}>{Math.floor((TOTAL - sec) / 60)}:{String((TOTAL - sec) % 60).padStart(2, "0")} kvar</div>
    </div>
  );
}

/* ============================================================ */
/* Week review — self-monitoring with feedback                   */
/* ============================================================ */
function WeekReview({ energyLog, wins, tagLog = [] }) {
  const s = styles;
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const tagCounts = {};
  tagLog.filter((t) => t.day >= weekAgo).forEach((t) => { tagCounts[t.tag] = (tagCounts[t.tag] || 0) + 1; });
  const topTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.now() - (6 - i) * 86400000);
    const key = d.toISOString().slice(0, 10);
    const log = energyLog.filter((e) => e.day === key);
    return {
      key,
      label: d.toLocaleDateString("sv-SE", { weekday: "short" }),
      spent: log.filter((e) => e.delta > 0).reduce((a, e) => a + e.delta, 0),
      rech: log.filter((e) => e.delta < 0).reduce((a, e) => a - e.delta, 0),
      wins: wins.filter((w) => new Date(w.ts).toISOString().slice(0, 10) === key).length,
    };
  });
  const max = Math.max(4, ...days.map((d) => d.spent + d.rech));
  const anyData = days.some((d) => d.spent || d.rech || d.wins);
  return (
    <div style={{ ...s.card, marginTop: 10 }}>
      {!anyData ? (
        <p style={s.body}>Mönster dyker upp här efter några dagars användning. Inget att döma — bara data.</p>
      ) : (
        <>
          {days.map((d) => (
            <div key={d.key} style={{ display: "flex", alignItems: "center", gap: 10, padding: "5px 0" }}>
              <span style={{ font: "500 12px 'IBM Plex Mono', monospace", color: T.soft, width: 32 }}>{d.label}</span>
              <div style={{ flex: 1, display: "flex", gap: 2, height: 10 }}>
                <div style={{ width: `${(d.spent / max) * 100}%`, background: T.petrol, borderRadius: 3 }} />
                <div style={{ width: `${(d.rech / max) * 100}%`, background: T.moss, borderRadius: 3 }} />
              </div>
              <span style={{ font: "400 11px 'IBM Plex Mono', monospace", color: T.soft, width: 74, textAlign: "right" }}>
                −{d.spent} / +{d.rech} · {d.wins}v
              </span>
            </div>
          ))}
          <div style={{ fontSize: 12, color: T.soft, marginTop: 8 }}>
            <span style={{ color: T.petrolDark }}>■</span> förbrukat · <span style={{ color: T.moss }}>■</span> återladdat · v = vinster.
            Leta efter dagar där förbrukningen sprang före återladdningen — de lånar av nästa dag.
          </div>
          {topTags.length > 0 && (
            <>
              <div style={{ ...s.eyebrow, marginTop: 14 }}>Vad tankarna handlat om</div>
              <div style={{ ...s.metaRow, marginTop: 8 }}>
                {topTags.map(([tag, n]) => (
                  <span key={tag} style={s.chipSoft}>#{tag} × {n}</span>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

/* ============================================================ */
/* Psychoeducation — why each tool works                         */
/* ============================================================ */
function EduCards() {
  const [i, setI] = useState(0);
  const s = styles;
  const card = EDU_CARDS[i];
  return (
    <div style={{ ...s.card, marginTop: 10 }}>
      <div style={{ ...s.eyebrow, marginBottom: 6 }}>{i + 1} / {EDU_CARDS.length}</div>
      <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 500, fontSize: 20 }}>{card.t}</div>
      <p style={{ ...s.body, fontSize: 15, marginTop: 8 }}>{card.b}</p>
      <div style={{ display: "flex", gap: 16, marginTop: 12 }}>
        <button style={s.linkBtn} onClick={() => setI((i - 1 + EDU_CARDS.length) % EDU_CARDS.length)}>← föregående</button>
        <button style={s.linkBtn} onClick={() => setI((i + 1) % EDU_CARDS.length)}>nästa →</button>
      </div>
    </div>
  );
}

/* ============================================================ */
/* Lists — external memory: rapid add, check off, reuse          */
/* ============================================================ */
function Lists({ lists, onChange }) {
  const [openId, setOpenId] = useState(lists[0]?.id || null);
  const [entry, setEntry] = useState("");
  const [newList, setNewList] = useState("");
  const [showNew, setShowNew] = useState(false);
  const entryRef = useRef(null);
  const s = styles;

  const patchList = (id, fn) => onChange(lists.map((l) => (l.id === id ? fn(l) : l)));

  const addItem = (listId) => {
    if (!entry.trim()) return;
    patchList(listId, (l) => ({ ...l, items: [...l.items, { id: uid(), text: entry.trim(), done: false }] }));
    setEntry("");
    entryRef.current && entryRef.current.focus(); // stay in flow — add the next one immediately
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
        {lists.map((l) => {
          const open = l.items.filter((i) => !i.done).length;
          return (
            <button
              key={l.id}
              onClick={() => setOpenId(openId === l.id ? null : l.id)}
              style={{
                ...s.modeBtn, flex: "none", padding: "8px 14px",
                borderColor: T.petrol,
                background: openId === l.id ? T.petrol : "transparent",
                color: openId === l.id ? T.card : T.petrolDark,
              }}
            >
              {l.name}{open > 0 ? ` · ${open}` : ""}
            </button>
          );
        })}
        <button style={{ ...s.linkBtn, alignSelf: "center" }} onClick={() => setShowNew((v) => !v)}>+ ny lista</button>
      </div>

      {showNew && (
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <input style={{ ...s.captureInput }} placeholder="Listnamn, t.ex. Packning, Apotek, Fråga Josefin" value={newList} onChange={(e) => setNewList(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newList.trim()) {
                onChange([...lists, { id: uid(), name: newList.trim(), items: [] }]);
                setNewList(""); setShowNew(false);
              }
            }} />
        </div>
      )}

      {lists.filter((l) => l.id === openId).map((l) => (
        <div key={l.id} style={{ ...s.card, marginTop: 10 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              ref={entryRef}
              style={{ ...s.captureInput, flex: 1 }}
              placeholder={`Lägg till i ${l.name} — enter, nästa, enter, nästa…`}
              value={entry}
              onChange={(e) => setEntry(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addItem(l.id)}
            />
            <VoiceInputButton onResult={(t) => { setEntry(t); setTimeout(() => addItem(l.id), 100); }} />
            <button style={{ ...s.primaryBtn, padding: "8px 14px" }} onClick={() => addItem(l.id)}>Lägg till</button>
          </div>

          {l.items.length === 0 && <p style={s.body}>Tom. Det du är rädd att glömma — lägg det här nu.</p>}

          {[...l.items].sort((a, b) => Number(a.done) - Number(b.done)).map((it) => (
            <button key={it.id} style={s.stepRow} onClick={() => patchList(l.id, (x) => ({ ...x, items: x.items.map((i) => (i.id === it.id ? { ...i, done: !i.done } : i)) }))}>
              <span style={{ ...s.stepBox, background: it.done ? T.moss : "transparent" }}>{it.done ? "✓" : ""}</span>
              <span style={{ textDecoration: it.done ? "line-through" : "none", color: it.done ? T.soft : T.ink, textAlign: "left", fontSize: 15 }}>{it.text}</span>
            </button>
          ))}

          {l.items.some((i) => i.done) && (
            <div style={{ display: "flex", gap: 14, marginTop: 8 }}>
              <button style={s.linkBtn} onClick={() => patchList(l.id, (x) => ({ ...x, items: x.items.map((i) => ({ ...i, done: false })) }))}>
                återställ alla (återanvänd listan)
              </button>
              <button style={{ ...s.linkBtn, color: T.soft }} onClick={() => patchList(l.id, (x) => ({ ...x, items: x.items.filter((i) => !i.done) }))}>
                rensa avbockade
              </button>
            </div>
          )}
          {l.id !== "shopping" && l.items.length === 0 && (
            <button style={{ ...s.linkBtn, color: T.soft, marginTop: 6 }} onClick={() => { onChange(lists.filter((x) => x.id !== l.id)); setOpenId(lists[0]?.id || null); }}>
              ta bort listan
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

/* ============================================================ */
/* Idékort — rå direkt, förfinad när AI:n hunnit, redigerbar */
/* ============================================================ */
function IdeaCard({ idea, onRefine, onToTask, onRemove, onUpdate, onContextMenu }) {
  const [showRaw, setShowRaw] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(idea.title || "");
  const [editNote, setEditNote] = useState(idea.note || "");
  const s = styles;
  const refined = idea.status === "klar" && idea.title;

  const handleSave = () => {
    if (onUpdate) {
      onUpdate(idea.id, { title: editTitle.trim() || null, note: editNote.trim() || null });
    }
    setEditing(false);
  };

  const handleCancel = () => {
    setEditTitle(idea.title || "");
    setEditNote(idea.note || "");
    setEditing(false);
  };

  return (
    <div style={{ ...s.card, marginTop: 10 }} onContextMenu={onContextMenu}>
      {editing ? (
        /* === Edit mode === */
        <>
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.5px", color: T.soft, marginBottom: 6 }}>
            Redigera idé
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              style={{ ...s.input, fontFamily: "'Fraunces', serif", fontWeight: 500, fontSize: 18, flex: 1 }}
              placeholder="Rubrik…"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              autoFocus
            />
            <VoiceInputButton onResult={(t) => setEditTitle((prev) => prev ? prev + " " + t : t)} />
          </div>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginTop: 8 }}>
            <textarea
              style={{ ...s.input, minHeight: 80, marginTop: 0, flex: 1, resize: "vertical", fontFamily: "'Atkinson Hyperlegible', sans-serif" }}
              placeholder="Beskriv idén mer detaljerat…"
              value={editNote}
              onChange={(e) => setEditNote(e.target.value)}
            />
            <VoiceInputButton onResult={(t) => setEditNote((prev) => prev ? prev + " " + t : t)} style={{ marginTop: 8 }} />
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button style={{ ...s.primaryBtn, flex: 1 }} onClick={handleSave}>Spara</button>
            <button style={{ ...s.ghostBtn, flex: 1 }} onClick={handleCancel}>Avbryt</button>
          </div>
        </>
      ) : refined ? (
        /* === Refined view === */
        <>
          <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 500, fontSize: 19 }}>{idea.title}</div>
          {idea.note && (
            <p style={{ ...s.body, color: T.ink, fontSize: 14, marginTop: 6 }}>{idea.note}</p>
          )}
          {idea.tags.length > 0 && (
            <div style={s.metaRow}>
              {idea.tags.map((t) => <span key={t} style={s.chipSoft}>#{t}</span>)}
            </div>
          )}
        </>
      ) : (
        /* === Raw / refining / fail view === */
        <>
          <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 500, fontSize: 16, color: T.ink }}>
            {idea.raw.slice(0, 80)}{idea.raw.length > 80 ? "…" : ""}
          </div>
          {idea.raw.length > 80 && (
            <p style={{ ...s.body, color: T.soft, fontSize: 13, marginTop: 4 }}>{idea.raw}</p>
          )}
          {idea.status === "refining" && <div style={{ fontSize: 12, color: T.soft, marginTop: 6 }}>✨ förfinas…</div>}
          {idea.status === "fail" && <div style={{ fontSize: 12, color: T.warn, marginTop: 6 }}>förfiningen misslyckades</div>}
        </>
      )}

      {/* Action row */}
      <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap", alignItems: "center" }}>
        <button style={s.linkBtn} onClick={onToTask}>→ uppgift</button>
        <button style={s.linkBtn} onClick={() => setEditing(true)}>✎ redigera</button>
        {refined && (
          <button style={{ ...s.linkBtn, color: T.soft }} onClick={() => setShowRaw((v) => !v)}>
            {showRaw ? "dölj original" : "visa original"}
          </button>
        )}
        {(idea.status === "fail" || idea.status === "raw") && (
          <button style={s.linkBtn} onClick={onRefine}>förfina</button>
        )}
        <button style={{ ...s.linkBtn, color: T.soft }} onClick={onRemove}>ta bort</button>
        <span style={{ fontSize: 11, color: T.soft, marginLeft: "auto", fontFamily: "'IBM Plex Mono', monospace" }}>
          {new Date(idea.ts).toLocaleDateString("sv-SE", { month: "short", day: "numeric" })}
        </span>
      </div>
      {showRaw && (
        <div style={{ marginTop: 8, padding: "8px 10px", background: "#F1F0EA", borderRadius: 10, fontSize: 13, color: T.soft }}>
          {idea.raw}
        </div>
      )}
    </div>
  );
}

/* ============================================================ */
/* Idékarta — radiell mindmap grupperad på primär tagg           */
/* ============================================================ */
function IdeaMap({ ideas, onSelect, selectedId }) {
  const s = styles;
  const groups = useMemo(() => {
    const g = {};
    ideas.forEach((i) => {
      const key = (i.tags && i.tags[0]) || "osorterat";
      (g[key] = g[key] || []).push(i);
    });
    return Object.entries(g).sort((a, b) => b[1].length - a[1].length).slice(0, 6);
  }, [ideas]);

  const W = 340, C = W / 2;
  const cut = (t) => (t.length > 16 ? t.slice(0, 15) + "…" : t);

  return (
    <div style={{ ...s.card, padding: "8px 4px" }}>
      <svg width="100%" viewBox={`0 0 ${W} ${W}`} style={{ display: "block" }}>
        {groups.map(([tag, items], gi) => {
          const a = (gi / groups.length) * 2 * Math.PI - Math.PI / 2;
          const bx = C + Math.cos(a) * 72;
          const by = C + Math.sin(a) * 72;
          const leaves = items.slice(0, 4);
          return (
            <g key={tag}>
              <line x1={C} y1={C} x2={bx} y2={by} stroke={T.track} strokeWidth="1.5" />
              {leaves.map((idea, li) => {
                const la = a + (li - (leaves.length - 1) / 2) * 0.34;
                const lx = C + Math.cos(la) * 134;
                const ly = C + Math.sin(la) * 134;
                const right = Math.cos(la) >= 0;
                const sel = idea.id === selectedId;
                return (
                  <g key={idea.id} onClick={() => onSelect(idea.id)} style={{ cursor: "pointer" }}>
                    <line x1={bx} y1={by} x2={lx} y2={ly} stroke={T.track} strokeWidth="1" />
                    <circle cx={lx} cy={ly} r={sel ? 6 : 4.5} fill={sel ? T.petrol : T.moss} />
                    <text
                      x={lx + (right ? 9 : -9)} y={ly + 3.5}
                      textAnchor={right ? "start" : "end"}
                      style={{ font: `${sel ? 700 : 400} 10.5px 'Atkinson Hyperlegible', sans-serif`, fill: sel ? T.petrolDark : T.ink }}
                    >
                      {cut(idea.title || idea.raw)}
                    </text>
                  </g>
                );
              })}
              <circle cx={bx} cy={by} r="5.5" fill={T.petrol} />
              <text x={bx} y={by - 10} textAnchor="middle"
                style={{ font: "500 10px 'IBM Plex Mono', monospace", fill: T.spruce, letterSpacing: "0.06em" }}>
                #{tag} · {items.length}
              </text>
            </g>
          );
        })}
        <circle cx={C} cy={C} r="24" fill={T.card} stroke={T.petrol} strokeWidth="1.5" />
        <text x={C} y={C + 5} textAnchor="middle" style={{ font: "500 13px 'Fraunces', serif", fill: T.ink }}>
          Idéer
        </text>
      </svg>
      <div style={{ fontSize: 11, color: T.soft, textAlign: "center", paddingBottom: 4 }}>
        grenar = vanligaste taggar · tryck på en nod för att öppna idén
        {groups.length === 6 ? " · visar de 6 största grenarna" : ""}
      </div>
    </div>
  );
}

/* ============================================================ */
function ToolBtn({ label, sub, onClick, active }) {
  return (
    <button
      onClick={onClick}
      style={{
        ...styles.toolBtn,
        background: active ? T.spruce : T.card,
        color: active ? T.card : T.ink,
      }}
    >
      <div style={{ fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 12, color: active ? "#D7DDD8" : T.soft }}>{sub}</div>
    </button>
  );
}

/* ============================================================ */
const styles = {
  page: { minHeight: "100vh", fontFamily: "'Atkinson Hyperlegible', sans-serif", color: T.ink, transition: "background 0.4s" },
  shell: { maxWidth: 560, margin: "0 auto", padding: "16px 16px 130px" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 },
  wordmark: { fontFamily: "'Fraunces', serif", fontWeight: 300, fontSize: 30, letterSpacing: "0.01em", lineHeight: 1 },
  tagline: { color: T.soft, fontSize: 13 },
  hero: { background: T.card, border: `1px solid ${T.line}`, borderRadius: 20, padding: "18px 16px 14px", marginTop: 12 },
  eyebrow: { font: "500 11px 'IBM Plex Mono', monospace", letterSpacing: "0.12em", textTransform: "uppercase", color: T.spruce },
  section: { marginTop: 24 },
  card: { background: T.card, border: `1px solid ${T.line}`, borderRadius: 16, padding: 16, marginTop: 14 },
  body: { color: T.soft, fontSize: 14, lineHeight: 1.5, margin: "6px 0 0" },
  modeRow: { display: "flex", gap: 8, marginTop: 12 },
  modeBtn: { flex: 1, padding: "10px 6px", borderRadius: 12, border: `1.5px solid`, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  modeBlurb: { color: T.soft, fontSize: 13, marginTop: 8, textAlign: "center" },
  nextTitle: { fontFamily: "'Fraunces', serif", fontWeight: 500, fontSize: 24, marginTop: 6, lineHeight: 1.15 },
  metaRow: { display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8, alignItems: "center" },
  mono: { font: "500 13px 'IBM Plex Mono', monospace", color: T.petrolDark },
  chip: { fontSize: 12, background: "#E7EAE3", color: T.spruce, padding: "3px 9px", borderRadius: 20 },
  chipSoft: { fontSize: 12, border: `1px solid ${T.line}`, color: T.soft, padding: "2px 9px", borderRadius: 20 },
  primaryBtn: { background: T.petrol, color: T.card, border: "none", borderRadius: 12, padding: "11px 16px", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  ghostBtn: { background: "transparent", color: T.petrolDark, border: `1.5px solid ${T.petrol}`, borderRadius: 12, padding: "10px 14px", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  linkBtn: { background: "none", border: "none", color: T.petrolDark, fontSize: 14, fontWeight: 700, cursor: "pointer", padding: "6px 2px", fontFamily: "inherit" },
  input: { width: "100%", boxSizing: "border-box", padding: "11px 12px", borderRadius: 12, border: `1px solid ${T.line}`, background: "#FFFFFF", fontSize: 15, marginTop: 8, fontFamily: "inherit", color: T.ink },
  select: { padding: "9px 10px", borderRadius: 10, border: `1px solid ${T.line}`, background: "#FFF", fontSize: 14, fontFamily: "inherit", marginTop: 4 },
  smallLabel: { display: "flex", flexDirection: "column", fontSize: 12, color: T.soft, marginTop: 8 },
  timeline: { marginTop: 12, paddingLeft: 2 },
  tlRow: { display: "flex", alignItems: "center", gap: 10, padding: "7px 0" },
  tlTime: { font: "500 13px 'IBM Plex Mono', monospace", color: T.spruce, width: 46 },
  tlDot: { width: 9, height: 9, borderRadius: 5, background: T.petrol, flexShrink: 0 },
  tlBody: { fontSize: 15 },
  bufferRow: { paddingLeft: 56, margin: "2px 0" },
  bufferOk: { fontSize: 12, color: T.moss },
  bufferWarn: { fontSize: 12, color: T.warn },
  toolGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 },
  toolBtn: { border: `1px solid ${T.line}`, borderRadius: 14, padding: "13px 12px", textAlign: "left", cursor: "pointer", fontFamily: "inherit" },
  doneBtn: { width: 42, height: 42, borderRadius: 21, border: `1.5px solid ${T.moss}`, background: "transparent", color: T.spruce, fontSize: 18, cursor: "pointer", flexShrink: 0 },
  stepRow: { display: "flex", gap: 10, alignItems: "flex-start", width: "100%", background: "none", border: "none", padding: "9px 0", cursor: "pointer", fontSize: 14, fontFamily: "inherit" },
  stepBox: { width: 22, height: 22, borderRadius: 6, border: `1.5px solid ${T.moss}`, color: "#fff", fontSize: 13, display: "grid", placeItems: "center", flexShrink: 0, marginTop: 0 },
  restItem: { display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", background: "#FFFFFF", border: `1px solid ${T.line}`, borderRadius: 12, padding: "12px 12px", marginTop: 8, fontSize: 14, cursor: "pointer", fontFamily: "inherit", color: T.ink, textAlign: "left", gap: 10 },
  restPlus: { font: "500 13px 'IBM Plex Mono', monospace", color: T.moss, flexShrink: 0 },
  footer: { textAlign: "center", color: T.soft, fontSize: 13, marginTop: 36 },
  captureRow: { display: "flex", gap: 8, marginBottom: 6 },
  captureInput: { flex: 1, boxSizing: "border-box", width: "100%", padding: "11px 14px", borderRadius: 12, border: `1.5px solid ${T.track}`, background: "#FFFFFF", fontSize: 15, fontFamily: "inherit", color: T.ink },
  winddownBanner: { background: "#3A4145", color: "#E8E6DE", borderRadius: 12, padding: "10px 14px", fontSize: 14, marginTop: 10 },
  medRow: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginTop: 12, paddingTop: 12, borderTop: `1px solid ${T.line}`, flexWrap: "wrap" },
  medBtn: { background: "transparent", border: `1px solid ${T.line}`, borderRadius: 16, padding: "7px 11px", fontSize: 12, color: T.spruce, cursor: "pointer", fontFamily: "inherit" },
  medStatus: { background: "none", border: "none", color: T.spruce, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", padding: "6px 0" },
  lapRow: { display: "flex", alignItems: "center", gap: 10, width: "100%", background: "none", border: "none", padding: "9px 0", cursor: "pointer", fontSize: 15, fontFamily: "inherit", color: T.ink },
  lapBadge: { width: 26, height: 26, borderRadius: 13, border: `1.5px solid ${T.moss}`, display: "grid", placeItems: "center", fontSize: 12, fontWeight: 700, flexShrink: 0 },
  prioBadge: { display: "inline-grid", placeItems: "center", width: 20, height: 20, borderRadius: 10, background: T.spruce, color: T.card, fontSize: 11, fontWeight: 700, marginRight: 8, verticalAlign: "middle" },
  nudge: { marginTop: 12, padding: "10px 12px", background: "#F5EDE6", border: `1px solid #E2D3C4`, borderRadius: 12, fontSize: 13, color: "#7A5A42", lineHeight: 1.5 },
  transitionCue: { marginTop: 14, padding: "10px 14px", background: "#E5EBE9", border: `1px solid #CBD8D4`, borderRadius: 12, fontSize: 14, color: T.petrolDark, lineHeight: 1.5 },
  unstickBox: { marginTop: 12, padding: "12px 14px", background: "#F7F2EC", border: `1px solid #E6DACB`, borderRadius: 12 },
  syncRow: { display: "flex", gap: 8, marginTop: 12 },
  micBtn: { width: 48, height: 48, borderRadius: 24, border: "none", color: "#FFF", fontSize: 20, cursor: "pointer", flexShrink: 0, display: "grid", placeItems: "center" },
  coin: { width: 32, height: 32, borderRadius: 10, background: "#EBEEE7", border: `1px solid ${T.line}`, display: "grid", placeItems: "center", fontSize: 16, flexShrink: 0 },
  coinLg: { width: 42, height: 42, borderRadius: 13, background: "#EBEEE7", border: `1px solid ${T.line}`, display: "grid", placeItems: "center", fontSize: 21, flexShrink: 0 },
  nav: { position: "fixed", bottom: 0, left: 0, right: 0, height: 66, background: T.card, borderTop: `1px solid ${T.line}`, display: "flex", justifyContent: "space-around", alignItems: "center", maxWidth: "100%", zIndex: 40, paddingBottom: "env(safe-area-inset-bottom)" },
  navBtn: { position: "relative", background: "none", border: "none", fontSize: 13, fontFamily: "inherit", cursor: "pointer", padding: "10px 10px", display: "flex", flexDirection: "column", alignItems: "center", gap: 3 },
  navDash: { width: 20, height: 3, borderRadius: 2, background: T.petrol, display: "block" },
  navDot: { position: "absolute", top: 8, right: 8, width: 8, height: 8, borderRadius: 4, background: T.warn },
  navPlus: { width: 48, height: 48, borderRadius: 24, background: T.petrol, color: T.card, border: "none", fontSize: 26, fontWeight: 400, cursor: "pointer", lineHeight: 1, boxShadow: "0 2px 8px rgba(60,89,96,0.35)" },
  sheetBackdrop: { position: "fixed", inset: 0, background: "rgba(51,57,59,0.35)", zIndex: 50, display: "flex", alignItems: "flex-end" },
  sheet: { background: T.card, borderRadius: "20px 20px 0 0", padding: "10px 16px 26px", width: "100%", maxWidth: 560, margin: "0 auto", boxSizing: "border-box" },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, background: T.track, margin: "4px auto 14px" },
  toast: { position: "fixed", bottom: 122, left: "50%", transform: "translateX(-50%)", background: T.spruce, color: "#EFF1EC", padding: "9px 16px", borderRadius: 20, fontSize: 13, zIndex: 45, maxWidth: "85%", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", boxShadow: "0 2px 10px rgba(51,57,59,0.25)" },
  miniLap: { position: "fixed", bottom: 66, left: 0, right: 0, maxWidth: 560, margin: "0 auto", background: T.petrolDark, color: "#EDF0EC", border: "none", padding: "10px 16px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer", zIndex: 39, fontFamily: "inherit", borderRadius: "12px 12px 0 0" },
};
