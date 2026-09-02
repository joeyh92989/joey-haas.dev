"""Photo import: extraction, resolution, and partial failure.

The provider and the adapters are both stubbed. The contract this module
depends on is LLMProvider and SourceAdapter, so stubs implementing them are
more honest doubles than a patched HTTP client, and no test spends a real
model call.
"""

from contextlib import asynccontextmanager

import pytest
from fastapi import FastAPI
from httpx2 import ASGITransport, AsyncClient
from starlette.middleware.sessions import SessionMiddleware

from importer import create_import_router
from llm import LLMError
from models import ItemType
from sources.base import SourceError, SourceNotConfigured, SourceResult

pytestmark = pytest.mark.asyncio

JPEG = ("shelf.jpg", b"\xff\xd8shelf", "image/jpeg")


class StubProvider:
    """Returns a canned extraction, or raises."""

    def __init__(self, payload=None, raises=None):
        self._payload = payload if payload is not None else {"detections": []}
        self._raises = raises

    async def complete_json(self, prompt, schema, images=None):
        if self._raises:
            raise self._raises
        return self._payload


class StubSource:
    def __init__(self, name, item_type, results=None, raises=None):
        self.source_name = name
        self.item_type = item_type
        self._results = results if results is not None else []
        self._raises = raises
        self.searches: list[tuple] = []

    def configured(self):
        return True

    async def search(self, query, year=None, platform=None):
        self.searches.append((query, year, platform))
        if self._raises:
            raise self._raises
        return self._results

    async def fetch(self, external_id):
        raise NotImplementedError


@asynccontextmanager
async def client_for(registry, provider, signed_in: bool = True):
    app = FastAPI()
    app.include_router(create_import_router(registry, lambda: provider))

    if signed_in:

        @app.middleware("http")
        async def _sign_in(request, call_next):
            request.session["user"] = {"sub": "1", "email": "admin@example.com"}
            return await call_next(request)

    app.add_middleware(SessionMiddleware, secret_key="test-secret", https_only=False)
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        yield client


def _detection(title, media_type, year=None):
    row = {"title": title, "media_type": media_type}
    if year is not None:
        row["year"] = year
    return row


async def test_detections_are_resolved_against_the_matching_source():
    registry = {
        ItemType.MOVIE: StubSource(
            "tmdb",
            ItemType.MOVIE,
            [SourceResult(external_id="438631", title="Dune", year=2021)],
        )
    }
    provider = StubProvider({"detections": [_detection("Dune", "movie", 2021)]})

    async with client_for(registry, provider) as client:
        response = await client.post("/api/import/photos", files={"photos": JPEG})

    assert response.status_code == 200
    detection = response.json()["detections"][0]
    assert detection["media_type"] == "movie"
    assert detection["status"] == "matched"
    assert detection["confidence"] == "exact"
    assert detection["match"]["external_id"] == "438631"
    assert detection["candidates"]


async def test_a_dead_source_marks_only_its_own_rows_unresolved():
    # A 200-item import must not be lost because one API was down.
    registry = {
        ItemType.MOVIE: StubSource(
            "tmdb", ItemType.MOVIE, [SourceResult(external_id="1", title="Dune")]
        ),
        ItemType.COMIC: StubSource(
            "comicvine", ItemType.COMIC, raises=SourceError("comicvine", "boom")
        ),
    }
    provider = StubProvider(
        {
            "detections": [
                _detection("Dune", "movie"),
                _detection("Saga", "comic"),
            ]
        }
    )

    async with client_for(registry, provider) as client:
        body = (await client.post("/api/import/photos", files={"photos": JPEG})).json()

    statuses = {row["media_type"]: row["status"] for row in body["detections"]}
    assert statuses["movie"] == "matched"
    assert statuses["comic"] == "unresolved"


async def test_an_unconfigured_source_marks_its_rows_unresolved_with_a_reason():
    registry = {
        ItemType.COMIC: StubSource(
            "comicvine",
            ItemType.COMIC,
            raises=SourceNotConfigured("comicvine", "COMICVINE_API_KEY is not set"),
        )
    }
    provider = StubProvider({"detections": [_detection("Saga", "comic")]})

    async with client_for(registry, provider) as client:
        body = (await client.post("/api/import/photos", files={"photos": JPEG})).json()

    row = body["detections"][0]
    assert row["status"] == "unresolved"
    assert "COMICVINE_API_KEY" in row["reason"]


async def test_a_type_with_no_adapter_is_unresolved_not_an_error():
    registry = {}
    provider = StubProvider({"detections": [_detection("Inscryption", "game")]})

    async with client_for(registry, provider) as client:
        response = await client.post("/api/import/photos", files={"photos": JPEG})

    assert response.status_code == 200
    assert response.json()["detections"][0]["status"] == "unresolved"


async def test_input_order_is_preserved_across_grouping():
    # Detections are grouped by source to resolve, so the response has to be
    # put back in the order the model read them off the shelf.
    registry = {
        ItemType.MOVIE: StubSource("tmdb", ItemType.MOVIE),
        ItemType.BOARDGAME: StubSource("bgg", ItemType.BOARDGAME),
    }
    provider = StubProvider(
        {
            "detections": [
                _detection("Dune", "movie"),
                _detection("Gloomhaven", "boardgame"),
                _detection("Arrival", "movie"),
            ]
        }
    )

    async with client_for(registry, provider) as client:
        body = (await client.post("/api/import/photos", files={"photos": JPEG})).json()

    assert [row["detected_title"] for row in body["detections"]] == [
        "Dune",
        "Gloomhaven",
        "Arrival",
    ]


async def test_provider_failure_is_502_not_500():
    async with client_for({}, StubProvider(raises=LLMError("overloaded"))) as client:
        response = await client.post("/api/import/photos", files={"photos": JPEG})

    assert response.status_code == 502
    assert "try again" in response.json()["detail"].lower()


async def test_a_non_image_upload_is_rejected_before_a_request_is_spent():
    async with client_for({}, StubProvider()) as client:
        response = await client.post(
            "/api/import/photos",
            files={"photos": ("notes.txt", b"hello", "text/plain")},
        )

    assert response.status_code == 415
    assert "notes.txt" in response.json()["detail"]


async def test_too_many_photos_is_rejected():
    async with client_for({}, StubProvider()) as client:
        response = await client.post(
            "/api/import/photos",
            files=[
                ("photos", (f"{i}.jpg", b"\xff\xd8x", "image/jpeg")) for i in range(21)
            ],
        )

    assert response.status_code == 422


async def test_import_requires_the_admin_session():
    async with client_for({}, StubProvider(), signed_in=False) as client:
        response = await client.post("/api/import/photos", files={"photos": JPEG})

    assert response.status_code == 401
