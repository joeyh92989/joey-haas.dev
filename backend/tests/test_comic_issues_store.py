"""Storage helpers for the public comic issue pages (comic_issues table)."""

from dataclasses import replace
from datetime import date

import pytest
from sqlalchemy import func, select

from comic_issues import load_issues, upsert_issues
from models import ComicIssue, Item, ItemStatus, ItemType
from sources.comicvine import CvIssue

TODAY = date(2026, 11, 11)


def _issue(cv_id: int, number: int, name: str | None = None) -> CvIssue:
    return CvIssue(
        cv_id=cv_id,
        number=number,
        name=name,
        store_date=date(2026, 1, 7),
        cover_date=date(2026, 2, 1),
        cover_url="https://img/small.jpg",
        large_url="https://img/large.jpg",
        description=["One.", "Two."],
    )


async def _series(session):
    item = Item(type=ItemType.COMIC, title="Saga", status=ItemStatus.BACKLOG)
    session.add(item)
    await session.commit()
    return item.id


@pytest.mark.asyncio
async def test_upsert_inserts_then_updates(sessionmaker_for_test):
    async with sessionmaker_for_test() as session:
        item_id = await _series(session)
        assert await upsert_issues(session, item_id, [_issue(1, 1, "A")], TODAY) == 1
        later = date(2026, 11, 12)
        assert await upsert_issues(session, item_id, [_issue(1, 1, "B")], later) == 1
        await session.commit()
        count = await session.scalar(select(func.count()).select_from(ComicIssue))
        assert count == 1
        rows = await load_issues(session, item_id)
        assert rows[0].name == "B"
        assert rows[0].fetched_on == later
        assert rows[0].description == ["One.", "Two."]


@pytest.mark.asyncio
async def test_upsert_duplicate_number_keeps_lowest_cv_id_in_batch(
    sessionmaker_for_test,
):
    async with sessionmaker_for_test() as session:
        item_id = await _series(session)
        await upsert_issues(
            session, item_id, [_issue(11, 2, "second"), _issue(10, 2, "first")], TODAY
        )
        await session.commit()
        assert [r.name for r in await load_issues(session, item_id)] == ["first"]


@pytest.mark.asyncio
async def test_a_later_page_does_not_overwrite_a_lower_cv_id(sessionmaker_for_test):
    async with sessionmaker_for_test() as session:
        item_id = await _series(session)
        await upsert_issues(session, item_id, [_issue(10, 2, "low")], TODAY)
        await upsert_issues(session, item_id, [_issue(11, 2, "high")], TODAY)
        await session.commit()
        assert [(r.cv_id, r.name) for r in await load_issues(session, item_id)] == [
            (10, "low")
        ]
        # A lower id arriving later takes the number over; the same id refreshes.
        await upsert_issues(session, item_id, [_issue(9, 2, "lower")], TODAY)
        await upsert_issues(session, item_id, [_issue(9, 2, "lower again")], TODAY)
        await session.commit()
        session.expire_all()
        assert [(r.cv_id, r.name) for r in await load_issues(session, item_id)] == [
            (9, "lower again")
        ]


@pytest.mark.asyncio
async def test_upsert_duplicate_number_keeps_first(sessionmaker_for_test):
    async with sessionmaker_for_test() as session:
        item_id = await _series(session)
        written = await upsert_issues(
            session, item_id, [_issue(10, 2, "first"), _issue(11, 2, "second")], TODAY
        )
        await session.commit()
        assert written == 1
        rows = await load_issues(session, item_id)
        assert [(r.number, r.cv_id, r.name) for r in rows] == [(2, 10, "first")]


@pytest.mark.asyncio
async def test_load_orders_by_number_and_skips_numberless(sessionmaker_for_test):
    async with sessionmaker_for_test() as session:
        item_id = await _series(session)
        odd = replace(_issue(9, 1), number=None)
        await upsert_issues(session, item_id, [_issue(3, 3), _issue(1, 1), odd], TODAY)
        await session.commit()
        assert [r.number for r in await load_issues(session, item_id)] == [1, 3]


@pytest.mark.asyncio
async def test_empty_batch_writes_nothing(sessionmaker_for_test):
    async with sessionmaker_for_test() as session:
        item_id = await _series(session)
        assert await upsert_issues(session, item_id, [], TODAY) == 0


@pytest.mark.asyncio
async def test_cascade_on_item_delete(sessionmaker_for_test):
    async with sessionmaker_for_test() as session:
        item_id = await _series(session)
        await upsert_issues(session, item_id, [_issue(1, 1)], TODAY)
        await session.commit()
        await session.delete(await session.get(Item, item_id))
        await session.commit()
        count = await session.scalar(select(func.count()).select_from(ComicIssue))
        assert count == 0
