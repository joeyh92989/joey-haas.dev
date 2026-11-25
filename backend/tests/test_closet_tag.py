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
    GarmentColorSource,
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


def test_dress_shoes_anchor_four_and_five_is_formal_wear():
    text = " ".join(closet_tag.INSTRUCTIONS.split())
    assert (
        "leather dress shoes or loafers); 5 business formal (a suit, a tie, a tuxedo)"
        in text
    )


def test_the_prompt_anchors_every_formality_level():
    text = " ".join(closet_tag.INSTRUCTIONS.split())
    for anchor in (
        "1 lounge or gym",
        "2 casual",
        "3 smart casual",
        "4 business casual",
        "5 business formal",
    ):
        assert anchor in text


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
    assert response.json() == {
        "tagged": 3,
        "calls": 1,
        "note": None,
        "remaining": 0,
        "retag_remaining": 0,
    }
    assert provider.calls[0][1] == 3
    tagged = await rows(sessionmaker_for_test, ids)
    assert [row.name for row in tagged] == ["shirt 0", "shirt 1", "shirt 2"]
    assert all(row.status == GarmentStatus.ACTIVE for row in tagged)
    assert all(row.tag_source == GarmentTagSource.MODEL for row in tagged)
    assert all(row.tag_scale == closet_tag.SCALE_VERSION for row in tagged)
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
    assert body == {
        "tagged": 10,
        "calls": 1,
        "note": None,
        "remaining": 2,
        "retag_remaining": 0,
    }
    tagged = await rows(sessionmaker_for_test, ids)
    assert [row.status for row in tagged] == [GarmentStatus.ACTIVE] * 10 + [
        GarmentStatus.UNTAGGED
    ] * 2


@pytest.mark.asyncio
async def test_a_rejected_batch_strikes_nobody_and_tries_each_photo_alone(
    sessionmaker_for_test,
):
    ids = await seed(sessionmaker_for_test, 3)
    # The batch's answer has a gap; then photo 0 and 2 answer, photo 1 does not.
    provider = FakeProvider(answer([0, 2]), full, {"items": []}, full)
    async with client_for(sessionmaker_for_test, provider) as client:
        body = (await client.post("/api/closet/tag")).json()
    assert [count for _, count in provider.calls] == [3, 1, 1, 1]
    assert (body["tagged"], body["calls"], body["remaining"]) == (2, 4, 1)
    got = await rows(sessionmaker_for_test, ids)
    assert [row.status for row in got] == [
        GarmentStatus.ACTIVE,
        GarmentStatus.UNTAGGED,
        GarmentStatus.ACTIVE,
    ]
    # Only the single photo whose own answer failed is struck.
    assert [row.tag_attempts for row in got] == [0, 1, 0]


@pytest.mark.asyncio
async def test_a_rejected_batch_alone_strikes_nobody(sessionmaker_for_test):
    ids = await seed(sessionmaker_for_test, 3)
    async with sessionmaker_for_test() as session:
        session.add(ClosetProfile(id=1, tag_budget=1))
        await session.commit()
    provider = FakeProvider(answer([0, 2]))
    async with client_for(sessionmaker_for_test, provider) as client:
        body = (await client.post("/api/closet/jobs/tag")).json()
    assert (body["calls"], body["remaining"], body["state"]) == (1, 3, "ok")
    assert "one at a time" in body["note"]
    left = await rows(sessionmaker_for_test, ids)
    assert all(row.tag_source is None and row.name is None for row in left)
    assert [row.tag_attempts for row in left] == [0, 0, 0]


@pytest.mark.asyncio
async def test_a_single_rejected_photo_counts_a_strike(sessionmaker_for_test):
    ids = await seed(sessionmaker_for_test, 1)
    provider = FakeProvider(answer([1]))
    async with client_for(sessionmaker_for_test, provider) as client:
        body = (await client.post("/api/closet/tag")).json()
    assert (body["tagged"], body["calls"], body["remaining"]) == (0, 1, 1)
    assert "stay queued" in body["note"]
    left = await rows(sessionmaker_for_test, ids)
    assert left[0].status == GarmentStatus.UNTAGGED and left[0].name is None
    assert left[0].tag_attempts == 1


@pytest.mark.asyncio
async def test_the_job_retries_singles_within_its_budget(sessionmaker_for_test):
    await seed(sessionmaker_for_test, 12)
    async with sessionmaker_for_test() as session:
        session.add(ClosetProfile(id=1, tag_budget=3))
        await session.commit()
    provider = FakeProvider(answer([0]), full, full, full)
    async with client_for(sessionmaker_for_test, provider) as client:
        body = (await client.post("/api/closet/jobs/tag")).json()
    # The batch of ten is rejected, then two of its photos alone: three calls.
    assert [count for _, count in provider.calls] == [10, 1, 1]
    assert (body["tagged"], body["calls"], body["remaining"]) == (2, 3, 10)


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
    assert (body["state"], body["ok"]) == ("ok", True)
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
    assert (body["state"], body["ok"]) == ("stopped", False)
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
async def test_an_unexplained_model_error_on_one_photo_counts_a_strike(
    sessionmaker_for_test,
):
    ids = await seed(sessionmaker_for_test, 1)
    provider = FakeProvider(LLMError("Gemini refused the request"))
    async with client_for(sessionmaker_for_test, provider) as client:
        body = (await client.post("/api/closet/tag")).json()
    assert body["note"] == "The model did not answer"
    assert [row.tag_attempts for row in await rows(sessionmaker_for_test, ids)] == [1]


@pytest.mark.asyncio
async def test_an_unexplained_model_error_on_a_batch_retries_singles(
    sessionmaker_for_test,
):
    ids = await seed(sessionmaker_for_test, 2)
    provider = FakeProvider(LLMError("Gemini refused the request"), full, full)
    async with client_for(sessionmaker_for_test, provider) as client:
        body = (await client.post("/api/closet/tag")).json()
    assert (body["tagged"], body["calls"]) == (2, 3)
    assert [row.tag_attempts for row in await rows(sessionmaker_for_test, ids)] == [
        0,
        0,
    ]


@pytest.mark.asyncio
async def test_a_missing_model_key_fails_the_job_without_a_strike(
    sessionmaker_for_test,
):
    ids = await seed(sessionmaker_for_test, 2)

    def no_key():
        # What llm.build_provider raises without GEMINI_API_KEY.
        raise LLMError("LLM_PROVIDER is gemini but GEMINI_API_KEY is not set")

    app = FastAPI()
    app.include_router(
        create_closet_router(sessionmaker_for_test, provider_factory=no_key)
    )

    @app.middleware("http")
    async def _sign_in(request, call_next):
        request.session["user"] = {"sub": "1", "email": "admin@example.com"}
        return await call_next(request)

    app.add_middleware(SessionMiddleware, secret_key="test-secret", https_only=False)
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        body = (await client.post("/api/closet/jobs/tag")).json()
        now = (await client.post("/api/closet/tag")).json()
    assert (body["state"], body["ok"], body["calls"]) == ("failed", False, 0)
    assert "GEMINI_API_KEY" in body["note"]
    assert (now["calls"], now["tagged"], now["remaining"]) == (0, 0, 2)
    assert [row.tag_attempts for row in await rows(sessionmaker_for_test, ids)] == [
        0,
        0,
    ]
    async with sessionmaker_for_test() as session:
        stored = await session.get(ClosetSetting, "tag.last_run")
    assert stored.value["ok"] is False


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


# --- colour guard (#394) ----------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "source", [GarmentColorSource.VENDOR, GarmentColorSource.MANUAL]
)
async def test_a_set_colour_survives_a_tag_run(sessionmaker_for_test, source):
    """Mirrors a seed-imported garment: UNTAGGED, no tag source, colour from
    the store, brand and size set (plan D6)."""
    ids = await seed(
        sessionmaker_for_test,
        1,
        color_source=source,
        color_name="Burgundy",
        primary_color="burgundy",
        primary_hex="#800020",
        secondary_color="cream",
        secondary_hex="#fffdd0",
        brand="Duer",
        size="M",
    )
    provider = FakeProvider(
        {
            "items": [
                {
                    "index": 0,
                    "attributes": attrs(
                        0,
                        primary_color="red",
                        primary_hex="#ff0000",
                        secondary_color="white",
                        secondary_hex="#ffffff",
                        brand="Other",
                        pattern="solid",
                        material="cotton",
                    ),
                }
            ]
        }
    )
    async with client_for(sessionmaker_for_test, provider) as client:
        response = await client.post("/api/closet/tag")
    assert response.json()["tagged"] == 1
    (row,) = await rows(sessionmaker_for_test, ids)
    assert (row.color_name, row.primary_color) == ("Burgundy", "burgundy")
    assert (row.primary_hex, row.secondary_color, row.secondary_hex) == (
        "#800020",
        "cream",
        "#fffdd0",
    )
    assert row.color_source == source
    assert (row.brand, row.size) == ("Duer", "M")
    assert (row.warmth, row.formality, row.seasons) == (2, 3, [1, 2, 3])
    assert (row.pattern, row.material) == ("solid", "cotton")
    assert row.status == GarmentStatus.ACTIVE
    assert row.tag_source == GarmentTagSource.MODEL


@pytest.mark.asyncio
async def test_a_protected_garment_without_a_brand_gets_the_models(
    sessionmaker_for_test,
):
    ids = await seed(
        sessionmaker_for_test,
        1,
        color_source=GarmentColorSource.VENDOR,
        color_name="Burgundy",
        primary_color="burgundy",
    )
    provider = FakeProvider(
        {"items": [{"index": 0, "attributes": attrs(0, brand="Levi's")}]}
    )
    async with client_for(sessionmaker_for_test, provider) as client:
        await client.post("/api/closet/tag")
    (row,) = await rows(sessionmaker_for_test, ids)
    assert row.brand == "Levi's"
    assert row.primary_color == "burgundy"


@pytest.mark.asyncio
async def test_a_garment_with_no_colour_source_is_tagged_and_marked_model(
    sessionmaker_for_test,
):
    ids = await seed(sessionmaker_for_test, 1)
    provider = FakeProvider(answer([0]))
    async with client_for(sessionmaker_for_test, provider) as client:
        await client.post("/api/closet/tag")
    (row,) = await rows(sessionmaker_for_test, ids)
    assert (row.primary_color, row.primary_hex) == ("navy", "#1f2a44")
    assert row.color_source == GarmentColorSource.MODEL
    assert row.color_name is None


@pytest.mark.asyncio
async def test_a_hand_edited_garment_with_a_colour_is_never_retagged(
    sessionmaker_for_test,
):
    ids = await seed(
        sessionmaker_for_test,
        1,
        tag_source=GarmentTagSource.MANUAL,
        color_source=GarmentColorSource.MANUAL,
        color_name="Burgundy",
    )
    provider = FakeProvider(answer([0]))
    async with client_for(sessionmaker_for_test, provider) as client:
        response = await client.post("/api/closet/tag")
    assert response.json()["tagged"] == 0
    assert provider.calls == []
    (row,) = await rows(sessionmaker_for_test, ids)
    assert row.color_name == "Burgundy"


@pytest.mark.asyncio
async def test_a_vendor_name_survives_and_a_manual_one_is_replaced(
    sessionmaker_for_test,
):
    (vendor,) = await seed(
        sessionmaker_for_test,
        1,
        color_source=GarmentColorSource.VENDOR,
        color_name="Burgundy",
        primary_color="burgundy",
        name="Duer No Sweat Pant",
        brand="Duer",
        size="M",
    )
    (manual,) = await seed(
        sessionmaker_for_test,
        1,
        color_source=GarmentColorSource.MANUAL,
        name="my pants",
    )
    provider = FakeProvider(
        {
            "items": [
                {"index": 0, "attributes": attrs(0, name="burgundy pants")},
                {"index": 1, "attributes": attrs(1, name="navy shirt")},
            ]
        }
    )
    async with client_for(sessionmaker_for_test, provider) as client:
        await client.post("/api/closet/tag")
    got_vendor, got_manual = await rows(sessionmaker_for_test, [vendor, manual])
    assert got_vendor.name == "Duer No Sweat Pant"
    assert (got_vendor.warmth, got_vendor.formality) == (2, 3)
    assert got_vendor.status == GarmentStatus.ACTIVE
    assert got_manual.name in {"burgundy pants", "navy shirt"}


# --- the formality re-tag (#548) --------------------------------------------


async def seed_old(factory, count: int = 1, **fields) -> list:
    """Model-tagged pieces on the old scale, as they stand in the closet."""
    return await seed(
        factory,
        count,
        **{
            "status": GarmentStatus.ACTIVE,
            "tag_source": GarmentTagSource.MODEL,
            "color_source": GarmentColorSource.MODEL,
            "tag_scale": 1,
            "name": "piece a",
            "category": GarmentCategory.TOP,
            "subtype": "tee",
            "primary_color": "green",
            "primary_hex": "#00ff00",
            "warmth": 4,
            "formality": 2,
            "seasons": [10, 11],
            **fields,
        },
    )


@pytest.mark.asyncio
async def test_a_model_tagged_piece_gets_only_its_formality_and_scale(
    sessionmaker_for_test,
):
    ids = await seed_old(sessionmaker_for_test)
    before = (await rows(sessionmaker_for_test, ids))[0]
    provider = FakeProvider(full)
    async with client_for(sessionmaker_for_test, provider) as client:
        body = (await client.post("/api/closet/jobs/tag")).json()
    assert (body["tagged"], body["retagged"], body["calls"]) == (0, 1, 1)
    assert (body["remaining"], body["retag_remaining"]) == (0, 0)
    after = (await rows(sessionmaker_for_test, ids))[0]
    assert (before.formality, after.formality) == (2, 3)
    assert (before.tag_scale, after.tag_scale) == (1, closet_tag.SCALE_VERSION)
    for field in (
        "name",
        "category",
        "subtype",
        "primary_color",
        "primary_hex",
        "warmth",
        "seasons",
        "status",
        "tag_source",
        "color_source",
        "tag_attempts",
        "updated_at",
    ):
        assert getattr(after, field) == getattr(before, field), field


@pytest.mark.asyncio
async def test_a_manual_piece_is_never_sent_or_written(sessionmaker_for_test):
    ids = await seed_old(sessionmaker_for_test, tag_source=GarmentTagSource.MANUAL)
    provider = FakeProvider(full)
    async with client_for(sessionmaker_for_test, provider) as client:
        body = (await client.post("/api/closet/jobs/tag")).json()
    assert (body["calls"], body["retag_remaining"]) == (0, 0)
    assert provider.calls == []
    assert body["note"] is None
    got = (await rows(sessionmaker_for_test, ids))[0]
    assert (got.formality, got.tag_scale) == (2, 1)


@pytest.mark.asyncio
async def test_a_vendor_coloured_piece_keeps_its_colours_and_name(
    sessionmaker_for_test,
):
    ids = await seed_old(
        sessionmaker_for_test,
        color_source=GarmentColorSource.VENDOR,
        name="Store title",
        brand="Maker",
        primary_color="Burgundy",
        primary_hex="#800020",
    )
    async with client_for(sessionmaker_for_test, FakeProvider(full)) as client:
        await client.post("/api/closet/jobs/tag")
    got = (await rows(sessionmaker_for_test, ids))[0]
    assert (got.name, got.brand) == ("Store title", "Maker")
    assert (got.primary_color, got.primary_hex) == ("Burgundy", "#800020")
    assert (got.formality, got.color_source) == (3, GarmentColorSource.VENDOR)


@pytest.mark.asyncio
async def test_a_hand_save_during_a_retag_call_wins(sessionmaker_for_test):
    ids = await seed_old(sessionmaker_for_test, 2)

    class Racing(FakeProvider):
        async def complete_json(self, prompt, schema, images=None):
            async with sessionmaker_for_test() as session:
                row = await session.get(Garment, ids[0])
                row.formality = 5
                row.tag_source = GarmentTagSource.MANUAL
                await session.commit()
            return full(len(images))

    async with client_for(sessionmaker_for_test, Racing()) as client:
        await client.post("/api/closet/jobs/tag")
    got = await rows(sessionmaker_for_test, ids)
    assert (got[0].formality, got[0].tag_scale) == (5, 1)
    assert (got[1].formality, got[1].tag_scale) == (3, closet_tag.SCALE_VERSION)


@pytest.mark.asyncio
async def test_first_time_pieces_go_before_re_tags_and_never_share_a_batch(
    sessionmaker_for_test,
):
    old = await seed_old(sessionmaker_for_test, 2)
    new = await seed(sessionmaker_for_test, 2)
    provider = FakeProvider(full, full)
    async with client_for(sessionmaker_for_test, provider) as client:
        body = (await client.post("/api/closet/jobs/tag")).json()
    assert [count for _, count in provider.calls] == [2, 2]
    assert (body["tagged"], body["retagged"]) == (2, 2)
    got = await rows(sessionmaker_for_test, new)
    assert all(row.status == GarmentStatus.ACTIVE for row in got)
    assert all(
        row.tag_scale == closet_tag.SCALE_VERSION
        for row in await rows(sessionmaker_for_test, old)
    )


@pytest.mark.asyncio
async def test_listed_gone_untagged_and_photoless_pieces_are_not_re_tagged(
    sessionmaker_for_test,
):
    for status in (GarmentStatus.LISTED, GarmentStatus.GONE):
        await seed_old(sessionmaker_for_test, status=status)
    async with sessionmaker_for_test() as session:
        session.add(
            Garment(
                status=GarmentStatus.ACTIVE,
                tag_source=GarmentTagSource.MODEL,
                tag_scale=1,
                seasons=[],
            )
        )
        await session.commit()
    packed = await seed_old(sessionmaker_for_test, status=GarmentStatus.PACKED)
    provider = FakeProvider(full)
    async with client_for(sessionmaker_for_test, provider) as client:
        body = (await client.post("/api/closet/jobs/tag")).json()
    assert [count for _, count in provider.calls] == [1]
    assert body["retagged"] == 1
    assert (await rows(sessionmaker_for_test, packed))[0].formality == 3


@pytest.mark.asyncio
async def test_a_single_retag_failure_strikes_and_three_strikes_leave_it_out(
    sessionmaker_for_test,
):
    ids = await seed_old(sessionmaker_for_test, tag_attempts=2)
    provider = FakeProvider({"items": []})
    async with client_for(sessionmaker_for_test, provider) as client:
        body = (await client.post("/api/closet/jobs/tag")).json()
    got = (await rows(sessionmaker_for_test, ids))[0]
    assert (got.tag_attempts, got.formality, got.tag_scale) == (3, 2, 1)
    assert body["retag_remaining"] == 0


@pytest.mark.asyncio
async def test_a_rejected_retag_batch_is_retried_one_at_a_time(sessionmaker_for_test):
    ids = await seed_old(sessionmaker_for_test, 2)
    provider = FakeProvider({"items": []}, full, full)
    async with client_for(sessionmaker_for_test, provider) as client:
        body = (await client.post("/api/closet/jobs/tag")).json()
    assert [count for _, count in provider.calls] == [2, 1, 1]
    assert body["retagged"] == 2
    got = await rows(sessionmaker_for_test, ids)
    assert [row.formality for row in got] == [3, 3]


@pytest.mark.asyncio
async def test_an_unusable_formality_keeps_the_old_one_and_is_not_asked_again(
    sessionmaker_for_test,
):
    ids = await seed_old(sessionmaker_for_test)
    bad = {"items": [{"index": 0, "attributes": attrs(0, formality=9)}]}
    async with client_for(sessionmaker_for_test, FakeProvider(bad)) as client:
        body = (await client.post("/api/closet/jobs/tag")).json()
    got = (await rows(sessionmaker_for_test, ids))[0]
    assert (got.formality, got.tag_scale) == (2, closet_tag.SCALE_VERSION)
    assert body["retag_remaining"] == 0


@pytest.mark.asyncio
async def test_the_job_summary_carries_the_retag_counts_and_note(
    sessionmaker_for_test,
):
    await seed_old(sessionmaker_for_test, 12)
    provider = FakeProvider(full)
    async with client_for(sessionmaker_for_test, provider) as client:
        # A budget of one call: ten re-tagged, two left.
        async with sessionmaker_for_test() as session:
            session.add(ClosetProfile(id=1, tag_budget=1))
            await session.commit()
        body = (await client.post("/api/closet/jobs/tag")).json()
        status = (await client.get("/api/closet/status")).json()["tag.last_run"]
    assert (body["tagged"], body["retagged"], body["retag_remaining"]) == (0, 10, 2)
    assert body["remaining"] == 0
    assert body["note"] == "Formality re-tag: 10 done tonight, 2 left"
    assert status["retagged"] == 10 and status["retag_remaining"] == 2


@pytest.mark.asyncio
async def test_an_error_note_wins_over_the_retag_note(sessionmaker_for_test):
    await seed_old(sessionmaker_for_test, 2)
    provider = FakeProvider(_daily_quota())
    async with client_for(sessionmaker_for_test, provider) as client:
        body = (await client.post("/api/closet/jobs/tag")).json()
    assert body["state"] == "stopped"
    assert body["note"] and not body["note"].startswith("Formality re-tag")
    assert body["retag_remaining"] == 2


@pytest.mark.asyncio
async def test_tag_now_never_takes_the_retag_queue(sessionmaker_for_test):
    ids = await seed_old(sessionmaker_for_test, 2)
    provider = FakeProvider(full)
    async with client_for(sessionmaker_for_test, provider) as client:
        body = (await client.post("/api/closet/tag")).json()
    assert provider.calls == []
    assert (body["calls"], body["remaining"], body["retag_remaining"]) == (0, 0, 2)
    assert all(row.tag_scale == 1 for row in await rows(sessionmaker_for_test, ids))


@pytest.mark.asyncio
async def test_a_retag_answer_with_a_bad_category_still_writes_the_formality(
    sessionmaker_for_test,
):
    ids = await seed_old(sessionmaker_for_test)
    odd = {
        "items": [{"index": 0, "attributes": {"category": "nonsense", "formality": 4}}]
    }
    async with client_for(sessionmaker_for_test, FakeProvider(odd)) as client:
        body = (await client.post("/api/closet/jobs/tag")).json()
    got = (await rows(sessionmaker_for_test, ids))[0]
    assert (got.formality, got.tag_scale, got.category) == (
        4,
        closet_tag.SCALE_VERSION,
        GarmentCategory.TOP,
    )
    assert body["retagged"] == 1 and body["state"] == "ok"
    # The indices check still holds for a re-tag.
    with pytest.raises(TagBatchError):
        validate({"items": [{"index": 1, "attributes": {}}]}, 1, mode="retag")


@pytest.mark.asyncio
async def test_a_budget_of_zero_leaves_no_retag_note(sessionmaker_for_test):
    await seed_old(sessionmaker_for_test, 2)
    async with client_for(sessionmaker_for_test, FakeProvider(full)) as client:
        async with sessionmaker_for_test() as session:
            session.add(ClosetProfile(id=1, tag_budget=0))
            await session.commit()
        body = (await client.post("/api/closet/jobs/tag")).json()
    assert (body["state"], body["calls"], body["retag_remaining"]) == ("off", 0, 2)
    assert body["note"] is None


# --- the fill queue (#549) ---------------------------------------------------


async def seed_partial(factory, count: int = 1, **fields) -> list:
    """Hand-saved pieces with warmth set and formality empty."""
    return await seed(
        factory,
        count,
        **{
            "status": GarmentStatus.ACTIVE,
            "tag_source": GarmentTagSource.MANUAL,
            "name": "piece a",
            "category": GarmentCategory.TOP,
            "primary_color": "green",
            "primary_hex": "#00ff00",
            "warmth": 4,
            "formality": None,
            "tag_scale": 1,
            "seasons": [],
            **fields,
        },
    )


@pytest.mark.asyncio
async def test_a_partial_manual_piece_gets_its_blanks_and_keeps_the_rest(
    sessionmaker_for_test,
):
    ids = await seed_partial(sessionmaker_for_test)
    before = (await rows(sessionmaker_for_test, ids))[0]
    async with client_for(sessionmaker_for_test, FakeProvider(full)) as client:
        body = (await client.post("/api/closet/jobs/tag")).json()
    assert (body["tagged"], body["filled"], body["calls"]) == (0, 1, 1)
    assert (body["fill_remaining"], body["remaining"]) == (0, 0)
    after = (await rows(sessionmaker_for_test, ids))[0]
    assert (before.warmth, before.formality) == (4, None)
    assert (after.warmth, after.formality) == (4, 3)
    assert after.tag_scale == closet_tag.SCALE_VERSION
    for field in (
        "name",
        "category",
        "primary_color",
        "primary_hex",
        "seasons",
        "status",
        "tag_source",
        "tag_attempts",
        "updated_at",
    ):
        assert getattr(after, field) == getattr(before, field), field
    assert after.tag_source == GarmentTagSource.MANUAL


@pytest.mark.asyncio
async def test_a_fill_writes_both_blanks_when_both_are_empty(sessionmaker_for_test):
    ids = await seed_partial(sessionmaker_for_test, warmth=None)
    async with client_for(sessionmaker_for_test, FakeProvider(full)) as client:
        await client.post("/api/closet/jobs/tag")
    got = (await rows(sessionmaker_for_test, ids))[0]
    assert (got.warmth, got.formality) == (2, 3)


@pytest.mark.asyncio
async def test_a_fully_set_manual_piece_is_never_sent(sessionmaker_for_test):
    await seed_partial(sessionmaker_for_test, formality=2)
    provider = FakeProvider(full)
    async with client_for(sessionmaker_for_test, provider) as client:
        body = (await client.post("/api/closet/jobs/tag")).json()
    assert provider.calls == []
    assert (body["calls"], body["filled"], body["fill_remaining"]) == (0, 0, 0)
    assert body["note"] is None


@pytest.mark.asyncio
async def test_a_field_set_by_hand_during_the_fill_call_wins(sessionmaker_for_test):
    ids = await seed_partial(sessionmaker_for_test, warmth=None)

    class Racing(FakeProvider):
        async def complete_json(self, prompt, schema, images=None):
            async with sessionmaker_for_test() as session:
                row = await session.get(Garment, ids[0])
                row.formality = 5
                await session.commit()
            return full(len(images))

    async with client_for(sessionmaker_for_test, Racing()) as client:
        await client.post("/api/closet/jobs/tag")
    got = (await rows(sessionmaker_for_test, ids))[0]
    assert (got.warmth, got.formality) == (2, 5)
    # The formality was not this fill's, so the scale does not claim it.
    assert got.tag_scale == 1


@pytest.mark.asyncio
async def test_a_fill_that_leaves_the_piece_blank_strikes_it(sessionmaker_for_test):
    ids = await seed_partial(sessionmaker_for_test, tag_attempts=2)
    bad = {"items": [{"index": 0, "attributes": attrs(0, formality=9)}]}
    async with client_for(sessionmaker_for_test, FakeProvider(bad)) as client:
        body = (await client.post("/api/closet/jobs/tag")).json()
    got = (await rows(sessionmaker_for_test, ids))[0]
    assert (got.tag_attempts, got.formality, got.tag_scale) == (3, None, 1)
    assert (body["filled"], body["fill_remaining"]) == (0, 0)


@pytest.mark.asyncio
async def test_a_piece_out_of_strikes_leaves_the_fill_queue(sessionmaker_for_test):
    await seed_partial(sessionmaker_for_test, tag_attempts=3)
    provider = FakeProvider(full)
    async with client_for(sessionmaker_for_test, provider) as client:
        body = (await client.post("/api/closet/jobs/tag")).json()
    assert provider.calls == [] and body["fill_remaining"] == 0


@pytest.mark.asyncio
async def test_a_rejected_fill_batch_is_retried_one_at_a_time(sessionmaker_for_test):
    ids = await seed_partial(sessionmaker_for_test, 2)
    provider = FakeProvider({"items": []}, full, full)
    async with client_for(sessionmaker_for_test, provider) as client:
        body = (await client.post("/api/closet/jobs/tag")).json()
    assert [count for _, count in provider.calls] == [2, 1, 1]
    assert body["filled"] == 2
    assert [row.formality for row in await rows(sessionmaker_for_test, ids)] == [3, 3]


@pytest.mark.asyncio
async def test_listed_gone_and_photoless_pieces_are_not_filled(sessionmaker_for_test):
    for status in (GarmentStatus.LISTED, GarmentStatus.GONE):
        await seed_partial(sessionmaker_for_test, status=status)
    async with sessionmaker_for_test() as session:
        session.add(
            Garment(
                status=GarmentStatus.ACTIVE,
                tag_source=GarmentTagSource.MANUAL,
                warmth=3,
                seasons=[],
            )
        )
        await session.commit()
    packed = await seed_partial(sessionmaker_for_test, status=GarmentStatus.PACKED)
    provider = FakeProvider(full)
    async with client_for(sessionmaker_for_test, provider) as client:
        body = (await client.post("/api/closet/jobs/tag")).json()
    assert [count for _, count in provider.calls] == [1]
    assert (body["filled"], body["fill_remaining"]) == (1, 0)
    assert (await rows(sessionmaker_for_test, packed))[0].formality == 3


@pytest.mark.asyncio
async def test_the_order_is_new_then_fill_then_retag_one_mode_per_batch(
    sessionmaker_for_test,
):
    old = await seed_old(sessionmaker_for_test)
    part = await seed_partial(sessionmaker_for_test)
    await seed(sessionmaker_for_test, 1)
    provider = FakeProvider(full, full, full)
    async with client_for(sessionmaker_for_test, provider) as client:
        body = (await client.post("/api/closet/jobs/tag")).json()
    assert [count for _, count in provider.calls] == [1, 1, 1]
    assert (body["tagged"], body["filled"], body["retagged"]) == (1, 1, 1)
    assert (await rows(sessionmaker_for_test, part))[0].formality == 3
    assert (await rows(sessionmaker_for_test, old))[0].tag_scale == (
        closet_tag.SCALE_VERSION
    )


@pytest.mark.asyncio
async def test_the_fill_goes_before_the_retag_when_the_budget_is_short(
    sessionmaker_for_test,
):
    old = await seed_old(sessionmaker_for_test)
    part = await seed_partial(sessionmaker_for_test)
    async with client_for(sessionmaker_for_test, FakeProvider(full)) as client:
        async with sessionmaker_for_test() as session:
            session.add(ClosetProfile(id=1, tag_budget=1))
            await session.commit()
        body = (await client.post("/api/closet/jobs/tag")).json()
    assert (body["filled"], body["retagged"]) == (1, 0)
    assert (await rows(sessionmaker_for_test, part))[0].formality == 3
    assert (await rows(sessionmaker_for_test, old))[0].tag_scale == 1


@pytest.mark.asyncio
async def test_tag_now_never_fills(sessionmaker_for_test):
    ids = await seed_partial(sessionmaker_for_test, 2)
    provider = FakeProvider(full)
    async with client_for(sessionmaker_for_test, provider) as client:
        body = (await client.post("/api/closet/tag")).json()
    assert provider.calls == [] and body["calls"] == 0
    assert all(row.formality is None for row in await rows(sessionmaker_for_test, ids))


@pytest.mark.asyncio
async def test_the_summary_carries_the_fill_counts_and_the_joined_note(
    sessionmaker_for_test,
):
    await seed_partial(sessionmaker_for_test, 12)
    await seed_old(sessionmaker_for_test, 12)
    async with client_for(sessionmaker_for_test, FakeProvider(full, full)) as client:
        async with sessionmaker_for_test() as session:
            session.add(ClosetProfile(id=1, tag_budget=2))
            await session.commit()
        body = (await client.post("/api/closet/jobs/tag")).json()
        status = (await client.get("/api/closet/status")).json()["tag.last_run"]
    # Two calls: ten and two filled, nothing left to fill, so no re-tag yet.
    assert (body["filled"], body["fill_remaining"]) == (12, 0)
    assert (body["retagged"], body["retag_remaining"]) == (0, 12)
    assert body["note"] == (
        "Blanks filled: 12, 0 left · Formality re-tag: 0 done tonight, 12 left"
    )
    assert status["filled"] == 12 and status["fill_remaining"] == 0


@pytest.mark.asyncio
async def test_only_the_parts_with_numbers_join_the_note(sessionmaker_for_test):
    await seed_partial(sessionmaker_for_test, 12)
    async with client_for(sessionmaker_for_test, FakeProvider(full)) as client:
        async with sessionmaker_for_test() as session:
            session.add(ClosetProfile(id=1, tag_budget=1))
            await session.commit()
        body = (await client.post("/api/closet/jobs/tag")).json()
    assert body["note"] == "Blanks filled: 10, 2 left"


@pytest.mark.asyncio
async def test_a_budget_of_zero_leaves_no_fill_note(sessionmaker_for_test):
    await seed_partial(sessionmaker_for_test, 2)
    async with client_for(sessionmaker_for_test, FakeProvider(full)) as client:
        async with sessionmaker_for_test() as session:
            session.add(ClosetProfile(id=1, tag_budget=0))
            await session.commit()
        body = (await client.post("/api/closet/jobs/tag")).json()
    assert (body["state"], body["calls"], body["fill_remaining"]) == ("off", 0, 2)
    assert body["note"] is None


@pytest.mark.asyncio
async def test_a_rejected_single_fill_strikes_without_moving_updated_at(
    sessionmaker_for_test,
):
    ids = await seed_partial(sessionmaker_for_test)
    before = (await rows(sessionmaker_for_test, ids))[0]
    async with client_for(sessionmaker_for_test, FakeProvider({"items": []})) as client:
        async with sessionmaker_for_test() as session:
            session.add(ClosetProfile(id=1, tag_budget=1))
            await session.commit()
        await client.post("/api/closet/jobs/tag")
    after = (await rows(sessionmaker_for_test, ids))[0]
    assert (before.tag_attempts, after.tag_attempts) == (0, 1)
    assert after.updated_at == before.updated_at


def test_an_unknown_mode_is_an_error_not_the_first_time_path():
    with pytest.raises(ValueError):
        validate(answer([0]), 1, mode="filled")


@pytest.mark.asyncio
async def test_a_fill_batch_strikes_only_the_piece_with_nothing_usable(
    sessionmaker_for_test,
):
    ids = await seed_partial(sessionmaker_for_test, 2)
    payload = {
        "items": [
            {"index": 0, "attributes": attrs(0)},
            {"index": 1, "attributes": attrs(1, formality=9)},
        ]
    }
    async with client_for(sessionmaker_for_test, FakeProvider(payload)) as client:
        async with sessionmaker_for_test() as session:
            session.add(ClosetProfile(id=1, tag_budget=1))
            await session.commit()
        body = (await client.post("/api/closet/jobs/tag")).json()
    first, second = await rows(sessionmaker_for_test, ids)
    assert (first.formality, first.tag_attempts) == (3, 0)
    assert (second.formality, second.tag_attempts) == (None, 1)
    assert body["filled"] == 1


@pytest.mark.asyncio
async def test_partial_progress_does_not_strike(sessionmaker_for_test):
    ids = await seed_partial(sessionmaker_for_test, warmth=None)
    payload = {"items": [{"index": 0, "attributes": attrs(0, formality=9)}]}
    async with client_for(sessionmaker_for_test, FakeProvider(payload)) as client:
        async with sessionmaker_for_test() as session:
            session.add(ClosetProfile(id=1, tag_budget=1))
            await session.commit()
        body = (await client.post("/api/closet/jobs/tag")).json()
    got = (await rows(sessionmaker_for_test, ids))[0]
    assert (got.warmth, got.formality, got.tag_attempts) == (2, None, 0)
    assert (body["filled"], body["fill_remaining"]) == (0, 1)


@pytest.mark.asyncio
async def test_a_piece_moved_to_listed_during_the_fill_call_is_not_written(
    sessionmaker_for_test,
):
    ids = await seed_partial(sessionmaker_for_test)

    class Racing(FakeProvider):
        async def complete_json(self, prompt, schema, images=None):
            async with sessionmaker_for_test() as session:
                (await session.get(Garment, ids[0])).status = GarmentStatus.LISTED
                await session.commit()
            return full(len(images))

    async with client_for(sessionmaker_for_test, Racing()) as client:
        await client.post("/api/closet/jobs/tag")
    assert (await rows(sessionmaker_for_test, ids))[0].formality is None
