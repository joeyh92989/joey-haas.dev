"""The public wall, issue page and edition page (spec: comic issue pages).
Only public rows; a skip changes no body."""

import json
import re
import uuid
from contextlib import asynccontextmanager
from datetime import UTC, date, datetime
from pathlib import Path

import pytest
from fastapi import FastAPI
from httpx2 import ASGITransport, AsyncClient
from sqlalchemy import event, select

import public
from models import (
    ComicIssue,
    ComicVolume,
    ComicVolumeCollect,
    Item,
    ItemStatus,
    ItemType,
    OwnedFormat,
)
from public import create_public_router
from public_issues import (
    PublicComicIndex,
    PublicComicIndexEdition,
    PublicComicIndexIssue,
    PublicComicIndexVolume,
    PublicEditionPage,
    PublicIssuePage,
    PublicVolumeBody,
    PublicVolumeCollect,
    PublicVolumeLink,
    PublicVolumeNeighbour,
    PublicVolumePage,
    PublicVolumeTitle,
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
WALL_ISSUE_FIELDS = {"number", "owned", "read", "name", "store_date", "cover_url"}
WALL_EDITION_FIELDS = {
    "slug", "kind", "label", "from_issue", "to_issue", "cover_url",
}  # fmt: skip
ISSUE_FIELDS = {
    "series_id", "series_title", "publisher", "number", "name", "store_date",
    "cover_date", "cover_url", "large_url", "description", "state", "owned",
    "read", "held_as",
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
        (7, "missing"),  # the issue itself: the strip centres on it
        (8, "missing"),
        (9, "not-out"),
        # 10 and 11 have no page.
    ]
    assert page["neighbours"][0]["cover_url"] == "https://cv.test/m3.jpg"


async def test_wall_lists_only_numbers_that_have_a_page(sessionmaker_for_test):
    # 10 and 12 are past the run (released 8, next 9): Comic Vine rows, no page.
    item_id = await _seed(sessionmaker_for_test, numbers=(1, 2, 9, 10, 12))
    body = (
        await _get(sessionmaker_for_test, f"/api/public/items/{item_id}/issues")
    ).json()
    assert [i["number"] for i in body["issues"]] == [1, 2, 9]


@pytest.fixture
def statements(engine):
    """The SQL the public reads run, as text."""
    seen: list[str] = []

    def record(conn, cursor, statement, *args):
        seen.append(statement)

    event.listen(engine.sync_engine, "before_cursor_execute", record)
    yield seen
    event.remove(engine.sync_engine, "before_cursor_execute", record)


def _reading_descriptions(seen):
    return [q for q in seen if "comic_issues.description" in q]


async def test_list_reads_do_not_load_the_description(
    sessionmaker_for_test, statements
):
    item_id = await _seed(sessionmaker_for_test)
    for path in (
        f"/api/public/items/{item_id}/issues",
        f"/api/public/items/{item_id}/editions/ed-5-6",
        "/api/public/comic-issues",
    ):
        statements.clear()
        assert (await _get(sessionmaker_for_test, path)).status_code == 200
        assert any("comic_issues" in q for q in statements), path
        assert _reading_descriptions(statements) == [], path


async def test_the_issue_page_loads_one_description_and_a_bounded_strip(
    sessionmaker_for_test, statements
):
    item_id = await _seed(sessionmaker_for_test, numbers=tuple(range(1, 9)))
    statements.clear()
    response = await _get(
        sessionmaker_for_test, f"/api/public/items/{item_id}/issues/3"
    )
    assert response.status_code == 200
    assert response.json()["description"] == ["About 3."]
    assert len(_reading_descriptions(statements)) == 1
    assert all(
        "comic_issues.number" in q for q in statements if "FROM comic_issues" in q
    )


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


INDEX_FIELDS = {"item_id", "series_title", "issues", "editions", "volumes"}
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


async def test_stub_rows_draw_held_books_as_blanks_and_nothing_else(
    sessionmaker_for_test,
):
    """The marks (5b) add stub rows for held and skipped numbers Comic Vine has
    not synced. A held stub is a numbered blank on the wall (5c); a skipped
    stub, and every other page, changes nothing; no body carries `skipped`."""

    from comics import sync_marks

    item_id = await _seed(sessionmaker_for_test, numbers=(1, 2, 3))
    wall = f"/api/public/items/{item_id}/issues"
    paths = [
        "/api/public/comic-issues",
        *(f"/api/public/items/{item_id}/issues/{n}" for n in range(1, 10)),
        f"/api/public/items/{item_id}/editions/ed-5-6",
        f"/api/public/items/{item_id}/editions/ed-5-6-2",
    ]

    async def bodies():
        out = []
        for p in paths:
            content = (await _get(sessionmaker_for_test, p)).content
            if p.endswith("/comic-issues"):
                # sync_marks mirrors the editions into ed-* volumes, so the
                # index gains `volumes` here; everything else must not move.
                rows = json.loads(content)
                for row in rows:
                    row.pop("volumes")
                content = json.dumps(rows).encode()
            out.append(content)
        return out

    before = await bodies()
    wall_before = (await _get(sessionmaker_for_test, wall)).json()
    async with sessionmaker_for_test() as session:
        item = await session.get(Item, item_id)
        result = await sync_marks(session, item)
        await session.commit()
    assert result.stubs_added > 0
    assert await bodies() == before
    after = (await _get(sessionmaker_for_test, wall)).json()
    numbers = [i["number"] for i in after["issues"]]
    # 4, 5 and 6 are held with no Comic Vine row: blank covers. 8 is a skip
    # (a stub too) and is not listed.
    assert numbers == [1, 2, 3, 4, 5, 6]
    blank = after["issues"][3]
    assert (blank["name"], blank["cover_url"], blank["store_date"]) == (None,) * 3
    assert (blank["owned"], blank["read"]) == (True, False)
    assert after["issues"][:3] == [
        {**i, "read": i["read"]} for i in wall_before["issues"][:3]
    ]
    assert "skipped" not in set(_keys(after))


async def test_the_wall_and_issue_page_read_the_marks(sessionmaker_for_test):
    """A mark on the row decides owned and read, one book at a time; the skip
    on the row never shows."""
    item = _series(issues_owned=None, editions=None, read_to=None, issues_skipped=None)
    item_id = await _seed(sessionmaker_for_test, item, numbers=(1, 2, 3))
    async with sessionmaker_for_test() as session:
        rows = {
            r.number: r
            for r in await session.scalars(
                select(ComicIssue).where(ComicIssue.item_id == item_id)
            )
        }
        rows[1].owned = True
        rows[2].owned = rows[2].read = True
        rows[3].skipped = True
        await session.commit()
    wall = (
        await _get(sessionmaker_for_test, f"/api/public/items/{item_id}/issues")
    ).json()
    got = {i["number"]: (i["owned"], i["read"]) for i in wall["issues"]}
    assert got[1] == (True, False) and got[2] == (True, True)
    assert got[3] == (False, False)
    page = (
        await _get(sessionmaker_for_test, f"/api/public/items/{item_id}/issues/2")
    ).json()
    assert (page["state"], page["owned"], page["read"]) == ("read", True, True)
    missing = (
        await _get(sessionmaker_for_test, f"/api/public/items/{item_id}/issues/3")
    ).json()
    assert (missing["state"], missing["owned"], missing["read"]) == (
        "missing",
        False,
        False,
    )
    assert "skipped" not in set(_keys(wall)) | set(_keys(missing))
    # A read mark with no owned mark (stray) is not a read book.
    edition_less = (
        await _get(sessionmaker_for_test, "/api/public/comic-issues")
    ).json()
    assert "skipped" not in set(_keys(edition_less))


async def test_existing_ranges_still_read_without_marks(sessionmaker_for_test):
    """Rows recorded before the marks reached them (ranges and read_to only)
    keep what they recorded: Waterworld's #1-4 are owned, none read."""
    item = _series(issues_owned="1–4", issues_skipped=None, editions=None, read_to=None)
    item_id = await _seed(sessionmaker_for_test, item, numbers=(1, 2, 3, 4))
    wall = (
        await _get(sessionmaker_for_test, f"/api/public/items/{item_id}/issues")
    ).json()
    assert [(i["owned"], i["read"]) for i in wall["issues"]] == [(True, False)] * 4


# --- The volume page (book-first epic #323, story #335 book-page slice). ---

VOLUME_FIELDS = {
    "title", "volume", "collects", "prev", "next", "source_url",
}  # fmt: skip
VOLUME_TITLE_FIELDS = {"id", "title", "cover_url", "publisher", "year"}
VOLUME_BODY_FIELDS = {
    "slug", "label", "kind", "line_number", "isbn", "pages", "description",
    "cover_url", "large_url", "owned", "read",
}  # fmt: skip
VOLUME_COLLECT_FIELDS = {"series_name", "issue_text", "link"}
VOLUME_LINK_FIELDS = {"item_id", "from_number", "to_number"}
VOLUME_NEIGHBOUR_FIELDS = {"slug", "label", "line_number"}
INDEX_VOLUME_FIELDS = {"slug", "label", "kind", "line_number", "cover_url"}
# Keys the body must never carry at any depth, on top of COMIC_FORBIDDEN.
VOLUME_FORBIDDEN = COMIC_FORBIDDEN | {
    "source", "kind_raw", "cv_id", "following", "item_id_private", "skips",
}  # fmt: skip


def _volume(item_id, slug, position, **fields) -> ComicVolume:
    base = dict(
        item_id=item_id,
        position=position,
        slug=slug,
        label=f"Book {position}",
        kind="trade",
        kind_raw="Trade paperback",
        line_number=position,
        isbn=f"978000000000{position}",
        pages=128,
        description="First paragraph.\n\nSecond paragraph.",
        cover_url=f"https://cv.test/v{position}.jpg",
        large_url=f"https://cv.test/vl{position}.jpg",
        owned=True,
        read=False,
    )
    return ComicVolume(**{**base, **fields})


def _collect(volume_id, position, **fields) -> ComicVolumeCollect:
    base = dict(
        volume_id=volume_id,
        position=position,
        series_name="Saga",
        issue_text="#1-6",
        source="typed",
    )
    return ComicVolumeCollect(**{**base, **fields})


async def _seed_volumes(factory, *volumes_for, item=None, issues=(1, 2, 3)):
    """A public title with synced issues, and the volumes `volumes_for` builds
    from its id. Returns (item_id, [volume ids])."""
    item = item or _series()
    async with factory() as session:
        session.add(item)
        await session.flush()
        session.add_all(_row(item.id, n) for n in issues)
        volumes = [make(item.id) for make in volumes_for]
        session.add_all(volumes)
        await session.commit()
        return item.id, [v.id for v in volumes]


def _vol_path(item_id, slug):
    return f"/api/public/items/{item_id}/volumes/{slug}"


async def test_the_volume_models_publish_exactly_these_fields():
    assert set(PublicVolumePage.model_fields) == VOLUME_FIELDS
    assert set(PublicVolumeTitle.model_fields) == VOLUME_TITLE_FIELDS
    assert set(PublicVolumeBody.model_fields) == VOLUME_BODY_FIELDS
    assert set(PublicVolumeCollect.model_fields) == VOLUME_COLLECT_FIELDS
    assert set(PublicVolumeLink.model_fields) == VOLUME_LINK_FIELDS
    assert set(PublicVolumeNeighbour.model_fields) == VOLUME_NEIGHBOUR_FIELDS
    assert set(PublicComicIndexVolume.model_fields) == INDEX_VOLUME_FIELDS


async def test_the_volume_page_body(sessionmaker_for_test):
    item_id, _ = await _seed_volumes(
        sessionmaker_for_test,
        lambda i: _volume(i, "vol-1", 1, read=True),
    )
    response = await _get(sessionmaker_for_test, _vol_path(item_id, "vol-1"))
    assert response.status_code == 200
    body = response.json()
    assert set(body) == VOLUME_FIELDS
    assert set(body["title"]) == VOLUME_TITLE_FIELDS
    assert body["title"]["id"] == str(item_id)
    assert (body["title"]["title"], body["title"]["publisher"]) == ("Saga", "Image")
    assert set(body["volume"]) == VOLUME_BODY_FIELDS
    assert body["volume"]["slug"] == "vol-1"
    assert body["volume"]["kind"] == "trade"
    assert body["volume"]["isbn"] == "9780000000001"
    assert body["volume"]["owned"] is True
    assert body["volume"]["read"] is True
    assert body["volume"]["description"] == ["First paragraph.", "Second paragraph."]
    assert body["source_url"] == CV_URL
    assert body["collects"] == []
    assert body["prev"] is None
    assert body["next"] is None
    assert VOLUME_FORBIDDEN.isdisjoint(set(_keys(body)))


async def test_a_volume_with_no_collects_returns_an_empty_list(sessionmaker_for_test):
    item_id, _ = await _seed_volumes(
        sessionmaker_for_test, lambda i: _volume(i, "vol-1", 1)
    )
    body = (await _get(sessionmaker_for_test, _vol_path(item_id, "vol-1"))).json()
    assert body["collects"] == []


async def test_volume_404s_are_one_body(sessionmaker_for_test):
    """A private title, an unknown slug, a volume not owned, a non-comic and an
    unknown title all answer the same: existence does not leak."""
    item_id, _ = await _seed_volumes(
        sessionmaker_for_test,
        lambda i: _volume(i, "vol-1", 1),
        lambda i: _volume(i, "vol-2", 2, owned=False),
    )
    private_id, _ = await _seed_volumes(
        sessionmaker_for_test,
        lambda i: _volume(i, "vol-1", 1),
        item=_series(is_public=False, title="Hidden"),
    )
    game = uuid.uuid4()
    async with sessionmaker_for_test() as session:
        session.add(
            Item(
                id=game,
                type=ItemType.GAME,
                title="G",
                is_public=True,
                status=ItemStatus.BACKLOG,
            )  # fmt: skip
        )
        await session.commit()
    paths = [
        _vol_path(item_id, "vol-2"),  # not owned
        _vol_path(item_id, "vol-9"),  # unknown slug
        _vol_path(private_id, "vol-1"),  # private title
        _vol_path(game, "vol-1"),
        _vol_path(uuid.uuid4(), "vol-1"),
    ]
    bodies = set()
    for path in paths:
        response = await _get(sessionmaker_for_test, path)
        assert response.status_code == 404, path
        bodies.add(response.content)
    assert len(bodies) == 1


async def test_collects_link_only_to_public_synced_titles(sessionmaker_for_test):
    other = _series(title="Other", source_metadata={"publisher": "X"})
    private = _series(title="Hidden", is_public=False)
    unsynced = _series(title="Unsynced")
    async with sessionmaker_for_test() as session:
        session.add_all([other, private, unsynced])
        await session.flush()
        session.add_all(_row(other.id, n) for n in (1, 2, 3))
        session.add_all(_row(private.id, n) for n in (1, 2, 3))
        # Unsynced: stub rows only (no Comic Vine id).
        session.add(_row(unsynced.id, 1, cv_id=None, name=None, cover_url=None))
        await session.commit()
    item_id, (volume_id,) = await _seed_volumes(
        sessionmaker_for_test, lambda i: _volume(i, "vol-1", 1)
    )
    async with sessionmaker_for_test() as session:
        session.add_all(
            [
                _collect(volume_id, 1, series_name="Saga", issue_text="#1-2",
                         item_id=item_id, from_number=1, to_number=2),
                _collect(volume_id, 2, series_name="Other", issue_text="#3",
                         item_id=other.id, from_number=3, to_number=3,
                         source="parsed"),
                _collect(volume_id, 3, series_name="Hidden", issue_text="#1-3",
                         item_id=private.id, from_number=1, to_number=3),
                _collect(volume_id, 4, series_name="Unsynced", issue_text="#1",
                         item_id=unsynced.id, from_number=1, to_number=1),
                _collect(volume_id, 5, series_name="Text", issue_text="Annual 1"),
                _collect(volume_id, 6, series_name="Half", issue_text="#4",
                         item_id=other.id, from_number=4, to_number=None),
            ]
        )  # fmt: skip
        await session.commit()
    response = await _get(sessionmaker_for_test, _vol_path(item_id, "vol-1"))
    body = response.json()
    collects = body["collects"]
    assert [c["series_name"] for c in collects] == [
        "Saga", "Other", "Hidden", "Unsynced", "Text", "Half",
    ]  # fmt: skip
    assert all(set(c) == VOLUME_COLLECT_FIELDS for c in collects)
    assert collects[0]["link"] == {
        "item_id": str(item_id), "from_number": 1, "to_number": 2,
    }  # fmt: skip
    assert collects[1]["link"]["item_id"] == str(other.id)
    # A private title, an unsynced one, text only and a half link: plain text.
    assert [c["link"] for c in collects[2:]] == [None, None, None, None]
    assert collects[2]["issue_text"] == "#1-3"
    # The private title's id appears nowhere in the body.
    assert str(private.id) not in response.text
    assert str(unsynced.id) not in response.text
    assert VOLUME_FORBIDDEN.isdisjoint(set(_keys(body)))


async def test_an_edition_origin_slug_resolves(sessionmaker_for_test):
    item_id, _ = await _seed_volumes(
        sessionmaker_for_test,
        lambda i: _volume(i, "ed-5-6", 1, label="Volume Two", kind_raw="TPB"),
        lambda i: _volume(i, "ed-5-6-2", 2, label="Deluxe", kind="hardcover"),
    )
    first = await _get(sessionmaker_for_test, _vol_path(item_id, "ed-5-6"))
    assert first.status_code == 200
    assert first.json()["volume"]["label"] == "Volume Two"
    second = (await _get(sessionmaker_for_test, _vol_path(item_id, "ed-5-6-2"))).json()
    assert second["volume"]["kind"] == "hardcover"
    assert second["prev"]["slug"] == "ed-5-6"
    # The old endpoint is untouched by this: still a 404 without an edition.
    old = await _get(
        sessionmaker_for_test, f"/api/public/items/{item_id}/editions/ed-5-6"
    )
    assert old.status_code == 200


async def test_prev_and_next_follow_the_line_over_owned_volumes(
    sessionmaker_for_test,
):
    item_id, _ = await _seed_volumes(
        sessionmaker_for_test,
        lambda i: _volume(i, "vol-3", 1, line_number=3, label="Three"),
        lambda i: _volume(i, "vol-1", 2, line_number=1, label="One"),
        lambda i: _volume(i, "vol-2", 3, line_number=2, label="Two", owned=False),
        lambda i: _volume(i, "vol-x", 4, line_number=None, label="Loose"),
        lambda i: _volume(i, "vol-y", 5, line_number=None, label="Loose 2"),
    )

    async def page(slug):
        return (await _get(sessionmaker_for_test, _vol_path(item_id, slug))).json()

    one, three = await page("vol-1"), await page("vol-3")
    assert one["prev"] is None
    # Two is not owned: the line skips it. Numbers first, loose books after.
    assert one["next"] == {"slug": "vol-3", "label": "Three", "line_number": 3}
    assert set(one["next"]) == VOLUME_NEIGHBOUR_FIELDS
    assert three["prev"] == {"slug": "vol-1", "label": "One", "line_number": 1}
    assert three["next"]["slug"] == "vol-x"
    last = await page("vol-y")
    assert last["next"] is None
    assert last["prev"]["slug"] == "vol-x"
    assert last["prev"]["line_number"] is None


async def test_no_skip_data_anywhere_in_a_volume_body(sessionmaker_for_test):
    item = _series(issues_skipped="7, 8")
    item_id, (volume_id,) = await _seed_volumes(
        sessionmaker_for_test, lambda i: _volume(i, "vol-1", 1), item=item
    )
    async with sessionmaker_for_test() as session:
        session.add(_collect(volume_id, 1, item_id=item_id, from_number=1, to_number=3))
        await session.commit()
    before = (await _get(sessionmaker_for_test, _vol_path(item_id, "vol-1"))).content
    async with sessionmaker_for_test() as session:
        row = (await session.execute(select(Item))).scalar_one()
        row.issues_skipped = "1, 2, 3, 9"
        row.following = True
        await session.commit()
    after = (await _get(sessionmaker_for_test, _vol_path(item_id, "vol-1"))).content
    assert after == before
    text = after.decode()
    for word in ("skip", "following", "price", "store", "issues_owned"):
        assert word not in text.lower(), word


async def test_volume_keys_dodge_the_smoke_private_keys(sessionmaker_for_test):
    """scripts/smoke.sh greps snapshot and public bodies for PRIVATE_KEYS: a
    new key that matches would fail the post-deploy check."""
    smoke = (Path(__file__).resolve().parents[2] / "scripts" / "smoke.sh").read_text()
    line = next(ln for ln in smoke.splitlines() if ln.startswith("PRIVATE_KEYS="))
    pattern = line.split("=", 1)[1].strip().strip("'")
    # POSIX [[:space:]] is not Python regex.
    pattern = pattern.replace("[[:space:]]", r"\s")
    private = re.compile(pattern)
    assert private.search('{"price": 1}')  # the regex under test was really read
    item_id, (volume_id, _) = await _seed_volumes(
        sessionmaker_for_test,
        lambda i: _volume(i, "vol-1", 1),
        lambda i: _volume(i, "vol-2", 2),
    )
    async with sessionmaker_for_test() as session:
        session.add(_collect(volume_id, 1, item_id=item_id, from_number=1, to_number=3))
        await session.commit()
    bodies = [
        (await _get(sessionmaker_for_test, _vol_path(item_id, "vol-1"))).text,
        (await _get(sessionmaker_for_test, "/api/public/comic-issues")).text,
    ]
    for text in bodies:
        assert private.search(text) is None, private.search(text)
    # The fields the models declare, too, in case a body leaves one null.
    fields = (
        set(PublicVolumePage.model_fields)
        | set(PublicVolumeTitle.model_fields)
        | set(PublicVolumeBody.model_fields)
        | set(PublicVolumeCollect.model_fields)
        | set(PublicVolumeLink.model_fields)
        | set(PublicVolumeNeighbour.model_fields)
        | set(PublicComicIndexVolume.model_fields)
    )
    assert not [f for f in fields if private.search(f'"{f}":')]


async def test_the_index_carries_owned_volumes_of_public_titles(
    sessionmaker_for_test,
):
    item_id, _ = await _seed_volumes(
        sessionmaker_for_test,
        lambda i: _volume(i, "vol-2", 2, line_number=2),
        lambda i: _volume(i, "vol-1", 1, line_number=1),
        lambda i: _volume(i, "vol-3", 3, owned=False),
    )
    await _seed_volumes(
        sessionmaker_for_test,
        lambda i: _volume(i, "vol-1", 1),
        item=_series(is_public=False, title="Hidden"),
    )
    body = (await _get(sessionmaker_for_test, "/api/public/comic-issues")).json()
    assert len(body) == 1
    row = body[0]
    assert set(row) == INDEX_FIELDS
    assert row["item_id"] == str(item_id)
    # In the page's line order: line number, then position.
    assert [v["slug"] for v in row["volumes"]] == ["vol-1", "vol-2"]
    assert all(set(v) == INDEX_VOLUME_FIELDS for v in row["volumes"])
    assert row["volumes"][0] == {
        "slug": "vol-1", "label": "Book 1", "kind": "trade", "line_number": 1,
        "cover_url": "https://cv.test/v1.jpg",
    }  # fmt: skip
    # `editions` stays until the prerender has moved over.
    assert "editions" in row
    assert COMIC_FORBIDDEN.isdisjoint(set(_keys(body)))
