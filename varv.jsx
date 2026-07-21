import { useState, useEffect, useRef, useMemo } from "react";

/* ============================================================
   VARV — an AuDHD day companion
   Design tokens:
   paper #F2F1EC · ink #33393B · spruce #46564F · petrol #4C6E75
   moss #8A977F · track #DFDED6 · card #FAF9F5 · warn #A66A4F
   Type: Fraunces (display) · Atkinson Hyperlegible (body) · IBM Plex Mono (data)
   Signature: the energy dial — a chronograph-style subdial that
   shows today's remaining capacity as an arc with tick marks.
   ============================================================ */

const T = {
  paper: "#F2F1EC",
  card: "#FAF9F5",
  ink: "#33393B",
  soft: "#6C7370",
  spruce: "#46564F",
  petrol: "#4C6E75",
  petrolDark: "#3D5960",
  moss: "#8A977F",
  track: "#DFDED6",
  line: "#E4E2DA",
  warn: "#A66A4F",
  rest: "#EFEDE4",
};

const MODES = {
  steady: { label: "Stadig", budget: 20, blurb: "Normal kapacitet. Planera nästa halvdag." },
  low: { label: "Lågt batteri", budget: 12, blurb: "Sänkt kapacitet. Färre uppgifter, mer marginal." },
  recovery: { label: "Återhämtning", budget: 6, blurb: "Kraven ner. Bara nödvändigt, vila räknas som framsteg." },
};

const ENERGY_LABELS = { 1: "lätt", 2: "mild", 3: "medel", 4: "tung", 5: "mycket tung" };

const MOVEMENT_IDEAS = [
  "Gå till slutet av gatan och tillbaka",
  "20 långsamma knäböj vid skrivbordet",
  "Skaka loss armar och ben i en minut, sträck dig sedan lång",
  "Gå uppför en trappa två gånger",
  "Sätt på en låt och rör dig som det känns",
  "Stå upp, rulla axlarna, tio armhävningar mot väggen",
];

const REST_MENU = [
  "Ligg ner någonstans dunkelt i tio minuter, ingen mobil",
  "Brusreducering på, ett välbekant album",
  "Tid med ett specialintresse, noll krav på resultat",
  "Varm dusch, sedan mjuka kläder",
  "Sitt med katten. Det är hela uppgiften",
  "Tyngdtäcke, fördragna gardiner, timer på 20 min",
];

const EDU_CARDS = [
  { t: "Varför om-så-triggers", b: "Implementeringsintentioner — 'när X gör jag Y' — visar medelstor till stor effekt på genomförande i hundratals studier. Planen utlöses av signalen, så starten hänger inte längre på viljestyrka i stunden." },
  { t: "Varför pyttesmå första steg", b: "Igångsättningen fallerar på vaga uppgifter, inte svåra. En konkret fysisk handling under 10 minuter kringgår frysningen. Det är mekanismen bakom varje nedbrytningsverktyg." },
  { t: "Varför energibudgeten", b: "Utmattning byggs när uttag (sensorisk last, maskering, admin) tyst överstiger insättningar (vila, intressen, rörelse) i veckor. Poängen är att göra bokföringen synlig — du kan inte budgetera det du inte ser." },
  { t: "Varför rörelsepauser", b: "Metaanalyser visar att redan 5 minuters rörelse mätbart förbättrar impulskontroll och uppmärksamhet vid ADHD. Intensiteten spelar knappt roll — skiftet gör det." },
  { t: "Varför tidskalibrering", b: "Tidsblindhet gör att tidsuppskattningar systematiskt blir för korta. Att jämföra gissning mot faktisk tid över veckor bygger externt den kalibrering som den inre klockan inte ger." },
  { t: "Varför parkera distraktioner", b: "Att skriva ner en förströdd tanke mitt i fokus — 'distractibility delay' från validerade KBT-protokoll — hedrar tanken utan att följa den. Den ligger i inkorgen efter varvet." },
  { t: "Varför inga streaks", b: "Skam sänker motivationen ytterligare, inte mindre — ett återkommande KBT-fynd. Att varje dag börjar på noll är ett designbeslut, inte en saknad funktion." },
  { t: "Varför fast väckningstid", b: "I KBT-I, guldstandarden mot sömnbesvär, är konsekvent väckningstid den starkaste enskilda spaken. Den förankrar hela dygnsrytmen, som allt annat lutar sig mot." },
  { t: "Varför para uppgifter med belöning", b: "Temptation bundling — en spellista eller podd du bara tillåter dig under en tråkig uppgift — höjde gymnärvaro i kontrollerade studier. ADHD-motivation följer intresse, inte vikt; låna intresset." },
  { t: "Varför listor slår minnet", b: "Prospektivt minne — att komma ihåg att komma ihåg — är precis det ADHD-arbetsminnet tappar. Om det är viktigt bor det på en lista inom tre sekunder från tanken. Att bocka av ger dessutom belöningsloopen en takt." },
];

const uid = () => Math.random().toString(36).slice(2, 9);
const todayKey = () => new Date().toISOString().slice(0, 10);

const ICON_CHOICES = ["📌", "🛒", "📞", "✉️", "🧹", "🧺", "🐈", "🩺", "🏃", "📚", "💻", "✍️", "💳", "🗓️", "🍳", "🔧"];
const ICON_KEYWORDS = [
  ["handla", "🛒"], ["köp", "🛒"], ["buy", "🛒"], ["shop", "🛒"], ["grocer", "🛒"],
  ["ring", "📞"], ["call", "📞"], ["mail", "✉️"], ["mejl", "✉️"], ["email", "✉️"],
  ["clean", "🧹"], ["städ", "🧹"], ["tvätt", "🧺"], ["laundry", "🧺"],
  ["vet", "🐈"], ["katt", "🐈"], ["cat", "🐈"], ["läkar", "🩺"], ["doctor", "🩺"], ["vård", "🩺"],
  ["gym", "🏃"], ["träna", "🏃"], ["run", "🏃"], ["walk", "🏃"], ["promenad", "🏃"],
  ["read", "📚"], ["läs", "📚"], ["book", "📚"], ["code", "💻"], ["kod", "💻"], ["deploy", "💻"],
  ["write", "✍️"], ["skriv", "✍️"], ["cv", "✍️"], ["pay", "💳"], ["betal", "💳"], ["faktur", "💳"], ["invoice", "💳"],
  ["meeting", "🗓️"], ["möte", "🗓️"], ["cook", "🍳"], ["laga mat", "🍳"], ["fix", "🔧"], ["repair", "🔧"],
];
const guessIcon = (title) => {
  const words = title.toLowerCase().split(/\s+/);
  const hit = ICON_KEYWORDS.find(([k]) => words.some((w) => w.startsWith(k)));
  return hit ? hit[1] : "📌";
};
const energyColor = (e) => (e <= 2 ? T.moss : e === 3 ? T.petrol : T.warn);

async function aiBreakdown(title) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      messages: [
        {
          role: "user",
          content: `Bryt ner denna uppgift i 3–6 pyttesmå konkreta steg i jag-form, på svenska, för någon med ADHD/autism som fryser vid vaga uppgifter. Varje steg under 10 minuter, börja med den allra första fysiska handlingen. Uppgift: "${title}". Svara ENDAST med JSON, inga markdown-staket, i formen: {"steps":[{"title":"...","minutes":5}]}`,
        },
      ],
    }),
  });
  const data = await response.json();
  const text = data.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
  const cleaned = text.replace(/```json|```/g, "").trim();
  const m = cleaned.match(/\{[\s\S]*\}/);
  const parsed = JSON.parse(m ? m[0] : cleaned);
  return parsed.steps.map((st) => ({ id: uid(), title: st.title, minutes: st.minutes, done: false }));
}
async function aiRefineIdea(raw) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      messages: [
        {
          role: "user",
          content: `Du får en snabbt intalad eller nedskriven idé på svenska eller engelska, ofta ostrukturerad med utfyllnadsord. Gör den till en tydlig anteckning: behåll personens röst, mening och alla sakuppgifter, men ta bort utfyllnad, upprepningar och falska starter. Svara på samma språk som idén. Svara ENDAST med JSON, inga markdown-staket: {"title":"kort titel, max 6 ord","note":"städad version i 1–3 meningar","tags":["max","tre","taggar"]}. Idé: "${raw.replace(/"/g, "'")}"`,
        },
      ],
    }),
  });
  const data = await response.json();
  const text = data.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
  const cleaned = text.replace(/```json|```/g, "").trim();
  const m = cleaned.match(/\{[\s\S]*\}/);
  return JSON.parse(m ? m[0] : cleaned);
}

async function aiClassify(raw) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      messages: [
        {
          role: "user",
          content: `Du är en klassificeringsagent för snabbt infångade tankar (svenska eller engelska, ofta taligenkända och ostrukturerade). Avgör vilken sort tanken är:
- "task": något som ska GÖRAS (ringa, boka, skicka, fixa, betala, svara)
- "shopping": något som ska KÖPAS (vara, ingrediens, sak)
- "idea": en tanke, insikt, projektidé eller något att minnas som inte är en direkt handling
Svara ENDAST med JSON, inga markdown-staket:
{"type":"task"|"idea"|"shopping","title":"kort städad titel max 8 ord, samma språk som tanken","note":"för idea: städad version i 1–2 meningar, annars null","tags":["1-3 korta taggar på svenska, gemener"],"energy":1-5 eller null,"time":"HH:MM" eller null}
energy: uppskattad energikostnad om task (1 lätt – 5 mycket tung). time: endast om ett klockslag nämns uttryckligen. Tanke: "${raw.replace(/"/g, "'")}"`,
        },
      ],
    }),
  });
  const data = await response.json();
  const text = data.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
  const cleaned = text.replace(/```json|```/g, "").trim();
  const m = cleaned.match(/\{[\s\S]*\}/);
  return JSON.parse(m ? m[0] : cleaned);
}

const MCP = {
  gmail: { type: "url", url: "https://gmailmcp.googleapis.com/mcp/v1", name: "gmail" },
  gcal: { type: "url", url: "https://calendarmcp.googleapis.com/mcp/v1", name: "google-calendar" },
  notion: { type: "url", url: "https://mcp.notion.com/mcp", name: "notion" },
};

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

async function callClaudeMcp(prompt, servers) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }],
      mcp_servers: servers,
    }),
  });
  const data = await response.json();
  const text = data.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");
  const cleaned = text.replace(/```json|```/g, "").trim();
  const m = cleaned.match(/\{[\s\S]*\}/);
  return JSON.parse(m ? m[0] : cleaned);
}

const nowHM = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
const hmToMin = (hm) => {
  if (!hm) return null;
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
};

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
  agents: { classify: true, refine: true, sync: true, breakdown: true },
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

const PRIORITY_ORDER = { A: 0, B: 1, C: 2 };

export default function Varv() {
  const [state, setState] = useState(DEFAULT_STATE);
  const [loaded, setLoaded] = useState(false);
  const [tool, setTool] = useState(null); // 'focus' | 'move' | 'checkin' | 'wins' | 'sleep'
  const [showAdd, setShowAdd] = useState(false);
  const [lapRunning, setLapRunning] = useState(false);
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

  /* ---------- load / save ---------- */
  useEffect(() => {
    (async () => {
      try {
        const r = await window.storage.get("varv-state");
        if (r && r.value) {
          const s = JSON.parse(r.value);
          if (s.day !== todayKey()) {
            s.day = todayKey();
            const cutoff = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
            const medCutoff = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
            s.energyLog = (s.energyLog || []).filter((e) => e.day >= cutoff);
            s.meds = (s.meds || []).filter((m) => m.day >= medCutoff);
            s.tagLog = (s.tagLog || []).filter((t) => t.day >= medCutoff);
            s.tasks = (s.tasks || []).filter((t) => !t.done);
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
    })();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        const { _selIdea, ...persist } = state; // transienta UI-nycklar sparas inte
        await window.storage.set("varv-state", JSON.stringify(persist));
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

  const visibleTasks = useMemo(() => {
    let open = state.tasks.filter((t) => !t.done);
    if (state.capacity === "recovery") open = open.filter((t) => t.essential);
    return [...open].sort((a, b) => {
      const pa = a.priority ? PRIORITY_ORDER[a.priority] : 3;
      const pb = b.priority ? PRIORITY_ORDER[b.priority] : 3;
      return pa - pb;
    });
  }, [state.tasks, state.capacity]);

  const medToday = state.meds.find((m) => m.day === todayKey());
  const lapDoneToday = state.morningLapDay === todayKey();
  const pastWinddown = hmToMin(nowHM()) >= hmToMin(state.settings?.winddown || "22:00");

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
    setState((s) => ({ ...s, wins: [{ id: uid(), text, ts: Date.now() }, ...s.wins].slice(0, 200) }));
    setToast(text);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  };

  const logEnergy = (delta, label) =>
    setState((s) => ({ ...s, energyLog: [...s.energyLog, { delta, label, day: todayKey() }] }));

  const completeTask = (task) => {
    if (task.done) return;
    setState((s) => ({
      ...s,
      tasks: s.tasks.map((t) => (t.id === task.id ? { ...t, done: true } : t)),
    }));
    logEnergy(task.energy, task.title);
    addWin(`Klart: ${task.title}`);
  };

  const updateTask = (id, p) =>
    setState((s) => ({ ...s, tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...p } : t)) }));

  const removeTask = (id) => setState((s) => ({ ...s, tasks: s.tasks.filter((t) => t.id !== id) }));

  /* ---------- Google-synk via MCP ---------- */
  const syncCalendar = async () => {
    setCalBusy(true);
    setSyncErr("");
    let status = "ok";
    try {
      const res = await callClaudeMcp(
        `Använd Google Calendar-verktygen för att hämta alla mina händelser idag (${todayKey()}). Svara sedan ENDAST med JSON, inga andra ord, i formen: {"events":[{"title":"...","start":"HH:MM","end":"HH:MM"}]}. Använd 24-timmarsformat i min lokala tidszon. Hoppa över heldagshändelser.`,
        [MCP.gcal]
      );
      setState((st) => ({ ...st, gcal: { day: todayKey(), events: (res.events || []).slice(0, 20) } }));
    } catch (e) {
      setSyncErr("Kalenderhämtningen misslyckades — testa igen om en stund.");
      status = "fail";
    }
    setCalBusy(false);
    return status;
  };

  const checkGmail = async () => {
    setMailBusy(true);
    setSyncErr("");
    let status = "ok";
    try {
      const res = await callClaudeMcp(
        `Använd Gmail-verktygen för att titta på mina olästa mejl från de senaste 2 dagarna. Identifiera max 5 som kräver en handling av mig (svara, boka, betala, skicka något). Formulera varje som en kort uppgift på svenska i jag-form, t.ex. "Svara Josefin om Geely-rollen". Svara sedan ENDAST med JSON, inga andra ord: {"suggestions":[{"title":"...","from":"avsändare","subject":"ämnesrad"}]}. Om inget kräver handling: {"suggestions":[]}.`,
        [MCP.gmail]
      );
      setState((st) => {
        const dismissed = st.mailSug.day === todayKey() ? st.mailSug.dismissed || [] : [];
        const items = (res.suggestions || [])
          .filter((x) => !dismissed.includes(`${x.from}|${x.subject}`))
          .slice(0, 5)
          .map((x) => ({ ...x, id: uid() }));
        return { ...st, mailSug: { day: todayKey(), items, dismissed } };
      });
    } catch (e) {
      setSyncErr("Mejlkollen misslyckades — testa igen om en stund.");
      status = "fail";
    }
    setMailBusy(false);
    return status;
  };

  const pushTaskToCalendar = async (task) => {
    const res = await callClaudeMcp(
      `Använd Google Calendar-verktygen för att skapa en händelse i min primära kalender idag (${todayKey()}) kl ${task.time}, längd 30 minuter, med titeln "${task.title}". Svara sedan ENDAST med JSON: {"ok":true}`,
      [MCP.gcal]
    );
    if (!res.ok) throw new Error("no ok");
    updateTask(task.id, { synced: true });
    addWin(`I kalendern: ${task.title}`);
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
    const spentY = yLog.filter((e) => e.delta > 0).reduce((a, e) => a + e.delta, 0);
    const rechY = yLog.filter((e) => e.delta < 0).reduce((a, e) => a - e.delta, 0);
    const winLines = yWins.slice(0, 10).map((w) => w.text).join("; ");
    try {
      const res = await callClaudeMcp(
        `Använd Notion-verktygen. Hitta en sida med titeln "Varv – logg" (skapa den om den inte finns). Lägg till ett nytt stycke längst ner med exakt denna text: "${yesterday} · ${yWins.length} vinster · ${spentY}⚡ förbrukat · ${rechY}⚡ återladdat · ${winLines}". Svara sedan ENDAST med JSON: {"ok":true}`,
        [MCP.notion]
      );
      if (!res.ok) return "fail";
      setState((st) => ({ ...st, notionArchivedDay: todayKey() }));
      return "ok";
    } catch (e) {
      return "fail";
    }
  };

  /* ---------- agentlogg ---------- */
  const logAgent = (agent, text) =>
    setState((st) => ({ ...st, agentLog: [{ ts: Date.now(), agent, text }, ...st.agentLog].slice(0, 30) }));

  /* ---------- idéer: spara direkt, förfina i bakgrunden ---------- */
  const refineIdea = async (id, raw) => {
    setState((st) => ({ ...st, ideas: st.ideas.map((i) => (i.id === id ? { ...i, status: "refining", attempts: (i.attempts || 0) + 1 } : i)) }));
    try {
      const r = await aiRefineIdea(raw);
      setState((st) => ({
        ...st,
        ideas: st.ideas.map((i) => (i.id === id ? { ...i, title: r.title, note: r.note, tags: (r.tags || []).slice(0, 3), status: "klar" } : i)),
      }));
      logAgent("Förfinaren", `städade "${(r.title || raw).slice(0, 40)}"`);
    } catch (e) {
      setState((st) => ({ ...st, ideas: st.ideas.map((i) => (i.id === id ? { ...i, status: "fail" } : i)) }));
    }
  };

  const addIdea = (raw) => {
    const id = uid();
    setState((st) => ({
      ...st,
      ideas: [{ id, raw, title: null, note: null, tags: [], ts: Date.now(), status: "refining" }, ...st.ideas].slice(0, 100),
    }));
    setToast(`💡 Sparad — förfinas i bakgrunden`);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
    refineIdea(id, raw); // fire-and-forget: fångsten väntar aldrig på AI
  };

  const ideaToTask = (idea) => {
    const title = idea.title || idea.raw.slice(0, 60);
    setState((st) => ({
      ...st,
      tasks: [...st.tasks, { id: uid(), title, icon: "💡", trigger: "", energy: 2, time: "", essential: false, steps: [], done: false, minutes: 30, priority: null, inbox: true }],
    }));
    addWin(`Idé → uppgift: ${title}`);
  };

  const removeIdea = (id) => setState((st) => ({ ...st, ideas: st.ideas.filter((i) => i.id !== id) }));

  /* ---------- auto-klassificering: agenten sorterar när du inte väljer ---------- */
  const logTags = (tags) =>
    setState((st) => ({ ...st, tagLog: [...st.tagLog, ...(tags || []).map((tag) => ({ day: todayKey(), tag }))] }));

  const autoCapture = async (raw) => {
    if (!stateRef.current.agents.classify) { addIdea(raw); return; } // agent av → allt landar som idé
    setToast("🤖 sorterar…");
    clearTimeout(toastTimer.current);
    try {
      const c = await aiClassify(raw);
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
        setState((st) => ({
          ...st,
          tasks: [...st.tasks, { id: uid(), title: c.title || raw, icon: guessIcon(c.title || raw), trigger: "", energy: c.energy || 2, time: c.time || "", essential: false, steps: [], done: false, minutes: 30, priority: null, inbox: true, tags }],
        }));
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
    } catch (e) {
      // felsäkert: ingenting får försvinna — landa som rå idé
      setState((st) => ({
        ...st,
        ideas: [{ id: uid(), raw, title: null, note: null, tags: [], ts: Date.now(), status: "raw" }, ...st.ideas].slice(0, 100),
      }));
      setToast("Sorteringen misslyckades — sparad som rå idé");
    }
    toastTimer.current = setTimeout(() => setToast(null), 3000);
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
    const ouraStatus = await syncOura();
    setState((st) => ({ ...st, sync: { ...st.sync, oura: ouraStatus } }));
    const calStatus = await syncCalendar();
    setState((st) => ({ ...st, sync: { ...st.sync, cal: calStatus } }));
    const mailStatus = await checkGmail();
    setState((st) => ({ ...st, sync: { ...st.sync, mail: mailStatus } }));
    const notionStatus = stateRef.current.notionArchivedDay === todayKey() ? "ok" : await archiveToNotion();
    setState((st) => ({ ...st, sync: { ...st.sync, notion: notionStatus } }));
    logAgent("Synkaren", `körning klar: kalender ${calStatus}, mejl ${mailStatus}, oura ${ouraStatus}, notion ${notionStatus}`);
    syncingRef.current = false;
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
        </header>

        {/* ============ wind-down banner ============ */}
        {pastWinddown && (
          <div style={s.winddownBanner}>
            Nedvarvning. Skärmarna dämpas, kraven sänks — imorgon börjar {state.settings.wake}.
          </div>
        )}

        {view === "today" && (
          <>
        {/* ============ hero: state of the day ============ */}
        <section style={s.hero}>
          <div style={{ display: "grid", placeItems: "center" }}>
            <EnergyDial budget={mode.budget} remaining={remaining} />
          </div>
          <div style={s.modeRow}>
            {Object.entries(MODES).map(([k, m]) => (
              <button
                key={k}
                onClick={() => patch({ capacity: k, capacityBy: { day: todayKey(), by: "user" } })}
                style={{
                  ...s.modeBtn,
                  background: state.capacity === k ? T.spruce : "transparent",
                  color: state.capacity === k ? T.card : T.spruce,
                  borderColor: T.spruce,
                }}
              >
                {m.label}
              </button>
            ))}
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
                    setState((st) => ({
                      ...st,
                      tasks: [...st.tasks, { id: uid(), title: m.title, icon: "✉️", trigger: "", energy: 2, time: "", essential: false, steps: [], done: false, minutes: 30, priority: null, inbox: true }],
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

        {/* ============ tasks ============ */}
        <section style={s.section}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <div style={s.eyebrow}>Uppgifter</div>
            <button style={s.linkBtn} onClick={() => setShowAdd((v) => !v)}>
              {showAdd ? "stäng" : "+ lägg till"}
            </button>
          </div>

          {showAdd && (
            <AddTask
              onAdd={(t) => {
                setState((st) => ({ ...st, tasks: [...st.tasks, t] }));
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
            <TaskCard
              key={t.id}
              task={t}
              onDone={() => completeTask(t)}
              onUpdate={(p) => updateTask(t.id, p)}
              onRemove={() => removeTask(t.id)}
              onWin={addWin}
              onPushCal={pushTaskToCalendar}
            />
          ))}
        </section>
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
              />
            )}
            {ideaMode === "list" && state.ideas.map((idea) => (
              <IdeaCard
                key={idea.id}
                idea={idea}
                onRefine={() => refineIdea(idea.id, idea.raw)}
                onToTask={() => ideaToTask(idea)}
                onRemove={() => removeIdea(idea.id)}
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
            <ToolBtn active={tool === "agents"} onClick={() => setTool(tool === "agents" ? null : "agents")} label="Agenter" sub={`${Object.values(state.agents).filter(Boolean).length}/4 aktiva`} />
          </div>

          {tool === "agents" && (
            <div style={{ ...s.card, marginTop: 10 }}>
              {[
                ["classify", "Sorteraren", "Klassar varje fångst som uppgift, idé eller inköp och sätter taggar. Av = allt landar som rå idé."],
                ["refine", "Förfinaren", "Städar råa idéer i bakgrunden till titel + anteckning. Plockar upp misslyckade, max 3 försök."],
                ["sync", "Synkaren", "Hämtar kalender, mejl och Oura var 3:e timme och arkiverar gårdagen till Notion."],
                ["breakdown", "Nedbrytaren", "Förbereder första steg för A-prioriterade och tunga uppgifter innan du fastnar. Max 3 per dag."],
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
            onPark={(text) =>
              setState((st) => ({
                ...st,
                tasks: [...st.tasks, { id: uid(), title: text, icon: guessIcon(text), trigger: "", energy: 2, time: "", essential: false, steps: [], done: false, minutes: 30, priority: null, inbox: true }],
              }))
            }
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
          onTask={(title) => {
            setState((st) => ({
              ...st,
              tasks: [...st.tasks, { id: uid(), title, icon: guessIcon(title), trigger: "", energy: 2, time: "", essential: false, steps: [], done: false, minutes: 30, priority: null, inbox: true }],
            }));
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
    </div>
  );
}

/* ============================================================ */
/* Capture sheet — the 3-second window                           */
/* ============================================================ */
function CaptureSheet({ onClose, onTask, onListItem, onIdea, onAuto, voiceLang, onLangChange }) {
  const [v, setV] = useState("");
  const [rec, setRec] = useState(false);
  const [vErr, setVErr] = useState("");
  const ref = useRef(null);
  const recRef = useRef(null);
  const s = styles;
  useEffect(() => { ref.current && ref.current.focus(); }, []);
  useEffect(() => () => { try { recRef.current && recRef.current.stop(); } catch (e) {} }, []);

  const task = () => { if (v.trim()) { onTask(v.trim()); setV(""); ref.current && ref.current.focus(); } };
  const listItem = () => { if (v.trim()) { onListItem(v.trim()); setV(""); ref.current && ref.current.focus(); } };
  const idea = () => { if (v.trim()) { onIdea(v.trim()); setV(""); ref.current && ref.current.focus(); } };
  const auto = () => { if (v.trim()) { onAuto(v.trim()); setV(""); ref.current && ref.current.focus(); } };

  const startVoice = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setVErr("Röstigenkänning stöds inte i den här webbläsaren — skriv istället."); return; }
    const r = new SR();
    r.lang = voiceLang;
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e) => {
      let t = "";
      for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript;
      setV(t.trim());
    };
    r.onerror = (e) => {
      setVErr(e.error === "not-allowed"
        ? "Mikrofonen blockeras i den här miljön — skriv istället, eller kör appen i webbläsaren."
        : "Rösten föll bort — testa igen.");
      setRec(false);
    };
    r.onend = () => setRec(false);
    recRef.current = r;
    setVErr("");
    r.start();
    setRec(true);
  };
  const stopVoice = () => { try { recRef.current && recRef.current.stop(); } catch (e) {} setRec(false); };

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
            style={{ ...s.micBtn, background: rec ? T.warn : T.petrol }}
            onClick={rec ? stopVoice : startVoice}
            aria-label={rec ? "Sluta lyssna" : "Tala in"}
          >
            {rec ? "■" : "🎙"}
          </button>
        </div>
        {rec && <div style={{ fontSize: 12, color: T.warn, textAlign: "center", marginTop: 6 }}>● lyssnar — tala fritt, tryck ■ när du är klar</div>}
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
          Enter = agenten sorterar åt dig. Knapparna styr själv. Arket stannar öppet — rabbla flera.
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
/* Add task — trigger, energy, time, essential                   */
/* ============================================================ */
function AddTask({ onAdd }) {
  const [title, setTitle] = useState("");
  const [trigger, setTrigger] = useState("");
  const [energy, setEnergy] = useState(2);
  const [time, setTime] = useState("");
  const [essential, setEssential] = useState(false);
  const [icon, setIcon] = useState(null);
  const [pickIcon, setPickIcon] = useState(false);
  const s = styles;
  const shownIcon = icon || guessIcon(title || " ");
  return (
    <div style={{ ...s.card, marginTop: 10 }}>
      <input style={s.input} placeholder="Vad behöver göras?" value={title} onChange={(e) => setTitle(e.target.value)} />
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
      <button
        style={{ ...s.primaryBtn, marginTop: 12, opacity: title.trim() ? 1 : 0.5 }}
        disabled={!title.trim()}
        onClick={() =>
          onAdd({ id: uid(), title: title.trim(), icon: shownIcon, trigger: trigger.trim(), energy, time, essential, steps: [], done: false, minutes: 30, priority: null, inbox: false })
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
function TaskCard({ task, onDone, onUpdate, onRemove, onWin, onPushCal }) {
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
              {task.time ? `${task.time} · ` : ""}{task.energy}⚡{stepsLeft > 0 ? ` · ${stepsLeft} steg kvar` : ""}{expanded ? "" : " · tryck för mer"}
            </span>
          </span>
        </button>
        <button style={s.doneBtn} onClick={onDone} aria-label="Markera klar">✓</button>
      </div>

      {/* expanded details */}
      {expanded && (
        <>
          {(task.trigger || task.essential || (task.tags || []).length > 0) && (
            <div style={s.metaRow}>
              {task.trigger && <span style={s.chipSoft}>när {task.trigger}</span>}
              {task.essential && <span style={s.chipSoft}>nödvändig</span>}
              {(task.tags || []).map((tg) => <span key={tg} style={s.chipSoft}>#{tg}</span>)}
            </div>
          )}

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
          <div style={{ display: "flex", gap: 8 }}>
            <input
              ref={entryRef}
              style={s.captureInput}
              placeholder={`Lägg till i ${l.name} — enter, nästa, enter, nästa…`}
              value={entry}
              onChange={(e) => setEntry(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addItem(l.id)}
            />
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
/* Idékort — rå direkt, förfinad när AI:n hunnit                 */
/* ============================================================ */
function IdeaCard({ idea, onRefine, onToTask, onRemove }) {
  const [showRaw, setShowRaw] = useState(false);
  const s = styles;
  const refined = idea.status === "klar" && idea.title;
  return (
    <div style={{ ...s.card, marginTop: 10 }}>
      {refined ? (
        <>
          <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 500, fontSize: 19 }}>{idea.title}</div>
          <p style={{ ...s.body, color: T.ink, fontSize: 14 }}>{idea.note}</p>
          {idea.tags.length > 0 && (
            <div style={s.metaRow}>
              {idea.tags.map((t) => <span key={t} style={s.chipSoft}>#{t}</span>)}
            </div>
          )}
        </>
      ) : (
        <>
          <p style={{ ...s.body, color: T.ink, marginTop: 0 }}>{idea.raw}</p>
          {idea.status === "refining" && <div style={{ fontSize: 12, color: T.soft, marginTop: 6 }}>✨ förfinas…</div>}
          {idea.status === "fail" && <div style={{ fontSize: 12, color: T.warn, marginTop: 6 }}>förfiningen misslyckades</div>}
        </>
      )}
      <div style={{ display: "flex", gap: 12, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
        <button style={s.linkBtn} onClick={onToTask}>→ uppgift</button>
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
