"""add comic issues

Revision ID: 0016
Revises: 0015
Create Date: 2026-11-11

Comic issue pages (docs/planning/2026-11-11-comic-issue-pages-design.md):
`comic_issues` holds one row per issue of a followed series, keyed by
(item_id, number), written by the issue sync from Comic Vine and read by the
public issue pages. Rows go with their series (ON DELETE CASCADE).
`items.issues_synced_on` is the sync's "stalest first" key.

Additive: one new table and one nullable column. Nothing existing is altered,
renamed or dropped, so the code before this revision boots against it and the
deploy order (migrate, then merge) holds.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0016"
down_revision: str | None = "0015"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("items", sa.Column("issues_synced_on", sa.Date(), nullable=True))
    op.create_table(
        "comic_issues",
        sa.Column("item_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("number", sa.SmallInteger(), nullable=False),
        sa.Column("cv_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.Text(), nullable=True),
        sa.Column("store_date", sa.Date(), nullable=True),
        sa.Column("cover_date", sa.Date(), nullable=True),
        sa.Column("cover_url", sa.Text(), nullable=True),
        sa.Column("large_url", sa.Text(), nullable=True),
        sa.Column(
            "description",
            postgresql.JSONB(),
            server_default=sa.text("'[]'::jsonb"),
            nullable=False,
        ),
        sa.Column("fetched_on", sa.Date(), nullable=False),
        sa.ForeignKeyConstraint(["item_id"], ["items.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("item_id", "number"),
    )


def downgrade() -> None:
    op.drop_table("comic_issues")
    op.drop_column("items", "issues_synced_on")
