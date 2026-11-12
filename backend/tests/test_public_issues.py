"""The public wall, issue page and edition page (spec: comic issue pages).
Only public rows; a skip changes no body."""

import uuid
from contextlib import asynccontextmanager
from datetime import UTC, date, datetime

import pytest
from fastapi import FastAPI
from httpx2 import ASGITransport, AsyncClient
from sqlalchemy import select

import public
from models import ComicIssue, Item, ItemStatus, ItemType, OwnedFormat
from public import create_public_router
from public_issues import (
    PublicComicIndex,
    PublicComicIndexEdition,
    PublicComicIndexIssue,
    PublicEditionPage,
    PublicIssuePage,
    PublicWall,
)

pytestmark = pytest.mark.asyncio

NOW = datetime(2026, 11, 6, 15, 0, tzinfo=UTC)
CV_URL = "https://comicvine.gamespot.com/saga/4050-1/"

COMIC_FORBIDDEN = {
    "issues_skipped", "skipped", "notes", "owned_format", "acquired_at",
    "source_metadata", "is_public", "price", "store", "url", "external_id",
}  # fmt: skip

WALL_FIELDS = {"series_title", "publisher", "issues", "editions"}
WALL_ISSUE_FIELDS = {"number", "name", "store_date", "cover_url"}
WALL_EDITION_FIELDS = {
    "slug", "kind", "label", "from_issue", "to_issue", "cover_url",
}  # fmt: skip
ISSUE_FIELDS = {
    "series_id", "series_title", "publisher", "number", "name", "store_date",
    "cover_date", "cover_url", "large_url", "description", "state", "held_as",
    "edition", "released", "ongoing", "neighbours", "source_url",
}  # fmt: skip
EDITION_FIELDS = {
    "series_id", "series_title", "publisher", "slug", "kind", "label",
    "from_issue", "to_issue", "cover_url", "large_url", "description", "state",
    "read", "read_to", "inside", "prev", "next", "source_url",
}  # fmt: skip


@pytest.fixture(autouse=True)
def clock(monkeypatch):
    class FrozenDatetime(datetime):
        @classmethod
        def now(cls, tz=None):
            return NOW.astimezone(tz) if tz else NOW

    monkeypatch.setattr(public, "datetime", FrozenDatetime)


@asynccontextmanager
async def client_for(factory):
    app = FastAPI()
    app.include_router(create_public_router(factory))
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        yield client


def _keys(value):
    if isinstance(value, dict):
        for key, inner in value.items():
            yield key
            yield from _keys(inner)
    elif isinstance(value, list):
        for inner in value:
            yield from _keys(inner)


def _series(**fields) -> Item:
    """Owns 1-4 and 6 as singles, 5 and 6 in a trade (6 twice); reads to 2;
    #7 and #8 are missing, #9 is dated ahead; skips 8."""
    base = dict(
        id=uuid.uuid4(),
        type=ItemType.COMIC,
        title="Saga",
        status=ItemStatus.ACTIVE,
        is_public=True,
        owned_format=OwnedFormat.PHYSICAL,
        issues_owned="1–4, 6",
        issues_skipped="8",
        editions=[
            {"kind": "Trade paperback", "label": "Volume Two", "from": 5, "to": 6},
            {"kind": "Hardcover", "label": "Deluxe", "from": 5, "to": 6},
        ],
        read_to=2,
        created_at=datetime(2026, 10, 3, tzinfo=UTC),
        source_metadata={
            "publisher": "Image",
            "source_url": CV_URL,
            "released": 8,
            "ongoing": True,
            "fetched_on": "2026-11-05",
            "issues": [
                {"number": "9", "store_date": "2026-11-18", "name": None,
                 "cover_date": None, "cover_url": None},
            ],
        },
    )  # fmt: skip
    return Item(**{**base, **fields})


def _row(item_id, number, **fields) -> ComicIssue:
    base = dict(
        item_id=item_id,
        number=number,
        cv_id=1000 + number,
        name=f"Issue {number}",
        store_date=date(2026, 1, number),
        cover_date=date(2026, 2, number),
        cover_url=f"https://cv.test/m{number}.jpg",
        large_url=f"https://cv.test/l{number}.jpg",
        description=[f"About {number}."],
        fetched_on=date(2026, 11, 5),
    )
    return ComicIssue(**{**base, **fields})


async def _seed(factory, item=None, numbers=(1, 2, 3, 4, 5, 6, 7)):
    item = item or _series()
    async with factory() as session:
        session.add(item)
        await session.flush()
        session.add_all(_row(item.id, n) for n in numbers)
        await session.commit()
    return item.id


async def _get(factory, path):
    async with client_for(factory) as client:
        return await client.get(path)


async def test_the_models_publish_exactly_these_fields():
    assert set(PublicWall.model_fields) == WALL_FIELDS
    assert set(PublicIssuePage.model_fields) == ISSUE_FIELDS
    assert set(PublicEditionPage.model_fields) == EDITION_FIELDS


async def test_wall_lists_issues_and_editions_in_order(sessionmaker_for_test):
    item_id = await _seed(sessionmaker_for_test)
    response = await _get(sessionmaker_for_test, f"/api/public/items/{item_id}/issues")
    assert response.status_code == 200
    body = response.json()
    assert set(body) == WALL_FIELDS
    assert (body["series_title"], body["publisher"]) == ("Saga", "Image")
    assert [i["number"] for i in body["issues"]] == [1, 2, 3, 4, 5, 6, 7]
    assert set(body["issues"][0]) == WALL_ISSUE_FIELDS
    assert body["issues"][0]["cover_url"] == "https://cv.test/m1.jpg"
    assert [e["slug"] for e in body["editions"]] == ["ed-5-6", "ed-5-6-2"]
    assert set(body["editions"][0]) == WALL_EDITION_FIELDS
    # No cover of its own: the first collected issue's.
    assert body["editions"][0]["cover_url"] == "https://cv.test/m5.jpg"
    assert COMIC_FORBIDDEN.isdisjoint(set(_keys(body)))


async def test_wall_edition_prefers_its_own_cover(sessionmaker_for_test):
    item = _series(
        editions=[
            {
                "kind": "TPB",
                "label": "V",
                "from": 5,
                "to": 6,
                "cv_id": 9,
                "cover_url": "https://cv.test/own.jpg",
            },
        ]  # fmt: skip
    )
    item_id = await _seed(sessionmaker_for_test, item)
    body = (
        await _get(sessionmaker_for_test, f"/api/public/items/{item_id}/issues")
    ).json()
    assert body["editions"][0]["cover_url"] == "https://cv.test/own.jpg"


async def test_issue_page_states(sessionmaker_for_test):
    item_id = await _seed(sessionmaker_for_test)
    states = {}
    for n in (1, 3, 7, 8, 9):
        response = await _get(
            sessionmaker_for_test, f"/api/public/items/{item_id}/issues/{n}"
        )
        assert response.status_code == 200, n
        states[n] = response.json()["state"]
    # read to 2; 3 owned; 7 and the skipped 8 both missing; 9 is the next.
    assert states == {1: "read", 3: "owned", 7: "missing", 8: "missing", 9: "not-out"}
    page = (
        await _get(sessionmaker_for_test, f"/api/public/items/{item_id}/issues/3")
    ).json()
    assert set(page) == ISSUE_FIELDS
    assert page["name"] == "Issue 3"
    assert page["description"] == ["About 3."]
    assert page["large_url"] == "https://cv.test/l3.jpg"
    assert (page["released"], page["ongoing"]) == (8, True)
    assert page["source_url"] == CV_URL
    assert COMIC_FORBIDDEN.isdisjoint(set(_keys(page)))


async def test_issue_page_neighbours(sessionmaker_for_test):
    item_id = await _seed(sessionmaker_for_test)
    page = (
        await _get(sessionmaker_for_test, f"/api/public/items/{item_id}/issues/7")
    ).json()
    assert [(n["number"], n["state"]) for n in page["neighbours"]] == [
        (3, "owned"),
        (4, "owned"),
        (5, "owned"),
        (6, "owned"),
        (8, "missing"),
        (9, "not-out"),
        # 10 and 11 have no page.
    ]
    assert page["neighbours"][0]["cover_url"] == "https://cv.test/m3.jpg"


async def test_issue_page_held_as(sessionmaker_for_test):
    item_id = await _seed(sessionmaker_for_test)

    async def held(n):
        body = (
            await _get(sessionmaker_for_test, f"/api/public/items/{item_id}/issues/{n}")
        ).json()
        return body["held_as"], body["edition"]

    assert await held(1) == ("Single issue", None)
    assert await held(7) == ("Not owned", None)
    # 5 is only in the trade; 6 is also a single.
    assert await held(5) == (
        "In Volume Two (trade paperback)",
        {"slug": "ed-5-6", "label": "Volume Two", "kind": "Trade paperback"},
    )
    assert await held(6) == (
        "In Volume Two (trade paperback) and as a single, counted once",
        {"slug": "ed-5-6", "label": "Volume Two", "kind": "Trade paperback"},
    )


async def test_issue_page_owned_without_cv_row(sessionmaker_for_test):
    """Review Focus 2: owned #3 that Comic Vine doesn't list still renders."""
    item_id = await _seed(sessionmaker_for_test, numbers=(1, 2, 4))
    response = await _get(
        sessionmaker_for_test, f"/api/public/items/{item_id}/issues/3"
    )
    assert response.status_code == 200
    page = response.json()
    assert page["state"] == "owned"
    assert page["description"] == []
    assert page["name"] is None
    assert page["cover_url"] is None
    assert page["large_url"] is None
    assert page["store_date"] is None


async def test_issue_page_404s(sessionmaker_for_test):
    item_id = await _seed(sessionmaker_for_test)
    private = await _seed(sessionmaker_for_test, _series(is_public=False))
    game = await _seed(
        sessionmaker_for_test,
        Item(id=uuid.uuid4(), type=ItemType.GAME, title="G", is_public=True,
             status=ItemStatus.BACKLOG),
    )  # fmt: skip
    paths = [
        f"/api/public/items/{item_id}/issues/999",
        f"/api/public/items/{item_id}/issues/10",
        f"/api/public/items/{item_id}/issues/0",
        f"/api/public/items/{item_id}/issues/10000",
        f"/api/public/items/{item_id}/issues/abc",
        f"/api/public/items/{item_id}/issues/-1",
        f"/api/public/items/{item_id}/issues/12345",
        f"/api/public/items/{item_id}/issues/{'9' * 5000}",
        f"/api/public/items/{private}/issues/1",
        f"/api/public/items/{private}/issues",
        f"/api/public/items/{private}/editions/ed-5-6",
        f"/api/public/items/{game}/issues/1",
        f"/api/public/items/{game}/issues",
        f"/api/public/items/{uuid.uuid4()}/issues/1",
        f"/api/public/items/{uuid.uuid4()}/issues",
        f"/api/public/items/{item_id}/editions/ed-1-2",
    ]
    for path in paths:
        assert (await _get(sessionmaker_for_test, path)).status_code == 404, path


async def test_edition_page_prev_next_and_inside(sessionmaker_for_test):
    item_id = await _seed(sessionmaker_for_test)
    first = (
        await _get(
            sessionmaker_for_test, f"/api/public/items/{item_id}/editions/ed-5-6"
        )
    ).json()
    assert set(first) == EDITION_FIELDS
    assert (first["kind"], first["label"]) == ("Trade paperback", "Volume Two")
    assert (first["from_issue"], first["to_issue"]) == (5, 6)
    assert first["cover_url"] == "https://cv.test/m5.jpg"
    assert first["large_url"] == "https://cv.test/l5.jpg"
    assert first["description"] == []
    assert first["state"] == "owned"
    assert (first["read"], first["read_to"]) == ("not-yet", None)
    assert [(n["number"], n["state"]) for n in first["inside"]] == [
        (5, "owned"),
        (6, "owned"),
    ]
    assert first["prev"] is None
    assert first["next"] == {"slug": "ed-5-6-2", "label": "Deluxe", "number": None}
    assert first["source_url"] == CV_URL
    last = (
        await _get(
            sessionmaker_for_test, f"/api/public/items/{item_id}/editions/ed-5-6-2"
        )
    ).json()
    assert last["prev"] == {"slug": "ed-5-6", "label": "Volume Two"}
    # After the last edition: the first issue after it.
    assert last["next"] == {"slug": None, "label": None, "number": 7}
    assert COMIC_FORBIDDEN.isdisjoint(set(_keys(first)) | set(_keys(last)))


async def test_edition_read_states_and_linked_description(sessionmaker_for_test):
    item = _series(
        read_to=5,
        editions=[
            {
                "kind": "TPB",
                "label": "V",
                "from": 5,
                "to": 8,
                "cv_id": 4,
                "cover_url": "https://cv.test/e.jpg",
                "large_url": "https://cv.test/E.jpg",
                "description": ["Collects it."],
            },
        ],  # fmt: skip
    )
    item_id = await _seed(sessionmaker_for_test, item)
    body = (
        await _get(
            sessionmaker_for_test, f"/api/public/items/{item_id}/editions/ed-5-8"
        )
    ).json()
    assert (body["read"], body["read_to"], body["state"]) == ("to", 5, "owned")
    assert body["description"] == ["Collects it."]
    assert body["cover_url"] == "https://cv.test/e.jpg"
    async with sessionmaker_for_test() as session:
        row = (await session.execute(select(Item))).scalars().first()
        row.read_to = 8
        await session.commit()
    body = (
        await _get(
            sessionmaker_for_test, f"/api/public/items/{item_id}/editions/ed-5-8"
        )
    ).json()
    assert (body["read"], body["read_to"], body["state"]) == ("all", 8, "read")


async def test_a_skip_changes_no_issue_body(sessionmaker_for_test):
    """Skipping #7 changes neither the wall nor any issue or edition page."""
    item_id = await _seed(sessionmaker_for_test)
    paths = [
        f"/api/public/items/{item_id}/issues",
        f"/api/public/items/{item_id}/issues/6",
        f"/api/public/items/{item_id}/issues/7",
        f"/api/public/items/{item_id}/issues/8",
        f"/api/public/items/{item_id}/issues/9",
        f"/api/public/items/{item_id}/editions/ed-5-6",
        f"/api/public/items/{item_id}/editions/ed-5-6-2",
    ]

    async def bodies():
        out = []
        for path in paths:
            response = await _get(sessionmaker_for_test, path)
            assert response.status_code == 200, path
            out.append(response.content)
        return out

    before = await bodies()
    async with sessionmaker_for_test() as session:
        row = (await session.execute(select(Item))).scalar_one()
        row.issues_skipped = "7, 8"
        await session.commit()
    assert await bodies() == before


INDEX_FIELDS = {"item_id", "series_title", "issues", "editions"}
INDEX_ISSUE_FIELDS = {"number", "name", "cover_url"}
INDEX_EDITION_FIELDS = {"slug", "label", "cover_url"}


async def test_the_index_models_publish_exactly_these_fields():
    assert set(PublicComicIndex.model_fields) == INDEX_FIELDS
    assert set(PublicComicIndexIssue.model_fields) == INDEX_ISSUE_FIELDS
    assert set(PublicComicIndexEdition.model_fields) == INDEX_EDITION_FIELDS


async def test_the_index_lists_public_series_with_pages_only(sessionmaker_for_test):
    """Prerender's feed: one row per public series, the numbers that have a
    page (1..released and the next dated issue), no state, no skips."""
    item_id = await _seed(sessionmaker_for_test)
    await _seed(sessionmaker_for_test, _series(is_public=False, title="Hidden"))
    await _seed(
        sessionmaker_for_test,
        Item(id=uuid.uuid4(), type=ItemType.GAME, title="G", is_public=True,
             status=ItemStatus.BACKLOG),
    )  # fmt: skip
    response = await _get(sessionmaker_for_test, "/api/public/comic-issues")
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    row = body[0]
    assert set(row) == INDEX_FIELDS
    assert row["item_id"] == str(item_id)
    assert row["series_title"] == "Saga"
    # released is 8 and #9 is dated ahead; a skip (#8) is still a page.
    assert [i["number"] for i in row["issues"]] == list(range(1, 10))
    assert all(set(i) == INDEX_ISSUE_FIELDS for i in row["issues"])
    assert row["issues"][0] == {
        "number": 1, "name": "Issue 1", "cover_url": "https://cv.test/m1.jpg",
    }  # fmt: skip
    # No stored row for #8 and #9: a page with no name or cover.
    assert row["issues"][7] == {"number": 8, "name": None, "cover_url": None}
    assert [e["slug"] for e in row["editions"]] == ["ed-5-6", "ed-5-6-2"]
    assert all(set(e) == INDEX_EDITION_FIELDS for e in row["editions"])
    assert row["editions"][0]["label"] == "Volume Two"
    assert row["editions"][0]["cover_url"] == "https://cv.test/m5.jpg"
    assert COMIC_FORBIDDEN.isdisjoint(set(_keys(body)))


async def test_the_index_matches_the_issue_route_and_ignores_skips(
    sessionmaker_for_test,
):
    item_id = await _seed(sessionmaker_for_test)
    before = (await _get(sessionmaker_for_test, "/api/public/comic-issues")).content
    async with sessionmaker_for_test() as session:
        row = (await session.execute(select(Item))).scalar_one()
        row.issues_skipped = "7, 8"
        await session.commit()
    after = (await _get(sessionmaker_for_test, "/api/public/comic-issues")).content
    assert after == before
    for number in (1, 9):
        path = f"/api/public/items/{item_id}/issues/{number}"
        assert (await _get(sessionmaker_for_test, path)).status_code == 200
    path = f"/api/public/items/{item_id}/issues/10"
    assert (await _get(sessionmaker_for_test, path)).status_code == 404
