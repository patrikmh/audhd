"""Pydantic-scheman: API-DTO:er och agenternas typade outputs.

Agent-outputs är kontraktet mellan LLM och kod — Pydantic AI validerar och
begär om vid schemafel, så service-lagret slipper defensiv parsning.
"""
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from varv.db.models import CaptureType, IdeaStatus, Priority


# ---------- agent-outputs ----------

class ClassifiedCapture(BaseModel):
    """Sorterarens dom över en fångad tanke."""
    type: CaptureType
    title: str = Field(max_length=120, description="Kort städad titel, samma språk som tanken")
    note: str | None = Field(default=None, description="För idea: städad 1–2 meningar. Annars null.")
    tags: list[str] = Field(default_factory=list, max_length=3, description="1–3 korta taggar, svenska, gemener")
    energy: int | None = Field(default=None, ge=1, le=5, description="Energikostnad om task")
    time: str | None = Field(default=None, pattern=r"^\d{2}:\d{2}$", description="HH:MM endast om uttryckligen nämnt")
    scheduled_date: str | None = Field(
        default=None, pattern=r"^\d{4}-\d{2}-\d{2}$",
        description="YYYY-MM-DD om task nämner en dag (imorgon, på fredag, ett datum) — räknat från dagens datum. Annars null.",
    )


class RefinedIdea(BaseModel):
    """Förfinarens städade version — originalet bevaras alltid separat."""
    title: str = Field(max_length=80)
    note: str = Field(description="1–3 meningar, personens röst bevarad, utfyllnad borttagen")
    tags: list[str] = Field(default_factory=list, max_length=3)


class Step(BaseModel):
    title: str = Field(description="Konkret fysisk handling i jag-form, under 10 minuter")
    minutes: int = Field(ge=1, le=10)


class Breakdown(BaseModel):
    """Nedbrytarens mikrosteg."""
    steps: list[Step] = Field(min_length=3, max_length=6)


# ---------- API in/ut ----------

class CaptureIn(BaseModel):
    raw: str = Field(min_length=1, max_length=2000)
    source: str = "text"
    override: CaptureType | None = None       # satt = användaren styr, agenten hoppar över


class CaptureOut(BaseModel):
    capture_id: str
    routed_type: CaptureType
    routed_id: str
    title: str
    tags: list[str]


class TaskPatch(BaseModel):
    title: str | None = None
    trigger: str | None = None
    energy: int | None = Field(default=None, ge=1, le=5)
    time: str | None = None
    priority: Priority | None = None
    essential: bool | None = None
    done: bool | None = None
    scheduled_date: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$", description="YYYY-MM-DD for future tasks")
    due_by: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$", description="YYYY-MM-DD floater deadline")
    note: str | None = None
    image: str | None = None

class IdeaPatch(BaseModel):
    title: str | None = None
    note: str | None = None
    image: str | None = None
    tags: list[str] | None = None


class WeekDay(BaseModel):
    day: str
    spent: int
    recharged: int
    wins: int


class WeekStats(BaseModel):
    days: list[WeekDay]
    top_tags: list[tuple[str, int]]


class TranscriptOut(BaseModel):
    text: str
    language: str
    duration_s: float


# ---------- auth ----------

class LoginIn(BaseModel):
    username: str = Field(min_length=1, max_length=60)
    password: str = Field(min_length=1, max_length=200)


class LoginOut(BaseModel):
    token: str
    username: str


# ---------- agent-proxy (frontend anropar agenterna direkt, utan att spara) ----------

class ClassifyIn(BaseModel):
    raw: str = Field(min_length=1, max_length=2000)


class RefineIn(BaseModel):
    raw: str = Field(min_length=1, max_length=2000)


class TagIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    note: str | None = Field(default=None, max_length=2000)


class BreakdownIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    instructions: str | None = Field(
        default=None, max_length=200, description="Valfritt fokus, t.ex. 'fokusera på researchdelen'"
    )


class CompleteIn(BaseModel):
    text: str = Field(min_length=1, max_length=2000)
    context: str | None = Field(default=None, max_length=500, description="e.g. the task/idea title, for grounding")


# ---------- synk ----------

class StrictSyncData(BaseModel):
    model_config = ConfigDict(extra="forbid")


class SyncTaskData(StrictSyncData):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    icon: str | None = Field(default=None, max_length=16)
    trigger: str | None = Field(default=None, max_length=500)
    energy: int | None = Field(default=None, ge=1, le=5)
    time: str | None = Field(default=None, pattern=r"^\d{2}:\d{2}$")
    minutes: int | None = Field(default=None, ge=1, le=1440)
    essential: bool | None = None
    priority: Priority | None = None
    inbox: bool | None = None
    synced_to_calendar: bool | None = None
    done: bool | None = None
    done_at: datetime | None = None
    day: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    scheduled_date: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    due_by: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    note: str | None = Field(default=None, max_length=5000)
    image: str | None = Field(default=None, max_length=4_000_000)
    tags: list[str] | None = Field(default=None, max_length=4)
    repeat_days: list[Literal["mon", "tue", "wed", "thu", "fri", "sat", "sun"]] | None = None


class SyncTaskStepData(StrictSyncData):
    task_id: str | None = None
    title: str | None = Field(default=None, min_length=1, max_length=300)
    minutes: int | None = Field(default=None, ge=1, le=120)
    position: int | None = Field(default=None, ge=0)
    done: bool | None = None


class SyncTaskOccurrenceData(StrictSyncData):
    task_id: str | None = None
    date: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    done: bool | None = None
    done_at: datetime | None = None
    steps_snapshot: list[dict] | None = Field(default=None, max_length=20)


class SyncIdeaData(StrictSyncData):
    raw: str | None = Field(default=None, max_length=10_000)
    title: str | None = Field(default=None, max_length=200)
    note: str | None = Field(default=None, max_length=5000)
    status: IdeaStatus | None = None
    attempts: int | None = Field(default=None, ge=0, le=100)
    day: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    image: str | None = Field(default=None, max_length=4_000_000)
    tags: list[str] | None = Field(default=None, max_length=4)


class SyncShoppingListData(StrictSyncData):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    slug: str | None = Field(default=None, min_length=1, max_length=100)


class SyncListItemData(StrictSyncData):
    list_id: str | None = None
    text: str | None = Field(default=None, min_length=1, max_length=1000)
    done: bool | None = None


class SyncWinData(StrictSyncData):
    text: str | None = Field(default=None, min_length=1, max_length=500)
    day: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")


class SyncEnergyEventData(StrictSyncData):
    delta: int | None = Field(default=None, ge=-20, le=20)
    label: str | None = Field(default=None, min_length=1, max_length=500)
    day: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")


class SyncCheckinData(StrictSyncData):
    what: str | None = Field(default=None, min_length=1, max_length=500)
    thought: str | None = Field(default=None, min_length=1, max_length=500)
    kinder: str | None = Field(default=None, min_length=1, max_length=500)


class SyncCalibrationData(StrictSyncData):
    est: int | None = Field(default=None, ge=0, le=1440)
    actual: int | None = Field(default=None, ge=0, le=1440)

class ChangeIn(BaseModel):
    kind: Literal[
        "task", "task_step", "task_occurrence", "idea", "shopping_list", "list_item", "win", "energy_event",
        "checkin", "calibration",
    ]
    id: str                                   # klientgenererad UUIDv7
    op: Literal["upsert", "delete"] = "upsert"
    updated_at: datetime = Field(description="Klientens tidsstämpel — LWW-jämförelse")
    data: dict = Field(default_factory=dict)


class SyncChangeResult(BaseModel):
    kind: str
    id: str
    updated_at: datetime
    status: Literal["created", "updated", "deleted", "stale", "idempotent", "rejected"]
    reason: str | None = None


class SyncPushOut(BaseModel):
    created: int
    updated: int
    deleted: int
    skipped: int
    results: list[SyncChangeResult]
