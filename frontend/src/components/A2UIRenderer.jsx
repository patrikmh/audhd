/**
 * A2UI Renderer for Varv.
 *
 * Receives A2UI surface messages from the AG-UI stream and renders
 * them as native Varv React components. Uses the adjacency-list
 * component model: a flat list of {id, type, properties} objects
 * where children are referenced by ID.
 *
 * Each surface message has: { components[], dataModel{} }
 */
import React, { useState, useEffect, useCallback } from "react";
import { T } from "../constants/tokens";

// ── Component registry ──────────────────────────────────────────────────────

const COMPONENTS = {
  column: ColumnComponent,
  row: RowComponent,
  card: CardComponent,
  text: TextComponent,
  icon: IconComponent,
  badge: BadgeComponent,
  divider: DividerComponent,
  spacer: SpacerComponent,
  taskCard: TaskCardComponent,
  energyPicker: EnergyPickerComponent,
  breathingWidget: BreathingWidgetComponent,
  toolSuggestion: ToolSuggestionComponent,
  recoveryMenu: RecoveryMenuComponent,
  morningCheckin: MorningCheckinComponent,
  progressBar: ProgressBarComponent,
  quickCapture: QuickCaptureComponent,
};

// ── Renderer ────────────────────────────────────────────────────────────────

export default function A2UIRenderer({ surfaces = [], onAction }) {
  if (!surfaces.length) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {surfaces.map((surface, idx) => (
        <Surface key={surface.id || idx} surface={surface} onAction={onAction} />
      ))}
    </div>
  );
}

function Surface({ surface, onAction }) {
  const { components = [], dataModel = {} } = surface;

  if (!components.length) return null;

  // Build component map for quick lookup
  const componentMap = {};
  for (const comp of components) {
    componentMap[comp.id] = comp;
  }

  // Find root component (the one referenced as a child but not appearing as a child)
  const childIds = new Set();
  for (const comp of components) {
    if (comp.properties?.children) {
      for (const childId of comp.properties.children) {
        childIds.add(childId);
      }
    }
  }
  const root = components.find((c) => !childIds.has(c.id));
  if (!root) return null;

  return (
    <div style={{
      background: T.paper,
      border: `1px solid ${T.moss}33`,
      borderRadius: 14,
      padding: 16,
      maxWidth: 420,
      animation: "a2uiFadeIn 0.3s ease-out",
    }}>
      <style>{a2uiStyles}</style>
      <ComponentRenderer
        component={root}
        componentMap={componentMap}
        dataModel={dataModel}
        onAction={onAction}
      />
    </div>
  );
}

function ComponentRenderer({ component, componentMap, dataModel, onAction }) {
  if (!component) return null;

  const Comp = COMPONENTS[component.type];
  if (!Comp) return <div style={{ color: T.ink, fontSize: 12 }}>Unknown: {component.type}</div>;

  // Resolve children references
  const children = (component.properties?.children || [])
    .map((childId) => componentMap[childId])
    .filter(Boolean);

  return (
    <Comp
      {...component.properties}
      childrenComponents={children}
      componentMap={componentMap}
      dataModel={dataModel}
      onAction={onAction}
    />
  );
}

// ── Layout components ───────────────────────────────────────────────────────

function ColumnComponent({ childrenComponents, componentMap, dataModel, onAction, style }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, ...style }}>
      {childrenComponents.map((child) => (
        <ComponentRenderer
          key={child.id}
          component={child}
          componentMap={componentMap}
          dataModel={dataModel}
          onAction={onAction}
        />
      ))}
    </div>
  );
}

function RowComponent({ childrenComponents, componentMap, dataModel, onAction, style, gap }) {
  return (
    <div style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: gap || 8, ...style }}>
      {childrenComponents.map((child) => (
        <ComponentRenderer
          key={child.id}
          component={child}
          componentMap={componentMap}
          dataModel={dataModel}
          onAction={onAction}
        />
      ))}
    </div>
  );
}

function CardComponent({ childrenComponents, componentMap, dataModel, onAction, style }) {
  return (
    <div style={{
      background: T.paper,
      border: `1px solid ${T.moss}22`,
      borderRadius: 12,
      padding: 12,
      ...style,
    }}>
      {childrenComponents.map((child) => (
        <ComponentRenderer
          key={child.id}
          component={child}
          componentMap={componentMap}
          dataModel={dataModel}
          onAction={onAction}
        />
      ))}
    </div>
  );
}

function SpacerComponent({ height }) {
  return <div style={{ height: height || 12 }} />;
}

function DividerComponent() {
  return <div style={{ height: 1, background: `${T.moss}33`, margin: "4px 0" }} />;
}

// ── Display components ──────────────────────────────────────────────────────

function TextComponent({ text, style }) {
  const fontStyle = style === "h3"
    ? { fontFamily: "Fraunces, serif", fontSize: 17, fontWeight: 600, color: T.ink }
    : style === "small"
    ? { fontSize: 13, color: T.ink + "99" }
    : style === "accent"
    ? { fontSize: 15, color: T.petrol, fontWeight: 500 }
    : { fontSize: 15, color: T.ink };

  return <div style={fontStyle}>{text || ""}</div>;
}

function IconComponent({ name, size }) {
  const icons = {
    lightning: "\u26A1",
    brain: "\uD83E\uDDE0",
    palette: "\uD83C\uDFA8",
    sparkles: "\u2728",
    check: "\u2714\uFE0F",
    list: "\uD83D\uDCCB",
    eye: "\uD83D\uDC41\uFE0F",
    heart: "\u2764\uFE0F",
    star: "\u2B50",
    pin: "\uD83D\uDCCD",
    clock: "\u23F0",
    tools: "\uD83D\uDD27",
    lightbulb: "\uD83D\uDCA1",
    battery: "\uD83D\uDD0B",
    lungs: "\uD83E\uDEC1",
    chart: "\uD83D\uDCC8",
    memo: "\uD83D\uDCDD",
  };

  return (
    <span style={{ fontSize: size || 18 }}>
      {icons[name] || name || "\u2022"}
    </span>
  );
}

function BadgeComponent({ label, variant }) {
  const colors = {
    success: { bg: T.moss + "22", fg: T.moss },
    warning: { bg: T.warn + "22", fg: T.warn },
    info: { bg: T.petrol + "22", fg: T.petrol },
  };
  const c = colors[variant] || colors.info;

  return (
    <span style={{
      display: "inline-block",
      padding: "2px 10px",
      borderRadius: 10,
      fontSize: 13,
      fontWeight: 600,
      background: c.bg,
      color: c.fg,
    }}>
      {label}
    </span>
  );
}

// ── Varv-specific components ────────────────────────────────────────────────

function TaskCardComponent({ title, energy, essential, priority, icon, onAction }) {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 10,
      padding: "8px 12px",
      background: T.paper,
      border: `1px solid ${T.moss}33`,
      borderRadius: 10,
      cursor: "pointer",
    }}>
      <span style={{ fontSize: 18 }}>{icon || "\uD83D\uDCDD"}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, color: T.ink }}>{title}</div>
        <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
          <BadgeComponent label={`${energy}\u26A1`} variant={energy <= 1 ? "warning" : "info"} />
          {essential && <BadgeComponent label="V\u00E4sentlig" variant="warning" />}
        </div>
      </div>
      {onAction && (
        <button
          onClick={() => onAction("startTask", { title })}
          style={{
            background: T.spruce,
            color: "#fff",
            border: "none",
            borderRadius: 8,
            padding: "6px 12px",
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          Starta
        </button>
      )}
    </div>
  );
}

function EnergyPickerComponent({ current, onAction }) {
  const modes = [
    { key: "steady", label: "Stabil", icon: "\u26A1", color: T.moss },
    { key: "low", label: "L\u00E5g", icon: "\uD83D\uDCA1", color: T.warn },
    { key: "recovery", label: " \u00E5terhämtning", icon: "\uD83D\uDECC", color: T.petrol },
  ];

  return (
    <div style={{ display: "flex", gap: 8 }}>
      {modes.map((m) => (
        <button
          key={m.key}
          onClick={() => onAction?.("setEnergy", m.key)}
          style={{
            flex: 1,
            padding: "8px 4px",
            background: current === m.key ? m.color + "22" : "transparent",
            border: `1.5px solid ${current === m.key ? m.color : T.moss + "33"}`,
            borderRadius: 10,
            cursor: "pointer",
            textAlign: "center",
            fontSize: 13,
            color: T.ink,
          }}
        >
          <div style={{ fontSize: 18 }}>{m.icon}</div>
          <div style={{ marginTop: 2 }}>{m.label}</div>
        </button>
      ))}
    </div>
  );
}

function BreathingWidgetComponent() {
  const [phase, setPhase] = useState("inhale");
  const [count, setCount] = useState(4);

  useEffect(() => {
    const phases = [
      { name: "inhale", duration: 4000, next: "hold1", count: 4 },
      { name: "hold1", duration: 4000, next: "exhale", count: 4 },
      { name: "exhale", duration: 4000, next: "hold2", count: 4 },
      { name: "hold2", duration: 2000, next: "inhale", count: 2 },
    ];

    let current = phases.find((p) => p.name === phase) || phases[0];
    setCount(current.count);

    const interval = setInterval(() => {
      setCount((c) => {
        if (c <= 1) {
          const next = phases.find((p) => p.name === current.next) || phases[0];
          current = next;
          setPhase(next.name);
          return next.count;
        }
        return c - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [phase]);

  const labels = { inhale: "Andas in", hold1: "H\u00E4ll", exhale: "Andas ut", hold2: "H\u00E4ll" };

  return (
    <div style={{ textAlign: "center", padding: 16 }}>
      <div style={{
        width: 80,
        height: 80,
        borderRadius: "50%",
        background: `${T.petrol}22`,
        border: `2px solid ${T.petrol}`,
        margin: "0 auto 12px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transform: phase === "inhale" ? "scale(1.2)" : phase === "exhale" ? "scale(0.8)" : "scale(1)",
        transition: "transform 1s ease-in-out",
      }}>
        <span style={{ fontSize: 28, color: T.petrol, fontFamily: "IBM Plex Mono" }}>{count}</span>
      </div>
      <div style={{ fontSize: 15, color: T.ink, fontWeight: 500 }}>{labels[phase]}</div>
    </div>
  );
}

function ToolSuggestionComponent({ toolName, label, description, icon_name, onAction }) {
  return (
    <button
      onClick={() => onAction?.("runTool", toolName)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        width: "100%",
        padding: "10px 14px",
        background: `${T.petrol}0D`,
        border: `1.5px solid ${T.petrol}33`,
        borderRadius: 10,
        cursor: "pointer",
        textAlign: "left",
      }}
    >
      <IconComponent name={icon_name} size={20} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: T.ink }}>{label}</div>
        <div style={{ fontSize: 13, color: T.ink + "99", marginTop: 2 }}>{description}</div>
      </div>
      <span style={{ color: T.petrol, fontSize: 18 }}>\u2192</span>
    </button>
  );
}

function RecoveryMenuComponent({ reason, onAction }) {
  const items = [
    { id: "breathing", label: "Andnings\u00F6vning", icon: "\uD83E\uDEC1", desc: "4-4-4-2sek" },
    { id: "movement", label: "R\u00F6relsepaus", icon: "\uD83E\uDD38", desc: "5min +2\u26A1" },
    { id: "rest", label: "Vila", icon: "\uD83D\uDECC", desc: "Inget krav" },
  ];

  return (
    <div>
      {reason && <div style={{ fontSize: 13, color: T.ink + "99", marginBottom: 8 }}>{reason}</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => onAction?.("runTool", item.id)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 12px",
              background: "transparent",
              border: `1px solid ${T.moss}33`,
              borderRadius: 8,
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            <span style={{ fontSize: 18 }}>{item.icon}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, color: T.ink }}>{item.label}</div>
              <div style={{ fontSize: 12, color: T.ink + "77" }}>{item.desc}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function MorningCheckinComponent({ onAction }) {
  return (
    <div style={{ textAlign: "center", padding: 8 }}>
      <div style={{ fontSize: 17, fontFamily: "Fraunces, serif", fontWeight: 600, color: T.ink, marginBottom: 4 }}>
        God morgon
      </div>
      <div style={{ fontSize: 14, color: T.ink + "99", marginBottom: 12 }}>
        Hur m\u00E5r du idag?
      </div>
      <button
        onClick={() => onAction?.("openCheckin")}
        style={{
          background: T.spruce,
          color: "#fff",
          border: "none",
          borderRadius: 10,
          padding: "10px 24px",
          fontSize: 15,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        B\u00F6rja dagen
      </button>
    </div>
  );
}

function ProgressBarComponent({ value, label }) {
  const pct = Math.round((value || 0) * 100);
  return (
    <div>
      <div style={{
        height: 8,
        borderRadius: 4,
        background: T.moss + "22",
        overflow: "hidden",
      }}>
        <div style={{
          height: "100%",
          width: `${pct}%`,
          borderRadius: 4,
          background: T.spruce,
          transition: "width 0.5s ease-out",
        }} />
      </div>
      {label && (
        <div style={{ fontSize: 13, color: T.ink + "99", marginTop: 4, textAlign: "center" }}>
          {label}
        </div>
      )}
    </div>
  );
}

function QuickCaptureComponent({ placeholder, onAction }) {
  const [text, setText] = useState("");

  const handleSubmit = () => {
    if (text.trim() && onAction) {
      onAction("capture", text.trim());
      setText("");
    }
  };

  return (
    <div style={{ display: "flex", gap: 8 }}>
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
        placeholder={placeholder || "F\u00E5ngsta en tanke..."}
        style={{
          flex: 1,
          padding: "8px 12px",
          border: `1.5px solid ${T.moss}33`,
          borderRadius: 10,
          fontSize: 15,
          color: T.ink,
          background: T.paper,
          outline: "none",
        }}
      />
      <button
        onClick={handleSubmit}
        disabled={!text.trim()}
        style={{
          background: text.trim() ? T.spruce : T.moss + "33",
          color: text.trim() ? "#fff" : T.ink + "55",
          border: "none",
          borderRadius: 10,
          padding: "8px 14px",
          cursor: text.trim() ? "pointer" : "default",
          fontSize: 15,
        }}
      >
        \u2192
      </button>
    </div>
  );
}

// ── CSS ─────────────────────────────────────────────────────────────────────

const a2uiStyles = `
  @keyframes a2uiFadeIn {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }
`;
