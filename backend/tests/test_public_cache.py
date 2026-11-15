"""Public reads carry Cache-Control and an ETag, and answer 304 (#265)."""

import pytest
from fastapi import FastAPI, Response
from httpx2 import ASGITransport, AsyncClient

from public_cache import CACHE_CONTROL, add_public_cache


def _app() -> FastAPI:
    app = FastAPI()
    state = {"body": {"a": 1}}

    @app.get("/api/public/thing")
    async def thing():
        return state["body"]

    @app.get("/api/public/own")
    async def own(response: Response):
        response.headers["Cache-Control"] = "public, max-age=300"
        return {"x": 1}

    @app.get("/api/public/missing")
    async def missing():
        return Response(status_code=404)

    @app.get("/api/items")
    async def private():
        return {"private": True}

    @app.post("/api/public/post")
    async def post():
        return {"ok": True}

    app.state.body = state
    add_public_cache(app)
    return app


def _client(app):
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://t")


@pytest.mark.asyncio
async def test_a_public_read_has_cache_control_and_an_etag():
    async with _client(_app()) as c:
        r = await c.get("/api/public/thing")
    assert r.status_code == 200
    assert r.headers["cache-control"] == CACHE_CONTROL
    assert (
        "max-age=60" in CACHE_CONTROL and "stale-while-revalidate=300" in CACHE_CONTROL
    )
    assert r.headers["etag"].startswith('W/"')
    assert r.json() == {"a": 1}


@pytest.mark.asyncio
async def test_a_matching_etag_gets_a_304_without_a_body():
    async with _client(_app()) as c:
        first = await c.get("/api/public/thing")
        again = await c.get(
            "/api/public/thing", headers={"If-None-Match": first.headers["etag"]}
        )
    assert again.status_code == 304
    assert again.content == b""
    assert again.headers["etag"] == first.headers["etag"]
    assert again.headers["cache-control"] == CACHE_CONTROL


@pytest.mark.asyncio
async def test_a_changed_body_changes_the_etag():
    app = _app()
    async with _client(app) as c:
        first = await c.get("/api/public/thing")
        app.state.body["body"] = {"a": 2}
        again = await c.get(
            "/api/public/thing", headers={"If-None-Match": first.headers["etag"]}
        )
    assert again.status_code == 200
    assert again.headers["etag"] != first.headers["etag"]


@pytest.mark.asyncio
async def test_a_route_that_sets_its_own_cache_control_keeps_it():
    async with _client(_app()) as c:
        r = await c.get("/api/public/own")
    assert r.headers["cache-control"] == "public, max-age=300"
    assert "etag" in r.headers


@pytest.mark.asyncio
async def test_errors_other_paths_and_writes_are_left_alone():
    async with _client(_app()) as c:
        missing = await c.get("/api/public/missing")
        private = await c.get("/api/items")
        post = await c.post("/api/public/post")
    for r in (missing, private, post):
        assert "etag" not in r.headers
        assert "cache-control" not in r.headers
