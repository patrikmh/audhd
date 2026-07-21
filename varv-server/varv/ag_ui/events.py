"""AG-UI event types.

Minimal Python implementation of the AG-UI event protocol.
Each event is a typed dict with a `type` discriminator.
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import Any


class EventType(str, Enum):
    # Lifecycle
    RUN_STARTED = "RUN_STARTED"
    RUN_FINISHED = "RUN_FINISHED"
    RUN_ERROR = "RUN_ERROR"
    STEP_STARTED = "STEP_STARTED"
    STEP_FINISHED = "STEP_FINISHED"

    # Text messages
    TEXT_MESSAGE_START = "TEXT_MESSAGE_START"
    TEXT_MESSAGE_CONTENT = "TEXT_MESSAGE_CONTENT"
    TEXT_MESSAGE_END = "TEXT_MESSAGE_END"

    # Tool calls
    TOOL_CALL_START = "TOOL_CALL_START"
    TOOL_CALL_ARGS = "TOOL_CALL_ARGS"
    TOOL_CALL_END = "TOOL_CALL_END"
    TOOL_CALL_RESULT = "TOOL_CALL_RESULT"

    # State
    STATE_SNAPSHOT = "STATE_SNAPSHOT"
    STATE_DELTA = "STATE_DELTA"

    # Messages snapshot
    MESSAGES_SNAPSHOT = "MESSAGES_SNAPSHOT"

    # A2UI (custom for Varv — carries generative UI payloads)
    CUSTOM = "CUSTOM"


def _uuid() -> str:
    return str(uuid.uuid4())


@dataclass
class RunStartedEvent:
    type: str = EventType.RUN_STARTED
    thread_id: str = ""
    run_id: str = ""


@dataclass
class RunFinishedEvent:
    type: str = EventType.RUN_FINISHED
    thread_id: str = ""
    run_id: str = ""


@dataclass
class RunErrorEvent:
    type: str = EventType.RUN_ERROR
    message: str = ""


@dataclass
class StepStartedEvent:
    type: str = EventType.STEP_STARTED
    step_name: str = ""


@dataclass
class StepFinishedEvent:
    type: str = EventType.STEP_FINISHED
    step_name: str = ""


@dataclass
class TextMessageStartEvent:
    type: str = EventType.TEXT_MESSAGE_START
    message_id: str = ""
    role: str = "assistant"


@dataclass
class TextMessageContentEvent:
    type: str = EventType.TEXT_MESSAGE_CONTENT
    message_id: str = ""
    delta: str = ""


@dataclass
class TextMessageEndEvent:
    type: str = EventType.TEXT_MESSAGE_END
    message_id: str = ""


@dataclass
class ToolCallStartEvent:
    type: str = EventType.TOOL_CALL_START
    tool_call_id: str = ""
    tool_call_name: str = ""
    parent_message_id: str = ""


@dataclass
class ToolCallArgsEvent:
    type: str = EventType.TOOL_CALL_ARGS
    tool_call_id: str = ""
    delta: str = ""


@dataclass
class ToolCallEndEvent:
    type: str = EventType.TOOL_CALL_END
    tool_call_id: str = ""


@dataclass
class ToolCallResultEvent:
    type: str = EventType.TOOL_CALL_RESULT
    tool_call_id: str = ""
    content: str = ""
    message_id: str = ""
    role: str = "tool"


@dataclass
class StateSnapshotEvent:
    type: str = EventType.STATE_SNAPSHOT
    snapshot: dict = field(default_factory=dict)


@dataclass
class StateDeltaEvent:
    type: str = EventType.STATE_DELTA
    delta: list = field(default_factory=list)  # JSON Patch RFC 6902


@dataclass
class CustomEvent:
    """Custom event for A2UI payloads carried inside AG-UI stream."""
    type: str = EventType.CUSTOM
    name: str = ""  # e.g. "a2ui_message"
    value: Any = None


# Convenience constructors ---------------------------------------------------

def run_started(thread_id: str, run_id: str | None = None) -> RunStartedEvent:
    return RunStartedEvent(thread_id=thread_id, run_id=run_id or _uuid())


def run_finished(thread_id: str, run_id: str) -> RunFinishedEvent:
    return RunFinishedEvent(thread_id=thread_id, run_id=run_id)


def run_error(message: str) -> RunErrorEvent:
    return RunErrorEvent(message=message)


def step_started(name: str) -> StepStartedEvent:
    return StepStartedEvent(step_name=name)


def step_finished(name: str) -> StepFinishedEvent:
    return StepFinishedEvent(step_name=name)


def text_start(message_id: str | None = None) -> TextMessageStartEvent:
    return TextMessageStartEvent(message_id=message_id or _uuid())


def text_delta(message_id: str, delta: str) -> TextMessageContentEvent:
    return TextMessageContentEvent(message_id=message_id, delta=delta)


def text_end(message_id: str) -> TextMessageEndEvent:
    return TextMessageEndEvent(message_id=message_id)


def tool_start(name: str, tool_call_id: str | None = None, parent_message_id: str = "") -> ToolCallStartEvent:
    return ToolCallStartEvent(
        tool_call_id=tool_call_id or _uuid(),
        tool_call_name=name,
        parent_message_id=parent_message_id,
    )


def tool_args(tool_call_id: str, delta: str) -> ToolCallArgsEvent:
    return ToolCallArgsEvent(tool_call_id=tool_call_id, delta=delta)


def tool_end(tool_call_id: str) -> ToolCallEndEvent:
    return ToolCallEndEvent(tool_call_id=tool_call_id)


def tool_result(tool_call_id: str, content: str, message_id: str = "") -> ToolCallResultEvent:
    return ToolCallResultEvent(tool_call_id=tool_call_id, content=content, message_id=message_id)


def state_snapshot(snapshot: dict) -> StateSnapshotEvent:
    return StateSnapshotEvent(snapshot=snapshot)


def state_delta(delta: list) -> StateDeltaEvent:
    return StateDeltaEvent(delta=delta)


def custom(name: str, value: Any) -> CustomEvent:
    return CustomEvent(name=name, value=value)
