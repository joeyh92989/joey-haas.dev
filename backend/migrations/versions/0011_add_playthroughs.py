"""add playthroughs and the paused status

Revision ID: 0011
Revises: 0010
Create Date: 2026-11-04

Play states (docs/planning/2026-11-03-play-states-design.md): a `paused`
value on item_status, and a `playthroughs` table with one row per run of a
game. Additive: the items columns started_at, finished_at and
times_completed stay, now maintained from playthroughs by playthroughs.py.

The backfill gives every item with history its runs: one finished run per
completion (the first carrying started_at, the last finished_at, any between
dateless), an abandoned run for a game put down with dates and no completion,
and an open run for an active game. It then recomputes the three columns from
the rows, which changes only rows the old counter got wrong (see
SYNC_COLUMNS). No date is dropped: every dated item gets a run that holds its
dates, or the first status change after the migration would wipe them.

The enum value is added outside the migration's transaction (Postgres
cannot use a value added in the same transaction, and older servers refuse
ADD VALUE inside one) and IF NOT EXISTS, because a downgrade cannot remove
it: Postgres has no DROP VALUE. A database downgraded below 0011 keeps
`paused` as an unused label, which the old code never writes.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0011"
down_revision: str | None = "0010"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

playthrough_outcome = postgresql.ENUM(
    "finished", "abandoned", name="playthrough_outcome", create_type=False
)

# F, the item's finished runs: its completions, and at least one when it is
# finished or carries a finish date outside an abandoned row (a finished row
# with times_completed 0 predates the counter; an active one with a finish
# date was finished once and is being played again). An abandoned row's date
# is the day it was put down, which its abandoned run holds.
FINISHED_RUNS = (
    "CASE WHEN status = 'finished'::item_status "
    "OR (status <> 'abandoned'::item_status AND finished_at IS NOT NULL) "
    "THEN GREATEST(times_completed, 1) ELSE times_completed END"
)

# Runs 1..F, finished. started_at is the first start, so it goes on run 1;
# finished_at is the last finish, so it goes on run F. Runs between are
# dateless until the owner fills them in on the edit page.
BACKFILL_FINISHED = f"""
INSERT INTO playthroughs (id, item_id, number, started_on, finished_on, outcome)
SELECT gen_random_uuid(), items.id, n,
       CASE WHEN n = 1 THEN items.started_at END,
       CASE WHEN n = {FINISHED_RUNS} THEN items.finished_at END,
       'finished'::playthrough_outcome
FROM items, generate_series(1, {FINISHED_RUNS}) AS n
WHERE {FINISHED_RUNS} > 0
"""

# A game put down with dates and no finish: one abandoned run. That is an
# abandoned game, or a backlog one with a start date (the old flow kept
# started_at when Playing went back to Backlog).
BACKFILL_ABANDONED = f"""
INSERT INTO playthroughs (id, item_id, number, started_on, finished_on, outcome)
SELECT gen_random_uuid(), id, 1, started_at, finished_at,
       'abandoned'::playthrough_outcome
FROM items
WHERE status IN ('abandoned'::item_status, 'backlog'::item_status)
  AND {FINISHED_RUNS} = 0
  AND (started_at IS NOT NULL OR finished_at IS NOT NULL)
"""

# An active game: its open run, after any finished ones. It carries the
# start date only when it is the first run (on a replay, started_at is the
# first playthrough's start and is already on run 1).
BACKFILL_OPEN = f"""
INSERT INTO playthroughs (id, item_id, number, started_on)
SELECT gen_random_uuid(), id, {FINISHED_RUNS} + 1,
       CASE WHEN {FINISHED_RUNS} = 0 THEN started_at END
FROM items
WHERE status = 'active'::item_status
"""

# The columns, recomputed from the rows exactly as playthroughs.derive does,
# for every item that now has a run. This changes only rows the counter
# disagreed with: a finished game counted 0 times becomes 1, and an
# abandoned game's close date moves off finished_at (it is on its run).
SYNC_COLUMNS = """
UPDATE items SET
    started_at = runs.first_start,
    finished_at = runs.last_finish,
    times_completed = runs.finished
FROM (
    SELECT item_id,
           min(started_on) AS first_start,
           max(finished_on) FILTER (WHERE outcome = 'finished') AS last_finish,
           count(*) FILTER (WHERE outcome = 'finished') AS finished
    FROM playthroughs GROUP BY item_id
) AS runs
WHERE runs.item_id = items.id
"""


def upgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute(
            "ALTER TYPE item_status ADD VALUE IF NOT EXISTS 'paused' AFTER 'active'"
        )
    playthrough_outcome.create(op.get_bind(), checkfirst=True)
    op.create_table(
        "playthroughs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "item_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("items.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("number", sa.SmallInteger(), nullable=False),
        sa.Column("started_on", sa.Date(), nullable=True),
        sa.Column("finished_on", sa.Date(), nullable=True),
        sa.Column("paused_on", sa.Date(), nullable=True),
        sa.Column("outcome", playthrough_outcome, nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint("item_id", "number", name="uq_playthroughs_item_number"),
        sa.CheckConstraint("number > 0", name="playthroughs_number_positive"),
    )
    op.create_index(
        "ux_playthroughs_one_open",
        "playthroughs",
        ["item_id"],
        unique=True,
        postgresql_where=sa.text("outcome IS NULL"),
    )
    op.create_index("ix_playthroughs_finished_on", "playthroughs", ["finished_on"])
    for statement in (
        BACKFILL_FINISHED,
        BACKFILL_ABANDONED,
        BACKFILL_OPEN,
        SYNC_COLUMNS,
    ):
        op.execute(statement)


def downgrade() -> None:
    op.drop_index("ix_playthroughs_finished_on", table_name="playthroughs")
    op.drop_index("ux_playthroughs_one_open", table_name="playthroughs")
    op.drop_table("playthroughs")
    playthrough_outcome.drop(op.get_bind(), checkfirst=True)
    # item_status keeps 'paused': Postgres cannot drop an enum value. Rows
    # still marked paused would fail the old code's enum, so they go back to
    # active, which is what paused split off from.
    op.execute(
        "UPDATE items SET status = 'active'::item_status WHERE status::text = 'paused'"
    )
