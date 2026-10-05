"""The job token opens exactly JOB_ROUTES (Spine Next spec, A2).

This file is the point of the token: a bearer token that opened any admin
route would be a second admin password kept in GitHub. Behaviour is tested
on stub routes at the real templates (no database); a second test proves
every whitelisted pair exists on the real routers, so a renamed route cannot
leave a dead entry behind.
"""

import asyncio
from contextlib import asynccontextmanager

import pytest
from fastapi import APIRouter, Depends, FastAPI
from httpx2 import ASGITransport, AsyncClient
from starlette.middleware.sessions import SessionMiddleware

from items import JOB_ROUTES, create_items_router, require_admin
from physical_routes import create_physical_router
from picker_routes import create_picker_router
from recommendations_routes import create_recommendations_router

pytestmark = pytest.mark.asyncio

TOKEN = "test-job-token"
EXPECTED = {
    ("POST", "/api/picker/next"),
    ("POST", "/api/physical/refresh-registry"),
    ("POST", "/api/physical/refresh"),
    ("POST", "/api/physical/refresh-switch1"),
    ("POST", "/api/physical/resolve"),
    ("POST", "/api/recommendations/generate"),
    ("GET", "/api/physical/status"),
}


def _stub_app(token: str | None, signed_in: bool = False) -> FastAPI:
    """Routes at the real templates, gated like the real routers."""
    app = FastAPI()
    app.state.job_token = token
    gated = APIRouter(dependencies=[Depends(require_admin)])

    async def ok() -> dict:
        return {"ok": True}

    for method, path in EXPECTED:
        gated.add_api_route(path, ok, methods=[method])
    gated.add_api_route("/api/items/{item_id}", ok, methods=["PATCH"])
    gated.add_api_route("/api/items", ok, methods=["POST"])
    app.include_router(gated)
    if signed_in:

        @app.middleware("http")
        async def _sign_in(request, call_next):
            request.session["user"] = {"sub": "1", "email": "admin@example.com"}
            return await call_next(request)

    app.add_middleware(SessionMiddleware, secret_key="test", https_only=False)
    return app


@asynccontextmanager
async def client(token: str | None = TOKEN, signed_in: bool = False):
    async with AsyncClient(
        transport=ASGITransport(app=_stub_app(token, signed_in)),
        base_url="http://testserver",
    ) as http:
        yield http


def bearer(value: str = TOKEN) -> dict:
    return {"Authorization": f"Bearer {value}"}


async def test_the_whitelist_is_exactly_the_nightly_routes():
    assert JOB_ROUTES == frozenset(EXPECTED)


async def test_every_whitelisted_route_exists_on_the_real_routers():
    app = FastAPI()
    lock = asyncio.Lock()
    app.include_router(create_items_router(None, {}))
    app.include_router(create_picker_router(None))
    app.include_router(create_physical_router(None, {}, lambda: None, None, lock=lock))
    app.include_router(create_recommendations_router(None, {}, lock))
    # FastAPI 0.141 includes routers lazily, so app.routes holds one opaque
    # entry per router; the OpenAPI schema lists the flattened templates.
    real = {
        (method.upper(), path)
        for path, operations in app.openapi()["paths"].items()
        for method in operations
    }
    assert JOB_ROUTES <= real


@pytest.mark.parametrize(("method", "path"), sorted(EXPECTED))
async def test_the_token_opens_each_whitelisted_route(method, path):
    async with client() as http:
        response = await http.request(method, path, headers=bearer(), json={})
    assert response.status_code == 200


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("PATCH", "/api/items/0b7c6f3e-1111-4c1c-9a50-000000000001"),
        ("POST", "/api/items"),
    ],
)
async def test_the_token_opens_nothing_else(method, path):
    async with client() as http:
        response = await http.request(method, path, headers=bearer(), json={})
    assert response.status_code == 401


async def test_a_wrong_token_is_refused():
    async with client() as http:
        response = await http.post("/api/picker/next", headers=bearer("nope"), json={})
    assert response.status_code == 401


async def test_another_scheme_is_refused():
    async with client() as http:
        response = await http.post(
            "/api/picker/next", headers={"Authorization": f"Basic {TOKEN}"}, json={}
        )
    assert response.status_code == 401


async def test_no_configured_token_refuses_every_bearer():
    async with client(token=None) as http:
        response = await http.post("/api/picker/next", headers=bearer(), json={})
    assert response.status_code == 401


async def test_a_trailing_slash_does_not_widen_the_match():
    async with client() as http:
        response = await http.post(
            "/api/items/", headers=bearer(), json={}, follow_redirects=False
        )
    assert response.status_code in (307, 401, 404)
    assert response.status_code != 200


async def test_a_session_is_unchanged_with_or_without_a_header():
    async with client(signed_in=True) as http:
        plain = await http.patch(
            "/api/items/0b7c6f3e-1111-4c1c-9a50-000000000001", json={}
        )
        odd = await http.post("/api/items", headers=bearer("nope"), json={})
    assert plain.status_code == 200
    assert odd.status_code == 200
