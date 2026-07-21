"""Synkprotokollet: 'just sync the rows'. Server-auktoritativ, klientgenererade UUIDv7,
last-write-wins per rad via updated_at. CRDT medvetet bortvalt — en användare, få enheter.

- push: klienten skickar ändringar; okänd rad skapas, känd rad uppdateras om inkommande
  updated_at är nyare, delete sätter deleted_at (mjuk radering) istället för att ta bort
  raden — annars skulle en enhet som redan hade cachat raden aldrig få veta att den
  försvann, den skulle bara tyst sluta dyka upp i framtida pull. Append-only-tabeller är
  insert-om-saknas (idempotent på id) — de kan aldrig konfliktera eller raderas.
- pull: allt ändrat/skapat/mjukraderat sedan `since`, inklusive tombstones — klienten tar
  bort lokalt när den ser deleted_at != null. Klienten sparar högsta tidsstämpeln som cursor.
"""
from datetime import datetime

from sqlmodel import Session, select

from varv.db.models import EnergyEvent, Idea, ListItem, Task, TaskStep, Win
from varv.schemas import ChangeIn

SYNCABLE = {
    "task": Task,
    "task_step": TaskStep,
    "idea": Idea,
    "list_item": ListItem,
    "win": Win,
    "energy_event": EnergyEvent,
}
APPEND_ONLY = {"win", "energy_event"}         # saknar deleted_at — kan aldrig raderas
SOFT_DELETABLE = set(SYNCABLE) - APPEND_ONLY


# Kolumner klienten aldrig får sätta via synk: identitet, härkomst, serverägd bokföring
# och tombstone-status (den sätts bara via den explicita "delete"-op:en nedan).
_PROTECTED = {"id", "user_id", "created_at", "updated_at", "deleted_at", "routed_type", "routed_id", "topic_id"}


def _apply_fields(row, data: dict, model) -> None:
    allowed = set(model.model_fields) - _PROTECTED
    for key, value in data.items():
        if key in allowed:
            setattr(row, key, value)


def apply_changes(session: Session, user_id: str, changes: list[ChangeIn]) -> dict[str, int]:
    counts = {"created": 0, "updated": 0, "deleted": 0, "skipped": 0}
    for ch in changes:
        model = SYNCABLE.get(ch.kind)
        if model is None:
            counts["skipped"] += 1
            continue
        row = session.get(model, ch.id)
        if row is not None and row.user_id != user_id:  # tillhör en annan användare — ignorera tyst
            counts["skipped"] += 1
            continue

        if ch.op == "delete":
            if row is None or ch.kind not in SOFT_DELETABLE:
                counts["skipped"] += 1
            else:
                row.deleted_at = ch.updated_at
                row.updated_at = ch.updated_at
                counts["deleted"] += 1
            continue

        if row is None:
            row = model(id=ch.id, user_id=user_id)
            _apply_fields(row, ch.data, model)
            session.add(row)
            counts["created"] += 1
            continue

        if ch.kind in APPEND_ONLY:  # idempotent: finns redan → klart
            counts["skipped"] += 1
            continue

        existing = getattr(row, "updated_at", None)
        if existing is None or ch.updated_at > existing:  # LWW
            _apply_fields(row, ch.data, model)
            row.updated_at = ch.updated_at
            counts["updated"] += 1
        else:
            counts["skipped"] += 1

    session.commit()
    return counts


def _cursor_column(kind: str, model):
    """Append-only-tabeller saknar updated_at → paginera på created_at."""
    return model.created_at if kind in APPEND_ONLY else model.updated_at


def pull_changes(session: Session, user_id: str, since: datetime | None) -> dict[str, list[dict]]:
    """Inkluderar mjukraderade rader med flit — klienten behöver se tombstonen för att
    ta bort sin lokala kopia, filtrering på deleted_at hör hemma i de vanliga REST-listorna."""
    out: dict[str, list[dict]] = {}
    for kind, model in SYNCABLE.items():
        stamp = _cursor_column(kind, model)
        stmt = select(model).where(model.user_id == user_id).order_by(stamp)
        if since is not None:
            stmt = stmt.where(stamp > since)
        out[kind] = [row.model_dump(mode="json") for row in session.exec(stmt.limit(500)).all()]
    return out
