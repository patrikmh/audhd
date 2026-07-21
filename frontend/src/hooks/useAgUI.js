/**
 * AG-UI client hook for Varv.
 *
 * Connects to the backend SSE endpoint and parses AG-UI events
 * into a structured state the React UI can consume.
 *
 * Usage:
 *   const { run, events, state, active, error } = useAgUI();
 *   await run("classify", "some raw text");
 */
import { useState, useRef, useCallback } from "react";
import { getAuth } from "../utils/auth";
import { API_BASE } from "../constants/tokens";

// AG-UI event types as sent by the backend (SCREAMING_SNAKE_CASE)
const EVENT_TYPES = {
  RUN_STARTED: "RUN_STARTED",
  RUN_FINISHED: "RUN_FINISHED",
  RUN_ERROR: "RUN_ERROR",
  STEP_STARTED: "STEP_STARTED",
  STEP_FINISHED: "STEP_FINISHED",
  TEXT_MESSAGE_START: "TEXT_MESSAGE_START",
  TEXT_MESSAGE_CONTENT: "TEXT_MESSAGE_CONTENT",
  TEXT_MESSAGE_END: "TEXT_MESSAGE_END",
  TOOL_CALL_START: "TOOL_CALL_START",
  TOOL_CALL_ARGS: "TOOL_CALL_ARGS",
  TOOL_CALL_END: "TOOL_CALL_END",
  TOOL_CALL_RESULT: "TOOL_CALL_RESULT",
  STATE_SNAPSHOT: "STATE_SNAPSHOT",
  STATE_DELTA: "STATE_DELTA",
  CUSTOM: "CUSTOM",
};

export function useAgUI() {
  const [events, setEvents] = useState([]);
  const [state, setState] = useState({});
  const [active, setActive] = useState(false);
  const [error, setError] = useState(null);
  const [messages, setMessages] = useState([]);
  const [steps, setSteps] = useState([]);
  const [toolCalls, setToolCalls] = useState([]);
  const [a2uiSurfaces, setA2uiSurfaces] = useState([]);
  const abortRef = useRef(null);
  const eventsRef = useRef([]);

  const reset = useCallback(() => {
    setEvents([]);
    setState({});
    setError(null);
    setMessages([]);
    setSteps([]);
    setToolCalls([]);
    setA2uiSurfaces([]);
    eventsRef.current = [];
  }, []);

  /**
   * Run an agent via AG-UI SSE streaming.
   * @param {string} agent - Agent name: classify | refine | breakdown | observer
   * @param {string} input - User input text
   * @param {object} agentState - Current app state (for observer)
   * @param {boolean} a2ui - Whether to use A2UI endpoint
   */
  const run = useCallback(async (agent, input, agentState = {}, a2ui = false) => {
    reset();
    setActive(true);
    setError(null);

    const threadId = crypto.randomUUID();
    const runId = crypto.randomUUID();
    const endpoint = a2ui ? "/api/ag-ui/run/a2ui" : "/api/ag-ui/run";

    const auth = getAuth();

    try {
      const auth = getAuth();
      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
          ...(auth?.token ? { Authorization: `Bearer ${auth.token}` } : {}),
        },
        body: JSON.stringify({
          thread_id: threadId,
          run_id: runId,
          agent,
          input,
          state: agentState,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`AG-UI error ${res.status}: ${text}`);
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
          const data = line.slice(6).trim();
          if (!data) continue;

          try {
            const event = JSON.parse(data);
            eventsRef.current.push(event);
            setEvents([...eventsRef.current]);
            handleEvent(event);
          } catch {
            // skip malformed lines
          }
        }
      }

      // Process remaining buffer
      if (buffer.startsWith("data: ")) {
        try {
          const event = JSON.parse(buffer.slice(6).trim());
          eventsRef.current.push(event);
          setEvents([...eventsRef.current]);
          handleEvent(event);
        } catch { /* skip */ }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setActive(false);
    }
  }, [reset]);

  function handleEvent(event) {
    const t = event.type;

    if (t === EVENT_TYPES.RUN_ERROR) {
      setError(event.message || "Unknown error");
    }

    if (t === EVENT_TYPES.STEP_STARTED) {
      setSteps((s) => [...s, { name: event.step_name || event.name, status: "active" }]);
    }
    if (t === EVENT_TYPES.STEP_FINISHED) {
      setSteps((s) =>
        s.map((step) =>
          step.name === (event.step_name || event.name) ? { ...step, status: "done" } : step
        )
      );
    }

    if (t === EVENT_TYPES.TEXT_MESSAGE_CONTENT) {
      setMessages((m) => {
        const idx = m.findIndex((msg) => msg.id === event.message_id);
        if (idx >= 0) {
          const updated = [...m];
          updated[idx] = { ...updated[idx], text: updated[idx].text + (event.delta || "") };
          return updated;
        }
        return [...m, { id: event.message_id, text: event.delta || "" }];
      });
    }

    if (t === EVENT_TYPES.TOOL_CALL_START) {
      setToolCalls((tc) => [
        ...tc,
        { id: event.tool_call_id, name: event.tool_name, status: "running", args: "" },
      ]);
    }
    if (t === EVENT_TYPES.TOOL_CALL_ARGS) {
      setToolCalls((tc) =>
        tc.map((tc2) =>
          tc2.id === event.tool_call_id ? { ...tc2, args: event.args } : tc2
        )
      );
    }
    if (t === EVENT_TYPES.TOOL_CALL_END) {
      setToolCalls((tc) =>
        tc.map((tc2) =>
          tc2.id === event.tool_call_id ? { ...tc2, status: "done" } : tc2
        )
      );
    }
    if (t === EVENT_TYPES.TOOL_CALL_RESULT) {
      setToolCalls((tc) =>
        tc.map((tc2) =>
          tc2.id === event.tool_call_id
            ? { ...tc2, status: "done", result: event.content }
            : tc2
        )
      );
    }

    if (t === EVENT_TYPES.STATE_SNAPSHOT) {
      setState(event.snapshot || {});
    }
    if (t === EVENT_TYPES.STATE_DELTA && event.patch) {
      setState((prev) => applyJsonPatch(prev, event.patch));
    }

    // A2UI surfaces arrive as Custom events
    if (t === EVENT_TYPES.CUSTOM && event.name === "a2ui_message") {
      setA2uiSurfaces((s) => [...s, event.value]);
    }
  }

  function applyJsonPatch(state, patch) {
    let next = { ...state };
    for (const op of patch) {
      if (op.op === "add") {
        const parts = op.path.split("/").filter(Boolean);
        let target = next;
        for (let i = 0; i < parts.length - 1; i++) {
          if (!target[parts[i]]) target[parts[i]] = {};
          target = target[parts[i]];
        }
        target[parts[parts.length - 1]] = op.value;
      } else if (op.op === "replace") {
        const parts = op.path.split("/").filter(Boolean);
        let target = next;
        for (let i = 0; i < parts.length - 1; i++) {
          target = target[parts[i]];
        }
        target[parts[parts.length - 1]] = op.value;
      } else if (op.op === "remove") {
        const parts = op.path.split("/").filter(Boolean);
        let target = next;
        for (let i = 0; i < parts.length - 1; i++) {
          target = target[parts[i]];
        }
        delete target[parts[parts.length - 1]];
      }
    }
    return next;
  }

  return {
    run,
    events,
    state,
    active,
    error,
    messages,
    steps,
    toolCalls,
    a2uiSurfaces,
    reset,
  };
}
