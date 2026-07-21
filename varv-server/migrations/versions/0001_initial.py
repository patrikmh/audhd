"""initial schema — bootstrap från SQLModel-metadata.
Framtida ändringar: `alembic revision --autogenerate -m "..."` ger riktiga op-anrop.
"""
from alembic import op
from sqlmodel import SQLModel

import varv.db.models  # noqa: F401

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    SQLModel.metadata.create_all(op.get_bind())


def downgrade() -> None:
    SQLModel.metadata.drop_all(op.get_bind())
