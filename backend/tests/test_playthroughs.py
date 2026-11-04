"""playthroughs.py: the run rules (pure) and their database side."""

from datetime import date, timedelta

import pytest
from sqlalchemy import select

import playthroughs as pt
from models import Item, ItemStatus, ItemType, PlaySession, Playthrough
from playthroughs import Run

D1 = date(2026, 3, 1)
D2 = date(2026, 6, 1)
TODAY = date(2026, 11, 3)


def walk(start: str, steps: list[tuple[str, date]], runs=None):
    """Applies status moves in order; returns the final runs."""
    runs = list(runs or [])
    status = start
    for target, day in steps:
        runs = pt.apply_plan(runs, pt.plan_transition(runs, status, target, day))
        status = target
    return runs


# --- Pure rules. -----------------------------------------------------------


def test_derive_reads_first_start_last_finish_and_the_count():
    runs = [
        Run(1, D1, D2, outcome="finished"),
        Run(2, D2, TODAY, outcome="abandoned"),
        Run(3, TODAY, None),
    ]
    assert pt.derive(runs) == pt.Derived(D1, D2, 1)
    assert pt.derive([]) == pt.Derived(None, None, 0)


def test_start_then_finish_is_one_finished_run():
    runs = walk("backlog", [("active", D1), ("finished", D2)])
    assert runs == [Run(1, D1, D2, outcome="finished")]


def test_pause_and_resume_keep_the_run_and_its_start():
    runs = walk("backlog", [("active", D1), ("paused", D2)])
    assert runs == [Run(1, D1, paused_on=D2)]
    runs = walk("paused", [("active", TODAY)], runs)
    assert runs == [Run(1, D1)]


def test_finishing_a_paused_run_clears_its_pause():
    runs = walk("backlog", [("active", D1), ("paused", D2), ("finished", TODAY)])
    assert runs == [Run(1, D1, TODAY, outcome="finished")]


def test_replay_then_finish_is_two_runs():
    runs = walk(
        "backlog",
        [
            ("active", D1),
            ("finished", D2),
            ("active", D2 + timedelta(1)),
            ("finished", TODAY),
        ],
    )
    assert [r.number for r in runs] == [1, 2]
    assert pt.derive(runs) == pt.Derived(D1, TODAY, 2)


def test_a_same_day_replay_then_finish_is_a_misclick():
    runs = walk("backlog", [("active", D1), ("finished", D2)])
    after = walk("finished", [("active", TODAY), ("finished", TODAY)], runs)
    assert after == runs


def test_a_misclick_needs_the_same_outcome_today_unpaused_and_no_journal():
    runs = walk("backlog", [("active", D1), ("finished", D2), ("active", TODAY)])
    assert pt.is_misclick(runs, "finished", TODAY, False)
    assert not pt.is_misclick(runs, "abandoned", TODAY, False)
    assert not pt.is_misclick(runs, "finished", TODAY + timedelta(1), False)
    assert not pt.is_misclick(runs, "finished", TODAY, True)
    paused = walk("active", [("paused", TODAY)], runs)
    assert not pt.is_misclick(paused, "finished", TODAY, False)
    first = walk("backlog", [("active", TODAY)])
    assert not pt.is_misclick(first, "finished", TODAY, False)


def test_backlog_drops_the_open_run_and_keeps_history():
    runs = walk("backlog", [("active", D1), ("finished", D2), ("active", TODAY)])
    runs = walk("active", [("backlog", TODAY)], runs)
    assert runs == [Run(1, D1, D2, outcome="finished")]


def test_backlog_to_finished_records_a_startless_run():
    runs = walk("backlog", [("finished", TODAY)])
    assert runs == [Run(1, None, TODAY, outcome="finished")]


def test_backlog_to_paused_opens_a_paused_run():
    assert walk("backlog", [("paused", TODAY)]) == [Run(1, TODAY, paused_on=TODAY)]


def test_try_again_after_abandoning_opens_the_next_run():
    runs = walk("backlog", [("active", D1), ("abandoned", D2), ("active", TODAY)])
    assert runs == [Run(1, D1, D2, outcome="abandoned"), Run(2, TODAY)]


def test_numbers_are_never_reused():
    runs = [Run(1, D1, D2, outcome="finished"), Run(3, D2, TODAY, outcome="finished")]
    assert walk("finished", [("active", TODAY)], runs)[-1].number == 4


def test_the_same_status_changes_nothing():
    runs = walk("backlog", [("active", D1)])
    assert pt.plan_transition(runs, "active", "active", TODAY) == []


def test_an_unknown_status_is_refused():
    with pytest.raises(ValueError):
        pt.plan_transition([], "backlog", "wishlist", TODAY)


@pytest.mark.parametrize(
    ("status", "times", "expected"),
    [
        ("backlog", 0, []),
        ("active", 0, [Run(1, D1)]),
        ("paused", 0, [Run(1, D1, paused_on=TODAY)]),
        ("finished", 0, [Run(1, D1, D2, outcome="finished")]),
        (
            "finished",
            2,
            [
                Run(1, D1, None, outcome="finished"),
                Run(2, None, D2, outcome="finished"),
            ],
        ),
        ("active", 1, [Run(1, D1, D2, outcome="finished"), Run(2)]),
        ("abandoned", 0, [Run(1, D1, D2, outcome="abandoned")]),
    ],
)
def test_seed_matches_the_backfill(status, times, expected):
    assert pt.seed(status, D1, D2, times, TODAY) == expected


def test_check_dates_refuses_an_open_finish_and_a_backwards_run():
    with pytest.raises(pt.PlaythroughError):
        pt.check_dates(Run(1, D1, D2))
    with pytest.raises(pt.PlaythroughError):
        pt.check_dates(Run(1, D2, D1, outcome="finished"))
    pt.check_dates(Run(1, D1, D1, outcome="finished"))


def test_check_today_allows_a_time_zone_and_no_more():
    pt.check_today(TODAY + timedelta(1), TODAY)
    pt.check_today(TODAY - timedelta(1), TODAY)
    with pytest.raises(pt.PlaythroughError):
        pt.check_today(TODAY + timedelta(2), TODAY)


# --- Database side. --------------------------------------------------------


async def _item(session, status="backlog") -> Item:
    item = Item(type=ItemType.GAME, title="Hades II", status=status)
    session.add(item)
    await session.flush()
    return item


async def _runs(session, item) -> list[Run]:
    return [pt._as_run(row) for row in await pt.load_rows(session, item.id)]


@pytest.mark.asyncio
async def test_apply_status_writes_runs_and_columns(sessionmaker_for_test):
    async with sessionmaker_for_test() as session:
        item = await _item(session)
        await pt.apply_status(session, item, ItemStatus.ACTIVE, D1)
        await pt.apply_status(session, item, ItemStatus.FINISHED, D2)
        await pt.apply_status(session, item, ItemStatus.ACTIVE, TODAY - timedelta(1))
        await pt.apply_status(session, item, ItemStatus.FINISHED, TODAY)
        await session.commit()
        assert item.status == ItemStatus.FINISHED
        assert (item.started_at, item.finished_at, item.times_completed) == (
            D1,
            TODAY,
            2,
        )
        assert len(await _runs(session, item)) == 2


@pytest.mark.asyncio
async def test_a_journal_day_makes_a_same_day_close_a_real_run(sessionmaker_for_test):
    async with sessionmaker_for_test() as session:
        item = await _item(session)
        await pt.apply_status(session, item, ItemStatus.ACTIVE, D1)
        await pt.apply_status(session, item, ItemStatus.FINISHED, D2)
        await pt.apply_status(session, item, ItemStatus.ACTIVE, TODAY)
        session.add(PlaySession(item_id=item.id, played_on=TODAY, minutes=30))
        await session.flush()
        await pt.apply_status(session, item, ItemStatus.FINISHED, TODAY)
        assert item.times_completed == 2


@pytest.mark.asyncio
async def test_the_misclick_deletes_the_run(sessionmaker_for_test):
    async with sessionmaker_for_test() as session:
        item = await _item(session)
        await pt.apply_status(session, item, ItemStatus.ACTIVE, D1)
        await pt.apply_status(session, item, ItemStatus.FINISHED, D2)
        await pt.apply_status(session, item, ItemStatus.ACTIVE, TODAY)
        await pt.apply_status(session, item, ItemStatus.FINISHED, TODAY)
        assert item.times_completed == 1
        assert item.finished_at == D2
        assert len(await _runs(session, item)) == 1


@pytest.mark.asyncio
async def test_seed_rows_gives_a_new_item_its_runs(sessionmaker_for_test):
    async with sessionmaker_for_test() as session:
        item = Item(
            type=ItemType.GAME,
            title="Celeste",
            status="finished",
            started_at=D1,
            finished_at=D2,
            times_completed=0,
        )
        session.add(item)
        await session.flush()
        await pt.seed_rows(session, item, TODAY)
        assert item.times_completed == 1
        assert await _runs(session, item) == [Run(1, D1, D2, outcome="finished")]


@pytest.mark.asyncio
async def test_add_past_slots_in_before_the_open_run(sessionmaker_for_test):
    async with sessionmaker_for_test() as session:
        item = await _item(session)
        await pt.apply_status(session, item, ItemStatus.ACTIVE, TODAY)
        await pt.add_past(session, item, D1, D2)
        await session.commit()
        assert await _runs(session, item) == [
            Run(1, D1, D2, outcome="finished"),
            Run(2, TODAY),
        ]
        assert (item.started_at, item.finished_at, item.times_completed) == (
            D1,
            D2,
            1,
        )


@pytest.mark.asyncio
async def test_add_past_with_no_open_run_takes_the_next_number(sessionmaker_for_test):
    async with sessionmaker_for_test() as session:
        item = await _item(session)
        await pt.add_past(session, item, D1, D2)
        await pt.add_past(session, item, None, TODAY)
        assert [r.number for r in await _runs(session, item)] == [1, 2]
        assert item.times_completed == 2
        with pytest.raises(pt.PlaythroughError):
            await pt.add_past(session, item, D2, D1)


@pytest.mark.asyncio
async def test_edit_and_delete_resync_the_columns(sessionmaker_for_test):
    async with sessionmaker_for_test() as session:
        item = await _item(session)
        await pt.add_past(session, item, D1, D2)
        await pt.apply_status(session, item, ItemStatus.ACTIVE, TODAY)
        await pt.edit_dates(session, item, 1, {"finished_on": D2 + timedelta(5)})
        assert item.finished_at == D2 + timedelta(5)
        with pytest.raises(pt.PlaythroughError):
            await pt.edit_dates(session, item, 2, {"finished_on": TODAY})
        with pytest.raises(pt.PlaythroughError):
            await pt.delete_run(session, item, 2)
        with pytest.raises(LookupError):
            await pt.delete_run(session, item, 9)
        await pt.delete_run(session, item, 1)
        assert (item.started_at, item.finished_at, item.times_completed) == (
            TODAY,
            None,
            0,
        )


@pytest.mark.asyncio
async def test_journal_is_attributed_to_the_run_that_holds_the_day(
    sessionmaker_for_test,
):
    async with sessionmaker_for_test() as session:
        item = await _item(session)
        await pt.add_past(session, item, D1, D2)
        await pt.apply_status(session, item, ItemStatus.ACTIVE, D2 + timedelta(10))
        for day, minutes in [
            (D1 + timedelta(3), 60),
            (D2, 30),
            (D1 - timedelta(30), 15),
            (TODAY, None),
        ]:
            session.add(PlaySession(item_id=item.id, played_on=day, minutes=minutes))
        await session.flush()
        runs = await _runs(session, item)
        assert await pt.journal_by_run(session, item.id, runs) == {
            1: (2, 90),
            2: (2, 15),
        }


@pytest.mark.asyncio
async def test_deleting_the_item_deletes_its_runs(sessionmaker_for_test):
    async with sessionmaker_for_test() as session:
        item = await _item(session)
        await pt.apply_status(session, item, ItemStatus.ACTIVE, TODAY)
        await session.commit()
        await session.delete(item)
        await session.commit()
        assert (await session.execute(select(Playthrough))).first() is None
