"""AG-UI protocol implementation for Varv.

Implements the Agent-User Interaction Protocol as typed SSE events.
Reference: https://docs.ag-ui.com/concepts/events
"""
from .events import *  # noqa: F401,F403
from .encoder import EventEncoder  # noqa: F401
