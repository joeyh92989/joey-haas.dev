"""Playthroughs: one row per run of a game, written only from here.

Every status change -- the status route, create, bulk create, the pin route
-- goes through `apply_status` (or `seed` on create), and every hand edit on
the edit page through `edit_dates`, `add_past` and `delete_run`. Each ends in
`sync`, which recomputes the item's cached columns from the rows in the same
transaction:

- `started_at`: the earliest start of any run
- `finished_at`: the latest finish of a finished run (the last finish)
- `times_completed`: the number of finished runs

Readers keep using those columns (the public snapshot, the sort, the index on
`finished_at`, the public-next fingerprint over `items.xmin`), so nothing that
reads them needs to know playthroughs exist.

The decisions are pure (`derive`, `plan_transition`, `check_dates`) and take
`Run`s, so every rule is tested without a database; the async functions only
load rows and apply the plan. Design:
docs/planning/2026-11-03-play-states-design.md.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field, replace
from datetime import date, datetime, timedelta

from sqlalchemy import exists, select
from sqlalchemy.ext.asyncio import AsyncSession

from models import Item, ItemStatus, PlaySession, Playthrough, PlaythroughOutcome

# How far the client's "today" may sit from the server's UTC date. The owner's
# local day is the right date for a finish (late evening in Denver is already
# tomorrow in UTC), but no further than a time zone can account for.
TODAY_TOLERANCE = timedelta(days=1)

CLOSING = {"finished", "abandoned"}


class PlaythroughError(ValueError):
    """A hand edit the rules refuse; the route answers it with a 422."""


@dataclass(frozen=True)
class Run:
    """A playthrough as the rules see it. `outcome` is None while open."""

    number: int
    started_on: date | None = None
    finished_on: date | None = None
    paused_on: date | None = None
    outcome: str | None = None
    # When the row was written; only apply_status reads it, so the misclick
    # rule can tell the run that came before the open one from a past run
    # added after it. Not part of a run's identity.
    created_at: datetime | None = field(default=None, compare=False)


@dataclass(frozen=True)
class Derived:
    """The item columns a list of runs implies."""

    started_at: date | None
    finished_at: date | None
    times_completed: int


@dataclass(frozen=True)
class Open:
    """Create a run."""

    run: Run


@dataclass(frozen=True)
class Change:
    """Replace the run with this number by `run`."""

    run: Run


@dataclass(frozen=True)
class Delete:
    """Remove the run with this number."""

    number: int


def derive(runs: list[Run]) -> Derived:
    """The cached columns for `runs`; see the module docstring."""
    starts = [run.started_on for run in runs if run.started_on is not None]
    finished = [run for run in runs if run.outcome == "finished"]
    finishes = [run.finished_on for run in finished if run.finished_on is not None]
    return Derived(
        started_at=min(starts, default=None),
        finished_at=max(finishes, default=None),
        times_completed=len(finished),
    )


def open_run(runs: list[Run]) -> Run | None:
    """The run still in progress, if any (at most one, by index)."""
    return next((run for run in runs if run.outcome is None), None)


def next_number(runs: list[Run]) -> int:
    """The number a new run takes: one past the highest, never reused."""
    return max((run.number for run in runs), default=0) + 1


def is_misclick(
    runs: list[Run], target: str, today: date, journal_in_open: bool
) -> bool:
    """Whether closing the open run undoes a mistaken Replay or Try again.

    True when the open run was started today, was never paused, has no
    journal day, and the game is going back to exactly the outcome its
    previous run ended with: Replay by mistake, then Finished again. Any other
    close is a real run (abandoning a replay the same day, say).
    """
    current = open_run(runs)
    if current is None or current.started_on != today or current.paused_on:
        return False
    if journal_in_open:
        return False
    closed = [run for run in runs if run.outcome is not None]
    if current.created_at is not None and all(run.created_at for run in closed):
        # The run before the open one is the latest written before it; a
        # past run added afterwards sits below the open run by number but
        # is not what Replay or Try again followed.
        closed = [run for run in closed if run.created_at <= current.created_at]
        order = lambda run: (run.created_at, run.number)  # noqa: E731
    else:
        order = lambda run: run.number  # noqa: E731
    if not closed:
        return False
    previous = max(closed, key=order)
    return previous.outcome == target


def plan_transition(
    runs: list[Run],
    current: str,
    target: str,
    today: date,
    journal_in_open: bool = False,
) -> list[Open | Change | Delete]:
    """The row changes moving an item from `current` to `target` makes.

    - Playing: resumes the open run (clears its pause), or opens the next
      one, started today.
    - Paused: stamps the open run's pause date, or opens one started and
      paused today.
    - Finished / Abandoned: closes the open run today with that outcome (or
      deletes it, when `is_misclick`), or records a start-less run closed
      today when none is open.
    - Backlog: deletes the open run; closed runs are history and stay.

    Choosing the current status again changes nothing.
    """
    if target == current:
        return []
    current_run = open_run(runs)

    if target == "active":
        if current_run is None:
            return [Open(Run(number=next_number(runs), started_on=today))]
        if current_run.paused_on is not None:
            return [Change(replace(current_run, paused_on=None))]
        return []

    if target == "paused":
        if current_run is None:
            return [
                Open(Run(number=next_number(runs), started_on=today, paused_on=today))
            ]
        if current_run.paused_on is None:
            return [Change(replace(current_run, paused_on=today))]
        return []

    if target in CLOSING:
        if current_run is None:
            return [
                Open(Run(number=next_number(runs), finished_on=today, outcome=target))
            ]
        if is_misclick(runs, target, today, journal_in_open):
            return [Delete(current_run.number)]
        return [
            Change(
                replace(current_run, finished_on=today, paused_on=None, outcome=target)
            )
        ]

    if target == "backlog":
        return [Delete(current_run.number)] if current_run else []

    raise ValueError(f"unknown status {target!r}")


def apply_plan(runs: list[Run], ops: list[Open | Change | Delete]) -> list[Run]:
    """`runs` after `ops`, sorted by number. Pure; for tests and checks."""
    by_number = {run.number: run for run in runs}
    for op in ops:
        if isinstance(op, Delete):
            by_number.pop(op.number, None)
        else:
            by_number[op.run.number] = op.run
    return [by_number[number] for number in sorted(by_number)]


def seed(
    status: str,
    started_at: date | None,
    finished_at: date | None,
    times_completed: int,
    today: date,
) -> list[Run]:
    """The runs a newly created item starts with, from the create body.

    The same shape migration 0011 backfilled (FINISHED_RUNS there): one
    finished run per completion, at least one for a finished item or one
    with a finish date that is not abandoned, the first carrying the start
    date and the last the finish date; an abandoned run for an abandoned or
    backlog item with dates and no finish; and an open run for a Playing or
    Paused one. No date in the body is dropped.
    """
    counts_a_finish = status == "finished" or (
        status != "abandoned" and finished_at is not None
    )
    finished = max(times_completed, 1) if counts_a_finish else times_completed
    runs = [
        Run(
            number=n,
            started_on=started_at if n == 1 else None,
            finished_on=finished_at if n == finished else None,
            outcome="finished",
        )
        for n in range(1, finished + 1)
    ]
    if (
        status in ("abandoned", "backlog")
        and not finished
        and (started_at or finished_at)
    ):
        runs.append(
            Run(
                number=1,
                started_on=started_at,
                finished_on=finished_at,
                outcome="abandoned",
            )
        )
    if status in ("active", "paused"):
        runs.append(
            Run(
                number=finished + 1,
                started_on=started_at if not finished else None,
                paused_on=today if status == "paused" else None,
            )
        )
    return runs


def check_dates(run: Run) -> None:
    """Refuses dates a run cannot have. Raises PlaythroughError."""
    if run.outcome is None and run.finished_on is not None:
        raise PlaythroughError(
            "A playthrough still in progress has no finish date; "
            "change the status to close it."
        )
    if (
        run.started_on is not None
        and run.finished_on is not None
        and run.started_on > run.finished_on
    ):
        raise PlaythroughError("A playthrough cannot finish before it started.")


def check_today(today: date, server_today: date) -> None:
    """Refuses a client date further from the server's than a time zone."""
    if abs(today - server_today) > TODAY_TOLERANCE:
        raise PlaythroughError(
            f"{today.isoformat()} is not today; send the local date."
        )


# --- Database side. --------------------------------------------------------


def _as_run(row: Playthrough) -> Run:
    return Run(
        number=row.number,
        started_on=row.started_on,
        finished_on=row.finished_on,
        paused_on=row.paused_on,
        outcome=row.outcome.value if row.outcome else None,
    )


def _write(row: Playthrough, run: Run) -> None:
    row.number = run.number
    row.started_on = run.started_on
    row.finished_on = run.finished_on
    row.paused_on = run.paused_on
    row.outcome = PlaythroughOutcome(run.outcome) if run.outcome else None


async def load_rows(session: AsyncSession, item_id: uuid.UUID) -> list[Playthrough]:
    """The item's playthroughs, by number."""
    result = await session.execute(
        select(Playthrough)
        .where(Playthrough.item_id == item_id)
        .order_by(Playthrough.number)
    )
    return list(result.scalars())


def sync(item: Item, runs: list[Run]) -> None:
    """Writes `derive(runs)` onto the item's cached columns."""
    derived = derive(runs)
    item.started_at = derived.started_at
    item.finished_at = derived.finished_at
    item.times_completed = derived.times_completed


async def _journal_since(
    session: AsyncSession, item_id: uuid.UUID, since: date | None
) -> bool:
    if since is None:
        return False
    return bool(
        await session.scalar(
            select(
                exists().where(
                    PlaySession.item_id == item_id, PlaySession.played_on >= since
                )
            )
        )
    )


async def _apply_ops(
    session: AsyncSession,
    item: Item,
    rows: list[Playthrough],
    ops: list[Open | Change | Delete],
) -> list[Run]:
    by_number = {row.number: row for row in rows}
    # Deletes and closes first, then opens: the one-open index is checked per
    # statement, and a run is never opened while another is still open.
    for op in sorted(ops, key=lambda op: isinstance(op, Open)):
        if isinstance(op, Delete):
            await session.delete(by_number.pop(op.number))
        elif isinstance(op, Change):
            _write(by_number[op.run.number], op.run)
        else:
            row = Playthrough(item_id=item.id)
            _write(row, op.run)
            session.add(row)
            by_number[op.run.number] = row
        await session.flush()
    runs = [_as_run(by_number[number]) for number in sorted(by_number)]
    sync(item, runs)
    return runs


async def apply_status(
    session: AsyncSession, item: Item, target: ItemStatus, today: date
) -> None:
    """Moves `item` to `target`, writing its playthroughs. Does not commit."""
    rows = await load_rows(session, item.id)
    runs = [replace(_as_run(row), created_at=row.created_at) for row in rows]
    current = open_run(runs)
    journal = await _journal_since(
        session, item.id, current.started_on if current else None
    )
    ops = plan_transition(
        runs, ItemStatus(item.status).value, target.value, today, journal
    )
    await _apply_ops(session, item, rows, ops)
    item.status = target


async def seed_rows(session: AsyncSession, item: Item, today: date) -> None:
    """Gives a just-created (flushed) item its runs. Does not commit.

    Raises PlaythroughError for dates a run cannot have (a finish before
    the start), as a hand edit would.
    """
    runs = seed(
        ItemStatus(item.status).value,
        item.started_at,
        item.finished_at,
        item.times_completed,
        today,
    )
    for run in runs:
        check_dates(run)
    await _apply_ops(session, item, [], [Open(run) for run in runs])


async def edit_dates(
    session: AsyncSession,
    item: Item,
    number: int,
    changes: dict[str, date | None],
) -> None:
    """Changes a run's `started_on` / `finished_on`. Does not commit."""
    rows = await load_rows(session, item.id)
    row = next((row for row in rows if row.number == number), None)
    if row is None:
        raise LookupError(number)
    run = replace(_as_run(row), **changes)
    check_dates(run)
    await _apply_ops(session, item, rows, [Change(run)])


async def add_past(
    session: AsyncSession,
    item: Item,
    started_on: date | None,
    finished_on: date | None,
) -> None:
    """Records a past finished run. Does not commit.

    It takes the next number, or the open run's when there is one (the open
    run moves up one), so the run in progress stays the latest.
    """
    rows = await load_rows(session, item.id)
    runs = [_as_run(row) for row in rows]
    new = Run(
        number=next_number(runs),
        started_on=started_on,
        finished_on=finished_on,
        outcome="finished",
    )
    check_dates(new)
    current = open_run(runs)
    ops: list[Open | Change | Delete] = [Open(new)]
    if current is not None:
        current_row = next(row for row in rows if row.number == current.number)
        current_row.number = new.number
        await session.flush()
        ops = [Open(replace(new, number=current.number))]
        rows = [row for row in rows if row is not current_row] + [current_row]
    await _apply_ops(session, item, rows, ops)


async def delete_run(session: AsyncSession, item: Item, number: int) -> None:
    """Deletes a closed run. Does not commit.

    The open run is refused: it is the status, and the status control is
    what ends it.
    """
    rows = await load_rows(session, item.id)
    row = next((row for row in rows if row.number == number), None)
    if row is None:
        raise LookupError(number)
    if row.outcome is None:
        raise PlaythroughError(
            "That playthrough is in progress; change the status instead."
        )
    await _apply_ops(session, item, rows, [Delete(number)])


def attribute_journal(
    runs: list[Run], days: list[tuple[date, int | None]]
) -> dict[int, tuple[int, int]]:
    """(days, minutes) of journal per run number, attributed by date.

    A day belongs to the dated run whose [started_on, finished_on] holds it
    (an open run's range runs to today); days no dated run claims go to the
    open run, else to the latest dateless one. Journal rows are not linked
    to runs (spec, Out of scope), so this is the whole of the attribution.
    """
    totals = {run.number: (0, 0) for run in runs}
    current = open_run(runs)
    dateless = [run for run in runs if run.started_on is None]
    fallback = current or (max(dateless, key=lambda r: r.number) if dateless else None)
    for played_on, minutes in days:
        owner = next(
            (
                run
                for run in runs
                if run.started_on is not None
                and run.started_on <= played_on
                and (run.finished_on is None or played_on <= run.finished_on)
            ),
            fallback,
        )
        if owner is None:
            continue
        count, total = totals[owner.number]
        totals[owner.number] = (count + 1, total + (minutes or 0))
    return totals


async def runs_with_journal(
    session: AsyncSession, item_ids: list[uuid.UUID]
) -> dict[uuid.UUID, list[tuple[Run, int, int]]]:
    """Each item's runs with their journal (days, minutes), in two queries."""
    if not item_ids:
        return {}
    rows = await session.execute(
        select(Playthrough)
        .where(Playthrough.item_id.in_(item_ids))
        .order_by(Playthrough.item_id, Playthrough.number)
    )
    runs: dict[uuid.UUID, list[Run]] = {item_id: [] for item_id in item_ids}
    for row in rows.scalars():
        runs[row.item_id].append(_as_run(row))
    journal = await session.execute(
        select(PlaySession.item_id, PlaySession.played_on, PlaySession.minutes).where(
            PlaySession.item_id.in_([key for key, value in runs.items() if value])
        )
    )
    days: dict[uuid.UUID, list[tuple[date, int | None]]] = {}
    for item_id, played_on, minutes in journal.all():
        days.setdefault(item_id, []).append((played_on, minutes))
    out = {}
    for item_id, item_runs in runs.items():
        totals = attribute_journal(item_runs, days.get(item_id, []))
        out[item_id] = [(run, *totals[run.number]) for run in item_runs]
    return out
