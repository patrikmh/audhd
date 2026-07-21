// Single source of truth for which external integrations actually work.
// varv-server has no Gmail/Calendar/Notion API wiring, so those actions
// must stay hidden or disabled rather than pretend to run and silently no-op.
export const INTEGRATIONS = {
  oura: { available: true, label: "Oura" },
  calendar: { available: false, label: "Kalender" },
  gmail: { available: false, label: "Gmail" },
  notion: { available: false, label: "Notion" },
  a2ui: { available: false, label: "A2UI" },
};

export function isIntegrationAvailable(key) {
  return !!INTEGRATIONS[key]?.available;
}
