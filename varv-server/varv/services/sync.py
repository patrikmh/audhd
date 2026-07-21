"""Synkprotokollet: server-auktoritativt med klientgenererade UUIDv7.

Konflikter avgörs med LWW på normaliserad UTC. Pull använder en separat, monoton
serverversion per användare, så sena offlineändringar inte missas av en klockcursor.

- push: klienten skickar ändringar; okänd rad skapas, känd rad uppdateras om inkommande
  updated_at är nyare, delete sätter deleted_at (mjuk radering) istället för att ta bort
  raden — annars skulle en enhet som redan hade cachat raden aldrig få veta att den
  försvann, den skulle bara tyst sluta dyka upp i framtida pull. Append-only-tabeller är
  insert-om-saknas (idempotent på id) — de kan aldrig konfliktera eller raderas.
- pull: en globalt ordnad sida efter `cursor`, inklusive tombstones. Klienten sparar sidans
  `next_cursor` först efter att ändringarna har slagits ihop lokalt.
"""
from datetime import datetime, timezone

from pydantic import ValidationError
from sqlmodel import Session, select

from varv.db.models import (
    EnergyEvent, Idea, ListItem, ShoppingList, SyncTombstone, Task, TaskOccurrence, TaskStep, Win,
)
from varv.schemas import (
    ChangeIn, SyncEnergyEventData, SyncIdeaData, SyncListItemData, SyncShoppingListData,
    SyncTaskData, SyncTaskOccurrenceData, SyncTaskStepData, SyncWinData,
)
from varv.services.capture import redact_idea

SYNCABLE = {
    "task": Task,
    "task_step": TaskStep,
    "task_occurrence": TaskOccurrence,
    "idea": Idea,
    "shopping_list": ShoppingList,
    "list_item": ListItem,
    "win": Win,
    "energy_event": EnergyEvent,
}
APPEND_ONLY = {"win", "energy_event"}         # saknar deleted_at — kan aldrig raderas
SOFT_DELETABLE = set(SYNCABLE) - APPEND_ONLY
DATA_SCHEMAS = {
    "task": SyncTaskData,
    "task_step": SyncTaskStepData,
    "task_occurrence": SyncTaskOccurrenceData,
    "idea": SyncIdeaData,
    "shopping_list": SyncShoppingListData,
    "list_item": SyncListItemData,
    "win": SyncWinData,
    "energy_event": SyncEnergyEventData,
}
REQUIRED_ON_CREATE = {
    "task": {"title"},
    "task_step": {"task_id", "title"},
    "task_occurrence": {"task_id", "date"},
    "idea": {"raw"},
    "shopping_list": {"name", "slug"},
    "list_item": {"list_id", "text"},
    "win": {"text"},
    "energy_event": {"delta", "label"},
}


# Kolumner klienten aldrig får sätta via synk: identitet, härkomst, serverägd bokföring
# och tombstone-status (den sätts bara via den explicita "delete"-op:en nedan).
_PROTECTED = {
    "id", "user_id", "created_at", "updated_at", "deleted_at", "sync_version",
    "routed_type", "routed_id", "topic_id",
}


def _apply_fields(row, data: dict, model) -> None:
    allowed = set(model.model_fields) - _PROTECTED
    for key, value in data.items():
        if key in allowed:
            setattr(row, key, value)


def _utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _find_tombstone(session: Session, user_id: str, kind: str, entity_id: str) -> SyncTombstone | None:
    return session.exec(
        select(SyncTombstone).where(
            SyncTombstone.user_id == user_id,
            SyncTombstone.kind == kind,
            SyncTombstone.entity_id == entity_id,
        )
    ).first()


def _result(ch: ChangeIn, status: str, reason: str | None = None) -> dict:
    return {
        "kind": ch.kind,
        "id": ch.id,
        "updated_at": ch.updated_at,
        "status": status,
        "reason": reason,
    }


def _validated_data(ch: ChangeIn, is_create: bool) -> tuple[dict | None, str | None]:
    try:
        data = DATA_SCHEMAS[ch.kind].model_validate(ch.data).model_dump(exclude_unset=True)
    except ValidationError as error:
        return None, error.errors()[0]["msg"]
    if is_create:
        missing = sorted(REQUIRED_ON_CREATE[ch.kind] - data.keys())
        if missing:
            return None, f"Missing required fields: {', '.join(missing)}"
    return data, None


def _parent_error(session: Session, user_id: str, kind: str, row, data: dict) -> str | None:
    if kind in ("task_step", "task_occurrence"):
        task_id = data.get("task_id") or getattr(row, "task_id", None)
        parent = session.get(Task, task_id) if task_id else None
        if parent is None or parent.user_id != user_id or parent.deleted_at is not None:
            return f"{kind} parent is not owned by this user"
    if kind == "list_item":
        list_id = data.get("list_id") or getattr(row, "list_id", None)
        parent = session.get(ShoppingList, list_id) if list_id else None
        if parent is None or parent.user_id != user_id or parent.deleted_at is not None:
            return "List item parent is not owned by this user"
    if kind == "shopping_list" and data.get("slug"):
        existing = session.exec(
            select(ShoppingList).where(
                ShoppingList.user_id == user_id,
                ShoppingList.slug == data["slug"],
            )
        ).first()
        if existing is not None and existing.id != getattr(row, "id", None):
            return "List slug already exists"
    return None


def apply_changes(session: Session, user_id: str, changes: list[ChangeIn]) -> dict:
    counts = {"created": 0, "updated": 0, "deleted": 0, "skipped": 0}
    results: list[dict] = []
    for ch in changes:
        model = SYNCABLE.get(ch.kind)
        if model is None:
            counts["skipped"] += 1
            results.append(_result(ch, "rejected"))
            continue
        row = session.get(model, ch.id)
        if row is not None and row.user_id != user_id:
            counts["skipped"] += 1
            results.append(_result(ch, "rejected"))
            continue

        incoming = _utc(ch.updated_at)

        if ch.op == "delete":
            if ch.kind not in SOFT_DELETABLE:
                counts["skipped"] += 1
                results.append(_result(ch, "idempotent"))
                continue

            if row is None:
                tombstone = _find_tombstone(session, user_id, ch.kind, ch.id)
                if tombstone is not None:
                    tombstone_stamp = _utc(tombstone.updated_at)
                    if incoming < tombstone_stamp:
                        counts["skipped"] += 1
                        results.append(_result(ch, "stale"))
                        continue
                    if incoming == tombstone_stamp:
                        counts["skipped"] += 1
                        results.append(_result(ch, "idempotent"))
                        continue
                if tombstone is None:
                    tombstone = SyncTombstone(user_id=user_id, kind=ch.kind, entity_id=ch.id)
                    session.add(tombstone)
                tombstone.updated_at = incoming
                counts["deleted"] += 1
                results.append(_result(ch, "deleted"))
                continue

            existing = _utc(row.updated_at)
            if incoming < existing:
                counts["skipped"] += 1
                results.append(_result(ch, "stale"))
                continue
            if row.deleted_at is not None and incoming == existing:
                counts["skipped"] += 1
                results.append(_result(ch, "idempotent"))
                continue
            if ch.kind == "idea":
                redact_idea(session, user_id, row)
            row.deleted_at = incoming
            row.updated_at = incoming
            counts["deleted"] += 1
            results.append(_result(ch, "deleted"))
            continue

        data, validation_error = _validated_data(ch, row is None)
        if validation_error:
            counts["skipped"] += 1
            results.append(_result(ch, "rejected", validation_error))
            continue
        parent_error = _parent_error(session, user_id, ch.kind, row, data)
        if parent_error:
            counts["skipped"] += 1
            results.append(_result(ch, "rejected", parent_error))
            continue

        tombstone = _find_tombstone(session, user_id, ch.kind, ch.id)
        if tombstone is not None:
            if incoming <= _utc(tombstone.updated_at):
                counts["skipped"] += 1
                results.append(_result(ch, "stale"))
                continue
            session.delete(tombstone)

        # Ett (task_id, date)-par har högst en rad (DB-constraint) — två klienter som
        # båda skapar en ny occurrence-id för samma dag (t.ex. offline på varsin enhet)
        # ska LWW:as mot varandra, inte krascha på unik-constrainten vid commit.
        if row is None and ch.kind == "task_occurrence" and data.get("task_id") and data.get("date"):
            row = session.exec(
                select(TaskOccurrence).where(
                    TaskOccurrence.user_id == user_id,
                    TaskOccurrence.task_id == data["task_id"],
                    TaskOccurrence.date == data["date"],
                )
            ).first()

        if row is None:
            row = model(id=ch.id, user_id=user_id)
            _apply_fields(row, data, model)
            if ch.kind not in APPEND_ONLY:
                row.updated_at = incoming
            session.add(row)
            session.flush()
            counts["created"] += 1
            results.append(_result(ch, "created"))
            continue

        if ch.kind in APPEND_ONLY:  # idempotent: finns redan → klart
            counts["skipped"] += 1
            results.append(_result(ch, "idempotent"))
            continue

        existing = _utc(row.updated_at)
        if incoming > existing:
            _apply_fields(row, data, model)
            row.updated_at = incoming
            row.deleted_at = None
            counts["updated"] += 1
            results.append(_result(ch, "updated"))
        else:
            counts["skipped"] += 1
            results.append(_result(ch, "stale"))

    session.commit()
    return {**counts, "results": results}


def pull_changes(session: Session, user_id: str, cursor: int = 0, limit: int = 200) -> dict:
    """Return one globally ordered page, including rows and standalone tombstones."""
    entries: list[tuple[int, str, str, dict]] = []
    for kind, model in SYNCABLE.items():
        stmt = (
            select(model)
            .where(model.user_id == user_id, model.sync_version > cursor)
            .order_by(model.sync_version)
            .limit(limit + 1)
        )
        entries.extend(
            (row.sync_version, kind, row.id, row.model_dump(mode="json"))
            for row in session.exec(stmt).all()
        )

    tombstones = session.exec(
        select(SyncTombstone)
        .where(SyncTombstone.user_id == user_id, SyncTombstone.sync_version > cursor)
        .order_by(SyncTombstone.sync_version)
        .limit(limit + 1)
    ).all()
    entries.extend(
        (
            tombstone.sync_version,
            tombstone.kind,
            tombstone.entity_id,
            {
                "id": tombstone.entity_id,
                "updated_at": tombstone.updated_at.isoformat(),
                "deleted_at": tombstone.updated_at.isoformat(),
                "sync_version": tombstone.sync_version,
            },
        )
        for tombstone in tombstones
    )

    entries.sort(key=lambda entry: (entry[0], entry[1], entry[2]))
    page = entries[:limit]
    changes: dict[str, list[dict]] = {kind: [] for kind in SYNCABLE}
    for _, kind, _, data in page:
        changes[kind].append(data)
    return {
        "changes": changes,
        "next_cursor": page[-1][0] if page else cursor,
        "has_more": len(entries) > limit,
    }
