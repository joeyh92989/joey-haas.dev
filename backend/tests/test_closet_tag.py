"""Garment tagging: closet_tag.py (pure) and the tag routes in closet_routes.py."""

import ast
import asyncio
import io
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from fastapi import FastAPI
from httpx2 import ASGITransport, AsyncClient
from PIL import Image as PILImage
from sqlalchemy import select
from starlette.middleware.sessions import SessionMiddleware

import closet_tag
from closet_routes import create_closet_router
from closet_tag import BATCH_SIZE, TAG_SCHEMA, TagBatchError, build_prompt, validate
from llm import LLMError, _quota_message, to_gemini_schema
from models import (
    ClosetProfile,
    ClosetSetting,
    Garment,
    GarmentCategory,
    GarmentImage,
    GarmentStatus,
    GarmentTagSource,
)

BACKEND = Path(__file__).resolve().parent.parent


def attrs(n: int, **over) -> dict:
    return {
        "name": f"shirt {n}",
        "category": "top",
        "subtype": "oxford",
        "primary_color": "navy",
        "primary_hex": "#1F2A44",
        "warmth": 2,
        "formality": 3,
        "seasons": [3, 1, 2, 2],
        **over,
    }


def answer(indices) -> dict:
    return {"items": [{"index": i, "attributes": attrs(i)} for i in indices]}


# --- pure -------------------------------------------------------------------


def test_validate_returns_one_entry_per_photo_in_index_order():
    tagged = validate(answer([2, 0, 1]), 3)
    assert [t.attributes["name"] for t in tagged] == ["shirt 0", "shirt 1", "shirt 2"]
    first = tagged[0].attributes
    assert first["category"] == "top"
    assert first["primary_hex"] == "#1f2a44"
    assert first["seasons"] == [1, 2, 3]
    assert first["brand"] is None and first["secondary_hex"] is None


@pytest.mark.parametrize(
    "indices", [[0, 2], [0, 1, 1], [0, 1, 2, 3], [1, 2, 3], [], ["0", 1, 2]]
)
def test_indices_other_than_exactly_0_to_n_minus_1_reject_the_batch(indices):
    with pytest.raises(TagBatchError):
        validate(answer(indices), 3)


@pytest.mark.parametrize("payload", [None, [], {}, {"items": "no"}])
def test_an_answer_without_items_is_rejected(payload):
    with pytest.raises(TagBatchError):
        validate(payload, 1)


@pytest.mark.parametrize("category", [None, "dress", "TOP"])
def test_an_unknown_category_rejects_the_batch(category):
    payload = {"items": [{"index": 0, "attributes": attrs(0, category=category)}]}
    with pytest.raises(TagBatchError, match="category"):
        validate(payload, 1)


def test_bad_values_are_dropped_not_written():
    payload = {
        "items": [
            {
                "index": 0,
                "attributes": attrs(
                    0,
                    name="  a   very " + "long " * 40,
                    primary_hex="navy",
                    secondary_hex="#12345",
                    warmth=7,
                    formality=True,
                    seasons=[0, 13, "4", 5],
                ),
            }
        ]
    }
    got = validate(payload, 1)[0].attributes
    assert len(got["name"]) == 120 and got["name"].startswith("a very long")
    assert got["primary_hex"] is None and got["secondary_hex"] is None
    assert got["warmth"] is None and got["formality"] is None
    assert got["seasons"] == [5]


def test_text_limits_are_the_columns_widths():
    for name, limit in closet_tag.TEXT_LIMITS.items():
        assert Garment.__table__.c[name].type.length == limit
    assert set(closet_tag.CATEGORIES) == {c.value for c in GarmentCategory}


def test_the_prompt_names_the_count_and_refuses_an_oversize_batch():
    assert "indices 0 to 9" in build_prompt(10)
    assert "There is 1 photograph, index 0." in build_prompt(1)
    with pytest.raises(ValueError):
        build_prompt(BATCH_SIZE + 1)
    with pytest.raises(ValueError):
        build_prompt(0)


def test_the_schema_converts_for_gemini():
    converted = to_gemini_schema(TAG_SCHEMA)
    assert "additionalProperties" not in str(converted)


def test_the_module_stays_pure():
    tree = ast.parse((BACKEND / "closet_tag.py").read_text())
    imported = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            imported |= {alias.name.split(".")[0] for alias in node.names}
        elif isinstance(node, ast.ImportFrom) and node.module:
            imported.add(node.module.split(".")[0])
    assert not imported & {"fastapi", "sqlalchemy", "models", "db", "llm"}


# --- routes -----------------------------------------------------------------


class FakeProvider:
    """Answers each call from `answers` in turn (a dict, or an exception to
    raise), recording the prompts and image counts it was sent."""

    def __init__(self, *answers):
        self.answers = list(answers)
        self.calls: list[tuple[str, int]] = []

    async def complete_json(self, prompt, schema, images=None):
        self.calls.append((prompt, len(images or [])))
        assert all(image.media_type == "image/webp" for image in images or [])
        item = self.answers.pop(0) if self.answers else None
        if isinstance(item, Exception):
            raise item
        if callable(item):  # an answer shaped to the batch
            return item(len(images or []))
        return item


def full(count: int) -> dict:
    """A correct answer for a batch of `count`."""
    return answer(range(count))


@asynccontextmanager
async def client_for(factory, provider=None, signed_in=True, no_model=False):
    app = FastAPI()
    app.include_router(
        create_closet_router(
            factory, provider_factory=None if no_model else (lambda: provider)
        )
    )
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


def _webp() -> bytes:
    out = io.BytesIO()
    PILImage.new("RGB", (40, 30), (1, 2, 3)).save(out, format="WEBP")
    return out.getvalue()


async def seed(factory, count: int, **fields) -> list:
    """`count` queued garments with photos, oldest first; returns their ids."""
    start = datetime.now(UTC) - timedelta(hours=1)
    ids = []
    async with factory() as session:
        for offset in range(count):
            row = Garment(
                **{
                    "status": GarmentStatus.UNTAGGED,
                    "seasons": [],
                    "tag_attempts": 0,
                    "created_at": start + timedelta(seconds=offset),
                    **fields,
                }
            )
            session.add(row)
            await session.flush()
            session.add(
                GarmentImage(garment_id=row.id, webp=_webp(), width=40, height=30)
            )
            ids.append(row.id)
        await session.commit()
    return ids


async def rows(factory, ids) -> list[Garment]:
    async with factory() as session:
        found = {
            row.id: row
            for row in (
                await session.scalars(select(Garment).where(Garment.id.in_(ids)))
            ).all()
        }
    return [found[i] for i in ids]


@pytest.mark.asyncio
async def test_tag_routes_are_401_signed_out(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test, signed_in=False) as client:
        assert (await client.post("/api/closet/tag")).status_code == 401
        assert (await client.post("/api/closet/jobs/tag")).status_code == 401


@pytest.mark.asyncio
async def test_a_batch_fills_attributes_in_order(sessionmaker_for_test):
    ids = await seed(sessionmaker_for_test, 3)
    provider = FakeProvider(answer([1, 2, 0]))
    async with client_for(sessionmaker_for_test, provider) as client:
        response = await client.post("/api/closet/tag")
    assert response.status_code == 200
    assert response.json() == {"tagged": 3, "calls": 1, "note": None, "remaining": 0}
    assert provider.calls[0][1] == 3
    tagged = await rows(sessionmaker_for_test, ids)
    assert [row.name for row in tagged] == ["shirt 0", "shirt 1", "shirt 2"]
    assert all(row.status == GarmentStatus.ACTIVE for row in tagged)
    assert all(row.tag_source == GarmentTagSource.MODEL for row in tagged)
    assert tagged[0].category == GarmentCategory.TOP
    assert tagged[0].primary_hex == "#1f2a44"
    assert tagged[0].seasons == [1, 2, 3]


@pytest.mark.asyncio
async def test_the_button_takes_one_batch_of_at_most_ten_oldest_first(
    sessionmaker_for_test,
):
    ids = await seed(sessionmaker_for_test, 12)
    provider = FakeProvider(full)
    async with client_for(sessionmaker_for_test, provider) as client:
        body = (await client.post("/api/closet/tag")).json()
    assert body == {"tagged": 10, "calls": 1, "note": None, "remaining": 2}
    tagged = await rows(sessionmaker_for_test, ids)
    assert [row.status for row in tagged] == [GarmentStatus.ACTIVE] * 10 + [
        GarmentStatus.UNTAGGED
    ] * 2


@pytest.mark.asyncio
async def test_an_index_gap_rejects_the_batch_and_counts_a_strike(
    sessionmaker_for_test,
):
    ids = await seed(sessionmaker_for_test, 3)
    provider = FakeProvider(answer([0, 2]))
    async with client_for(sessionmaker_for_test, provider) as client:
        body = (await client.post("/api/closet/tag")).json()
    assert body["tagged"] == 0 and body["remaining"] == 3
    assert "stay queued" in body["note"]
    left = await rows(sessionmaker_for_test, ids)
    assert all(row.status == GarmentStatus.UNTAGGED for row in left)
    assert all(row.tag_source is None and row.name is None for row in left)
    assert [row.tag_attempts for row in left] == [1, 1, 1]


@pytest.mark.asyncio
async def test_the_job_stops_at_the_budget(sessionmaker_for_test):
    await seed(sessionmaker_for_test, 25)
    async with sessionmaker_for_test() as session:
        session.add(ClosetProfile(id=1, tag_budget=2))
        await session.commit()
    provider = FakeProvider(full, full, full)
    async with client_for(sessionmaker_for_test, provider) as client:
        body = (await client.post("/api/closet/jobs/tag")).json()
    assert len(provider.calls) == 2
    assert body["state"] == "ok"
    assert (body["tagged"], body["calls"], body["remaining"]) == (20, 2, 5)
    async with sessionmaker_for_test() as session:
        stored = await session.get(ClosetSetting, "tag.last_run")
    assert stored.value["tagged"] == 20 and stored.value["at"]


@pytest.mark.asyncio
async def test_the_job_stops_when_the_queue_is_empty(sessionmaker_for_test):
    await seed(sessionmaker_for_test, 12)
    provider = FakeProvider(full, full, full)
    async with client_for(sessionmaker_for_test, provider) as client:
        body = (await client.post("/api/closet/jobs/tag")).json()
    assert len(provider.calls) == 2
    assert (body["state"], body["tagged"], body["remaining"]) == ("ok", 12, 0)
    async with client_for(sessionmaker_for_test, provider) as client:
        again = (await client.post("/api/closet/jobs/tag")).json()
    assert (again["state"], again["calls"]) == ("empty", 0)


@pytest.mark.asyncio
async def test_a_budget_of_zero_turns_the_job_off(sessionmaker_for_test):
    await seed(sessionmaker_for_test, 2)
    async with sessionmaker_for_test() as session:
        session.add(ClosetProfile(id=1, tag_budget=0))
        await session.commit()
    provider = FakeProvider(full)
    async with client_for(sessionmaker_for_test, provider) as client:
        body = (await client.post("/api/closet/jobs/tag")).json()
    assert provider.calls == []
    assert (body["state"], body["remaining"]) == ("off", 2)


def _daily_quota() -> LLMError:
    body = {
        "error": {
            "details": [
                {
                    "violations": [
                        {"quotaId": "GenerateRequestsPerDayPerProjectPerModel"}
                    ]
                }
            ]
        }
    }
    return LLMError(_quota_message(body, 3))


@pytest.mark.asyncio
async def test_a_quota_error_stops_the_job_with_the_owners_note(sessionmaker_for_test):
    ids = await seed(sessionmaker_for_test, 15)
    provider = FakeProvider(full, _daily_quota(), full)
    async with client_for(sessionmaker_for_test, provider) as client:
        body = (await client.post("/api/closet/jobs/tag")).json()
    assert len(provider.calls) == 2
    assert body["state"] == "stopped"
    assert body["note"] == "Gemini's daily quota is used up"
    assert (body["tagged"], body["remaining"]) == (10, 5)
    # A quota says nothing about the photos: no strike.
    assert [row.tag_attempts for row in await rows(sessionmaker_for_test, ids)][
        10:
    ] == [0] * 5
    async with sessionmaker_for_test() as session:
        stored = await session.get(ClosetSetting, "tag.last_run")
    assert stored.value["note"] == "Gemini's daily quota is used up"


@pytest.mark.asyncio
async def test_an_unexplained_model_error_counts_a_strike(sessionmaker_for_test):
    ids = await seed(sessionmaker_for_test, 2)
    provider = FakeProvider(LLMError("Gemini refused the request"))
    async with client_for(sessionmaker_for_test, provider) as client:
        body = (await client.post("/api/closet/tag")).json()
    assert body["note"] == "The model did not answer"
    assert [row.tag_attempts for row in await rows(sessionmaker_for_test, ids)] == [
        1,
        1,
    ]


@pytest.mark.asyncio
async def test_no_model_fails_the_job_without_a_strike(sessionmaker_for_test):
    ids = await seed(sessionmaker_for_test, 2)
    async with client_for(sessionmaker_for_test, no_model=True) as client:
        body = (await client.post("/api/closet/jobs/tag")).json()
    assert (body["state"], body["calls"], body["note"]) == (
        "failed",
        0,
        "No model is configured",
    )
    assert [row.tag_attempts for row in await rows(sessionmaker_for_test, ids)] == [
        0,
        0,
    ]


@pytest.mark.asyncio
async def test_manual_and_three_strike_garments_are_never_taken(
    sessionmaker_for_test,
):
    manual = await seed(sessionmaker_for_test, 1, tag_source=GarmentTagSource.MANUAL)
    struck = await seed(sessionmaker_for_test, 1, tag_attempts=3)
    queued = await seed(sessionmaker_for_test, 1)
    provider = FakeProvider(full)
    async with client_for(sessionmaker_for_test, provider) as client:
        body = (await client.post("/api/closet/tag")).json()
    assert provider.calls[0][1] == 1
    assert (body["tagged"], body["remaining"]) == (1, 0)
    got = await rows(sessionmaker_for_test, manual + struck + queued)
    assert [row.status for row in got] == [
        GarmentStatus.UNTAGGED,
        GarmentStatus.UNTAGGED,
        GarmentStatus.ACTIVE,
    ]
    async with client_for(sessionmaker_for_test, FakeProvider()) as client:
        assert (await client.post("/api/closet/tag")).json()["calls"] == 0


@pytest.mark.asyncio
async def test_a_third_strike_takes_a_garment_out_of_the_queue(sessionmaker_for_test):
    await seed(sessionmaker_for_test, 1, tag_attempts=2)
    provider = FakeProvider({"items": []})
    async with client_for(sessionmaker_for_test, provider) as client:
        body = (await client.post("/api/closet/tag")).json()
    assert body["remaining"] == 0


@pytest.mark.asyncio
async def test_a_hand_save_during_the_model_call_wins(sessionmaker_for_test):
    ids = await seed(sessionmaker_for_test, 2)

    class Racing(FakeProvider):
        async def complete_json(self, prompt, schema, images=None):
            # The owner's hand save lands while the model is thinking.
            async with sessionmaker_for_test() as session:
                row = await session.get(Garment, ids[0])
                row.name = "mine"
                row.tag_source = GarmentTagSource.MANUAL
                row.status = GarmentStatus.ACTIVE
                await session.commit()
            return full(len(images))

    async with client_for(sessionmaker_for_test, Racing()) as client:
        body = (await client.post("/api/closet/tag")).json()
    assert body["tagged"] == 1
    got = await rows(sessionmaker_for_test, ids)
    assert (got[0].name, got[0].tag_source) == ("mine", GarmentTagSource.MANUAL)
    assert got[1].tag_source == GarmentTagSource.MODEL


@pytest.mark.asyncio
async def test_a_second_run_while_one_runs_is_a_409(sessionmaker_for_test):
    lock = asyncio.Lock()
    app = FastAPI()
    app.include_router(create_closet_router(sessionmaker_for_test, lock=lock))

    @app.middleware("http")
    async def _sign_in(request, call_next):
        request.session["user"] = {"sub": "1", "email": "admin@example.com"}
        return await call_next(request)

    app.add_middleware(SessionMiddleware, secret_key="test-secret", https_only=False)
    async with (
        lock,
        AsyncClient(
            transport=ASGITransport(app=app), base_url="http://testserver"
        ) as client,
    ):
        assert (await client.post("/api/closet/tag")).status_code == 409
        assert (await client.post("/api/closet/jobs/tag")).status_code == 409
