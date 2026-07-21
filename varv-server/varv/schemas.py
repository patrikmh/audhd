"""Pydantic-scheman: API-DTO:er och agenternas typade outputs.

Agent-outputs är kontraktet mellan LLM och kod — Pydantic AI validerar och
begär om vid schemafel, så service-lagret slipper defensiv parsning.
"""
from pydantic import BaseModel, Field

from varv.db.models import CaptureType, Priority


# ---------- agent-outputs ----------

class ClassifiedCapture(BaseModel):
    """Sorterarens dom över en fångad tanke."""
    type: CaptureType
    title: str = Field(max_length=120, description="Kort städad titel, samma språk som tanken")
    note: str | None = Field(default=None, description="För idea: städad 1–2 meningar. Annars null.")
    tags: list[str] = Field(default_factory=list, max_length=3, description="1–3 korta taggar, svenska, gemener")
    energy: int | None = Field(default=None, ge=1, le=5, description="Energikostnad om task")
    time: str | None = Field(default=None, pattern=r"^\d{2}:\d{2}$", description="HH:MM endast om uttryckligen nämnt")


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


class BreakdownIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)


# ---------- synk ----------

class ChangeIn(BaseModel):
    kind: str                                 # task | task_step | idea | list_item | win | energy_event
    id: str                                   # klientgenererad UUIDv7
    op: str = "upsert"                        # upsert | delete
    updated_at: "datetime" = Field(description="Klientens tidsstämpel — LWW-jämförelse")
    data: dict = Field(default_factory=dict)


class SyncPushOut(BaseModel):
    created: int
    updated: int
    deleted: int
    skipped: int


from datetime import datetime  # noqa: E402  (för ChangeIn ovan)
ChangeIn.model_rebuild()
