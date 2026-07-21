"""Testfixtures: in-memory SQLite + Pydantic AI:s TestModel (inga API-anrop i tester)."""
import os

# Agent(...)-konstruktion i varv/agents/core.py körs vid modulimport och kräver en
# nyckel för vald provider, även om testerna sedan kör sorteraren.override(TestModel()).
# Dummy-nycklar räcker — inget riktigt anrop görs i tester.
os.environ.setdefault("ANTHROPIC_API_KEY", "test")
os.environ.setdefault("OPENROUTER_API_KEY", "test")
os.environ.setdefault("OPENAI_API_KEY", "test")

import pytest
from sqlalchemy import event
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

import varv.db.models  # noqa: F401


@pytest.fixture
def session():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)

    @event.listens_for(engine, "connect")
    def enable_foreign_keys(dbapi_connection, connection_record):
        dbapi_connection.execute("PRAGMA foreign_keys=ON")

    SQLModel.metadata.create_all(engine)
    with Session(engine) as s:
        from varv.db.models import ShoppingList, User
        from varv.utils import hash_password, new_token

        user = User(username="test", password_hash=hash_password("test"), token=new_token())
        s.add(user)
        s.flush()
        s.add(ShoppingList(user_id=user.id, name="Inköp", slug="shopping"))
        s.commit()
        s.refresh(user)
        s.user_id = user.id  # bekvämt: testerna slipper egen fixture för användar-id
        yield s
