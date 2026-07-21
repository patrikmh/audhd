"""Motor + sessioner. SQLite som standard (Pi-vänligt), Postgres via VARV_DATABASE_URL."""
from collections.abc import Iterator
from contextlib import contextmanager

from sqlalchemy import Engine, event, inspect
from sqlmodel import Session, SQLModel, create_engine

from varv.config import get_settings
import varv.db.models  # noqa: F401  Register all tables before schema checks.

_settings = get_settings()
_is_sqlite = _settings.database_url.startswith("sqlite")
_connect_args = {"check_same_thread": False} if _is_sqlite else {}
engine = create_engine(_settings.database_url, connect_args=_connect_args)

if _is_sqlite:
    @event.listens_for(engine, "connect")
    def _sqlite_pragmas(dbapi_connection, connection_record) -> None:
        # SQLite ignorerar FK-constraints (våra ondelete="CASCADE") om man inte
        # slår på det per anslutning. WAL minskar "database is locked" när
        # bakgrundsworkern och API-requests läser/skriver samtidigt.
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.close()


def _missing_schema_columns(database_engine: Engine = engine) -> list[str]:
    inspector = inspect(database_engine)
    existing_tables = set(inspector.get_table_names())
    missing: list[str] = []
    for table in SQLModel.metadata.sorted_tables:
        if table.name not in existing_tables:
            missing.append(f"{table.name}.*")
            continue
        existing_columns = {column["name"] for column in inspector.get_columns(table.name)}
        missing.extend(
            f"{table.name}.{column.name}"
            for column in table.columns
            if column.name not in existing_columns
        )
    return missing


def init_db(database_engine: Engine = engine) -> None:
    """Dev-bootstrap. I drift: `alembic upgrade head` istället (migrations/).
    Skapar bara tabeller — användare (och deras Inköp-lista) skapas via
    scripts/create_user.py, se varv-server/README.md."""
    if not inspect(database_engine).get_table_names():
        SQLModel.metadata.create_all(database_engine)
    missing = _missing_schema_columns(database_engine)
    if missing:
        details = ", ".join(missing)
        raise RuntimeError(
            "Database schema is outdated. Archive and reset it with "
            f"`python -m scripts.reset_database PATH --confirm-reset`. Missing: {details}"
        )


def get_session() -> Iterator[Session]:
    """FastAPI-dependency."""
    with Session(engine) as session:
        yield session


@contextmanager
def session_scope() -> Iterator[Session]:
    """För worker/jobb utanför request-cykeln."""
    with Session(engine) as session:
        yield session
