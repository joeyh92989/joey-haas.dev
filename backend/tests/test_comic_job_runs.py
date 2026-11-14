"""The followed comics refresh and the comic tag job each leave a
catalogue_runs row, read back by GET /api/comics/status (the Jobs page)."""

import pytest
from fastapi import FastAPI
from httpx2 import ASGITransport, AsyncClient
from sqlalchemy import select
from starlette.middleware.sessions import SessionMiddleware

from comics_routes import create_comics_router
from llm import LLMError
from models import CatalogueRun
from tests.test_comic_tags_job import StubProvider, _leave, _series
from tests.test_comic_tags_job import client_for as tags_client
from tests.test_comics_routes import SAGA_ISSUES, FakeComicVine, _seed
from tests.test_comics_routes import client_for as refresh_client

pytestmark = pytest.mark.asyncio


async def _runs(factory, source) -> list[CatalogueRun]:
    async with factory() as session:
        return list(
            await session.scalars(
                select(CatalogueRun)
                .where(CatalogueRun.source == source)
                .order_by(CatalogueRun.started_at)
            )
        )


async def test_status_has_all_three_keys_null_before_any_run(sessionmaker_for_test):
    async with refresh_client(sessionmaker_for_test, FakeComicVine()) as client:
        body = (await client.get("/api/comics/status")).json()
    assert body == {
        "issues.last_run": None,
        "refresh.last_run": None,
        "tags.last_run": None,
    }


# --- the followed comics refresh --------------------------------------------


async def test_a_clean_refresh_is_recorded_ok(sessionmaker_for_test):
    await _seed(sessionmaker_for_test, following=True)
    source = FakeComicVine({"4363": SAGA_ISSUES})
    async with refresh_client(sessionmaker_for_test, source) as client:
        body = (await client.post("/api/comics/refresh")).json()
        status = (await client.get("/api/comics/status")).json()
    assert body["ok"] is True and body["refreshed"] == 1
    (run,) = await _runs(sessionmaker_for_test, "comic_refresh")
    assert run.ok is True and run.finished_at is not None
    assert (run.rows_seen, run.rows_changed, run.errors) == (1, 1, [])
    summary = status["refresh.last_run"]
    assert summary["state"] == "ok" and summary["ok"] is True
    assert status["tags.last_run"] is None


async def test_a_refresh_with_a_failing_series_is_recorded_failed(
    sessionmaker_for_test,
):
    await _seed(sessionmaker_for_test, following=True)
    broken = await _seed(
        sessionmaker_for_test, title="Broken", external_id="77", following=True
    )
    source = FakeComicVine({"4363": SAGA_ISSUES})
    source.fail = {"77"}
    async with refresh_client(sessionmaker_for_test, source) as client:
        body = (await client.post("/api/comics/refresh")).json()
        status = (await client.get("/api/comics/status")).json()
    assert body["ok"] is False and len(body["errors"]) == 1
    (run,) = await _runs(sessionmaker_for_test, "comic_refresh")
    assert run.ok is False
    assert (run.rows_seen, run.rows_changed) == (2, 1)
    assert run.errors[0]["code"] == "source_error"
    assert run.errors[0]["item_id"] == str(broken)
    summary = status["refresh.last_run"]
    assert summary["state"] == "failed" and summary["ok"] is False
    assert summary["note"].startswith("1 of 2 series failed: Broken")


async def test_a_crashing_refresh_is_recorded_and_still_raises(
    sessionmaker_for_test,
):
    await _seed(sessionmaker_for_test, following=True)
    source = FakeComicVine({"4363": SAGA_ISSUES})

    async def boom(_external_id):
        raise RuntimeError("database gone")

    source.fetch_issues = boom
    async with refresh_client(sessionmaker_for_test, source) as client:
        with pytest.raises(RuntimeError):
            await client.post("/api/comics/refresh")
        status = (await client.get("/api/comics/status")).json()
    (run,) = await _runs(sessionmaker_for_test, "comic_refresh")
    assert run.ok is False
    assert run.errors[0]["code"] == "exception"
    assert status["refresh.last_run"]["state"] == "failed"
    assert "database gone" in status["refresh.last_run"]["note"]


async def test_a_second_refresh_meanwhile_leaves_no_run(sessionmaker_for_test):
    import asyncio

    lock = asyncio.Lock()
    async with refresh_client(sessionmaker_for_test, FakeComicVine(), lock) as client:
        await lock.acquire()
        try:
            response = await client.post("/api/comics/refresh")
        finally:
            lock.release()
    assert response.status_code == 409
    assert await _runs(sessionmaker_for_test, "comic_refresh") == []


# --- the comic tag job -------------------------------------------------------


async def test_a_clean_tag_run_is_recorded_ok(sessionmaker_for_test):
    await _series(sessionmaker_for_test, "A")
    async with tags_client(sessionmaker_for_test, StubProvider()) as client:
        await client.post("/api/comics/tags/generate")
        status = (await client.get("/api/comics/status")).json()
    (run,) = await _runs(sessionmaker_for_test, "comic_tags")
    assert run.ok is True and run.short_run is False
    assert (run.rows_seen, run.rows_changed, run.unresolved_remaining) == (1, 1, 0)
    assert status["tags.last_run"]["state"] == "ok"


async def test_a_nothing_to_tag_run_is_ok(sessionmaker_for_test):
    async with tags_client(sessionmaker_for_test, StubProvider()) as client:
        await client.post("/api/comics/tags/generate")
        status = (await client.get("/api/comics/status")).json()
    assert status["tags.last_run"]["state"] == "ok"


async def test_a_budget_stop_is_recorded_partial(sessionmaker_for_test):
    for title in "ABC":
        await _series(sessionmaker_for_test, title)
    async with tags_client(sessionmaker_for_test, StubProvider()) as client:
        await client.post("/api/comics/tags/generate?budget=1")
        status = (await client.get("/api/comics/status")).json()
    (run,) = await _runs(sessionmaker_for_test, "comic_tags")
    assert run.ok is True and run.short_run is True
    assert run.unresolved_remaining == 2
    assert status["tags.last_run"] == {
        "at": status["tags.last_run"]["at"],
        "state": "partial",
        "ok": True,
        "note": "Budget spent; 2 series wait",
    }


async def test_nothing_left_today_is_partial_not_failed(sessionmaker_for_test):
    await _series(sessionmaker_for_test, "A")
    await _leave(sessionmaker_for_test, 0)
    async with tags_client(sessionmaker_for_test, StubProvider()) as client:
        await client.post("/api/comics/tags/generate")
        status = (await client.get("/api/comics/status")).json()
    assert status["tags.last_run"]["state"] == "partial"
    assert status["tags.last_run"]["note"] == "Budget spent; 1 series waits"


async def test_a_model_error_is_recorded_failed_with_its_reason(
    sessionmaker_for_test,
):
    await _series(sessionmaker_for_test, "A")
    await _series(sessionmaker_for_test, "B")
    provider = StubProvider({"tags": [99]}, LLMError("429 quota"))
    async with tags_client(sessionmaker_for_test, provider) as client:
        body = (await client.post("/api/comics/tags/generate")).json()
        status = (await client.get("/api/comics/status")).json()
    assert body["ok"] is False and body["stopped"] == "model error"
    (run,) = await _runs(sessionmaker_for_test, "comic_tags")
    assert run.ok is False
    summary = status["tags.last_run"]
    assert summary["state"] == "failed"
    assert summary["note"] == "Tagging stopped: B: 429 quota"


async def test_a_missing_model_is_recorded_failed(sessionmaker_for_test):
    await _series(sessionmaker_for_test, "A")

    def no_key():
        raise LLMError("GEMINI_API_KEY is not set")

    async with _no_model_client(sessionmaker_for_test, no_key) as client:
        await client.post("/api/comics/tags/generate")
        status = (await client.get("/api/comics/status")).json()
    assert status["tags.last_run"]["state"] == "failed"
    assert "GEMINI_API_KEY" in status["tags.last_run"]["note"]


async def test_no_provider_503_is_recorded_failed(sessionmaker_for_test):
    app = FastAPI()
    app.include_router(create_comics_router(sessionmaker_for_test, {}, None, None))

    @app.middleware("http")
    async def _sign_in(request, call_next):
        request.session["user"] = {"sub": "1", "email": "admin@example.com"}
        return await call_next(request)

    app.add_middleware(SessionMiddleware, secret_key="test-secret", https_only=False)
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        response = await client.post("/api/comics/tags/generate")
        status = (await client.get("/api/comics/status")).json()
    assert response.status_code == 503
    assert status["tags.last_run"]["state"] == "failed"
    assert "No model is configured" in status["tags.last_run"]["note"]


def _no_model_client(factory, provider_factory):
    from contextlib import asynccontextmanager

    @asynccontextmanager
    async def build():
        app = FastAPI()
        app.include_router(
            create_comics_router(factory, {}, None, provider_factory=provider_factory)
        )

        @app.middleware("http")
        async def _sign_in(request, call_next):
            request.session["user"] = {"sub": "1", "email": "admin@example.com"}
            return await call_next(request)

        app.add_middleware(
            SessionMiddleware, secret_key="test-secret", https_only=False
        )
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://testserver"
        ) as client:
            yield client

    return build()
