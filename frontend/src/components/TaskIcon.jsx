import React from "react";
import {
  IconPin, IconCart, IconPhone, IconMail, IconBroom, IconLaundry, IconCat,
  IconHealth, IconRun, IconBook, IconLaptop, IconPen, IconCard, IconCalendar,
  IconCooking, IconWrench, IconIdea,
  IconSpiral, IconLeaf, IconWave, IconFlame, IconStar, IconOwl, IconMoon,
} from "./icons.jsx";

/* Registret som knyter en sparad nyckel till en ikon. Nycklarna ligger i
 * task.icon och settings.avatarIcon och synkas till servern — lägg gärna till
 * nya, men byt aldrig namn på en befintlig utan att migrera data.
 *
 * `iconKey` normaliserar både en nyckel och ett legacy-emoji till en nyckel,
 * så gamla servernoder (📌 i task.icon, 🌀 i settings.avatarEmoji) fortfarande
 * renderas som rätt SVG. Den dagen all data är migrerad kan LEGACY_EMOJI
 * raderas. */
const TASK_ICONS = {
  pin: IconPin, cart: IconCart, phone: IconPhone, mail: IconMail,
  broom: IconBroom, laundry: IconLaundry, cat: IconCat, health: IconHealth,
  run: IconRun, book: IconBook, laptop: IconLaptop, pen: IconPen,
  card: IconCard, calendar: IconCalendar, cooking: IconCooking,
  wrench: IconWrench, idea: IconIdea,
};

const AVATAR_ICONS = {
  spiral: IconSpiral, leaf: IconLeaf, wave: IconWave, flame: IconFlame,
  star: IconStar, owl: IconOwl, cat: IconCat, moon: IconMoon,
};

/* Uppgifter som skapades innan ikonerna blev nycklar har fortfarande emoji
 * sparade — här och på servern. Kartan gör att de renderas som rätt ikon i
 * stället för att falla tillbaka på nålen. Den kan tas bort den dag all
 * data är migrerad. */
const LEGACY_EMOJI = {
  "📌": "pin", "🛒": "cart", "📞": "phone", "✉️": "mail", "✉": "mail",
  "🧹": "broom", "🧺": "laundry", "🐈": "cat", "🩺": "health", "🏃": "run",
  "📚": "book", "💻": "laptop", "✍️": "pen", "✍": "pen", "💳": "card",
  "🗓️": "calendar", "🗓": "calendar", "🍳": "cooking", "🔧": "wrench",
  "💡": "idea",
  "🌀": "spiral", "🌿": "leaf", "🌊": "wave", "🔥": "flame", "⭐": "star",
  "🦉": "owl", "🌙": "moon",
};

export const iconKey = (stored) => LEGACY_EMOJI[stored] || stored;

/* settings.avatarIcon är det nya fältet, settings.avatarEmoji det gamla. Båda
 * ska fortfarande fungera i läsning tills servern inte längre har rader med
 * avatarEmoji — då kan fallback-grenen tas bort. */
export const avatarIconKey = (settings) =>
  iconKey(settings?.avatarIcon || settings?.avatarEmoji) || "spiral";

export const TASK_ICON_KEYS = Object.keys(TASK_ICONS);
export const AVATAR_ICON_KEYS = Object.keys(AVATAR_ICONS);

export function TaskIcon({ name, size = 16, ...rest }) {
  const Glyph = TASK_ICONS[iconKey(name)] || IconPin;
  return <Glyph size={size} {...rest} />;
}

export function AvatarIcon({ name, size = 16, ...rest }) {
  const Glyph = AVATAR_ICONS[iconKey(name)] || IconSpiral;
  return <Glyph size={size} {...rest} />;
}
