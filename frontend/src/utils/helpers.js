/**
 * Utility functions
 */

export const uid = () => Math.random().toString(36).slice(2, 9);

export const todayKey = () => new Date().toISOString().slice(0, 10);

export const todayWeekday = () => ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][new Date().getDay()];

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

export const nowHM = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
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