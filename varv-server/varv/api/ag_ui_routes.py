"""AG-UI streaming endpoints.

Wraps existing Varv agents (Sorteraren, Förfinaren, Nedbrytaren, Observatören)
with AG-UI event streaming. The frontend connects via SSE and receives
real-time agent processing events.

POST /ag-ui/run          — run an agent with AG-UI streaming
POST /ag-ui/run/a2ui     — run an agent and get A2UI generative UI surfaces
GET  /ag-ui/capabilities  — list available agents and their tools
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlmodel import Session

from varv.ag_ui.encoder import EventEncoder
from varv.ag_ui import events as E
from varv.api.auth import current_user
from varv.db.engine import get_session
from varv.db.models import AgentLog, User

router = APIRouter()


# ── Request schemas ──────────────────────────────────────────────────────────

class AGRuRequest(BaseModel):
    """AG-UI run request."""
    thread_id: str = ""
    run_id: str = ""
    agent: str  # classify | refine | breakdown | observer
    input: str
    state: dict = {}
    tools: list = []
    context: list = []


# ── Lazy agent imports ──────────────────────────────────────────────────────

def _get_agents():
    """Lazy import — avoids eager LLM model init at module load."""
    from varv.agents.core import SortDeps, forfinaren, nedbrytaren, sorteraren
    from varv.schemas import ClassifiedCapture, RefinedIdea, Breakdown
    from varv.services.capture import known_tag_vocabulary
    return {
        "SortDeps": SortDeps,
        "forfinaren": forfinaren,
        "nedbrytaren": nedbrytaren,
        "sorteraren": sorteraren,
        "ClassifiedCapture": ClassifiedCapture,
        "RefinedIdea": RefinedIdea,
        "Breakdown": Breakdown,
        "known_tag_vocabulary": known_tag_vocabulary,
    }


def _get_a2ui():
    """Lazy import of A2UI message builders."""
    from varv.a2ui.messages import (
        classify_result,
        refine_result,
        breakdown_result,
        observer_suggestion,
    )
    return {
        "classify_result": classify_result,
        "refine_result": refine_result,
        "breakdown_result": breakdown_result,
        "observer_suggestion": observer_suggestion,
    }


# ── Helpers ──────────────────────────────────────────────────────────────────

def _emit(encoder: EventEncoder, event) -> str:
    return encoder.encode(event)


# ── AG-UI streaming generators ──────────────────────────────────────────────

async def _stream_classify(raw: str, user: User, session: Session, encoder: EventEncoder):
    """Stream Sorteraren classification as AG-UI events."""
    agents = _get_agents()
    msg_id = str(uuid.uuid4())
    tool_id = str(uuid.uuid4())

    yield _emit(encoder, E.step_started("classify"))
    yield _emit(encoder, E.tool_start("sorteraren.run", tool_call_id=tool_id, parent_message_id=msg_id))
    yield _emit(encoder, E.tool_args(tool_id, json.dumps({"raw": raw[:100]}, ensure_ascii=False)))

    SortDeps = agents["SortDeps"]
    deps = SortDeps(known_tags=agents["known_tag_vocabulary"](session, user.id))
    result = await agents["sorteraren"].run(raw, deps=deps)
    output = result.output

    yield _emit(encoder, E.tool_end(tool_id))
    yield _emit(encoder, E.tool_result(tool_id, json.dumps(output.model_dump(), ensure_ascii=False), message_id=msg_id))
    yield _emit(encoder, E.text_start(msg_id))
    yield _emit(encoder, E.text_delta(msg_id, f"Klassificerad som: {output.type.value} — {output.title}"))
    yield _emit(encoder, E.text_end(msg_id))
    yield _emit(encoder, E.state_delta([
        {"op": "add", "path": "/lastClassification", "value": output.model_dump()},
    ]))
    yield _emit(encoder, E.step_finished("classify"))


async def _stream_refine(raw: str, encoder: EventEncoder):
    """Stream Förfinaren refinement as AG-UI events."""
    agents = _get_agents()
    msg_id = str(uuid.uuid4())
    tool_id = str(uuid.uuid4())

    yield _emit(encoder, E.step_started("refine"))
    yield _emit(encoder, E.tool_start("forfinaren.run", tool_call_id=tool_id, parent_message_id=msg_id))
    yield _emit(encoder, E.tool_args(tool_id, json.dumps({"raw": raw[:100]}, ensure_ascii=False)))

    result = await agents["forfinaren"].run(raw)
    output = result.output

    yield _emit(encoder, E.tool_end(tool_id))
    yield _emit(encoder, E.tool_result(tool_id, json.dumps(output.model_dump(), ensure_ascii=False), message_id=msg_id))
    yield _emit(encoder, E.text_start(msg_id))
    yield _emit(encoder, E.text_delta(msg_id, f"Förfinad: {output.title}"))
    yield _emit(encoder, E.text_end(msg_id))
    yield _emit(encoder, E.state_delta([
        {"op": "add", "path": "/lastRefined", "value": output.model_dump()},
    ]))
    yield _emit(encoder, E.step_finished("refine"))


async def _stream_breakdown(title: str, encoder: EventEncoder):
    """Stream Nedbrytaren breakdown as AG-UI events."""
    agents = _get_agents()
    msg_id = str(uuid.uuid4())
    tool_id = str(uuid.uuid4())

    yield _emit(encoder, E.step_started("breakdown"))
    yield _emit(encoder, E.tool_start("nedbrytaren.run", tool_call_id=tool_id, parent_message_id=msg_id))
    yield _emit(encoder, E.tool_args(tool_id, json.dumps({"title": title}, ensure_ascii=False)))

    result = await agents["nedbrytaren"].run(title)
    output = result.output

    yield _emit(encoder, E.tool_end(tool_id))
    yield _emit(encoder, E.tool_result(tool_id, json.dumps(output.model_dump(), ensure_ascii=False), message_id=msg_id))
    yield _emit(encoder, E.text_start(msg_id))
    steps_text = "\n".join(f"{i+1}. {s.title} ({s.minutes}min)" for i, s in enumerate(output.steps))
    yield _emit(encoder, E.text_delta(msg_id, f"Bryter ner: {title}\n{steps_text}"))
    yield _emit(encoder, E.text_end(msg_id))
    yield _emit(encoder, E.state_delta([
        {"op": "add", "path": "/lastBreakdown", "value": output.model_dump()},
    ]))
    yield _emit(encoder, E.step_finished("breakdown"))


async def _stream_observer(state: dict, encoder: EventEncoder):
    """Stream Observatören suggestions as AG-UI events."""
    msg_id = str(uuid.uuid4())
    capacity = state.get("capacity", 3)
    hour = datetime.now().hour

    yield _emit(encoder, E.step_started("analyze"))
    yield _emit(encoder, E.text_start(msg_id))

    if capacity <= 1:
        yield _emit(encoder, E.text_delta(msg_id, "Din energi är låg — en kort paus kan göra skillnad."))
    elif capacity <= 2:
        yield _emit(encoder, E.text_delta(msg_id, "En kort rörelsepaus kan ge energi."))
    else:
        yield _emit(encoder, E.text_delta(msg_id, f"Klockan är {datetime.now().strftime('%H:%M')} — bra tid för ett fokusvarv."))

    yield _emit(encoder, E.text_end(msg_id))
    yield _emit(encoder, E.step_finished("analyze"))


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/ag-ui/capabilities")
def capabilities():
    """List available agents and their tools."""
    return {
        "agents": [
            {
                "name": "classify",
                "label": "Sorteraren",
                "description": "Klassificerar infångade tankar",
                "tools": ["sorteraren.run"],
                "inputTypes": ["raw text"],
            },
            {
                "name": "refine",
                "label": "Förfinaren",
                "description": "Förfinar idéer till tydliga anteckningar",
                "tools": ["forfinaren.run"],
                "inputTypes": ["raw text"],
            },
            {
                "name": "breakdown",
                "label": "Nedbrytaren",
                "description": "Bryter ner uppgifter i pytteliten steg",
                "tools": ["nedbrytaren.run"],
                "inputTypes": ["task title"],
            },
            {
                "name": "observer",
                "label": "Observatören",
                "description": "Föreslår verktyg baserat på energi och tid",
                "tools": ["observer.suggest"],
                "inputTypes": ["state context"],
            },
        ],
    }


@router.post("/ag-ui/run")
async def ag_ui_run(
    payload: AGRuRequest,
    request: Request,
    user: User = Depends(current_user),
    session: Session = Depends(get_session),
):
    """Run an agent with AG-UI event streaming (SSE)."""
    accept = request.headers.get("accept", "text/event-stream")
    encoder = EventEncoder(accept=accept)
    thread_id = payload.thread_id or str(uuid.uuid4())
    run_id = payload.run_id or str(uuid.uuid4())

    async def event_stream():
        yield _emit(encoder, E.run_started(thread_id, run_id))

        try:
            if payload.agent == "classify":
                async for chunk in _stream_classify(payload.input, user, session, encoder):
                    yield chunk
            elif payload.agent == "refine":
                async for chunk in _stream_refine(payload.input, encoder):
                    yield chunk
            elif payload.agent == "breakdown":
                async for chunk in _stream_breakdown(payload.input, encoder):
                    yield chunk
            elif payload.agent == "observer":
                async for chunk in _stream_observer(payload.state, encoder):
                    yield chunk
            else:
                yield _emit(encoder, E.run_error(f"Okänd agent: {payload.agent}"))
                return

            # Log the agent run
            log = AgentLog(
                user_id=user.id,
                agent=payload.agent,
                text=f"ag-ui: {payload.input[:150]}",
            )
            session.add(log)
            session.commit()

            yield _emit(encoder, E.run_finished(thread_id, run_id))

        except Exception as exc:
            yield _emit(encoder, E.run_error(str(exc)))

    return StreamingResponse(
        event_stream(),
        media_type=encoder.get_content_type(),
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/ag-ui/run/a2ui")
async def ag_ui_run_a2ui(
    payload: AGRuRequest,
    request: Request,
    user: User = Depends(current_user),
    session: Session = Depends(get_session),
):
    """Run an agent with AG-UI streaming + A2UI generative UI surfaces.

    Same as /ag-ui/run but agents also emit A2UI component trees
    via Custom events. The frontend renders these as native Varv widgets.
    """
    accept = request.headers.get("accept", "text/event-stream")
    encoder = EventEncoder(accept=accept)
    thread_id = payload.thread_id or str(uuid.uuid4())
    run_id = payload.run_id or str(uuid.uuid4())

    async def event_stream():
        yield _emit(encoder, E.run_started(thread_id, run_id))

        try:
            if payload.agent == "classify":
                agents = _get_agents()
                a2ui = _get_a2ui()

                yield _emit(encoder, E.step_started("classify"))
                SortDeps = agents["SortDeps"]
                deps = SortDeps(known_tags=agents["known_tag_vocabulary"](session, user.id))
                result = await agents["sorteraren"].run(payload.input, deps=deps)
                output = result.output

                for msg in a2ui["classify_result"](output.title, output.type.value, output.energy, None):
                    yield _emit(encoder, E.custom("a2ui_message", msg))

                msg_id = str(uuid.uuid4())
                yield _emit(encoder, E.text_start(msg_id))
                yield _emit(encoder, E.text_delta(msg_id, f"Klassificerad: {output.type.value} — {output.title}"))
                yield _emit(encoder, E.text_end(msg_id))
                yield _emit(encoder, E.step_finished("classify"))

            elif payload.agent == "refine":
                agents = _get_agents()
                a2ui = _get_a2ui()

                yield _emit(encoder, E.step_started("refine"))
                result = await agents["forfinaren"].run(payload.input)
                output = result.output

                for msg in a2ui["refine_result"](output.title, output.note):
                    yield _emit(encoder, E.custom("a2ui_message", msg))

                msg_id = str(uuid.uuid4())
                yield _emit(encoder, E.text_start(msg_id))
                yield _emit(encoder, E.text_delta(msg_id, f"Förfinad: {output.title}"))
                yield _emit(encoder, E.text_end(msg_id))
                yield _emit(encoder, E.step_finished("refine"))

            elif payload.agent == "breakdown":
                agents = _get_agents()
                a2ui = _get_a2ui()

                yield _emit(encoder, E.step_started("breakdown"))
                result = await agents["nedbrytaren"].run(payload.input)
                output = result.output

                step_strs = [f"{s.title} ({s.minutes} min)" for s in output.steps]
                for msg in a2ui["breakdown_result"](payload.input, step_strs, None):
                    yield _emit(encoder, E.custom("a2ui_message", msg))

                msg_id = str(uuid.uuid4())
                yield _emit(encoder, E.text_start(msg_id))
                steps_text = "\n".join(f"  {i+1}. {s.title} ({s.minutes}min)" for i, s in enumerate(output.steps))
                yield _emit(encoder, E.text_delta(msg_id, f"Bryter ner: {payload.input}\n{steps_text}"))
                yield _emit(encoder, E.text_end(msg_id))
                yield _emit(encoder, E.step_finished("breakdown"))

            elif payload.agent == "observer":
                a2ui = _get_a2ui()

                yield _emit(encoder, E.step_started("analyze"))
                capacity = int(payload.state.get("capacity", 3))

                if capacity <= 1:
                    suggestion = a2ui["observer_suggestion"](
                        "breathing", "Andningsövning",
                        "En lugnande andningsövning kan hjälpa",
                        "Din energi är låg — en kort paus kan göra skillnad",
                    )
                elif capacity <= 2:
                    suggestion = a2ui["observer_suggestion"](
                        "movement", "Rörelsepaus",
                        "5 minuter rörelse +2⚡",
                        "En kort rörelsepaus kan ge energi",
                    )
                else:
                    suggestion = a2ui["observer_suggestion"](
                        "focus", "Fokusvarv",
                        "Starta ett fokusvarv för den här uppgiften",
                        f"Klockan är {datetime.now().strftime('%H:%M')} — bra tid för ett fokusvarv",
                    )

                for msg in suggestion:
                    yield _emit(encoder, E.custom("a2ui_message", msg))

                yield _emit(encoder, E.step_finished("analyze"))

            else:
                yield _emit(encoder, E.run_error(f"Okänd agent: {payload.agent}"))
                return

            yield _emit(encoder, E.run_finished(thread_id, run_id))

        except Exception as exc:
            yield _emit(encoder, E.run_error(str(exc)))

    return StreamingResponse(
        event_stream(),
        media_type=encoder.get_content_type(),
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
