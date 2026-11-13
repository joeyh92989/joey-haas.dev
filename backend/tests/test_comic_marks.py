"""comics.sync_marks: the one writer of the marks on comic_issues."""

from datetime import date

import pytest
from sqlalchemy import select

from comic_issues import upsert_issues
from comics import mark_mismatches, mark_plan, sync_marks
from models import ComicIssue, Item, ItemStatus, ItemType, OwnedFormat
from sources.comicvine import CvIssue

TODAY = date(2026, 11, 13)


def _marks(plan):
    return {n: (m.owned, m.read, m.skipped) for n, m in plan.items()}


def test_plan_singles_read_and_skips():
    plan = mark_plan("1–3, 6", "4", None, 2)
    assert _marks(plan) == {
        1: (True, True, False),
        2: (True, True, False),
        3: (True, False, False),
        4: (False, False, True),
        6: (True, False, False),
    }


def test_plan_editions_count_as_owned():
    editions = [{"kind": "TPB", "label": "Book 1", "from": 3, "to": 4}]
    plan = mark_plan("1", None, editions, 3)
    assert _marks(plan) == {
        1: (True, True, False),
        3: (True, True, False),
        4: (True, False, False),
    }


def test_plan_owned_wins_over_a_skip_stored_before_the_rule():
    assert _marks(mark_plan("2", "2", None, None)) == {2: (True, False, False)}


def test_mismatches_name_the_numbers_where_marks_and_ranges_disagree():
    rows = [(1, True, True, False), (2, True, False, False), (9, False, False, True)]
    # Ranges say 1-2 owned, read to 1, 3 skipped: row 9 is stray, 3 is missing.
    assert mark_mismatches(rows, "1-2", "3", None, 1) == [3, 9]
    assert mark_mismatches(rows[:2], "1-2", None, None, 1) == []


def test_plan_empty():
    assert mark_plan(None, None, None, None) == {}


async def _series(session, **fields) -> Item:
    item = Item(
        type=ItemType.COMIC,
        title="Waterworld",
        status=ItemStatus.BACKLOG,
        owned_format=OwnedFormat.PHYSICAL,
        **fields,
    )
    session.add(item)
    await session.commit()
    return item


async def _rows(session, item):
    result = await session.scalars(
        select(ComicIssue)
        .where(ComicIssue.item_id == item.id)
        .order_by(ComicIssue.number)
    )
    return {r.number: (r.owned, r.read, r.skipped, r.cv_id is None) for r in result}


def _cv(cv_id, number):
    return CvIssue(
        cv_id=cv_id,
        number=number,
        name=f"#{number}",
        store_date=None,
        cover_date=None,
        cover_url=None,
        large_url=None,
        description=[],
    )


@pytest.mark.asyncio
async def test_sync_creates_stubs_and_sets_marks(sessionmaker_for_test):
    async with sessionmaker_for_test() as session:
        item = await _series(session, issues_owned="1–2", issues_skipped="3", read_to=1)
        result = await sync_marks(session, item)
        await session.commit()
        assert await _rows(session, item) == {
            1: (True, True, False, True),
            2: (True, False, False, True),
            3: (False, False, True, True),
        }
        assert (result.rows_marked, result.stubs_added) == (3, 3)


@pytest.mark.asyncio
async def test_sync_marks_synced_rows_without_adding_stubs(sessionmaker_for_test):
    async with sessionmaker_for_test() as session:
        item = await _series(session, issues_owned="1")
        await upsert_issues(session, item.id, [_cv(10, 1), _cv(11, 2)], TODAY)
        result = await sync_marks(session, item)
        await session.commit()
        assert await _rows(session, item) == {
            1: (True, False, False, False),
            2: (False, False, False, False),
        }
        assert result.stubs_added == 0


@pytest.mark.asyncio
async def test_a_number_no_longer_held_is_cleared(sessionmaker_for_test):
    async with sessionmaker_for_test() as session:
        item = await _series(session, issues_owned="1–2", read_to=2)
        await sync_marks(session, item)
        item.issues_owned = "1"
        item.read_to = None
        # A write that set read_to derives every read from it (5c).
        await sync_marks(session, item, from_read_to=True)
        await session.commit()
        # #2 was a stub with nothing left to mark, so its row is gone.
        assert await _rows(session, item) == {1: (True, False, False, True)}


@pytest.mark.asyncio
async def test_a_plain_sync_keeps_the_reads_it_finds(sessionmaker_for_test):
    async with sessionmaker_for_test() as session:
        item = await _series(session, issues_owned="1–2", read_to=2)
        await sync_marks(session, item)
        item.read_to = None  # stale: the marks are the record now
        item.issues_owned = "1–3"
        await sync_marks(session, item)
        await session.commit()
        # #1 and #2 stay read; #3, newly held, reads as read_to says (unread).
        assert await _rows(session, item) == {
            1: (True, True, False, True),
            2: (True, True, False, True),
            3: (True, False, False, True),
        }


@pytest.mark.asyncio
async def test_idempotent(sessionmaker_for_test):
    async with sessionmaker_for_test() as session:
        item = await _series(session, issues_owned="1–2", issues_skipped="5")
        await sync_marks(session, item)
        again = await sync_marks(session, item)
        await session.commit()
        assert (again.stubs_added, again.rows_changed) == (0, 0)
        assert len(await _rows(session, item)) == 3


@pytest.mark.asyncio
async def test_comic_vine_upsert_fills_a_stub_and_keeps_its_marks(
    sessionmaker_for_test,
):
    async with sessionmaker_for_test() as session:
        item = await _series(session, issues_owned="1", issues_skipped="2")
        await sync_marks(session, item)
        await session.commit()
        await upsert_issues(session, item.id, [_cv(10, 1), _cv(11, 2)], TODAY)
        await session.commit()
        assert await _rows(session, item) == {
            1: (True, False, False, False),
            2: (False, False, True, False),
        }


@pytest.mark.asyncio
async def test_a_non_comic_is_left_alone(sessionmaker_for_test):
    async with sessionmaker_for_test() as session:
        game = Item(type=ItemType.GAME, title="G", status=ItemStatus.BACKLOG)
        session.add(game)
        await session.commit()
        result = await sync_marks(session, game)
        assert result.stubs_added == 0
        assert await _rows(session, game) == {}


@pytest.mark.asyncio
async def test_a_stub_with_no_mark_left_is_deleted_but_a_synced_row_is_not(
    sessionmaker_for_test,
):
    async with sessionmaker_for_test() as session:
        item = await _series(session, issues_owned="1–2")
        await upsert_issues(session, item.id, [_cv(10, 1)], TODAY)
        await sync_marks(session, item)  # #1 synced, #2 a stub
        item.issues_owned = None
        result = await sync_marks(session, item)
        await session.commit()
        # The stub (#2) goes; the Comic Vine row (#1) stays, unmarked.
        assert await _rows(session, item) == {1: (False, False, False, False)}
        assert result.stubs_removed == 1


@pytest.mark.asyncio
async def test_a_stub_that_lost_the_race_to_a_comic_vine_row_gets_the_marks(
    sessionmaker_for_test,
):
    async with sessionmaker_for_test() as session:
        item = await _series(session, issues_owned="1–2")
        real_execute = session.execute
        raced = False

        async def racing(statement, *args, **kwargs):
            nonlocal raced
            if not raced and str(statement).lstrip().startswith("INSERT"):
                raced = True
                # sync_series commits issue #1 between our read and our insert.
                async with sessionmaker_for_test() as other:
                    await upsert_issues(other, item.id, [_cv(10, 1)], TODAY)
                    await other.commit()
            return await real_execute(statement, *args, **kwargs)

        session.execute = racing
        result = await sync_marks(session, item)
        await session.commit()
        assert raced
        assert await _rows(session, item) == {
            1: (True, False, False, False),  # the Comic Vine row, now marked
            2: (True, False, False, True),
        }
        assert result.stubs_added == 1


@pytest.mark.asyncio
async def test_a_series_that_stops_being_a_comic_loses_its_marks_and_stubs(
    sessionmaker_for_test,
):
    async with sessionmaker_for_test() as session:
        item = await _series(session, issues_owned="1–2")
        await upsert_issues(session, item.id, [_cv(10, 1)], TODAY)
        await sync_marks(session, item)
        item.type = ItemType.GAME
        await sync_marks(session, item)
        await session.commit()
        assert await _rows(session, item) == {1: (False, False, False, False)}
