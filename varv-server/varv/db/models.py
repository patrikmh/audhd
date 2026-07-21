"""Databasschema. SQLModel = Pydantic-modeller som ÄR tabeller — ett schema, en sanning.

Designprinciper:
- UUIDv7 som primärnyckel överallt: klienter kan skapa id:n offline, servern synkar (LWW)
- updated_at på muterbara tabeller → last-write-wins per rad; append-only-tabeller saknar den
- day-kolumner (YYYY-MM-DD) för billiga per-dag-frågor på Pi:n
- allt fångat bevaras: Capture är källan, Task/Idea/ListItem är routade vyer av den
- deleted_at (mjuk radering) på synkbara tabeller: en "delete" måste kunna synkas till andra
  enheter som en värdeändring, inte en tyst frånvaro — se services/sync.py
- ondelete="CASCADE" på alla user_id-kopplingar: raderas en User försvinner allt dess data,
  inga föräldralösa rader. Kräver PRAGMA foreign_keys=ON, satt i db/engine.py.
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


class Priority(StrEnum):
    A = "A"
    B = "B"
    C = "C"


class User(SQLModel, table=True):
    """En person med eget, helt separat dataset. Inget delas mellan användare
    utom systemdrift (worker-lease, BERTopic-teman).

    Kapacitet (steady/low/recovery) bor direkt här, inte i den generiska KV-tabellen —
    det är ett enda värde per användare, inte systemdrift, så det hör hemma på raden."""
    id: str = Field(default_factory=uuid7, primary_key=True)
    username: str = Field(index=True, unique=True)
    password_hash: str
    token: str = Field(index=True, unique=True)       # bärar-token, satt vid inloggning/skapande
    capacity: str = "steady"                          # steady | low | recovery
    capacity_set_day: str | None = None                # dagen då nuvarande värde sattes
    capacity_set_by: str | None = None                 # "user" | "auto" — user vinner alltid samma dag
    setup_done: bool = False                           # wizard genomförd
    last_checkin_date: str | None = None               # senaste morgoncheckin (YYYY-MM-DD)
    created_at: datetime = Field(default_factory=datetime.now)


class Capture(SQLModel, table=True):
    """Varje inkommande tanke, oavsett väg in. Append-only — raderas aldrig."""
    id: str = Field(default_factory=uuid7, primary_key=True)
    user_id: str = Field(foreign_key="user.id", ondelete="CASCADE", index=True)
    raw: str
    source: str = "text"                      # text | voice | mail
    routed_type: CaptureType | None = None
    routed_id: str | None = None
    topic_id: str | None = Field(default=None, foreign_key="topic.id")
    created_at: datetime = Field(default_factory=datetime.now)
    day: str = Field(default_factory=today, index=True)


class Task(SQLModel, table=True):
    id: str = Field(default_factory=uuid7, primary_key=True)
    user_id: str = Field(foreign_key="user.id", ondelete="CASCADE", index=True)
    title: str
    icon: str = "📌"
    trigger: str = ""
    energy: int = 2
    time: str | None = None
    minutes: int = 30
    essential: bool = False
    priority: Priority | None = None
    inbox: bool = True
    synced_to_calendar: bool = False
    done: bool = False
    done_at: datetime | None = None
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now, index=True)
    deleted_at: datetime | None = None        # mjuk radering — se synkkommentar överst
    day: str = Field(default_factory=today, index=True)
    scheduled_date: str | None = None         # YYYY-MM-DD för framtida uppgifter


class TaskStep(SQLModel, table=True):
    id: str = Field(default_factory=uuid7, primary_key=True)
    user_id: str = Field(foreign_key="user.id", ondelete="CASCADE", index=True)
    task_id: str = Field(foreign_key="task.id", ondelete="CASCADE", index=True)
    title: str
    minutes: int = 5
    position: int = 0
    done: bool = False
    updated_at: datetime = Field(default_factory=datetime.now, index=True)
    deleted_at: datetime | None = None


class Idea(SQLModel, table=True):
    id: str = Field(default_factory=uuid7, primary_key=True)
    user_id: str = Field(foreign_key="user.id", ondelete="CASCADE", index=True)
    raw: str
    title: str | None = None
    note: str | None = None
    status: IdeaStatus = IdeaStatus.raw
    attempts: int = 0
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now, index=True)
    deleted_at: datetime | None = None
    day: str = Field(default_factory=today, index=True)


class ShoppingList(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("user_id", "slug", name="uq_shoppinglist_user_slug"),)
    id: str = Field(default_factory=uuid7, primary_key=True)
    user_id: str = Field(foreign_key="user.id", ondelete="CASCADE", index=True)
    name: str
    slug: str = Field(index=True)


class ListItem(SQLModel, table=True):
    id: str = Field(default_factory=uuid7, primary_key=True)
    user_id: str = Field(foreign_key="user.id", ondelete="CASCADE", index=True)
    list_id: str = Field(foreign_key="shoppinglist.id", ondelete="CASCADE", index=True)
    text: str
    done: bool = False
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now, index=True)
    deleted_at: datetime | None = None


class Tag(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("user_id", "name", name="uq_tag_user_name"),)
    id: str = Field(default_factory=uuid7, primary_key=True)
    user_id: str = Field(foreign_key="user.id", ondelete="CASCADE", index=True)
    name: str = Field(index=True)


class TagLink(SQLModel, table=True):
    """Koppling tag ↔ (task|idea|capture). Unik per (tag, entitet) så statistiken inte dubbelräknas.

    entity_kind/entity_id är en polymorf koppling utan databas-FK — databasen kan inte
    garantera att entity_id pekar på en levande rad, det litar vi på applikationslagret för.
    Medvetet val för en 3-vägslänk; håll koll om det någonsin blir en buggkälla."""
    __table_args__ = (UniqueConstraint("tag_id", "entity_kind", "entity_id", name="uq_taglink"),)
    id: str = Field(default_factory=uuid7, primary_key=True)
    user_id: str = Field(foreign_key="user.id", ondelete="CASCADE", index=True)
    tag_id: str = Field(foreign_key="tag.id", ondelete="CASCADE", index=True)
    entity_kind: str = Field(index=True)
    entity_id: str = Field(index=True)
    day: str = Field(default_factory=today, index=True)


class Win(SQLModel, table=True):
    """Append-only."""
    id: str = Field(default_factory=uuid7, primary_key=True)
    user_id: str = Field(foreign_key="user.id", ondelete="CASCADE", index=True)
    text: str
    created_at: datetime = Field(default_factory=datetime.now)
    day: str = Field(default_factory=today, index=True)


class EnergyEvent(SQLModel, table=True):
    """Append-only."""
    id: str = Field(default_factory=uuid7, primary_key=True)
    user_id: str = Field(foreign_key="user.id", ondelete="CASCADE", index=True)
    delta: int
    label: str
    created_at: datetime = Field(default_factory=datetime.now)
    day: str = Field(default_factory=today, index=True)


class AgentLog(SQLModel, table=True):
    id: str = Field(default_factory=uuid7, primary_key=True)
    user_id: str = Field(foreign_key="user.id", ondelete="CASCADE", index=True)
    agent: str = Field(index=True)
    text: str
    created_at: datetime = Field(default_factory=datetime.now)
    day: str = Field(default_factory=today, index=True)


class Topic(SQLModel, table=True):
    """BERTopic-kluster med persistent identitet: centroid sparas och matchas natt mot natt,
    så topic_id är stabilt över tid ⇒ trender blir möjliga. Delad över alla användare med flit
    — en systemomfattande analys, inte personlig data."""
    id: str = Field(default_factory=uuid7, primary_key=True)
    label: str
    size: int = 0
    centroid: str | None = None               # JSON-lista: normaliserad embeddingcentroid
    updated_at: datetime = Field(default_factory=datetime.now)


class KV(SQLModel, table=True):
    """Enbart systemomfattande drifttillstånd (worker-lease, nattjobbets senaste körning) —
    per-användartillstånd (kapacitet) bor på User där det hör hemma, inte här."""
    key: str = Field(primary_key=True)
    value: str
