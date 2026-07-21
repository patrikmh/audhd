"""Databasschema. SQLModel = Pydantic-modeller som ÄR tabeller — ett schema, en sanning.

Designprinciper:
- UUIDv7 som primärnyckel överallt: klienter kan skapa id:n offline, servern synkar (LWW)
- updated_at på muterbara tabeller → last-write-wins per rad; append-only-tabeller saknar den
- day-kolumner (YYYY-MM-DD) för billiga per-dag-frågor på Pi:n
- allt fångat bevaras: Capture är källan, Task/Idea/ListItem är routade vyer av den
"""
from datetime import datetime, date
from enum import StrEnum

from sqlmodel import Field, SQLModel, UniqueConstraint

from varv.utils import uuid7


def today() -> str:
    return date.today().isoformat()


class CaptureType(StrEnum):
    task = "task"
    idea = "idea"
    shopping = "shopping"


class IdeaStatus(StrEnum):
    raw = "raw"
    refining = "refining"
    klar = "klar"
    fail = "fail"


class Capture(SQLModel, table=True):
    """Varje inkommande tanke, oavsett väg in. Append-only."""
    id: str = Field(default_factory=uuid7, primary_key=True)
    raw: str
    source: str = "text"                      # text | voice | mail
    routed_type: CaptureType | None = None
    routed_id: str | None = None
    topic_id: str | None = Field(default=None, foreign_key="topic.id")
    created_at: datetime = Field(default_factory=datetime.now)
    day: str = Field(default_factory=today, index=True)


class Task(SQLModel, table=True):
    id: str = Field(default_factory=uuid7, primary_key=True)
    title: str
    icon: str = "📌"
    trigger: str = ""
    energy: int = 2
    time: str | None = None
    minutes: int = 30
    essential: bool = False
    priority: str | None = None               # A | B | C
    inbox: bool = True
    synced_to_calendar: bool = False
    done: bool = False
    done_at: datetime | None = None
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now, index=True)
    day: str = Field(default_factory=today, index=True)


class TaskStep(SQLModel, table=True):
    id: str = Field(default_factory=uuid7, primary_key=True)
    task_id: str = Field(foreign_key="task.id", index=True)
    title: str
    minutes: int = 5
    position: int = 0
    done: bool = False
    updated_at: datetime = Field(default_factory=datetime.now, index=True)


class Idea(SQLModel, table=True):
    id: str = Field(default_factory=uuid7, primary_key=True)
    raw: str
    title: str | None = None
    note: str | None = None
    status: IdeaStatus = IdeaStatus.raw
    attempts: int = 0
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now, index=True)
    day: str = Field(default_factory=today, index=True)


class ShoppingList(SQLModel, table=True):
    id: str = Field(default_factory=uuid7, primary_key=True)
    name: str
    slug: str = Field(index=True, unique=True)


class ListItem(SQLModel, table=True):
    id: str = Field(default_factory=uuid7, primary_key=True)
    list_id: str = Field(foreign_key="shoppinglist.id", index=True)
    text: str
    done: bool = False
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now, index=True)


class Tag(SQLModel, table=True):
    id: str = Field(default_factory=uuid7, primary_key=True)
    name: str = Field(index=True, unique=True)


class TagLink(SQLModel, table=True):
    """Koppling tag ↔ (task|idea|capture). Unik per (tag, entitet) så statistiken inte dubbelräknas."""
    __table_args__ = (UniqueConstraint("tag_id", "entity_kind", "entity_id", name="uq_taglink"),)
    id: str = Field(default_factory=uuid7, primary_key=True)
    tag_id: str = Field(foreign_key="tag.id", index=True)
    entity_kind: str = Field(index=True)
    entity_id: str = Field(index=True)
    day: str = Field(default_factory=today, index=True)


class Win(SQLModel, table=True):
    """Append-only."""
    id: str = Field(default_factory=uuid7, primary_key=True)
    text: str
    created_at: datetime = Field(default_factory=datetime.now)
    day: str = Field(default_factory=today, index=True)


class EnergyEvent(SQLModel, table=True):
    """Append-only."""
    id: str = Field(default_factory=uuid7, primary_key=True)
    delta: int
    label: str
    created_at: datetime = Field(default_factory=datetime.now)
    day: str = Field(default_factory=today, index=True)


class AgentLog(SQLModel, table=True):
    id: str = Field(default_factory=uuid7, primary_key=True)
    agent: str = Field(index=True)
    text: str
    created_at: datetime = Field(default_factory=datetime.now)
    day: str = Field(default_factory=today, index=True)


class Topic(SQLModel, table=True):
    """BERTopic-kluster med persistent identitet: centroid sparas och matchas natt mot natt,
    så topic_id är stabilt över tid ⇒ trender blir möjliga."""
    id: str = Field(default_factory=uuid7, primary_key=True)
    label: str
    size: int = 0
    centroid: str | None = None               # JSON-lista: normaliserad embeddingcentroid
    updated_at: datetime = Field(default_factory=datetime.now)


class KV(SQLModel, table=True):
    key: str = Field(primary_key=True)
    value: str
