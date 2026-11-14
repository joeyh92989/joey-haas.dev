"""add item tags

Revision ID: 0018
Revises: 0017
Create Date: 2026-11-13

Tags, a curated set per type (shelf sweep item 7). `items.tags` holds the
words a type's vocabulary allows (tags.py), as a JSONB list of
{group, tag}; `items.tags_edited` is set when the owner saves tags on the
edit page, and nothing regenerates a row that has it. Additive: two new
columns with defaults, so older code still inserts and reads items, and
every existing row reads as untagged and unedited.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0018"
down_revision: str | None = "0017"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "items",
        sa.Column(
            "tags",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )
    op.add_column(
        "items",
        sa.Column(
            "tags_edited", sa.Boolean(), nullable=False, server_default=sa.false()
        ),
    )


def downgrade() -> None:
    op.drop_column("items", "tags_edited")
    op.drop_column("items", "tags")
