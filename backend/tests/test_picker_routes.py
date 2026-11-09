"""The Play Next routes, against a real Postgres."""

import uuid
from contextlib import asynccontextmanager
from datetime import UTC, date, datetime, timedelta

import pytest
from fastapi import FastAPI
from httpx2 import ASGITransport, AsyncClient
from sqlalchemy import func, select
from starlette.middleware.sessions import SessionMiddleware

from continuing import ContinuingCard
from models import (
    Item,
    ItemStatus,
    ItemType,
    OwnedFormat,
    PickAction,
    PickEvent,
    PlaySession,
)
from picker_routes import create_picker_router
from playthroughs import apply_status

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
    # Each carries the slot it was offered in, for the public Tonight.
    slots = {str(event.item_id): event.slot for event in shown}
    assert slots == {pick["item"]["id"]: pick["slot"] for pick in first["picks"]}


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
        old_field = await client.post("/api/picker/next", json=_body(time="quick"))
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
    assert old_field.status_code == 422
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
            await client.get("/api/picker/continuing"),
        ]

    assert [response.status_code for response in responses] == [401] * 6


async def test_continuing_lists_every_owned_game_in_play_private_too(
    sessionmaker_for_test,
):
    """The admin card is the public card's shape over the owner's whole
    shelf, so Play Next can lead with a game the public cannot see."""
    today = datetime.now(UTC).date()
    async with sessionmaker_for_test() as session:
        private = _game("Private", is_public=False)
        public = _game("Public", is_public=True)
        wanted = _game("Wanted", owned_format=OwnedFormat.NONE)
        backlog = _game("Backlog")
        session.add_all([private, public, wanted, backlog])
        await session.flush()
        for item in (private, public, wanted):
            await apply_status(session, item, ItemStatus.ACTIVE, today)
        session.add(
            PlaySession(item_id=private.id, played_on=today - timedelta(days=1))
        )
        await session.commit()
        ids = {"private": str(private.id), "public": str(public.id)}

    async with client_for(sessionmaker_for_test) as client:
        response = await client.get("/api/picker/continuing")

    assert response.status_code == 200
    cards = response.json()["cards"]
    assert [card["item_id"] for card in cards] == [ids["private"], ids["public"]]
    assert set(cards[0]) == set(ContinuingCard.model_fields)
    assert cards[0]["sessions"] == 1
    assert cards[0]["stale"] is False


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


# --- The engine's inputs (recommendation engine, Task 4) ---------------------


async def test_picker_items_carry_source_tags_and_each_types_size(
    sessionmaker_for_test,
):
    from picker_routes import to_picker_item

    game = _game(
        "Tagged",
        external_source="igdb",
        source_metadata={
            "genres": ["Platform"],
            "keywords": ["space"],
            "game_modes": ["Single player"],
        },
    )
    movie = Item(
        type=ItemType.MOVIE,
        title="Film",
        status=ItemStatus.BACKLOG,
        owned_format=OwnedFormat.PHYSICAL,
        external_source="tmdb",
        source_metadata={"runtime_minutes": 155, "keywords": ["space opera"]},
    )
    comic = Item(
        type=ItemType.COMIC,
        title="Run",
        status=ItemStatus.ACTIVE,
        owned_format=OwnedFormat.PHYSICAL,
        external_source="comicvine",
        issues_owned="1-6",
        read_to=4,
        source_metadata={"locations": ["Space"]},
    )
    as_game, as_movie, as_comic = (to_picker_item(row) for row in (game, movie, comic))
    assert as_game.source == "igdb"
    assert as_game.tags == (("genres", "Platform"), ("keywords", "space"))
    assert as_game.runtime_minutes is None and as_game.issues_owned_count is None
    assert as_movie.runtime_minutes == 155.0
    assert as_movie.tags == (("keywords", "space opera"),)
    assert (as_comic.issues_owned_count, as_comic.issues_read) == (6, 4)
    assert as_comic.issues_span == 6
    assert as_comic.play is None


async def test_play_records_count_hours_sessions_finishes_and_a_bounce(
    sessionmaker_for_test,
):
    from picker_routes import load_play_records

    today = date(2026, 11, 9)
    async with sessionmaker_for_test() as session:
        played, bounced, untouched = (_game(t) for t in ("Played", "Bounced", "None"))
        session.add_all([played, bounced, untouched])
        await session.flush()
        await apply_status(session, played, ItemStatus.ACTIVE, today - timedelta(20))
        session.add_all(
            [
                PlaySession(
                    item_id=played.id, played_on=today - timedelta(d), minutes=90
                )
                for d in (19, 18, 17)
            ]
        )
        await session.flush()
        await apply_status(session, played, ItemStatus.FINISHED, today - timedelta(16))
        await apply_status(session, bounced, ItemStatus.ACTIVE, today - timedelta(10))
        session.add(PlaySession(item_id=bounced.id, played_on=today - timedelta(9)))
        await session.flush()
        await apply_status(session, bounced, ItemStatus.ABANDONED, today - timedelta(8))
        await session.commit()
        records = await load_play_records(
            session, [played.id, bounced.id, untouched.id]
        )
    assert records[played.id].hours == 4.5
    assert records[played.id].sessions == 3
    assert (records[played.id].finished_runs, records[played.id].runs) == (1, 1)
    assert not records[played.id].bounced
    assert records[bounced.id].bounced
    assert records[untouched.id].runs == 0
    assert await load_play_records(None, []) == {}


async def test_a_paused_run_after_one_day_is_a_bounce_and_two_days_is_not():
    from picker_routes import play_record
    from playthroughs import Run

    paused = Run(number=1, started_on=date(2026, 1, 1), paused_on=date(2026, 1, 3))
    assert play_record([(paused, 1, 30, None)]).bounced
    assert not play_record([(paused, 2, 30, None)]).bounced
    finished = Run(number=1, outcome="finished")
    assert not play_record([(finished, 1, 30, None)]).bounced


async def test_a_tmdb_score_is_read_on_the_0_to_100_scale():
    """Engine review, finding 1: TMDB's vote_average is 0-10, and a film with
    no votes has no score at all. IGDB's is already 0-100."""
    from picker_routes import _community_score

    assert _community_score(
        "tmdb", {"community_score": 8.1, "community_votes": 900}
    ) == pytest.approx(81)
    assert (
        _community_score("tmdb", {"community_score": 0, "community_votes": 0}) is None
    )
    assert _community_score("tmdb", {"community_score": 7.0}) is None
    assert _community_score("igdb", {"community_score": 76.4}) == 76.4
    assert _community_score("igdb", {}) is None
