"""Public picks and radar (showcase spec, D). The leak tests are the point."""

import uuid
from contextlib import asynccontextmanager
from datetime import UTC, date, datetime, time, timedelta

import pytest
from fastapi import FastAPI
from httpx2 import ASGITransport, AsyncClient

from models import (
    Item,
    ItemStatus,
    ItemType,
    OwnedFormat,
    PickAction,
    PickEvent,
)
from public import create_public_router
from public_outputs import PublicPickOut

pytestmark = pytest.mark.asyncio

NOW = datetime.now(UTC)
# Noon yesterday, UTC: every pick event sits on one whole day, whatever the
# hour the suite runs, and within the seven-day window.
SHOWN_DAY = datetime.combine(NOW.date() - timedelta(days=1), time(12), tzinfo=UTC)

PICK_FIELDS = {"id", "type", "title", "cover_url", "platform", "reasons"}


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
    assert [row["title"] for row in body] == ["Delta", "Charlie", "Bravo"]
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
    # Seven days before today: the first day outside the window.
    (stale,) = _with_ids(_game("Stale"))
    await _add(sessionmaker_for_test, stale)
    await _add(sessionmaker_for_test, _shown(stale, SHOWN_DAY - timedelta(days=6)))
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
