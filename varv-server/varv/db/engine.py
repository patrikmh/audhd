"""Motor + sessioner. SQLite som standard (Pi-vänligt), Postgres via VARV_DATABASE_URL."""
from collections.abc import Iterator
from contextlib import contextmanager

from sqlmodel import Session, SQLModel, create_engine

from varv.config import get_settings

_settings = get_settings()
_connect_args = {"check_same_thread": False} if _settings.database_url.startswith("sqlite") else {}
engine = create_engine(_settings.database_url, connect_args=_connect_args)


def init_db() -> None:
    """Dev-bootstrap. I drift: `alembic upgrade head` istället (migrations/).
    Skapar bara tabeller — användare (och deras Inköp-lista) skapas via
    scripts/create_user.py, se varv-server/README.md."""
    SQLModel.metadata.create_all(engine)


def get_session() -> Iterator[Session]:
    """FastAPI-dependency."""
    with Session(engine) as session:
        yield session


@contextmanager
def session_scope() -> Iterator[Session]:
    """För worker/jobb utanför request-cykeln."""
    with Session(engine) as session:
        yield session
