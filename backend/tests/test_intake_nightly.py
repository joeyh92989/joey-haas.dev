"""The nightly intake job (spec D4): expire sittings untouched for thirty
days, then read waiting shelf photos while the free tier has calls left
above the reserve. The provider is a stub that counts each call in
`llm_usage` as the real recorder would; no model call is spent."""

from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta

import pytest
from fastapi import FastAPI
from httpx2 import ASGITransport, AsyncClient
from sqlalchemy import func, select, update
from starlette.middleware.sessions import SessionMiddleware

from intake.budget import RESERVE, pacific_day
from intake.nightly import EXPIRE_AFTER, LAST_RUN_KEY, expire_sittings
from intake.routes import create_intake_router
from llm import FREE_TIER_DAILY_REQUESTS, GEMINI_MODELS, LLMError
from models import (
    IntakeArea,
    IntakeEntry,
    IntakePhoto,
    IntakePhotoState,
    IntakeSetting,
    IntakeSitting,
    LlmUsage,
)
from tests.test_intake_budget import _config
from tests.test_intake_reader import _detections, _registry, _sitting

pytestmark = pytest.mark.asyncio

TOKEN = "test-job-token"
NOW = datetime(2026, 11, 10, 9, tzinfo=UTC)


async def _age(factory, sitting_id, days: float) -> None:
    """Back-date the sitting and everything in it by `days`."""
    at = NOW - timedelta(days=days)
    async with factory() as session:
        await session.execute(
            update(IntakeSitting)
            .where(IntakeSitting.id == sitting_id)
            .values(updated_at=at)
        )
        await session.execute(
            update(IntakePhoto)
            .where(IntakePhoto.sitting_id == sitting_id)
            .values(updated_at=at)
        )
        await session.execute(
            update(IntakeEntry)
            .where(IntakeEntry.sitting_id == sitting_id)
            .values(updated_at=at)
        )
        await session.commit()


async def _count(factory, model, *where) -> int:
    async with factory() as session:
        return await session.scalar(
            select(func.count()).select_from(model).where(*where)
        )


async def test_a_31_day_old_sitting_expires_with_its_photos_and_a_29_day_old_stays(
    sessionmaker_for_test,
):
    old, old_photos = await _sitting(sessionmaker_for_test, photos=2)
    young, young_photos = await _sitting(sessionmaker_for_test, photos=1)
    async with sessionmaker_for_test() as session:
        session.add(IntakeEntry(sitting_id=old, photo_id=old_photos[0], kind="movie"))
        await session.commit()
    await _age(sessionmaker_for_test, old, 31)
    await _age(sessionmaker_for_test, young, 29)

    async with sessionmaker_for_test() as session:
        expired = await expire_sittings(session, NOW)
        await session.commit()

    assert expired == (1, 2)
    assert (
        await _count(sessionmaker_for_test, IntakeSitting, IntakeSitting.id == old) == 0
    )
    assert (
        await _count(sessionmaker_for_test, IntakePhoto, IntakePhoto.sitting_id == old)
        == 0
    )
    assert (
        await _count(sessionmaker_for_test, IntakeEntry, IntakeEntry.sitting_id == old)
        == 0
    )
    assert (
        await _count(sessionmaker_for_test, IntakeSitting, IntakeSitting.id == young)
        == 1
    )
    assert (
        await _count(
            sessionmaker_for_test, IntakePhoto, IntakePhoto.sitting_id == young
        )
        == 1
    )


async def test_a_recently_touched_photo_keeps_an_old_sitting(sessionmaker_for_test):
    sitting_id, (photo_id,) = await _sitting(sessionmaker_for_test, photos=1)
    await _age(sessionmaker_for_test, sitting_id, 40)
    async with sessionmaker_for_test() as session:
        await session.execute(
            update(IntakePhoto)
            .where(IntakePhoto.id == photo_id)
            .values(updated_at=NOW - timedelta(days=2))
        )
        await session.commit()
        assert await expire_sittings(session, NOW) == (0, 0)
    assert EXPIRE_AFTER == timedelta(days=30)


class RecordingProvider:
    """Answers each call with a detection and counts it in `llm_usage`
    against the last Gemini model, as `UsageRecorder.attempt` would."""

    def __init__(self, factory, *, fail=False):
        self._factory = factory
        self._fail = fail
        self.calls = 0

    async def complete_json(self, prompt, schema, images=None):
        self.calls += 1
        day = pacific_day(datetime.now(UTC))
        async with self._factory() as session:
            await session.execute(
                update(LlmUsage)
                .where(LlmUsage.day == day, LlmUsage.model == GEMINI_MODELS[-1])
                .values(calls=LlmUsage.calls + 1)
            )
            await session.commit()
        if self._fail:
            raise LLMError("The model did not answer")
        return _detections("Dune")


async def _leave_calls(factory, left: int) -> None:
    """Spend today's allowance so `left` calls remain above the reserve:
    every model but the last exhausted, the last part used."""
    day = pacific_day(datetime.now(UTC))
    async with factory() as session:
        for model in GEMINI_MODELS[:-1]:
            session.add(LlmUsage(day=day, model=model, calls=0, exhausted=True))
        session.add(
            LlmUsage(
                day=day,
                model=GEMINI_MODELS[-1],
                calls=FREE_TIER_DAILY_REQUESTS - RESERVE - left,
            )
        )
        await session.commit()


@asynccontextmanager
async def job_client(factory, provider_factory, *, token=TOKEN):
    app = FastAPI()
    app.state.job_token = token
    app.include_router(
        create_intake_router(
            factory, _registry(), config=_config(), provider_factory=provider_factory
        )
    )
    app.add_middleware(SessionMiddleware, secret_key="test-secret", https_only=False)
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        yield client


def bearer(value: str = TOKEN) -> dict:
    return {"Authorization": f"Bearer {value}"}


async def test_nightly_reads_until_the_budget_runs_out(sessionmaker_for_test):
    await _sitting(sessionmaker_for_test, photos=2)
    await _sitting(sessionmaker_for_test, photos=2)
    await _leave_calls(sessionmaker_for_test, 3)
    provider = RecordingProvider(sessionmaker_for_test)

    async with job_client(sessionmaker_for_test, lambda: provider) as client:
        response = await client.post("/api/intake/jobs/nightly", headers=bearer())
        assert response.status_code == 200, response.text
        status = (await client.get("/api/intake/status", headers=bearer())).status_code

    body = response.json()
    assert provider.calls == 3
    assert body["state"] == "waiting"
    assert body["ok"] is True
    assert body["read"] == 3
    assert body["waiting"] == 1
    assert body["expired"] == 0
    left = await _count(
        sessionmaker_for_test,
        IntakePhoto,
        IntakePhoto.state == IntakePhotoState.UPLOADED,
    )
    assert left == 1
    async with sessionmaker_for_test() as session:
        stored = await session.get(IntakeSetting, LAST_RUN_KEY)
    assert stored.value == body
    # The status read is the admin page's, not the job's: the token is refused.
    assert status == 401


async def test_nightly_with_nothing_waiting_is_empty_and_spends_nothing(
    sessionmaker_for_test,
):
    await _sitting(sessionmaker_for_test, area=IntakeArea.CLOSET, photos=0)
    provider = RecordingProvider(sessionmaker_for_test)
    async with job_client(sessionmaker_for_test, lambda: provider) as client:
        body = (await client.post("/api/intake/jobs/nightly", headers=bearer())).json()
    assert body["state"] == "empty"
    assert body["read"] == 0
    assert provider.calls == 0


async def test_nightly_expires_before_it_reads(sessionmaker_for_test):
    old, _ = await _sitting(sessionmaker_for_test, photos=1)
    await _age(sessionmaker_for_test, old, 31)
    provider = RecordingProvider(sessionmaker_for_test)
    async with job_client(sessionmaker_for_test, lambda: provider) as client:
        body = (await client.post("/api/intake/jobs/nightly", headers=bearer())).json()
    assert body["expired"] == 1
    assert body["state"] == "empty"
    assert provider.calls == 0


async def test_a_failed_read_stops_the_night(sessionmaker_for_test):
    await _sitting(sessionmaker_for_test, photos=3)
    await _leave_calls(sessionmaker_for_test, 5)
    provider = RecordingProvider(sessionmaker_for_test, fail=True)
    async with job_client(sessionmaker_for_test, lambda: provider) as client:
        body = (await client.post("/api/intake/jobs/nightly", headers=bearer())).json()
    assert provider.calls == 1
    assert body["state"] == "stopped"
    assert body["ok"] is False
    assert body["note"] == "The model did not answer"
    assert body["waiting"] == 2


async def test_no_model_fails_the_night_without_touching_a_photo(
    sessionmaker_for_test,
):
    await _sitting(sessionmaker_for_test, photos=1)

    def missing():
        raise LLMError("GEMINI_API_KEY is not set")

    async with job_client(sessionmaker_for_test, missing) as client:
        body = (await client.post("/api/intake/jobs/nightly", headers=bearer())).json()
    assert body["state"] == "failed"
    assert body["ok"] is False
    assert "No model is configured" in body["note"]
    assert body["waiting"] == 1


@pytest.mark.parametrize("headers", [{}, bearer("nope")])
async def test_a_missing_or_wrong_token_is_refused(sessionmaker_for_test, headers):
    await _sitting(sessionmaker_for_test, photos=1)
    provider = RecordingProvider(sessionmaker_for_test)
    async with job_client(sessionmaker_for_test, lambda: provider) as client:
        response = await client.post("/api/intake/jobs/nightly", headers=headers)
    assert response.status_code == 401
    assert provider.calls == 0
    assert (
        await _count(
            sessionmaker_for_test,
            IntakePhoto,
            IntakePhoto.state == IntakePhotoState.UPLOADED,
        )
        == 1
    )
