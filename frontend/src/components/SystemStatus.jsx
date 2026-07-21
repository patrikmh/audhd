/**
 * SystemStatus - Clear system status indicators to reduce anxiety.
 * Shows sync status, agent status, and system health for ADHD users.
 * Auto-collapses after 10s — tap to expand.
 */

import { useState, useEffect } from "react";
import { T } from "../constants/tokens";

export function SystemStatus({ sync, agents, lastSync, onSyncClick }) {
  const [expanded, setExpanded] = useState(true);

  // Auto-collapse after 10 seconds
  useEffect(() => {
    if (!expanded) return;
    const t = setTimeout(() => setExpanded(false), 10000);
    return () => clearTimeout(t);
  }, [expanded]);

  const syncStatus = lastSync
    ? { text: `Synkade ${getTimeAgo(lastSync)}`, status: "success", showAction: false }
    : sync.err
    ? { text: `Synk fel: ${sync.err}`, status: "error", showAction: true }
    : sync.syncing
    ? { text: "Synkroniserar...", status: "working", showAction: false }
    : { text: "Synk redo", status: "idle", showAction: true };

  const agentStatus = Object.entries(agents).filter(
    ([key, value]) => key !== "observer" && value === true
  );

  const statusColor =
    syncStatus.status === "success"
      ? T.moss
      : syncStatus.status === "error"
      ? T.warn
      : syncStatus.status === "working"
      ? T.petrol
      : T.soft;

  // Collapsed: just a small dot
  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        style={{
          position: "fixed",
          bottom: 80,
          right: 16,
          zIndex: 1000,
          width: 32,
          height: 32,
          borderRadius: 16,
          background: T.card,
          border: `1.5px solid ${statusColor}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
          padding: 0,
        }}
        aria-label="Visa systemstatus"
      >
        <div
          style={{
            width: 10,
            height: 10,
            borderRadius: 5,
            background: statusColor,
          }}
        />
      </button>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        bottom: 80,
        right: 16,
        zIndex: 1000,
        display: "flex",
        flexDirection: "column",
        gap: 6,
        alignItems: "flex-end",
        maxHeight: "50vh",
        overflow: "auto",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Agent status */}
      {agentStatus.length > 0 && (
        <div
          style={{
            background: T.card,
            border: `1px solid ${T.line}`,
            borderRadius: 10,
            padding: "6px 10px",
            maxWidth: 260,
            boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              color: T.ink,
            }}
          >
            <div
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: T.moss,
                flexShrink: 0,
              }}
            />
            <span>
              {agentStatus.length} agent
              {agentStatus.length > 1 ? "er" : ""}:{" "}
              {agentStatus.map(([k]) => k).join(", ")}
            </span>
          </div>
        </div>
      )}

      {/* Sync status */}
      <div
        style={{
          background: T.card,
          border: `1px solid ${syncStatus.status === "error" ? T.warn : T.line}`,
          borderRadius: 10,
          padding: "8px 12px",
          maxWidth: 280,
          boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
          cursor: syncStatus.showAction ? "pointer" : "default",
        }}
        onClick={syncStatus.showAction ? onSyncClick : undefined}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div
            style={{
              width: 14,
              height: 14,
              borderRadius: 7,
              background: statusColor,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 9,
              color: "white",
              flexShrink: 0,
            }}
          >
            {syncStatus.status === "success" && "\u2713"}
            {syncStatus.status === "error" && "!"}
            {syncStatus.status === "working" && "\u2192"}
            {syncStatus.status === "idle" && "\u25CB"}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 13,
                fontWeight: 500,
                color: T.ink,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {syncStatus.text}
            </div>

            {syncStatus.showAction && (
              <div style={{ fontSize: 11, color: T.petrol, marginTop: 1 }}>
                Klicka för att synka
              </div>
            )}

            {syncStatus.status === "working" && sync.working && (
              <div style={{ fontSize: 11, color: T.soft, marginTop: 1 }}>
                {sync.working.changes || 0} ändringar
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Collapse button */}
      <button
        onClick={() => setExpanded(false)}
        style={{
          background: "none",
          border: "none",
          fontSize: 11,
          color: T.soft,
          cursor: "pointer",
          padding: "2px 4px",
        }}
      >
        stäng
      </button>
    </div>
  );
}

function getTimeAgo(timestamp) {
  if (!timestamp) return "aldrig";
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  if (minutes < 1) return "just nu";
  if (minutes < 60) return `${minutes} min${minutes > 1 ? "er" : ""} sedan`;
  if (hours < 24) return `${hours} tim${hours > 1 ? "mar" : ""} sedan`;
  return `${Math.floor(hours / 24)} dag${Math.floor(hours / 24) > 1 ? "ar" : ""} sedan`;
}
