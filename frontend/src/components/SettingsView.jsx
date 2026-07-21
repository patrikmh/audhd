import React, { useState } from "react";
import { T } from "../constants/tokens";
import { todayKey } from "../utils/helpers";
import { useModalDialog } from "../hooks/useModalDialog";

/**
 * SettingsView — full settings/preferences panel.
 * Sections:
 *  1. Account (username + log out)
 *  2. Day defaults (wake, winddown, default energy capacity)
 *  3. Voice & sync (language, autoSync)
 *  4. Visible tools (toggle which tool buttons appear)
 *  5. Agents (toggle each background agent)
 *  6. Data (export, reset)
 */
const TOOL_LABELS = {
  focus: "Fokusvarv",
  movement: "Rörelsepaus",
  checkin: "Tankekoll",
  wins: "Vinster",
  sleep: "Sömnankare",
  breathing: "Andningsankare",
  week: "Veckoöversikt",
  why: "Varför det funkar",
  agents: "Agenter",
  connections: "Kopplingar",
};

const CAPACITY_OPTIONS = [
  { key: "steady", label: "Stadig", desc: "normal kapacitet" },
  { key: "low", label: "Lågt batteri", desc: "det är tungt idag" },
  { key: "recovery", label: "Återhämtning", desc: "bara det nödvändiga" },
];

const THEME_OPTIONS = [
  { key: "system", label: "System" },
  { key: "light", label: "Ljust" },
  { key: "dark", label: "Mörkt" },
];

const AVATAR_CHOICES = ["🌀", "🌿", "🌊", "🔥", "⭐", "🦉", "🐈", "🌙"];

export function SettingsView({ state, onPatch, onToggleExternalAi, onLogout, onClose }) {
  const s = state.settings || {};
  const [tab, setTab] = useState("dag");
  const dialogRef = useModalDialog(onClose);

  const patchSettings = (updates) => onPatch({ settings: { ...s, ...updates } });
  const patchVisibleTools = (key) =>
    patchSettings({
      visibleTools: {
        ...(s.visibleTools || {}),
        [key]: s.visibleTools?.[key] === false, // undefined = synlig → första klicket döljer
      },
    });
  const patchAgents = (key) =>
    onPatch({ agents: { ...state.agents, [key]: !state.agents?.[key] } });

  const tabs = [
    { key: "dag", label: "Dag" },
    { key: "verktyg", label: "Verktyg" },
    { key: "agenter", label: "Agenter" },
    { key: "data", label: "Data" },
  ];

  const labelStyle = {
    fontSize: 12,
    color: T.soft,
    textTransform: "uppercase",
    letterSpacing: "0.5px",
    marginBottom: 4,
    display: "block",
  };

  const inputStyle = {
    fontSize: 14,
    padding: "6px 8px",
    border: `1px solid ${T.line}`,
    borderRadius: 6,
    background: T.card,
    fontFamily: "inherit",
    width: "100%",
  };

  const toggle = (active, label, desc, onClick) => (
    <button
      onClick={onClick}
      role="switch"
      aria-checked={active}
      aria-label={label}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        minHeight: 44,
        padding: "10px 0",
        background: "none",
        border: "none",
        borderBottom: `1px solid ${T.line}`,
        width: "100%",
        cursor: "pointer",
        fontFamily: "inherit",
        textAlign: "left",
      }}
    >
      <span>
        <span style={{ fontSize: 14, fontWeight: 500, color: T.ink, display: "block" }}>{label}</span>
        {desc && <span style={{ fontSize: 12, color: T.soft }}>{desc}</span>}
      </span>
      <span
        style={{
          width: 36,
          height: 20,
          borderRadius: 10,
          background: active ? T.petrol : T.line,
          position: "relative",
          transition: "background 0.2s",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            position: "absolute",
            top: 2,
            left: active ? 18 : 2,
            width: 16,
            height: 16,
            borderRadius: 8,
            background: T.card,
            transition: "left 0.2s",
          }}
        />
      </span>
    </button>
  );

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        zIndex: 1000,
        display: "flex",
        alignItems: "stretch",
        justifyContent: "center",
        overflowY: "auto",
      }}
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Inställningar"
        style={{
          background: T.paper,
          width: "100%",
          maxWidth: 520,
          minHeight: "100%",
          padding: "20px 18px 80px",
          boxSizing: "border-box",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 22, margin: 0, color: T.ink }}>Inställningar</h2>
          <button
            onClick={onClose}
            aria-label="Stäng inställningar"
            style={{
              background: "none",
              border: "none",
              fontSize: 22,
              color: T.soft,
              cursor: "pointer",
              fontFamily: "inherit",
              width: 44,
              height: 44,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            ✕
          </button>
        </div>

        {/* Account row */}
        <div
          style={{
            padding: "10px 12px",
            background: T.card,
            borderRadius: 10,
            marginBottom: 16,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ display: "flex", gap: 4 }}>
                {AVATAR_CHOICES.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => patchSettings({ avatarEmoji: emoji })}
                    aria-label={`Välj avatar ${emoji}`}
                    aria-pressed={(s.avatarEmoji || "🌀") === emoji}
                    style={{
                      width: 32, height: 32, fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center",
                      borderRadius: 8, cursor: "pointer", fontFamily: "inherit",
                      border: (s.avatarEmoji || "🌀") === emoji ? `1.5px solid ${T.petrol}` : "1px solid transparent",
                      background: (s.avatarEmoji || "🌀") === emoji ? T.paper : "transparent",
                    }}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={onLogout}
              style={{
                background: "none",
                border: `1px solid ${T.line}`,
                borderRadius: 8,
                padding: "6px 12px",
                fontSize: 13,
                color: T.warn,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              logga ut
            </button>
          </div>
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 11, color: T.soft, textTransform: "uppercase", letterSpacing: "0.5px" }}>inloggad som {state.username || "—"}</div>
            <input
              style={{ ...inputStyle, marginTop: 4 }}
              value={s.displayName || ""}
              onChange={(e) => patchSettings({ displayName: e.target.value })}
              placeholder="visningsnamn (valfritt, används i hälsningar)"
              aria-label="Visningsnamn"
              maxLength={40}
            />
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 16, borderBottom: `1px solid ${T.line}` }}>
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                background: "none",
                border: "none",
                borderBottom: tab === t.key ? `2px solid ${T.petrol}` : "2px solid transparent",
                padding: "8px 12px",
                fontSize: 13,
                color: tab === t.key ? T.ink : T.soft,
                fontWeight: tab === t.key ? 600 : 400,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Day tab */}
        {tab === "dag" && (
          <div>
            <label style={labelStyle}>utseende</label>
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              {THEME_OPTIONS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => patchSettings({ theme: t.key })}
                  aria-pressed={(s.theme || "system") === t.key}
                  style={{
                    flex: 1,
                    padding: "8px",
                    borderRadius: 8,
                    border: (s.theme || "system") === t.key ? `1.5px solid ${T.petrol}` : `1px solid ${T.line}`,
                    background: (s.theme || "system") === t.key ? T.petrol : T.card,
                    color: (s.theme || "system") === t.key ? "white" : T.ink,
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <label style={{ ...labelStyle, marginTop: 18 }}>väckningstid</label>
            <input
              type="time"
              style={inputStyle}
              value={s.wake}
              onChange={(e) => patchSettings({ wake: e.target.value })}
            />
            <label style={{ ...labelStyle, marginTop: 14 }}>nedvarvning börjar</label>
            <input
              type="time"
              style={inputStyle}
              value={s.winddown}
              onChange={(e) => patchSettings({ winddown: e.target.value })}
            />

            <label style={{ ...labelStyle, marginTop: 18 }}>standardenergi för ny dag</label>
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              {CAPACITY_OPTIONS.map((c) => (
                <button
                  key={c.key}
                  onClick={() => patchSettings({ defaultCapacity: c.key })}
                  style={{
                    flex: 1,
                    padding: "10px 8px",
                    borderRadius: 8,
                    border:
                      s.defaultCapacity === c.key ? `1.5px solid ${T.petrol}` : `1px solid ${T.line}`,
                    background: s.defaultCapacity === c.key ? T.petrol : T.card,
                    color: s.defaultCapacity === c.key ? "white" : T.ink,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    textAlign: "center",
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{c.label}</div>
                  <div
                    style={{
                      fontSize: 11,
                      opacity: 0.8,
                      marginTop: 2,
                    }}
                  >
                    {c.desc}
                  </div>
                </button>
              ))}
            </div>

            <label style={{ ...labelStyle, marginTop: 18 }}>röst-språk</label>
            <div style={{ display: "flex", gap: 8 }}>
              {["sv-SE", "en-US"].map((l) => (
                <button
                  key={l}
                  onClick={() => patchSettings({ voiceLang: l })}
                  style={{
                    flex: 1,
                    padding: "8px",
                    borderRadius: 8,
                    border:
                      s.voiceLang === l ? `1.5px solid ${T.petrol}` : `1px solid ${T.line}`,
                    background: s.voiceLang === l ? T.petrol : T.card,
                    color: s.voiceLang === l ? "white" : T.ink,
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  {l === "sv-SE" ? "Svenska" : "English"}
                </button>
              ))}
            </div>

            <label style={{ ...labelStyle, marginTop: 18 }}>standardlängd för fokusvarv</label>
            <div style={{ display: "flex", gap: 8 }}>
              {[10, 25, 45].map((m) => (
                <button
                  key={m}
                  onClick={() => patchSettings({ defaultFocusMinutes: m })}
                  aria-pressed={(s.defaultFocusMinutes || 25) === m}
                  style={{
                    flex: 1,
                    padding: "8px",
                    borderRadius: 8,
                    border: (s.defaultFocusMinutes || 25) === m ? `1.5px solid ${T.petrol}` : `1px solid ${T.line}`,
                    background: (s.defaultFocusMinutes || 25) === m ? T.petrol : T.card,
                    color: (s.defaultFocusMinutes || 25) === m ? "white" : T.ink,
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  {m} min
                </button>
              ))}
            </div>

            <div style={{ marginTop: 18 }}>
              {toggle(
                s.autoSync,
                "Automatisk synk",
                "hämta kalender, mejl och Oura var 3:e timme",
                () => patchSettings({ autoSync: !s.autoSync })
              )}
            </div>
          </div>
        )}

        {/* Tools tab */}
        {tab === "verktyg" && (
          <div>
            <p style={{ fontSize: 13, color: T.soft, marginTop: 0 }}>
              Välj vilka verktyg som ska synas. Resten döljs — du kan alltid återaktivera dem här.
            </p>
            {Object.entries(TOOL_LABELS).map(([key, label]) =>
              toggle(
                s.visibleTools?.[key] !== false,
                label,
                null,
                () => patchVisibleTools(key)
              )
            )}
          </div>
        )}

        {/* Agents tab */}
        {tab === "agenter" && (
          <div>
            <p style={{ fontSize: 13, color: T.soft, marginTop: 0 }}>
              Externa AI-agenter är avstängda som standard. Slå på dem här för att låta Varv
              skicka dina tankar och uppgifter till en språkmodell för sortering, städning och nedbrytning.
            </p>
            {toggle(
              !!state.externalAiEnabled,
              "Externa AI-agenter",
              "krävs för sortering, förfining, nedbrytning, röst och AG-UI",
              onToggleExternalAi
            )}
            <p style={{ fontSize: 12, color: T.soft, marginTop: 18, marginBottom: 4 }}>
              Vilka agenter som körs när det är påslaget:
            </p>
            <div style={{ opacity: state.externalAiEnabled ? 1 : 0.4, pointerEvents: state.externalAiEnabled ? "auto" : "none" }}>
              {[
                ["classify", "Sorteraren", "sorterar infångade tankar"],
                ["refine", "Förfinaren", "städar råa idéer"],
                ["breakdown", "Nedbrytaren", "bryter ner tunga uppgifter"],
                ["sync", "Synkaren", "hämtar kalender/mejl/Oura"],
                ["observer", "Observatören", "foreslår verktyg under dagen"],
              ].map(([key, label, desc]) =>
                toggle(
                  state.agents?.[key] !== false,
                  label,
                  desc,
                  () => patchAgents(key)
                )
              )}
            </div>
          </div>
        )}

        {/* Data tab */}
        {tab === "data" && (
          <div>
            <p style={{ fontSize: 13, color: T.soft, marginTop: 0 }}>
              Din data sparas lokalt på enheten och synkas till servern. Exportera för att byta enhet.
            </p>
            <button
              onClick={() => {
                const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `varv-${todayKey()}.json`;
                a.click();
                URL.revokeObjectURL(url);
              }}
              style={{
                width: "100%",
                padding: "10px",
                borderRadius: 8,
                border: `1px solid ${T.line}`,
                background: T.card,
                color: T.ink,
                fontSize: 14,
                cursor: "pointer",
                fontFamily: "inherit",
                marginBottom: 10,
              }}
            >
              ⬇ Exportera all data (JSON)
            </button>
            <button
              onClick={() => {
                if (window.confirm("Rensa all lokal data på den här enheten? Data på servern påverkas inte.")) {
                  localStorage.removeItem(`varv-state:${state.username}`);
                  window.location.reload();
                }
              }}
              style={{
                width: "100%",
                padding: "10px",
                borderRadius: 8,
                border: `1px solid ${T.warn}`,
                background: "none",
                color: T.warn,
                fontSize: 14,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              🗑 Rensa lokal data på enheten
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
