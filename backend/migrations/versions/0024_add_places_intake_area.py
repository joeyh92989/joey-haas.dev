"""add the places intake area

Revision ID: 0024
Revises: 0023
Create Date: 2026-11-17

Places and outings (epic #339, story #340). Intake sittings keep their area in
the Postgres enum `intake_area` (`shelf`, `closet`, from 0015). The place kind
needs its own area, `places`, so a sitting of places is not mistaken for shelf
or closet work.

Additive: one enum value, no table or row touched.

The value is added outside the migration's transaction (Postgres cannot use a
value added in the same transaction, and older servers refuse ADD VALUE inside
one) and IF NOT EXISTS, because a downgrade cannot remove it: Postgres has no
DROP VALUE. A database downgraded below 0024 keeps `places` as an unused label,
which the old code never writes.
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0024"
down_revision: str | None = "0023"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE intake_area ADD VALUE IF NOT EXISTS 'places'")


def downgrade() -> None:
    # intake_area keeps 'places': Postgres cannot drop an enum value. A sitting
    # still marked places would fail the old code's enum, so it goes back to
    # shelf, the area the old code reads by default. Its entries stay with it.
    op.execute(
        "UPDATE intake_sittings SET area = 'shelf'::intake_area "
        "WHERE area::text = 'places'"
    )
