"""A2UI message helpers — wrappers that produce complete A2UI payloads.

These are the messages agents emit. Each returns a list of dicts
(createSurface + updateComponents + updateDataModel) that get
wrapped inside AG-UI Custom events.
"""
from __future__ import annotations

from .catalog import (
    create_surface,
    update_components,
    update_data_model,
    text,
    card,
    row,
    icon,
    divider,
    badge,
    tool_suggestion,
    energy_picker,
    breathing_widget,
    recovery_menu,
    progress_bar,
    quick_capture,
)


def classify_result(
    title: str,
    category: str,
    energy: int = 2,
    icon_name: str = "",
) -> list[dict]:
    """A2UI surface for Sorteraren classification result."""
    sid = f"classify-{title[:20].replace(' ', '-')}"
    return [
        create_surface(sid),
        update_components(sid, [
            card(f"{sid}-root", [f"{sid}-header", f"{sid}-divider", f"{sid}-meta"]),
            row(f"{sid}-header", [f"{sid}-icon", f"{sid}-title"]),
            icon(f"{sid}-icon", icon_name or ("📌" if category == "idea" else "✅")),
            text(f"{sid}-title", title, style="h3"),
            divider(f"{sid}-divider"),
            row(f"{sid}-meta", [f"{sid}-cat", f"{sid}-energy"]),
            badge(f"{sid}-cat", category),
            badge(f"{sid}-energy", f"{energy}⚡"),
        ]),
        update_data_model(sid, {"title": title, "category": category, "energy": energy}),
    ]


def refine_result(title: str, note: str) -> list[dict]:
    """A2UI surface for Förfinaren refined idea."""
    sid = f"refine-{title[:20].replace(' ', '-')}"
    return [
        create_surface(sid),
        update_components(sid, [
            card(f"{sid}-root", [f"{sid}-header", f"{sid}-divider", f"{sid}-body"]),
            row(f"{sid}-header", [f"{sid}-icon", f"{sid}-title"]),
            icon(f"{sid}-icon", "✨"),
            text(f"{sid}-title", title, style="h3"),
            divider(f"{sid}-divider"),
            text(f"{sid}-body", note),
        ]),
        update_data_model(sid, {"title": title, "note": note}),
    ]


def breakdown_result(title: str, steps: list[str], energy: int = 2) -> list[dict]:
    """A2UI surface for Nedbrytaren task breakdown."""
    sid = f"breakdown-{title[:20].replace(' ', '-')}"
    step_components = []
    for i, step in enumerate(steps):
        step_components.extend([
            row(f"{sid}-step-{i}", [f"{sid}-step-num-{i}", f"{sid}-step-text-{i}"]),
            badge(f"{sid}-step-num-{i}", str(i + 1)),
            text(f"{sid}-step-text-{i}", step),
        ])
    return [
        create_surface(sid),
        update_components(sid, [
            card(f"{sid}-root", [
                f"{sid}-header", f"{sid}-divider",
                *[f"{sid}-step-{i}" for i in range(len(steps))],
            ]),
            row(f"{sid}-header", [f"{sid}-icon", f"{sid}-title"]),
            icon(f"{sid}-icon", "🔧"),
            text(f"{sid}-title", title, style="h3"),
            divider(f"{sid}-divider"),
            *step_components,
        ]),
        update_data_model(sid, {"title": title, "steps": steps, "energy": energy}),
    ]


def observer_suggestion(tool_name: str, label: str, description: str, reason: str) -> list[dict]:
    """A2UI surface for Observatören tool suggestion."""
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


def energy_status(current_energy: str, capacity: int) -> list[dict]:
    """A2UI surface showing current energy status."""
    sid = "energy-status"
    return [
        create_surface(sid),
        update_components(sid, [
            card(f"{sid}-root", [f"{sid}-header", f"{sid}-picker"]),
            row(f"{sid}-header", [f"{sid}-icon", f"{sid}-title"]),
            icon(f"{sid}-icon", "⚡"),
            text(f"{sid}-title", "Energiläge", style="h3"),
            energy_picker(f"{sid}-picker", current=current_energy),
        ]),
        update_data_model(sid, {"currentEnergy": current_energy, "capacity": capacity}),
    ]


def breathing_guide() -> list[dict]:
    """A2UI surface for breathing exercise."""
    sid = "breathing"
    return [
        create_surface(sid),
        update_components(sid, [
            card(f"{sid}-root", [f"{sid}-header", f"{sid}-widget"]),
            row(f"{sid}-header", [f"{sid}-icon", f"{sid}-title"]),
            icon(f"{sid}-icon", "🫁"),
            text(f"{sid}-title", "Andningsövning", style="h3"),
            breathing_widget(f"{sid}-widget"),
        ]),
    ]


def recovery_suggestion(reason: str) -> list[dict]:
    """A2UI surface for recovery menu when energy is low."""
    sid = "recovery"
    return [
        create_surface(sid),
        update_components(sid, [
            card(f"{sid}-root", [f"{sid}-header", f"{sid}-divider", f"{sid}-menu"]),
            row(f"{sid}-header", [f"{sid}-icon", f"{sid}-title"]),
            icon(f"{sid}-icon", "🔋"),
            text(f"{sid}-title", "Rekommenderat", style="h3"),
            divider(f"{sid}-divider"),
            recovery_menu(f"{sid}-menu", reason=reason),
        ]),
    ]


def progress_update(completed: int, total: int, label: str = "") -> list[dict]:
    """A2UI surface for task progress."""
    sid = "progress"
    pct = completed / total if total > 0 else 0
    return [
        create_surface(sid),
        update_components(sid, [
            card(f"{sid}-root", [f"{sid}-bar", f"{sid}-label"]),
            progress_bar(f"{sid}-bar", value=pct, label=f"{completed}/{total}"),
            text(f"{sid}-label", label or f"{completed} av {total} klara"),
        ]),
        update_data_model(sid, {"completed": completed, "total": total}),
    ]


def capture_input(placeholder: str = "Fångsta en tanke...") -> list[dict]:
    """A2UI surface for quick capture."""
    sid = "capture"
    return [
        create_surface(sid),
        update_components(sid, [
            quick_capture(f"{sid}-input", placeholder=placeholder),
        ]),
    ]
