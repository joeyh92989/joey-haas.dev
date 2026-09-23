"""add copy columns

Revision ID: 0003
Revises: 0002
Create Date: 2026-09-23

The copy on the shelf, as distinct from the game it is a copy of: platform,
physical format and how that was decided, cart ID, region, completeness, and
the release, acquired and pinned dates. All nullable; nothing is defaulted.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# create_type=False for the reason 0002 gives: add_column never creates a
# type, so each is created in upgrade() and dropped in downgrade().
physical_format = postgresql.ENUM(
    "game_card",
    "game_key_card",
    "code_in_box",
    "disc",
    name="physical_format",
    create_type=False,
)
format_source = postgresql.ENUM(
    "cart_id",
    "photo",
    "registry",
    "store_text",
    "store_policy",
    "platform_policy",
    "manual",
    name="format_source",
    create_type=False,
)
completeness = postgresql.ENUM(
    "loose",
    "boxed",
    "cib",
    "sealed",
    name="completeness",
    create_type=False,
)

NEW_COLUMNS = (
    ("release_date", sa.Date()),
    ("pinned_at", sa.DateTime(timezone=True)),
    ("acquired_at", sa.Date()),
    ("platform_id", sa.SmallInteger()),
    ("platform", sa.String(length=60)),
    ("physical_format", physical_format),
    ("format_source", format_source),
    ("cart_id", sa.String(length=20)),
    ("region", sa.String(length=4)),
    ("completeness", completeness),
)


def upgrade() -> None:
    bind = op.get_bind()
    for enum_type in (physical_format, format_source, completeness):
        enum_type.create(bind, checkfirst=True)

    for name, column_type in NEW_COLUMNS:
        op.add_column("items", sa.Column(name, column_type, nullable=True))

    # The collection was bulk-imported on one or two days, so created_at is
    # the best available proxy until the owner corrects it.
    op.execute("UPDATE items SET acquired_at = created_at::date")


def downgrade() -> None:
    for name, _ in reversed(NEW_COLUMNS):
        op.drop_column("items", name)

    # Postgres keeps an enum type after its last column is gone, and a leftover
    # one fails the next upgrade on "type already exists".
    bind = op.get_bind()
    for enum_type in (completeness, format_source, physical_format):
        enum_type.drop(bind, checkfirst=True)
