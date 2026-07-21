/**
 * useAgentStream — streams AG-UI events from the backend for the main app flows.
 *
 * Falls back to the non-streaming /api/agents/* endpoints if SSE fails.
 *
 * Usage:
 *   const { run, step, text, isRunning, error } = useAgentStream();
 *   const result = await run("classify", "tvätta bilen");
 */
import { useState, useRef, useCallback } from "react";
import { API_BASE } from "../constants/tokens";
import { getAuth } from "../utils/auth";

// Which state_delta path holds the final result per agent
const RESULT_PATH = {
  classify: "/lastClassification",
  refine: "/lastRefined",
  breakdown: "/lastBreakdown",
};

// Legacy non-streaming endpoints (fallback)
const LEGACY_ENDPOINT = {
  classify: "/api/agents/classify",
  refine: "/api/agents/refine",
  breakdown: "/api/agents/breakdown",
};

const STEP_LABELS = {
  classify: "Sorteraren klassificerar",
  refine: "Förfinaren städar",
  breakdown: "Nedbrytaren bryter ner",
  observer: "Observatören analyserar",
};

const STREAM_TIMEOUT_MS = 45000; // 45s max for LLM response

export function useAgentStream() {
  const [step, setStep] = useState(null);
  const [text, setText] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [activeInput, setActiveInput] = useState(null); // input being processed — for inline UI indicators
  const [error, setError] = useState(null);
  const abortRef = useRef(null);

  /** Non-streaming fallback via /api/agents/* */
  const legacyRun = useCallback(async (agent, input) => {
    const auth = getAuth();
    const endpoint = LEGACY_ENDPOINT[agent];
    const body = agent === "breakdown" ? { title: input } : { raw: input };

    const res = await fetch(`${API_BASE}${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(auth?.token ? { Authorization: `Bearer ${auth.token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Agent ${agent} → ${res.status}`);
    return res.json();
  }, []);

  const run = useCallback(async (agent, input, agentState = {}) => {
    setIsRunning(true);
    setError(null);
    setStep(STEP_LABELS[agent] || agent);
    setText("");
    setActiveInput(input);

    const auth = getAuth();
    const controller = new AbortController();
    abortRef.current = controller;
    let result = null;

    // Timeout: abort stream after 45s, fall back to legacy
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, STREAM_TIMEOUT_MS);

    try {
      const res = await fetch(`${API_BASE}/api/ag-ui/run`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(auth?.token ? { Authorization: `Bearer ${auth.token}` } : {}),
        },
        body: JSON.stringify({
          thread_id: crypto.randomUUID(),
          run_id: crypto.randomUUID(),
          agent,
          input,
          state: agentState,
          tools: [],
          context: [],
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`Agent error ${res.status}: ${errBody}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;

          let event;
          try { event = JSON.parse(raw); } catch { continue; }

          switch (event.type) {
            case "STEP_STARTED":
              setStep(STEP_LABELS[event.step_name] || event.step_name);
              break;
            case "TEXT_MESSAGE_CONTENT":
              setText((prev) => prev + (event.delta || ""));
              break;
            case "STATE_DELTA": {
              const path = RESULT_PATH[agent];
              if (!path) break;
              const patch = (event.delta || []).find((p) => p.path === path);
              if (patch) result = patch.value;
              break;
            }
            case "RUN_ERROR":
              throw new Error(event.message || "Agent failed");
            case "RUN_FINISHED":
              break;
          }
        }
      }
    } catch (e) {
      clearTimeout(timeoutId);
      if (e.name === "AbortError") {
        // Timeout — try legacy non-streaming endpoint
        console.warn(`[AgentStream] ${agent} stream timed out, falling back to legacy`);
        try {
          setStep(`${STEP_LABELS[agent]} (fallback)`);
          result = await legacyRun(agent, input);
        } catch (legacyErr) {
          setError(legacyErr.message);
          result = null;
        }
      } else {
        // Stream error — try legacy fallback
        console.warn(`[AgentStream] ${agent} stream failed: ${e.message}, falling back to legacy`);
        try {
          setStep(`${STEP_LABELS[agent]} (fallback)`);
          result = await legacyRun(agent, input);
        } catch (legacyErr) {
          setError(legacyErr.message);
          result = null;
        }
      }
    } finally {
      clearTimeout(timeoutId);
      setIsRunning(false);
      setStep(null);
      setActiveInput(null);
      abortRef.current = null;
      // Keep final text visible briefly, then clear so AgentProgress hides
      setTimeout(() => setText(""), 2500);
    }

    return result;
  }, [legacyRun]);

  const abort = useCallback(() => {
    abortRef.current?.abort();
    setIsRunning(false);
    setStep(null);
    setActiveInput(null);
  }, []);

  return { run, abort, step, text, isRunning, activeInput, error };
}
