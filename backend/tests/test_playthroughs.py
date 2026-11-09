"""playthroughs.py: the run rules (pure) and their database side."""

from datetime import UTC, date, datetime, timedelta

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


def test_a_past_run_added_after_a_replay_is_not_the_previous_run():
    # Abandoned, Try again today, then a past finish added (it takes the
    # number below the open run): finishing today is a real run, and
    # abandoning again is the misclick.
    at = [datetime(2026, 11, day, tzinfo=UTC) for day in (1, 2, 3)]
    runs = [
        Run(1, D1, D2, outcome="abandoned", created_at=at[0]),
        Run(2, None, D1, outcome="finished", created_at=at[2]),
        Run(3, TODAY, created_at=at[1]),
    ]
    assert not pt.is_misclick(runs, "finished", TODAY, False)
    assert pt.is_misclick(runs, "abandoned", TODAY, False)


def test_a_close_dated_on_keeps_today_for_the_misclick_rule():
    runs = walk("backlog", [("active", D1)])
    dated = pt.apply_plan(
        runs, pt.plan_transition(runs, "active", "finished", TODAY, on=D2, note="Good")
    )
    assert dated == [Run(1, D1, D2, outcome="finished", note="Good")]
    # A replay opened today and finished again today is still a misclick,
    # whatever date the sheet carries.
    replayed = walk("finished", [("active", TODAY)], dated)
    assert pt.plan_transition(replayed, "active", "finished", TODAY, on=D2) == [
        pt.Delete(2)
    ]


def test_a_pause_dated_on_carries_the_note_and_a_resume_keeps_it():
    runs = walk("backlog", [("active", D1)])
    paused = pt.apply_plan(
        runs, pt.plan_transition(runs, "active", "paused", TODAY, on=D2, note="Later")
    )
    assert paused == [Run(1, D1, paused_on=D2, note="Later")]
    resumed = pt.apply_plan(
        paused, pt.plan_transition(paused, "paused", "active", TODAY)
    )
    assert resumed == [Run(1, D1, note="Later")]
    # Closing without a note leaves the one it has.
    closed = pt.apply_plan(
        resumed, pt.plan_transition(resumed, "active", "finished", TODAY)
    )
    assert closed == [Run(1, D1, TODAY, outcome="finished", note="Later")]


def test_a_startless_close_and_pause_take_the_date_and_note():
    assert pt.plan_transition([], "backlog", "finished", TODAY, on=D2, note="x") == [
        pt.Open(Run(1, finished_on=D2, outcome="finished", note="x"))
    ]
    assert pt.plan_transition([], "backlog", "paused", TODAY, on=D2) == [
        pt.Open(Run(1, started_on=D2, paused_on=D2))
    ]


@pytest.mark.parametrize(
    ("target", "on", "message"),
    [
        ("finished", TODAY + timedelta(days=1), "has not happened yet"),
        ("finished", D1 - timedelta(days=1), "cannot finish before it started"),
        ("paused", D1 - timedelta(days=1), "cannot pause before it started"),
    ],
)
def test_a_date_after_today_or_before_the_start_is_refused(target, on, message):
    runs = walk("backlog", [("active", D1)])
    with pytest.raises(pt.PlaythroughError, match=message):
        pt.plan_transition(runs, "active", target, TODAY, on=on)


@pytest.mark.parametrize("target", ["active", "backlog"])
def test_a_date_or_note_on_another_move_is_refused(target):
    runs = walk("backlog", [("active", D1), ("paused", D2)])
    with pytest.raises(pt.PlaythroughError, match="Only Finished, Paused"):
        pt.plan_transition(runs, "paused", target, TODAY, note="x")
    with pytest.raises(pt.PlaythroughError, match="Only Finished, Paused"):
        pt.plan_transition(runs, "paused", target, TODAY, on=TODAY)


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
        ("backlog", 0, [Run(1, D1, D2, outcome="finished")]),
        ("active", 0, [Run(1, D1, D2, outcome="finished"), Run(2)]),
        # A finish date counts as a finish whatever the counter says.
        (
            "paused",
            0,
            [Run(1, D1, D2, outcome="finished"), Run(2, paused_on=TODAY)],
        ),
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


@pytest.mark.parametrize(
    ("status", "expected"),
    [
        ("backlog", [Run(1, D1, outcome="abandoned")]),
        ("active", [Run(1, D1)]),
        ("abandoned", [Run(1, D1, outcome="abandoned")]),
    ],
)
def test_seed_keeps_a_start_date_without_a_finish(status, expected):
    # A start date the old flow left on a backlog game is kept on a run,
    # never dropped by the first sync.
    assert pt.seed(status, D1, None, 0, TODAY) == expected
    assert pt.derive(pt.seed(status, D1, None, 0, TODAY)).started_at == D1


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
async def test_a_finish_after_adding_a_past_run_is_kept(sessionmaker_for_test):
    # Each step commits, as each request does, so the rows' created_at differ.
    async with sessionmaker_for_test() as session:
        item = await _item(session)
        await pt.apply_status(session, item, ItemStatus.ACTIVE, D1)
        await pt.apply_status(session, item, ItemStatus.ABANDONED, D2)
        await session.commit()
        await pt.apply_status(session, item, ItemStatus.ACTIVE, TODAY)
        await session.commit()
        await pt.add_past(session, item, None, D1)
        await session.commit()
        await pt.apply_status(session, item, ItemStatus.FINISHED, TODAY)
        await session.commit()
        runs = await _runs(session, item)
        assert [(run.number, run.outcome) for run in runs] == [
            (1, "abandoned"),
            (2, "finished"),
            (3, "finished"),
        ]
        assert item.times_completed == 2


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
        got = (await pt.runs_with_journal(session, [item.id]))[item.id]
        assert [
            (run.number, days, minutes, last) for run, days, minutes, last in got
        ] == [
            (1, 2, 90, D2),
            (2, 2, 15, TODAY),
        ]


def test_a_closed_run_without_a_finish_date_does_not_claim_later_days():
    """The 0011 backfill's shape for a game finished twice: run 1 carries the
    start, the finish date sits on the last run. Those days are run 1's;
    everything after belongs to the replay."""
    runs = [
        Run(1, D1, None, outcome="finished"),
        Run(2, None, D2, outcome="finished"),
        Run(3, TODAY - timedelta(days=5)),
    ]
    days = [(D1 + timedelta(1), 60), (TODAY - timedelta(1), 30), (TODAY, None)]
    totals = pt.attribute_journal(runs, days)
    assert totals[1] == (1, 60, D1 + timedelta(1))
    assert totals[3] == (2, 30, TODAY)


def test_a_wrap_up_note_on_the_status_it_already_has_lands_on_the_open_run():
    runs = walk("backlog", [("active", D1), ("paused", D2)])
    noted = pt.apply_plan(
        runs, pt.plan_transition(runs, "paused", "paused", TODAY, note="Waiting")
    )
    assert noted == [Run(1, D1, paused_on=D2, note="Waiting")]
    # Without a line there is still nothing to do.
    assert pt.plan_transition(noted, "paused", "paused", TODAY) == []


def test_a_note_on_a_closed_game_lands_on_the_run_that_ended():
    runs = [Run(1, D1, D2, outcome="finished")]
    assert pt.plan_transition(
        runs, "finished", "finished", TODAY, note="Still think so"
    ) == [pt.Change(Run(1, D1, D2, outcome="finished", note="Still think so"))]
    # With no runs at all there is nothing to write on.
    assert pt.plan_transition([], "finished", "finished", TODAY, note="x") == []


def test_a_note_means_the_close_is_a_real_run_not_a_misclick():
    """A line written about the run is the owner saying it happened."""
    runs = walk("finished", [("active", TODAY)], [Run(1, D1, D2, outcome="finished")])
    assert pt.plan_transition(runs, "active", "finished", TODAY) == [pt.Delete(2)]
    planned = pt.plan_transition(runs, "active", "finished", TODAY, note="Loved it")
    assert planned == [
        pt.Change(Run(2, TODAY, TODAY, outcome="finished", note="Loved it"))
    ]


def test_attribute_journal_last_day_is_none_without_journal():
    runs = [Run(number=1, started_on=D1)]
    assert pt.attribute_journal(runs, []) == {1: (0, 0, None)}


@pytest.mark.asyncio
async def test_apply_status_writes_the_dated_close_and_its_note(
    sessionmaker_for_test,
):
    async with sessionmaker_for_test() as session:
        item = await _item(session)
        await pt.apply_status(session, item, ItemStatus.ACTIVE, D1)
        await pt.apply_status(
            session, item, ItemStatus.FINISHED, TODAY, on=D2, note="One line"
        )
        await session.commit()
        row = (await session.execute(select(Playthrough))).scalar_one()
        assert (row.finished_on, row.note) == (D2, "One line")
        assert (item.finished_at, item.times_completed) == (D2, 1)


@pytest.mark.asyncio
async def test_deleting_the_item_deletes_its_runs(sessionmaker_for_test):
    async with sessionmaker_for_test() as session:
        item = await _item(session)
        await pt.apply_status(session, item, ItemStatus.ACTIVE, TODAY)
        await session.commit()
        await session.delete(item)
        await session.commit()
        assert (await session.execute(select(Playthrough))).first() is None


@pytest.mark.asyncio
async def test_open_run_details_read_the_open_run(sessionmaker_for_test):
    from picker_routes import open_run_details

    async with sessionmaker_for_test() as session:
        item = await _item(session)
        replay = await _item(session)
        other = await _item(session)
        await pt.apply_status(session, item, ItemStatus.ACTIVE, D1)
        await pt.apply_status(session, item, ItemStatus.PAUSED, D2)
        await pt.apply_status(session, replay, ItemStatus.FINISHED, D1)
        await pt.apply_status(session, replay, ItemStatus.ACTIVE, D2)
        session.add(PlaySession(item_id=item.id, played_on=D1, minutes=90))
        await session.flush()
        details = await open_run_details(session, [item, replay, other])
        # A replay's start is its own run's, not started_at (the first run's).
        assert details == {item.id: (D2, 90, D1), replay.id: (None, 0, D2)}
