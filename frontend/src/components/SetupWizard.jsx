import React, { useState } from "react";
import { F, T, MODES, ICON_CHOICES, WEEKDAYS } from "../constants/tokens";
import { uid, guessIcon } from "../utils/helpers";
import { useModalDialog } from "../hooks/useModalDialog";

/**
 * Setup Wizard — first-launch onboarding.
 * Props: onComplete({ settings, tasks, capacity })
 */
export default function SetupWizard({ onComplete }) {
  const [step, setStep] = useState(0);
  // Ingen Escape-utväg — det här är ett obligatoriskt förstagångsflöde, inte en
  // avfärdbar dialog. Fokusfälla + initialt fokus gäller ändå.
  const dialogRef = useModalDialog(() => {});
  const [wake, setWake] = useState("07:00");
  const [winddown, setWinddown] = useState("22:00");
  const [capacity, setCapacity] = useState("steady");
  const [tasks, setTasks] = useState([
    { title: "", trigger: "", energy: 2, minutes: 30, essential: false, days: [] },
  ]);
  const [tourIdx, setTourIdx] = useState(0);
  const [showTaskDetails, setShowTaskDetails] = useState(false);

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

  const ALL_DAYS = WEEKDAYS.map((d) => d.key);

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
        // Utan vald dag skulle uppgiften varken ha repeatDays eller datum och
        // därmed aldrig synas någonstans — varje dag är den rimliga tolkningen.
        repeatDays: t.days.length ? t.days : ALL_DAYS,
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
        <h2 style={{ fontFamily: F.display, fontWeight: 400, fontSize: 28, color: T.ink, margin: 0 }}>
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

        <div style={{ display: "flex", gap: 16, marginTop: 20, justifyContent: "center", flexWrap: "wrap" }}>
          <label style={{ textAlign: "center" }}>
            <span style={{ display: "block", fontSize: 12, color: T.soft, marginBottom: 4 }}>Vaknar</span>
            <input
              type="time"
              value={wake}
              onChange={(e) => setWake(e.target.value)}
              style={s.timeInput}
            />
          </label>
          <div aria-hidden="true" style={{ fontSize: 24, color: T.track, alignSelf: "center" }}>→</div>
          <label style={{ textAlign: "center" }}>
            <span style={{ display: "block", fontSize: 12, color: T.soft, marginBottom: 4 }}>Laddar ner</span>
            <input
              type="time"
              value={winddown}
              onChange={(e) => setWinddown(e.target.value)}
              style={s.timeInput}
            />
          </label>
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
        <h3 style={s.stepTitle}>Dina första uppgifter <span style={{ fontSize: 14, color: T.soft }}>(valfritt)</span></h3>
        <p style={s.body}>Skriv bara en titel nu. Du kan lägga till detaljer senare — eller hoppa över helt.</p>

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
            {showTaskDetails && (
              <div style={{ marginTop: 8 }}>
                <label style={s.fieldLabel}>
                  När vill du börja?
                  <input
                    style={{ ...s.input, marginTop: 4, fontSize: 13 }}
                    placeholder="t.ex. när jag vaknar"
                    value={t.trigger}
                    onChange={(e) => updateTask(i, "trigger", e.target.value)}
                  />
                </label>
                <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ fontSize: 12, color: T.soft }}>Energi</span>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      aria-pressed={t.energy === n}
                      aria-label={`${n} energipoäng`}
                      onClick={() => updateTask(i, "energy", n)}
                      style={{
                        width: 32, height: 32, borderRadius: 6, border: `1.5px solid ${t.energy === n ? T.petrol : T.line}`,
                        background: t.energy === n ? T.petrol : "transparent",
                        color: t.energy === n ? T.textOnAccent : T.soft,
                        fontSize: 12, fontWeight: 700, cursor: "pointer",
                      }}
                    >
                      {n}
                    </button>
                  ))}
                  <label style={{ ...s.fieldLabel, marginLeft: 4 }}>
                    Minuter
                    <input
                      type="number"
                      min={5}
                      max={240}
                      step={5}
                      value={t.minutes}
                      onChange={(e) => updateTask(i, "minutes", Number(e.target.value))}
                      style={{ ...s.input, display: "block", width: 68, marginTop: 4, padding: "6px", fontSize: 13, textAlign: "center" }}
                    />
                  </label>
                </div>
                <fieldset style={{ border: 0, padding: 0, margin: "10px 0 0" }}>
                  <legend style={{ fontSize: 12, color: T.soft, padding: 0 }}>Dagar (ingen vald = varje dag)</legend>
                  <div style={{ display: "flex", gap: 4, marginTop: 6, flexWrap: "wrap" }}>
                    {WEEKDAYS.map((d) => (
                      <button
                        key={d.key}
                        aria-pressed={t.days.includes(d.key)}
                        onClick={() => toggleDay(i, d.key)}
                        style={{
                          minWidth: 36, minHeight: 36, padding: "4px 8px", borderRadius: 6, fontSize: 11, cursor: "pointer",
                          border: `1px solid ${t.days.includes(d.key) ? T.spruce : T.line}`,
                          background: t.days.includes(d.key) ? T.spruce : "transparent",
                          color: t.days.includes(d.key) ? T.textOnAccent : T.soft,
                        }}
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>
                </fieldset>
              </div>
            )}
          </div>
        ))}

        <div style={{ display: "flex", gap: 14, marginTop: 10, flexWrap: "wrap" }}>
          <button onClick={addTaskRow} style={{ ...s.linkBtn, fontSize: 14 }}>+ lägg till en till</button>
          <button
            onClick={() => setShowTaskDetails((value) => !value)}
            aria-expanded={showTaskDetails}
            style={{ ...s.linkBtn, fontSize: 14, color: T.soft }}
          >
            {showTaskDetails ? "dölj detaljer" : "visa valfria detaljer"}
          </button>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: "center", flexWrap: "wrap" }}>
          <button style={s.secondaryBtn} onClick={() => setStep(2)}>Tillbaka</button>
          <button style={s.primaryBtn} onClick={() => setStep(4)}>{tasks.some((task) => task.title.trim()) ? "Nästa" : "Hoppa över uppgifter"}</button>
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
            <div style={{ fontFamily: F.display, fontSize: 18, fontWeight: 500, color: T.ink }}>{item.title}</div>
            <p style={{ ...s.body, marginTop: 6, fontSize: 14 }}>{item.text}</p>
          </div>

          <div aria-label="Rundtur" style={{ display: "flex", gap: 6, justifyContent: "center", marginTop: 12 }}>
            {tourItems.map((tourItem, i) => (
              <button
                key={tourItem.title}
                type="button"
                aria-label={`Visa ${tourItem.title}`}
                aria-current={i === tourIdx ? "step" : undefined}
                style={{
                  width: 24, height: 24, padding: 0, border: 0, borderRadius: "50%",
                  background: "transparent", cursor: "pointer", position: "relative",
                }}
                onClick={() => setTourIdx(i)}
              >
                <span aria-hidden="true" style={{ display: "block", width: 8, height: 8, margin: 8, borderRadius: "50%", background: i === tourIdx ? T.petrol : T.track }} />
              </button>
            ))}
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 24, justifyContent: "center", flexWrap: "wrap" }}>
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
            {tourIdx < tourItems.length - 1 && (
              <button style={{ ...s.linkBtn, minHeight: 44 }} onClick={finish}>Hoppa över rundturen</button>
            )}
          </div>
        </div>
      );
    },
  ];

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Varv-guiden"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 900,
        background: T.paper,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: F.body,
      }}
    >
      <div style={{ width: "100%", maxWidth: 420, padding: 24, overflowY: "auto", maxHeight: "100vh" }}>
        {steps[step]()}
      </div>
    </div>
  );
}

const styles = {
  card: { background: T.card, borderRadius: 12, padding: 16, border: `1px solid ${T.line}` },
  input: {
    width: "100%", padding: "10px 12px", borderRadius: 10,
    border: `1.5px solid ${T.line}`, fontSize: 15, background: T.card,
    fontFamily: F.body, boxSizing: "border-box",
  },
  timeInput: {
    padding: "10px 14px", borderRadius: 10, border: `1.5px solid ${T.line}`,
    fontSize: 20, fontFamily: F.mono, background: T.card,
    textAlign: "center",
  },
  body: { color: T.soft, lineHeight: 1.5 },
  fieldLabel: { display: "block", color: T.soft, fontSize: 12, lineHeight: 1.4 },
  primaryBtn: {
    padding: "10px 20px", borderRadius: 10, border: "none",
    background: T.petrol, color: T.textOnAccent, fontSize: 15, fontWeight: 700,
    cursor: "pointer", fontFamily: F.body,
  },
  secondaryBtn: {
    padding: "10px 20px", borderRadius: 10, border: `1.5px solid ${T.line}`,
    background: "transparent", color: T.soft, fontSize: 15, fontWeight: 600,
    cursor: "pointer", fontFamily: F.body,
  },
  linkBtn: {
    background: "none", border: "none", color: T.petrol,
    fontWeight: 600, cursor: "pointer", padding: 0,
    fontFamily: F.body,
  },
  stepEyebrow: {
    fontSize: 12, textTransform: "uppercase", letterSpacing: "0.5px",
    color: T.moss, fontWeight: 700, marginBottom: 6,
  },
  stepTitle: {
    fontFamily: F.display, fontWeight: 400, fontSize: 24,
    color: T.ink, margin: 0,
  },
};
