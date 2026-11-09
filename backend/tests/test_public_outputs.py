"""Public picks and radar (showcase spec, D). The leak tests are the point."""

import asyncio
import json
import re
import uuid
from contextlib import asynccontextmanager
from datetime import UTC, date, datetime, time, timedelta

import pytest
from fastapi import FastAPI
from httpx2 import ASGITransport, AsyncClient
from sqlalchemy import select, update
from starlette.middleware.sessions import SessionMiddleware

import public
from continuing import STALE_DAYS, ContinuingCard
from models import (
    CatalogueGame,
    CatalogueRun,
    Item,
    ItemStatus,
    ItemType,
    OwnedFormat,
    PhysicalEdition,
    PhysicalFormat,
    PickAction,
    PickEvent,
    PlaySession,
    ReasonSource,
    Recommendation,
    RecommendationKind,
    RecommendationStatus,
    StoreListing,
)
from physical_sources.stores import STORES
from playthroughs import add_past, apply_status
from public import create_public_router
from public_outputs import (
    PublicBestDayOut,
    PublicLastFinish,
    PublicNextOut,
    PublicNextRow,
    PublicProgress,
    PublicSiteStatsOut,
    PublicSize,
    PublicStatusOut,
    PublicSummaryOut,
    PublicTonight,
    PublicTonightCard,
)
from recommendations_routes import create_recommendations_router

pytestmark = pytest.mark.asyncio

# The server reads datetime.now(UTC); the clock is frozen here (see `clock`)
# so no test can straddle a UTC midnight.
NOW = datetime(2026, 9, 28, 15, 0, tzinfo=UTC)
MIDNIGHT = datetime.combine(NOW.date(), time.min, tzinfo=UTC)
# Noon yesterday, UTC: an event from before today's midnight.
SHOWN_DAY = MIDNIGHT - timedelta(hours=12)

# What a tonight card publishes. `item_id`, not `id`: What's next carries no key
# named id (spec, S1).
PICK_FIELDS = {
    "item_id", "type", "title", "cover_url", "platform", "reasons",
    "slot_label", "size", "progress",
}  # fmt: skip
LAST_FINISH_FIELDS = {
    "item_id", "title", "cover_url", "finished_at", "time_to_beat_hours", "rating",
}  # fmt: skip
# The Continue card (Tonight continue spec): the game in hand and its open
# run's journal. No status key, no note, no minutes per day.
CONTINUING_FIELDS = {
    "item_id", "type", "title", "cover_url", "platform", "time_to_beat_hours",
    "playthrough", "playing_since", "last_played_on", "journal_hours",
    "sessions", "stale",
}  # fmt: skip


@pytest.fixture(autouse=True)
def clock(monkeypatch):
    """Freeze the public router's clock at NOW; call it to move the clock."""
    frozen = {"now": NOW}

    class FrozenDatetime(datetime):
        @classmethod
        def now(cls, tz=None):
            return frozen["now"].astimezone(tz) if tz else frozen["now"]

    monkeypatch.setattr(public, "datetime", FrozenDatetime)

    def move_to(when: datetime) -> None:
        frozen["now"] = when

    return move_to


@asynccontextmanager
async def client_for(factory):
    app = FastAPI()
    app.include_router(create_public_router(factory))
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        yield client


def _game(title: str, **fields) -> Item:
    base = dict(
        type=ItemType.GAME,
        title=title,
        status=ItemStatus.BACKLOG,
        is_public=True,
        owned_format=OwnedFormat.PHYSICAL,
        source_metadata={"genres": ["Roguelike", "Indie"]},
    )
    return Item(**{**base, **fields})


async def _add(factory, *rows):
    async with factory() as session:
        session.add_all(rows)
        await session.commit()


def _with_ids(*items: Item) -> tuple[Item, ...]:
    for entry in items:
        entry.id = uuid.uuid4()
    return items


async def test_the_tonight_card_publishes_exactly_these_fields():
    assert set(PublicTonightCard.model_fields) == PICK_FIELDS
    # A card's nested shapes are pinned too: the walk for forbidden keys
    # would miss a new field that is not on its list.
    assert set(PublicSize.model_fields) == {"unit", "value"}
    assert set(PublicProgress.model_fields) == {"read", "of"}
    assert set(PublicLastFinish.model_fields) == LAST_FINISH_FIELDS
    assert set(ContinuingCard.model_fields) == CONTINUING_FIELDS
    assert set(PublicTonight.model_fields) == {
        "continuing",
        "up_next",
        "picks",
        "read_next",
        "watch_next",
        "last_finish",
    }


def _session(item: Item, day: date, minutes: int | None = None) -> PlaySession:
    return PlaySession(item_id=item.id, played_on=day, minutes=minutes, note="mine")


async def _start(factory, item: Item, on: date) -> None:
    """Opens the item's run on `on` through the rules, as the status route does."""
    async with factory() as session:
        row = await session.get(Item, item.id)
        await apply_status(session, row, ItemStatus.ACTIVE, on)
        await session.commit()


async def test_the_continue_card_carries_the_open_runs_journal_and_nothing_private(
    sessionmaker_for_test,
):
    today = NOW.date()
    (playing,) = _with_ids(
        _game(
            "Hades II",
            status=ItemStatus.BACKLOG,
            platform="Nintendo Switch 2",
            source_metadata=_hours(30),
        )
    )
    await _add(sessionmaker_for_test, playing)
    await _start(sessionmaker_for_test, playing, today - timedelta(days=15))
    await _add(
        sessionmaker_for_test,
        _session(playing, today - timedelta(days=10), 90),
        _session(playing, today - timedelta(days=1), 45),
        _session(playing, today - timedelta(days=3)),
    )
    body = await _next(sessionmaker_for_test)

    cards = body["tonight"]["continuing"]
    assert [set(card) for card in cards] == [CONTINUING_FIELDS]
    card = cards[0]
    assert card["title"] == "Hades II"
    assert card["playthrough"] == 1
    assert card["playing_since"] == (today - timedelta(days=15)).isoformat()
    assert card["last_played_on"] == (today - timedelta(days=1)).isoformat()
    assert card["sessions"] == 3
    assert card["journal_hours"] == 2.2
    assert card["stale"] is False
    assert card["time_to_beat_hours"] == 30.0
    assert "mine" not in json.dumps(body)


async def test_sessions_without_minutes_publish_no_hours(sessionmaker_for_test):
    """Log tonight writes a day with no minutes; "0 h over 3 sessions" would
    read as a bug."""
    today = NOW.date()
    (playing,) = _with_ids(_game("Hades II"))
    await _add(sessionmaker_for_test, playing)
    await _start(sessionmaker_for_test, playing, today - timedelta(days=3))
    await _add(
        sessionmaker_for_test,
        _session(playing, today - timedelta(days=2)),
        _session(playing, today),
    )
    (card,) = (await _next(sessionmaker_for_test))["tonight"]["continuing"]

    assert (card["sessions"], card["journal_hours"]) == (2, None)


async def test_the_continue_card_is_not_also_a_pick(sessionmaker_for_test):
    today = NOW.date()
    playing, other = _with_ids(_game("In hand"), _game("Fresh"))
    await _add(sessionmaker_for_test, playing, other)
    await _start(sessionmaker_for_test, playing, today - timedelta(days=40))
    tonight = (await _next(sessionmaker_for_test))["tonight"]

    assert [card["title"] for card in tonight["continuing"]] == ["In hand"]
    assert [pick["title"] for pick in tonight["picks"]] == ["Fresh"]


async def test_the_continue_card_is_public_owned_active_games_only(
    sessionmaker_for_test,
):
    today = NOW.date()
    private, wanted, paused, playing = _with_ids(
        _game("Private", is_public=False),
        _game("Wanted", owned_format=OwnedFormat.NONE),
        _game("Paused"),
        _game("Playing"),
    )
    await _add(sessionmaker_for_test, private, wanted, paused, playing)
    for item in (private, wanted, playing):
        await _start(sessionmaker_for_test, item, today)
    async with sessionmaker_for_test() as session:
        row = await session.get(Item, paused.id)
        await apply_status(session, row, ItemStatus.ACTIVE, today)
        await apply_status(session, row, ItemStatus.PAUSED, today)
        await session.commit()
    tonight = (await _next(sessionmaker_for_test))["tonight"]

    assert [card["title"] for card in tonight["continuing"]] == ["Playing"]


async def test_stale_is_three_weeks_without_a_session_or_since_the_start(
    sessionmaker_for_test,
):
    today = NOW.date()
    quiet, recent, started_long_ago, fresh = _with_ids(
        _game("Quiet"), _game("Recent"), _game("Long ago"), _game("Fresh")
    )
    await _add(sessionmaker_for_test, quiet, recent, started_long_ago, fresh)
    for item in (quiet, recent):
        await _start(sessionmaker_for_test, item, today - timedelta(days=60))
    await _start(sessionmaker_for_test, started_long_ago, today - timedelta(days=21))
    await _start(sessionmaker_for_test, fresh, today - timedelta(days=20))
    await _add(
        sessionmaker_for_test,
        _session(quiet, today - timedelta(days=STALE_DAYS)),
        _session(recent, today - timedelta(days=STALE_DAYS - 1)),
    )
    cards = (await _next(sessionmaker_for_test))["tonight"]["continuing"]

    assert {card["title"]: card["stale"] for card in cards} == {
        "Quiet": True,
        "Recent": False,
        "Long ago": True,
        "Fresh": False,
    }
    # Most recent session first, then the newest start among the journal-less.
    assert [card["title"] for card in cards] == ["Recent", "Quiet", "Fresh", "Long ago"]


async def test_the_continue_card_counts_only_the_open_runs_journal(
    sessionmaker_for_test,
):
    today = NOW.date()
    (replay,) = _with_ids(_game("Replay"))
    await _add(sessionmaker_for_test, replay)
    async with sessionmaker_for_test() as session:
        row = await session.get(Item, replay.id)
        await add_past(
            session, row, today - timedelta(days=200), today - timedelta(days=100)
        )
        await apply_status(session, row, ItemStatus.ACTIVE, today - timedelta(days=5))
        await session.commit()
    await _add(
        sessionmaker_for_test,
        _session(replay, today - timedelta(days=150), 600),
        _session(replay, today - timedelta(days=2), 30),
    )
    (card,) = (await _next(sessionmaker_for_test))["tonight"]["continuing"]

    assert card["playthrough"] == 2
    assert (card["sessions"], card["journal_hours"]) == (1, 0.5)
    assert card["last_played_on"] == (today - timedelta(days=2)).isoformat()


async def test_the_just_finished_chip_carries_the_rating(sessionmaker_for_test):
    (done,) = _with_ids(
        _game(
            "Done",
            status=ItemStatus.FINISHED,
            finished_at=NOW.date() - timedelta(days=2),
            rating=9,
        )
    )
    await _add(sessionmaker_for_test, done)
    chip = (await _next(sessionmaker_for_test))["tonight"]["last_finish"]
    assert (chip["title"], chip["rating"]) == ("Done", 9)


def _hours(hours: float) -> dict:
    return {"genres": ["Roguelike", "Indie"], "time_to_beat": {"normally": hours}}


async def test_last_finish_is_a_public_owned_game_from_the_last_60_days(
    sessionmaker_for_test,
):
    (old,) = _with_ids(
        _game(
            "Long Ago",
            status=ItemStatus.FINISHED,
            finished_at=NOW.date() - timedelta(days=61),
        ),
    )
    await _add(sessionmaker_for_test, old)

    assert (await _next(sessionmaker_for_test))["tonight"]["last_finish"] is None


async def test_up_next_carries_hours_and_no_slot(sessionmaker_for_test):
    (pinned,) = _with_ids(
        _game(
            "Pinned",
            status=ItemStatus.BACKLOG,
            pinned_at=NOW,
            source_metadata=_hours(12.4),
        )
    )
    await _add(sessionmaker_for_test, pinned)
    up_next = (await _next(sessionmaker_for_test))["tonight"]["up_next"]

    assert up_next["slot_label"] is None
    assert up_next["size"] == {"unit": "hours", "value": 12.4}
    assert up_next["progress"] is None


async def test_a_pinned_game_being_played_is_the_card_not_up_next(
    sessionmaker_for_test,
):
    """Pinning starts a game, so the pin outlives the playing: the Continue
    card is the answer to "tonight", not a second lead saying the same."""
    today = NOW.date()
    (pinned,) = _with_ids(_game("Pinned", pinned_at=NOW))
    await _add(sessionmaker_for_test, pinned)
    await _start(sessionmaker_for_test, pinned, today)
    tonight = (await _next(sessionmaker_for_test))["tonight"]

    assert [card["title"] for card in tonight["continuing"]] == ["Pinned"]
    assert tonight["up_next"] is None


async def test_a_pinned_game_that_was_finished_is_no_longer_up_next(
    sessionmaker_for_test,
):
    """Wrap up leaves the pin in place; the game just finished must not lead
    Tonight above the chip naming it."""
    today = NOW.date()
    (pinned,) = _with_ids(_game("Pinned", pinned_at=NOW))
    await _add(sessionmaker_for_test, pinned)
    await _start(sessionmaker_for_test, pinned, today)
    async with sessionmaker_for_test() as session:
        row = await session.get(Item, pinned.id)
        await apply_status(session, row, ItemStatus.FINISHED, today)
        await session.commit()
    tonight = (await _next(sessionmaker_for_test))["tonight"]

    assert tonight["continuing"] == []
    assert tonight["up_next"] is None
    assert tonight["last_finish"]["title"] == "Pinned"


# --- The live set (recommendation engine spec, "The public set is live") ---


def _comic(title: str, **fields) -> Item:
    base = dict(
        type=ItemType.COMIC,
        title=title,
        status=ItemStatus.BACKLOG,
        is_public=True,
        owned_format=OwnedFormat.PHYSICAL,
        issues_owned="1–10",
        read_to=3,
        source_metadata={"publisher": "Image"},
    )
    return Item(**{**base, **fields})


def _movie(title: str, **fields) -> Item:
    base = dict(
        type=ItemType.MOVIE,
        title=title,
        status=ItemStatus.BACKLOG,
        is_public=True,
        owned_format=OwnedFormat.PHYSICAL,
        source_metadata={"runtime_minutes": 118, "genres": ["Drama"]},
    )
    return Item(**{**base, **fields})


async def test_picks_are_live_with_no_pick_event_at_all(sessionmaker_for_test):
    await _add(
        sessionmaker_for_test,
        _game("Alpha", source_metadata=_hours(6)),
        _game("Bravo", source_metadata=_hours(20)),
        _game("Charlie"),
        _game("Delta"),
    )
    picks = (await _next(sessionmaker_for_test))["tonight"]["picks"]

    assert len(picks) == 3
    assert [set(pick) for pick in picks] == [PICK_FIELDS] * 3
    assert picks[0]["slot_label"] == "Best fit"
    assert all(pick["type"] == "game" for pick in picks)


async def test_an_event_written_today_changes_nothing(sessionmaker_for_test):
    """AC 2: browsing Play Next writes events; the public set reads none
    but the nevers from before midnight."""
    games = _with_ids(*(_game(f"Game {n}") for n in range(5)))
    await _add(sessionmaker_for_test, *games)
    before = await _next(sessionmaker_for_test)
    await _add(
        sessionmaker_for_test,
        *(
            PickEvent(item_id=game.id, action=action, created_at=NOW, slot="best_fit")
            for game in games
            for action in (PickAction.SHOWN, PickAction.SKIPPED, PickAction.NEVER)
        ),
    )
    after = await _next(sessionmaker_for_test)

    assert after["tonight"] == before["tonight"]


async def test_a_never_from_before_midnight_leaves_the_set(sessionmaker_for_test):
    kept, refused = _with_ids(_game("Kept"), _game("Refused"))
    await _add(
        sessionmaker_for_test,
        kept,
        refused,
        PickEvent(item_id=refused.id, action=PickAction.NEVER, created_at=SHOWN_DAY),
        # A skip is a "not tonight" for the owner, never a public refusal.
        PickEvent(item_id=kept.id, action=PickAction.SKIPPED, created_at=SHOWN_DAY),
    )
    picks = (await _next(sessionmaker_for_test))["tonight"]["picks"]
    assert [pick["title"] for pick in picks] == ["Kept"]


async def test_finishing_a_game_changes_the_picks_and_the_chip_together(
    sessionmaker_for_test,
):
    """AC 1: the finish that changes Just finished changes the picks in the
    same read, with no pick event written."""
    today = NOW.date()
    playing, waiting = _with_ids(_game("Playing"), _game("Waiting"))
    await _add(sessionmaker_for_test, playing, waiting)
    async with sessionmaker_for_test() as session:
        row = await session.get(Item, playing.id)
        await apply_status(session, row, ItemStatus.PAUSED, today)
        await session.commit()
    before = (await _next(sessionmaker_for_test))["tonight"]
    assert {pick["title"] for pick in before["picks"]} == {"Playing", "Waiting"}

    async with sessionmaker_for_test() as session:
        row = await session.get(Item, playing.id)
        await apply_status(session, row, ItemStatus.FINISHED, today)
        await session.commit()
    after = (await _next(sessionmaker_for_test))["tonight"]

    assert [pick["title"] for pick in after["picks"]] == ["Waiting"]
    assert after["last_finish"]["title"] == "Playing"
    async with sessionmaker_for_test() as session:
        events = (await session.execute(select(PickEvent))).scalars().all()
    assert events == []


async def test_change_of_pace_names_a_public_last_finish(sessionmaker_for_test):
    await _add(
        sessionmaker_for_test,
        _game(
            "Xenoblade",
            status=ItemStatus.FINISHED,
            finished_at=NOW.date() - timedelta(days=5),
            source_metadata=_hours(61.6),
        ),
        _game("Celeste", source_metadata=_hours(7.6)),
        _game("Hollow", source_metadata=_hours(12)),
    )
    _lead, pace = (await _next(sessionmaker_for_test))["tonight"]["picks"]

    assert pace["slot_label"] == "Change of pace"
    hours = round(pace["size"]["value"])
    assert pace["reasons"][0] == f"About {hours} h to finish, after 62 h of Xenoblade"


async def test_a_later_private_finish_changes_nothing_on_the_page(
    sessionmaker_for_test,
):
    """Change of pace measures against the last *public* finish, the one the
    chip names, so a later private finish leaves the page as it was:
    withholding the label would tell the page that one exists (privacy
    review, finding 2)."""
    rows = (
        _game(
            "Xenoblade",
            status=ItemStatus.FINISHED,
            finished_at=NOW.date() - timedelta(days=9),
            source_metadata=_hours(62),
        ),
        _game("Celeste", source_metadata=_hours(8)),
        _game("Hollow", source_metadata=_hours(12)),
    )
    await _add(sessionmaker_for_test, *rows)
    before = (await _next(sessionmaker_for_test))["tonight"]
    await _add(
        sessionmaker_for_test,
        _game(
            "Secret Game",
            is_public=False,
            status=ItemStatus.FINISHED,
            finished_at=NOW.date() - timedelta(days=2),
            source_metadata=_hours(30),
        ),
    )
    async with client_for(sessionmaker_for_test) as client:
        response = await client.get("/api/public/next")
    tonight = response.json()["tonight"]

    assert tonight["last_finish"]["title"] == "Xenoblade"
    assert [pick["slot_label"] for pick in tonight["picks"]] == [
        "Best fit",
        "Change of pace",
    ]
    assert "after 62 h of Xenoblade" in tonight["picks"][1]["reasons"][0]
    assert tonight["picks"] == before["picks"]
    assert "Secret" not in response.text


async def test_overdue_classic_leads_with_its_release_year(sessionmaker_for_test):
    await _add(
        sessionmaker_for_test,
        *(
            _game(f"Game {year}", release_date=date(year, 6, 1))
            for year in (1999, 2004, 2012, 2020)
        ),
    )
    picks = (await _next(sessionmaker_for_test))["tonight"]["picks"]
    third = picks[2]
    year = int(third["title"].split()[-1])

    assert third["slot_label"] == "Overdue classic"
    assert third["reasons"][0] == f"Out since {year}"


async def test_a_pick_never_names_a_private_game_or_a_private_date(
    sessionmaker_for_test,
):
    await _add(
        sessionmaker_for_test,
        _game(
            "Secret Favourite",
            is_public=False,
            favorite=True,
            rating=10,
            status=ItemStatus.FINISHED,
        ),
        _game(
            "Public Candidate",
            acquired_at=date(2019, 4, 1),
            started_at=date(2026, 1, 5),
            status=ItemStatus.PAUSED,
        ),
    )
    async with client_for(sessionmaker_for_test) as client:
        response = await client.get("/api/public/next")

    picks = response.json()["tonight"]["picks"]
    assert [row["title"] for row in picks] == ["Public Candidate"]
    for leaked in (
        "Secret Favourite",
        "On the shelf since",
        "April 2019",
        "Started in",
    ):
        assert leaked not in response.text


async def test_read_next_and_watch_next_carry_the_same_card(sessionmaker_for_test):
    await _add(
        sessionmaker_for_test,
        _comic("Saga"),
        _comic("Paper Girls", issues_owned="1–5", read_to=5),  # nothing left
        _comic("Private Run", is_public=False),
        _movie("Heat"),
    )
    tonight = (await _next(sessionmaker_for_test))["tonight"]

    (comic,) = tonight["read_next"]
    assert set(comic) == PICK_FIELDS
    assert (comic["title"], comic["type"], comic["platform"]) == (
        "Saga",
        "comic",
        "Image",
    )
    assert comic["size"] == {"unit": "issues", "value": 7.0}
    assert comic["progress"] == {"read": 3, "of": 10}
    (movie,) = tonight["watch_next"]
    assert set(movie) == PICK_FIELDS
    assert movie["size"] == {"unit": "minutes", "value": 118.0}
    assert movie["progress"] is None
    assert tonight["picks"] == []


async def test_empty_lanes_are_empty_lists(sessionmaker_for_test):
    tonight = (await _next(sessionmaker_for_test))["tonight"]
    assert (tonight["picks"], tonight["read_next"], tonight["watch_next"]) == (
        [],
        [],
        [],
    )


TODAY = NOW.date()


def _radar(title: str, **fields) -> Recommendation:
    metadata = {
        "lane": "preorder",
        "section": "suggested",
        "release_precision": "day",
        "release_source": "registry",
        "hypes": 40,
        "store_lines": [
            {
                "store": "Limited Run Games",
                "price": "59.99",
                "currency": "USD",
                "availability": "preorder",
                "preorder_closes_at": "2026-10-30T00:00:00+00:00",
                "url": "https://limitedrungames.com/products/x",
            }
        ],
        "snapshot": {"url": f"https://www.igdb.com/games/{title.lower()}"},
    }
    base = dict(
        kind=RecommendationKind.RADAR,
        type=ItemType.GAME,
        title=title,
        external_source="igdb",
        external_id=title.lower().replace(" ", "-"),
        release_date=TODAY + timedelta(days=60),
        cover_url=f"https://images.igdb.com/{title}.jpg",
        reason="Pre-orders close Nov 8 at Limited Run Games · $59.99",
        reason_source=ReasonSource.TEMPLATE,
        based_on=["x"],
        score=50,
        batch_id=uuid.uuid4(),
        status=RecommendationStatus.PENDING,
        platform_id=508,
        platform="Nintendo Switch 2",
        physical_format=PhysicalFormat.GAME_CARD,
        source_metadata=metadata,
    )
    overrides = fields.pop("source_metadata", None)
    row = Recommendation(**{**base, **fields})
    if overrides is not None:
        row.source_metadata = {**metadata, **overrides}
    return row


class _NoUpcoming:
    """IGDB for Radar's lane 3, with nothing upcoming."""

    def configured(self):
        return True

    async def upcoming(self, platforms, now):
        return []


async def _generate_radar(factory) -> None:
    app = FastAPI()
    app.include_router(
        create_recommendations_router(
            factory, {ItemType.GAME: _NoUpcoming()}, asyncio.Lock()
        )
    )

    @app.middleware("http")
    async def _sign_in(request, call_next):
        request.session["user"] = {"sub": "1", "email": "admin@example.com"}
        return await call_next(request)

    app.add_middleware(SessionMiddleware, secret_key="test-secret", https_only=False)
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://testserver", timeout=60
    ) as client:
        response = await client.post(
            "/api/recommendations/generate", json={"kind": "radar"}
        )
    assert response.status_code == 200


async def test_next_never_publishes_a_switch_1_sheet_date(sessionmaker_for_test):
    """No date from the Switch 1 sheet is public; the row is listed undated
    under Later (switch1 spec, decision 6; Spine Next spec, K5, S4).

    A Switch 1 cartridge the sheet dates after today goes through a real
    Radar generate. The row itself may be published; the date's source
    keeps its date off /api/public/next.
    """
    released = date.today() + timedelta(days=30)
    await _add(
        sessionmaker_for_test,
        CatalogueGame(
            igdb_id=501,
            title="Sheet Only",
            snapshot={"genres": ["Roguelike"], "similar_games": []},
            hypes=20,
            release_date=released,
        ),
    )
    await _add(
        sessionmaker_for_test,
        PhysicalEdition(
            source="nscollectors_ns1",
            source_ref="sheet only|USA||master|",
            title="Sheet Only",
            title_normalized="sheet only",
            platform_id=130,
            platform="Nintendo Switch",
            region="USA",
            is_physical=True,
            physical_format=PhysicalFormat.GAME_CARD,
            format_source="registry",
            cart_id="LA-H-AAAAA-USA",
            release_date=released,
            release_precision="day",
            igdb_id=501,
        ),
    )
    await _generate_radar(sessionmaker_for_test)
    async with sessionmaker_for_test() as session:
        (row,) = await session.scalars(
            select(Recommendation).where(Recommendation.external_id == "501")
        )
    assert (row.kind, row.status, row.physical_format, row.platform_id) == (
        RecommendationKind.RADAR,
        RecommendationStatus.PENDING,
        PhysicalFormat.GAME_CARD,
        130,
    )
    assert row.release_date > TODAY
    assert row.source_metadata["release_precision"] == "day"
    assert row.source_metadata["release_source"] != "registry"

    async with client_for(sessionmaker_for_test) as client:
        response = await client.get("/api/public/next")
    assert response.status_code == 200
    body = response.json()
    assert body["preorders"] == []
    (published,) = [r for key in STORE_SECTIONS for r in body[key]]
    assert published["title"] == "Sheet Only"
    assert published["release_date"] is None
    assert published["release_precision"] is None
    assert body["later"] == [published]
    assert released.isoformat() not in response.text


FORBIDDEN = {
    "id", "score", "rank", "hypes", "lane", "store_lines", "format_note",
    "model_note", "ranked_by", "based_on", "based_on_titles", "listing_ids",
    "preorder_closes_at", "price", "store", "url", "status", "batch_id",
    "slot", "created_at",
    # A playthrough's or a journal day's note is the owner's (play-states,
    # Tonight continue).
    "note", "minutes",
}  # fmt: skip
NEXT_ROW_FIELDS = {
    "title", "platform", "physical_format", "release_date", "release_precision",
    "cover_url", "igdb_url", "reasons", "top_pick", "new", "item_id",
    # Comics (2026-11-01): a comic want's type and how it sits on the shelf.
    "type", "shelf_format",
}  # fmt: skip


STORE_SECTIONS = ("buy_now", "preorders", "later", "not_on_cartridge")


def _keys(value):
    if isinstance(value, dict):
        for key, inner in value.items():
            yield key
            yield from _keys(inner)
    elif isinstance(value, list):
        for inner in value:
            yield from _keys(inner)


async def _next(factory) -> dict:
    async with client_for(factory) as client:
        response = await client.get("/api/public/next")
    assert response.status_code == 200
    return response.json()


async def test_the_next_row_model_publishes_exactly_these_fields():
    assert set(PublicNextRow.model_fields) == NEXT_ROW_FIELDS
    assert set(PublicNextOut.model_fields) == {
        "generated_at",
        "tonight",
        "wanted",
        "buy_now",
        "preorders",
        "later",
        "not_on_cartridge",
        "comics_this_week",
    }


async def test_no_private_key_appears_anywhere(sessionmaker_for_test):
    pinned = _game("Pinned", pinned_at=datetime.now(UTC))
    picked = _game("Picked")
    wanted = _game(
        "Wanted", owned_format=OwnedFormat.NONE, release_date=TODAY + timedelta(days=40)
    )
    _with_ids(pinned, picked, wanted)
    await _add(
        sessionmaker_for_test,
        pinned,
        picked,
        wanted,
        _radar("Soon"),
        _radar("Out", release_date=TODAY - timedelta(days=3)),
        _radar("Digital", physical_format=None, source_metadata={"lane": "digital"}),
        _radar(
            "Pick",
            kind=RecommendationKind.DISCOVER,
            release_date=TODAY - timedelta(days=100),
        ),
    )
    await _add(sessionmaker_for_test, _comic("Saga"), _movie("Heat"))
    body = await _next(sessionmaker_for_test)
    # Every lane is non-empty, so the walk covers each card's shape.
    assert body["tonight"]["read_next"] and body["tonight"]["watch_next"]
    assert FORBIDDEN.isdisjoint(set(_keys(body)))
    assert body["tonight"]["up_next"]["title"] == "Pinned"
    assert [p["title"] for p in body["tonight"]["picks"]] == ["Picked"]
    assert [w["title"] for w in body["wanted"]] == ["Wanted"]
    assert body["wanted"][0]["item_id"] == str(wanted.id)
    assert {r["title"] for r in body["buy_now"]} == {"Out", "Pick"}
    assert [r["title"] for r in body["preorders"]] == ["Soon"]
    assert [r["title"] for r in body["not_on_cartridge"]] == ["Digital"]


async def test_answered_rows_of_an_older_batch_are_never_published(
    sessionmaker_for_test,
):
    """Frozen to the batch (spec, S9): an answered row stays public until a
    newer generation of its kind, then never again. The pending row of the
    newer batch is the positive control."""
    older = NOW - timedelta(days=1)
    await _add(
        sessionmaker_for_test,
        *[
            _radar(f"Gone {s.value}", status=s, generated_at=older)
            for s in RecommendationStatus
            if s != RecommendationStatus.PENDING
        ],
        _radar("Fresh", generated_at=NOW),
    )
    body = await _next(sessionmaker_for_test)
    published = [r["title"] for key in STORE_SECTIONS for r in body[key]]
    assert published == ["Fresh"]


async def test_answered_rows_of_the_latest_batch_stay_published(
    sessionmaker_for_test,
):
    batch = uuid.uuid4()
    rows = [
        _radar(f"Kept {s.value}", status=s, batch_id=batch, generated_at=NOW)
        for s in RecommendationStatus
    ]
    await _add(sessionmaker_for_test, *rows)
    body = await _next(sessionmaker_for_test)
    assert {r["title"] for r in body["preorders"]} == {r.title for r in rows}
    assert FORBIDDEN.isdisjoint(set(_keys(body)))


async def test_stored_radar_reasons_never_reach_the_public(sessionmaker_for_test):
    await _add(
        sessionmaker_for_test,
        _game("Liked", rating=9),
        _radar(
            "Soon",
            reason="Pre-orders close Nov 8 at Limited Run Games · $59.99"
            "\nwhich you rated 10",
        ),
    )
    body = await _next(sessionmaker_for_test)
    text = " ".join(r for row in body["preorders"] for r in row["reasons"])
    assert "Pre-orders" not in text and "$" not in text and " you " not in f" {text} "


async def test_a_blank_first_line_never_promotes_a_store_line(sessionmaker_for_test):
    """Only the first stored line is ever the model's sentence; the lines
    after it are the store window, price and format (discover._extras). A
    blank first line means no sentence, never that the store line is one."""
    liked = _game("Liked", rating=9)
    _with_ids(liked)
    await _add(
        sessionmaker_for_test,
        liked,
        _radar(
            "Pick",
            kind=RecommendationKind.DISCOVER,
            release_date=TODAY - timedelta(days=100),
            reason="\nPre-orders close Nov 8 at Limited Run Games · $59.99"
            "\nFull game on cartridge",
            reason_source=ReasonSource.MODEL,
            based_on=[str(liked.id)],
        ),
    )
    body = await _next(sessionmaker_for_test)
    assert [row["title"] for row in body["buy_now"]] == ["Pick"]
    text = " ".join(r for row in body["buy_now"] for r in row["reasons"])
    assert "Pre-orders" not in text and "$" not in text


async def test_a_discover_reason_citing_a_private_game_is_replaced(
    sessionmaker_for_test,
):
    hidden = _game("Hidden Gem", is_public=False, rating=10)
    _with_ids(hidden)
    await _add(
        sessionmaker_for_test,
        hidden,
        _radar(
            "Pick",
            kind=RecommendationKind.DISCOVER,
            release_date=TODAY - timedelta(days=100),
            reason="Because I loved Hidden Gem",
            reason_source=ReasonSource.MODEL,
            based_on=[str(hidden.id)],
        ),
    )
    body = await _next(sessionmaker_for_test)
    assert [row["title"] for row in body["buy_now"]] == ["Pick"]
    assert all("Hidden Gem" not in r for row in body["buy_now"] for r in row["reasons"])


async def test_store_dated_rows_are_undated_and_later(sessionmaker_for_test):
    await _add(
        sessionmaker_for_test,
        _radar("Store", source_metadata={"release_source": "store"}),
    )
    body = await _next(sessionmaker_for_test)
    assert body["preorders"] == []
    assert body["later"][0]["title"] == "Store"
    assert body["later"][0]["release_date"] is None
    assert body["later"][0]["release_precision"] is None


async def test_only_registry_dates_are_published(sessionmaker_for_test):
    # A store listing's date (parsed from its page) and IGDB's first date stay
    # private, and a row stored before release_source existed is undated
    # until a Generate. Each is still listed, without its date.
    unrecorded = _radar("Unrecorded")
    unrecorded.source_metadata = {
        key: value
        for key, value in unrecorded.source_metadata.items()
        if key != "release_source"
    }
    await _add(
        sessionmaker_for_test,
        _radar("Registry"),
        _radar("Store Date", source_metadata={"release_source": "store"}),
        _radar("IGDB Date", source_metadata={"release_source": "igdb_first"}),
        unrecorded,
    )
    body = await _next(sessionmaker_for_test)
    assert [row["title"] for row in body["preorders"]] == ["Registry"]
    assert body["preorders"][0]["release_date"] == str(TODAY + timedelta(days=60))
    assert {row["title"] for row in body["later"]} == {
        "Store Date",
        "IGDB Date",
        "Unrecorded",
    }
    for row in body["later"]:
        assert row["release_date"] is None
        assert row["release_precision"] is None


async def test_preorders_are_soonest_first_whatever_the_score(sessionmaker_for_test):
    # Score and date disagree on purpose: the best-scored game releases last,
    # so a sort by score fails. The row carries exactly the published fields.
    rows = [
        _radar(f"Game {n}", score=n * 10, release_date=TODAY + timedelta(days=10 + n))
        for n in range(1, 9)
    ]
    await _add(sessionmaker_for_test, *rows)
    body = await _next(sessionmaker_for_test)
    assert [row["title"] for row in body["preorders"]] == [
        f"Game {n}" for n in range(1, 9)
    ]
    for row in body["preorders"]:
        assert set(row) == NEXT_ROW_FIELDS
        assert row["physical_format"] == "game_card"
        assert row["igdb_url"].startswith("https://www.igdb.com/games/")


async def test_precision_decides_the_section_before_the_date_does(
    sessionmaker_for_test,
):
    # A year-dated row is never a pre-order, however high it scores or soon
    # its stored date falls; it waits under Later.
    rows = [
        _radar(f"Day {n}", score=10 + n, release_date=TODAY + timedelta(days=10 + n))
        for n in range(1, 4)
    ]
    rows.append(
        _radar("Some Year", score=99, source_metadata={"release_precision": "year"})
    )
    await _add(sessionmaker_for_test, *rows)
    body = await _next(sessionmaker_for_test)
    assert [row["title"] for row in body["preorders"]] == [
        f"Day {n}" for n in range(1, 4)
    ]
    assert [row["title"] for row in body["later"]] == ["Some Year"]
    assert body["later"][0]["release_precision"] == "year"


async def test_each_kind_of_row_lands_in_its_own_section(sessionmaker_for_test):
    await _add(
        sessionmaker_for_test,
        _radar("Keep"),
        _radar("Discover", kind=RecommendationKind.DISCOVER),
        _radar("Key Card", physical_format=PhysicalFormat.GAME_KEY_CARD),
        _radar("Digital", physical_format=None, source_metadata={"lane": "digital"}),
        _radar("Unknown Format", physical_format=None),
        _radar("Released", release_date=TODAY - timedelta(days=100)),
        _radar("Undated", release_date=None),
    )
    body = await _next(sessionmaker_for_test)
    assert [row["title"] for row in body["preorders"]] == ["Keep"]
    assert [row["title"] for row in body["buy_now"]] == ["Released"]
    assert [row["title"] for row in body["later"]] == ["Undated"]
    assert {row["title"] for row in body["not_on_cartridge"]} == {"Key Card", "Digital"}
    published = {r["title"] for key in STORE_SECTIONS for r in body[key]}
    # A Discover pick dated after today and a row of unknown format are out.
    assert not published & {"Discover", "Unknown Format"}


async def test_next_links_only_to_igdb(sessionmaker_for_test):
    await _add(
        sessionmaker_for_test,
        _radar("Linked"),
        _radar("Script", source_metadata={"snapshot": {"url": "javascript:alert(1)"}}),
        _radar("Bare", source_metadata={"snapshot": {}}),
        _radar(
            "Plain Http",
            source_metadata={"snapshot": {"url": "http://www.igdb.com/games/x"}},
        ),
        _radar(
            "Lookalike",
            source_metadata={
                "snapshot": {"url": "https://www.igdb.com.example/games/x"}
            },
        ),
    )
    body = await _next(sessionmaker_for_test)
    rows = {row["title"]: row for row in body["preorders"]}
    assert set(rows) == {"Linked", "Script", "Bare", "Plain Http", "Lookalike"}
    assert rows["Linked"]["igdb_url"] == "https://www.igdb.com/games/linked"
    for title in ("Script", "Bare", "Plain Http", "Lookalike"):
        assert rows[title]["igdb_url"] is None


async def test_next_publishes_no_store_price_window_or_stored_reason(
    sessionmaker_for_test,
):
    await _add(sessionmaker_for_test, _radar("Leaky"))
    async with client_for(sessionmaker_for_test) as client:
        response = await client.get("/api/public/next")
    (row,) = response.json()["preorders"]
    assert set(row) == NEXT_ROW_FIELDS
    for leaked in (
        "Limited Run Games",
        "59.99",
        "Pre-orders close",
        "limitedrungames.com",
        "availability",
        '"preorder"',
        "suggested",
        "score",
        "USD",
        "2026-10-30",
        "hypes",
        "lane",
    ):
        assert leaked not in response.text


async def test_generated_at_publishes_utc_days_only(sessionmaker_for_test):
    """The owner's generate and store-run times are published to the day,
    as the pick day is: a timestamp would say when the owner was working."""
    late = datetime(2026, 9, 27, 23, 30, tzinfo=UTC)
    await _add(
        sessionmaker_for_test,
        _radar("Soon", generated_at=late),
        _radar(
            "Pick",
            kind=RecommendationKind.DISCOVER,
            release_date=TODAY - timedelta(days=100),
            generated_at=late,
        ),
        *[
            CatalogueRun(
                source=source,
                started_at=late - timedelta(minutes=1),
                finished_at=late,
                ok=True,
            )
            for source in STORES
        ],
    )
    body = await _next(sessionmaker_for_test)
    assert body["generated_at"] == {
        "catalogue": "2026-09-27",
        "radar": "2026-09-27",
        "discover": "2026-09-27",
    }


NOT_FIRST_PERSON = re.compile(
    r"\b(you|your|yours|they|their|theirs|them|the owner|the collector)\b",
    re.IGNORECASE,
)


def _reasons(body: dict) -> list[str]:
    tonight = body["tonight"]
    cards = [
        tonight["up_next"] or {"reasons": []},
        *tonight["picks"],
        *tonight["read_next"],
        *tonight["watch_next"],
    ]
    rows = [row for key in ("wanted", *STORE_SECTIONS) for row in body[key]]
    return [reason for row in cards + rows for reason in row["reasons"]]


async def test_a_passing_discover_sentence_reaches_the_body(sessionmaker_for_test):
    liked = _game("Liked", rating=9)
    _with_ids(liked)
    await _add(
        sessionmaker_for_test,
        liked,
        _radar(
            "Pick",
            kind=RecommendationKind.DISCOVER,
            release_date=TODAY - timedelta(days=100),
            reason="Like Liked, I'd enjoy this\nIn stock at Limited Run Games",
            reason_source=ReasonSource.MODEL,
            based_on=[str(liked.id)],
        ),
    )
    body = await _next(sessionmaker_for_test)
    (row,) = body["buy_now"]
    assert row["reasons"][0] == "Like Liked, I'd enjoy this"
    assert all("Limited Run" not in reason for reason in row["reasons"])


async def test_radar_reasons_are_rebuilt_over_public_games(sessionmaker_for_test):
    traits = {"genres": ["Roguelike", "Indie"], "themes": ["Fantasy"]}
    await _add(
        sessionmaker_for_test,
        _game("Liked", rating=9, source_metadata=traits),
        _radar(
            "Soon",
            source_metadata={
                "snapshot": {"url": "https://www.igdb.com/games/soon", **traits}
            },
        ),
    )
    body = await _next(sessionmaker_for_test)
    (row,) = body["preorders"]
    assert row["reasons"]
    text = " ".join(row["reasons"])
    assert "Pre-orders" not in text and "$" not in text and "Limited Run" not in text


async def test_every_reason_in_the_body_is_first_person(sessionmaker_for_test):
    liked = _game("Liked", rating=9, favorite=True)
    picked = _game("Picked", source_metadata={"genres": ["Roguelike"]})
    _with_ids(liked, picked)
    await _add(
        sessionmaker_for_test,
        liked,
        picked,
        _radar("Soon", reason="which you rated 10"),
        _radar(
            "Pick",
            kind=RecommendationKind.DISCOVER,
            release_date=TODAY - timedelta(days=100),
            reason="They would love this, like Liked",
            reason_source=ReasonSource.MODEL,
            based_on=[str(liked.id)],
        ),
        _radar(
            "Other",
            kind=RecommendationKind.DISCOVER,
            release_date=TODAY - timedelta(days=50),
            reason="Your kind of game, like Liked",
            reason_source=ReasonSource.MODEL,
            based_on=[str(liked.id)],
        ),
    )
    body = await _next(sessionmaker_for_test)
    reasons = _reasons(body)
    assert reasons  # the check below must have something to read
    assert not [reason for reason in reasons if NOT_FIRST_PERSON.search(reason)]


async def test_a_private_pinned_or_wanted_game_never_appears(sessionmaker_for_test):
    await _add(
        sessionmaker_for_test,
        _game("Secret Pin", is_public=False, pinned_at=datetime.now(UTC)),
        _game(
            "Secret Want",
            is_public=False,
            owned_format=OwnedFormat.NONE,
            release_date=TODAY + timedelta(days=20),
        ),
        _game("Shown Want", owned_format=OwnedFormat.NONE),
    )
    async with client_for(sessionmaker_for_test) as client:
        response = await client.get("/api/public/next")
    assert "Secret" not in response.text
    body = response.json()
    assert body["tonight"]["up_next"] is None
    assert [row["title"] for row in body["wanted"]] == ["Shown Want"]


async def _seed_same_title(factory, *extra):
    """A Discover sentence naming "Secret Game", a private favourite rated 10
    with no IGDB link, cited alongside a public game."""
    liked = _game("Liked", rating=9)
    secret = _game("Secret Game", rating=10, is_public=False, favorite=True)
    _with_ids(liked, secret)
    await _add(
        factory,
        liked,
        secret,
        _radar(
            "Pick",
            kind=RecommendationKind.DISCOVER,
            release_date=TODAY - timedelta(days=100),
            reason="Like Liked and Secret Game, I'd enjoy this",
            reason_source=ReasonSource.MODEL,
            based_on=[str(liked.id)],
        ),
        *extra,
    )


async def test_a_row_sharing_a_private_title_never_lifts_the_scan(
    sessionmaker_for_test,
):
    """The reviewer's probe: a pending Radar row of unknown format (a
    candidate that is never rendered) titled like a private game must not
    let a sentence name that game."""
    await _seed_same_title(
        sessionmaker_for_test, _radar("Secret Game", physical_format=None)
    )
    async with client_for(sessionmaker_for_test) as client:
        response = await client.get("/api/public/next")
    assert "Secret Game" not in response.text


async def test_an_owned_row_of_another_game_never_lifts_the_scan(
    sessionmaker_for_test,
):
    """A remake sharing the title: the owned, rendered row is a different
    IGDB game from the private item, so the private item stays scanned."""
    await _seed_same_title(
        sessionmaker_for_test,
        _radar(
            "Secret Game",
            external_id="remake",
            status=RecommendationStatus.OWNED,
            generated_at=NOW,
        ),
        _radar("Coming", generated_at=NOW),
    )
    body = await _next(sessionmaker_for_test)
    assert "Secret Game" in {r["title"] for r in body["preorders"]}
    assert all("Secret Game" not in r for r in _reasons(body))


async def test_answering_a_discover_platforms_only_pick_leaves_the_body(
    sessionmaker_for_test,
):
    """Discover replaces every platform's pending picks at once, so it
    freezes per kind: owning the one N64 pick must not drop it."""
    batch, at = uuid.uuid4(), NOW - timedelta(hours=2)
    common = dict(
        kind=RecommendationKind.DISCOVER,
        batch_id=batch,
        generated_at=at,
        release_date=TODAY - timedelta(days=100),
    )
    await _add(
        sessionmaker_for_test,
        _radar("Two Pick", platform_id=508, **common),
        _radar("Two Pick B", platform_id=508, **common),
        _radar("Sixty Four Pick", platform_id=4, platform="Nintendo 64", **common),
    )
    before = await _next(sessionmaker_for_test)
    async with sessionmaker_for_test() as session:
        await session.execute(
            update(Recommendation)
            .where(Recommendation.title == "Sixty Four Pick")
            .values(status=RecommendationStatus.OWNED)
        )
        await session.commit()
    after = await _next(sessionmaker_for_test)
    assert "Sixty Four Pick" in {r["title"] for r in before["buy_now"]}
    assert after == before


# The /spine status strip (spine tour plan, answer 1).
STATUS_FIELDS = {"refreshed_at", "titles", "platforms", "stores_watched", "listings"}
SITE_STATS_FIELDS = {"thirty", "all"}
SUMMARY_FIELDS = {
    "start", "end", "views", "visitors", "views_per_visitor", "best_day",
    "series", "pages", "referrers", "referrers_other", "devices", "live_since",
}  # fmt: skip
# No referrer: the best day's dominant host could be one the fold hid.
BEST_DAY_FIELDS = {"day", "views"}


def _edition(ref: str, **fields) -> PhysicalEdition:
    base = dict(
        source="nscollectors",
        source_ref=ref,
        title=ref,
        title_normalized=ref,
        platform_id=508,
        platform="Nintendo Switch 2",
        region="USA",
    )
    return PhysicalEdition(**{**base, **fields})


def _listing(handle: str, availability: str) -> StoreListing:
    return StoreListing(
        store="super_rare",
        store_product_id=handle,
        variant_id=handle,
        handle=handle,
        url=f"https://example.test/{handle}",
        region="EUR",
        title=handle,
        title_normalized=handle,
        is_game=True,
        currency="GBP",
        availability=availability,
        price=44.99,
    )


def _run(source: str, finished: datetime | None, ok: bool | None) -> CatalogueRun:
    return CatalogueRun(
        source=source,
        started_at=(finished or NOW) - timedelta(minutes=5),
        finished_at=finished,
        ok=ok,
    )


async def _status(factory):
    async with client_for(factory) as client:
        return await client.get("/api/public/status")


async def test_the_status_model_publishes_exactly_these_fields():
    assert set(PublicStatusOut.model_fields) == STATUS_FIELDS
    assert not STATUS_FIELDS & FORBIDDEN


async def test_the_site_stats_models_publish_exactly_these_fields():
    assert set(PublicSiteStatsOut.model_fields) == SITE_STATS_FIELDS
    assert set(PublicSummaryOut.model_fields) == SUMMARY_FIELDS
    assert set(PublicBestDayOut.model_fields) == BEST_DAY_FIELDS
    assert not (SITE_STATS_FIELDS | SUMMARY_FIELDS | BEST_DAY_FIELDS) & FORBIDDEN


async def test_an_empty_catalogue_reports_zeros_and_no_refresh(sessionmaker_for_test):
    response = await _status(sessionmaker_for_test)

    assert response.status_code == 200
    assert response.headers["cache-control"] == "public, max-age=300"
    assert response.json() == {
        "refreshed_at": None,
        "titles": 0,
        "platforms": 0,
        "stores_watched": len(STORES),
        "listings": 0,
    }


async def test_status_counts_matched_live_titles_and_live_listings(
    sessionmaker_for_test,
):
    await _add(
        sessionmaker_for_test,
        CatalogueGame(igdb_id=1, title="One", snapshot={}),
        CatalogueGame(igdb_id=2, title="Two", snapshot={}),
    )
    await _add(
        sessionmaker_for_test,
        _edition("one usa", igdb_id=1),
        _edition("one eur", igdb_id=1, region="EUR"),
        _edition("two ns1", igdb_id=2, platform_id=130, platform="Nintendo Switch"),
        # Unmatched, as the hidden Switch 1 rows are: a platform, not a title.
        _edition("unmatched", platform_id=130, platform="Nintendo Switch"),
        _edition("retired", igdb_id=2, platform_id=4, retired_at=NOW),
        _listing("live", "in_stock"),
        _listing("preorder", "preorder"),
        _listing("gone", "archived"),
    )

    body = (await _status(sessionmaker_for_test)).json()

    assert (body["titles"], body["platforms"], body["listings"]) == (2, 2, 2)


async def test_refreshed_is_the_newest_good_store_or_registry_run(
    sessionmaker_for_test,
):
    store = next(iter(STORES))
    good = NOW - timedelta(hours=14, seconds=42)
    await _add(
        sessionmaker_for_test,
        _run(store, good, True),
        _run("nscollectors", good - timedelta(hours=1), True),
        # Later, but failed, still open, or pressed by hand: none counts.
        _run(store, NOW - timedelta(hours=2), False),
        _run("nscollectors", None, None),
        _run("resolve", NOW - timedelta(hours=1), True),
        _run("igdb_platform", NOW - timedelta(hours=1), True),
    )

    body = (await _status(sessionmaker_for_test)).json()

    expected = good.replace(second=0, microsecond=0)
    assert datetime.fromisoformat(body["refreshed_at"]) == expected
