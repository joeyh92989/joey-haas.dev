"""add play sessions

Revision ID: 0007
Revises: 0006
Create Date: 2026-10-19

The play journal: one row per day a game was played, with optional minutes
and a private note. Additive: a new table, nothing existing changes.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0007"
down_revision: str | None = "0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "play_sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "item_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("items.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("played_on", sa.Date(), nullable=False),
        sa.Column("minutes", sa.Integer(), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.CheckConstraint(
            "minutes IS NULL OR minutes > 0", name="play_sessions_minutes_positive"
        ),
    )
    op.create_index(
        "ix_play_sessions_item_played", "play_sessions", ["item_id", "played_on"]
    )
    op.create_index("ix_play_sessions_played_on", "play_sessions", ["played_on"])


def downgrade() -> None:
    op.drop_index("ix_play_sessions_played_on", table_name="play_sessions")
    op.drop_index("ix_play_sessions_item_played", table_name="play_sessions")
    op.drop_table("play_sessions")
