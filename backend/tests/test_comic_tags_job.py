"""The comic tag job: one model call per untagged public series, inside the
free-tier budget, never over the owner's edits. The provider is a stub."""

from contextlib import asynccontextmanager
from datetime import UTC, datetime

import pytest
from fastapi import FastAPI
from httpx2 import ASGITransport, AsyncClient
from sqlalchemy import select
from starlette.middleware.sessions import SessionMiddleware

import comics_routes
import tags
from comics_routes import create_comics_router
from intake.budget import DAILY_REQUESTS, RESERVE, pacific_day
from items import JOB_ROUTES
from llm import GEMINI_MODELS, LLMError
from models import Item, ItemStatus, ItemType, LlmUsage

pytestmark = pytest.mark.asyncio

OPTIONS = tags.comic_options()
HORROR = OPTIONS.index(("genre", "horror"))
ORIGINAL = OPTIONS.index(("based_on", "original"))
ONGOING = OPTIONS.index(("form", "ongoing"))
GOOD = {"tags": [HORROR, ORIGINAL, ONGOING]}
GOOD_TAGS = [
    {"group": "genre", "tag": "horror"},
    {"group": "based_on", "tag": "original"},
    {"group": "form", "tag": "ongoing"},
]


class StubProvider:
    """Answers each call from a script; records the prompts it was given."""

    def __init__(self, *answers, on_call=None):
        self.answers = list(answers)
        self.prompts: list[str] = []
        self.schemas: list[dict] = []
        self.kwargs: dict = {}
        self.on_call = on_call

    async def complete_json(self, prompt, schema, images=None, **kwargs):
        self.kwargs = kwargs
        self.prompts.append(prompt)
        self.schemas.append(schema)
        if self.on_call:
            await self.on_call(len(self.prompts))
        answer = self.answers.pop(0) if self.answers else GOOD
        if isinstance(answer, Exception):
            raise answer
        return answer


@asynccontextmanager
async def client_for(factory, provider, signed_in=True):
    app = FastAPI()
    app.include_router(
        create_comics_router(factory, {}, None, provider_factory=lambda: provider)
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


async def _series(factory, title, **fields) -> Item:
    row = Item(
        type=fields.pop("type", ItemType.COMIC),
        title=title,
        status=ItemStatus.BACKLOG,
        is_public=fields.pop("is_public", True),
        **fields,
    )
    async with factory() as session:
        session.add(row)
        await session.commit()
        await session.refresh(row)
    return row


async def _tags(factory) -> dict[str, list]:
    async with factory() as session:
        return {r.title: r.tags for r in await session.scalars(select(Item))}


async def _leave(factory, left: int) -> None:
    """Spends today's free tier down to `left` calls past the reserve."""
    day = pacific_day(datetime.now(UTC))
    spare = left + RESERVE
    async with factory() as session:
        for index, model in enumerate(GEMINI_MODELS):
            used = DAILY_REQUESTS if index else DAILY_REQUESTS - spare
            session.add(LlmUsage(day=day, model=model, calls=used))
        await session.commit()


async def test_it_is_a_job_route():
    assert ("POST", "/api/comics/tags/generate") in JOB_ROUTES


async def test_an_untagged_public_series_gets_tags_from_one_call(
    sessionmaker_for_test,
):
    await _series(
        sessionmaker_for_test,
        "Hellboy",
        year=1994,
        creator="Dark Horse",
        source_metadata={
            "publisher": "Dark Horse",
            "start_year": "1994",
            "issue_count": 12,
            "description": "<p>A demon raised by the <b>paranormal</b> bureau.</p>",
        },
    )
    provider = StubProvider(GOOD)
    async with client_for(sessionmaker_for_test, provider) as client:
        response = await client.post("/api/comics/tags/generate")

    assert response.status_code == 200
    body = response.json()
    assert (body["tagged"], body["failed"], body["calls"]) == (1, 0, 1)
    assert body["series"] == [
        {"id": body["series"][0]["id"], "title": "Hellboy", "tags": GOOD_TAGS}
    ]
    assert (await _tags(sessionmaker_for_test))["Hellboy"] == GOOD_TAGS
    (prompt,) = provider.prompts
    assert "Hellboy" in prompt and "Dark Horse" in prompt
    assert "paranormal bureau" in prompt and "<p>" not in prompt
    assert provider.schemas == [tags.COMIC_SCHEMA]
    assert provider.kwargs == {"budget_seconds": comics_routes.TAG_CALL_SECONDS}
    assert body["ok"] is True


async def test_it_skips_edited_tagged_private_and_non_comic_rows(
    sessionmaker_for_test,
):
    keep = [{"group": "genre", "tag": "western"}]
    await _series(sessionmaker_for_test, "Edited", tags=[], tags_edited=True)
    await _series(sessionmaker_for_test, "Tagged", tags=keep)
    await _series(sessionmaker_for_test, "Private", is_public=False)
    await _series(sessionmaker_for_test, "A game", type=ItemType.GAME)
    await _series(sessionmaker_for_test, "Fresh")
    provider = StubProvider()
    async with client_for(sessionmaker_for_test, provider) as client:
        body = (await client.post("/api/comics/tags/generate")).json()

    assert (body["tagged"], body["calls"], body["waiting"]) == (1, 1, 0)
    got = await _tags(sessionmaker_for_test)
    assert got["Fresh"] == GOOD_TAGS
    assert got["Edited"] == [] and got["Tagged"] == keep
    assert got["Private"] == [] and got["A game"] == []


async def test_a_second_run_makes_no_call(sessionmaker_for_test):
    await _series(sessionmaker_for_test, "Fresh")
    provider = StubProvider()
    async with client_for(sessionmaker_for_test, provider) as client:
        await client.post("/api/comics/tags/generate")
        again = (await client.post("/api/comics/tags/generate")).json()
    assert (again["tagged"], again["calls"], len(provider.prompts)) == (0, 0, 1)
    assert again["stopped"] is None


async def test_the_budget_parameter_caps_the_calls(sessionmaker_for_test):
    for title in "ABCDE":
        await _series(sessionmaker_for_test, title)
    provider = StubProvider()
    async with client_for(sessionmaker_for_test, provider) as client:
        body = (await client.post("/api/comics/tags/generate?budget=2")).json()
    assert (body["calls"], body["tagged"], body["waiting"]) == (2, 2, 3)
    assert body["stopped"] == "budget"


async def test_the_free_tier_caps_it_further_and_keeps_the_reserve(
    sessionmaker_for_test,
):
    for title in "ABCDE":
        await _series(sessionmaker_for_test, title)
    await _leave(sessionmaker_for_test, 3)
    provider = StubProvider()
    async with client_for(sessionmaker_for_test, provider) as client:
        body = (await client.post("/api/comics/tags/generate?budget=50")).json()
    assert body["budget"] == 3
    assert (body["calls"], body["waiting"], body["stopped"]) == (3, 2, "budget")


async def test_with_nothing_left_today_there_is_no_call(sessionmaker_for_test):
    await _series(sessionmaker_for_test, "A")
    await _leave(sessionmaker_for_test, 0)
    provider = StubProvider()
    async with client_for(sessionmaker_for_test, provider) as client:
        body = (await client.post("/api/comics/tags/generate")).json()
    assert (body["calls"], body["tagged"], body["waiting"]) == (0, 0, 1)
    assert provider.prompts == []
    assert (await _tags(sessionmaker_for_test))["A"] == []


async def test_an_unusable_answer_leaves_that_series_for_the_next_night(
    sessionmaker_for_test,
):
    await _series(sessionmaker_for_test, "A")
    await _series(sessionmaker_for_test, "B")
    provider = StubProvider({"tags": [99]}, GOOD)
    async with client_for(sessionmaker_for_test, provider) as client:
        body = (await client.post("/api/comics/tags/generate")).json()
    assert (body["tagged"], body["failed"], body["waiting"]) == (1, 1, 1)
    assert body["errors"][0]["title"] == "A"
    got = await _tags(sessionmaker_for_test)
    assert got["A"] == [] and got["B"] == GOOD_TAGS


async def test_a_model_error_stops_the_run_and_tags_nothing_it_did_not_read(
    sessionmaker_for_test,
):
    await _series(sessionmaker_for_test, "A")
    await _series(sessionmaker_for_test, "B")
    provider = StubProvider(LLMError("429 quota"), GOOD)
    async with client_for(sessionmaker_for_test, provider) as client:
        response = await client.post("/api/comics/tags/generate")
    assert response.status_code == 200
    body = response.json()
    assert (body["tagged"], body["calls"], body["stopped"]) == (0, 1, "model error")
    assert body["ok"] is False
    assert len(provider.prompts) == 1
    assert all(t == [] for t in (await _tags(sessionmaker_for_test)).values())


async def test_an_edit_made_during_the_call_wins(sessionmaker_for_test):
    series = await _series(sessionmaker_for_test, "A")
    mine = [{"group": "genre", "tag": "western"}]

    async def edit(_call: int) -> None:
        async with sessionmaker_for_test() as session:
            row = await session.get(Item, series.id)
            row.tags, row.tags_edited = mine, True
            await session.commit()

    provider = StubProvider(GOOD, on_call=edit)
    async with client_for(sessionmaker_for_test, provider) as client:
        body = (await client.post("/api/comics/tags/generate")).json()
    assert body["tagged"] == 0
    assert (await _tags(sessionmaker_for_test))["A"] == mine


async def test_the_job_needs_the_admin_session_or_the_token(sessionmaker_for_test):
    provider = StubProvider()
    async with client_for(sessionmaker_for_test, provider, signed_in=False) as client:
        response = await client.post("/api/comics/tags/generate")
    assert response.status_code == 401
    assert provider.prompts == []


async def test_a_missing_model_is_a_200_that_says_so(sessionmaker_for_test):
    await _series(sessionmaker_for_test, "A")

    def no_key():
        raise LLMError("GEMINI_API_KEY is not set")

    app = FastAPI()
    app.include_router(create_comics_router(sessionmaker_for_test, {}, None, no_key))

    @app.middleware("http")
    async def _sign_in(request, call_next):
        request.session["user"] = {"sub": "1", "email": "admin@example.com"}
        return await call_next(request)

    app.add_middleware(SessionMiddleware, secret_key="test-secret", https_only=False)
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        response = await client.post("/api/comics/tags/generate")
    assert response.status_code == 200
    body = response.json()
    assert (body["stopped"], body["ok"], body["calls"]) == ("no model", False, 0)
    assert (await _tags(sessionmaker_for_test))["A"] == []


async def test_the_run_stops_on_the_wall_clock(sessionmaker_for_test, monkeypatch):
    for title in "ABCD":
        await _series(sessionmaker_for_test, title)
    now = [0.0]
    monkeypatch.setattr(comics_routes, "_monotonic", lambda: now[0])

    async def tick(_call: int) -> None:
        now[0] += comics_routes.TAG_RUN_SECONDS / 2 + 1  # two calls fill the run

    provider = StubProvider(on_call=tick)
    async with client_for(sessionmaker_for_test, provider) as client:
        body = (await client.post("/api/comics/tags/generate")).json()
    assert (body["calls"], body["tagged"], body["stopped"]) == (2, 2, "time")
    assert body["ok"] is True
    assert body["waiting"] == 2
