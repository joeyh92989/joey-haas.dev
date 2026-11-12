"""The add bar's server half: cross-kind search (D5), single adds through
the commit service, and the Closet's Tag again (AC 7, AC 11)."""

from __future__ import annotations

import asyncio
import uuid
from contextlib import asynccontextmanager

import pytest
from fastapi import FastAPI
from httpx2 import ASGITransport, AsyncClient
from sqlalchemy import select
from starlette.middleware.sessions import SessionMiddleware

from closet_routes import create_closet_router
from intake import search as intake_search
from intake.routes import create_intake_router
from models import (
    Garment,
    GarmentImage,
    GarmentStatus,
    GarmentTagSource,
    IntakeEntry,
    Item,
    ItemStatus,
    ItemType,
)
from sources.base import (
    SourceError,
    SourceRateLimited,
    SourceResult,
    SourceUnavailable,
)
from sources.registry import build_registry
from tests.test_closet_routes import jpeg
from tests.test_intake_budget import _config


class Stub:
    """A configured source answering `results`, or raising `raises`."""

    def __init__(self, name, item_type, results=(), raises=None, delay=0.0):
        self.source_name = name
        self.item_type = item_type
        self._results = list(results)
        self._raises = raises
        self._delay = delay
        self.queries: list[str] = []

    def configured(self):
        return True

    async def search(self, query, year=None, platform=None):
        self.queries.append(query)
        if self._delay:
            await asyncio.sleep(self._delay)
        if self._raises:
            raise self._raises
        return self._results

    async def fetch(self, external_id):
        raise SourceError(self.source_name, "no fetch in tests")


def _registry(**overrides):
    """The real registry (unconfigured adapters) with stubs swapped in."""
    registry = build_registry(_config())
    registry.update(overrides)
    return registry


@asynccontextmanager
async def client_for(factory, registry=None, *, closet=False):
    app = FastAPI()
    app.include_router(
        create_intake_router(factory, registry or _registry(), config=_config())
    )
    if closet:
        app.include_router(create_closet_router(factory))

    @app.middleware("http")
    async def _sign_in(request, call_next):
        request.session["user"] = {"sub": "1", "email": "admin@example.com"}
        return await call_next(request)

    app.add_middleware(SessionMiddleware, secret_key="test-secret", https_only=False)
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        yield client


SAGA_COMIC = SourceResult(external_id="cv-1", title="Saga", year=2012)
SAGA_GAME = SourceResult(external_id="ig-9", title="SaGa Frontier", year=2021)
SAGA_FILM = SourceResult(external_id="tm-3", title="The Twilight Saga", year=2009)


@pytest.mark.asyncio
async def test_search_labels_each_result_with_its_kind_and_marks_owned(
    sessionmaker_for_test,
):
    async with sessionmaker_for_test() as session:
        owned = Item(
            type=ItemType.COMIC,
            title="Saga",
            status=ItemStatus.BACKLOG,
            external_source="comicvine",
            external_id="cv-1",
        )
        session.add(owned)
        await session.commit()
        owned_id = str(owned.id)
    registry = _registry(
        **{
            ItemType.COMIC: Stub("comicvine", ItemType.COMIC, [SAGA_COMIC]),
            ItemType.GAME: Stub("igdb", ItemType.GAME, [SAGA_GAME]),
            ItemType.MOVIE: Stub("tmdb", ItemType.MOVIE, [SAGA_FILM]),
        }
    )
    async with client_for(sessionmaker_for_test, registry) as client:
        response = await client.get("/api/intake/search?area=shelf&query=saga")
    assert response.status_code == 200, response.text
    body = response.json()
    by_id = {row["external_id"]: row for row in body["results"]}
    assert set(by_id) == {"cv-1", "ig-9", "tm-3"}
    assert by_id["cv-1"]["kind"] == "comic"
    assert by_id["cv-1"]["external_source"] == "comicvine"
    assert by_id["cv-1"]["owned_item_id"] == owned_id
    assert by_id["ig-9"]["kind"] == "game"
    assert by_id["ig-9"]["owned_item_id"] is None
    assert by_id["tm-3"]["year"] == 2009
    states = {row["kind"]: row["state"] for row in body["sources"]}
    assert states == {
        "game": "ok",
        "movie": "ok",
        "comic": "ok",
        "boardgame": "not_configured",
    }


@pytest.mark.asyncio
async def test_a_result_with_a_publisher_and_count_carries_them(sessionmaker_for_test):
    registry = _registry(
        **{
            ItemType.COMIC: Stub(
                "comicvine",
                ItemType.COMIC,
                [
                    SourceResult(
                        "cv-1", "Creepshow", 2024, publisher="Image", issue_count=5
                    ),
                    SourceResult("cv-2", "Creepshow", 1982),
                ],
            ),
        }
    )
    async with client_for(sessionmaker_for_test, registry) as client:
        response = await client.get("/api/intake/search?area=shelf&query=creepshow")
    by_id = {row["external_id"]: row for row in response.json()["results"]}
    assert by_id["cv-1"]["publisher"] == "Image"
    assert by_id["cv-1"]["issue_count"] == 5
    # A source that knows neither leaves the keys off: other sources unchanged.
    assert "publisher" not in by_id["cv-2"]
    assert "issue_count" not in by_id["cv-2"]


@pytest.mark.asyncio
async def test_an_unconfigured_source_is_named_with_its_reason(
    sessionmaker_for_test,
):
    # The real registry: no source has credentials in tests (AC 11).
    async with client_for(sessionmaker_for_test) as client:
        body = (await client.get("/api/intake/search?area=shelf&query=saga")).json()
    assert body["results"] == []
    reasons = {row["kind"]: row for row in body["sources"]}
    assert reasons["boardgame"]["state"] == "not_configured"
    assert reasons["boardgame"]["reason"].startswith("BGG unavailable")
    assert reasons["comic"]["state"] == "not_configured"
    assert reasons["comic"]["reason"]


@pytest.mark.asyncio
async def test_a_busy_or_slow_source_never_blocks_the_others(
    sessionmaker_for_test, monkeypatch
):
    monkeypatch.setattr(intake_search, "SEARCH_TIMEOUT", 0.05)
    registry = _registry(
        **{
            ItemType.COMIC: Stub(
                "comicvine", ItemType.COMIC, raises=SourceRateLimited("cv", "429")
            ),
            ItemType.GAME: Stub("igdb", ItemType.GAME, [SAGA_GAME], delay=1.0),
            ItemType.MOVIE: Stub(
                "tmdb", ItemType.MOVIE, raises=SourceError("tmdb", "bad answer")
            ),
        }
    )
    async with client_for(sessionmaker_for_test, registry) as client:
        body = (await client.get("/api/intake/search?area=shelf&query=saga")).json()
    states = {row["kind"]: row["state"] for row in body["sources"]}
    assert states["comic"] == "busy"
    assert states["game"] == "busy"  # past the per-source timeout
    assert states["movie"] == "failed"
    assert body["results"] == []


@pytest.mark.asyncio
async def test_an_unexpected_error_fails_one_source_and_the_rest_still_answer(
    sessionmaker_for_test,
):
    # A parsing bug (here a KeyError carrying a key-bearing URL) fails its
    # own source only, and the client sees fixed wording, never the error.
    secret = "https://api.example/search?api_key=SECRET"
    registry = _registry(
        **{
            ItemType.COMIC: Stub("comicvine", ItemType.COMIC, raises=KeyError(secret)),
            ItemType.MOVIE: Stub(
                "tmdb", ItemType.MOVIE, raises=SourceError("tmdb", secret)
            ),
            ItemType.GAME: Stub("igdb", ItemType.GAME, [SAGA_GAME]),
        }
    )
    async with client_for(sessionmaker_for_test, registry) as client:
        response = await client.get("/api/intake/search?area=shelf&query=saga")
    assert response.status_code == 200, response.text
    body = response.json()
    assert [row["external_id"] for row in body["results"]] == ["ig-9"]
    by_kind = {row["kind"]: row for row in body["sources"]}
    assert by_kind["comic"] == {
        "kind": "comic",
        "state": "failed",
        "reason": "comicvine could not be searched just now",
    }
    assert by_kind["movie"]["state"] == "failed"
    assert by_kind["movie"]["reason"] == "tmdb could not be searched just now"
    assert "SECRET" not in response.text


@pytest.mark.asyncio
async def test_an_unavailable_source_is_busy_and_the_rest_still_answer(
    sessionmaker_for_test,
):
    registry = _registry(
        **{
            ItemType.COMIC: Stub(
                "comicvine", ItemType.COMIC, raises=SourceUnavailable("cv", "503")
            ),
            ItemType.MOVIE: Stub("tmdb", ItemType.MOVIE, [SAGA_FILM]),
        }
    )
    async with client_for(sessionmaker_for_test, registry) as client:
        body = (await client.get("/api/intake/search?area=shelf&query=saga")).json()
    assert [row["external_id"] for row in body["results"]] == ["tm-3"]
    assert {row["kind"]: row["state"] for row in body["sources"]}["comic"] == "busy"


@pytest.mark.asyncio
async def test_the_closet_has_nothing_to_search(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        body = (await client.get("/api/intake/search?area=closet&query=shirt")).json()
        empty = await client.get("/api/intake/search?area=shelf&query=")
    assert body == {"results": [], "sources": []}
    assert empty.status_code == 422


@pytest.mark.asyncio
async def test_a_chosen_result_is_added_private_through_the_commit_service(
    sessionmaker_for_test,
):
    async with client_for(sessionmaker_for_test) as client:
        response = await client.post(
            "/api/intake/add",
            json={
                "kind": "comic",
                "chosen": {
                    "external_source": "comicvine",
                    "external_id": "cv-1",
                    "title": "Saga",
                    "year": 2012,
                    "thumbnail_url": "https://example.com/saga.jpg",
                },
                "payload": {"issues_owned": "1-6", "status": "backlog"},
            },
        )
    assert response.status_code == 201, response.text
    body = response.json()
    assert (body["added"], body["already_owned"]) == (1, 0)
    async with sessionmaker_for_test() as session:
        item = await session.get(Item, uuid.UUID(body["created"][0]))
    assert item.title == "Saga"
    assert item.external_id == "cv-1"
    assert item.cover_url == "https://example.com/saga.jpg"
    assert item.is_public is False
    assert item.owned_format.value == "physical"
    assert item.issues_owned == "1–6"  # canonicalised by comics.py


@pytest.mark.asyncio
async def test_keep_as_typed_commits_a_manual_row(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        response = await client.post(
            "/api/intake/add",
            json={"kind": "movie", "payload": {"title": "Heat", "year": 1995}},
        )
    assert response.status_code == 201, response.text
    async with sessionmaker_for_test() as session:
        (item,) = (await session.scalars(select(Item))).all()
    assert (item.title, item.year, item.type) == ("Heat", 1995, ItemType.MOVIE)
    assert item.external_source is None
    assert item.status is ItemStatus.BACKLOG


@pytest.mark.asyncio
async def test_an_unconfigured_sources_kind_commits_as_typed(sessionmaker_for_test):
    # Board games have no source until BGG opens (AC 11).
    async with client_for(sessionmaker_for_test) as client:
        response = await client.post(
            "/api/intake/add",
            json={"kind": "boardgame", "payload": {"title": "Wingspan"}},
        )
    assert response.status_code == 201, response.text
    async with sessionmaker_for_test() as session:
        (item,) = (await session.scalars(select(Item))).all()
    assert (item.title, item.type) == ("Wingspan", ItemType.BOARDGAME)


@pytest.mark.asyncio
async def test_a_title_already_on_the_shelf_is_counted_not_added(
    sessionmaker_for_test,
):
    body = {
        "kind": "game",
        "chosen": {"external_source": "igdb", "external_id": "9", "title": "Hades"},
        "payload": {},
    }
    async with client_for(sessionmaker_for_test) as client:
        first = await client.post("/api/intake/add", json=body)
        second = await client.post("/api/intake/add", json=body)
    assert first.status_code == 201
    assert second.status_code == 200
    assert (second.json()["added"], second.json()["already_owned"]) == (0, 1)


def _saga_add(issues: str) -> dict:
    return {
        "kind": "comic",
        "chosen": {
            "external_source": "comicvine",
            "external_id": "cv-1",
            "title": "Saga",
        },
        "payload": {"issues_owned": issues},
    }


@pytest.mark.asyncio
async def test_an_owned_series_gains_the_typed_issues_by_got_its_rule(
    sessionmaker_for_test,
):
    # The sitting's rule (#146): one row per series, its issues joined.
    async with client_for(sessionmaker_for_test) as client:
        first = await client.post("/api/intake/add", json=_saga_add("1-2"))
        second = await client.post("/api/intake/add", json=_saga_add("3-4"))
    assert first.status_code == 201, first.text
    assert second.status_code == 200, second.text
    body = second.json()
    assert (body["added"], body["already_owned"], body["issues_added"]) == (0, 0, 2)
    assert body["created"] == []
    [grew] = body["series_grew"]
    assert grew["title"] == "Saga"
    assert grew["before"] == {"owned": 2, "released": 2}
    assert (grew["added"], grew["already"]) == ([3, 4], [])
    assert grew["after_owned_text"] == "1–4"
    async with sessionmaker_for_test() as session:
        (item,) = (await session.scalars(select(Item))).all()
    assert item.issues_owned == "1–4"


@pytest.mark.asyncio
async def test_an_owned_series_takes_the_shelf_format_typed_with_the_add(
    sessionmaker_for_test,
):
    async with client_for(sessionmaker_for_test) as client:
        await client.post("/api/intake/add", json=_saga_add("1-2"))
        body = _saga_add("3")
        body["payload"]["shelf_format"] = "trades"
        second = await client.post("/api/intake/add", json=body)
    assert second.status_code == 200, second.text
    async with sessionmaker_for_test() as session:
        (item,) = (await session.scalars(select(Item))).all()
    assert item.shelf_format.value == "trades"
    assert item.issues_owned == "1–3"


@pytest.mark.asyncio
async def test_an_owned_series_gaining_nothing_is_already_on_the_shelf(
    sessionmaker_for_test,
):
    async with client_for(sessionmaker_for_test) as client:
        await client.post("/api/intake/add", json=_saga_add("1-4"))
        second = await client.post("/api/intake/add", json=_saga_add("2"))
    assert second.status_code == 200, second.text
    body = second.json()
    assert (body["added"], body["already_owned"], body["issues_added"]) == (0, 1, 0)
    [grew] = body["series_grew"]
    assert (grew["added"], grew["already"]) == ([], [2])
    async with sessionmaker_for_test() as session:
        (item,) = (await session.scalars(select(Item))).all()
    assert item.issues_owned == "1–4"


@pytest.mark.asyncio
async def test_an_owned_game_is_still_counted_and_gains_no_issues(
    sessionmaker_for_test,
):
    body = {
        "kind": "game",
        "chosen": {"external_source": "igdb", "external_id": "9", "title": "Hades"},
        "payload": {},
    }
    async with client_for(sessionmaker_for_test) as client:
        await client.post("/api/intake/add", json=body)
        second = await client.post("/api/intake/add", json=body)
    assert second.status_code == 200, second.text
    answer = second.json()
    assert (answer["added"], answer["already_owned"], answer["issues_added"]) == (
        0,
        1,
        0,
    )
    async with sessionmaker_for_test() as session:
        (item,) = (await session.scalars(select(Item))).all()
    assert item.issues_owned is None


@pytest.mark.asyncio
async def test_a_refused_add_names_the_field_and_writes_nothing(
    sessionmaker_for_test,
):
    async with client_for(sessionmaker_for_test) as client:
        refused = await client.post(
            "/api/intake/add",
            json={"kind": "comic", "payload": {"title": "Saga", "issues_owned": "9-1"}},
        )
        unknown = await client.post(
            "/api/intake/add", json={"kind": "vinyl", "payload": {"title": "x"}}
        )
    assert refused.status_code == 422
    (refusal,) = refused.json()["refused"]
    assert refusal["field"] == "issues_owned"
    assert refused.json()["detail"] == refusal["message"]
    assert unknown.status_code == 422
    async with sessionmaker_for_test() as session:
        assert (await session.scalars(select(Item))).all() == []


@pytest.mark.asyncio
async def test_a_typed_piece_becomes_a_manual_garment(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        response = await client.post(
            "/api/intake/add",
            json={"kind": "garment", "payload": {"name": "Navy blazer"}},
        )
    assert response.status_code == 201, response.text
    async with sessionmaker_for_test() as session:
        garment = await session.get(Garment, uuid.UUID(response.json()["garment_id"]))
    assert garment.name == "Navy blazer"
    assert garment.tag_source is GarmentTagSource.MANUAL


@pytest.mark.asyncio
async def test_a_garment_sitting_makes_the_same_garments_as_the_camera(
    sessionmaker_for_test,
):
    """AC 7: a piece shot in a sitting is the garment and thumbnail the
    Closet's own upload makes, untagged and listed at once."""
    photo = jpeg(900, 1200, (200, 40, 40))
    async with client_for(sessionmaker_for_test, closet=True) as client:
        await client.post(
            "/api/closet/garments/photos",
            files=[("photos", ("a.jpg", photo, "image/jpeg"))],
        )
        sitting = (
            await client.post("/api/intake/sittings", json={"area": "closet"})
        ).json()
        await client.post(
            f"/api/intake/sittings/{sitting['id']}/photos",
            files={"photo": ("b.jpg", photo, "image/jpeg")},
        )
        listed = (await client.get("/api/closet/garments")).json()
    assert listed["counts"]["untagged"] == 2
    async with sessionmaker_for_test() as session:
        garments = (await session.scalars(select(Garment))).all()
        images = {
            image.garment_id: image
            for image in (await session.scalars(select(GarmentImage))).all()
        }
    shape = {
        (g.status, tuple(g.seasons), g.tag_attempts, g.tag_source) for g in garments
    }
    assert shape == {(GarmentStatus.UNTAGGED, (), 0, None)}
    camera, sitting_image = (images[g.id] for g in garments)
    assert (camera.width, camera.height) == (sitting_image.width, sitting_image.height)
    assert camera.webp == sitting_image.webp


@pytest.mark.asyncio
async def test_tag_again_puts_a_given_up_piece_back_in_the_queue(
    sessionmaker_for_test,
):
    async with client_for(sessionmaker_for_test) as client:
        sitting = (
            await client.post("/api/intake/sittings", json={"area": "closet"})
        ).json()
        await client.post(
            f"/api/intake/sittings/{sitting['id']}/photos",
            files={"photo": ("b.jpg", jpeg(), "image/jpeg")},
        )
        async with sessionmaker_for_test() as session:
            entry = await session.scalar(select(IntakeEntry))
            garment = await session.get(Garment, entry.garment_id)
            garment.tag_attempts = 3
            await session.commit()
            entry_id, garment_id = entry.id, garment.id
        again = await client.post(f"/api/intake/entries/{entry_id}/tag-again")
        async with sessionmaker_for_test() as session:
            garment = await session.get(Garment, garment_id)
            garment.tag_source = GarmentTagSource.MANUAL
            await session.commit()
        refused = await client.post(f"/api/intake/entries/{entry_id}/tag-again")
    assert again.status_code == 200, again.text
    async with sessionmaker_for_test() as session:
        assert (await session.get(Garment, garment_id)).tag_attempts == 0
    assert refused.status_code == 409


TRADE = {"kind": "Trade", "label": "Vol. 1", "from": 1, "to": 6}


@pytest.mark.asyncio
async def test_typed_issues_are_written_loose_beside_a_covering_trade(
    sessionmaker_for_test,
):
    async with client_for(sessionmaker_for_test) as client:
        await client.post("/api/intake/add", json=_saga_add("1"))
        body = _saga_add("2-6")
        body["payload"].update(shelf_format="trades", editions=[TRADE])
        second = await client.post("/api/intake/add", json=body)
    assert second.status_code == 200, second.text
    body = second.json()
    assert (body["issues_added"], body["already_owned"]) == (5, 0)
    [grew] = body["series_grew"]
    assert (grew["added"], grew["editions_added"]) == ([2, 3, 4, 5, 6], [TRADE])


@pytest.mark.asyncio
async def test_a_series_gaining_only_an_edition_is_grown_not_already_owned(
    sessionmaker_for_test,
):
    async with client_for(sessionmaker_for_test) as client:
        await client.post("/api/intake/add", json=_saga_add("1-6"))
        body = _saga_add("2")
        body["payload"].update(shelf_format="trades", editions=[TRADE])
        second = await client.post("/api/intake/add", json=body)
    assert second.status_code == 200, second.text
    body = second.json()
    assert (body["issues_added"], body["already_owned"]) == (0, 0)
    [grew] = body["series_grew"]
    assert (grew["added"], grew["editions_added"]) == ([], [TRADE])
