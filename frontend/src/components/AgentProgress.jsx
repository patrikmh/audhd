/**
 * AgentProgress — visible streaming status for agent operations.
 * Shows current step + accumulated text with a subtle animation.
 */
import { useEffect, useState } from "react";
import { F, T } from "../constants/tokens";

const DOTS = ["", ".", "..", "..."];

export function AgentProgress({ step, text, isRunning }) {
  const [dotIdx, setDotIdx] = useState(0);

  useEffect(() => {
    if (!isRunning) { setDotIdx(0); return; }
    const iv = setInterval(() => setDotIdx((i) => (i + 1) % DOTS.length), 500);
    return () => clearInterval(iv);
  }, [isRunning]);

  if (!isRunning && !text) return null;

  return (
    <>
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        bottom: 90,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 900,
        background: T.card,
        border: `1.5px solid ${T.petrol}`,
        borderRadius: 12,
        padding: "10px 16px",
        maxWidth: 320,
        boxShadow: `0 4px 16px ${T.shadow}`,
        animation: "voiceFadeIn 0.3s ease",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 13,
          color: T.ink,
        }}
      >
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            background: T.petrol,
            flexShrink: 0,
            animation: "pulseGlow 1.5s infinite",
          }}
        />
        <span style={{ fontWeight: 500 }}>
          {step}<span>{isRunning ? DOTS[dotIdx] : ""}</span>
        </span>
      </div>
      {text && (
        <div
          style={{
            marginTop: 6,
            fontSize: 12,
            color: T.soft,
            fontFamily: F.mono,
            lineHeight: 1.4,
            maxHeight: 60,
            overflow: "hidden",
            animation: "textAppear 0.2s ease",
          }}
        >
          {text}
        </div>
      )}
    </div>
      <span
        role="status"
        aria-live="polite"
        style={{ position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0, 0, 0, 0)", whiteSpace: "nowrap", border: 0 }}
      >
        {isRunning ? `${step || "Agent"} pågår` : `${step || "Agent"} klar`}
      </span>
    </>
  );
}
