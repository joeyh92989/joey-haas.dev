"""add spots

Revision ID: 0013
Revises: 0012
Create Date: 2026-11-09

Denver spots (docs/planning/2026-11-08-denver-spots-design.md): the owner's
places (`spots`, with anchors flagged), the days each was visited
(`visits`), the weekly finder queue (`candidates`) and what was turned down
for good (`dismissals`), the hourly forecast the weekend planner reads
(`weather_hours`), and one key/value table for the jobs' run summaries, the
planner's constraints and each weekend's saved plan (`spot_settings`).

All six tables arrive here although `candidates`, `dismissals` and
`weather_hours` are first written in later PRs of the same stack: one Neon
apply instead of three, as 0005 did for the catalogue.

Additive: six new tables and one new type, `candidate_source`, created
empty. Nothing existing is altered, renamed or dropped, so the code before
this revision boots against it and the deploy order (migrate, then merge)
holds.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0013"
down_revision: str | None = "0012"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# create_type=False: created and dropped explicitly below, as in 0005 and 0006.
# `foursquare` is kept although nothing writes it: adding an enum value later
# is a migration of its own, and an unused value costs nothing.
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
        "weather_hours",
        _uuid_pk(),
        sa.Column("gridpoint", sa.String(40), nullable=False),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("temp_f", sa.SmallInteger(), nullable=False),
        sa.Column("precip_pct", sa.SmallInteger(), nullable=True),
        sa.Column("wind_mph", sa.SmallInteger(), nullable=False),
        sa.Column("short", sa.String(120), nullable=False),
        _now("fetched_at"),
        sa.UniqueConstraint("gridpoint", "starts_at", name="ux_weather_hours_slot"),
    )

    op.create_table(
        "spot_settings",
        sa.Column("key", sa.String(60), primary_key=True),
        sa.Column("value", postgresql.JSONB(), nullable=False),
        _now("updated_at"),
    )


def downgrade() -> None:
    op.drop_table("spot_settings")
    op.drop_table("weather_hours")
    op.drop_table("dismissals")
    op.drop_table("candidates")
    op.drop_index("ix_visits_spot_visited", table_name="visits")
    op.drop_table("visits")
    op.drop_table("spots")
    candidate_source.drop(op.get_bind(), checkfirst=True)
