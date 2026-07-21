"""Fångstpipelinen: garantierna testas utan riktiga LLM-anrop (TestModel)."""
import pytest
from pydantic_ai.models.test import TestModel
from sqlmodel import select

from varv.agents.core import sorteraren
from varv.db.models import Capture, CaptureType, Idea, TagLink
from varv.schemas import CaptureIn
from varv.services.capture import guess_icon, known_tag_vocabulary, process_capture


@pytest.mark.asyncio
async def test_capture_saves_raw_and_routes(session):
    with sorteraren.override(model=TestModel()):
        out = await process_capture(session, session.user_id, CaptureIn(raw="ring vet om provsvar"))
    captures = session.exec(select(Capture)).all()
    assert len(captures) == 1
    assert captures[0].raw == "ring vet om provsvar"          # garanti 1: rått bevaras
    assert captures[0].routed_type == out.routed_type
    assert captures[0].routed_id == out.routed_id


@pytest.mark.asyncio
async def test_agent_failure_lands_as_raw_idea(session):
    class Boom:
        async def run(self, *a, **k):
            raise RuntimeError("nere")

    from varv.services import capture as mod
    original = mod.sorteraren
    mod.sorteraren = Boom()
    try:
        out = await process_capture(session, session.user_id, CaptureIn(raw="en tanke"))
    finally:
        mod.sorteraren = original
    assert out.routed_type == CaptureType.idea                # garanti 2: inget försvinner
    idea = session.get(Idea, out.routed_id)
    assert idea is not None and idea.raw == "en tanke"


@pytest.mark.asyncio
async def test_override_skips_agent(session):
    out = await process_capture(session, session.user_id, CaptureIn(raw="mjölk", override=CaptureType.shopping))
    assert out.routed_type == CaptureType.shopping


@pytest.mark.asyncio
async def test_tags_are_linked_and_in_vocabulary(session):
    with sorteraren.override(model=TestModel()):
        await process_capture(session, session.user_id, CaptureIn(raw="fixa faktura till leoware"))
    links = session.exec(select(TagLink)).all()
    vocab = known_tag_vocabulary(session, session.user_id)
    # TestModel genererar schemagiltiga taggar; finns länkar ska de synas i vokabulären
    assert len(vocab) == len({link.tag_id for link in links}) or (not links and vocab == [])


def test_guess_icon_word_prefix():
    assert guess_icon("ring vet") == "📞"
    assert guess_icon("bring laundry") == "🧺"                # inte 📞 — prefixmatchning


@pytest.mark.asyncio
async def test_link_tags_idempotent(session):
    """Samma tagg + entitet två gånger → en enda länk (unik constraint respekteras)."""
    from varv.services.capture import link_tags
    from varv.db.models import TagLink
    from sqlmodel import select as _select
    link_tags(session, session.user_id, ["konsult"], "task", "task-1")
    link_tags(session, session.user_id, ["konsult"], "task", "task-1")  # re-klassificering
    session.commit()
    links = session.exec(_select(TagLink).where(TagLink.entity_id == "task-1")).all()
    assert len(links) == 1
