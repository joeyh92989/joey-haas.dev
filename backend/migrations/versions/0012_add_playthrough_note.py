"""add playthroughs.note

Revision ID: 0012
Revises: 0011
Create Date: 2026-11-08

Tonight continue (docs/planning/2026-11-08-tonight-continue-design.md): a
one-line note on a playthrough, written by the Wrap up sheet when a run is
closed or paused ("what stuck with you"). The owner's, never public: the
What's next body bans the key (tests/test_public_outputs.py, FORBIDDEN).

Additive: one nullable text column, nothing renamed or dropped. The code
before this revision never reads it, so the deploy order (migrate, then
merge) holds.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0012"
down_revision: str | None = "0011"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("playthroughs", sa.Column("note", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("playthroughs", "note")
