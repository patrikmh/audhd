"""Fångstpipelinen: en väg in för allt, oavsett källa eller överstyrning.

Garantier (samma som i appen):
1. Fångsten sparas ALLTID först (Capture-raden) — sedan får agenten sortera.
2. Misslyckas Sorteraren landar tanken som rå idé. Inget försvinner någonsin.
3. Taggar loggas alltid (TagLink) — statistik- och organisationslagret.
"""
import logging
from datetime import date, timedelta

from sqlmodel import Session, func, select

from varv.agents.core import SortDeps, sorteraren
from varv.db.models import (
    AgentLog, Capture, CaptureType, Idea, IdeaStatus, ListItem, ShoppingList, Tag, TagLink, Task,
)
from varv.schemas import CaptureIn, CaptureOut, ClassifiedCapture

log = logging.getLogger(__name__)

_ICON_KEYWORDS: list[tuple[str, str]] = [
    ("handla", "🛒"), ("köp", "🛒"), ("buy", "🛒"), ("shop", "🛒"), ("grocer", "🛒"),
    ("ring", "📞"), ("call", "📞"), ("mail", "✉️"), ("mejl", "✉️"), ("email", "✉️"),
    ("clean", "🧹"), ("städ", "🧹"), ("tvätt", "🧺"), ("laundry", "🧺"),
    ("vet", "🐈"), ("katt", "🐈"), ("cat", "🐈"), ("läkar", "🩺"), ("doctor", "🩺"), ("vård", "🩺"),
    ("gym", "🏃"), ("träna", "🏃"), ("run", "🏃"), ("promenad", "🏃"),
    ("read", "📚"), ("läs", "📚"), ("book", "📚"), ("code", "💻"), ("kod", "💻"),
    ("write", "✍️"), ("skriv", "✍️"), ("pay", "💳"), ("betal", "💳"), ("faktur", "💳"), ("invoice", "💳"),
    ("meeting", "🗓️"), ("möte", "🗓️"), ("cook", "🍳"), ("fix", "🔧"), ("repair", "🔧"),
]


def guess_icon(title: str) -> str:
    words = title.lower().split()
    for key, icon in _ICON_KEYWORDS:
        if any(w.startswith(key) for w in words):
            return icon
    return "📌"


def known_tag_vocabulary(session: Session, days: int = 30, limit: int = 30) -> list[str]:
    """De taggar som redan används mest — matas in i Sorteraren mot spretning."""
    since = (date.today() - timedelta(days=days)).isoformat()
    rows = session.exec(
        select(Tag.name, func.count(TagLink.id))
        .join(TagLink, TagLink.tag_id == Tag.id)
        .where(TagLink.day >= since)
        .group_by(Tag.name)
        .order_by(func.count(TagLink.id).desc())
        .limit(limit)
    ).all()
    return [name for name, _ in rows]


def _get_or_create_tag(session: Session, name: str) -> Tag:
    tag = session.exec(select(Tag).where(Tag.name == name)).first()
    if not tag:
        tag = Tag(name=name)
        session.add(tag)
        session.flush()
    return tag


def link_tags(session: Session, tags: list[str], kind: str, entity_id: str) -> None:
    for name in tags[:3]:
        tag = _get_or_create_tag(session, name.strip().lower())
        exists = session.exec(
            select(TagLink).where(
                TagLink.tag_id == tag.id,
                TagLink.entity_kind == kind,
                TagLink.entity_id == entity_id,
            )
        ).first()
        if not exists:
            session.add(TagLink(tag_id=tag.id, entity_kind=kind, entity_id=entity_id))


def agent_note(session: Session, agent: str, text: str) -> None:
    session.add(AgentLog(agent=agent, text=text[:300]))


def _route(session: Session, cls: ClassifiedCapture, raw: str) -> tuple[CaptureType, str]:
    if cls.type == CaptureType.shopping:
        lst = session.exec(select(ShoppingList).where(ShoppingList.slug == "shopping")).one()
        item = ListItem(list_id=lst.id, text=cls.title or raw)
        session.add(item)
        session.flush()
        return CaptureType.shopping, item.id

    if cls.type == CaptureType.task:
        task = Task(
            title=cls.title or raw,
            icon=guess_icon(cls.title or raw),
            energy=cls.energy or 2,
            time=cls.time,
        )
        session.add(task)
        session.flush()
        link_tags(session, cls.tags, "task", task.id)
        return CaptureType.task, task.id

    idea = Idea(
        raw=raw,
        title=cls.title or None,
        note=cls.note,
        status=IdeaStatus.klar if cls.title else IdeaStatus.raw,
    )
    session.add(idea)
    session.flush()
    link_tags(session, cls.tags, "idea", idea.id)
    return CaptureType.idea, idea.id


async def process_capture(session: Session, payload: CaptureIn) -> CaptureOut:
    # Garanti 1: spara rått först.
    capture = Capture(raw=payload.raw, source=payload.source)
    session.add(capture)
    session.flush()

    if payload.override:
        cls = ClassifiedCapture(type=payload.override, title=payload.raw[:120], tags=[])
    else:
        try:
            deps = SortDeps(known_tags=known_tag_vocabulary(session))
            result = await sorteraren.run(payload.raw, deps=deps)
            cls = result.output
        except Exception:  # Garanti 2: felsäkert till rå idé
            log.exception("Sorteraren fallerade — landar som rå idé")
            cls = ClassifiedCapture(type=CaptureType.idea, title="", tags=[])

    routed_type, routed_id = _route(session, cls, payload.raw)
    capture.routed_type, capture.routed_id = routed_type, routed_id
    link_tags(session, cls.tags, "capture", capture.id)

    if not payload.override:
        agent_note(session, "sorteraren", f"→ {routed_type.value}: \"{(cls.title or payload.raw)[:60]}\" {cls.tags}")

    session.commit()
    return CaptureOut(
        capture_id=capture.id,
        routed_type=routed_type,
        routed_id=routed_id,
        title=cls.title or payload.raw[:120],
        tags=cls.tags,
    )
