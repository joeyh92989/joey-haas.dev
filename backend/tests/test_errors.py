"""An unhandled error reaches the browser as a JSON 500 with CORS headers."""

import pytest
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from httpx2 import ASGITransport, AsyncClient

from errors import add_json_errors

ORIGIN = "https://joey-haas.dev"


def _app() -> FastAPI:
    app = FastAPI()

    @app.get("/boom")
    async def boom():
        raise RuntimeError("database fell over")

    @app.get("/fine")
    async def fine():
        return {"ok": True}

    add_json_errors(app)
    app.add_middleware(CORSMiddleware, allow_origins=[ORIGIN], allow_credentials=True)
    return app


@pytest.mark.asyncio
async def test_a_500_keeps_its_cors_headers_and_is_json(caplog):
    async with AsyncClient(
        transport=ASGITransport(app=_app(), raise_app_exceptions=False),
        base_url="http://testserver",
    ) as client:
        response = await client.get("/boom", headers={"Origin": ORIGIN})
    assert response.status_code == 500
    assert response.json() == {"detail": "Internal Server Error"}
    assert response.headers["access-control-allow-origin"] == ORIGIN
    assert "unhandled error on GET /boom" in caplog.text


@pytest.mark.asyncio
async def test_a_normal_response_passes_through():
    async with AsyncClient(
        transport=ASGITransport(app=_app()), base_url="http://testserver"
    ) as client:
        response = await client.get("/fine", headers={"Origin": ORIGIN})
    assert response.json() == {"ok": True}
    assert response.headers["access-control-allow-origin"] == ORIGIN


def _shape_app() -> FastAPI:
    from fastapi import HTTPException
    from pydantic import BaseModel

    class Body(BaseModel):
        count: int

    app = FastAPI()

    @app.post("/count")
    async def count(body: Body):
        return body

    @app.get("/gone")
    async def gone():
        raise HTTPException(status_code=404, detail="Not found")

    @app.get("/locked")
    async def locked():
        raise HTTPException(
            status_code=401, detail="Sign in", headers={"WWW-Authenticate": "x"}
        )

    add_json_errors(app)
    return app


async def _call(method: str, path: str, **kw):
    async with AsyncClient(
        transport=ASGITransport(app=_shape_app()), base_url="http://testserver"
    ) as client:
        return await client.request(method, path, **kw)


@pytest.mark.asyncio
async def test_every_error_carries_detail_and_a_router_404_matches_ours():
    router_404 = await _call("GET", "/nowhere")
    ours = await _call("GET", "/gone")
    assert router_404.status_code == ours.status_code == 404
    assert router_404.json() == ours.json() == {"detail": "Not found"}


@pytest.mark.asyncio
async def test_a_422_keeps_its_list_of_msg_but_never_echoes_the_input():
    response = await _call("POST", "/count", json={"count": "secret-value"})
    assert response.status_code == 422
    detail = response.json()["detail"]
    assert isinstance(detail, list) and isinstance(detail[0]["msg"], str)
    assert detail[0]["loc"] == ["body", "count"]
    assert "secret-value" not in response.text
    assert "input" not in detail[0]


@pytest.mark.asyncio
async def test_status_codes_and_headers_are_unchanged():
    assert (await _call("GET", "/count")).status_code == 405
    locked = await _call("GET", "/locked")
    assert locked.status_code == 401
    assert locked.json() == {"detail": "Sign in"}
    assert locked.headers["www-authenticate"] == "x"
