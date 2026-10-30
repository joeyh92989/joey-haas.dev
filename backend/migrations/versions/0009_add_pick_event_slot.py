"""add pick event slot

Revision ID: 0009
Revises: 0008
Create Date: 2026-10-30

`pick_events.slot`: the Play Next slot a `shown` game was offered in, so the
public Tonight can order the day's picks and name their slots. Nullable:
rows from before this revision, and every other action, carry none.
Additive: one new column, nothing existing changes.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0009"
down_revision: str | None = "0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("pick_events", sa.Column("slot", sa.String(32), nullable=True))


def downgrade() -> None:
    op.drop_column("pick_events", "slot")
