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
from datetime import date, datetime, timezone
from enum import StrEnum

from sqlalchemy import JSON, Column, event, text
from sqlalchemy.orm import Session as SQLAlchemySession
from sqlmodel import Field, SQLModel, UniqueConstraint

from varv.utils import uuid7


def today() -> str:
    return date.today().isoformat()


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


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
    external_ai_enabled: bool = False                   # samtycke krävs innan LLM-agenter körs för kontot
    settings_json: str | None = None                    # visningsnamn, avatar, väckningstid m.m. — se schemas.Settings
    created_at: datetime = Field(default_factory=utcnow)


class Capture(SQLModel, table=True):
    """Varje inkommande tanke, oavsett väg in. Append-only — raderas aldrig."""
    id: str = Field(default_factory=uuid7, primary_key=True)
    user_id: str = Field(foreign_key="user.id", ondelete="CASCADE", index=True)
    raw: str
    source: str = "text"                      # text | voice | mail
    routed_type: CaptureType | None = None
    routed_id: str | None = None
    topic_id: str | None = Field(default=None, foreign_key="topic.id")
    created_at: datetime = Field(default_factory=utcnow)
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
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow, index=True)
    deleted_at: datetime | None = None        # mjuk radering — se synkkommentar överst
    day: str = Field(default_factory=today, index=True)
    scheduled_date: str | None = None         # YYYY-MM-DD för framtida uppgifter
    due_by: str | None = None                 # YYYY-MM-DD — "floater": inget fast datum, men klar senast detta
    note: str | None = None                   # fritextanteckning
    image: str | None = None                  # base64-data-uri för miniatyr
    tags: list[str] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    repeat_days: list[str] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    sync_version: int = Field(default=0, index=True)


class TaskStep(SQLModel, table=True):
    id: str = Field(default_factory=uuid7, primary_key=True)
    user_id: str = Field(foreign_key="user.id", ondelete="CASCADE", index=True)
    task_id: str = Field(foreign_key="task.id", ondelete="CASCADE", index=True)
    title: str
    minutes: int = 5
    position: int = 0
    done: bool = False
    updated_at: datetime = Field(default_factory=utcnow, index=True)
    deleted_at: datetime | None = None
    sync_version: int = Field(default=0, index=True)


class TaskOccurrence(SQLModel, table=True):
    """One dated instance of a recurring Task template. The template (title, steps,
    repeat_days) stays immutable history-wise — editing it changes future occurrences,
    never past ones — because completion state and a steps snapshot live here instead
    of being mutated in place on the template row, one per (task_id, date)."""
    __table_args__ = (UniqueConstraint("task_id", "date", name="uq_task_occurrence_date"),)
    id: str = Field(default_factory=uuid7, primary_key=True)
    user_id: str = Field(foreign_key="user.id", ondelete="CASCADE", index=True)
    task_id: str = Field(foreign_key="task.id", ondelete="CASCADE", index=True)
    date: str = Field(index=True)              # YYYY-MM-DD — vilken dag detta varv gäller
    done: bool = False
    done_at: datetime | None = None
    steps_snapshot: list[dict] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    updated_at: datetime = Field(default_factory=utcnow, index=True)
    deleted_at: datetime | None = None
    sync_version: int = Field(default=0, index=True)


class Idea(SQLModel, table=True):
    id: str = Field(default_factory=uuid7, primary_key=True)
    user_id: str = Field(foreign_key="user.id", ondelete="CASCADE", index=True)
    raw: str
    title: str | None = None
    note: str | None = None
    status: IdeaStatus = IdeaStatus.raw
    attempts: int = 0
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow, index=True)
    deleted_at: datetime | None = None
    day: str = Field(default_factory=today, index=True)
    image: str | None = None
    tags: list[str] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    sync_version: int = Field(default=0, index=True)


class ShoppingList(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("user_id", "slug", name="uq_shoppinglist_user_slug"),)
    id: str = Field(default_factory=uuid7, primary_key=True)
    user_id: str = Field(foreign_key="user.id", ondelete="CASCADE", index=True)
    name: str
    slug: str = Field(index=True)
    updated_at: datetime = Field(default_factory=utcnow, index=True)
    deleted_at: datetime | None = None
    sync_version: int = Field(default=0, index=True)


class ListItem(SQLModel, table=True):
    id: str = Field(default_factory=uuid7, primary_key=True)
    user_id: str = Field(foreign_key="user.id", ondelete="CASCADE", index=True)
    list_id: str = Field(foreign_key="shoppinglist.id", ondelete="CASCADE", index=True)
    text: str
    done: bool = False
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow, index=True)
    deleted_at: datetime | None = None
    sync_version: int = Field(default=0, index=True)


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
    created_at: datetime = Field(default_factory=utcnow)
    day: str = Field(default_factory=today, index=True)
    sync_version: int = Field(default=0, index=True)


class EnergyEvent(SQLModel, table=True):
    """Append-only."""
    id: str = Field(default_factory=uuid7, primary_key=True)
    user_id: str = Field(foreign_key="user.id", ondelete="CASCADE", index=True)
    delta: int
    label: str
    created_at: datetime = Field(default_factory=utcnow)
    day: str = Field(default_factory=today, index=True)
    sync_version: int = Field(default=0, index=True)


class Checkin(SQLModel, table=True):
    """Append-only. Kognitiv omtolkning: vad hände, hjärnans första tolkning, en snällare läsning."""
    id: str = Field(default_factory=uuid7, primary_key=True)
    user_id: str = Field(foreign_key="user.id", ondelete="CASCADE", index=True)
    what: str
    thought: str
    kinder: str
    created_at: datetime = Field(default_factory=utcnow)
    sync_version: int = Field(default=0, index=True)


class Calibration(SQLModel, table=True):
    """Append-only. Tidsuppskattning vs. faktiskt utfall för ett fokusvarv —
    underlag för att bättre kalibrera "hur lång tid tar det här egentligen"."""
    id: str = Field(default_factory=uuid7, primary_key=True)
    user_id: str = Field(foreign_key="user.id", ondelete="CASCADE", index=True)
    est: int
    actual: int
    created_at: datetime = Field(default_factory=utcnow)
    sync_version: int = Field(default=0, index=True)


class AgentLog(SQLModel, table=True):
    id: str = Field(default_factory=uuid7, primary_key=True)
    user_id: str = Field(foreign_key="user.id", ondelete="CASCADE", index=True)
    agent: str = Field(index=True)
    text: str
    created_at: datetime = Field(default_factory=utcnow)
    day: str = Field(default_factory=today, index=True)


class Topic(SQLModel, table=True):
    """BERTopic-kluster med persistent identitet: centroid sparas och matchas natt mot natt,
    så topic_id är stabilt över tid ⇒ trender blir möjliga. Per användare — klustring och trender
    är personlig data, inte en systemomfattande analys."""
    id: str = Field(default_factory=uuid7, primary_key=True)
    user_id: str = Field(foreign_key="user.id", ondelete="CASCADE", index=True)
    label: str
    size: int = 0
    centroid: str | None = None               # JSON-lista: normaliserad embeddingcentroid
    updated_at: datetime = Field(default_factory=utcnow)


class KV(SQLModel, table=True):
    """Enbart systemomfattande drifttillstånd (worker-lease, nattjobbets senaste körning) —
    per-användartillstånd (kapacitet) bor på User där det hör hemma, inte här."""
    key: str = Field(primary_key=True)
    value: str


class SyncTombstone(SQLModel, table=True):
    """Deletion marker for an entity that was not present on this server."""
    __table_args__ = (UniqueConstraint("user_id", "kind", "entity_id", name="uq_sync_tombstone"),)
    id: str = Field(default_factory=uuid7, primary_key=True)
    user_id: str = Field(foreign_key="user.id", ondelete="CASCADE", index=True)
    kind: str = Field(index=True)
    entity_id: str = Field(index=True)
    updated_at: datetime = Field(default_factory=utcnow)
    sync_version: int = Field(default=0, index=True)


SYNC_VERSIONED_TYPES = (
    Task, TaskStep, TaskOccurrence, Idea, ShoppingList, ListItem, Win, EnergyEvent,
    Checkin, Calibration, SyncTombstone,
)


@event.listens_for(SQLAlchemySession, "before_flush")
def _assign_sync_versions(session, flush_context, instances) -> None:
    """Assign one monotonic per-user cursor to every changed sync entity."""
    candidates = [*session.new, *session.dirty]
    for row in candidates:
        if not isinstance(row, SYNC_VERSIONED_TYPES):
            continue
        if row in session.dirty and not session.is_modified(row, include_collections=False):
            continue

        key = f"sync_version:{row.user_id}"
        connection = session.connection()
        connection.execute(
            text('INSERT INTO kv ("key", value) VALUES (:key, \'0\') ON CONFLICT ("key") DO NOTHING'),
            {"key": key},
        )
        row.sync_version = int(
            connection.execute(
                text(
                    'UPDATE kv SET value = CAST(value AS INTEGER) + 1 '
                    'WHERE "key" = :key RETURNING value'
                ),
                {"key": key},
            ).scalar_one()
        )
