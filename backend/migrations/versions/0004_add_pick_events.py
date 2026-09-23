"""add pick events

Revision ID: 0004
Revises: 0003
Create Date: 2026-09-23

What Play Next showed, and what the owner told it: skip, never, pinned.
Additive: a new table and type, nothing existing changes.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# create_type=False: the type is created and dropped explicitly, for the reason
# 0002 gives.
pick_action = postgresql.ENUM(
    "shown", "skipped", "never", "pinned", name="pick_action", create_type=False
)


def upgrade() -> None:
    pick_action.create(op.get_bind(), checkfirst=True)
    op.create_table(
        "pick_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "item_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("items.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("action", pick_action, nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index(
        "ix_pick_events_item_action_created",
        "pick_events",
        ["item_id", "action", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_pick_events_item_action_created", table_name="pick_events")
    op.drop_table("pick_events")
    pick_action.drop(op.get_bind(), checkfirst=True)
