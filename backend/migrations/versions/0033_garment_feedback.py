"""garment_feedback: pieces turned down for a day or an occasion

Revision ID: 0033
Revises: 0032
Create Date: 2026-11-25

Additive (#551; docs/planning/2026-11-24-closet-piece-feedback-design.md).
One new table and one new enum type, created empty. `garment_feedback` holds a
piece turned down: `not_today`, `too_cold` and `too_warm` for a day,
`never_for_occasion` for an occasion until removed. Rows go with their garment
(ON DELETE CASCADE). Nothing existing is altered, renamed or dropped, so the
code before this revision boots against it.

Downgrade drops the table and the type.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0033"
down_revision: str | None = "0032"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# create_type=False: created and dropped explicitly below, as in 0014.
garment_feedback_kind = postgresql.ENUM(
    "not_today",
    "never_for_occasion",
    "too_cold",
    "too_warm",
    name="garment_feedback_kind",
    create_type=False,
)


def upgrade() -> None:
    garment_feedback_kind.create(op.get_bind(), checkfirst=True)
    op.create_table(
        "garment_feedback",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "garment_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("garments.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("kind", garment_feedback_kind, nullable=False),
        sa.Column("occasion", sa.String(20), nullable=True),
        sa.Column("day", sa.Date(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.CheckConstraint(
            "(kind = 'never_for_occasion' AND occasion IS NOT NULL AND day IS NULL)"
            " OR (kind <> 'never_for_occasion' AND day IS NOT NULL"
            " AND occasion IS NULL)",
            name="garment_feedback_scope",
        ),
    )
    op.create_index(
        "ux_garment_feedback_scope",
        "garment_feedback",
        [
            "garment_id",
            "kind",
            sa.text("coalesce(occasion, '')"),
            sa.text("coalesce(day, '0001-01-01'::date)"),
        ],
        unique=True,
    )
    op.create_index("ix_garment_feedback_day", "garment_feedback", ["day"])


def downgrade() -> None:
    op.drop_index("ix_garment_feedback_day", table_name="garment_feedback")
    op.drop_index("ux_garment_feedback_scope", table_name="garment_feedback")
    op.drop_table("garment_feedback")
    garment_feedback_kind.drop(op.get_bind(), checkfirst=True)
