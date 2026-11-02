"""add comic columns

Revision ID: 0010
Revises: 0009
Create Date: 2026-11-01

Comics on My Shelf: a series row carries the issues I own and skipped as
range text (comics.py is the only parser), the collected editions as JSONB,
the read-to marker, how the run sits on the shelf, and whether I follow it
for the pull list. Additive: six new columns on items and one new type,
comic_shelf_format; nothing existing changes. `following` is not null with a
server default, so every existing row reads as not followed.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0010"
down_revision: str | None = "0009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# create_type=False for the reason 0002 gives: add_column never creates a
# type, so it is created in upgrade() and dropped in downgrade().
comic_shelf_format = postgresql.ENUM(
    "singles", "trades", "omnibus", name="comic_shelf_format", create_type=False
)

NULLABLE_COLUMNS = (
    ("issues_owned", sa.Text()),
    ("issues_skipped", sa.Text()),
    ("editions", postgresql.JSONB()),
    ("read_to", sa.SmallInteger()),
    ("shelf_format", comic_shelf_format),
)


def upgrade() -> None:
    comic_shelf_format.create(op.get_bind(), checkfirst=True)
    for name, column_type in NULLABLE_COLUMNS:
        op.add_column("items", sa.Column(name, column_type, nullable=True))
    op.add_column(
        "items",
        sa.Column("following", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column("items", "following")
    for name, _ in reversed(NULLABLE_COLUMNS):
        op.drop_column("items", name)
    # Postgres keeps an enum type after its last column is gone, and a leftover
    # one fails the next upgrade on "type already exists".
    comic_shelf_format.drop(op.get_bind(), checkfirst=True)
