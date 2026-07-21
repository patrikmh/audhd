"""Testfixtures: in-memory SQLite + Pydantic AI:s TestModel (inga API-anrop i tester)."""
import pytest
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

import varv.db.models  # noqa: F401


@pytest.fixture
def session():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    SQLModel.metadata.create_all(engine)
    with Session(engine) as s:
        from varv.db.models import ShoppingList
        s.add(ShoppingList(name="Inköp", slug="shopping"))
        s.commit()
        yield s
