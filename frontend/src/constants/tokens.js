/**
 * Design tokens and constants
 */

// Färgvärden lever som CSS-variabler i index.html (ljust/mörkt/system) — de här
// är bara namn som pekar dit, så useTheme() kan byta färgschema utan att röra
// någon av de hundratals inline style-referenserna till T.* i resten av appen.
export const T = {
  paper: "var(--paper)",
  card: "var(--card)",
  ink: "var(--ink)",
  soft: "var(--soft)",
  spruce: "var(--spruce)",
  petrol: "var(--petrol)",
  petrolDark: "var(--petrol-dark)",
  moss: "var(--moss)",
  track: "var(--track)",
  line: "var(--line)",
  warn: "var(--warn)",
  rest: "var(--rest)",
};

export const MODES = {
  steady: { label: "Stadig", budget: 20, blurb: "Normal kapacitet. Planera nästa halvdag." },
  low: { label: "Lågt batteri", budget: 12, blurb: "Sänkt kapacitet. Färre uppgifter, mer marginal." },
  recovery: { label: "Återhämtning", budget: 6, blurb: "Kraven ner. Bara nödvändigt, vila räknas som framsteg." },
};

export const ENERGY_LABELS = { 1: "lätt", 2: "mild", 3: "medel", 4: "tung", 5: "mycket tung" };

export const MOVEMENT_IDEAS = [
  "Gå till slutet av gatan och tillbaka",
  "20 långsamma knäböj vid skrivbordet",
  "Skaka loss armar och ben i en minut, sträck dig sedan lång",
  "Gå uppför en trappa två gånger",
  "Sätt på en låt och rör dig som det känns",
  "Stå upp, rulla axlarna, tio armhävningar mot väggen",
];

export const REST_MENU = [
  "Ligg ner någonstans dunkelt i tio minuter, ingen mobil",
  "Brusreducering på, ett välbekant album",
  "Tid med ett specialintresse, noll krav på resultat",
  "Varm dusch, sedan mjuka kläder",
  "Sitt med katten. Det är hela uppgiften",
  "Tyngdtäcke, fördragna gardiner, timer på 20 min",
];

export const EDU_CARDS = [
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

export const ICON_CHOICES = ["📌", "🛒", "📞", "✉️", "🧹", "🧺", "🐈", "🩺", "🏃", "📚", "💻", "✍️", "💳", "🗓️", "🍳", "🔧"];

export const WEEKDAYS = [
  { key: "mon", label: "Mån" }, { key: "tue", label: "Tis" }, { key: "wed", label: "Ons" },
  { key: "thu", label: "Tor" }, { key: "fri", label: "Fre" }, { key: "sat", label: "Lör" }, { key: "sun", label: "Sön" },
];

export const ICON_KEYWORDS = [
  ["handla", "🛒"], ["köp", "🛒"], ["buy", "🛒"], ["shop", "🛒"], ["grocer", "🛒"],
  ["ring", "📞"], ["call", "📞"], ["mail", "✉️"], ["mejl", "✉️"], ["email", "✉️"],
  ["clean", "🧹"], ["städ", "🧹"], ["tvätt", "🧺"], ["laundry", "🧺"],
  ["vet", "🐈"], ["katt", "🐈"], ["cat", "🐈"], ["läkar", "🩺"], ["doctor", "🩺"], ["vård", "🩺"],
  ["gym", "🏃"], ["träna", "🏃"], ["run", "🏃"], ["walk", "🏃"], ["promenad", "🏃"],
  ["read", "📚"], ["läs", "📚"], ["book", "📚"], ["code", "💻"], ["kod", "💻"], ["deploy", "💻"],
  ["write", "✍️"], ["skriv", "✍️"], ["cv", "✍️"], ["pay", "💳"], ["betal", "💳"], ["faktur", "💳"], ["invoice", "💳"],
  ["meeting", "🗓️"], ["möte", "🗓️"], ["cook", "🍳"], ["laga mat", "🍳"], ["fix", "🔧"], ["repair", "🔧"],
];

export const PRIORITY_ORDER = { A: 0, B: 1, C: 2 };

export const API_BASE = import.meta.env.VITE_API_BASE_URL || "https://varvet.tunn.dev";
export const AUTH_KEY = "varv-auth";