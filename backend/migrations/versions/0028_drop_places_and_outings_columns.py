"""drop the places and outings columns

Revision ID: 0028
Revises: 0027
Create Date: 2026-11-20

DESTRUCTIVE: removes what 0024 and 0025 added for the places and outings
feature, which was taken out of the code (plan
docs/planning/2026-11-20-remove-places-migration-design.md, PR 2 of 2; PR 1
removed the code first, so no running code names any of this).

Drops:
- `visits.title`, `visits.verdict`, `visits.kid_along`, `visits.precision`
  (0025), then the types `outing_verdict` and `outing_precision`.
- The `places` label of the enum `intake_area` (0024). Postgres cannot drop one
  enum value, so the type is rebuilt as (`shelf`, `closet`): any `places`
  sitting is deleted first (entries and photos, then the sitting, as 0024's
  downgrade does), the old type is renamed, the new one created, the only
  column that uses it (`intake_sittings.area`, no server default; the index
  `ix_intake_sittings_area_updated` is rebuilt by Postgres with the column)
  is converted with `USING area::text::intake_area`, and the old type is
  dropped. Everything runs in the migration's transaction: no ADD VALUE is
  involved.

Why it is safe: the production check on 2026-11-20 (read-only, Neon project
damp-hall-89096472, head 0027) found 0 rows in `visits`, 0 in `spots` and 0
`intake_sittings` with area `places`. Nothing is lost.

Restore step: take a Neon restore point (point-in-time) before this migration
runs, per backend/migrations/README.md "Restore". The restore point is the
only way to get dropped data back; `alembic downgrade 0027` restores the
schema only.

Downgrade re-adds the four `visits` columns and the two types exactly as 0025
did (`precision` NOT NULL with server default `day`) and re-adds the `places`
label with ADD VALUE IF NOT EXISTS inside an autocommit block, as 0024 did.
It does not rebuild any data: the dropped columns come back empty (every
visit a `day` outing) and deleted `places` sittings are not recreated.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0028"
down_revision: str | None = "0027"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# create_type=False: created and dropped explicitly below, as in 0025.
outing_verdict = postgresql.ENUM(
    "loved", "fine", "not_again", name="outing_verdict", create_type=False
)
outing_precision = postgresql.ENUM(
    "day", "month", "year", name="outing_precision", create_type=False
)


def upgrade() -> None:
    op.drop_column("visits", "precision")
    op.drop_column("visits", "kid_along")
    op.drop_column("visits", "verdict")
    op.drop_column("visits", "title")
    bind = op.get_bind()
    outing_precision.drop(bind, checkfirst=True)
    outing_verdict.drop(bind, checkfirst=True)

    # A places sitting cannot be converted to a label that no longer exists.
    # Entries and photos go first, explicitly, though their foreign keys (0015)
    # also cascade.
    op.execute(
        "DELETE FROM intake_entries WHERE sitting_id IN "
        "(SELECT id FROM intake_sittings WHERE area::text = 'places')"
    )
    op.execute(
        "DELETE FROM intake_photos WHERE sitting_id IN "
        "(SELECT id FROM intake_sittings WHERE area::text = 'places')"
    )
    op.execute("DELETE FROM intake_sittings WHERE area::text = 'places'")

    op.execute("ALTER TYPE intake_area RENAME TO intake_area_old")
    op.execute("CREATE TYPE intake_area AS ENUM ('shelf', 'closet')")
    op.execute(
        "ALTER TABLE intake_sittings ALTER COLUMN area TYPE intake_area "
        "USING area::text::intake_area"
    )
    op.execute("DROP TYPE intake_area_old")


def downgrade() -> None:
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
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE intake_area ADD VALUE IF NOT EXISTS 'places'")
