"""Every comic write path ends in comics.sync_marks, in its own transaction."""

from __future__ import annotations

from datetime import date

import pytest
from sqlalchemy import select

from models import ComicIssue, Item, OwnedFormat
from sources.comicvine import CvIssue
from tests.test_comics_routes import FakeComicVine
from tests.test_comics_routes import _seed as seed_comic
from tests.test_comics_routes import client_for as comics_client
from tests.test_intake_commit import S, _commit, _items, _seed, _seed_series, _series
from tests.test_intake_kinds import client_for as intake_client
from tests.test_items_bulk import client_for as items_client

pytestmark = pytest.mark.asyncio

EDITION = {"kind": "TPB", "label": "Book 1", "from": 3, "to": 4}


async def marks(factory, item_id) -> dict[int, tuple[bool, bool, bool]]:
    async with factory() as session:
        rows = await session.scalars(
            select(ComicIssue)
            .where(ComicIssue.item_id == item_id)
            .order_by(ComicIssue.number)
        )
        return {r.number: (r.owned, r.read, r.skipped) for r in rows}


def _comic(**fields) -> dict:
    return {"type": "comic", "title": "Saga", "status": "backlog", **fields}


async def test_create_writes_marks(sessionmaker_for_test):
    async with items_client(sessionmaker_for_test) as client:
        response = await client.post(
            "/api/items",
            json=_comic(issues_owned="1-2", issues_skipped="4", read_to=1),
        )
    assert response.status_code == 201, response.text
    assert await marks(sessionmaker_for_test, response.json()["id"]) == {
        1: (True, True, False),
        2: (True, False, False),
        4: (False, False, True),
    }


async def test_bulk_create_writes_marks(sessionmaker_for_test):
    async with items_client(sessionmaker_for_test) as client:
        response = await client.post(
            "/api/items/bulk",
            json={
                "items": [
                    _comic(title="A", issues_owned="1"),
                    _comic(title="B", editions=[EDITION]),
                ]
            },
        )
    assert response.status_code == 201, response.text
    async with sessionmaker_for_test() as session:
        items = {i.title: i.id for i in await session.scalars(select(Item))}
    assert await marks(sessionmaker_for_test, items["A"]) == {1: (True, False, False)}
    assert await marks(sessionmaker_for_test, items["B"]) == {
        3: (True, False, False),
        4: (True, False, False),
    }


async def test_patch_rewrites_marks(sessionmaker_for_test):
    async with items_client(sessionmaker_for_test) as client:
        made = await client.post("/api/items", json=_comic(issues_owned="1-3"))
        item_id = made.json()["id"]
        patched = await client.patch(
            f"/api/items/{item_id}", json={"issues_owned": "1", "read_to": 1}
        )
    assert patched.status_code == 200, patched.text
    assert await marks(sessionmaker_for_test, item_id) == {
        1: (True, True, False),
        2: (False, False, False),
        3: (False, False, False),
    }


async def test_got_it_and_skip_write_marks(sessionmaker_for_test):
    item_id = await seed_comic(
        sessionmaker_for_test, owned_format=OwnedFormat.PHYSICAL, issues_owned="1"
    )
    async with comics_client(sessionmaker_for_test, FakeComicVine()) as client:
        assert (
            await client.post(f"/api/comics/{item_id}/issues/2/got")
        ).status_code == 200
        assert (
            await client.post(f"/api/comics/{item_id}/issues/5/skip")
        ).status_code == 200
    assert await marks(sessionmaker_for_test, item_id) == {
        1: (True, False, False),
        2: (True, False, False),
        5: (False, False, True),
    }


async def test_got_it_clears_a_skip_mark(sessionmaker_for_test):
    item_id = await seed_comic(
        sessionmaker_for_test, owned_format=OwnedFormat.PHYSICAL, issues_skipped="3"
    )
    async with comics_client(sessionmaker_for_test, FakeComicVine()) as client:
        await client.post(f"/api/comics/{item_id}/issues/3/got")
    assert await marks(sessionmaker_for_test, item_id) == {3: (True, False, False)}


class LinkingComicVine(FakeComicVine):
    async def fetch_issue(self, cv_id: int):
        return CvIssue(
            cv_id=cv_id,
            number=3,
            name=None,
            store_date=None,
            cover_date=None,
            cover_url="https://cv.example/3.jpg",
            large_url=None,
            description=[],
        )


async def test_editions_link_keeps_the_marks(sessionmaker_for_test):
    item_id = await seed_comic(
        sessionmaker_for_test,
        owned_format=OwnedFormat.PHYSICAL,
        editions=[{**EDITION}],
    )
    async with comics_client(sessionmaker_for_test, LinkingComicVine()) as client:
        response = await client.put(
            f"/api/comics/{item_id}/editions/ed-3-4/link", json={"cv_id": 99}
        )
    assert response.status_code == 200, response.text
    assert await marks(sessionmaker_for_test, item_id) == {
        3: (True, False, False),
        4: (True, False, False),
    }


async def test_intake_commit_of_a_new_series_writes_marks(sessionmaker_for_test):
    entries = [
        (
            "comic",
            S.EXACT,
            {"issues_owned": str(n), "shelf_format": "singles"},
            _series(),
        )
        for n in (1, 2)
    ]
    sitting_id = await _seed(sessionmaker_for_test, entries=entries)
    async with intake_client(sessionmaker_for_test) as client:
        assert (await _commit(client, sitting_id)).status_code == 200
    [row] = await _items(sessionmaker_for_test)
    assert await marks(sessionmaker_for_test, row.id) == {
        1: (True, False, False),
        2: (True, False, False),
    }


async def test_intake_commit_on_a_series_on_the_shelf_writes_marks(
    sessionmaker_for_test,
):
    await _seed_series(sessionmaker_for_test, issues_owned="1", issues_skipped="2")
    entries = [("comic", S.EXACT, {"issues_owned": "2"}, _series())]
    sitting_id = await _seed(sessionmaker_for_test, entries=entries)
    async with intake_client(sessionmaker_for_test) as client:
        assert (await _commit(client, sitting_id)).status_code == 200
    [row] = await _items(sessionmaker_for_test)
    assert await marks(sessionmaker_for_test, row.id) == {
        1: (True, False, False),
        2: (True, False, False),
    }


async def test_comic_vine_sync_leaves_marks_alone(sessionmaker_for_test):
    from comic_issues import upsert_issues

    item_id = await seed_comic(
        sessionmaker_for_test,
        owned_format=OwnedFormat.PHYSICAL,
        issues_owned="1",
        issues_skipped="2",
    )
    async with items_client(sessionmaker_for_test) as client:
        await client.patch(f"/api/items/{item_id}", json={"read_to": 1})
    issue = CvIssue(7, 1, None, None, None, None, None, [])
    async with sessionmaker_for_test() as session:
        await upsert_issues(session, item_id, [issue], date(2026, 11, 13))
        await session.commit()
    assert await marks(sessionmaker_for_test, item_id) == {
        1: (True, True, False),
        2: (False, False, True),
    }
