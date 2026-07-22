// Single source of truth for which external integrations actually work.
// varv-server has no Notion/A2UI API wiring, so those actions must stay
// hidden or disabled rather than pretend to run and silently no-op.
// Kalender + Gmail kopplas per användare via OAuth (Inställningar → Kopplingar,
// se services/api.js connectGoogleUrl/getGoogleStatus/disconnectGoogle).
export const INTEGRATIONS = {
  oura: { available: true, label: "Oura" },
  calendar: { available: true, label: "Kalender" },
  gmail: { available: true, label: "Gmail" },
  notion: { available: false, label: "Notion" },
  a2ui: { available: false, label: "A2UI" },
};

export function isIntegrationAvailable(key) {
  return !!INTEGRATIONS[key]?.available;
}
