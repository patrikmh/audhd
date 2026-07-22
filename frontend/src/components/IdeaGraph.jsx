/**
 * IdeaGraph — a real timeline graph (D3 force simulation, SVG): ideas and
 * (optionally) tasks positioned on a genuine time axis, not just implied by
 * fading opacity. Runs entirely client-side — no server or Raspberry Pi load,
 * same data the app already has in state.
 *
 * Rendered as SVG rather than canvas specifically so colors can reference the
 * live CSS theme variables directly (fill="var(--petrol)") — no resolving them
 * to hex in JS the way a canvas-based renderer would require.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { forceSimulation, forceManyBody, forceCollide, forceX, forceY } from "d3-force";
import { scaleTime } from "d3-scale";
import { select } from "d3-selection";
import { drag } from "d3-drag";
import { zoom } from "d3-zoom";
import { API_BASE } from "../constants/tokens";
import { getAuth } from "../utils/auth";

const WIDTH = 640;
const HEIGHT = 340;
const MARGIN = { top: 16, right: 20, bottom: 30, left: 20 };
const TAG_PALETTE = ["#4C6E75", "#8A977F", "#A66A4F", "#7A6C9E", "#46564F", "#C08A3E", "#5E86A0", "#9E5C6E"];

function colorForTag(tag) {
  if (!tag) return "var(--moss)";
  let hash = 0;
  for (let i = 0; i < tag.length; i++) hash = (hash * 31 + tag.charCodeAt(i)) >>> 0;
  return TAG_PALETTE[hash % TAG_PALETTE.length];
}

function taskDate(task) {
  if (task.done && task.doneAt) return new Date(task.doneAt);
  if (task.dueBy) return new Date(task.dueBy + "T12:00:00");
  if (task.scheduled_date) return new Date(task.scheduled_date + "T12:00:00");
  if (task.createdAt) return new Date(task.createdAt);
  return null; // purely recurring tasks with no anchor date don't have a timeline position
}

export function IdeaGraph({ ideas, tasks = [], onSelect, selectedId }) {
  const svgRef = useRef(null);
  const simRef = useRef(null);
  const [mode, setMode] = useState("ideer"); // 'ideer' | 'uppgifter' | 'allt'
  const [connections, setConnections] = useState([]); // idea-to-idea only — see services/connections.py

  // Local embedding similarity, not an LLM call — no consent gate on the server
  // side, so nothing here needs to check it either. Ideas-only per the ask;
  // tasks don't get agent-drawn connections (their relationships are already
  // explicit: dates, tags, steps).
  useEffect(() => {
    if (ideas.length < 2) { setConnections([]); return; }
    const controller = new AbortController();
    (async () => {
      try {
        const auth = getAuth();
        const res = await fetch(`${API_BASE}/api/ideas/connections`, {
          headers: auth?.token ? { Authorization: `Bearer ${auth.token}` } : {},
          signal: controller.signal,
        });
        if (!res.ok) return;
        setConnections(await res.json());
      } catch (e) {
        /* silent — connections are an enhancement, never block the graph */
      }
    })();
    return () => controller.abort();
  }, [ideas]);

  const nodes = useMemo(() => {
    const now = Date.now();
    const list = [];
    if (mode !== "uppgifter") {
      for (const idea of ideas) {
        const date = idea.ts ? new Date(idea.ts) : new Date();
        const ageDays = Math.max(0, (now - date.getTime()) / 86400000);
        const recency = Math.pow(0.5, ageDays / 14);
        list.push({
          id: idea.id,
          kind: "idea",
          label: (idea.title || idea.raw || "").slice(0, 30),
          date,
          r: 7 + Math.max(0.25, recency) * 8,
          color: colorForTag((idea.tags || [])[0]),
        });
      }
    }
    if (mode !== "ideer") {
      for (const task of tasks) {
        const date = taskDate(task);
        if (!date) continue;
        list.push({
          id: `task:${task.id}`,
          kind: "task",
          label: task.title.slice(0, 30),
          date,
          r: task.done ? 6 : 9,
          color: task.done ? "var(--soft)" : colorForTag((task.tags || [])[0]),
          done: task.done,
        });
      }
    }
    return list;
  }, [ideas, tasks, mode]);

  useEffect(() => {
    if (!svgRef.current || nodes.length === 0) return;
    const svg = select(svgRef.current);
    svg.selectAll("*").remove();

    const dates = nodes.map((n) => n.date);
    const xScale = scaleTime()
      .domain([new Date(Math.min(...dates)), new Date(Math.max(Date.now(), ...dates))])
      .range([MARGIN.left, WIDTH - MARGIN.right])
      .nice();

    const root = svg.append("g");

    // Time axis: a baseline plus a handful of hand-rolled ticks (skips pulling in
    // d3-axis for something this small).
    const axisY = HEIGHT - MARGIN.bottom;
    root.append("line")
      .attr("x1", MARGIN.left).attr("x2", WIDTH - MARGIN.right)
      .attr("y1", axisY).attr("y2", axisY)
      .attr("stroke", "var(--line)").attr("stroke-width", 1);
    for (const tick of xScale.ticks(5)) {
      const x = xScale(tick);
      root.append("line")
        .attr("x1", x).attr("x2", x).attr("y1", axisY).attr("y2", axisY + 5)
        .attr("stroke", "var(--soft)").attr("stroke-width", 1);
      root.append("text")
        .attr("x", x).attr("y", axisY + 17).attr("text-anchor", "middle")
        .attr("font-size", 10).attr("font-family", "IBM Plex Mono, monospace").attr("fill", "var(--soft)")
        .text(new Intl.DateTimeFormat("sv-SE", { day: "numeric", month: "short" }).format(tick));
    }
    // "nu" marker
    const nowX = xScale(new Date());
    root.append("line")
      .attr("x1", nowX).attr("x2", nowX).attr("y1", MARGIN.top).attr("y2", axisY)
      .attr("stroke", "var(--warn)").attr("stroke-width", 1).attr("stroke-dasharray", "3,3").attr("opacity", 0.6);

    const linkLayer = root.append("g");
    const nodeLayer = root.append("g");

    const nodeById = new Map(nodes.map((n) => [n.id, n]));
    const links = mode === "ideer"
      ? connections
          .filter((c) => nodeById.has(c.a) && nodeById.has(c.b))
          .map((c) => ({ source: nodeById.get(c.a), target: nodeById.get(c.b), score: c.score }))
      : [];
    const linkSel = linkLayer.selectAll("line")
      .data(links)
      .join("line")
      .attr("stroke", "var(--petrol)")
      .attr("stroke-width", (d) => 0.5 + d.score * 2)
      .attr("opacity", (d) => 0.15 + d.score * 0.35);

    const nodeSel = nodeLayer.selectAll("g")
      .data(nodes, (d) => d.id)
      .join("g")
      .style("cursor", (d) => (d.kind === "idea" ? "pointer" : "default"))
      .call(
        drag()
          .on("start", (event, d) => { if (!event.active) sim.alphaTarget(0.15).restart(); d.fy = d.y; })
          .on("drag", (event, d) => { d.fy = event.y; })
          .on("end", (event, d) => { if (!event.active) sim.alphaTarget(0); d.fy = null; })
      )
      .on("click", (event, d) => { if (d.kind === "idea") onSelect(d.id); });

    nodeSel.append("circle")
      .attr("r", (d) => d.r)
      .attr("fill", (d) => d.color)
      .attr("stroke", (d) => (d.id === selectedId ? "var(--ink)" : d.kind === "task" ? "var(--card)" : "none"))
      .attr("stroke-width", (d) => (d.id === selectedId ? 3 : d.kind === "task" ? 1.5 : 0))
      .attr("opacity", (d) => (d.kind === "task" && d.done ? 0.55 : 1));

    nodeSel.filter((d) => d.kind === "task").append("text")
      .text("✓").attr("text-anchor", "middle").attr("dy", 3).attr("font-size", 9)
      .attr("fill", "var(--card)").style("pointer-events", "none")
      .style("display", (d) => (d.done ? null : "none"));

    nodeSel.append("text")
      .text((d) => d.label)
      .attr("text-anchor", "middle")
      .attr("y", (d) => d.r + 11)
      .attr("font-size", 10)
      .attr("font-family", "Atkinson Hyperlegible, sans-serif")
      .attr("fill", "var(--ink)")
      .style("pointer-events", "none");

    const sim = forceSimulation(nodes)
      .force("x", forceX((d) => xScale(d.date)).strength(0.9))
      .force("y", forceY(HEIGHT / 2 - 10).strength(0.06))
      .force("charge", forceManyBody().strength(-18))
      .force("collide", forceCollide((d) => d.r + 14))
      .on("tick", () => {
        const clampY = (d) => Math.min(axisY - 20, Math.max(MARGIN.top + 10, d.y));
        nodeSel.attr("transform", (d) => `translate(${d.x},${clampY(d)})`);
        linkSel
          .attr("x1", (d) => d.source.x).attr("y1", (d) => clampY(d.source))
          .attr("x2", (d) => d.target.x).attr("y2", (d) => clampY(d.target));
      });
    simRef.current = sim;

    svg.call(
      zoom()
        .scaleExtent([0.6, 3])
        .on("zoom", (event) => root.attr("transform", event.transform))
    );

    return () => sim.stop();
  }, [nodes, selectedId, onSelect, connections, mode]);

  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
        {[["ideer", "idéer"], ["uppgifter", "uppgifter"], ["allt", "allt"]].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setMode(key)}
            style={{
              fontSize: 12, padding: "4px 10px", borderRadius: 20, cursor: "pointer", fontFamily: "inherit",
              border: `1px solid ${mode === key ? "var(--petrol)" : "var(--line)"}`,
              background: mode === key ? "var(--petrol)" : "transparent",
              color: mode === key ? "white" : "var(--ink)",
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        width="100%"
        style={{ display: "block", borderRadius: 12, border: "1px solid var(--line)", background: "var(--card)" }}
        role="img"
        aria-label={`Tidslinjegraf: ${nodes.length} noder från äldst till nu. Använd listvyn för ett tillgängligare alternativ.`}
      />
      <div style={{ fontSize: 11, color: "var(--soft)", textAlign: "center", paddingTop: 6 }}>
        vänster→höger = tid, streckad linje = nu · storlek/färg = taggkategori och nyhet
        {mode === "ideer" && " · linjer = idéer agenten tycker hänger ihop"} · dra för att flytta, tryck en idé för att öppna den
      </div>
    </div>
  );
}
