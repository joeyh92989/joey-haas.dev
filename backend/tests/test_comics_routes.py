"""The comics admin routes against a fake ComicVine.

The fake answers search and volume reads from the recorded fixtures (through
the real adapter's parsers) and issues from hand-built lists in the snapshot
shape, so every route runs its real writes against the test database.
"""

import asyncio
import json
import uuid
from contextlib import asynccontextmanager
from datetime import date
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from httpx2 import ASGITransport, AsyncClient
from sqlalchemy import select
from starlette.middleware.sessions import SessionMiddleware

import comics_routes
from comics_routes import create_comics_router
from items import create_items_router
from models import Item, ItemStatus, ItemType, OwnedFormat
from sources.base import SourceError
from sources.comicvine import ComicVineSource

pytestmark = pytest.mark.asyncio

FIXTURES = Path(__file__).parent / "fixtures"
# A Friday; its week starts on Wednesday 4 November.
TODAY = date(2026, 11, 6)
VOLUME = "4363"


def _issue(number: str, store_date: str | None, cover_date: str | None = None):
    return {
        "number": number,
        "name": None,
        "store_date": store_date,
        "cover_date": cover_date,
        "cover_url": f"https://cv.example/{number}.jpg",
    }


class FakeComicVine:
    source_name = "comicvine"

    def __init__(self, issues: dict[str, list[dict]] | None = None):
        # Parsing only: the key is never used, since nothing calls _get.
        self._parser = ComicVineSource(SimpleNamespace(comicvine_api_key=None))
        self.issues = issues or {}
        self.calls: list[tuple[str, str]] = []
        self.fail: set[str] = set()

    def configured(self) -> bool:
        return True

    async def search_volumes(self, query: str):
        self.calls.append(("search", query))
        payload = json.loads((FIXTURES / "comicvine_search.json").read_text())
        return self._parser._parse_volumes(payload)

    async def fetch(self, external_id: str):
        self.calls.append(("fetch", external_id))
        payload = json.loads((FIXTURES / "comicvine_volume.json").read_text())
        detail = self._parser._parse_detail(payload)
        return type(detail)(**{**detail.__dict__, "external_id": external_id})

    async def fetch_issues(self, external_id: str):
        self.calls.append(("issues", external_id))
        if external_id in self.fail:
            raise SourceError(self.source_name, "the /issues call failed")
        return list(self.issues.get(external_id, []))


@pytest.fixture(autouse=True)
def _frozen_today(monkeypatch):
    monkeypatch.setattr(comics_routes, "_today", lambda: TODAY)


@asynccontextmanager
async def client_for(factory, source: FakeComicVine, lock=None):
    app = FastAPI()
    registry = {ItemType.COMIC: source}
    app.include_router(create_comics_router(factory, registry, lock))
    app.include_router(create_items_router(factory, registry))

    @app.middleware("http")
    async def _sign_in(request, call_next):
        request.session["user"] = {"sub": "1", "email": "admin@example.com"}
        return await call_next(request)

    app.add_middleware(SessionMiddleware, secret_key="test-secret", https_only=False)
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        yield client


async def _seed(factory, **fields) -> uuid.UUID:
    base = {
        "type": ItemType.COMIC,
        "title": "Saga",
        "status": ItemStatus.BACKLOG,
        "external_source": "comicvine",
        "external_id": VOLUME,
    }
    item = Item(**(base | fields))
    async with factory() as session:
        session.add(item)
        await session.commit()
        return item.id


async def _row(factory, item_id) -> Item:
    async with factory() as session:
        return await session.get(Item, item_id)


SAGA_ISSUES = [
    _issue("68", "2026-11-25"),
    _issue("67", "2026-11-04"),
    _issue("66", "2026-10-07"),
]


async def test_follow_creates_a_private_followed_only_row(sessionmaker_for_test):
    source = FakeComicVine({VOLUME: SAGA_ISSUES})
    async with client_for(sessionmaker_for_test, source) as client:
        response = await client.post("/api/comics/follow", json={"external_id": VOLUME})

    assert response.status_code == 200, response.text
    body = response.json()
    row = await _row(sessionmaker_for_test, uuid.UUID(body["item_id"]))
    assert row.following is True
    assert row.is_public is False
    assert row.owned_format == OwnedFormat.NONE
    assert row.source_metadata["fetched_on"] == "2026-11-06"
    assert [i["number"] for i in row.source_metadata["issues"]] == ["68", "67", "66"]


async def test_follow_sets_the_flag_on_an_existing_row(sessionmaker_for_test):
    item_id = await _seed(
        sessionmaker_for_test, owned_format=OwnedFormat.PHYSICAL, issues_owned="1-54"
    )
    source = FakeComicVine()
    async with client_for(sessionmaker_for_test, source) as client:
        response = await client.post("/api/comics/follow", json={"external_id": VOLUME})

    assert response.json()["item_id"] == str(item_id)
    assert (await _row(sessionmaker_for_test, item_id)).following is True
    assert source.calls == []


async def test_unfollow_removes_a_row_follow_made(sessionmaker_for_test):
    item_id = await _seed(
        sessionmaker_for_test, owned_format=OwnedFormat.NONE, following=True
    )
    async with client_for(sessionmaker_for_test, FakeComicVine()) as client:
        response = await client.post(
            "/api/comics/unfollow", json={"external_id": VOLUME}
        )

    assert response.json() == {"item_id": None, "following": False}
    assert await _row(sessionmaker_for_test, item_id) is None


async def test_unfollow_keeps_an_owned_row(sessionmaker_for_test):
    item_id = await _seed(
        sessionmaker_for_test,
        owned_format=OwnedFormat.PHYSICAL,
        issues_owned="1-3",
        following=True,
    )
    async with client_for(sessionmaker_for_test, FakeComicVine()) as client:
        await client.post("/api/comics/unfollow", json={"external_id": VOLUME})

    row = await _row(sessionmaker_for_test, item_id)
    assert row.following is False
    assert row.issues_owned == "1-3"


async def test_want_creates_a_public_want(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test, FakeComicVine()) as client:
        response = await client.post("/api/comics/want", json={"external_id": VOLUME})

    assert response.status_code == 201, response.text
    row = await _row(sessionmaker_for_test, uuid.UUID(response.json()["item_id"]))
    assert row.is_public is True
    assert row.owned_format == OwnedFormat.NONE
    assert row.following is False


async def test_want_on_an_owned_series_is_refused(sessionmaker_for_test):
    await _seed(sessionmaker_for_test, owned_format=OwnedFormat.PHYSICAL)
    async with client_for(sessionmaker_for_test, FakeComicVine()) as client:
        response = await client.post("/api/comics/want", json={"external_id": VOLUME})

    assert response.status_code == 409


async def test_a_volume_id_must_be_digits(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test, FakeComicVine()) as client:
        response = await client.post(
            "/api/comics/follow", json={"external_id": "1,volume:2"}
        )

    assert response.status_code == 422


async def test_search_marks_what_the_shelf_holds(sessionmaker_for_test):
    payload = json.loads((FIXTURES / "comicvine_search.json").read_text())
    first = str(payload["results"][0]["id"])
    item_id = await _seed(
        sessionmaker_for_test,
        external_id=first,
        owned_format=OwnedFormat.PHYSICAL,
        following=True,
    )
    async with client_for(sessionmaker_for_test, FakeComicVine()) as client:
        response = await client.get("/api/comics/search", params={"q": "Saga"})

    rows = response.json()
    assert rows[0]["external_id"] == first
    assert rows[0]["item_id"] == str(item_id)
    assert rows[0]["in_shelf"] is True and rows[0]["following"] is True
    assert all(row["item_id"] is None for row in rows[1:])
    assert {"publisher", "issue_count", "year"} <= rows[0].keys()


async def test_pull_list_weeks_and_the_undated_note(sessionmaker_for_test):
    await _seed(
        sessionmaker_for_test,
        owned_format=OwnedFormat.PHYSICAL,
        issues_owned="1-66",
        following=True,
        source_metadata={"publisher": "Image", "issue_count": 68}
        | {"issues": SAGA_ISSUES, "released": 67, "fetched_on": "2026-11-05"},
    )
    await _seed(
        sessionmaker_for_test,
        title="Monstress",
        external_id="9",
        owned_format=OwnedFormat.NONE,
        following=True,
        source_metadata={"issues": [_issue("60", None, "2027-01-01")]},
    )
    async with client_for(sessionmaker_for_test, FakeComicVine()) as client:
        body = (await client.get("/api/comics/pull-list")).json()

    assert body["following"] == 2
    assert body["last_refresh"] == "2026-11-05"
    assert [w["start"] for w in body["weeks"]] == [
        "2026-11-04",
        "2026-11-11",
        "2026-11-18",
        "2026-11-25",
    ]
    assert body["weeks"][0]["this_week"] is True
    (this_week,) = body["weeks"][0]["rows"]
    assert (this_week["title"], this_week["number"]) == ("Saga", 67)
    assert this_week["owned_text"] == "1–66"
    assert this_week["publisher"] == "Image"
    assert [r["number"] for r in body["weeks"][3]["rows"]] == [68]
    assert [u["title"] for u in body["undated"]] == ["Monstress"]


async def test_got_it_extends_the_range(sessionmaker_for_test):
    # Spec AC7, checked by re-reading the item.
    item_id = await _seed(
        sessionmaker_for_test,
        owned_format=OwnedFormat.PHYSICAL,
        issues_owned="1-66",
        issues_skipped="67",
        following=True,
    )
    async with client_for(sessionmaker_for_test, FakeComicVine()) as client:
        response = await client.post(f"/api/comics/{item_id}/issues/67/got")
        reread = await client.get(f"/api/items/{item_id}")

    assert response.status_code == 200, response.text
    assert response.json()["comic_run"]["owned_text"] == "1–67"
    assert reread.json()["issues_owned"] == "1–67"
    assert reread.json()["issues_skipped"] is None


async def test_got_it_promotes_a_followed_only_row(sessionmaker_for_test):
    item_id = await _seed(
        sessionmaker_for_test, owned_format=OwnedFormat.NONE, following=True
    )
    async with client_for(sessionmaker_for_test, FakeComicVine()) as client:
        await client.post(f"/api/comics/{item_id}/issues/73/got")

    row = await _row(sessionmaker_for_test, item_id)
    assert row.owned_format == OwnedFormat.PHYSICAL
    assert row.status == ItemStatus.BACKLOG
    assert row.issues_owned == "73"
    assert row.is_public is False


async def test_skip_records_a_gap_and_refuses_an_owned_issue(sessionmaker_for_test):
    item_id = await _seed(
        sessionmaker_for_test, owned_format=OwnedFormat.PHYSICAL, issues_owned="1-5"
    )
    async with client_for(sessionmaker_for_test, FakeComicVine()) as client:
        skipped = await client.post(f"/api/comics/{item_id}/issues/7/skip")
        owned = await client.post(f"/api/comics/{item_id}/issues/3/skip")

    assert skipped.json()["issues_skipped"] == "7"
    assert owned.status_code == 409


async def test_issue_numbers_outside_the_range_are_refused(sessionmaker_for_test):
    item_id = await _seed(sessionmaker_for_test)
    async with client_for(sessionmaker_for_test, FakeComicVine()) as client:
        zero = await client.post(f"/api/comics/{item_id}/issues/0/got")
        huge = await client.post(f"/api/comics/{item_id}/issues/10000/got")

    assert zero.status_code == huge.status_code == 422


async def test_got_it_on_a_game_is_a_404(sessionmaker_for_test):
    item_id = await _seed(sessionmaker_for_test, type=ItemType.GAME, external_id=None)
    async with client_for(sessionmaker_for_test, FakeComicVine()) as client:
        response = await client.post(f"/api/comics/{item_id}/issues/1/got")

    assert response.status_code == 404


async def test_refresh_reads_each_followed_series_once(sessionmaker_for_test):
    saga = await _seed(
        sessionmaker_for_test,
        following=True,
        source_metadata={"issue_count": 68, "publisher": "Image"},
    )
    broken = await _seed(
        sessionmaker_for_test, title="Broken", external_id="77", following=True
    )
    await _seed(sessionmaker_for_test, title="Unfollowed", external_id="88")
    source = FakeComicVine({VOLUME: SAGA_ISSUES})
    source.fail = {"77"}
    async with client_for(sessionmaker_for_test, source) as client:
        body = (await client.post("/api/comics/refresh")).json()

    assert body["ok"] is False
    assert body["refreshed"] == 1
    assert [e["item_id"] for e in body["errors"]] == [str(broken)]
    assert sorted(source.calls) == [("issues", "4363"), ("issues", "77")]
    meta = (await _row(sessionmaker_for_test, saga)).source_metadata
    assert meta["publisher"] == "Image"
    assert meta["released"] == 67
    assert meta["ongoing"] is True


async def test_a_second_refresh_meanwhile_is_a_409(sessionmaker_for_test):
    lock = asyncio.Lock()
    async with client_for(sessionmaker_for_test, FakeComicVine(), lock) as client:
        await lock.acquire()
        try:
            response = await client.post("/api/comics/refresh")
        finally:
            lock.release()

    assert response.status_code == 409


async def test_refresh_one_keeps_the_owners_fields(sessionmaker_for_test):
    item_id = await _seed(
        sessionmaker_for_test,
        title="Saga (my title)",
        owned_format=OwnedFormat.PHYSICAL,
        issues_owned="1-54",
    )
    source = FakeComicVine({VOLUME: SAGA_ISSUES})
    async with client_for(sessionmaker_for_test, source) as client:
        response = await client.post(f"/api/comics/{item_id}/refresh")

    assert response.status_code == 200, response.text
    row = await _row(sessionmaker_for_test, item_id)
    assert row.title == "Saga (my title)"
    assert row.issues_owned == "1-54"
    assert row.source_metadata["fetched_on"] == "2026-11-06"
    assert "publisher" in row.source_metadata


async def test_refresh_metadata_keeps_the_issue_snapshot(sessionmaker_for_test):
    # The generic item refresh replaces source_metadata; for a comic it must
    # carry the issue snapshot over, or the pull list would empty.
    item_id = await _seed(
        sessionmaker_for_test,
        source_metadata={"issues": SAGA_ISSUES, "released": 67, "ongoing": True},
    )
    async with client_for(sessionmaker_for_test, FakeComicVine()) as client:
        response = await client.post(f"/api/items/{item_id}/refresh-metadata")

    assert response.status_code == 200, response.text
    meta = (await _row(sessionmaker_for_test, item_id)).source_metadata
    assert meta["released"] == 67
    assert len(meta["issues"]) == 3


async def test_followed_rows_never_reach_public_wants(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test, FakeComicVine()) as client:
        await client.post("/api/comics/follow", json={"external_id": VOLUME})

    async with sessionmaker_for_test() as session:
        public = (await session.scalars(select(Item).where(Item.is_public))).all()
    assert public == []


async def test_a_relink_drops_the_old_volumes_issues(sessionmaker_for_test):
    item_id = await _seed(
        sessionmaker_for_test,
        source_metadata={
            "publisher": "Image",
            "issues": SAGA_ISSUES,
            "released": 67,
            "ongoing": True,
            "fetched_on": "2026-11-01",
        },
    )
    async with client_for(sessionmaker_for_test, FakeComicVine()) as client:
        response = await client.patch(
            f"/api/items/{item_id}", json={"external_id": "999"}
        )

    assert response.status_code == 200, response.text
    meta = (await _row(sessionmaker_for_test, item_id)).source_metadata
    assert meta == {"publisher": "Image"}


async def test_refresh_skips_a_series_deleted_meanwhile(sessionmaker_for_test):
    gone = await _seed(sessionmaker_for_test, title="Gone", following=True)
    kept = await _seed(
        sessionmaker_for_test, title="Kept", external_id="88", following=True
    )
    factory = sessionmaker_for_test

    class DeletingSource(FakeComicVine):
        async def fetch_issues(self, external_id):
            if external_id == VOLUME:
                async with factory() as other:
                    await other.delete(await other.get(Item, gone))
                    await other.commit()
            return await super().fetch_issues(external_id)

    source = DeletingSource({VOLUME: SAGA_ISSUES, "88": SAGA_ISSUES})
    async with client_for(factory, source) as client:
        response = await client.post("/api/comics/refresh")

    assert response.status_code == 200, response.text
    assert response.json()["refreshed"] == 1
    assert await _row(factory, gone) is None
    assert (await _row(factory, kept)).source_metadata["released"] == 67


async def test_state_reads_a_row_with_no_owned_format():
    """owned_format is nullable (a want row can carry none); the redraw
    state must not raise on it."""
    item = Item(
        type=ItemType.COMIC,
        title="Saga",
        status=ItemStatus.BACKLOG,
        owned_format=None,
        is_public=False,
        following=True,
    )
    assert comics_routes._state(item)["owned_format"] is None
