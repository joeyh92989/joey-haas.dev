"""State-changing requests from a foreign browser origin are refused."""

import pytest
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from httpx2 import ASGITransport, AsyncClient

from origin_check import add_origin_check, origin_allowed

OURS = "https://joey-haas.dev"
ALLOWED = frozenset({OURS})


@pytest.mark.parametrize(
    ("method", "origin", "allowed"),
    [
        ("POST", OURS, True),
        ("POST", "https://evil.joey-haas.dev", False),
        ("PATCH", "null", False),
        ("DELETE", "https://example.com", False),
        ("POST", None, True),  # not a browser page: curl, the nightly job
        ("GET", "https://example.com", True),  # reads are CORS's business
        ("OPTIONS", "https://example.com", True),  # preflight
    ],
)
def test_origin_allowed(method, origin, allowed):
    assert origin_allowed(method, origin, ALLOWED) is allowed


@pytest.mark.asyncio
async def test_a_foreign_post_is_a_403_before_the_route_runs():
    app = FastAPI()
    ran = []

    @app.post("/api/items/1/pin")
    async def pin():
        ran.append(True)
        return {"ok": True}

    add_origin_check(app, [OURS])
    app.add_middleware(CORSMiddleware, allow_origins=[OURS], allow_credentials=True)
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        refused = await client.post(
            "/api/items/1/pin", headers={"Origin": "https://evil.joey-haas.dev"}
        )
        accepted = await client.post("/api/items/1/pin", headers={"Origin": OURS})

    assert refused.status_code == 403
    assert refused.json() == {"detail": "Origin not allowed"}
    assert accepted.status_code == 200
    assert ran == [True]
