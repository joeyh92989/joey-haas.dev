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

Downgrade deletes the `places` sittings, with their entries and photos: they
are scratch rows that exist only because of this migration, and relabelling
them would leave a shelf sitting holding entries of an unknown kind. Spots
already written stay. The upgrade is purely additive.
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
    # intake_area keeps 'places': Postgres cannot drop an enum value. A places
    # sitting cannot go back to shelf: its kind stays 'place' and so do its
    # entries, and the old code would read a shelf sitting of an unknown kind
    # that cannot commit. These rows are scratch rows that exist only because
    # of this migration (a finished place is a spot, which stays), so they are
    # deleted. Entries and photos are removed first, explicitly, though their
    # foreign keys (0015) also cascade.
    op.execute(
        "DELETE FROM intake_entries WHERE sitting_id IN "
        "(SELECT id FROM intake_sittings WHERE area::text = 'places')"
    )
    op.execute(
        "DELETE FROM intake_photos WHERE sitting_id IN "
        "(SELECT id FROM intake_sittings WHERE area::text = 'places')"
    )
    op.execute("DELETE FROM intake_sittings WHERE area::text = 'places'")
