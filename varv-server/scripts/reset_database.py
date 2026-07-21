"""Safely archive and replace one local SQLite database."""

import argparse
from datetime import datetime, timezone
from itertools import count
import os
from pathlib import Path
import shutil
import tempfile

from alembic import command
from alembic.config import Config


PROJECT_ROOT = Path(__file__).resolve().parents[1]


def _backup_database(database_path: Path) -> Path:
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S.%fZ")

    for collision in count():
        suffix = "" if collision == 0 else f".{collision}"
        backup_path = database_path.with_name(
            f"{database_path.name}.{timestamp}{suffix}.bak"
        )
        try:
            with database_path.open("rb") as source, backup_path.open("xb") as backup:
                shutil.copyfileobj(source, backup)
                backup.flush()
                os.fsync(backup.fileno())
        except FileExistsError:
            continue
        except Exception:
            backup_path.unlink(missing_ok=True)
            raise
        return backup_path

    raise RuntimeError("Could not create a unique database backup")


def _create_current_database(database_path: Path) -> None:
    file_descriptor, temporary_name = tempfile.mkstemp(
        dir=database_path.parent,
        prefix=f".{database_path.name}.",
        suffix=".tmp",
    )
    os.close(file_descriptor)
    temporary_path = Path(temporary_name)

    try:
        config = Config(str(PROJECT_ROOT / "alembic.ini"))
        config.set_main_option("script_location", str(PROJECT_ROOT / "migrations"))
        config.set_main_option("sqlalchemy.url", f"sqlite:///{temporary_path}")
        command.upgrade(config, "head")
        os.replace(temporary_path, database_path)
    except Exception:
        temporary_path.unlink(missing_ok=True)
        raise


def reset_database(db_path: Path) -> Path:
    """Archive ``db_path`` and atomically replace it with the migrated schema."""
    database_path = Path(db_path).resolve()
    if not database_path.is_file():
        raise FileNotFoundError(f"Database does not exist: {database_path}")

    backup_path = _backup_database(database_path)

    _create_current_database(database_path)
    return backup_path


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Archive a Varv SQLite database and create a fresh migrated database."
    )
    parser.add_argument("database", type=Path, help="Exact SQLite database path")
    parser.add_argument(
        "--confirm-reset",
        action="store_true",
        help="Required acknowledgement that the database will be replaced",
    )
    args = parser.parse_args()
    if not args.confirm_reset:
        parser.error("--confirm-reset is required; stop Varv before resetting")

    backup_path = reset_database(args.database)
    print(f"Backup: {backup_path}")
    print(f"Fresh database: {args.database.resolve()}")


if __name__ == "__main__":
    main()
