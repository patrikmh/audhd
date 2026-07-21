"""SSE event encoder for AG-UI protocol.

Encodes AG-UI events as Server-Sent Events (text/event-stream).
Supports both standard SSE and newline-delimited JSON.
"""
from __future__ import annotations

import json
from dataclasses import asdict
from typing import Any


class EventEncoder:
    """Encodes AG-UI events as SSE or NDJSON."""

    def __init__(self, accept: str = "text/event-stream"):
        self.use_ndjson = "application/x-ndjson" in accept

    def encode(self, event: Any) -> str:
        """Encode a single event to wire format."""
        if hasattr(event, "__dataclass_fields__"):
            data = asdict(event)
        elif isinstance(event, dict):
            data = event
        else:
            data = {"type": "UNKNOWN", "raw": str(event)}

        payload = json.dumps(data, ensure_ascii=False, default=str)

        if self.use_ndjson:
            return payload + "\n"

        return f"data: {payload}\n\n"

    def get_content_type(self) -> str:
        if self.use_ndjson:
            return "application/x-ndjson"
        return "text/event-stream"
