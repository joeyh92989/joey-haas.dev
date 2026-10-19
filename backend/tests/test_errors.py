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
