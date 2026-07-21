"""Synkprotokollet: LWW, idempotens och delete."""
from datetime import datetime, timedelta, timezone

from sqlmodel import select

from varv.db.models import ShoppingList, Task, TaskOccurrence, TaskStep, User, Win
from varv.schemas import ChangeIn
from varv.services.sync import apply_changes, pull_changes
from varv.utils import hash_password, new_token, uuid7


def test_create_then_lww_update(session):
    tid = uuid7()
    t0 = datetime.now()
    apply_changes(session, session.user_id, [ChangeIn(kind="task", id=tid, updated_at=t0, data={"title": "A", "energy": 2})])
    assert session.get(Task, tid).title == "A"

    # äldre ändring förlorar
    apply_changes(session, session.user_id, [ChangeIn(kind="task", id=tid, updated_at=t0 - timedelta(minutes=5), data={"title": "GAMMAL"})])
    assert session.get(Task, tid).title == "A"

    # nyare vinner
    apply_changes(session, session.user_id, [ChangeIn(kind="task", id=tid, updated_at=t0 + timedelta(minutes=5), data={"title": "B"})])
    assert session.get(Task, tid).title == "B"


def test_append_only_idempotent(session):
    wid = uuid7()
    ch = ChangeIn(kind="win", id=wid, updated_at=datetime.now(), data={"text": "Klart: x", "day": "2026-07-20"})
    r1 = apply_changes(session, session.user_id, [ch])
    r2 = apply_changes(session, session.user_id, [ch])         # samma id igen → hoppas över
    assert r1["created"] == 1 and r2["created"] == 0 and r2["skipped"] == 1
    assert session.get(Win, wid).text == "Klart: x"


def test_delete_and_pull(session):
    """Delete är en mjuk radering (tombstone) — raden lever kvar med deleted_at satt,
    så en enhet som redan cachat den lokalt får se förändringen vid nästa pull istället
    för att tyst tappa den ur sikte."""
    tid = uuid7()
    now = datetime.now()
    apply_changes(session, session.user_id, [ChangeIn(kind="task", id=tid, updated_at=now, data={"title": "bort"})])
    apply_changes(session, session.user_id, [ChangeIn(kind="task", id=tid, op="delete", updated_at=now)])
    deleted_task = session.get(Task, tid)
    assert deleted_task is not None and deleted_task.deleted_at is not None

    pulled = pull_changes(session, session.user_id)
    assert "task" in pulled["changes"] and "win" in pulled["changes"]
    pulled_task = next(t for t in pulled["changes"]["task"] if t["id"] == tid)
    assert pulled_task["deleted_at"] is not None


def test_idea_delete_scrubs_content_not_just_soft_deletes(session):
    """Ideas hold raw, unfiltered thoughts — deletion must actually wipe the sensitive
    fields, not just flip deleted_at like every other syncable kind does."""
    iid = uuid7()
    now = datetime.now()
    apply_changes(session, session.user_id, [ChangeIn(
        kind="idea", id=iid, updated_at=now,
        data={"raw": "vill lämna jobbet", "title": "lämna jobbet", "note": "hemligt", "tags": ["privat"]},
    )])
    apply_changes(session, session.user_id, [ChangeIn(kind="idea", id=iid, op="delete", updated_at=now + timedelta(seconds=1))])

    from varv.db.models import Idea
    idea = session.get(Idea, iid)
    assert idea.deleted_at is not None
    assert idea.raw == "" and idea.title is None and idea.note is None and idea.tags == []

    pulled = pull_changes(session, session.user_id)
    pulled_idea = next(i for i in pulled["changes"]["idea"] if i["id"] == iid)
    assert pulled_idea["raw"] == "" and pulled_idea["title"] is None


def test_change_cannot_modify_another_users_row(session):
    task_id = uuid7()
    now = datetime.now()
    apply_changes(
        session,
        session.user_id,
        [ChangeIn(kind="task", id=task_id, updated_at=now, data={"title": "Privat"})],
    )
    other_user = User(username="other", password_hash=hash_password("test"), token=new_token())
    session.add(other_user)
    session.commit()

    result = apply_changes(
        session,
        other_user.id,
        [
            ChangeIn(
                kind="task",
                id=task_id,
                updated_at=now + timedelta(minutes=1),
                data={"title": "Övertagen"},
            )
        ],
    )

    task = session.get(Task, task_id)
    session.refresh(task)
    assert result["skipped"] == 1
    assert task.title == "Privat"


def test_aware_utc_update_and_stale_delete(session):
    task_id = uuid7()
    first = datetime(2026, 7, 21, 18, 0, tzinfo=timezone.utc)
    newer = first + timedelta(minutes=5)
    apply_changes(
        session,
        session.user_id,
        [ChangeIn(kind="task", id=task_id, updated_at=first, data={"title": "Först"})],
    )
    apply_changes(
        session,
        session.user_id,
        [ChangeIn(kind="task", id=task_id, updated_at=newer, data={"title": "Nyare"})],
    )

    result = apply_changes(
        session,
        session.user_id,
        [ChangeIn(kind="task", id=task_id, op="delete", updated_at=first)],
    )

    task = session.get(Task, task_id)
    assert result["results"][0]["status"] == "stale"
    assert task.title == "Nyare"
    assert task.deleted_at is None


def test_unknown_delete_blocks_stale_resurrection(session):
    task_id = uuid7()
    deleted_at = datetime(2026, 7, 21, 19, 0, tzinfo=timezone.utc)
    apply_changes(
        session,
        session.user_id,
        [ChangeIn(kind="task", id=task_id, op="delete", updated_at=deleted_at)],
    )

    stale = apply_changes(
        session,
        session.user_id,
        [
            ChangeIn(
                kind="task",
                id=task_id,
                updated_at=deleted_at - timedelta(minutes=1),
                data={"title": "Gammal kopia"},
            )
        ],
    )
    assert stale["results"][0]["status"] == "stale"
    assert session.get(Task, task_id) is None

    fresh = apply_changes(
        session,
        session.user_id,
        [
            ChangeIn(
                kind="task",
                id=task_id,
                updated_at=deleted_at + timedelta(minutes=1),
                data={"title": "Avsiktligt återställd"},
            )
        ],
    )
    assert fresh["results"][0]["status"] == "created"
    assert session.get(Task, task_id).title == "Avsiktligt återställd"


def test_pull_uses_a_monotonic_paginated_cursor(session):
    base = datetime(2026, 7, 21, 20, 0, tzinfo=timezone.utc)
    changes = [
        ChangeIn(
            kind="task",
            id=uuid7(),
            updated_at=base + timedelta(minutes=index),
            data={"title": f"Uppgift {index}"},
        )
        for index in range(3)
    ]
    apply_changes(session, session.user_id, changes)

    first_page = pull_changes(session, session.user_id, cursor=0, limit=2)
    second_page = pull_changes(
        session,
        session.user_id,
        cursor=first_page["next_cursor"],
        limit=2,
    )

    assert sum(len(rows) for rows in first_page["changes"].values()) == 2
    assert first_page["has_more"] is True
    assert len(first_page["changes"]["task"]) + len(second_page["changes"]["task"]) == 3
    assert second_page["has_more"] is False
    assert second_page["next_cursor"] > first_page["next_cursor"]


def test_rich_recurring_task_and_steps_round_trip(session):
    task_id = uuid7()
    step_id = uuid7()
    now = datetime(2026, 7, 21, 21, 0, tzinfo=timezone.utc)
    result = apply_changes(
        session,
        session.user_id,
        [
            ChangeIn(
                kind="task",
                id=task_id,
                updated_at=now,
                data={
                    "title": "Ge Bubba medicin",
                    "scheduled_date": "2026-07-24",
                    "note": "Med mat",
                    "tags": ["bubba", "medicin"],
                    "repeat_days": ["mon", "fri"],
                },
            ),
            ChangeIn(
                kind="task_step",
                id=step_id,
                updated_at=now + timedelta(seconds=1),
                data={
                    "task_id": task_id,
                    "title": "Hämta medicinen",
                    "minutes": 2,
                    "position": 0,
                    "done": False,
                },
            ),
        ],
    )

    assert [item["status"] for item in result["results"]] == ["created", "created"]
    task = session.get(Task, task_id)
    step = session.get(TaskStep, step_id)
    assert task.repeat_days == ["mon", "fri"]
    assert task.tags == ["bubba", "medicin"]
    assert task.note == "Med mat"
    assert step.task_id == task_id


def test_task_occurrence_completion_is_independent_per_date(session):
    """Completing a recurring task on one date must not touch the template row or any
    other date's occurrence — history is per (task_id, date), never rewritten in place."""
    task_id = uuid7()
    now = datetime(2026, 7, 21, 8, 0, tzinfo=timezone.utc)
    apply_changes(session, session.user_id, [ChangeIn(
        kind="task", id=task_id, updated_at=now,
        data={"title": "Vattna blommorna", "repeat_days": ["mon", "wed", "fri"]},
    )])

    mon_id, wed_id = uuid7(), uuid7()
    apply_changes(session, session.user_id, [
        ChangeIn(kind="task_occurrence", id=mon_id, updated_at=now, data={
            "task_id": task_id, "date": "2026-07-20", "done": True,
            "done_at": now.isoformat(), "steps_snapshot": [{"title": "Häll vatten", "done": True}],
        }),
        ChangeIn(kind="task_occurrence", id=wed_id, updated_at=now, data={
            "task_id": task_id, "date": "2026-07-22", "done": False,
        }),
    ])

    task = session.get(Task, task_id)
    assert task.done is False  # templatet självt bär aldrig completion-status

    mon = session.get(TaskOccurrence, mon_id)
    wed = session.get(TaskOccurrence, wed_id)
    assert mon.done is True and mon.steps_snapshot == [{"title": "Häll vatten", "done": True}]
    assert wed.done is False  # onsdagens instans opåverkad av måndagens completion

    # Två enheter som var för sig skapar en ny occurrence-id för samma (task_id, date)
    # (t.ex. båda klart offline) ska LWW:as mot varandra, inte krocka på DB-constrainten.
    dup_result = apply_changes(session, session.user_id, [ChangeIn(
        kind="task_occurrence", id=uuid7(), updated_at=now + timedelta(minutes=5),
        data={"task_id": task_id, "date": "2026-07-20", "done": False},
    )])
    assert dup_result["results"][0]["status"] == "updated"
    rows_for_monday = session.exec(
        select(TaskOccurrence).where(TaskOccurrence.task_id == task_id, TaskOccurrence.date == "2026-07-20")
    ).all()
    assert len(rows_for_monday) == 1 and rows_for_monday[0].id == mon_id and rows_for_monday[0].done is False


def test_task_occurrence_requires_owned_task_parent(session):
    other_user = User(username="occurrence-parent-owner", password_hash=hash_password("test"), token=new_token())
    session.add(other_user)
    session.flush()
    foreign_task_id = uuid7()
    apply_changes(session, other_user.id, [ChangeIn(
        kind="task", id=foreign_task_id, updated_at=datetime.now(), data={"title": "Inte din uppgift"},
    )])

    result = apply_changes(session, session.user_id, [ChangeIn(
        kind="task_occurrence", id=uuid7(), updated_at=datetime.now(),
        data={"task_id": foreign_task_id, "date": "2026-07-21"},
    )])
    assert result["results"][0]["status"] == "rejected"


def test_sync_rejects_unknown_fields_and_cross_user_parents(session):
    other_user = User(username="parent-owner", password_hash=hash_password("test"), token=new_token())
    session.add(other_user)
    session.flush()
    other_task = Task(user_id=other_user.id, title="Annan användares uppgift")
    session.add(other_task)
    session.commit()
    now = datetime(2026, 7, 21, 22, 0, tzinfo=timezone.utc)

    unknown_field = apply_changes(
        session,
        session.user_id,
        [
            ChangeIn(
                kind="task",
                id=uuid7(),
                updated_at=now,
                data={"title": "Test", "user_id": other_user.id},
            )
        ],
    )
    cross_user_step = apply_changes(
        session,
        session.user_id,
        [
            ChangeIn(
                kind="task_step",
                id=uuid7(),
                updated_at=now,
                data={"task_id": other_task.id, "title": "Otillåtet steg"},
            )
        ],
    )

    assert unknown_field["results"][0]["status"] == "rejected"
    assert cross_user_step["results"][0]["status"] == "rejected"
    assert "not owned" in cross_user_step["results"][0]["reason"]


def test_list_item_requires_an_owned_list(session):
    shopping_list = session.exec(
        select(ShoppingList).where(ShoppingList.user_id == session.user_id)
    ).one()
    now = datetime(2026, 7, 21, 23, 0, tzinfo=timezone.utc)
    accepted = apply_changes(
        session,
        session.user_id,
        [
            ChangeIn(
                kind="list_item",
                id=uuid7(),
                updated_at=now,
                data={"list_id": shopping_list.id, "text": "Mjölk"},
            )
        ],
    )
    rejected = apply_changes(
        session,
        session.user_id,
        [
            ChangeIn(
                kind="list_item",
                id=uuid7(),
                updated_at=now,
                data={"list_id": "missing", "text": "Hemlig"},
            )
        ],
    )

    assert accepted["results"][0]["status"] == "created"
    assert rejected["results"][0]["status"] == "rejected"
