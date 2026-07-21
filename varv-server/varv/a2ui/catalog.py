"""A2UI Varv Component Catalog.

Defines which UI components agents can emit and their schemas.
Agents reference these by ID when building A2UI messages.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any


class VarvComponent(str, Enum):
    """Components agents can use."""
    # Layout
    COLUMN = "Column"
    ROW = "Row"
    CARD = "Card"
    SPACER = "Spacer"

    # Content
    TEXT = "Text"
    ICON = "Icon"
    BADGE = "Badge"
    DIVIDER = "Divider"

    # Varv-specific
    TASK_CARD = "TaskCard"
    ENERGY_PICKER = "EnergyPicker"
    BREATHING_WIDGET = "BreathingWidget"
    TOOL_SUGGESTION = "ToolSuggestion"
    MORNING_CHECKIN = "MorningCheckin"
    PROGRESS_BAR = "ProgressBar"
    QUICK_CAPTURE = "QuickCapture"
    RECOVERY_MENU = "RecoveryMenu"


@dataclass
class A2UIComponent:
    """Single component in an A2UI surface (adjacency list model)."""
    id: str
    component: dict[str, Any]
    # Parent reference for adjacency list (optional, inferred from children)


@dataclass
class A2UISurface:
    """A complete UI surface — the root object agents emit."""
    surface_id: str
    catalog: str = "varv"
    components: list[dict] = field(default_factory=list)
    data_model: dict = field(default_factory=dict)


# ── Builder helpers ──────────────────────────────────────────────────────────

def text(id: str, content: str, style: str = "") -> dict:
    comp = {"text": {"literalString": content}}
    if style:
        comp["style"] = style
    return {"id": id, "component": {"Text": comp}}


def text_bound(id: str, path: str, style: str = "") -> dict:
    comp = {"text": {"path": path}}
    if style:
        comp["style"] = style
    return {"id": id, "component": {"Text": comp}}


def column(id: str, children: list[str]) -> dict:
    return {"id": id, "component": {"Column": {"children": {"explicitList": children}}}}


def row(id: str, children: list[str]) -> dict:
    return {"id": id, "component": {"Row": {"children": {"explicitList": children}}}}


def card(id: str, children: list[str], action: str = "") -> dict:
    comp: dict[str, Any] = {"Card": {"children": {"explicitList": children}}}
    if action:
        comp["Card"]["action"] = {"name": action}
    return {"id": id, "component": comp}


def icon(id: str, name: str) -> dict:
    return {"id": id, "component": {"Icon": {"name": {"literalString": name}}}}


def badge(id: str, text_content: str, color: str = "") -> dict:
    comp: dict[str, Any] = {"text": {"literalString": text_content}}
    if color:
        comp["color"] = {"literalString": color}
    return {"id": id, "component": {"Badge": comp}}


def divider(id: str) -> dict:
    return {"id": id, "component": {"Divider": {}}}


def spacer(id: str, height: int = 8) -> dict:
    return {"id": id, "component": {"Spacer": {"height": height}}}


# ── Varv-specific components ─────────────────────────────────────────────────

def task_card(id: str, title: str, energy: int, icon_name: str = "", time: str = "", steps: list[str] | None = None) -> dict:
    """Render a Varv task card."""
    comp: dict[str, Any] = {
        "TaskCard": {
            "title": {"literalString": title},
            "energy": energy,
        }
    }
    if icon_name:
        comp["TaskCard"]["icon"] = {"literalString": icon_name}
    if time:
        comp["TaskCard"]["time"] = {"literalString": time}
    if steps:
        comp["TaskCard"]["steps"] = {"literalList": [{"literalString": s} for s in steps]}
    return {"id": id, "component": comp}


def tool_suggestion(id: str, tool_name: str, label: str, description: str, icon_name: str = "") -> dict:
    """Agent suggests a tool for the user."""
    comp: dict[str, Any] = {
        "ToolSuggestion": {
            "toolName": {"literalString": tool_name},
            "label": {"literalString": label},
            "description": {"literalString": description},
        }
    }
    if icon_name:
        comp["ToolSuggestion"]["icon"] = {"literalString": icon_name}
    return {"id": id, "component": comp}


def energy_picker(id: str, current: str = "") -> dict:
    comp: dict[str, Any] = {"EnergyPicker": {}}
    if current:
        comp["EnergyPicker"]["current"] = {"literalString": current}
    return {"id": id, "component": comp}


def breathing_widget(id: str) -> dict:
    return {"id": id, "component": {"BreathingWidget": {}}}


def recovery_menu(id: str, reason: str = "") -> dict:
    comp: dict[str, Any] = {"RecoveryMenu": {}}
    if reason:
        comp["RecoveryMenu"]["reason"] = {"literalString": reason}
    return {"id": id, "component": comp}


def morning_checkin(id: str) -> dict:
    return {"id": id, "component": {"MorningCheckin": {}}}


def progress_bar(id: str, value: float = 0.0, label: str = "") -> dict:
    comp: dict[str, Any] = {"ProgressBar": {"value": value}}
    if label:
        comp["ProgressBar"]["label"] = {"literalString": label}
    return {"id": id, "component": comp}


def quick_capture(id: str, placeholder: str = "") -> dict:
    comp: dict[str, Any] = {"QuickCapture": {}}
    if placeholder:
        comp["QuickCapture"]["placeholder"] = {"literalString": placeholder}
    return {"id": id, "component": comp}


# ── Message builders ─────────────────────────────────────────────────────────

def create_surface(surface_id: str, catalog: str = "varv") -> dict:
    """CreateSurface message — initiates a new UI surface."""
    return {
        "type": "createSurface",
        "surfaceId": surface_id,
        "catalog": catalog,
    }


def update_components(surface_id: str, components: list[dict]) -> dict:
    """UpdateComponents message — sends/updates component definitions."""
    return {
        "type": "updateComponents",
        "surfaceId": surface_id,
        "components": components,
    }


def update_data_model(surface_id: str, data: dict) -> dict:
    """UpdateDataModel message — sends data to bind to components."""
    return {
        "type": "updateDataModel",
        "surfaceId": surface_id,
        "data": data,
    }


def delete_surface(surface_id: str) -> dict:
    """DeleteSurface message — removes a UI surface."""
    return {
        "type": "deleteSurface",
        "surfaceId": surface_id,
    }


# ── Pre-built surfaces ──────────────────────────────────────────────────────

def observer_suggestion(tool_name: str, label: str, description: str, reason: str) -> list[dict]:
    """Build a complete A2UI surface for an Observatören tool suggestion."""
    sid = f"observer-{tool_name}"
    return [
        create_surface(sid),
        update_components(sid, [
            card(f"{sid}-root", [f"{sid}-header", f"{sid}-divider", f"{sid}-body", f"{sid}-tool"]),
            row(f"{sid}-header", [f"{sid}-icon", f"{sid}-title"]),
            icon(f"{sid}-icon", "💡"),
            text(f"{sid}-title", label, style="h3"),
            divider(f"{sid}-divider"),
            text(f"{sid}-body", reason),
            tool_suggestion(f"{sid}-tool", tool_name, label, description, icon_name="⚡"),
        ]),
    ]


def breakdown_surface(title: str, steps: list[str], energy: int = 2) -> list[dict]:
    """Build a complete A2UI surface for a Nedbrytaren task breakdown."""
    sid = f"breakdown-{title[:20].replace(' ', '-')}"
    step_ids = [f"{sid}-step-{i}" for i in range(len(steps))]
    return [
        create_surface(sid),
        update_components(sid, [
            card(f"{sid}-root", [f"{sid}-header", f"{sid}-divider", *step_ids]),
            row(f"{sid}-header", [f"{sid}-icon", f"{sid}-title"]),
            icon(f"{sid}-icon", "🔧"),
            text(f"{sid}-title", title, style="h3"),
            divider(f"{sid}-divider"),
            *[task_card(sid, steps[i], energy, time="", steps=None) for i, sid in enumerate(step_ids)],
        ]),
        update_data_model(sid, {"title": title, "steps": steps, "energy": energy}),
    ]
