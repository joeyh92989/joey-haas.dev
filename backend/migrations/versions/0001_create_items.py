"""create items table

Revision ID: 0001
Revises:
Create Date: 2026-09-01
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

item_type = sa.Enum("game", "movie", "comic", "boardgame", name="item_type")
item_status = sa.Enum("backlog", "active", "finished", "abandoned", name="item_status")


def upgrade() -> None:
    op.create_table(
        "items",
        sa.Column(
            "id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False
        ),
        sa.Column("type", item_type, nullable=False),
        sa.Column("title", sa.String(length=500), nullable=False),
        sa.Column("status", item_status, nullable=False),
        sa.Column("rating", sa.SmallInteger(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("is_public", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.CheckConstraint(
            "rating IS NULL OR (rating >= 1 AND rating <= 10)",
            name="items_rating_range",
        ),
    )
    op.create_index("ix_items_type", "items", ["type"])
    op.create_index("ix_items_status", "items", ["status"])


def downgrade() -> None:
    op.drop_index("ix_items_status", table_name="items")
    op.drop_index("ix_items_type", table_name="items")
    op.drop_table("items")
    # Postgres does not remove enum types with the table. Without these drops a
    # later upgrade fails on "type already exists", a long way from its cause.
    item_status.drop(op.get_bind())
    item_type.drop(op.get_bind())
