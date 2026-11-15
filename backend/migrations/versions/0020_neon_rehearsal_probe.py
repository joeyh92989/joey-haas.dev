"""neon rehearsal probe (throwaway, never merged)

Revision ID: 0020
Revises: 0019
Create Date: 2026-11-15

Exists only to exercise ci.yml's neon-rehearsal job end to end: it sets a
column comment, which a schema diff shows and which touches no data.
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0020"
down_revision: str | None = "0019"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("COMMENT ON COLUMN items.title IS 'neon rehearsal probe'")


def downgrade() -> None:
    op.execute("COMMENT ON COLUMN items.title IS NULL")
