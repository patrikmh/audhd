import React from "react";

/* Varv-ikoner för appens egen krom — knappar, menyrader, statusrader.
 *
 * Alla ritas i currentColor och ärver storlek från `size`, så de följer
 * texten de sitter i och fungerar i både ljust och mörkt läge utan
 * egna färgvärden. Samma linjetjocklek och rundade ändar överallt, så
 * uppsättningen läser som en familj.
 *
 * Emoji som *användaren* har valt (uppgiftsikoner, avatar) är inte krom
 * och ska fortsätta vara emoji — byt aldrig ut dem mot de här.
 *
 * Ikonerna är dekorativa: de sitter alltid bredvid en text eller en
 * aria-label, därför aria-hidden.
 */
function Icon({ size = 16, children, ...rest }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      // inline-block + baslinjejustering så ikonen kan sitta mitt i en textrad;
      // i en flex-container ignoreras det ändå.
      style={{ flexShrink: 0, display: "inline-block", verticalAlign: "-0.125em" }}
      {...rest}
    >
      {children}
    </svg>
  );
}

export const IconTrash = (p) => (
  <Icon {...p}>
    <path d="M4 7h16M10 7V5h4v2M6 7l1 12h10l1-12" />
  </Icon>
);

export const IconCalendar = (p) => (
  <Icon {...p}>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </Icon>
);

export const IconMic = (p) => (
  <Icon {...p}>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
  </Icon>
);

export const IconStop = (p) => (
  <Icon {...p}>
    <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none" />
  </Icon>
);

export const IconIdea = (p) => (
  <Icon {...p}>
    <path d="M9 18h6M10 21h4" />
    <path d="M12 3a6 6 0 0 0-3.5 10.9c.3.2.5.6.5 1V16h6v-1.1c0-.4.2-.8.5-1A6 6 0 0 0 12 3Z" />
  </Icon>
);

export const IconSparkle = (p) => (
  <Icon {...p}>
    <path d="M12 3.5 13.6 9 19 10.5 13.6 12 12 17.5 10.4 12 5 10.5 10.4 9 12 3.5Z" />
    <path d="M18.5 16.5 19.2 19 21.5 19.7 19.2 20.4 18.5 22.8 17.8 20.4 15.5 19.7 17.8 19 18.5 16.5Z" />
  </Icon>
);

export const IconImage = (p) => (
  <Icon {...p}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <circle cx="8.5" cy="10" r="1.5" />
    <path d="m4 17 4.5-4.5a2 2 0 0 1 2.8 0L16 17M14.5 15.5l1.7-1.7a2 2 0 0 1 2.8 0L21 16" />
  </Icon>
);

/* Varv-motivet: ett varv som sluts, med ett hack där nästa börjar. */
export const IconLoop = (p) => (
  <Icon {...p}>
    <path d="M20 12a8 8 0 1 1-3.2-6.4" />
    <path d="M20 4v4.5h-4.5" />
  </Icon>
);

export const IconAgent = (p) => (
  <Icon {...p}>
    <rect x="4" y="8" width="16" height="11" rx="3" />
    <path d="M12 4v4M9 13v1.5M15 13v1.5" />
  </Icon>
);

export const IconBolt = (p) => (
  <Icon {...p}>
    <path d="M13 3 5.5 13.5H11L10 21l7.5-10.5H12L13 3Z" />
  </Icon>
);

export const IconCheck = (p) => (
  <Icon {...p}>
    <path d="m5 12.5 4.5 4.5L19 7" />
  </Icon>
);

export const IconClose = (p) => (
  <Icon {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Icon>
);

export const IconPencil = (p) => (
  <Icon {...p}>
    <path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17v3Z" />
    <path d="m14.5 6.5 3 3" />
  </Icon>
);

export const IconUndo = (p) => (
  <Icon {...p}>
    <path d="M4 9h11a5 5 0 0 1 0 10h-6" />
    <path d="M8 5 4 9l4 4" />
  </Icon>
);

export const IconDot = (p) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none" />
  </Icon>
);

/* ============================================================
   Uppgiftsikoner och avatarer.

   Till skillnad från kromikonerna ovan är de här *valbara* — de sparas
   som en nyckel på uppgiften (task.icon) respektive i inställningarna
   (settings.avatarIcon) och synkas till servern. Nycklar, inte emoji:
   en nyckel renderas likadant på alla plattformar och kan bytas ut utan
   att data migreras.
   ============================================================ */

export const IconPin = (p) => (
  <Icon {...p}>
    <path d="M12 21v-7M8.5 3h7l-1 7 3 2.5v1.5H6.5V12.5l3-2.5-1-7Z" />
  </Icon>
);

export const IconCart = (p) => (
  <Icon {...p}>
    <path d="M3 4h2.2l2.3 11h9.6l2.1-8H6.2" />
    <circle cx="9" cy="19" r="1.4" />
    <circle cx="17" cy="19" r="1.4" />
  </Icon>
);

export const IconPhone = (p) => (
  <Icon {...p}>
    <path d="M7 3h3l1.5 4-2 1.5a12 12 0 0 0 6 6L17 12.5 21 14v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 5 5.2 2 2 0 0 1 7 3Z" />
  </Icon>
);

export const IconMail = (p) => (
  <Icon {...p}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="m3.5 7 8.5 6 8.5-6" />
  </Icon>
);

export const IconBroom = (p) => (
  <Icon {...p}>
    <path d="M17 3 10 10M9 9l6 6-6.5 4L5 15.5 9 9Z" />
    <path d="m7 12.5 4.5 4.5" />
  </Icon>
);

export const IconLaundry = (p) => (
  <Icon {...p}>
    <rect x="4" y="3" width="16" height="18" rx="2" />
    <circle cx="12" cy="13" r="4.5" />
    <path d="M7 6.5h2" />
  </Icon>
);

export const IconCat = (p) => (
  <Icon {...p}>
    <path d="M5 10 4.5 4.5 8.5 7h7l4-2.5L19 10v5a5 5 0 0 1-5 5h-4a5 5 0 0 1-5-5v-5Z" />
    <path d="M9.5 12.5h.01M14.5 12.5h.01M12 15v1.5" />
  </Icon>
);

export const IconHealth = (p) => (
  <Icon {...p}>
    <path d="M3 12h3.5l2-5 3 10 2.5-5H21" />
  </Icon>
);

export const IconRun = (p) => (
  <Icon {...p}>
    <circle cx="14.5" cy="4.5" r="1.8" />
    <path d="m9 21 2.5-5.5L9 12l1-5 4 2 2.5 3H20M10 7 6 8.5 4.5 12" />
  </Icon>
);

export const IconBook = (p) => (
  <Icon {...p}>
    <path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H19v15H5.5A1.5 1.5 0 0 0 4 19.5v-15Z" />
    <path d="M4 19.5A1.5 1.5 0 0 1 5.5 21H19v-3" />
  </Icon>
);

export const IconLaptop = (p) => (
  <Icon {...p}>
    <rect x="4" y="5" width="16" height="11" rx="2" />
    <path d="M2 19h20" />
  </Icon>
);

export const IconPen = (p) => (
  <Icon {...p}>
    <path d="M3 21c1.5-4 3-5.5 6-8.5L15 6.5l2.5 2.5-6 6C8.5 18 7 19.5 3 21Z" />
    <path d="M15.5 4 18 1.5 22.5 6 20 8.5" />
  </Icon>
);

export const IconCard = (p) => (
  <Icon {...p}>
    <rect x="2.5" y="5" width="19" height="14" rx="2" />
    <path d="M2.5 9.5h19M6 15h3" />
  </Icon>
);

export const IconCooking = (p) => (
  <Icon {...p}>
    <path d="M4 11h13a5.5 5.5 0 0 1-5.5 5.5h-2A5.5 5.5 0 0 1 4 11Z" />
    <path d="m17 12 4-2M6.5 5.5v2M10.5 4.5v3" />
  </Icon>
);

export const IconWrench = (p) => (
  <Icon {...p}>
    <path d="M15.5 3a5.5 5.5 0 0 0-4.9 8L3 18.6 5.4 21l7.6-7.6A5.5 5.5 0 0 0 20 8.4l-3 3-2.4-2.4 3-3A5.5 5.5 0 0 0 15.5 3Z" />
  </Icon>
);

export const IconSpiral = (p) => (
  <Icon {...p}>
    <path d="M12 12a2 2 0 1 1 2 2 4 4 0 1 1-4-4 6 6 0 1 1-6 6" />
  </Icon>
);

export const IconLeaf = (p) => (
  <Icon {...p}>
    <path d="M4 20C3 12 8 4 20 4c0 12-8 17-16 16Z" />
    <path d="M4 20 14 10" />
  </Icon>
);

export const IconWave = (p) => (
  <Icon {...p}>
    <path d="M2 8.5c2.5-2.5 5-2.5 7.5 0s5 2.5 7.5 0 5-2.5 7 0" />
    <path d="M2 15.5c2.5-2.5 5-2.5 7.5 0s5 2.5 7.5 0 5-2.5 7 0" />
  </Icon>
);

export const IconFlame = (p) => (
  <Icon {...p}>
    <path d="M12 2c1 4-3.5 5-3.5 9a3.5 3.5 0 0 0 7 0c0-1.5-.8-2.5-1.5-3.5 3 1 5 3.5 5 6.5a7 7 0 0 1-14 0C5 8 12 7 12 2Z" />
  </Icon>
);

export const IconStar = (p) => (
  <Icon {...p}>
    <path d="m12 3 2.7 5.8 6.3.8-4.6 4.4 1.2 6.2L12 17.2 6.4 20.2l1.2-6.2L3 9.6l6.3-.8L12 3Z" />
  </Icon>
);

export const IconOwl = (p) => (
  <Icon {...p}>
    <path d="M4 9a8 8 0 0 1 16 0v5a8 8 0 0 1-16 0V9Z" />
    <circle cx="9" cy="10" r="2" />
    <circle cx="15" cy="10" r="2" />
    <path d="m10.8 14 1.2 1.5 1.2-1.5" />
  </Icon>
);

export const IconMoon = (p) => (
  <Icon {...p}>
    <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5Z" />
  </Icon>
);
