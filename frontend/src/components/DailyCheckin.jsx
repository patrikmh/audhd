import React, { useState } from "react";
import { T, MODES, ENERGY_LABELS } from "../constants/tokens";
import { todayKey, todayWeekday } from "../utils/helpers";
import { useModalDialog } from "../hooks/useModalDialog";

/**
 * Daily Morning Check-in — shows on first load each day.
 * Props:
 *   state        – full app state
 *   onSetEnergy  – (capacity) => void
 *   onDismiss    – () => void  (marks today as checked in)
 *   onAddTask    – (draft) => void
 */
export default function DailyCheckin({ state, onSetEnergy, onDismiss, onAddTask }) {
  const [step, setStep] = useState(0);
  const [energy, setEnergy] = useState(state.capacity);
  const [quickCapture, setQuickCapture] = useState("");
  const s = styles;

  const today = todayKey();
  const yesterday = todayKey(new Date(Date.now() - 86400000));

  const yesterdayTasks = state.tasks.filter(
    (t) => (t.day === yesterday || t.scheduled_date === yesterday) && t.done
  );
  const todayTasks = state.tasks.filter((t) => {
    if (t.done) return false;
    if (t.scheduled_date === today) return true;
    if (!t.scheduled_date && t.day === today) return true;
    if (!t.scheduled_date && !t.day && t.repeatDays?.includes(todayWeekday())) return true;
    return false;
  });
  const yesterdayWins = state.wins.filter((w) => (w.ts ? todayKey(new Date(w.ts)) : null) === yesterday);
  const budget = MODES[energy]?.budget || 20;

  const handleCapture = () => {
    if (!quickCapture.trim()) return;
    onAddTask({ title: quickCapture.trim() });
    setQuickCapture("");
  };

  const handleFinish = () => {
    onSetEnergy(energy);
    onDismiss();
  };
  const dialogRef = useModalDialog(handleFinish);

  const steps = [
    /* 0 — Energy */
    () => (
      <div>
        <div style={{ fontSize: 40, textAlign: "center", marginBottom: 8 }}>☀️</div>
        <h2 style={s.title}>God morgon</h2>
        <p style={{ ...s.body, textAlign: "center" }}>
          {new Date().toLocaleDateString("sv-SE", { weekday: "long", month: "long", day: "numeric" })}
        </p>
        <p style={{ ...s.body, textAlign: "center", marginTop: 12, fontSize: 16 }}>
          Hur känns energin idag?
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 20 }}>
          {Object.entries(MODES).map(([key, m]) => (
            <button
              key={key}
              onClick={() => setEnergy(key)}
              style={{
                ...s.card,
                textAlign: "left",
                border: `2px solid ${energy === key ? T.petrol : T.line}`,
                background: energy === key ? `${T.petrol}11` : T.card,
                cursor: "pointer",
                transition: "all 0.2s",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontWeight: 700, fontSize: 15, color: energy === key ? T.petrolDark : T.ink }}>
                  {m.label}
                </span>
                <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, color: T.soft }}>
                  {m.budget}p
                </span>
              </div>
              <div style={{ fontSize: 13, color: T.soft, marginTop: 2 }}>{m.blurb}</div>
            </button>
          ))}
        </div>

        <button style={{ ...s.primaryBtn, width: "100%", marginTop: 24 }} onClick={() => setStep(1)}>
          Nästa
        </button>
      </div>
    ),

    /* 1 — Yesterday review */
    () => (
      <div>
        <h2 style={s.title}>Igår</h2>

        {yesterdayTasks.length === 0 && yesterdayWins.length === 0 && (
          <p style={{ ...s.body, textAlign: "center", marginTop: 12 }}>
            Ingen data från igår. Det är okej.
          </p>
        )}

        {yesterdayTasks.length > 0 && (
          <>
            <div style={s.eyebrow}>Klart igår</div>
            {yesterdayTasks.map((t) => (
              <div key={t.id} style={s.listItem}>
                <span style={{ color: T.moss, marginRight: 8 }}>✓</span>
                <span>{t.title}</span>
              </div>
            ))}
          </>
        )}

        {yesterdayWins.length > 0 && (
          <>
            <div style={{ ...s.eyebrow, marginTop: 14 }}>Vinster</div>
            {yesterdayWins.slice(0, 5).map((w, i) => (
              <div key={i} style={s.listItem}>
                <span style={{ marginRight: 8 }}>🏆</span>
                <span>{w.text}</span>
              </div>
            ))}
          </>
        )}

        <div style={{ display: "flex", gap: 10, marginTop: 28 }}>
          <button style={{ ...s.secondaryBtn, flex: 1 }} onClick={() => setStep(0)}>Tillbaka</button>
          <button style={{ ...s.primaryBtn, flex: 1 }} onClick={() => setStep(2)}>Nästa</button>
        </div>
      </div>
    ),

    /* 2 — Today preview + quick capture */
    () => (
      <div>
        <h2 style={s.title}>Dagens plan</h2>
        <p style={{ ...s.body, marginBottom: 4 }}>
          Energi: <strong>{MODES[energy]?.label}</strong> ({budget} poäng)
        </p>

        {todayTasks.length > 0 ? (
          <>
            <div style={s.eyebrow}>På today's lista ({todayTasks.length})</div>
            {todayTasks.slice(0, 6).map((t) => (
              <div key={t.id} style={s.listItem}>
                <span style={{ marginRight: 8 }}>{t.icon || "📌"}</span>
                <span style={{ flex: 1 }}>{t.title}</span>
                <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: T.soft }}>
                  {t.energy}p
                </span>
              </div>
            ))}
            {todayTasks.length > 6 && (
              <div style={{ fontSize: 13, color: T.soft, marginTop: 4 }}>
                …och {todayTasks.length - 6} till
              </div>
            )}
          </>
        ) : (
          <p style={{ ...s.body, marginTop: 8 }}>Inga uppgifter planerade ännu.</p>
        )}

        <div style={{ ...s.eyebrow, marginTop: 18 }}>Något på tapeten?</div>
        <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
          <input
            style={{ ...s.input, flex: 1 }}
            placeholder="Snabbfångst…"
            value={quickCapture}
            onChange={(e) => setQuickCapture(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCapture()}
          />
          <button style={{ ...s.primaryBtn, padding: "8px 14px" }} onClick={handleCapture}>
            +
          </button>
        </div>

        <button style={{ ...s.primaryBtn, width: "100%", marginTop: 28, background: T.spruce }} onClick={handleFinish}>
          Starta dagen
        </button>
        <button
          style={{ ...s.linkBtn, width: "100%", marginTop: 10, textAlign: "center", fontSize: 14 }}
          onClick={handleFinish}
        >
          Hoppa över
        </button>
      </div>
    ),
  ];

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Morgoncheck"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 900,
        background: T.paper,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'Atkinson Hyperlegible', sans-serif",
      }}
    >
      <div style={{ width: "100%", maxWidth: 420, padding: 24, overflowY: "auto", maxHeight: "100vh" }}>
        {/* Step dots */}
        <div style={{ display: "flex", gap: 6, justifyContent: "center", marginBottom: 20 }}>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              style={{
                width: 8, height: 8, borderRadius: "50%",
                background: i === step ? T.petrol : T.track,
                cursor: "pointer",
                transition: "background 0.2s",
              }}
              onClick={() => setStep(i)}
            />
          ))}
        </div>
        {steps[step]()}
      </div>
    </div>
  );
}

const styles = {
  card: { background: "#FAF9F5", borderRadius: 12, padding: 16, border: "1px solid #E4E2DA" },
  input: {
    width: "100%", padding: "10px 12px", borderRadius: 10,
    border: "1.5px solid #E4E2DA", fontSize: 15, background: "#FAF9F5",
    fontFamily: "'Atkinson Hyperlegible', sans-serif", boxSizing: "border-box",
  },
  body: { color: "#6C7370", lineHeight: 1.5, margin: 0 },
  title: {
    fontFamily: "'Fraunces', serif", fontWeight: 400, fontSize: 24,
    color: "#33393B", margin: "0 0 4px 0",
  },
  eyebrow: {
    fontSize: 12, textTransform: "uppercase", letterSpacing: "0.5px",
    color: "#8A977F", fontWeight: 700, marginTop: 14, marginBottom: 6,
  },
  listItem: {
    display: "flex", alignItems: "center", padding: "8px 0",
    fontSize: 15, color: "#33393B",
    borderBottom: "1px solid #E4E2DA",
  },
  primaryBtn: {
    padding: "10px 20px", borderRadius: 10, border: "none",
    background: "#4C6E75", color: "white", fontSize: 15, fontWeight: 700,
    cursor: "pointer", fontFamily: "'Atkinson Hyperlegible', sans-serif",
  },
  secondaryBtn: {
    padding: "10px 20px", borderRadius: 10, border: "1.5px solid #E4E2DA",
    background: "transparent", color: "#6C7370", fontSize: 15, fontWeight: 600,
    cursor: "pointer", fontFamily: "'Atkinson Hyperlegible', sans-serif",
  },
  linkBtn: {
    background: "none", border: "none", color: "#4C6E75",
    fontWeight: 600, cursor: "pointer", padding: 0,
    fontFamily: "'Atkinson Hyperlegible', sans-serif",
  },
};
