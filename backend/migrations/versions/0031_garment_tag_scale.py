"""garments.tag_scale: which formality scale a piece was tagged on

Revision ID: 0031
Revises: 0030
Create Date: 2026-11-24

Additive (#548; docs/planning/2026-11-24-closet-formality-scale-design.md).
Adds `garments.tag_scale` (smallint, NOT NULL, default 1). Every existing piece
reads 1, the unanchored scale; `closet_tag.SCALE_VERSION` is 2, so the nightly
tag job re-tags the formality of model-tagged pieces below it. No existing
column or value changes.

Downgrade drops the column.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0031"
down_revision: str | None = "0030"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "garments",
        sa.Column(
            "tag_scale",
            sa.SmallInteger(),
            nullable=False,
            server_default="1",
        ),
    )


def downgrade() -> None:
    op.drop_column("garments", "tag_scale")
