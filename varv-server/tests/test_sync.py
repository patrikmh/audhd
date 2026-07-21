"""Synkprotokollet: LWW, idempotens och delete."""
from datetime import datetime, timedelta

from varv.db.models import Task, Win
from varv.schemas import ChangeIn
from varv.services.sync import apply_changes, pull_changes
from varv.utils import uuid7


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

    pulled = pull_changes(session, session.user_id, since=None)
    assert "task" in pulled and "win" in pulled
    pulled_task = next(t for t in pulled["task"] if t["id"] == tid)
    assert pulled_task["deleted_at"] is not None
