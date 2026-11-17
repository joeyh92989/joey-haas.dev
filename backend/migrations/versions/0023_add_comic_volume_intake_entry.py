"""add comic_volumes.intake_entry_id

Revision ID: 0023
Revises: 0022
Create Date: 2026-11-17

Comics, book-first (epic #323, story #328). Intake now commits a collected
book as a volume. The volume remembers the intake entry it came from, so
committing the same entry twice (a retry, a second device) finds the volume
instead of making another.

Additive: one nullable uuid column with no foreign key (the entry is deleted
once its sitting is committed, and the volume must outlive it), and a partial
unique index on it that leaves every volume without an entry out. Every
existing volume keeps NULL. Downgrade drops the index and the column.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0023"
down_revision: str | None = "0022"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "comic_volumes",
        sa.Column("intake_entry_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_index(
        "ux_comic_volumes_intake_entry",
        "comic_volumes",
        ["intake_entry_id"],
        unique=True,
        postgresql_where=sa.text("intake_entry_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("ux_comic_volumes_intake_entry", table_name="comic_volumes")
    op.drop_column("comic_volumes", "intake_entry_id")
