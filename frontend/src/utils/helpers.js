/**
 * Utility functions
 */

export const uid = () => Math.random().toString(36).slice(2, 9);

// Varv is a single-timezone deployment (Europe/Stockholm) behind a firewall — dates and
// weekdays are computed explicitly in that zone rather than the device's local timezone,
// so "today" and recurring weekdays stay consistent no matter where the device thinks it is.
// UTC-only would drift the date at night (e.g. 01:00 CEST is still 23:00 the day before UTC);
// device-local would drift if the browser's timezone differs from Stockholm.
const STOCKHOLM_TZ = "Europe/Stockholm";
const WEEKDAY_MAP = { Sun: "sun", Mon: "mon", Tue: "tue", Wed: "wed", Thu: "thu", Fri: "fri", Sat: "sat" };

function stockholmParts(date) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: STOCKHOLM_TZ,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
    weekday: "short",
  });
  return Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
}

export const todayKey = (date = new Date()) => {
  const p = stockholmParts(date);
  return `${p.year}-${p.month}-${p.day}`;
};

export const todayWeekday = (date = new Date()) => WEEKDAY_MAP[stockholmParts(date).weekday] || "mon";

export const guessIcon = (title) => {
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

  const words = title.toLowerCase().split(/\s+/);
  const hit = ICON_KEYWORDS.find(([k]) => words.some((w) => w.startsWith(k)));
  return hit ? hit[1] : "📌";
};

export const energyColor = (e) => {
  const colors = {
    1: "#8A977F", // moss
    2: "#8A977F", // moss
    3: "#4C6E75", // petrol
    4: "#A66A4F", // warn
    5: "#A66A4F", // warn
  };
  return colors[e] || "#8A977F";
};

export const nowHM = (date = new Date()) => {
  const p = stockholmParts(date);
  const hour = p.hour === "24" ? "00" : p.hour; // some engines format midnight as "24" with hour12:false
  return `${hour}:${p.minute}`;
};

export const hmToMin = (hm) => {
  if (!hm) return null;
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
};

export const formatTime = (minutes) => {
  if (!minutes) return "";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
};