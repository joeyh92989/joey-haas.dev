"""Public picks and radar (showcase spec, D). The leak tests are the point."""

import asyncio
import uuid
from contextlib import asynccontextmanager
from datetime import UTC, date, datetime, time, timedelta

import pytest
from fastapi import FastAPI
from httpx2 import ASGITransport, AsyncClient
from sqlalchemy import select
from starlette.middleware.sessions import SessionMiddleware

import public
from models import (
    CatalogueGame,
    Item,
    ItemStatus,
    ItemType,
    OwnedFormat,
    PhysicalEdition,
    PhysicalFormat,
    PickAction,
    PickEvent,
    ReasonSource,
    Recommendation,
    RecommendationKind,
    RecommendationStatus,
)
from public import create_public_router
from public_outputs import PublicNextOut, PublicNextRow, PublicPickOut, PublicRadarOut
from recommendations_routes import create_recommendations_router

pytestmark = pytest.mark.asyncio

# The server reads datetime.now(UTC); the clock is frozen here (see `clock`)
# so no test can straddle a UTC midnight.
NOW = datetime(2026, 9, 28, 15, 0, tzinfo=UTC)
MIDNIGHT = datetime.combine(NOW.date(), time.min, tzinfo=UTC)
# Noon yesterday, UTC: every pick event sits on one whole day, before today's
# midnight and within the seven-day window.
SHOWN_DAY = MIDNIGHT - timedelta(hours=12)

PICK_FIELDS = {"id", "type", "title", "cover_url", "platform", "reasons"}


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


def _shown(item: Item, at: datetime) -> PickEvent:
    return PickEvent(item_id=item.id, action=PickAction.SHOWN, created_at=at)


def _with_ids(*items: Item) -> tuple[Item, ...]:
    for entry in items:
        entry.id = uuid.uuid4()
    return items


async def test_the_pick_model_publishes_exactly_these_fields():
    assert set(PublicPickOut.model_fields) == PICK_FIELDS


async def test_recent_picks_are_the_latest_shown_day_of_public_owned_games(
    sessionmaker_for_test,
):
    hades, pick_a, pick_b, pick_c, pick_d, older = _with_ids(
        _game("Hades", favorite=True, status=ItemStatus.FINISHED),
        _game("Alpha"),
        _game("Bravo", status=ItemStatus.ACTIVE),
        _game("Charlie"),
        _game("Delta"),
        _game("Older"),
    )
    latest = SHOWN_DAY
    await _add(sessionmaker_for_test, hades, pick_a, pick_b, pick_c, pick_d, older)
    await _add(
        sessionmaker_for_test,
        _shown(pick_a, latest - timedelta(minutes=3)),
        _shown(pick_b, latest - timedelta(minutes=2)),
        _shown(pick_c, latest - timedelta(minutes=1)),
        _shown(pick_d, latest),
        _shown(older, latest - timedelta(days=1)),
    )
    async with client_for(sessionmaker_for_test) as client:
        response = await client.get("/api/public/picks")

    assert response.status_code == 200
    body = response.json()
    # One day, three picks, by title: shown times ascend with the title, so
    # latest-first would be Delta, Charlie, Bravo.
    assert [row["title"] for row in body] == ["Alpha", "Bravo", "Charlie"]
    for row in body:
        assert set(row) == PICK_FIELDS
        assert "Shares Indie and Roguelike with Hades ♥" in row["reasons"]


async def test_picks_leave_out_what_is_not_a_public_suggestion(
    sessionmaker_for_test,
):
    (
        keep,
        private,
        wanted,
        finished,
        pinned,
        never,
        skipped_after,
        skipped_before,
    ) = _with_ids(
        _game("Keep"),
        _game("Private", is_public=False),
        _game("Wanted", owned_format=OwnedFormat.NONE),
        _game("Finished", status=ItemStatus.FINISHED),
        _game("Pinned", pinned_at=NOW, status=ItemStatus.ACTIVE),
        _game("Never"),
        _game("Skipped After"),
        _game("Skipped Before"),
    )
    shown_at = SHOWN_DAY
    rows = (
        keep,
        private,
        wanted,
        finished,
        pinned,
        never,
        skipped_after,
        skipped_before,
    )
    await _add(sessionmaker_for_test, *rows)
    await _add(
        sessionmaker_for_test,
        *(_shown(row, shown_at) for row in rows),
        PickEvent(
            item_id=never.id,
            action=PickAction.NEVER,
            created_at=shown_at - timedelta(days=40),
        ),
        PickEvent(
            item_id=skipped_after.id,
            action=PickAction.SKIPPED,
            created_at=shown_at + timedelta(minutes=1),
        ),
        PickEvent(
            item_id=skipped_before.id,
            action=PickAction.SKIPPED,
            created_at=shown_at - timedelta(days=3),
        ),
    )
    async with client_for(sessionmaker_for_test) as client:
        body = (await client.get("/api/public/picks")).json()

    assert sorted(row["title"] for row in body) == ["Keep", "Skipped Before"]


async def test_picks_are_empty_once_the_latest_shown_day_is_a_week_old(
    sessionmaker_for_test,
):
    # Eight days before today: the window is the seven days ending yesterday.
    (stale,) = _with_ids(_game("Stale"))
    await _add(sessionmaker_for_test, stale)
    await _add(sessionmaker_for_test, _shown(stale, SHOWN_DAY - timedelta(days=7)))
    async with client_for(sessionmaker_for_test) as client:
        response = await client.get("/api/public/picks")
    assert response.status_code == 200
    assert response.json() == []


async def test_picks_are_empty_before_play_next_has_run(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        response = await client.get("/api/public/picks")
    assert response.json() == []


async def test_a_pick_never_names_a_private_game_or_a_private_date(
    sessionmaker_for_test,
):
    secret, candidate = _with_ids(
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
            status=ItemStatus.ACTIVE,
        ),
    )
    await _add(sessionmaker_for_test, secret, candidate)
    await _add(sessionmaker_for_test, _shown(candidate, SHOWN_DAY))
    async with client_for(sessionmaker_for_test) as client:
        response = await client.get("/api/public/picks")

    assert [row["title"] for row in response.json()] == ["Public Candidate"]
    for leaked in (
        "Secret Favourite",
        "On the shelf since",
        "April 2019",
        "Started in",
    ):
        assert leaked not in response.text


async def test_the_pick_day_ignores_shown_games_the_public_cannot_see(
    sessionmaker_for_test,
):
    # Yesterday's only shown games are private or were skipped after being
    # shown: the day before's public pick must still be returned, not [].
    earlier_pick, private, skipped = _with_ids(
        _game("Earlier Pick"),
        _game("Private Yesterday", is_public=False),
        _game("Skipped Yesterday"),
    )
    await _add(sessionmaker_for_test, earlier_pick, private, skipped)
    await _add(
        sessionmaker_for_test,
        _shown(earlier_pick, SHOWN_DAY - timedelta(days=1)),
        _shown(private, SHOWN_DAY),
        _shown(skipped, SHOWN_DAY),
        PickEvent(
            item_id=skipped.id,
            action=PickAction.SKIPPED,
            created_at=SHOWN_DAY + timedelta(minutes=1),
        ),
    )
    async with client_for(sessionmaker_for_test) as client:
        body = (await client.get("/api/public/picks")).json()

    assert [row["title"] for row in body] == ["Earlier Pick"]


async def test_picks_from_seven_days_ago_are_still_inside_the_window(
    sessionmaker_for_test,
):
    (recent,) = _with_ids(_game("Seven Days Ago"))
    await _add(sessionmaker_for_test, recent)
    await _add(sessionmaker_for_test, _shown(recent, SHOWN_DAY - timedelta(days=6)))
    async with client_for(sessionmaker_for_test) as client:
        body = (await client.get("/api/public/picks")).json()

    assert [row["title"] for row in body] == ["Seven Days Ago"]


async def test_a_game_shown_today_waits_until_tomorrow(sessionmaker_for_test, clock):
    # Play Next's use today is not public until the day is over: yesterday's
    # pick shows, and today's appears only once the clock passes midnight.
    yesterday, today_only = _with_ids(_game("Yesterday"), _game("Today Only"))
    await _add(sessionmaker_for_test, yesterday, today_only)
    await _add(
        sessionmaker_for_test,
        _shown(yesterday, SHOWN_DAY),
        _shown(today_only, MIDNIGHT + timedelta(minutes=1)),
    )
    async with client_for(sessionmaker_for_test) as client:
        before = (await client.get("/api/public/picks")).json()
        clock(NOW + timedelta(days=1))
        after = (await client.get("/api/public/picks")).json()

    assert [row["title"] for row in before] == ["Yesterday"]
    assert [row["title"] for row in after] == ["Today Only"]


async def test_a_skip_or_never_today_keeps_yesterdays_pick(sessionmaker_for_test):
    skipped, nevered = _with_ids(_game("Skipped Today"), _game("Nevered Today"))
    await _add(sessionmaker_for_test, skipped, nevered)
    await _add(
        sessionmaker_for_test,
        _shown(skipped, SHOWN_DAY),
        _shown(nevered, SHOWN_DAY),
        PickEvent(
            item_id=skipped.id,
            action=PickAction.SKIPPED,
            created_at=MIDNIGHT + timedelta(hours=1),
        ),
        PickEvent(
            item_id=nevered.id,
            action=PickAction.NEVER,
            created_at=MIDNIGHT + timedelta(hours=1),
        ),
    )
    async with client_for(sessionmaker_for_test) as client:
        body = (await client.get("/api/public/picks")).json()

    assert [row["title"] for row in body] == ["Nevered Today", "Skipped Today"]


async def test_picks_within_the_day_are_in_title_order(sessionmaker_for_test):
    # Time order (Echo, Zulu, Mike, Alpha latest first) differs from title
    # order, and the limit keeps the first three titles, not the latest three.
    alpha, echo, mike, zulu = _with_ids(
        _game("Alpha"), _game("Echo"), _game("Mike"), _game("Zulu")
    )
    day = MIDNIGHT - timedelta(days=1)
    await _add(sessionmaker_for_test, alpha, echo, mike, zulu)
    await _add(
        sessionmaker_for_test,
        _shown(alpha, day + timedelta(hours=1)),
        _shown(mike, day + timedelta(hours=9)),
        _shown(zulu, day + timedelta(hours=12)),
        _shown(echo, day + timedelta(hours=23)),
    )
    async with client_for(sessionmaker_for_test) as client:
        body = (await client.get("/api/public/picks")).json()

    assert [row["title"] for row in body] == ["Alpha", "Echo", "Mike"]


async def test_a_skip_at_the_shown_instant_removes_the_pick(sessionmaker_for_test):
    kept, skipped = _with_ids(_game("Kept"), _game("Skipped At Once"))
    await _add(sessionmaker_for_test, kept, skipped)
    await _add(
        sessionmaker_for_test,
        _shown(kept, SHOWN_DAY),
        _shown(skipped, SHOWN_DAY),
        PickEvent(item_id=skipped.id, action=PickAction.SKIPPED, created_at=SHOWN_DAY),
    )
    async with client_for(sessionmaker_for_test) as client:
        body = (await client.get("/api/public/picks")).json()

    assert [row["title"] for row in body] == ["Kept"]


RADAR_FIELDS = {
    "title",
    "platform",
    "physical_format",
    "release_date",
    "release_precision",
    "igdb_url",
    "cover_url",
}
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
                "preorder_closes_at": "2026-11-08T00:00:00+00:00",
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


async def test_the_radar_model_publishes_exactly_these_fields():
    assert set(PublicRadarOut.model_fields) == RADAR_FIELDS


async def test_radar_lists_the_top_upcoming_cartridges_soonest_first(
    sessionmaker_for_test,
):
    rows = [
        _radar(f"Game {n}", score=n * 10, release_date=TODAY + timedelta(days=10 + n))
        for n in range(1, 9)
    ]
    await _add(sessionmaker_for_test, *rows)
    async with client_for(sessionmaker_for_test) as client:
        response = await client.get("/api/public/radar")

    assert response.status_code == 200
    body = response.json()
    # Top six by score (Game 3 .. Game 8), shown soonest first. Score and date
    # disagree on purpose: the best-scored game releases last, so dropping the
    # re-sort or taking the soonest six instead of the top six both fail.
    assert [row["title"] for row in body] == [
        "Game 3",
        "Game 4",
        "Game 5",
        "Game 6",
        "Game 7",
        "Game 8",
    ]
    for row in body:
        assert set(row) == RADAR_FIELDS
        assert row["physical_format"] == "game_card"
        assert row["igdb_url"].startswith("https://www.igdb.com/games/")


async def test_radar_filters_precision_before_it_takes_six(sessionmaker_for_test):
    # The best-scored row is year-dated: were the limit taken first, it would
    # use one of the six places and a day-dated row would be lost.
    rows = [
        _radar(f"Day {n}", score=10 + n, release_date=TODAY + timedelta(days=10 + n))
        for n in range(1, 7)
    ]
    rows.append(
        _radar("Some Year", score=99, source_metadata={"release_precision": "year"})
    )
    await _add(sessionmaker_for_test, *rows)
    async with client_for(sessionmaker_for_test) as client:
        body = (await client.get("/api/public/radar")).json()
    assert [row["title"] for row in body] == [f"Day {n}" for n in range(1, 7)]


async def test_radar_leaves_out_what_is_not_a_public_upcoming_cartridge(
    sessionmaker_for_test,
):
    await _add(
        sessionmaker_for_test,
        _radar("Keep"),
        _radar("Discover", kind=RecommendationKind.DISCOVER),
        _radar("Wanted", status=RecommendationStatus.WANTED),
        _radar("Dismissed", status=RecommendationStatus.DISMISSED),
        _radar("Key Card", physical_format=PhysicalFormat.GAME_KEY_CARD),
        _radar("Digital", physical_format=None),
        _radar("Released", release_date=TODAY),
        _radar("Undated", release_date=None),
        _radar("Some Year", source_metadata={"release_precision": "year"}),
    )
    async with client_for(sessionmaker_for_test) as client:
        body = (await client.get("/api/public/radar")).json()
    assert [row["title"] for row in body] == ["Keep"]


async def test_radar_publishes_only_dates_the_registry_gave(sessionmaker_for_test):
    # A store listing's date (parsed from its page) stays private, and a row
    # stored before release_source existed stays hidden until a Generate.
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
    async with client_for(sessionmaker_for_test) as client:
        response = await client.get("/api/public/radar")
    assert [row["title"] for row in response.json()] == ["Registry"]


async def test_radar_links_only_to_igdb(sessionmaker_for_test):
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
    async with client_for(sessionmaker_for_test) as client:
        body = {
            row["title"]: row for row in (await client.get("/api/public/radar")).json()
        }
    assert body["Linked"]["igdb_url"] == "https://www.igdb.com/games/linked"
    assert body["Script"]["igdb_url"] is None
    assert body["Bare"]["igdb_url"] is None
    assert body["Plain Http"]["igdb_url"] is None
    assert body["Lookalike"]["igdb_url"] is None


async def test_radar_publishes_no_store_price_window_or_reason(sessionmaker_for_test):
    await _add(sessionmaker_for_test, _radar("Leaky"))
    async with client_for(sessionmaker_for_test) as client:
        response = await client.get("/api/public/radar")
    assert set(response.json()[0]) == RADAR_FIELDS
    for leaked in (
        "Limited Run Games",
        "59.99",
        "Pre-orders close",
        "limitedrungames.com",
        "preorder",
        "suggested",
        "score",
        "USD",
        "2026-11-08",
        "hypes",
        "lane",
    ):
        assert leaked not in response.text


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


async def test_radar_never_publishes_a_switch_1_sheet_date(sessionmaker_for_test):
    """Nothing from the Switch 1 sheet is public (switch1 spec, decision 6).

    A Switch 1 cartridge the sheet dates after today goes through a real
    Radar generate. Everything else about it would be published; only the
    date's source keeps it off /api/public/radar.
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
        response = await client.get("/api/public/radar")
    assert response.status_code == 200
    assert response.json() == []


FORBIDDEN = {
    "id", "score", "rank", "hypes", "lane", "store_lines", "format_note",
    "model_note", "ranked_by", "based_on", "based_on_titles", "listing_ids",
    "preorder_closes_at", "price", "store", "url", "status", "batch_id",
}  # fmt: skip
NEXT_ROW_FIELDS = {
    "title", "platform", "physical_format", "release_date", "release_precision",
    "cover_url", "igdb_url", "reasons", "top_pick", "new", "item_id",
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
        _shown(picked, SHOWN_DAY),
        _radar("Soon"),
        _radar("Out", release_date=TODAY - timedelta(days=3)),
        _radar("Digital", physical_format=None, source_metadata={"lane": "digital"}),
        _radar(
            "Pick",
            kind=RecommendationKind.DISCOVER,
            release_date=TODAY - timedelta(days=100),
        ),
    )
    body = await _next(sessionmaker_for_test)
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


async def test_generated_at_names_the_pick_day(sessionmaker_for_test):
    picked = _game("Picked")
    _with_ids(picked)
    await _add(sessionmaker_for_test, picked, _shown(picked, SHOWN_DAY))
    body = await _next(sessionmaker_for_test)
    assert body["generated_at"]["picks"] == SHOWN_DAY.date().isoformat()
    assert body["tonight"]["up_next"] is None
