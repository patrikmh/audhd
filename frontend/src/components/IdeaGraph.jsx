/**
 * IdeaGraph — a real node-link graph of ideas (Cytoscape.js), replacing the old
 * hand-rolled SVG radial layout. Nodes: ideas + their top tags as small hubs.
 * Edges: idea → each of its top tags. Runs entirely client-side — no server or
 * Raspberry Pi load added, just a layout computed in the browser from data the
 * app already has (state.ideas).
 *
 * "Time-aware" isn't a special framework feature here: recency is just read off
 * idea.ts and used to fade/shrink older nodes, so the graph visually reads like
 * a fresh cluster of recent thinking with older ideas receding into the background.
 */
import { useEffect, useRef } from "react";
import cytoscape from "cytoscape";

const MAX_TOP_TAGS = 8;
const RECENCY_HALF_LIFE_DAYS = 14;
const UNTAGGED_HUB = "osorterat";

// Cytoscape renders to <canvas> and can't resolve CSS custom properties itself —
// read the live theme's resolved colors once per mount instead of hardcoding hex,
// so the graph matches light/dark like the rest of the app.
function resolvedColors() {
  const css = getComputedStyle(document.documentElement);
  const v = (name, fallback) => css.getPropertyValue(name).trim() || fallback;
  return {
    petrol: v("--petrol", "#4C6E75"),
    petrolDark: v("--petrol-dark", "#3D5960"),
    moss: v("--moss", "#8A977F"),
    ink: v("--ink", "#33393B"),
    card: v("--card", "#FAF9F5"),
    line: v("--line", "#E4E2DA"),
  };
}

export function IdeaGraph({ ideas, onSelect, selectedId }) {
  const containerRef = useRef(null);
  const cyRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const colors = resolvedColors();
    const now = Date.now();

    const tagCounts = {};
    ideas.forEach((i) => (i.tags || []).forEach((t) => { tagCounts[t] = (tagCounts[t] || 0) + 1; }));
    const topTags = Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_TOP_TAGS)
      .map(([t]) => t);

    const elements = topTags.map((tag) => ({
      data: { id: `tag:${tag}`, label: `#${tag}`, kind: "tag" },
    }));
    let anyUntagged = false;

    ideas.forEach((idea) => {
      const ts = idea.ts ? new Date(idea.ts).getTime() : now;
      const ageDays = Math.max(0, (now - ts) / 86400000);
      const recency = Math.pow(0.5, ageDays / RECENCY_HALF_LIFE_DAYS); // 1 = just now, 0.5 at half-life, floors out slowly
      const label = (idea.title || idea.raw || "").slice(0, 30);
      elements.push({ data: { id: idea.id, label, kind: "idea", recency: Math.max(0.25, recency) } });

      const matchedTags = (idea.tags || []).filter((t) => topTags.includes(t));
      if (matchedTags.length > 0) {
        matchedTags.forEach((tag) => {
          elements.push({ data: { id: `${idea.id}::${tag}`, source: `tag:${tag}`, target: idea.id } });
        });
      } else {
        anyUntagged = true;
        elements.push({ data: { id: `${idea.id}::hub`, source: `tag:${UNTAGGED_HUB}`, target: idea.id } });
      }
    });
    if (anyUntagged) {
      elements.unshift({ data: { id: `tag:${UNTAGGED_HUB}`, label: UNTAGGED_HUB, kind: "tag" } });
    }

    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: [
        {
          selector: "node[kind='tag']",
          style: {
            "background-color": colors.petrol,
            "label": "data(label)",
            "color": colors.card,
            "font-size": 11,
            "font-family": "IBM Plex Mono, monospace",
            "text-valign": "center",
            "text-halign": "center",
            "text-wrap": "wrap",
            "text-max-width": "70px",
            "width": 48,
            "height": 48,
          },
        },
        {
          selector: "node[kind='idea']",
          style: {
            "background-color": (el) => (el.id() === selectedId ? colors.petrolDark : colors.moss),
            "width": (el) => 18 + el.data("recency") * 22,
            "height": (el) => 18 + el.data("recency") * 22,
            "border-width": (el) => (el.id() === selectedId ? 3 : 0),
            "border-color": colors.ink,
            "opacity": (el) => 0.45 + el.data("recency") * 0.55,
            "label": "data(label)",
            "color": colors.ink,
            "font-size": 10,
            "font-family": "Atkinson Hyperlegible, sans-serif",
            "text-valign": "bottom",
            "text-margin-y": 4,
            "text-wrap": "wrap",
            "text-max-width": "90px",
          },
        },
        {
          selector: "edge",
          style: {
            "width": 1,
            "line-color": colors.line,
            "curve-style": "bezier",
            "target-arrow-shape": "none",
          },
        },
      ],
      layout: { name: "cose", animate: false, fit: true, padding: 24, nodeRepulsion: 6000 },
      minZoom: 0.4,
      maxZoom: 2.5,
      wheelSensitivity: 0.3,
    });

    cy.on("tap", "node[kind='idea']", (evt) => onSelect(evt.target.id()));

    cyRef.current = cy;
    return () => cy.destroy();
  }, [ideas, selectedId, onSelect]);

  return (
    <div>
      <div
        ref={containerRef}
        style={{ height: 360, borderRadius: 12, border: "1px solid var(--line)", background: "var(--card)" }}
        role="img"
        aria-label={`Idégraf: ${ideas.length} idéer grupperade efter tagg. Använd listvyn för ett tillgängligare alternativ.`}
      />
      <div style={{ fontSize: 11, color: "var(--soft)", textAlign: "center", paddingTop: 6 }}>
        noder = idéer, storlek/ljusstyrka = hur nyligen · knutar = vanligaste taggar · tryck på en idé för att öppna den
      </div>
    </div>
  );
}
