"""garments.graphic: a top with a print, picture, slogan or large logo

Revision ID: 0032
Revises: 0031
Create Date: 2026-11-24

Additive (#550; docs/planning/2026-11-24-closet-graphic-flag-design.md).
Adds `garments.graphic` (boolean, nullable). NULL is "not known" and scores as
plain; the tagger, the fill queue and the owner's hand set it. No existing
column or value changes.

Downgrade drops the column.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0032"
down_revision: str | None = "0031"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("garments", sa.Column("graphic", sa.Boolean(), nullable=True))


def downgrade() -> None:
    op.drop_column("garments", "graphic")
