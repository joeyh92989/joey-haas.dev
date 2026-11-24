"""drop the Denver tables

Revision ID: 0030
Revises: 0029
Create Date: 2026-11-23

DESTRUCTIVE (#632, epic #630; docs/planning/2026-11-23-drop-denver-tables-design.md).
The code and models were removed first (#631, #633), so no running code names
any of this.

Drops, in foreign-key order: `visits`, `dismissals`, `candidates`, `spots`,
`spot_settings`, then the type `candidate_source`. `weather_hours` (0013) stays.
Every row in those tables is discarded.

Restore step: take a Neon snapshot before this runs, per
backend/migrations/README.md "Restore". It is the only way to get rows back.

Downgrade recreates the empty structure exactly as 0013 built it (the tables,
`ix_visits_spot_visited`, the unique and check constraints, the foreign keys
and the enum). No data comes back.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0030"
down_revision: str | None = "0029"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

candidate_source = postgresql.ENUM(
    "osm", "foursquare", name="candidate_source", create_type=False
)


def _uuid_pk() -> sa.Column:
    return sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True)


def _now(name: str) -> sa.Column:
    return sa.Column(
        name, sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
    )


def _jsonb_list(name: str) -> sa.Column:
    return sa.Column(
        name, postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")
    )


def upgrade() -> None:
    op.drop_index("ix_visits_spot_visited", table_name="visits")
    op.drop_table("visits")
    op.drop_table("dismissals")
    op.drop_table("candidates")
    op.drop_table("spots")
    op.drop_table("spot_settings")
    candidate_source.drop(op.get_bind(), checkfirst=True)


def downgrade() -> None:
    candidate_source.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "spots",
        _uuid_pk(),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("slug", sa.String(200), nullable=False),
        sa.Column("lat", sa.Double(), nullable=False),
        sa.Column("lng", sa.Double(), nullable=False),
        sa.Column("neighbourhood", sa.String(100), nullable=True),
        sa.Column("blurb", sa.Text(), nullable=True),
        _jsonb_list("tags"),
        sa.Column("is_public", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("anchor", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column(
            "city", sa.String(40), nullable=False, server_default=sa.text("'denver'")
        ),
        sa.Column("source", candidate_source, nullable=True),
        sa.Column("source_id", sa.String(60), nullable=True),
        _now("created_at"),
        _now("updated_at"),
        sa.UniqueConstraint("slug", name="ux_spots_slug"),
    )

    op.create_table(
        "visits",
        _uuid_pk(),
        sa.Column(
            "spot_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("spots.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("visited_on", sa.Date(), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        _now("created_at"),
    )
    op.create_index("ix_visits_spot_visited", "visits", ["spot_id", "visited_on"])

    op.create_table(
        "candidates",
        _uuid_pk(),
        sa.Column("source", candidate_source, nullable=False),
        sa.Column("source_id", sa.String(60), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("category", sa.String(60), nullable=True),
        sa.Column("lat", sa.Double(), nullable=False),
        sa.Column("lng", sa.Double(), nullable=False),
        sa.Column("distance_m", sa.Integer(), nullable=True),
        sa.Column(
            "nearest_anchor_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("spots.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("fit", sa.SmallInteger(), nullable=True),
        sa.Column("reason", sa.Text(), nullable=True),
        _jsonb_list("suggested_tags"),
        _now("fetched_at"),
        sa.UniqueConstraint("source", "source_id", name="ux_candidates_source"),
        sa.CheckConstraint(
            "fit IS NULL OR fit BETWEEN 0 AND 100", name="candidates_fit_range"
        ),
    )

    op.create_table(
        "dismissals",
        sa.Column("source", candidate_source, primary_key=True),
        sa.Column("source_id", sa.String(60), primary_key=True),
        _now("dismissed_at"),
    )

    op.create_table(
        "spot_settings",
        sa.Column("key", sa.String(60), primary_key=True),
        sa.Column("value", postgresql.JSONB(), nullable=False),
        _now("updated_at"),
    )
