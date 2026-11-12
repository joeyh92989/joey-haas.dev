"""The free-tier budget: counts per model and Pacific day (spec D3)."""

from __future__ import annotations

from dataclasses import replace
from datetime import UTC, date, datetime

import pytest
from sqlalchemy import select

from config import Config
from intake.budget import (
    DAILY_REQUESTS,
    UsageRecorder,
    budget_state,
    pacific_day,
    remaining,
)
from llm import GEMINI_MODELS, ChainedProvider, GeminiProvider, build_provider
from models import LlmUsage
from tests.test_llm import _FakeResponse, _patch_client, _quota_body

# 2026-11-10 20:00 in Denver is 03:00 UTC on the 11th and 19:00 the 10th in
# Los Angeles: a UTC day would already have rolled over.
EVENING = datetime(2026, 11, 11, 3, 0, tzinfo=UTC)


def _config(provider: str = "gemini") -> Config:
    return Config(
        google_client_id="id",
        google_client_secret="secret",
        session_secret="s",
        admin_email="a@example.com",
        frontend_url="http://localhost:5173",
        database_url="postgresql://x",
        database_url_direct="postgresql://x",
        llm_provider=provider,
        gemini_api_key="g",
        anthropic_api_key="a",
    )


@pytest.mark.asyncio
async def _rows(sessionmaker_for_test) -> dict[str, LlmUsage]:
    async with sessionmaker_for_test() as session:
        rows = (await session.scalars(select(LlmUsage))).all()
    return {row.model: row for row in rows}


def test_the_day_is_pacific_not_utc():
    assert pacific_day(EVENING) == date(2026, 11, 10)
    assert pacific_day(datetime(2026, 11, 11, 7, 59, tzinfo=UTC)) == date(2026, 11, 10)
    assert pacific_day(datetime(2026, 11, 11, 8, 0, tzinfo=UTC)) == date(2026, 11, 11)


@pytest.mark.asyncio
async def test_attempts_are_counted_per_model(sessionmaker_for_test):
    recorder = UsageRecorder(sessionmaker_for_test, clock=lambda: EVENING)
    await recorder.attempt("a")
    await recorder.attempt("a")
    await recorder.attempt("b")
    rows = await _rows(sessionmaker_for_test)
    assert {model: row.calls for model, row in rows.items()} == {"a": 2, "b": 1}
    assert all(row.day == date(2026, 11, 10) for row in rows.values())
    assert not any(row.exhausted for row in rows.values())


@pytest.mark.asyncio
async def test_counts_survive_a_rolled_back_request_session(sessionmaker_for_test):
    recorder = UsageRecorder(sessionmaker_for_test, clock=lambda: EVENING)
    async with sessionmaker_for_test() as request_session:
        request_session.add(LlmUsage(day=date(2000, 1, 1), model="request"))
        await request_session.flush()
        await recorder.attempt("a")
        await request_session.rollback()
    rows = await _rows(sessionmaker_for_test)
    assert set(rows) == {"a"}
    assert rows["a"].calls == 1


@pytest.mark.asyncio
async def test_remaining_excludes_exhausted_models_and_the_reserve(
    sessionmaker_for_test,
):
    recorder = UsageRecorder(sessionmaker_for_test, clock=lambda: EVENING)
    for _ in range(5):
        await recorder.attempt(GEMINI_MODELS[0])
    await recorder.attempt(GEMINI_MODELS[1])
    await recorder.exhausted(GEMINI_MODELS[1])
    async with sessionmaker_for_test() as session:
        left = await remaining(session, GEMINI_MODELS, day=date(2026, 11, 10))
        tomorrow = await remaining(session, GEMINI_MODELS, day=date(2026, 11, 11))
    # Model 0: 15 left; model 1: exhausted; the rest untouched, 20 each.
    untouched = len(GEMINI_MODELS) - 2
    assert left == 15 + untouched * DAILY_REQUESTS - 12
    assert tomorrow == len(GEMINI_MODELS) * DAILY_REQUESTS - 12


@pytest.mark.asyncio
async def test_remaining_never_goes_negative(sessionmaker_for_test):
    recorder = UsageRecorder(sessionmaker_for_test, clock=lambda: EVENING)
    for model in GEMINI_MODELS:
        await recorder.exhausted(model)
    async with sessionmaker_for_test() as session:
        assert await remaining(session, GEMINI_MODELS, day=date(2026, 11, 10)) == 0


@pytest.mark.asyncio
async def test_budget_state_resets_at_pacific_midnight(sessionmaker_for_test):
    async with sessionmaker_for_test() as session:
        state = await budget_state(session, _config(), now=EVENING)
    assert state == {
        "remaining": len(GEMINI_MODELS) * DAILY_REQUESTS - 12,
        "enforced": True,
        "resets_at": datetime(2026, 11, 11, 8, 0, tzinfo=UTC),
    }


@pytest.mark.asyncio
async def test_an_anthropic_provider_is_not_enforced(sessionmaker_for_test):
    async with sessionmaker_for_test() as session:
        state = await budget_state(session, _config("anthropic"), now=EVENING)
    assert state["enforced"] is False


@pytest.mark.asyncio
async def test_the_provider_records_each_attempt(monkeypatch, sessionmaker_for_test):
    ok = {"candidates": [{"content": {"parts": [{"text": "{}"}]}}]}
    _patch_client(monkeypatch, [_FakeResponse(503), _FakeResponse(200, ok)])
    recorder = UsageRecorder(sessionmaker_for_test, clock=lambda: EVENING)
    provider = GeminiProvider("key", recorder=recorder)
    assert await provider.complete_json("p", {"type": "object"}) == {}
    rows = await _rows(sessionmaker_for_test)
    # The 503 moves the chain on, and both attempts are counted, each against
    # the model it was sent to.
    assert rows[GEMINI_MODELS[0]].calls == 1
    assert rows[GEMINI_MODELS[1]].calls == 1


@pytest.mark.asyncio
async def test_a_per_day_429_marks_only_that_model(monkeypatch, sessionmaker_for_test):
    ok = {"candidates": [{"content": {"parts": [{"text": "{}"}]}}]}
    _patch_client(
        monkeypatch,
        [
            _FakeResponse(429, _quota_body("GenerateRequestsPerDayPerProjectPerModel")),
            _FakeResponse(429, _quota_body("GenerateRequestsPerMinutePerProject")),
            _FakeResponse(200, ok),
        ],
    )
    recorder = UsageRecorder(sessionmaker_for_test, clock=lambda: EVENING)
    provider = GeminiProvider("key", recorder=recorder)
    await provider.complete_json("p", {"type": "object"})
    rows = await _rows(sessionmaker_for_test)
    assert rows[GEMINI_MODELS[0]].exhausted is True
    assert rows[GEMINI_MODELS[1]].exhausted is False
    # The third model answers, so the chain stops there.
    assert {model: row.calls for model, row in rows.items()} == dict.fromkeys(
        GEMINI_MODELS[:3], 1
    )


def test_build_provider_hands_the_recorder_to_gemini():
    recorder = UsageRecorder(session_factory=None)
    gemini_only = _config()  # an Anthropic key, but the paid link is off
    provider = build_provider(gemini_only, recorder)
    assert isinstance(provider, GeminiProvider)
    assert provider._recorder is recorder
    assert build_provider(gemini_only).__class__ is GeminiProvider
    # With the paid link, the recorder still reaches the Gemini half: every
    # free-tier attempt is counted whoever ends up answering.
    chained = build_provider(replace(_config(), llm_paid_fallback=True), recorder)
    assert isinstance(chained, ChainedProvider)
    assert chained._gemini._recorder is recorder


@pytest.mark.parametrize("provider", ["anthropic"])
def test_build_provider_ignores_the_recorder_elsewhere(provider):
    built = build_provider(_config(provider), recorder=None)
    assert not isinstance(built, GeminiProvider)
