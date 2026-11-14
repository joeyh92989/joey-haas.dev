"""add item tag attempts

Revision ID: 0019
Revises: 0018
Create Date: 2026-11-14

`items.tag_attempts` counts the unusable model answers the comic tag job got
for a series (issue #232); at 3 the job stops asking. Additive: one new
column with a default, so older code still inserts and reads items and every
existing row reads as 0.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0019"
down_revision: str | None = "0018"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "items",
        sa.Column(
            "tag_attempts", sa.Integer(), nullable=False, server_default=sa.text("0")
        ),
    )


def downgrade() -> None:
    op.drop_column("items", "tag_attempts")
