"""add enrichment columns

Revision ID: 0002
Revises: 0001
Create Date: 2026-09-01
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# create_type=False because no op.create_table is involved here: add_column
# will not create the type, so it is created explicitly in upgrade() and
# dropped explicitly in downgrade().
owned_format = postgresql.ENUM(
    "physical",
    "digital",
    "subscription",
    "borrowed",
    "none",
    name="owned_format",
    create_type=False,
)

EXTERNAL_PRESENT = "external_source IS NOT NULL AND external_id IS NOT NULL"


def upgrade() -> None:
    owned_format.create(op.get_bind(), checkfirst=True)

    op.add_column("items", sa.Column("year", sa.SmallInteger(), nullable=True))
    op.add_column("items", sa.Column("creator", sa.String(length=300), nullable=True))
    op.add_column("items", sa.Column("cover_url", sa.Text(), nullable=True))
    op.add_column(
        "items", sa.Column("external_source", sa.String(length=20), nullable=True)
    )
    op.add_column(
        "items", sa.Column("external_id", sa.String(length=50), nullable=True)
    )
    op.add_column(
        "items",
        sa.Column("favorite", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column("items", sa.Column("started_at", sa.Date(), nullable=True))
    op.add_column("items", sa.Column("finished_at", sa.Date(), nullable=True))
    op.add_column(
        "items",
        sa.Column(
            "times_completed", sa.SmallInteger(), nullable=False, server_default="0"
        ),
    )
    op.add_column("items", sa.Column("owned_format", owned_format, nullable=True))
    op.add_column(
        "items", sa.Column("source_metadata", postgresql.JSONB(), nullable=True)
    )

    # Partial: manual rows carry NULL on both columns and must not collide
    # with each other.
    op.create_index(
        "ux_items_external",
        "items",
        ["external_source", "external_id"],
        unique=True,
        postgresql_where=sa.text(EXTERNAL_PRESENT),
    )
    op.create_index("ix_items_finished_at", "items", ["finished_at"])


def downgrade() -> None:
    op.drop_index("ix_items_finished_at", table_name="items")
    op.drop_index("ux_items_external", table_name="items")

    for column in (
        "source_metadata",
        "owned_format",
        "times_completed",
        "finished_at",
        "started_at",
        "favorite",
        "external_id",
        "external_source",
        "cover_url",
        "creator",
        "year",
    ):
        op.drop_column("items", column)

    # The same trap 0001's downgrade documents: Postgres keeps the enum type
    # after its only column is gone, and the next upgrade fails on "type
    # already exists" a long way from the cause.
    owned_format.drop(op.get_bind(), checkfirst=True)
