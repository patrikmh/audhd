"""Motor + sessioner. SQLite som standard (Pi-vänligt), Postgres via VARV_DATABASE_URL."""
from collections.abc import Iterator
from contextlib import contextmanager

from sqlmodel import Session, SQLModel, create_engine, select

from varv.config import get_settings
from varv.db.models import ShoppingList

_settings = get_settings()
_connect_args = {"check_same_thread": False} if _settings.database_url.startswith("sqlite") else {}
engine = create_engine(_settings.database_url, connect_args=_connect_args)


def init_db() -> None:
    """Dev-bootstrap. I drift: `alembic upgrade head` istället (migrations/)."""
    SQLModel.metadata.create_all(engine)
    with Session(engine) as s:
        if not s.exec(select(ShoppingList).where(ShoppingList.slug == "shopping")).first():
            s.add(ShoppingList(name="Inköp", slug="shopping"))
            s.commit()


def get_session() -> Iterator[Session]:
    """FastAPI-dependency."""
    with Session(engine) as session:
        yield session


@contextmanager
def session_scope() -> Iterator[Session]:
    """För worker/jobb utanför request-cykeln."""
    with Session(engine) as session:
        yield session
