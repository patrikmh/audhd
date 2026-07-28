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
