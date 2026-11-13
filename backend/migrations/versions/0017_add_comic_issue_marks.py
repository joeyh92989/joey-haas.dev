"""add comic issue marks

Revision ID: 0017
Revises: 0016
Create Date: 2026-11-13

Ownership on the issue row (docs/planning/2026-11-13-comics-book-design.md,
5b): `comic_issues` gains `owned`, `read` and `skipped`, and `cv_id` and
`fetched_on` become nullable so a book Comic Vine has not synced can still
carry a mark (a "stub").

Additive: three columns with a server default, two constraints relaxed. No row
is inserted or updated here; stubs and marks are written by the new code
(`comics.sync_marks`) and the backfill route, so the code before this revision
still boots against it and never meets a stub.

The downgrade deletes the stub rows (null `cv_id`) before restoring NOT NULL.
They hold marks only, which the ranges on `items` can rebuild.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0017"
down_revision: str | None = "0016"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

MARKS = ("owned", "read", "skipped")


def upgrade() -> None:
    for mark in MARKS:
        op.add_column(
            "comic_issues",
            sa.Column(mark, sa.Boolean(), server_default="false", nullable=False),
        )
    op.alter_column("comic_issues", "cv_id", existing_type=sa.Integer(), nullable=True)
    op.alter_column(
        "comic_issues", "fetched_on", existing_type=sa.Date(), nullable=True
    )


def downgrade() -> None:
    op.execute("DELETE FROM comic_issues WHERE cv_id IS NULL OR fetched_on IS NULL")
    op.alter_column(
        "comic_issues", "fetched_on", existing_type=sa.Date(), nullable=False
    )
    op.alter_column("comic_issues", "cv_id", existing_type=sa.Integer(), nullable=False)
    for mark in reversed(MARKS):
        op.drop_column("comic_issues", mark)
