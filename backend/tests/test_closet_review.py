"""Review's routes: closet_review_routes.py over the database, with a fake model."""

import uuid
from contextlib import asynccontextmanager
from datetime import date, timedelta

import pytest
from fastapi import FastAPI
from httpx2 import ASGITransport, AsyncClient
from sqlalchemy import func, select
from starlette.middleware.sessions import SessionMiddleware

from closet_review_routes import create_closet_review_router
from closet_today_routes import load_pieces
from llm import LLMError, _quota_message
from models import (
    ClosetSetting,
    Garment,
    GarmentCategory,
    GarmentDecision,
    GarmentOutcome,
    GarmentStatus,
    Wear,
)

pytestmark = pytest.mark.asyncio

DAY = date(2026, 11, 10)  # the autumn turn (25 October) is in force
SUMMER = [5, 6, 7, 8, 9]


class FakeProvider:
    def __init__(self, *answers):
        self.answers = list(answers)
        self.calls: list[str] = []

    async def complete_json(self, prompt, schema, images=None):
        self.calls.append(prompt)
        item = self.answers.pop(0) if self.answers else None
        if isinstance(item, Exception):
            raise item
        if callable(item):
            return item(prompt)
        return item


@asynccontextmanager
async def client_for(factory, provider=None, signed_in=True, no_model=False, day=DAY):
    app = FastAPI()
    app.include_router(
        create_closet_review_router(
            factory,
            provider_factory=None if no_model else (lambda: provider),
            today=lambda: day,
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


def daily_quota() -> LLMError:
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


# name, category, wears in the last year, extra fields
CLOSET = [
    ("never worn", "top", 0, {}),
    ("linen shirt", "top", 12, {"seasons": SUMMER}),
    ("shorts", "bottom", 10, {"seasons": SUMMER}),
    ("oxford", "top", 12, {}),
    ("tee", "top", 12, {}),
    ("chinos", "bottom", 10, {}),
]


async def seed(factory, closet=CLOSET) -> dict[str, str]:
    ids = {}
    async with factory() as session:
        for name, category, wears, extra in closet:
            row = Garment(
                name=name,
                category=GarmentCategory(category),
                formality=3,
                seasons=extra.get("seasons", []),
                status=extra.get("status", GarmentStatus.ACTIVE),
                back_on=extra.get("back_on"),
                acquired_on=date(2025, 1, 1),
                tag_attempts=0,
            )
            session.add(row)
            await session.flush()
            for n in range(wears):
                session.add(
                    Wear(garment_id=row.id, worn_on=DAY - timedelta(days=n * 7 + 1))
                )
            ids[name] = str(row.id)
        await session.commit()
    return ids


async def statuses(factory) -> dict[str, tuple[str, date | None]]:
    async with factory() as session:
        rows = (await session.scalars(select(Garment))).all()
        return {row.name: (row.status.value, row.back_on) for row in rows}


async def decisions(factory) -> list[tuple[str, str]]:
    async with factory() as session:
        rows = (
            await session.execute(
                select(Garment.name, GarmentDecision.outcome).join(
                    Garment, Garment.id == GarmentDecision.garment_id
                )
            )
        ).all()
        return sorted((name, outcome.value) for name, outcome in rows)


def deck_names(body) -> list[str]:
    return [card["garment"]["name"] for card in body["deck"]]


async def test_routes_are_401_signed_out(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test, signed_in=False) as client:
        assert (await client.get("/api/closet/review")).status_code == 401
        assert (await client.post("/api/closet/jobs/opinion")).status_code == 401
        assert (await client.post("/api/closet/pack-all")).status_code == 401


async def test_review_lists_the_deck_tiles_and_banner(sessionmaker_for_test):
    await seed(sessionmaker_for_test)
    async with client_for(sessionmaker_for_test) as client:
        body = (await client.get("/api/closet/review")).json()
    assert deck_names(body) == ["never worn", "linen shirt", "shorts"]
    first = body["deck"][0]
    assert first["suggested"] == "sell"
    assert first["flags"][0]["kind"] == "unworn"
    assert first["opinion"] is None
    assert body["deck"][1]["suggested"] == "pack"
    assert body["deck"][1]["back_on"] == "2027-05-01"
    assert body["banner"] == {
        "turn": "autumn",
        "turn_on": "2026-10-25",
        "season": "summer",
        "count": 2,
        "until": "May",
    }
    assert body["tiles"] == {
        "active": 6,
        "worn_30": 5,
        "flagged": 3,
        "gone_this_year": 0,
    }
    assert body["next_turn"] == "late April"


async def test_dismissing_the_turn_closes_its_banner_and_flags(sessionmaker_for_test):
    await seed(sessionmaker_for_test)
    async with client_for(sessionmaker_for_test) as client:
        assert (await client.post("/api/closet/review/dismiss")).status_code == 200
        body = (await client.get("/api/closet/review")).json()
    assert body["banner"] is None
    assert body["turn"]["open"] is False
    assert deck_names(body) == ["never worn"]


async def test_each_outcome_writes_its_decision_and_status(sessionmaker_for_test):
    ids = await seed(sessionmaker_for_test)
    async with client_for(sessionmaker_for_test) as client:
        for name, outcome in (
            ("oxford", "keep"),
            ("never worn", "sell"),
            ("tee", "donate"),
        ):
            response = await client.post(
                f"/api/closet/garments/{ids[name]}/decision", json={"outcome": outcome}
            )
            assert response.status_code == 200, response.text
        packed = await client.post(
            f"/api/closet/garments/{ids['linen shirt']}/decision",
            json={"outcome": "pack", "back_on": "2027-06-15"},
        )
        assert packed.status_code == 200
        sold = await client.post(f"/api/closet/garments/{ids['never worn']}/sold")
        assert sold.status_code == 200
        again = await client.post(
            f"/api/closet/garments/{ids['tee']}/decision", json={"outcome": "keep"}
        )
        assert again.status_code == 409
        body = (await client.get("/api/closet/review")).json()
    found = await statuses(sessionmaker_for_test)
    assert found["oxford"] == ("active", None)
    assert found["never worn"] == ("gone", None)
    assert found["tee"] == ("gone", None)
    assert found["linen shirt"] == ("packed", date(2027, 6, 1))
    assert await decisions(sessionmaker_for_test) == [
        ("linen shirt", "packed"),
        ("never worn", "listed"),
        ("never worn", "sold"),
        ("oxford", "kept"),
        ("tee", "donated"),
    ]
    assert body["tiles"]["gone_this_year"] == 2
    assert deck_names(body) == ["shorts"]


async def test_a_kept_piece_stays_out_until_the_next_turn(sessionmaker_for_test):
    ids = await seed(sessionmaker_for_test)
    async with client_for(sessionmaker_for_test) as client:
        await client.post(
            f"/api/closet/garments/{ids['never worn']}/decision",
            json={"outcome": "keep"},
        )
        now = (await client.get("/api/closet/review")).json()
    async with client_for(sessionmaker_for_test, day=date(2027, 4, 26)) as client:
        later = (await client.get("/api/closet/review")).json()
    assert "never worn" not in deck_names(now)
    assert "never worn" in deck_names(later)


async def test_pack_away_refuses_a_month_already_here(sessionmaker_for_test):
    ids = await seed(sessionmaker_for_test)
    async with client_for(sessionmaker_for_test) as client:
        response = await client.post(
            f"/api/closet/garments/{ids['shorts']}/decision",
            json={"outcome": "pack", "back_on": "2026-11-01"},
        )
    assert response.status_code == 422


async def test_a_packed_garment_leaves_today(sessionmaker_for_test):
    ids = await seed(sessionmaker_for_test)
    async with client_for(sessionmaker_for_test) as client:
        await client.post(
            f"/api/closet/garments/{ids['shorts']}/decision", json={"outcome": "pack"}
        )
    async with sessionmaker_for_test() as session:
        pieces, _, _ = await load_pieces(session, DAY)
    assert "shorts" not in {p.name for p in pieces}
    assert (await statuses(sessionmaker_for_test))["shorts"] == (
        "packed",
        date(2027, 5, 1),
    )


async def test_pack_all_then_undo_restores_exactly(sessionmaker_for_test):
    await seed(sessionmaker_for_test)
    before = await statuses(sessionmaker_for_test)
    async with client_for(sessionmaker_for_test) as client:
        packed = (await client.post("/api/closet/pack-all")).json()
        middle = await statuses(sessionmaker_for_test)
        assert len(packed["ids"]) == 2
        assert middle["linen shirt"] == ("packed", date(2027, 5, 1))
        assert middle["shorts"] == ("packed", date(2027, 5, 1))
        undone = await client.post("/api/closet/undo", json={"token": packed["undo"]})
        assert undone.status_code == 200
        twice = await client.post("/api/closet/undo", json={"token": packed["undo"]})
        assert twice.status_code == 409
    assert await statuses(sessionmaker_for_test) == before
    assert await decisions(sessionmaker_for_test) == []


async def test_undo_takes_only_the_latest_token(sessionmaker_for_test):
    ids = await seed(sessionmaker_for_test)
    async with client_for(sessionmaker_for_test) as client:
        first = (
            await client.post(
                f"/api/closet/garments/{ids['tee']}/decision",
                json={"outcome": "donate"},
            )
        ).json()
        await client.post(
            f"/api/closet/garments/{ids['oxford']}/decision", json={"outcome": "donate"}
        )
        stale = await client.post("/api/closet/undo", json={"token": first["undo"]})
    assert stale.status_code == 409


async def test_unpack_all_brings_back_what_is_due(sessionmaker_for_test):
    closet = [
        (
            "due coat",
            "outer",
            3,
            {"status": GarmentStatus.PACKED, "back_on": date(2026, 11, 1)},
        ),
        (
            "later coat",
            "outer",
            3,
            {"status": GarmentStatus.PACKED, "back_on": date(2027, 1, 1)},
        ),
    ]
    await seed(sessionmaker_for_test, closet)
    async with client_for(sessionmaker_for_test) as client:
        body = (await client.get("/api/closet/review")).json()
        assert [g["name"] for g in body["due_back"]] == ["due coat"]
        unpacked = (await client.post("/api/closet/unpack-all")).json()
        after = await statuses(sessionmaker_for_test)
        await client.post("/api/closet/undo", json={"token": unpacked["undo"]})
    assert after["due coat"] == ("active", None)
    assert after["later coat"] == ("packed", date(2027, 1, 1))
    assert (await statuses(sessionmaker_for_test))["due coat"] == (
        "packed",
        date(2026, 11, 1),
    )


def opinion_for(*names_and_text):
    def answer(prompt):
        index = {}
        for line in prompt.split("Flagged pieces:\n", 1)[1].splitlines():
            number, rest = line.split(". ", 1)
            index[rest.split(" (", 1)[0]] = int(number)
        return {
            "opinions": [
                {"index": index[name], "opinion": text} for name, text in names_and_text
            ]
        }

    return answer


async def setting(factory, key):
    async with factory() as session:
        row = await session.get(ClosetSetting, key)
        return row.value if row else None


async def test_opinion_job_sends_only_flagged_pieces(sessionmaker_for_test):
    await seed(sessionmaker_for_test)
    provider = FakeProvider(
        opinion_for(("never worn", "Too loud for your quiet palette."))
    )
    async with client_for(sessionmaker_for_test, provider) as client:
        run = (await client.post("/api/closet/jobs/opinion")).json()
        body = (await client.get("/api/closet/review")).json()
    prompt = provider.calls[0]
    flagged = prompt.split("Flagged pieces:\n", 1)[1]
    assert "never worn" in flagged and "oxford" not in flagged
    assert run["state"] == "ok" and run["opinions"] == 1 and run["flagged"] == 3
    assert body["deck"][0]["opinion"] == "Too loud for your quiet palette."
    assert body["opinion_batch_on"] == DAY.isoformat()
    assert (await setting(sessionmaker_for_test, "opinion.last_run"))["state"] == "ok"


async def test_opinion_failure_keeps_the_last_batch_and_the_deck(sessionmaker_for_test):
    await seed(sessionmaker_for_test)
    good = FakeProvider(opinion_for(("never worn", "Not your colours.")))
    async with client_for(sessionmaker_for_test, good) as client:
        await client.post("/api/closet/jobs/opinion")
    async with client_for(sessionmaker_for_test, FakeProvider(daily_quota())) as client:
        run = (await client.post("/api/closet/jobs/opinion")).json()
        body = (await client.get("/api/closet/review")).json()
    assert run["state"] == "skipped" and run["ok"] is True
    assert "used up" in run["note"]
    assert deck_names(body) == ["never worn", "linen shirt", "shorts"]
    assert body["deck"][0]["opinion"] == "Not your colours."
    async with client_for(sessionmaker_for_test, FakeProvider({"bad": 1})) as client:
        run = (await client.post("/api/closet/jobs/opinion")).json()
    assert run["state"] == "skipped"
    async with client_for(sessionmaker_for_test, no_model=True) as client:
        run = (await client.post("/api/closet/jobs/opinion")).json()
    assert run["state"] == "skipped" and run["note"] == "No model is configured"


async def test_opinion_on_an_empty_deck_asks_nothing(sessionmaker_for_test):
    await seed(
        sessionmaker_for_test, [("tee", "top", 12, {}), ("oxford", "top", 12, {})]
    )
    provider = FakeProvider()
    async with client_for(sessionmaker_for_test, provider) as client:
        run = (await client.post("/api/closet/jobs/opinion")).json()
        body = (await client.get("/api/closet/review")).json()
    assert run["state"] == "empty" and provider.calls == []
    assert body["deck"] == [] and body["next_turn"] == "late April"


async def test_unknown_garment_is_404(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        response = await client.post(
            f"/api/closet/garments/{uuid.uuid4()}/decision", json={"outcome": "keep"}
        )
    assert response.status_code == 404


async def test_decisions_count_one_row_each(sessionmaker_for_test):
    ids = await seed(sessionmaker_for_test)
    async with client_for(sessionmaker_for_test) as client:
        await client.post(
            f"/api/closet/garments/{ids['tee']}/decision", json={"outcome": "keep"}
        )
    async with sessionmaker_for_test() as session:
        assert await session.scalar(select(func.count(GarmentDecision.id))) == 1
        outcome = await session.scalar(select(GarmentDecision.outcome))
    assert outcome == GarmentOutcome.KEPT
