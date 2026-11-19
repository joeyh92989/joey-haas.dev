"""allow 'metron' as a comic_volume_collects source

Revision ID: 0027
Revises: 0026
Create Date: 2026-11-18

Additive: widens the CHECK `comic_volume_collects_source` to include 'metron'
(contents the owner accepted from Metron, #337). No data changes.

Downgrade first rewrites every 'metron' row to 'parsed' (the nearest older
value: contents read from a source, not typed), then narrows the constraint, so
no row is lost and the old constraint can be re-added.
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0027"
down_revision: str | None = "0026"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

OLD = "source IN ('migrated', 'typed', 'parsed', 'photo')"
NEW = "source IN ('migrated', 'typed', 'parsed', 'photo', 'metron')"


def upgrade() -> None:
    op.drop_constraint(
        "comic_volume_collects_source", "comic_volume_collects", type_="check"
    )
    op.create_check_constraint(
        "comic_volume_collects_source", "comic_volume_collects", NEW
    )


def downgrade() -> None:
    op.execute(
        "UPDATE comic_volume_collects SET source = 'parsed' WHERE source = 'metron'"
    )
    op.drop_constraint(
        "comic_volume_collects_source", "comic_volume_collects", type_="check"
    )
    op.create_check_constraint(
        "comic_volume_collects_source", "comic_volume_collects", OLD
    )
