/**
 * GhostTextarea — a textarea with inline AI ghost-text continuation (Tab to accept),
 * streamed from /api/agents/complete. Never blocks typing: any fetch/stream failure
 * is swallowed silently, since a missing suggestion is a non-event, not an error.
 *
 * Only fires when the caller says AI consent is on (`enabled`) — avoids a guaranteed
 * 403 round-trip for every keystroke pause on accounts that haven't opted in.
 */
import { useEffect, useRef, useState } from "react";
import { API_BASE } from "../constants/tokens";
import { getAuth } from "../utils/auth";

const DEBOUNCE_MS = 600;

export function GhostTextarea({ value, onChange, context, enabled, placeholder, style, containerStyle, rows = 3, autoFocus }) {
  const [ghost, setGhost] = useState("");
  const debounceRef = useRef(null);
  const abortRef = useRef(null);
  const taRef = useRef(null);

  useEffect(() => {
    setGhost("");
    clearTimeout(debounceRef.current);
    abortRef.current?.abort();
    if (!enabled || !value || !value.trim()) return;
    // Only suggest when the cursor is at the end — a suggestion appended anywhere
    // else would land in the wrong place when accepted.
    const atEnd = taRef.current && taRef.current.selectionStart === value.length;
    if (!atEnd) return;
    debounceRef.current = setTimeout(() => fetchGhost(value), DEBOUNCE_MS);
    return () => clearTimeout(debounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, enabled]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const fetchGhost = async (text) => {
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const auth = getAuth();
      const res = await fetch(`${API_BASE}/api/agents/complete`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(auth?.token ? { Authorization: `Bearer ${auth.token}` } : {}),
        },
        body: JSON.stringify({ text, context: context || undefined }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) return;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      let buffer = "";
      for (;;) {
        const { done, value: chunk } = await reader.read();
        if (done) break;
        buffer += decoder.decode(chunk, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop();
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6);
          if (data === "[DONE]") continue;
          acc += data;
          setGhost(acc);
        }
      }
    } catch (e) {
      /* silent — a missing suggestion is a non-event */
    }
  };

  // The model isn't guaranteed to lead with a space, and neither is the text it's
  // continuing guaranteed to end with one — join them without ever gluing two words.
  const needsSpace = value && ghost && !/\s$/.test(value) && !/^[\s.,!?;:]/.test(ghost);
  const joinedGhost = needsSpace ? ` ${ghost}` : ghost;

  const acceptGhost = () => {
    if (!ghost) return;
    onChange(value + joinedGhost);
    setGhost("");
  };

  const handleKeyDown = (e) => {
    if (e.key === "Tab" && ghost) {
      e.preventDefault();
      acceptGhost();
    } else if (ghost && e.key !== "Shift" && e.key !== "Control" && e.key !== "Alt" && e.key !== "Meta") {
      setGhost("");
    }
  };

  const mergedStyle = { fontFamily: "inherit", fontSize: "inherit", lineHeight: "inherit", padding: "6px 8px", ...style };

  return (
    <div style={{ position: "relative", ...containerStyle }}>
      <div
        aria-hidden="true"
        style={{
          ...mergedStyle,
          position: "absolute",
          inset: 0,
          whiteSpace: "pre-wrap",
          wordWrap: "break-word",
          color: "transparent",
          pointerEvents: "none",
          overflow: "hidden",
          border: "1px solid transparent",
          boxSizing: "border-box",
        }}
      >
        {value}
        <span style={{ color: "var(--soft)" }}>{joinedGhost}</span>
      </div>
      <textarea
        ref={taRef}
        rows={rows}
        autoFocus={autoFocus}
        style={{ ...mergedStyle, position: "relative", background: "transparent", boxSizing: "border-box", width: "100%" }}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => setGhost("")}
        aria-describedby={ghost ? "ghost-hint" : undefined}
      />
      {ghost && (
        <span id="ghost-hint" style={{ position: "absolute", bottom: 4, right: 8, fontSize: 10, color: "var(--soft)", pointerEvents: "none" }}>
          Tab för att acceptera
        </span>
      )}
    </div>
  );
}
