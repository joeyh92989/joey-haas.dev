"""Committing a sitting: POST /api/intake/sittings/{id}/commit (spec D8;
AC 5, 6 and 8; Review Focus 1 and 3)."""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import func, select

import items
from intake.commit import NOTHING_TO_ADD, PHOTOS_STILL_WAITING
from models import (
    Garment,
    GarmentStatus,
    IntakeArea,
    IntakeEntry,
    IntakeEntryState,
    IntakePhoto,
    IntakePhotoState,
    IntakeSitting,
    Item,
    ItemStatus,
    ItemType,
    Playthrough,
)
from tests.test_intake_kinds import client_for
from tests.test_items_bulk import client_for as items_client_for

S = IntakeEntryState

# The columns a commit decides; ids and timestamps differ by nature.
COMPARED = (
    "type",
    "title",
    "status",
    "is_public",
    "year",
    "cover_url",
    "external_source",
    "external_id",
    "owned_format",
    "platform_id",
    "platform",
    "physical_format",
    "format_source",
    "issues_owned",
    "favorite",
    "times_completed",
    "started_at",
    "finished_at",
)


def _match(n: int, source: str = "igdb", **extra) -> dict:
    """The importer's candidate json, as the reader stores it in `chosen`."""
    return {
        "external_source": source,
        "external_id": str(n),
        "title": f"Game {n}",
        "year": 2020,
        "thumbnail_url": f"https://images.example/{n}.jpg",
        **extra,
    }


async def _seed(
    factory, area=IntakeArea.SHELF, entries=(), empty_photos=0
) -> uuid.UUID:
    """A sitting holding `entries` ((kind, state, payload, chosen) tuples)."""
    async with factory() as session:
        sitting = IntakeSitting(area=area)
        session.add(sitting)
        await session.flush()
        for _ in range(empty_photos):
            session.add(
                IntakePhoto(
                    sitting_id=sitting.id,
                    state=IntakePhotoState.EMPTY,
                    thumb_webp=b"webp",
                    width=10,
                    height=10,
                )
            )
        for kind, state, payload, chosen in entries:
            session.add(
                IntakeEntry(
                    sitting_id=sitting.id,
                    kind=kind,
                    state=state,
                    payload=payload,
                    chosen=chosen,
                )
            )
        await session.commit()
        return sitting.id


async def _commit(client, sitting_id, **body):
    return await client.post(f"/api/intake/sittings/{sitting_id}/commit", json=body)


async def _count(factory, model) -> int:
    async with factory() as session:
        return await session.scalar(select(func.count()).select_from(model))


async def _items(factory) -> list[Item]:
    async with factory() as session:
        return list(
            (await session.scalars(select(Item).order_by(Item.external_id))).all()
        )


@pytest.mark.asyncio
async def test_forty_exact_entries_commit_in_one_request(sessionmaker_for_test):
    entries = [("game", S.EXACT, {}, _match(n)) for n in range(40)]
    sitting_id = await _seed(sessionmaker_for_test, entries=entries)
    async with client_for(sessionmaker_for_test) as client:
        response = await _commit(client, sitting_id)
    assert response.status_code == 200, response.text
    body = response.json()
    # Done's "Publish these N" publishes exactly what was created.
    created = body.pop("created")
    assert body == {
        "added": 40,
        "already_owned": 0,
        "issues_added": 0,
        "series_grew": [],
        "skipped_kept": 0,
        "photos_empty": 0,
        "photos_waiting": 0,
        "refused": [],
    }
    rows = await _items(sessionmaker_for_test)
    assert len(rows) == 40
    assert sorted(created) == sorted(str(row.id) for row in rows)
    assert all(not row.is_public for row in rows)  # new items are private
    assert all(row.status == ItemStatus.BACKLOG for row in rows)
    # Nothing left to come back to: the sitting goes with its entries.
    assert await _count(sessionmaker_for_test, IntakeSitting) == 0
    assert await _count(sessionmaker_for_test, IntakeEntry) == 0


@pytest.mark.asyncio
async def test_rows_equal_what_bulk_writes_for_the_same_input(sessionmaker_for_test):
    entries = [
        ("game", S.EXACT, {"platform_id": 508, "status": "finished"}, _match(1)),
        ("game", S.READY, {"physical_format": "game_card"}, _match(2)),
        ("comic", S.TYPED, {"title": "Saga", "issues_owned": "3, 1-2, 5"}, None),
    ]
    sitting_id = await _seed(sessionmaker_for_test, entries=entries)
    async with client_for(sessionmaker_for_test) as client:
        response = await _commit(client, sitting_id, today="2026-11-10")
    assert response.status_code == 200, response.text
    by_intake = await _items(sessionmaker_for_test)
    intake_runs = await _count(sessionmaker_for_test, Playthrough)

    async with sessionmaker_for_test() as session:
        await session.execute(Playthrough.__table__.delete())
        await session.execute(Item.__table__.delete())
        await session.commit()

    def base(n):
        return {
            "type": "game",
            "title": f"Game {n}",
            "status": "backlog",
            "owned_format": "physical",
            "year": 2020,
            "external_source": "igdb",
            "external_id": str(n),
            "cover_url": f"https://images.example/{n}.jpg",
        }

    bulk = [
        {**base(1), "platform_id": 508, "status": "finished"},
        {**base(2), "physical_format": "game_card"},
        {
            "type": "comic",
            "title": "Saga",
            "status": "backlog",
            "owned_format": "physical",
            "issues_owned": "3, 1-2, 5",
        },
    ]
    async with items_client_for(sessionmaker_for_test) as client:
        made = await client.post("/api/items/bulk", json={"items": bulk})
    assert made.status_code == 201, made.text
    by_bulk = await _items(sessionmaker_for_test)

    def shape(rows):
        return sorted(
            (tuple(str(getattr(row, column)) for column in COMPARED) for row in rows)
        )

    assert shape(by_intake) == shape(by_bulk)
    assert intake_runs == await _count(sessionmaker_for_test, Playthrough) == 1
    comic = next(row for row in by_intake if row.type == ItemType.COMIC)
    assert comic.issues_owned == "1–3, 5"  # canonicalised by comics.py


@pytest.mark.asyncio
async def test_a_chosen_thumbnail_becomes_the_cover(sessionmaker_for_test):
    sitting_id = await _seed(
        sessionmaker_for_test, entries=[("game", S.EXACT, {}, _match(7))]
    )
    async with client_for(sessionmaker_for_test) as client:
        assert (await _commit(client, sitting_id)).status_code == 200
    [row] = await _items(sessionmaker_for_test)
    assert row.cover_url == "https://images.example/7.jpg"
    assert row.title == "Game 7"
    assert row.year == 2020


@pytest.mark.asyncio
async def test_the_figures_equal_what_was_written(sessionmaker_for_test):
    async with sessionmaker_for_test() as session:
        session.add(
            Item(
                type=ItemType.GAME,
                title="Game 9",
                status=ItemStatus.BACKLOG,
                external_source="igdb",
                external_id="9",
            )
        )
        await session.commit()
    entries = [
        ("game", S.EXACT, {}, _match(1)),
        # The same title on a second photo: counted once.
        ("game", S.EXACT, {}, _match(1)),
        ("game", S.PROBABLE, {}, _match(2)),
        # Marked owned by the reader, twice: one title on the shelf.
        ("game", S.OWNED, {}, _match(3)),
        ("game", S.OWNED, {}, _match(3)),
        # Already an item, though the reader did not know it.
        ("game", S.EXACT, {}, _match(9)),
        ("game", S.IGNORED, {}, _match(4)),
        ("game", S.CHECK, {}, _match(5)),
        ("game", S.READING, {"reason": "IGDB is busy, will retry"}, None),
    ]
    sitting_id = await _seed(sessionmaker_for_test, entries=entries, empty_photos=2)
    async with client_for(sessionmaker_for_test) as client:
        response = await _commit(client, sitting_id)
    assert response.status_code == 200, response.text
    body = response.json()
    assert len(body.pop("created")) == 2
    assert body == {
        "added": 2,
        "already_owned": 2,
        "issues_added": 0,
        "series_grew": [],
        "skipped_kept": 2,
        "photos_empty": 2,
        "photos_waiting": 0,
        "refused": [],
    }
    assert await _count(sessionmaker_for_test, Item) == 1 + body["added"]
    # What was skipped is kept to come back to; the rest is cleared.
    async with sessionmaker_for_test() as session:
        assert await session.get(IntakeSitting, sitting_id) is not None
        left = (await session.scalars(select(IntakeEntry.state))).all()
    assert sorted(state.value for state in left) == ["check", "reading"]


def _series(n: int = 7) -> dict:
    """A Comic Vine volume, as the reader stores it in `chosen`."""
    return _match(n, "comicvine", title="Waterworld")


async def _seed_series(factory, n: int = 7, **fields) -> None:
    async with factory() as session:
        session.add(
            Item(
                type=ItemType.COMIC,
                title="Waterworld",
                status=ItemStatus.BACKLOG,
                external_source="comicvine",
                external_id=str(n),
                **fields,
            )
        )
        await session.commit()


@pytest.mark.asyncio
async def test_issues_of_one_series_in_a_sitting_become_one_row(sessionmaker_for_test):
    entries = [
        (
            "comic",
            S.EXACT,
            {"issues_owned": str(n), "shelf_format": "singles"},
            _series(),
        )
        for n in (1, 2, 3, 4)
    ]
    sitting_id = await _seed(sessionmaker_for_test, entries=entries)
    async with client_for(sessionmaker_for_test) as client:
        response = await _commit(client, sitting_id)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["added"] == 1
    assert body["issues_added"] == 0
    assert body["already_owned"] == 0
    [row] = await _items(sessionmaker_for_test)
    assert row.issues_owned == "1–4"


@pytest.mark.asyncio
async def test_a_series_on_the_shelf_gains_the_sittings_issues(sessionmaker_for_test):
    await _seed_series(sessionmaker_for_test, issues_owned="1–2", issues_skipped="3, 9")
    entries = [
        # One the reader knew was on the shelf, one it did not.
        ("comic", S.OWNED, {"issues_owned": "3"}, _series()),
        ("comic", S.EXACT, {"issues_owned": "4"}, _series()),
    ]
    sitting_id = await _seed(sessionmaker_for_test, entries=entries)
    async with client_for(sessionmaker_for_test) as client:
        response = await _commit(client, sitting_id)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["added"] == 0
    assert body["issues_added"] == 2
    assert body["already_owned"] == 0
    [row] = await _items(sessionmaker_for_test)
    assert row.issues_owned == "1–4"
    # Got it's rule: an issue now owned is no longer skipped.
    assert row.issues_skipped == "9"


@pytest.mark.asyncio
async def test_a_series_that_gains_nothing_is_already_owned(sessionmaker_for_test):
    await _seed_series(sessionmaker_for_test, issues_owned="1–4")
    entries = [("comic", S.EXACT, {"issues_owned": "2"}, _series())]
    sitting_id = await _seed(sessionmaker_for_test, entries=entries)
    async with client_for(sessionmaker_for_test) as client:
        response = await _commit(client, sitting_id)
    assert response.status_code == 200, response.text
    body = response.json()
    assert (body["added"], body["issues_added"], body["already_owned"]) == (0, 0, 1)
    [row] = await _items(sessionmaker_for_test)
    assert row.issues_owned == "1–4"


@pytest.mark.asyncio
async def test_each_series_on_the_shelf_is_reported_with_what_it_gained(
    sessionmaker_for_test,
):
    await _seed_series(
        sessionmaker_for_test,
        issues_owned="1–2",
        editions=[{"kind": "Trade", "label": "Vol. 2", "from": 5, "to": 6}],
        source_metadata={"released": 8, "ongoing": True},
    )
    entries = [
        ("comic", S.OWNED, {"issues_owned": "3"}, _series()),
        ("comic", S.EXACT, {"issues_owned": "4, 2, 6"}, _series()),
        # A new series is added, not reported as grown.
        ("comic", S.EXACT, {"issues_owned": "1"}, _match(8, "comicvine")),
    ]
    sitting_id = await _seed(sessionmaker_for_test, entries=entries)
    async with client_for(sessionmaker_for_test) as client:
        response = await _commit(client, sitting_id)
    assert response.status_code == 200, response.text
    body = response.json()
    # The old figure counts loose issues written (6 joins the singles); the
    # report counts against what was held, so 6 is already owned there.
    assert body["issues_added"] == 3
    [grew] = body["series_grew"]
    items = {item.external_id: item for item in await _items(sessionmaker_for_test)}
    assert grew == {
        "item_id": str(items["7"].id),
        "title": "Waterworld",
        "cover_url": None,
        "before": {"owned": 4, "released": 8},
        "ongoing": True,
        "added": [3, 4],
        # Held already: one loose, one inside the edition.
        "already": [2, 6],
        "after_owned_text": "1–6",
    }


@pytest.mark.asyncio
async def test_a_series_gaining_nothing_is_still_reported(sessionmaker_for_test):
    await _seed_series(sessionmaker_for_test, issues_owned="1–4")
    entries = [("comic", S.OWNED, {"issues_owned": "2"}, _series())]
    sitting_id = await _seed(sessionmaker_for_test, entries=entries)
    async with client_for(sessionmaker_for_test) as client:
        response = await _commit(client, sitting_id)
    assert response.status_code == 200, response.text
    [grew] = response.json()["series_grew"]
    assert (grew["added"], grew["already"]) == ([], [2])
    assert grew["after_owned_text"] == "1–4"


@pytest.mark.asyncio
async def test_a_refused_commit_reports_no_series(sessionmaker_for_test):
    await _seed_series(sessionmaker_for_test, issues_owned="1–2")
    entries = [
        ("comic", S.OWNED, {"issues_owned": "3"}, _series()),
        ("comic", S.EXACT, {"issues_owned": "x-y"}, _match(9, "comicvine")),
    ]
    sitting_id = await _seed(sessionmaker_for_test, entries=entries)
    async with client_for(sessionmaker_for_test) as client:
        response = await _commit(client, sitting_id)
    assert response.status_code == 422, response.text
    assert response.json()["series_grew"] == []
    [row] = await _items(sessionmaker_for_test)
    assert row.issues_owned == "1–2"


@pytest.mark.asyncio
async def test_two_games_with_one_key_still_write_one_row(sessionmaker_for_test):
    entries = [
        ("game", S.EXACT, {"title": "First photo"}, _match(1)),
        ("game", S.EXACT, {"title": "Second photo"}, _match(1)),
    ]
    sitting_id = await _seed(sessionmaker_for_test, entries=entries)
    async with client_for(sessionmaker_for_test) as client:
        response = await _commit(client, sitting_id)
    assert response.status_code == 200, response.text
    body = response.json()
    assert (body["added"], body["already_owned"], body["issues_added"]) == (1, 0, 0)
    [row] = await _items(sessionmaker_for_test)
    # Entries seeded together tie on created_at; either photo's fields win.
    assert row.title in {"First photo", "Second photo"}


@pytest.mark.asyncio
async def test_a_bad_issue_range_maps_to_its_entry_and_nothing_is_written(
    sessionmaker_for_test,
):
    entries = [
        ("game", S.EXACT, {}, _match(1)),
        ("comic", S.TYPED, {"title": "Saga", "issues_owned": "one to five"}, None),
    ]
    sitting_id = await _seed(sessionmaker_for_test, entries=entries)
    async with sessionmaker_for_test() as session:
        comic_id = await session.scalar(
            select(IntakeEntry.id).where(IntakeEntry.kind == "comic")
        )
    async with client_for(sessionmaker_for_test) as client:
        response = await _commit(client, sitting_id)
    assert response.status_code == 422, response.text
    body = response.json()
    assert body["added"] == 0
    [refused] = body["refused"]
    assert refused["entry_id"] == str(comic_id)
    assert refused["field"] == "issues_owned"
    assert refused["message"].startswith("Issues owned")
    assert await _count(sessionmaker_for_test, Item) == 0
    assert await _count(sessionmaker_for_test, IntakeEntry) == 2


@pytest.mark.asyncio
async def test_a_missing_title_is_refused_with_its_field(sessionmaker_for_test):
    sitting_id = await _seed(
        sessionmaker_for_test, entries=[("movie", S.TYPED, {"year": 1999}, None)]
    )
    async with client_for(sessionmaker_for_test) as client:
        response = await _commit(client, sitting_id)
    assert response.status_code == 422, response.text
    [refused] = response.json()["refused"]
    assert refused["field"] == "title"


@pytest.mark.asyncio
async def test_a_second_device_commit_gets_intakes_409_and_writes_nothing(
    sessionmaker_for_test,
):
    sitting_id = await _seed(
        sessionmaker_for_test, entries=[("game", S.EXACT, {}, _match(1))]
    )
    async with client_for(sessionmaker_for_test) as phone:
        assert (await _commit(phone, sitting_id)).status_code == 200
    async with client_for(sessionmaker_for_test) as laptop:
        again = await _commit(laptop, sitting_id)
    assert again.status_code == 409
    assert "already" in again.json()["detail"]
    assert "catalogue" not in again.json()["detail"]
    assert await _count(sessionmaker_for_test, Item) == 1


@pytest.mark.asyncio
async def test_a_commit_that_would_change_nothing_is_409(sessionmaker_for_test):
    sitting_id = await _seed(
        sessionmaker_for_test, entries=[("game", S.CHECK, {}, _match(1))]
    )
    async with client_for(sessionmaker_for_test) as client:
        response = await _commit(client, sitting_id)
    assert response.status_code == 409
    assert response.json()["detail"] == NOTHING_TO_ADD
    assert await _count(sessionmaker_for_test, IntakeEntry) == 1


async def _add_photos(factory, sitting_id, states) -> None:
    async with factory() as session:
        for state in states:
            session.add(
                IntakePhoto(
                    sitting_id=sitting_id,
                    state=state,
                    reading_jpeg=None if state is IntakePhotoState.READ else b"jpeg",
                    thumb_webp=b"webp",
                    width=10,
                    height=10,
                )
            )
        await session.commit()


@pytest.mark.asyncio
async def test_a_commit_mid_read_keeps_the_unread_photos(sessionmaker_for_test):
    # 30 photos: 10 read into entries, the rest still uploaded, reading or failed.
    entries = [("game", S.EXACT, {}, _match(n)) for n in range(10)]
    sitting_id = await _seed(sessionmaker_for_test, entries=entries)
    P = IntakePhotoState
    waiting = [P.UPLOADED] * 14 + [P.READING] * 3 + [P.FAILED] * 3
    await _add_photos(sessionmaker_for_test, sitting_id, [P.READ] * 10 + waiting)
    async with client_for(sessionmaker_for_test) as client:
        response = await _commit(client, sitting_id)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["added"] == 10
    assert body["photos_waiting"] == 20
    async with sessionmaker_for_test() as session:
        assert await session.get(IntakeSitting, sitting_id) is not None
        states = (
            await session.scalars(
                select(IntakePhoto.state).where(IntakePhoto.sitting_id == sitting_id)
            )
        ).all()
    assert sorted(state.value for state in states if state is not P.READ) == sorted(
        state.value for state in waiting
    )


@pytest.mark.asyncio
async def test_a_sitting_with_only_unread_photos_is_409_and_keeps_them(
    sessionmaker_for_test,
):
    sitting_id = await _seed(sessionmaker_for_test)
    await _add_photos(
        sessionmaker_for_test, sitting_id, [IntakePhotoState.UPLOADED] * 3
    )
    async with client_for(sessionmaker_for_test) as client:
        response = await _commit(client, sitting_id)
    assert response.status_code == 409
    assert response.json()["detail"] == PHOTOS_STILL_WAITING
    assert "catalogue" not in response.json()["detail"]
    assert await _count(sessionmaker_for_test, IntakeSitting) == 1
    assert await _count(sessionmaker_for_test, IntakePhoto) == 3


@pytest.mark.asyncio
async def test_rows_go_in_chunks(sessionmaker_for_test, monkeypatch):
    monkeypatch.setattr(items, "BULK_CHUNK", 2)
    entries = [("game", S.EXACT, {}, _match(n)) for n in range(5)]
    sitting_id = await _seed(sessionmaker_for_test, entries=entries)
    async with client_for(sessionmaker_for_test) as client:
        response = await _commit(client, sitting_id)
    assert response.json()["added"] == 5
    assert await _count(sessionmaker_for_test, Item) == 5


@pytest.mark.asyncio
async def test_a_closet_sitting_keeps_its_garments_and_adds_typed_ones(
    sessionmaker_for_test,
):
    async with sessionmaker_for_test() as session:
        garment = Garment(status=GarmentStatus.UNTAGGED, seasons=[], tag_attempts=0)
        session.add(garment)
        await session.flush()
        sitting = IntakeSitting(area=IntakeArea.CLOSET)
        session.add(sitting)
        await session.flush()
        session.add_all(
            [
                IntakeEntry(
                    sitting_id=sitting.id,
                    kind="garment",
                    state=S.READY,
                    garment_id=garment.id,
                ),
                IntakeEntry(
                    sitting_id=sitting.id,
                    kind="garment",
                    state=S.TYPED,
                    payload={"name": "Grey wool coat", "category": "outer"},
                ),
            ]
        )
        await session.commit()
        sitting_id = sitting.id
    async with client_for(sessionmaker_for_test) as client:
        response = await _commit(client, sitting_id)
    assert response.status_code == 200, response.text
    assert response.json()["added"] == 2
    async with sessionmaker_for_test() as session:
        names = sorted(
            str(name) for name in (await session.scalars(select(Garment.name))).all()
        )
    assert names == ["Grey wool coat", "None"]  # the photo's garment untouched
    assert await _count(sessionmaker_for_test, IntakeSitting) == 0
