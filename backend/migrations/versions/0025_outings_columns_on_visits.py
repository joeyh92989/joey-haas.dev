"""outings columns on visits

Revision ID: 0025
Revises: 0024
Create Date: 2026-11-18

Places and outings (epic #339, story #344). A visit becomes an outing: it may
carry a title, a verdict, whether the kid came, and a date known only to the
month or the year.

Additive only: two new types (`outing_verdict`, `outing_precision`) and four
new columns on `visits`. `title`, `verdict` and `kid_along` are nullable, so an
existing row reads as unknown; `precision` is NOT NULL with a server default of
`day`, so every existing row becomes a day outing (true: they are dates) and an
INSERT from the code before this revision, which never names the column, still
works. No existing column is touched and no row is rewritten, so the code
before this revision boots against it and the deploy order (migrate, then
merge) holds.

Downgrade drops the four columns and then the two types. It loses only the new
data; every visit stays.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0025"
down_revision: str | None = "0024"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# create_type=False: created and dropped explicitly below, as in 0013.
outing_verdict = postgresql.ENUM(
    "loved", "fine", "not_again", name="outing_verdict", create_type=False
)
outing_precision = postgresql.ENUM(
    "day", "month", "year", name="outing_precision", create_type=False
)


def upgrade() -> None:
    bind = op.get_bind()
    outing_verdict.create(bind, checkfirst=True)
    outing_precision.create(bind, checkfirst=True)
    op.add_column("visits", sa.Column("title", sa.String(80), nullable=True))
    op.add_column("visits", sa.Column("verdict", outing_verdict, nullable=True))
    op.add_column("visits", sa.Column("kid_along", sa.Boolean(), nullable=True))
    op.add_column(
        "visits",
        sa.Column(
            "precision",
            outing_precision,
            nullable=False,
            server_default=sa.text("'day'"),
        ),
    )


def downgrade() -> None:
    op.drop_column("visits", "precision")
    op.drop_column("visits", "kid_along")
    op.drop_column("visits", "verdict")
    op.drop_column("visits", "title")
    bind = op.get_bind()
    outing_precision.drop(bind, checkfirst=True)
    outing_verdict.drop(bind, checkfirst=True)
