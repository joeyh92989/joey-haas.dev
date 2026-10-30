"""The Play Next routes, against a real Postgres."""

import uuid
from contextlib import asynccontextmanager
from datetime import UTC, date, datetime, timedelta

import pytest
from fastapi import FastAPI
from httpx2 import ASGITransport, AsyncClient
from sqlalchemy import func, select
from starlette.middleware.sessions import SessionMiddleware

from models import Item, ItemStatus, ItemType, OwnedFormat, PickAction, PickEvent
from picker_routes import create_picker_router

pytestmark = pytest.mark.asyncio


@asynccontextmanager
async def client_for(factory, signed_in: bool = True):
    app = FastAPI()
    app.include_router(create_picker_router(factory))

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


def _game(title: str, **fields) -> Item:
    return Item(
        type=ItemType.GAME,
        title=title,
        status=fields.pop("status", ItemStatus.BACKLOG),
        owned_format=fields.pop("owned_format", OwnedFormat.PHYSICAL),
        **fields,
    )


async def _seed(factory) -> dict[str, uuid.UUID]:
    rows = [
        _game(
            "Hades",
            status=ItemStatus.FINISHED,
            favorite=True,
            rating=10,
            external_source="igdb",
            external_id="100",
            source_metadata={
                "genres": ["Indie"],
                "keywords": ["roguelike"],
                "similar_games": [200],
            },
        ),
        _game(
            "Dead Cells",
            external_source="igdb",
            external_id="200",
            release_date=date(2018, 8, 7),
            source_metadata={
                "genres": ["Indie", "Platform"],
                "keywords": ["roguelike"],
                "time_to_beat": {"normally": 18.0},
                "community_score": 88,
            },
        ),
        _game(
            "Slay the Spire",
            release_date=date(2019, 1, 23),
            source_metadata={
                "genres": ["Card & Board Game", "Indie"],
                "time_to_beat": {"normally": 4.0},
            },
        ),
        _game(
            "Old Puzzle",
            release_date=date(2003, 5, 1),
            source_metadata={"genres": ["Puzzle", "Indie"]},
        ),
        _game("Wanted", owned_format=OwnedFormat.NONE),
    ]
    async with factory() as session:
        session.add_all(rows)
        await session.commit()
        return {row.title: row.id for row in rows}


async def _events(factory, action: PickAction | None = None) -> list[PickEvent]:
    async with factory() as session:
        statement = select(PickEvent)
        if action is not None:
            statement = statement.where(PickEvent.action == action)
        return list((await session.execute(statement)).scalars())


def _body(**fields) -> dict:
    return {"size": "any", "moods": [], "platforms": [], "exclude": [], **fields}


async def test_next_returns_named_picks_with_reasons(sessionmaker_for_test):
    await _seed(sessionmaker_for_test)
    async with client_for(sessionmaker_for_test) as client:
        response = await client.post("/api/picker/next", json=_body())

    assert response.status_code == 200
    body = response.json()
    assert body["candidate_count"] == 3
    assert body["profile_size"] == 1
    best = body["picks"][0]
    assert best["slot"] == "best_fit"
    assert best["slot_label"] == "Best fit"
    assert best["item"]["title"] == "Dead Cells"
    assert best["item"]["time_to_beat_hours"] == 18.0
    assert "IGDB lists it beside Hades ♥" in best["reasons"]
    assert {pick["item"]["title"] for pick in body["picks"]} <= {
        "Dead Cells",
        "Slay the Spire",
        "Old Puzzle",
    }


async def test_each_pick_is_recorded_as_shown_once_per_day(sessionmaker_for_test):
    await _seed(sessionmaker_for_test)
    async with client_for(sessionmaker_for_test) as client:
        first = (await client.post("/api/picker/next", json=_body())).json()
        await client.post("/api/picker/next", json=_body())

    shown = await _events(sessionmaker_for_test, PickAction.SHOWN)
    # Same games, same day: one event each, however many rerolls.
    assert len(shown) == len(first["picks"])
    assert len({event.item_id for event in shown}) == len(shown)


async def test_never_skipped_and_excluded_games_are_left_out(sessionmaker_for_test):
    ids = await _seed(sessionmaker_for_test)
    async with client_for(sessionmaker_for_test) as client:
        await client.post(
            "/api/picker/events",
            json={"item_id": str(ids["Dead Cells"]), "action": "never"},
        )
        await client.post(
            "/api/picker/events",
            json={"item_id": str(ids["Slay the Spire"]), "action": "skipped"},
        )
        body = (
            await client.post(
                "/api/picker/next", json=_body(exclude=[str(ids["Old Puzzle"])])
            )
        ).json()

    assert body == {"picks": [], "candidate_count": 0, "profile_size": 1}


async def test_an_old_never_still_excludes(sessionmaker_for_test):
    # never events are loaded whatever their age; only the recent window is
    # needed for everything else.
    ids = await _seed(sessionmaker_for_test)
    async with sessionmaker_for_test() as session:
        session.add(
            PickEvent(
                item_id=ids["Dead Cells"],
                action=PickAction.NEVER,
                created_at=datetime.now(UTC) - timedelta(days=400),
            )
        )
        await session.commit()

    async with client_for(sessionmaker_for_test) as client:
        body = (await client.post("/api/picker/next", json=_body())).json()

    assert "Dead Cells" not in {pick["item"]["title"] for pick in body["picks"]}


async def test_restoring_a_never_brings_the_game_back(sessionmaker_for_test):
    ids = await _seed(sessionmaker_for_test)
    dead_cells = str(ids["Dead Cells"])
    async with client_for(sessionmaker_for_test) as client:
        await client.post(
            "/api/picker/events", json={"item_id": dead_cells, "action": "never"}
        )
        restored = await client.delete(f"/api/picker/events/{dead_cells}/never")
        again = await client.delete(f"/api/picker/events/{dead_cells}/never")
        body = (await client.post("/api/picker/next", json=_body())).json()

    assert restored.status_code == 204
    assert again.status_code == 204
    assert body["picks"][0]["item"]["title"] == "Dead Cells"


async def test_moods_that_match_nothing_are_an_empty_answer(sessionmaker_for_test):
    await _seed(sessionmaker_for_test)
    async with client_for(sessionmaker_for_test) as client:
        response = await client.post("/api/picker/next", json=_body(moods=["cozy"]))

    assert response.status_code == 200
    assert response.json()["picks"] == []
    assert response.json()["candidate_count"] == 0
    assert await _events(sessionmaker_for_test) == []


async def test_invalid_requests_are_refused(sessionmaker_for_test):
    await _seed(sessionmaker_for_test)
    async with client_for(sessionmaker_for_test) as client:
        bad_mood = await client.post("/api/picker/next", json=_body(moods=["sad"]))
        bad_size = await client.post("/api/picker/next", json=_body(size="forever"))
        # The old names went with the evening wording.
        old_size = await client.post("/api/picker/next", json=_body(size="quick"))
        bad_action = await client.post(
            "/api/picker/events",
            json={"item_id": str(uuid.uuid4()), "action": "pinned"},
        )
        unknown = await client.post(
            "/api/picker/events",
            json={"item_id": str(uuid.uuid4()), "action": "skipped"},
        )

    assert bad_mood.status_code == 422
    assert bad_size.status_code == 422
    assert old_size.status_code == 422
    assert bad_action.status_code == 422
    assert unknown.status_code == 404


async def test_every_route_needs_a_session(sessionmaker_for_test):
    item_id = str(uuid.uuid4())
    async with client_for(sessionmaker_for_test, signed_in=False) as client:
        responses = [
            await client.post("/api/picker/next", json=_body()),
            await client.post(
                "/api/picker/events", json={"item_id": item_id, "action": "never"}
            ),
            await client.delete(f"/api/picker/events/{item_id}/never"),
            await client.get("/api/picker/skipped-today"),
            await client.delete(f"/api/picker/events/{item_id}/skipped"),
        ]

    assert [response.status_code for response in responses] == [401] * 5


async def test_events_are_counted_per_item(sessionmaker_for_test):
    ids = await _seed(sessionmaker_for_test)
    async with client_for(sessionmaker_for_test) as client:
        await client.post(
            "/api/picker/events",
            json={"item_id": str(ids["Slay the Spire"]), "action": "skipped"},
        )

    async with sessionmaker_for_test() as session:
        count = await session.scalar(
            select(func.count())
            .select_from(PickEvent)
            .where(PickEvent.item_id == ids["Slay the Spire"])
        )
    assert count == 1


async def _skip(factory, item_id: uuid.UUID, at: datetime) -> None:
    async with factory() as session:
        session.add(
            PickEvent(item_id=item_id, action=PickAction.SKIPPED, created_at=at)
        )
        await session.commit()


async def test_skipped_today_lists_only_todays_skips(sessionmaker_for_test):
    ids = await _seed(sessionmaker_for_test)
    now = datetime.now(UTC)
    midnight = now.replace(hour=0, minute=0, second=0, microsecond=0)
    await _skip(sessionmaker_for_test, ids["Dead Cells"], now)
    await _skip(sessionmaker_for_test, ids["Dead Cells"], now)
    await _skip(
        sessionmaker_for_test, ids["Slay the Spire"], midnight - timedelta(seconds=1)
    )
    async with client_for(sessionmaker_for_test) as client:
        response = await client.get("/api/picker/skipped-today")

    assert response.status_code == 200
    assert response.json() == {"item_ids": [str(ids["Dead Cells"])]}


async def test_undoing_a_skip_removes_todays_and_keeps_yesterdays(
    sessionmaker_for_test,
):
    ids = await _seed(sessionmaker_for_test)
    dead_cells = ids["Dead Cells"]
    now = datetime.now(UTC)
    yesterday = now - timedelta(days=1)
    await _skip(sessionmaker_for_test, dead_cells, yesterday)
    await _skip(sessionmaker_for_test, dead_cells, now)
    async with client_for(sessionmaker_for_test) as client:
        undone = await client.delete(f"/api/picker/events/{dead_cells}/skipped")
        again = await client.delete(f"/api/picker/events/{dead_cells}/skipped")
        listed = (await client.get("/api/picker/skipped-today")).json()

    assert undone.status_code == 204
    assert again.status_code == 204
    assert listed == {"item_ids": []}
    left = await _events(sessionmaker_for_test, PickAction.SKIPPED)
    assert [event.created_at.date() for event in left] == [yesterday.date()]
