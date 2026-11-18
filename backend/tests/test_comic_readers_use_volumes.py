"""The comic readers count the owned volumes' held ranges (retire
items.editions): a volume counts, a row with none counts its loose issues only.
"""

import uuid
from datetime import UTC, datetime

import pytest

from models import (
    ComicVolume,
    ComicVolumeCollect,
    Item,
    ItemStatus,
    ItemType,
    OwnedFormat,
)
from picker_routes import to_picker_item
from tests.test_comics_routes import VOLUME, FakeComicVine
from tests.test_comics_routes import client_for as comics_client_for
from tests.test_intake_commit import S, _commit, _match
from tests.test_intake_commit import _seed as _seed_sitting
from tests.test_intake_kinds import client_for as intake_client_for
from tests.test_public_comics import client_for as public_client_for

pytestmark = pytest.mark.asyncio


def _comic(**fields) -> Item:
    base = dict(
        id=uuid.uuid4(),
        type=ItemType.COMIC,
        title="Saga",
        status=ItemStatus.ACTIVE,
        is_public=True,
        owned_format=OwnedFormat.PHYSICAL,
        issues_owned="1-4",
        external_source="comicvine",
        external_id=VOLUME,
        created_at=datetime(2026, 10, 3, tzinfo=UTC),
        source_metadata={"released": 8, "ongoing": False},
    )
    return Item(**{**base, **fields})


async def _with_volume(factory, item: Item, low=5, high=6) -> None:
    """A row plus an owned book linked over `low`-`high`."""
    async with factory() as session:
        session.add(item)
        await session.flush()
        volume = ComicVolume(
            item_id=item.id,
            position=0,
            slug="vol-1",
            label="Book 1",
            kind="trade",
            owned=True,
            read=False,
        )
        session.add(volume)
        await session.flush()
        session.add(
            ComicVolumeCollect(
                volume_id=volume.id,
                position=0,
                item_id=item.id,
                series_name="Saga",
                issue_text=f"#{low}-{high}",
                from_number=low,
                to_number=high,
                source="typed",
            )
        )
        await session.commit()


async def _public_row(factory, item: Item) -> dict:
    async with public_client_for(factory) as client:
        body = (await client.get("/api/public/comics")).json()
        detail = (await client.get(f"/api/public/items/{item.id}")).json()
    [row] = body["series"]
    return {"row": row, "stats": body["stats"], "comic": detail["comic"]}


async def test_the_public_run_counts_a_volume(sessionmaker_for_test):
    item = _comic()
    await _with_volume(sessionmaker_for_test, item)
    got = await _public_row(sessionmaker_for_test, item)
    assert got["row"]["owned"] == 6
    assert got["comic"]["owned_text"] == "1–6"
    assert got["stats"]["issues_owned"] == 6


async def test_the_public_run_counts_loose_issues_with_no_volume(
    sessionmaker_for_test,
):
    item = _comic()
    async with sessionmaker_for_test() as session:
        session.add(item)
        await session.commit()
    got = await _public_row(sessionmaker_for_test, item)
    assert got["row"]["owned"] == 4
    assert got["comic"]["owned_text"] == "1–4"


async def test_picker_counts_the_held_ranges_it_is_given():
    item = _comic(read_to=2)
    held = [{"from": 5, "to": 8, "label": "Book", "slug": "vol-1"}]
    assert to_picker_item(item).issues_owned_count == 4  # the column is not read
    picked = to_picker_item(item, held=held)
    assert (picked.issues_owned_count, picked.issues_span) == (8, 8)


async def test_unfollow_a_followed_only_row(
    sessionmaker_for_test,
):
    """Followed-only means no loose issues and no book."""
    stale = _comic(
        owned_format=OwnedFormat.NONE,
        is_public=False,
        issues_owned=None,
        following=True,
    )
    async with sessionmaker_for_test() as session:
        session.add(stale)
        await session.commit()
    async with comics_client_for(sessionmaker_for_test, FakeComicVine()) as client:
        response = await client.post(
            "/api/comics/unfollow", json={"external_id": VOLUME}
        )
    assert response.json() == {"item_id": None, "following": False}


async def test_a_series_that_grew_is_measured_by_its_volumes(sessionmaker_for_test):
    """Issues 5-6 are held in a book: they are already held, and the run
    before and after counts them."""
    item = _comic(
        owned_format=OwnedFormat.NONE,
        is_public=False,
        issues_owned="1-2",
        external_id="7",
        title="Waterworld",
    )
    await _with_volume(sessionmaker_for_test, item)
    entries = [("comic", S.EXACT, {"issues_owned": "3, 6"}, _match(7, "comicvine"))]
    sitting_id = await _seed_sitting(sessionmaker_for_test, entries=entries)
    async with intake_client_for(sessionmaker_for_test) as client:
        response = await _commit(client, sitting_id)
    assert response.status_code == 200, response.text
    [grew] = response.json()["series_grew"]
    assert grew["before"]["owned"] == 4
    assert (grew["added"], grew["already"]) == ([3], [6])
    assert grew["after_owned_text"] == "1–3, 5–6"
