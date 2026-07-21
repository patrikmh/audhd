"""Cycle 1 safety gates for application startup and a fresh local database."""

# Behaviors covered by this task:
# 1. The ASGI application module imports successfully for Uvicorn startup.
# 2. An authenticated sync push persists a scheduled task in a fresh SQLite database.
# 3. An unauthenticated sync push is rejected without writing a task.
# 4. Resetting a disposable database archives the old bytes before creating the current schema.

from collections.abc import Iterator
from datetime import datetime, timezone
import importlib
from pathlib import Path
import sqlite3

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.engine import Engine
from sqlmodel import Session, SQLModel, create_engine

from varv.db.engine import get_session, init_db
from varv.db.models import Task, User
from varv.utils import hash_password


@pytest.fixture
def fresh_database_client(tmp_path: Path) -> Iterator[tuple[TestClient, Engine, str]]:
    database_path = tmp_path / "api.db"
    engine = create_engine(
        f"sqlite:///{database_path}",
        connect_args={"check_same_thread": False},
    )
    SQLModel.metadata.create_all(engine)
    token = "test-token"
    with Session(engine) as session:
        session.add(User(username="test", password_hash=hash_password("test"), token=token))
        session.commit()

    module = importlib.import_module("varv.main")

    def use_fresh_database() -> Iterator[Session]:
        with Session(engine) as session:
            yield session

    module.app.dependency_overrides[get_session] = use_fresh_database
    client = TestClient(module.app)
    try:
        yield client, engine, token
    finally:
        client.close()
        module.app.dependency_overrides.clear()
        engine.dispose()


def test_application_module_imports_for_uvicorn_startup():
    module = importlib.import_module("varv.main")

    assert module.app.title == "Varv"


def test_startup_rejects_an_outdated_database(tmp_path: Path):
    database_path = tmp_path / "outdated.db"
    with sqlite3.connect(database_path) as connection:
        connection.execute("CREATE TABLE task (id VARCHAR PRIMARY KEY, title VARCHAR NOT NULL)")

    outdated_engine = create_engine(f"sqlite:///{database_path}")
    try:
        with pytest.raises(RuntimeError, match=r"Database schema is outdated.*task\.scheduled_date"):
            init_db(outdated_engine)
    finally:
        outdated_engine.dispose()


def test_authenticated_sync_push_persists_scheduled_task(fresh_database_client):
    client, engine, token = fresh_database_client
    task_id = "019b1111-1111-7111-8111-111111111111"
    response = client.post(
        "/api/sync/push",
        headers={"Authorization": f"Bearer {token}"},
        json=[
            {
                "kind": "task",
                "id": task_id,
                "updated_at": datetime(2026, 7, 21, tzinfo=timezone.utc).isoformat(),
                "data": {
                    "title": "Kommande uppgift",
                    "energy": 2,
                    "scheduled_date": "2026-07-27",
                },
            }
        ],
    )

    assert response.status_code == 200
    with Session(engine) as session:
        task = session.get(Task, task_id)
        assert task is not None
        assert task.scheduled_date == "2026-07-27"


def test_unauthenticated_sync_push_does_not_write_task(fresh_database_client):
    client, engine, _ = fresh_database_client
    task_id = "019b2222-2222-7222-8222-222222222222"
    response = client.post(
        "/api/sync/push",
        json=[
            {
                "kind": "task",
                "id": task_id,
                "updated_at": datetime(2026, 7, 21, tzinfo=timezone.utc).isoformat(),
                "data": {"title": "Får inte sparas", "scheduled_date": "2026-07-28"},
            }
        ],
    )

    assert response.status_code == 401
    with Session(engine) as session:
        assert session.get(Task, task_id) is None


def test_reset_database_archives_old_bytes_before_creating_current_schema(tmp_path: Path):
    from scripts.reset_database import reset_database

    database_path = tmp_path / "varv.db"
    old_bytes = b"old-varv-database-sentinel"
    database_path.write_bytes(old_bytes)

    backup_path = reset_database(database_path)

    assert backup_path != database_path
    assert backup_path.read_bytes() == old_bytes
    assert database_path.exists()
    with sqlite3.connect(database_path) as connection:
        task_columns = {row[1] for row in connection.execute("PRAGMA table_info(task)")}
        revision = connection.execute("SELECT version_num FROM alembic_version").fetchone()
    assert "scheduled_date" in task_columns
    assert revision == ("0001",)
