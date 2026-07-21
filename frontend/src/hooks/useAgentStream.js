/**
 * useAgentStream — streams AG-UI events from the backend for the main app flows.
 *
 * Usage:
 *   const { run, step, text, isRunning, error } = useAgentStream();
 *   const result = await run("classify", "tvätta bilen");
 *   // result = { type: "task", title: "Tvätta bilen", tags: [...], energy: 2, ... }
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

const STEP_LABELS = {
  classify: "Sorteraren klassificerar",
  refine: "Förfinaren städar",
  breakdown: "Nedbrytaren bryter ner",
  observer: "Observatören analyserar",
};

export function useAgentStream() {
  const [step, setStep] = useState(null);      // current step name
  const [text, setText] = useState("");        // accumulated text
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState(null);
  const abortRef = useRef(null);

  const run = useCallback(async (agent, input, agentState = {}) => {
    setIsRunning(true);
    setError(null);
    setStep(STEP_LABELS[agent] || agent);
    setText("");

    const auth = getAuth();
    const controller = new AbortController();
    abortRef.current = controller;

    let result = null;

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
      if (e.name !== "AbortError") setError(e.message);
      result = null;
    } finally {
      setIsRunning(false);
      setStep(null);
      abortRef.current = null;
    }

    return result;
  }, []);

  const abort = useCallback(() => {
    abortRef.current?.abort();
    setIsRunning(false);
    setStep(null);
  }, []);

  return { run, abort, step, text, isRunning, error };
}
