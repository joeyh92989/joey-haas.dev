"""The sittings API under /api/intake (spec D2, D11; AC 3 and 4)."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

import pytest
from sqlalchemy import func, select, update

from intake.commit import SITTING_GONE
from models import (
    Garment,
    GarmentImage,
    GarmentStatus,
    IntakeEntry,
    IntakeEntryState,
    IntakePhoto,
    IntakePhotoState,
    IntakeSitting,
    Item,
    ItemStatus,
    ItemType,
)
from tests.test_closet_routes import jpeg
from tests.test_intake_kinds import client_for


def _photo(name: str = "shelf-1.jpg", data: bytes | None = None, media="image/jpeg"):
    return {"photo": (name, data or jpeg(), media)}


async def _sitting(client, area="shelf", **body) -> dict:
    response = await client.post("/api/intake/sittings", json={"area": area, **body})
    assert response.status_code == 201, response.text
    return response.json()


async def _count(factory, model) -> int:
    async with factory() as session:
        return await session.scalar(select(func.count()).select_from(model))


@pytest.mark.asyncio
async def test_a_sitting_reads_back_identically_from_a_second_client(
    sessionmaker_for_test,
):
    async with client_for(sessionmaker_for_test) as phone:
        created = await _sitting(phone, kind="game", label="Living room")
        uploaded = await phone.post(
            f"/api/intake/sittings/{created['id']}/photos", files=_photo()
        )
        assert uploaded.status_code == 201, uploaded.text
        typed = await phone.post(
            f"/api/intake/sittings/{created['id']}/entries",
            json={"kind": "game", "payload": {"title": "Hades"}},
        )
        assert typed.status_code == 201, typed.text
        on_phone = (await phone.get(f"/api/intake/sittings/{created['id']}")).json()
    async with client_for(sessionmaker_for_test) as laptop:
        on_laptop = (await laptop.get(f"/api/intake/sittings/{created['id']}")).json()
        listed = (await laptop.get("/api/intake/sittings?area=shelf")).json()
    assert on_laptop == on_phone
    assert on_laptop["label"] == "Living room"
    assert [entry["payload"] for entry in on_laptop["entries"]] == [{"title": "Hades"}]
    assert [row["id"] for row in listed] == [created["id"]]
    assert listed[0]["photos"] == 1


@pytest.mark.asyncio
async def test_uploaded_photos_keep_their_state_across_reloads(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        sitting = await _sitting(client)
        photo = (
            await client.post(
                f"/api/intake/sittings/{sitting['id']}/photos", files=_photo()
            )
        ).json()
    assert photo["state"] == "uploaded"
    assert photo["filename"] == "shelf-1.jpg"
    async with sessionmaker_for_test() as session:
        row = await session.get(IntakePhoto, uuid.UUID(photo["id"]))
        assert row.reading_jpeg  # kept until it is read
        row.state = IntakePhotoState.FAILED
        row.error = "The model did not answer"
        await session.commit()
    async with client_for(sessionmaker_for_test) as client:
        again = (await client.get(f"/api/intake/sittings/{sitting['id']}")).json()
        assert [(p["state"], p["error"]) for p in again["photos"]] == [
            ("failed", "The model did not answer")
        ]
        retried = await client.post(f"/api/intake/photos/{photo['id']}/retry")
        assert retried.status_code == 200
        assert (retried.json()["state"], retried.json()["error"]) == ("uploaded", None)
        image = await client.get(f"/api/intake/photos/{photo['id']}/image")
    assert image.status_code == 200
    assert image.headers["content-type"] == "image/webp"


@pytest.mark.asyncio
async def test_retry_refuses_a_photo_that_has_not_failed(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        sitting = await _sitting(client)
        photo = (
            await client.post(
                f"/api/intake/sittings/{sitting['id']}/photos", files=_photo()
            )
        ).json()
        response = await client.post(f"/api/intake/photos/{photo['id']}/retry")
    assert response.status_code == 409


@pytest.mark.asyncio
async def test_discard_removes_photos_and_entries(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        sitting = await _sitting(client)
        await client.post(
            f"/api/intake/sittings/{sitting['id']}/photos", files=_photo()
        )
        await client.post(
            f"/api/intake/sittings/{sitting['id']}/entries",
            json={"kind": "movie", "payload": {"title": "Heat"}},
        )
        deleted = await client.delete(f"/api/intake/sittings/{sitting['id']}")
        missing = await client.get(f"/api/intake/sittings/{sitting['id']}")
    assert deleted.status_code == 204
    assert missing.status_code == 404
    assert await _count(sessionmaker_for_test, IntakePhoto) == 0
    assert await _count(sessionmaker_for_test, IntakeEntry) == 0


@pytest.mark.asyncio
async def test_the_201st_photo_is_refused_in_intakes_own_words(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        sitting = await _sitting(client)
    async with sessionmaker_for_test() as session:
        session.add_all(
            IntakePhoto(
                sitting_id=uuid.UUID(sitting["id"]),
                thumb_webp=b"x",
                width=1,
                height=1,
            )
            for _ in range(200)
        )
        await session.commit()
    async with client_for(sessionmaker_for_test) as client:
        response = await client.post(
            f"/api/intake/sittings/{sitting['id']}/photos", files=_photo()
        )
    assert response.status_code == 409
    assert "200 photos" in response.json()["detail"]
    assert "catalogue" not in response.json()["detail"]


@pytest.mark.asyncio
async def test_a_refused_file_is_named(sessionmaker_for_test, monkeypatch):
    async with client_for(sessionmaker_for_test) as client:
        sitting = await _sitting(client)
        url = f"/api/intake/sittings/{sitting['id']}/photos"
        wrong_type = await client.post(
            url, files=_photo("notes.pdf", b"%PDF", "application/pdf")
        )
        monkeypatch.setattr("closet_images.MAX_PHOTO_BYTES", 10)
        too_big = await client.post(url, files=_photo("huge.jpg"))
    assert wrong_type.status_code == 415
    assert "notes.pdf" in wrong_type.json()["detail"]
    assert too_big.status_code == 413
    assert "huge.jpg" in too_big.json()["detail"]
    assert await _count(sessionmaker_for_test, IntakePhoto) == 0


@pytest.mark.asyncio
async def test_a_closet_photo_makes_an_untagged_garment_and_an_entry(
    sessionmaker_for_test,
):
    async with client_for(sessionmaker_for_test) as client:
        sitting = await _sitting(client, area="closet")
        await client.post(
            f"/api/intake/sittings/{sitting['id']}/photos", files=_photo("shirt.jpg")
        )
        body = (await client.get(f"/api/intake/sittings/{sitting['id']}")).json()
        await client.delete(f"/api/intake/sittings/{sitting['id']}")
    (entry,) = body["entries"]
    assert entry["kind"] == "garment"
    async with sessionmaker_for_test() as session:
        garment = await session.get(Garment, uuid.UUID(entry["garment_id"]))
        assert garment.status is GarmentStatus.UNTAGGED
        assert await session.get(GarmentImage, garment.id) is not None
    # Discarding the sitting leaves the garment in the tag queue (spec, D3).
    assert await _count(sessionmaker_for_test, Garment) == 1


@pytest.mark.asyncio
async def test_a_kind_must_belong_to_the_area(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        wrong = await client.post(
            "/api/intake/sittings", json={"area": "closet", "kind": "game"}
        )
        unknown = await client.post(
            "/api/intake/sittings", json={"area": "shelf", "kind": "vinyl"}
        )
        mixed = await client.post("/api/intake/sittings", json={"area": "shelf"})
    assert wrong.status_code == 422
    assert unknown.status_code == 422
    assert mixed.status_code == 201
    assert mixed.json()["kind"] is None


@pytest.mark.asyncio
async def test_patch_sitting_and_entry_last_write_wins(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        sitting = await _sitting(client)
        moved = await client.patch(
            f"/api/intake/sittings/{sitting['id']}",
            json={"step": "check", "label": "Hall"},
        )
        entry = (
            await client.post(
                f"/api/intake/sittings/{sitting['id']}/entries",
                json={"kind": "game", "payload": {"title": "Celeste"}},
            )
        ).json()
        first = await client.patch(
            f"/api/intake/entries/{entry['id']}",
            json={"payload": {"title": "Celeste", "platform": "Switch"}},
        )
        second = await client.patch(
            f"/api/intake/entries/{entry['id']}", json={"state": "ignored"}
        )
    assert (moved.json()["step"], moved.json()["label"]) == ("check", "Hall")
    assert first.json()["payload"]["platform"] == "Switch"
    assert second.json()["state"] == "ignored"
    assert second.json()["payload"]["platform"] == "Switch"


@pytest.mark.asyncio
async def test_counts_include_probable_entries(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        shelf = await _sitting(client)
    async with sessionmaker_for_test() as session:
        for state in (IntakeEntryState.CHECK, IntakeEntryState.PROBABLE):
            session.add(
                IntakeEntry(sitting_id=uuid.UUID(shelf["id"]), kind="game", state=state)
            )
        await session.commit()
    async with client_for(sessionmaker_for_test) as client:
        counts = (await client.get("/api/intake/counts")).json()
    assert counts == {"shelf": 2, "closet": 0}


@pytest.mark.asyncio
async def test_counts_are_entries_left_to_check_per_area(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        shelf = await _sitting(client)
        await _sitting(client, area="closet")
    async with sessionmaker_for_test() as session:
        for state in (
            IntakeEntryState.CHECK,
            IntakeEntryState.CHECK,
            IntakeEntryState.EXACT,
        ):
            session.add(
                IntakeEntry(sitting_id=uuid.UUID(shelf["id"]), kind="game", state=state)
            )
        await session.commit()
    async with client_for(sessionmaker_for_test) as client:
        counts = (await client.get("/api/intake/counts")).json()
        budget = (await client.get("/api/intake/budget")).json()
    assert counts == {"shelf": 2, "closet": 0}
    assert budget["enforced"] is True
    assert budget["remaining"] > 0


@pytest.mark.asyncio
async def test_signed_out_is_refused(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test, signed_in=False) as client:
        response = await client.get("/api/intake/sittings?area=shelf")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_an_unknown_sitting_is_404(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        response = await client.get(f"/api/intake/sittings/{uuid.uuid4()}")
    assert response.status_code == 404
    assert await _count(sessionmaker_for_test, IntakeSitting) == 0


@pytest.mark.asyncio
async def test_the_list_counts_each_sittings_entries_and_waiting_photos(
    sessionmaker_for_test,
):
    # The Add page's Unfinished meter (ready, to check, still reading) is
    # drawn from the list alone, without opening every sitting.
    async with client_for(sessionmaker_for_test) as client:
        sitting = await _sitting(client, kind="comic")
        await client.post(
            f"/api/intake/sittings/{sitting['id']}/photos", files=_photo()
        )
    async with sessionmaker_for_test() as session:
        sitting_id = uuid.UUID(sitting["id"])
        for state in (
            IntakeEntryState.EXACT,
            IntakeEntryState.EXACT,
            IntakeEntryState.CHECK,
            IntakeEntryState.READING,
        ):
            session.add(IntakeEntry(sitting_id=sitting_id, kind="comic", state=state))
        session.add(
            IntakePhoto(
                sitting_id=sitting_id,
                state=IntakePhotoState.READ,
                thumb_webp=b"webp",
                width=10,
                height=10,
            )
        )
        await session.commit()
    async with client_for(sessionmaker_for_test) as client:
        (row,) = (await client.get("/api/intake/sittings?area=shelf")).json()
    assert row["photos"] == 2
    assert row["photos_waiting"] == 1
    assert row["entries"] == {
        "reading": 1,
        "exact": 2,
        "probable": 0,
        "check": 1,
        "owned": 0,
        "ready": 0,
        "ignored": 0,
        "typed": 0,
    }


@pytest.mark.asyncio
async def test_the_list_says_when_each_sitting_was_started(sessionmaker_for_test):
    # Two sittings can share a label; the list's created_at tells them apart.
    async with client_for(sessionmaker_for_test) as client:
        await _sitting(client, kind="comic")
        (row,) = (await client.get("/api/intake/sittings?area=shelf")).json()
    assert row["created_at"]


# Shoot's "Search instead" (spec, Sitting · 1 Shoot): a search result chosen
# from the add bar's search joins the sitting as an entry.
DUNE = {
    "kind": "movie",
    "external_source": "tmdb",
    "external_id": "438631",
    "title": "Dune",
    "year": 2021,
    "thumbnail_url": "https://image.tmdb.org/t/p/w185/dune.jpg",
}


@pytest.mark.asyncio
async def test_a_chosen_search_result_joins_the_sitting_ready(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        sitting = await _sitting(client)
        added = await client.post(
            f"/api/intake/sittings/{sitting['id']}/entries",
            json={"kind": "movie", "chosen": DUNE},
        )
        assert added.status_code == 201, added.text
        entry = added.json()
        read_back = (await client.get(f"/api/intake/sittings/{sitting['id']}")).json()
    assert entry["state"] == "ready"
    assert entry["chosen"] == DUNE
    assert entry["kind"] == "movie"
    assert read_back["entries"] == [entry]


@pytest.mark.asyncio
async def test_a_chosen_result_already_on_the_shelf_is_owned(sessionmaker_for_test):
    async with sessionmaker_for_test() as session:
        session.add(
            Item(
                type=ItemType.MOVIE,
                title="Dune",
                status=ItemStatus.BACKLOG,
                external_source="tmdb",
                external_id="438631",
            )
        )
        await session.commit()
    async with client_for(sessionmaker_for_test) as client:
        sitting = await _sitting(client)
        added = await client.post(
            f"/api/intake/sittings/{sitting['id']}/entries",
            json={"kind": "movie", "chosen": DUNE},
        )
    assert added.status_code == 201, added.text
    assert added.json()["state"] == "owned"


SAGA = {"external_source": "comicvine", "external_id": "cv-1", "title": "Saga"}


@pytest.mark.asyncio
async def test_a_comic_entry_carries_the_series_already_on_the_shelf(
    sessionmaker_for_test,
):
    """Check draws what an entry adds before the commit, so each comic
    entry matching a series on the shelf carries that series' run now."""
    async with sessionmaker_for_test() as session:
        saga = Item(
            type=ItemType.COMIC,
            title="Saga",
            status=ItemStatus.BACKLOG,
            external_source="comicvine",
            external_id="cv-1",
            issues_owned="1–57",
            source_metadata={"released": 72, "ongoing": True},
        )
        session.add(saga)
        await session.commit()
        saga_id = str(saga.id)
    async with client_for(sessionmaker_for_test) as client:
        sitting = await _sitting(client)
        path = f"/api/intake/sittings/{sitting['id']}"
        added = await client.post(
            f"{path}/entries",
            json={"kind": "comic", "chosen": SAGA, "payload": {"issues_owned": "58"}},
        )
        other = await client.post(
            f"{path}/entries",
            json={"kind": "movie", "chosen": DUNE},
        )
        patched = await client.patch(
            f"/api/intake/entries/{added.json()['id']}",
            json={"payload": {"issues_owned": "58-59"}},
        )
        read_back = await client.get(path)
    assert added.status_code == 201, added.text
    on_shelf = {
        "item_id": saga_id,
        "title": "Saga",
        "cover_url": None,
        "owned": 57,
        "owned_text": "1–57",
        "released": 72,
        "ongoing": True,
        "issue_max": None,
    }
    assert added.json()["on_shelf"] == on_shelf
    assert other.json()["on_shelf"] is None
    assert patched.json()["on_shelf"] == on_shelf
    entries = {entry["kind"]: entry for entry in read_back.json()["entries"]}
    assert entries["comic"]["on_shelf"] == on_shelf
    assert entries["movie"]["on_shelf"] is None


@pytest.mark.asyncio
async def test_a_chosen_entry_commits_as_its_match(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        sitting = await _sitting(client)
        await client.post(
            f"/api/intake/sittings/{sitting['id']}/entries",
            json={"kind": "movie", "chosen": DUNE},
        )
        committed = await client.post(f"/api/intake/sittings/{sitting['id']}/commit")
    assert committed.status_code == 200, committed.text
    assert committed.json()["added"] == 1
    async with sessionmaker_for_test() as session:
        item = await session.scalar(select(Item))
    assert (item.title, item.external_source, item.external_id) == (
        "Dune",
        "tmdb",
        "438631",
    )
    assert item.is_public is False


@pytest.mark.asyncio
async def test_a_typed_entry_is_still_typed(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        sitting = await _sitting(client)
        added = await client.post(
            f"/api/intake/sittings/{sitting['id']}/entries",
            json={"kind": "movie", "payload": {"title": "Home video"}},
        )
    assert added.json()["state"] == "typed"
    assert added.json()["chosen"] is None


@pytest.mark.asyncio
async def test_a_chosen_result_without_its_source_key_is_refused(
    sessionmaker_for_test,
):
    async with client_for(sessionmaker_for_test) as client:
        sitting = await _sitting(client)
        refused = await client.post(
            f"/api/intake/sittings/{sitting['id']}/entries",
            json={"kind": "movie", "chosen": {"title": "Dune"}},
        )
    assert refused.status_code == 422
    assert "external_id" in refused.json()["detail"]
    assert await _count(sessionmaker_for_test, IntakeEntry) == 0


async def _seed_photo_entries(factory, sitting_id: str):
    """One photo with two entries read from it, and one typed entry."""
    async with factory() as session:
        photo = IntakePhoto(
            sitting_id=uuid.UUID(sitting_id),
            state=IntakePhotoState.READ,
            thumb_webp=b"x",
            width=1,
            height=1,
        )
        session.add(photo)
        await session.flush()
        for title, state in (("Heat", "exact"), ("Ronin", "check")):
            session.add(
                IntakeEntry(
                    sitting_id=uuid.UUID(sitting_id),
                    photo_id=photo.id,
                    kind="movie",
                    state=IntakeEntryState(state),
                    payload={"title": title},
                )
            )
        session.add(
            IntakeEntry(
                sitting_id=uuid.UUID(sitting_id),
                kind="movie",
                state=IntakeEntryState.TYPED,
                payload={"title": "Typed"},
            )
        )
        await session.commit()
        return str(photo.id)


@pytest.mark.asyncio
async def test_deleting_a_photo_drops_it_and_the_entries_read_from_it(
    sessionmaker_for_test,
):
    async with client_for(sessionmaker_for_test) as client:
        sitting = await _sitting(client)
        photo_id = await _seed_photo_entries(sessionmaker_for_test, sitting["id"])
        response = await client.delete(
            f"/api/intake/sittings/{sitting['id']}/photos/{photo_id}"
        )
        shown = (await client.get(f"/api/intake/sittings/{sitting['id']}")).json()
    assert response.status_code == 204
    assert shown["photos"] == []
    assert [e["payload"]["title"] for e in shown["entries"]] == ["Typed"]
    assert await _count(sessionmaker_for_test, IntakePhoto) == 0


@pytest.mark.asyncio
async def test_deleting_a_photo_being_read_is_a_409_and_changes_nothing(
    sessionmaker_for_test,
):
    async with client_for(sessionmaker_for_test) as client:
        sitting = await _sitting(client)
        photo_id = await _seed_photo_entries(sessionmaker_for_test, sitting["id"])
        async with sessionmaker_for_test() as session:
            photo = await session.get(IntakePhoto, uuid.UUID(photo_id))
            photo.state = IntakePhotoState.READING
            await session.commit()
        response = await client.delete(
            f"/api/intake/sittings/{sitting['id']}/photos/{photo_id}"
        )
    assert response.status_code == 409
    assert (
        response.json()["detail"] == "This photo is being read; try again in a moment."
    )
    assert await _count(sessionmaker_for_test, IntakePhoto) == 1
    assert await _count(sessionmaker_for_test, IntakeEntry) == 3


@pytest.mark.asyncio
async def test_deleting_a_photo_touches_the_sitting(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        sitting = await _sitting(client)
        photo_id = await _seed_photo_entries(sessionmaker_for_test, sitting["id"])
        async with sessionmaker_for_test() as session:
            await session.execute(
                update(IntakeSitting)
                .where(IntakeSitting.id == uuid.UUID(sitting["id"]))
                .values(updated_at=datetime(2020, 1, 1, tzinfo=UTC))
            )
            await session.commit()
        await client.delete(f"/api/intake/sittings/{sitting['id']}/photos/{photo_id}")
    async with sessionmaker_for_test() as session:
        row = await session.get(IntakeSitting, uuid.UUID(sitting["id"]))
    assert row.updated_at.year >= 2026


@pytest.mark.asyncio
async def test_deleting_a_photo_not_in_that_sitting_is_a_404(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        mine = await _sitting(client)
        other = await _sitting(client)
        photo_id = await _seed_photo_entries(sessionmaker_for_test, other["id"])
        wrong = await client.delete(
            f"/api/intake/sittings/{mine['id']}/photos/{photo_id}"
        )
        missing = await client.delete(
            f"/api/intake/sittings/{mine['id']}/photos/{uuid.uuid4()}"
        )
    assert wrong.status_code == 404
    assert missing.status_code == 404
    assert await _count(sessionmaker_for_test, IntakePhoto) == 1
    assert await _count(sessionmaker_for_test, IntakeEntry) == 3


@pytest.mark.asyncio
async def test_deleting_a_photo_from_a_gone_sitting_is_intakes_409(
    sessionmaker_for_test,
):
    async with client_for(sessionmaker_for_test) as client:
        sitting = await _sitting(client)
        photo_id = await _seed_photo_entries(sessionmaker_for_test, sitting["id"])
        await client.delete(f"/api/intake/sittings/{sitting['id']}")
        response = await client.delete(
            f"/api/intake/sittings/{sitting['id']}/photos/{photo_id}"
        )
    assert response.status_code == 409
    assert response.json()["detail"] == SITTING_GONE


@pytest.mark.asyncio
async def test_deleting_a_closet_photo_takes_its_piece_with_it(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        sitting = await _sitting(client, area="closet")
        uploaded = await client.post(
            f"/api/intake/sittings/{sitting['id']}/photos", files=_photo()
        )
        photo_id = uploaded.json()["id"]
        response = await client.delete(
            f"/api/intake/sittings/{sitting['id']}/photos/{photo_id}"
        )
        shown = (await client.get(f"/api/intake/sittings/{sitting['id']}")).json()
    assert response.status_code == 204
    assert shown["photos"] == [] and shown["entries"] == []
    assert await _count(sessionmaker_for_test, Garment) == 0


@pytest.mark.asyncio
async def test_an_entry_removed_by_ignoring_it_carries_no_unticked_note(
    sessionmaker_for_test,
):
    async with client_for(sessionmaker_for_test) as client:
        sitting = await _sitting(client)
        await _seed_photo_entries(sessionmaker_for_test, sitting["id"])
        shown = (await client.get(f"/api/intake/sittings/{sitting['id']}")).json()
        typed = next(e for e in shown["entries"] if e["state"] == "typed")
        patched = await client.patch(
            f"/api/intake/entries/{typed['id']}", json={"state": "ignored"}
        )
    assert patched.status_code == 200
    assert "unticked" not in patched.json()["payload"]
    assert patched.json()["state"] == "ignored"


COMIC_BOOK = {
    "detected_title": "Waterworld: Children of Leviathan",
    "issue_number": 2,
    "number_source": "read",
    "format": "single",
}
WATERWORLD = {
    "external_source": "comicvine",
    "external_id": "cv-ww",
    "title": "Waterworld: Children of Leviathan",
    "issue_count": 4,
}


async def _book(client, sitting_id, payload=None, chosen=None):
    response = await client.post(
        f"/api/intake/sittings/{sitting_id}/entries",
        json={
            "kind": "comic",
            "chosen": chosen if chosen is not None else WATERWORLD,
            "payload": payload if payload is not None else COMIC_BOOK,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


@pytest.mark.asyncio
async def test_a_comic_entry_carries_the_mark_for_its_number(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        sitting = await _sitting(client, kind="comic")
        entry = await _book(client, sitting["id"])
        game = await client.post(
            f"/api/intake/sittings/{sitting['id']}/entries",
            json={"kind": "game", "payload": {"title": "Hades"}},
        )
    assert entry["number_check"] == {"state": "in_run", "run": 4}
    assert "number_check" not in game.json()


@pytest.mark.asyncio
async def test_the_mark_judges_by_the_issues_of_a_series_on_the_shelf(
    sessionmaker_for_test,
):
    from datetime import date

    from models import ComicIssue

    async with sessionmaker_for_test() as session:
        series = Item(
            type=ItemType.COMIC,
            title="Waterworld: Children of Leviathan",
            status=ItemStatus.BACKLOG,
            external_source="comicvine",
            external_id="cv-ww",
        )
        session.add(series)
        await session.flush()
        for number in range(1, 7):
            session.add(
                ComicIssue(
                    item_id=series.id,
                    number=number,
                    cv_id=number,
                    fetched_on=date(2026, 11, 1),
                )
            )
        await session.commit()
    async with client_for(sessionmaker_for_test) as client:
        sitting = await _sitting(client, kind="comic")
        entry = await _book(
            client,
            sitting["id"],
            {**COMIC_BOOK, "issue_number": 6},
            {**WATERWORLD, "issue_count": 4},
        )
    assert entry["on_shelf"]["issue_max"] == 6
    assert entry["number_check"] == {"state": "in_run", "run": 6}


@pytest.mark.asyncio
async def test_typing_a_number_marks_it_typed_and_a_bad_one_is_refused(
    sessionmaker_for_test,
):
    async with client_for(sessionmaker_for_test) as client:
        sitting = await _sitting(client, kind="comic")
        entry = await _book(client, sitting["id"])
        url = f"/api/intake/entries/{entry['id']}"
        typed = await client.patch(
            url, json={"payload": {**COMIC_BOOK, "issue_number": 3}}
        )
        same = await client.patch(url, json={"payload": typed.json()["payload"]})
        cleared = await client.patch(
            url, json={"payload": {**COMIC_BOOK, "issue_number": None}}
        )
        zero = await client.patch(
            url, json={"payload": {**COMIC_BOOK, "issue_number": 0}}
        )
        backwards = await client.patch(
            url,
            json={
                "payload": {
                    **COMIC_BOOK,
                    "format": "collected",
                    "collects_from": 6,
                    "collects_to": 1,
                }
            },
        )
        after = await client.get(f"/api/intake/sittings/{sitting['id']}")
    assert typed.json()["payload"]["number_source"] == "typed"
    assert typed.json()["number_check"]["state"] == "typed"
    assert same.json()["payload"]["number_source"] == "typed"
    assert cleared.json()["payload"]["number_source"] == "none"
    assert cleared.json()["number_check"]["state"] == "none"
    assert zero.status_code == 422
    assert "1 to 9999" in zero.json()["detail"]
    assert backwards.status_code == 422
    # a refused edit changes nothing
    assert after.json()["entries"][0]["payload"]["issue_number"] is None
