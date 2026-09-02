"""The picker proxy and the refresh route.

Adapters are stubbed rather than mocked at the HTTP layer: the contract these
routes depend on is SourceAdapter, so a stub that implements it is a more
honest test double than a patched httpx2 client.
"""

import uuid
from contextlib import asynccontextmanager

import pytest
from fastapi import FastAPI
from httpx2 import ASGITransport, AsyncClient
from starlette.middleware.sessions import SessionMiddleware

from items import create_items_router
from models import Item, ItemStatus, ItemType
from sources.base import SourceDetail, SourceError, SourceNotConfigured, SourceResult

pytestmark = pytest.mark.asyncio


class StubSource:
    """A source that answers from memory."""

    source_name = "tmdb"
    item_type = ItemType.MOVIE

    def __init__(self, *, configured: bool = True, raises: Exception | None = None):
        self._configured = configured
        self._raises = raises

    def configured(self) -> bool:
        return self._configured

    async def search(self, query, year=None, platform=None):
        if self._raises:
            raise self._raises
        return [
            SourceResult(
                external_id="438631",
                title="Dune",
                year=2021,
                thumbnail_url="https://image.tmdb.org/t/p/w185/x.jpg",
            )
        ]

    async def fetch(self, external_id):
        if self._raises:
            raise self._raises
        return SourceDetail(
            external_id=external_id,
            title="Dune",
            year=2021,
            creator="Denis Villeneuve",
            cover_url="https://image.tmdb.org/t/p/w342/x.jpg",
            source_metadata={"genres": ["Science Fiction"], "community_score": 7.8},
        )


@asynccontextmanager
async def client_for(factory, registry, signed_in: bool = True):
    app = FastAPI()
    app.include_router(create_items_router(factory, registry))

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


async def _seed(factory, **overrides) -> Item:
    fields = dict(
        type=ItemType.MOVIE,
        title="Dune",
        status=ItemStatus.BACKLOG,
        external_source="tmdb",
        external_id="438631",
    )
    fields.update(overrides)
    async with factory() as session:
        item = Item(**fields)
        session.add(item)
        await session.commit()
        await session.refresh(item)
        return item


async def test_search_metadata_returns_candidates(sessionmaker_for_test):
    registry = {ItemType.MOVIE: StubSource()}
    async with client_for(sessionmaker_for_test, registry) as client:
        response = await client.get(
            "/api/items/search-metadata", params={"type": "movie", "query": "Dune"}
        )
    assert response.status_code == 200
    body = response.json()
    assert body[0]["title"] == "Dune"
    assert body[0]["external_source"] == "tmdb"
    assert body[0]["external_id"] == "438631"


async def test_search_metadata_is_503_when_the_source_has_no_key(
    sessionmaker_for_test,
):
    # Not a 500: the feature was never enabled on this deploy. The detail
    # names the variable so the fix is legible from the response alone.
    registry = {
        ItemType.MOVIE: StubSource(
            configured=False,
            raises=SourceNotConfigured("tmdb", "TMDB_API_TOKEN is not set"),
        )
    }
    async with client_for(sessionmaker_for_test, registry) as client:
        response = await client.get(
            "/api/items/search-metadata", params={"type": "movie", "query": "Dune"}
        )
    assert response.status_code == 503
    assert "tmdb" in response.json()["detail"]


async def test_an_unimplemented_type_is_also_503(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test, {}) as client:
        response = await client.get(
            "/api/items/search-metadata", params={"type": "comic", "query": "Saga"}
        )
    assert response.status_code == 503


async def test_a_failing_source_is_502_not_500(sessionmaker_for_test):
    registry = {ItemType.MOVIE: StubSource(raises=SourceError("tmdb", "boom"))}
    async with client_for(sessionmaker_for_test, registry) as client:
        response = await client.get(
            "/api/items/search-metadata", params={"type": "movie", "query": "Dune"}
        )
    assert response.status_code == 502


async def test_search_metadata_requires_the_admin_session(sessionmaker_for_test):
    # Router-level dependency: 401, never 422, so an anonymous caller cannot
    # probe the query schema.
    registry = {ItemType.MOVIE: StubSource()}
    async with client_for(sessionmaker_for_test, registry, signed_in=False) as client:
        response = await client.get(
            "/api/items/search-metadata", params={"type": "movie", "query": "Dune"}
        )
    assert response.status_code == 401


async def test_search_metadata_is_not_shadowed_by_the_id_route(sessionmaker_for_test):
    # /{item_id} is typed uuid.UUID. Declared first, it would swallow this
    # path and answer 422 instead of reaching the picker.
    registry = {ItemType.MOVIE: StubSource()}
    async with client_for(sessionmaker_for_test, registry) as client:
        response = await client.get(
            "/api/items/search-metadata", params={"type": "movie", "query": "Dune"}
        )
    assert response.status_code != 422


async def test_refresh_overwrites_the_snapshot_but_not_the_title(
    sessionmaker_for_test,
):
    # The title is the owner's: the picker prefills it and it stays editable.
    # A refresh that reverted a hand-edited title would be data loss.
    item = await _seed(sessionmaker_for_test, title="My Own Title")
    registry = {ItemType.MOVIE: StubSource()}
    async with client_for(sessionmaker_for_test, registry) as client:
        response = await client.post(f"/api/items/{item.id}/refresh-metadata")

    assert response.status_code == 200
    body = response.json()
    assert body["title"] == "My Own Title"
    assert body["creator"] == "Denis Villeneuve"
    assert body["cover_url"].startswith("https://image.tmdb.org/")
    assert body["source_metadata"]["genres"] == ["Science Fiction"]


async def test_refresh_on_a_manual_item_is_409(sessionmaker_for_test):
    item = await _seed(sessionmaker_for_test, external_source=None, external_id=None)
    registry = {ItemType.MOVIE: StubSource()}
    async with client_for(sessionmaker_for_test, registry) as client:
        response = await client.post(f"/api/items/{item.id}/refresh-metadata")
    assert response.status_code == 409


async def test_refresh_on_an_unknown_id_is_404(sessionmaker_for_test):
    registry = {ItemType.MOVIE: StubSource()}
    async with client_for(sessionmaker_for_test, registry) as client:
        response = await client.post(
            f"/api/items/{uuid.uuid4()}/refresh-metadata",
        )
    assert response.status_code == 404
