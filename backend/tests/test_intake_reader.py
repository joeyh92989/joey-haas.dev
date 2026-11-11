"""The reader: one shelf photo per call, read and matched (spec D2-D4;
AC 12 and 16). The provider and the adapters are stubs of the contracts
the reader depends on, as in `test_importer.py`; no model call is spent."""

from __future__ import annotations

import uuid
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta

import pytest
from fastapi import FastAPI
from httpx2 import ASGITransport, AsyncClient
from sqlalchemy import select, update
from starlette.middleware.sessions import SessionMiddleware

from intake.budget import pacific_day
from intake.reader import read_next
from intake.routes import create_intake_router
from llm import GEMINI_MODELS, LLMError
from models import (
    IntakeArea,
    IntakeEntry,
    IntakePhoto,
    IntakePhotoState,
    IntakeSitting,
    Item,
    ItemStatus,
    ItemType,
    LlmUsage,
)
from sources.base import SourceRateLimited, SourceResult
from tests.test_importer import StubSource
from tests.test_intake_budget import _config

pytestmark = pytest.mark.asyncio


class CountingProvider:
    """Answers each call with the next canned payload, or raises it."""

    def __init__(self, *answers):
        self._answers = list(answers)
        self.calls = 0

    async def complete_json(self, prompt, schema, images=None):
        self.calls += 1
        answer = self._answers.pop(0)
        if isinstance(answer, Exception):
            raise answer
        return answer


def _detections(*titles, media_type="movie"):
    return {"detections": [{"title": t, "media_type": media_type} for t in titles]}


def _registry(source=None):
    return {
        ItemType.MOVIE: source
        or StubSource(
            "tmdb",
            ItemType.MOVIE,
            [
                SourceResult(external_id="438631", title="Dune", year=2021),
                SourceResult(external_id="78", title="Blade Runner", year=1982),
            ],
        )
    }


async def _sitting(factory, area=IntakeArea.SHELF, photos=1) -> tuple:
    async with factory() as session:
        sitting = IntakeSitting(area=area)
        session.add(sitting)
        await session.flush()
        ids = []
        start = datetime(2026, 11, 10, tzinfo=UTC)
        for n in range(photos):
            photo = IntakePhoto(
                sitting_id=sitting.id,
                filename=f"shelf-{n}.jpg",
                reading_jpeg=b"\xff\xd8shelf",
                thumb_webp=b"webp",
                width=10,
                height=10,
                created_at=start + timedelta(minutes=n),
            )
            session.add(photo)
            await session.flush()
            ids.append(photo.id)
        await session.commit()
        return sitting.id, ids


async def _photo(factory, photo_id) -> IntakePhoto:
    async with factory() as session:
        return await session.get(IntakePhoto, photo_id)


async def _entries(factory, sitting_id) -> list[IntakeEntry]:
    async with factory() as session:
        return list(
            (
                await session.scalars(
                    select(IntakeEntry)
                    .where(IntakeEntry.sitting_id == sitting_id)
                    .order_by(IntakeEntry.created_at, IntakeEntry.id)
                )
            ).all()
        )


async def _read(factory, sitting_id, provider, budget=10, registry=None):
    async with factory() as session:
        return await read_next(
            session,
            sitting_id,
            provider,
            budget,
            registry=registry if registry is not None else _registry(),
        )


async def test_one_photo_reads_into_entries_with_confidences(sessionmaker_for_test):
    sitting_id, (first, second) = await _sitting(sessionmaker_for_test, photos=2)
    async with sessionmaker_for_test() as session:
        session.add(
            Item(
                type=ItemType.MOVIE,
                title="Blade Runner",
                status=ItemStatus.BACKLOG,
                external_source="tmdb",
                external_id="78",
            )
        )
        await session.commit()
    provider = CountingProvider(_detections("Dune", "Blade Runner", "Arrival"))

    outcome = await _read(sessionmaker_for_test, sitting_id, provider)

    assert outcome.status == "read"
    assert outcome.photo.id == first  # the oldest waiting photo
    photo = await _photo(sessionmaker_for_test, first)
    assert photo.state is IntakePhotoState.READ
    assert photo.reading_jpeg is None
    assert photo.attempts == 1
    assert (await _photo(sessionmaker_for_test, second)).state is (
        IntakePhotoState.UPLOADED
    )
    by_title = {
        e.payload["detected_title"]: e
        for e in await _entries(sessionmaker_for_test, sitting_id)
    }
    assert {t: (e.kind, e.state.value, e.photo_id) for t, e in by_title.items()} == {
        "Dune": ("movie", "exact", first),
        "Blade Runner": ("movie", "owned", first),
        "Arrival": ("movie", "check", first),
    }
    assert by_title["Dune"].chosen["external_id"] == "438631"
    assert len(by_title["Dune"].candidates) == 2
    assert [e.payload["detected_title"] for e in outcome.entries] == [
        "Dune",
        "Blade Runner",
        "Arrival",
    ]


async def test_a_failed_photo_leaves_the_others_readable_and_retries_alone(
    sessionmaker_for_test,
):
    sitting_id, (first, second) = await _sitting(sessionmaker_for_test, photos=2)
    provider = CountingProvider(
        LLMError("The model did not answer"),
        _detections("Dune"),
        _detections("Blade Runner"),
    )
    registry = _registry()
    async with reader_client(sessionmaker_for_test, registry, provider) as client:
        failed = await client.post(f"/api/intake/sittings/{sitting_id}/read-next")
        assert failed.status_code == 200, failed.text
        assert failed.json()["status"] == "failed"
        assert failed.json()["photo"]["error"] == "The model did not answer"

        read = (
            await client.post(f"/api/intake/sittings/{sitting_id}/read-next")
        ).json()
        assert read["status"] == "read"
        assert read["photo"]["id"] == str(second)

        idle = (
            await client.post(f"/api/intake/sittings/{sitting_id}/read-next")
        ).json()
        assert idle["status"] == "idle"  # a failed photo waits for Retry

        retried = await client.post(f"/api/intake/photos/{first}/retry")
        assert retried.status_code == 200, retried.text
        again = (
            await client.post(f"/api/intake/sittings/{sitting_id}/read-next")
        ).json()
    assert again["status"] == "read"
    assert again["photo"]["id"] == str(first)
    assert [e["payload"]["detected_title"] for e in again["entries"]] == [
        "Blade Runner"
    ]
    assert provider.calls == 3
    photo = await _photo(sessionmaker_for_test, first)
    assert photo.attempts == 2
    assert photo.error is None
    assert photo.reading_jpeg is None


async def test_a_spent_budget_waits_and_reads_once_the_day_rolls(
    sessionmaker_for_test,
):
    sitting_id, (photo_id,) = await _sitting(sessionmaker_for_test)
    today = pacific_day(datetime.now(UTC))
    async with sessionmaker_for_test() as session:
        for model in GEMINI_MODELS:
            session.add(LlmUsage(day=today, model=model, calls=0, exhausted=True))
        await session.commit()
    provider = CountingProvider(_detections("Dune"))
    async with reader_client(sessionmaker_for_test, _registry(), provider) as client:
        waiting = (
            await client.post(f"/api/intake/sittings/{sitting_id}/read-next")
        ).json()
        assert waiting["status"] == "waiting"
        assert provider.calls == 0
        photo = await _photo(sessionmaker_for_test, photo_id)
        assert photo.state is IntakePhotoState.UPLOADED
        assert photo.reading_jpeg  # still stored for tomorrow

        async with sessionmaker_for_test() as session:
            await session.execute(
                update(LlmUsage).values(day=today - timedelta(days=1))
            )
            await session.commit()
        read = (
            await client.post(f"/api/intake/sittings/{sitting_id}/read-next")
        ).json()
    assert read["status"] == "read"
    assert provider.calls == 1


async def test_a_zero_budget_changes_nothing(sessionmaker_for_test):
    sitting_id, (photo_id,) = await _sitting(sessionmaker_for_test)
    provider = CountingProvider(_detections("Dune"))
    outcome = await _read(sessionmaker_for_test, sitting_id, provider, budget=0)
    assert outcome.status == "waiting"
    assert outcome.photo is None
    assert provider.calls == 0
    photo = await _photo(sessionmaker_for_test, photo_id)
    assert photo.state is IntakePhotoState.UPLOADED
    assert photo.attempts == 0
    assert await _entries(sessionmaker_for_test, sitting_id) == []


async def test_a_photo_that_reads_nothing_is_empty(sessionmaker_for_test):
    sitting_id, (photo_id,) = await _sitting(sessionmaker_for_test)
    outcome = await _read(
        sessionmaker_for_test, sitting_id, CountingProvider({"detections": []})
    )
    assert outcome.status == "empty"
    photo = await _photo(sessionmaker_for_test, photo_id)
    assert photo.state is IntakePhotoState.EMPTY
    assert photo.reading_jpeg is None
    assert await _entries(sessionmaker_for_test, sitting_id) == []


async def test_nothing_waiting_is_idle_without_a_model_call(sessionmaker_for_test):
    sitting_id, _ = await _sitting(sessionmaker_for_test, photos=0)
    provider = CountingProvider()
    outcome = await _read(sessionmaker_for_test, sitting_id, provider)
    assert outcome.status == "idle"
    assert provider.calls == 0


async def test_a_busy_source_leaves_the_entry_reading(sessionmaker_for_test):
    sitting_id, _ = await _sitting(sessionmaker_for_test)
    busy = StubSource(
        "tmdb", ItemType.MOVIE, raises=SourceRateLimited("tmdb", "rate limited")
    )
    await _read(
        sessionmaker_for_test,
        sitting_id,
        CountingProvider(_detections("Dune")),
        registry=_registry(busy),
    )
    (entry,) = await _entries(sessionmaker_for_test, sitting_id)
    assert entry.state.value == "reading"
    assert entry.payload["reason"] == "tmdb is busy, will retry"


async def test_a_closet_sitting_leaves_tagging_to_the_tag_queue(
    sessionmaker_for_test,
):
    sitting_id, _ = await _sitting(
        sessionmaker_for_test, area=IntakeArea.CLOSET, photos=0
    )
    provider = CountingProvider()
    outcome = await _read(sessionmaker_for_test, sitting_id, provider)
    assert outcome.status == "idle"
    assert provider.calls == 0


async def test_read_next_is_404_for_an_unknown_sitting(sessionmaker_for_test):
    async with reader_client(
        sessionmaker_for_test, _registry(), CountingProvider()
    ) as client:
        response = await client.post(f"/api/intake/sittings/{uuid.uuid4()}/read-next")
    assert response.status_code == 404


@asynccontextmanager
async def reader_client(factory, registry, provider):
    app = FastAPI()
    app.include_router(
        create_intake_router(
            factory, registry, config=_config(), provider_factory=lambda: provider
        )
    )

    @app.middleware("http")
    async def _sign_in(request, call_next):
        request.session["user"] = {"sub": "1", "email": "admin@example.com"}
        return await call_next(request)

    app.add_middleware(SessionMiddleware, secret_key="test-secret", https_only=False)
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        yield client
