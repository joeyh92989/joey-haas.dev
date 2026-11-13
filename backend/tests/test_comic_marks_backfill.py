"""POST /api/comics/marks/backfill: sync_marks on every comic, with a parity
check against what the ranges say."""

import pytest
from sqlalchemy import select

from models import ComicIssue, Item, ItemStatus, ItemType, OwnedFormat
from tests.test_comic_marks_paths import marks
from tests.test_comics_routes import FakeComicVine, client_for

pytestmark = pytest.mark.asyncio


async def _comic(factory, title, **fields) -> Item:
    item = Item(
        type=ItemType.COMIC,
        title=title,
        status=ItemStatus.BACKLOG,
        owned_format=OwnedFormat.PHYSICAL,
        **fields,
    )
    async with factory() as session:
        session.add(item)
        await session.commit()
    return item


async def test_backfill_marks_every_comic_and_answers_with_parity(
    sessionmaker_for_test,
):
    waterworld = await _comic(sessionmaker_for_test, "Waterworld", issues_owned="1-4")
    trades = await _comic(
        sessionmaker_for_test,
        "Trades",
        issues_owned="1",
        editions=[{"kind": "TPB", "label": "Book", "from": 2, "to": 3}],
    )
    reading = await _comic(
        sessionmaker_for_test,
        "Reading",
        issues_owned="1-3",
        issues_skipped="5",
        read_to=2,
    )
    async with sessionmaker_for_test() as session:
        session.add(Item(type=ItemType.GAME, title="G", status=ItemStatus.BACKLOG))
        await session.commit()

    async with client_for(sessionmaker_for_test, FakeComicVine()) as client:
        response = await client.post("/api/comics/marks/backfill")
        again = await client.post("/api/comics/marks/backfill")

    assert response.status_code == 200, response.text
    assert response.json() == {
        "series": 3,
        "rows_marked": 4 + 3 + 4,
        "stubs_added": 11,
        "rows_changed": 0,
        "mismatches": [],
        "errors": [],
    }
    assert await marks(sessionmaker_for_test, waterworld.id) == {
        n: (True, False, False) for n in (1, 2, 3, 4)
    }
    assert await marks(sessionmaker_for_test, trades.id) == {
        n: (True, False, False) for n in (1, 2, 3)
    }
    assert await marks(sessionmaker_for_test, reading.id) == {
        1: (True, True, False),
        2: (True, True, False),
        3: (True, False, False),
        5: (False, False, True),
    }
    # Idempotent.
    assert again.json() | {"series": 3} == {
        "series": 3,
        "rows_marked": 11,
        "stubs_added": 0,
        "rows_changed": 0,
        "mismatches": [],
        "errors": [],
    }
    async with sessionmaker_for_test() as session:
        rows = (await session.scalars(select(ComicIssue))).all()
    assert len(rows) == 11


async def test_backfill_reports_a_series_with_malformed_ranges(sessionmaker_for_test):
    bad = await _comic(sessionmaker_for_test, "Bad", issues_owned="not a range")
    await _comic(sessionmaker_for_test, "Fine", issues_owned="1")
    async with client_for(sessionmaker_for_test, FakeComicVine()) as client:
        response = await client.post("/api/comics/marks/backfill")
    body = response.json()
    assert response.status_code == 200
    assert body["series"] == 2
    assert body["stubs_added"] == 1
    assert [e["id"] for e in body["errors"]] == [str(bad.id)]
