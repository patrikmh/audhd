import React, { useState } from "react";
import { T, MODES, ICON_CHOICES, WEEKDAYS } from "../constants/tokens";
import { uid, guessIcon } from "../utils/helpers";

/**
 * Setup Wizard — first-launch onboarding.
 * Props: onComplete({ settings, tasks, capacity })
 */
export default function SetupWizard({ onComplete }) {
  const [step, setStep] = useState(0);
  const [wake, setWake] = useState("07:00");
  const [winddown, setWinddown] = useState("22:00");
  const [capacity, setCapacity] = useState("steady");
  const [tasks, setTasks] = useState([
    { title: "", trigger: "", energy: 2, minutes: 30, essential: false, days: [] },
  ]);
  const [tourIdx, setTourIdx] = useState(0);

  const s = styles;

  const addTaskRow = () =>
    setTasks((prev) => [...prev, { title: "", trigger: "", energy: 2, minutes: 30, essential: false, days: [] }]);

  const updateTask = (i, field, val) =>
    setTasks((prev) => prev.map((t, idx) => (idx === i ? { ...t, [field]: val } : t)));

  const removeTask = (i) => setTasks((prev) => prev.filter((_, idx) => idx !== i));

  const toggleDay = (i, key) =>
    setTasks((prev) =>
      prev.map((t, idx) =>
        idx === i ? { ...t, days: t.days.includes(key) ? t.days.filter((d) => d !== key) : [...t.days, key] } : t
      )
    );

  const finish = () => {
    const builtTasks = tasks
      .filter((t) => t.title.trim())
      .map((t) => ({
        id: uid(),
        title: t.title.trim(),
        icon: guessIcon(t.title),
        trigger: t.trigger.trim(),
        energy: t.energy,
        time: null,
        minutes: t.minutes,
        essential: t.essential,
        priority: null,
        inbox: false,
        done: false,
        steps: [],
        repeatDays: t.days,
        day: null,
        ts: Date.now(),
      }));
    onComplete({
      settings: { wake, winddown },
      capacity,
      tasks: builtTasks,
    });
  };

  /* ---- steps ---- */
  const steps = [
    /* 0 — Welcome */
    () => (
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🔄</div>
        <h2 style={{ fontFamily: "'Fraunces', serif", fontWeight: 400, fontSize: 28, color: T.ink, margin: 0 }}>
          Välkommen till Varv
        </h2>
        <p style={{ ...s.body, marginTop: 12, fontSize: 16 }}>
          En dagkompanjon designad för AuDHD-hjärnor.
          <br />
          Inga streaks. Varje dag börjar på noll.
        </p>
        <p style={{ ...s.body, marginTop: 8, color: T.soft, fontSize: 14 }}>
          Vi fixar de viktigaste inställningarna. Det tar ~2 minuter.
        </p>
        <button style={{ ...s.primaryBtn, marginTop: 24, minWidth: 180 }} onClick={() => setStep(1)}>
          Kom igång
        </button>
      </div>
    ),

    /* 1 — Wake & wind-down */
    () => (
      <div>
        <div style={s.stepEyebrow}>Steg 1 av 4</div>
        <h3 style={s.stepTitle}>Din dygnsrytm</h3>
        <p style={s.body}>När vaknar du och när börjar du ladda ner?</p>

        <div style={{ display: "flex", gap: 16, marginTop: 20, justifyContent: "center" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 12, color: T.soft, marginBottom: 4 }}>Vaknar</div>
            <input
              type="time"
              value={wake}
              onChange={(e) => setWake(e.target.value)}
              style={s.timeInput}
            />
          </div>
          <div style={{ fontSize: 24, color: T.track, alignSelf: "center" }}>→</div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 12, color: T.soft, marginBottom: 4 }}>Laddar ner</div>
            <input
              type="time"
              value={winddown}
              onChange={(e) => setWinddown(e.target.value)}
              style={s.timeInput}
            />
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 28, justifyContent: "center" }}>
          <button style={s.secondaryBtn} onClick={() => setStep(0)}>Tillbaka</button>
          <button style={s.primaryBtn} onClick={() => setStep(2)}>Nästa</button>
        </div>
      </div>
    ),

    /* 2 — Energy capacity */
    () => (
      <div>
        <div style={s.stepEyebrow}>Steg 2 av 4</div>
        <h3 style={s.stepTitle}>Standardenergi</h3>
        <p style={s.body}>Välj den nivå som känns mest som "en vanlig dag". Du kan ändra varje morgon.</p>

        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 20 }}>
          {Object.entries(MODES).map(([key, m]) => (
            <button
              key={key}
              onClick={() => setCapacity(key)}
              style={{
                ...s.card,
                textAlign: "left",
                border: `2px solid ${capacity === key ? T.petrol : T.line}`,
                background: capacity === key ? `${T.petrol}11` : T.card,
                cursor: "pointer",
                transition: "all 0.2s",
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 15, color: capacity === key ? T.petrolDark : T.ink }}>
                {m.label} <span style={{ fontWeight: 400, color: T.soft }}>({m.budget} poäng)</span>
              </div>
              <div style={{ fontSize: 13, color: T.soft, marginTop: 2 }}>{m.blurb}</div>
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 28, justifyContent: "center" }}>
          <button style={s.secondaryBtn} onClick={() => setStep(1)}>Tillbaka</button>
          <button style={s.primaryBtn} onClick={() => setStep(3)}>Nästa</button>
        </div>
      </div>
    ),

    /* 3 — First recurring tasks */
    () => (
      <div>
        <div style={s.stepEyebrow}>Steg 3 av 4</div>
        <h3 style={s.stepTitle}>Dina första uppgifter</h3>
        <p style={s.body}>Lägg till återkommande saker. Tomma fält hoppas över.</p>

        {tasks.map((t, i) => (
          <div key={i} style={{ ...s.card, marginTop: 10, position: "relative" }}>
            {tasks.length > 1 && (
              <button
                onClick={() => removeTask(i)}
                style={{ position: "absolute", top: 8, right: 8, background: "none", border: "none", color: T.soft, cursor: "pointer", fontSize: 16 }}
              >
                ×
              </button>
            )}
            <input
              style={s.input}
              placeholder="Vad ska göras?"
              value={t.title}
              onChange={(e) => updateTask(i, "title", e.target.value)}
            />
            <input
              style={{ ...s.input, marginTop: 6, fontSize: 13 }}
              placeholder="Triggertext (t.ex. 'När jag vaknar…')"
              value={t.trigger}
              onChange={(e) => updateTask(i, "trigger", e.target.value)}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
              <span style={{ fontSize: 12, color: T.soft }}>Energi:</span>
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  onClick={() => updateTask(i, "energy", n)}
                  style={{
                    width: 28, height: 28, borderRadius: 6, border: `1.5px solid ${t.energy === n ? T.petrol : T.line}`,
                    background: t.energy === n ? T.petrol : "transparent",
                    color: t.energy === n ? "white" : T.soft,
                    fontSize: 12, fontWeight: 700, cursor: "pointer",
                  }}
                >
                  {n}
                </button>
              ))}
              <span style={{ fontSize: 12, color: T.soft, marginLeft: 8 }}>Minuter:</span>
              <input
                type="number"
                min={5}
                max={240}
                step={5}
                value={t.minutes}
                onChange={(e) => updateTask(i, "minutes", Number(e.target.value))}
                style={{ ...s.input, width: 56, padding: "4px 6px", fontSize: 13, textAlign: "center" }}
              />
            </div>
            <div style={{ display: "flex", gap: 4, marginTop: 8, flexWrap: "wrap" }}>
              {WEEKDAYS.map((d) => (
                <button
                  key={d.key}
                  onClick={() => toggleDay(i, d.key)}
                  style={{
                    padding: "4px 8px", borderRadius: 6, fontSize: 11, cursor: "pointer",
                    border: `1px solid ${t.days.includes(d.key) ? T.spruce : T.line}`,
                    background: t.days.includes(d.key) ? T.spruce : "transparent",
                    color: t.days.includes(d.key) ? "white" : T.soft,
                  }}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>
        ))}

        <button
          onClick={addTaskRow}
          style={{ ...s.linkBtn, marginTop: 10, fontSize: 14 }}
        >
          + lägg till en till
        </button>

        <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: "center" }}>
          <button style={s.secondaryBtn} onClick={() => setStep(2)}>Tillbaka</button>
          <button style={s.primaryBtn} onClick={() => setStep(4)}>Nästa</button>
        </div>
      </div>
    ),

    /* 4 — Quick tour + done */
    () => {
      const tourItems = [
        { icon: "🎤", title: "Fånga", text: "Tryck + för att fånga tankar med röst eller text. AI sorterar och förfinar." },
        { icon: "🔄", title: "Varvet", text: "Din dagliga översikt. Energi, uppgifter, framsteg — allt på en skärm." },
        { icon: "⚡", title: "Energi", text: "Byt nivå när dagen förändras. Systemet anpassar kraven." },
        { icon: "💡", title: "Idéer", text: "Sparade idéer förfinas automatiskt. Tryck rätt knapp för att göra om till uppgift." },
        { icon: "📋", title: "Listor", text: "Inköp, packing, vad som helst. Bocka av, återanvänd." },
      ];
      const item = tourItems[tourIdx];
      return (
        <div>
          <div style={s.stepEyebrow}>Steg 4 av 4</div>
          <h3 style={s.stepTitle}>Snabbtur</h3>

          <div style={{ ...s.card, marginTop: 16, textAlign: "center", minHeight: 140, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>{item.icon}</div>
            <div style={{ fontFamily: "'Fraunces', serif", fontSize: 18, fontWeight: 500, color: T.ink }}>{item.title}</div>
            <p style={{ ...s.body, marginTop: 6, fontSize: 14 }}>{item.text}</p>
          </div>

          <div style={{ display: "flex", gap: 6, justifyContent: "center", marginTop: 12 }}>
            {tourItems.map((_, i) => (
              <div
                key={i}
                style={{
                  width: 8, height: 8, borderRadius: "50%",
                  background: i === tourIdx ? T.petrol : T.track,
                  cursor: "pointer",
                  transition: "background 0.2s",
                }}
                onClick={() => setTourIdx(i)}
              />
            ))}
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 24, justifyContent: "center" }}>
            {tourIdx > 0 && (
              <button style={s.secondaryBtn} onClick={() => setTourIdx((v) => v - 1)}>Föregående</button>
            )}
            {tourIdx < tourItems.length - 1 ? (
              <button style={s.primaryBtn} onClick={() => setTourIdx((v) => v + 1)}>Nästa</button>
            ) : (
              <button style={{ ...s.primaryBtn, background: T.spruce }} onClick={finish}>
                Börja använda Varv
              </button>
            )}
          </div>
        </div>
      );
    },
  ];

  return (
    <div
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
  timeInput: {
    padding: "10px 14px", borderRadius: 10, border: "1.5px solid #E4E2DA",
    fontSize: 20, fontFamily: "'IBM Plex Mono', monospace", background: "#FAF9F5",
    textAlign: "center",
  },
  body: { color: "#6C7370", lineHeight: 1.5 },
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
  stepEyebrow: {
    fontSize: 12, textTransform: "uppercase", letterSpacing: "0.5px",
    color: "#8A977F", fontWeight: 700, marginBottom: 6,
  },
  stepTitle: {
    fontFamily: "'Fraunces', serif", fontWeight: 400, fontSize: 24,
    color: "#33393B", margin: 0,
  },
};
