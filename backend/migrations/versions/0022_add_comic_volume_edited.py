"""add comic_volumes.edited

Revision ID: 0022
Revises: 0021
Create Date: 2026-11-17

Comics, book-first (epic #323, story #334). The compat shim
(`comics.sync_volumes_from_editions`) keeps edition-origin (`ed-*`) volumes in
step with `items.editions`. Once the admin edits a volume by hand the shim must
leave it alone, so a volume carries `edited`: the shim never overwrites,
repositions or deletes a volume with `edited` true.

Additive: one boolean, NOT NULL, default false (every existing volume is
un-edited, so the shim behaves exactly as before for them). Downgrade drops the
column.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0022"
down_revision: str | None = "0021"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "comic_volumes",
        sa.Column(
            "edited", sa.Boolean(), nullable=False, server_default=sa.text("false")
        ),
    )


def downgrade() -> None:
    op.drop_column("comic_volumes", "edited")
