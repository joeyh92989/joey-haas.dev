"""The closet's "From a file": upload, photos, Check's answers, commit (#396).

Every row is invented. The real seed file is purchase history and stays
outside the repo."""

from __future__ import annotations

import uuid
from decimal import Decimal

import pytest
from sqlalchemy import func, select

from intake import seed_import
from intake.seed_image import ImageFetchError
from models import (
    ClosetSetting,
    Garment,
    GarmentColorSource,
    GarmentImage,
    GarmentProduct,
    GarmentProductSource,
    GarmentStatus,
    IntakeEntry,
    IntakeEntryState,
    IntakePhoto,
    IntakePhotoState,
    IntakeSetting,
    IntakeSitting,
)
from tests.test_closet_routes import jpeg
from tests.test_intake_kinds import client_for

HEADER = (
    "n,source,order_id,date,date_basis,brand,name,color_name,size,price_usd,"
    "category_hint,store_item_no,still_owned,image_url\n"
)
GOOD = "https://img.example.test/good.jpg"
BAD = "https://img.example.test/missing.jpg"


def line(n=1, **over) -> str:
    row = {
        "n": str(n),
        "source": "stitchfix",
        "order_id": f"ORD-{n}",
        "date": "2025-03-04",
        "date_basis": "order",
        "brand": "Acme",
        "name": f"Test Tee {n}",
        "color_name": "Burgundy",
        "size": "M",
        "price_usd": "48.00",
        "category_hint": "top",
        "store_item_no": "",
        "still_owned": "yes",
        "image_url": GOOD,
    }
    row.update(over)
    return ",".join(f'"{value}"' for value in row.values()) + "\n"


FILE = HEADER + line(1) + line(2, color_name="TWILL", category_hint="hat")


@pytest.fixture(autouse=True)
def photos(monkeypatch):
    """The store's photos: GOOD is a 1600 px JPEG, BAD is refused."""

    async def fake(url, **_):
        if url == BAD:
            raise ImageFetchError("the store answered 404")
        return jpeg(1600, 1200)

    monkeypatch.setattr(seed_import, "fetch_image", fake)


async def start(client) -> str:
    response = await client.post(
        "/api/intake/sittings", json={"area": "closet", "kind": "garment"}
    )
    return response.json()["id"]


async def upload(client, sitting_id, text=FILE, name="seed.csv"):
    return await client.post(
        f"/api/intake/sittings/{sitting_id}/file",
        files={"file": (name, text.encode(), "text/csv")},
    )


async def fetch_all(client, sitting_id):
    while True:
        body = (
            await client.post(f"/api/intake/sittings/{sitting_id}/seed-images")
        ).json()
        if body["pending"] == 0:
            return body


async def count(factory, model) -> int:
    async with factory() as session:
        return await session.scalar(select(func.count()).select_from(model))


async def entries_of(client, sitting_id):
    return (await client.get(f"/api/intake/sittings/{sitting_id}")).json()["entries"]


@pytest.mark.asyncio
async def test_a_file_makes_one_draft_entry_per_piece_and_no_garment(
    sessionmaker_for_test,
):
    async with client_for(sessionmaker_for_test) as client:
        sitting_id = await start(client)
        response = await upload(client, sitting_id)
        sitting = (await client.get(f"/api/intake/sittings/{sitting_id}")).json()
    assert response.status_code == 201, response.text
    assert response.json() == {
        "added": 2,
        "skipped_not_owned": 0,
        "skipped_known_not_owned": 0,
        "already_imported": 0,
        "duplicates": 0,
        "unreadable": 0,
        "problems": [],
    }
    assert sitting["step"] == "check"
    first, second = sitting["entries"]
    assert (first["kind"], first["state"], first["garment_id"]) == (
        "garment",
        "typed",
        None,
    )
    assert first["payload"]["name"] == "Test Tee 1"
    assert first["payload"]["primary_color"] == "red"
    # An unknown hint and a non-colour are left for Check to ask.
    assert "category" not in second["payload"]
    assert "primary_color" not in second["payload"]
    assert await count(sessionmaker_for_test, Garment) == 0
    assert await count(sessionmaker_for_test, GarmentProduct) == 0


@pytest.mark.asyncio
async def test_rows_not_owned_and_repeats_are_counted_not_added(sessionmaker_for_test):
    text = (
        HEADER
        + line(1)
        + line(2, still_owned="no")
        + line(1)  # the same order line twice
        + line(3, name="", image_url="")
    )
    async with client_for(sessionmaker_for_test) as client:
        sitting_id = await start(client)
        body = (await upload(client, sitting_id, text)).json()
        # The same file again into the same sitting adds nothing.
        again = (await upload(client, sitting_id, text)).json()
    assert body["added"] == 1
    assert body["skipped_not_owned"] == 1
    assert body["duplicates"] == 1
    assert body["unreadable"] == 1 and "Line 5" in body["problems"][0]
    assert again["added"] == 0 and again["duplicates"] == 2


@pytest.mark.asyncio
async def test_bad_files_are_refused_in_words(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        sitting_id = await start(client)
        no_header = await upload(client, sitting_id, "just,some\nwords,here\n")
        huge = await upload(client, sitting_id, HEADER + "x" * (1024 * 1024))
        shelf = (
            await client.post("/api/intake/sittings", json={"area": "shelf"})
        ).json()["id"]
        wrong_area = await upload(client, shelf)
        gone = await upload(client, str(uuid.uuid4()))
    assert no_header.status_code == 422 and "source" in no_header.json()["detail"]
    assert huge.status_code == 413
    assert wrong_area.status_code == 409
    assert gone.status_code == 404


@pytest.mark.asyncio
async def test_photos_are_fetched_once_and_held_on_the_sitting(sessionmaker_for_test):
    text = HEADER + line(1) + line(2, image_url=BAD) + line(3, image_url="")
    async with client_for(sessionmaker_for_test) as client:
        sitting_id = await start(client)
        await upload(client, sitting_id, text)
        body = await fetch_all(client, sitting_id)
        entries = {
            e["payload"]["name"]: e for e in await entries_of(client, sitting_id)
        }
        photo = await client.get(
            f"/api/intake/photos/{entries['Test Tee 1']['photo_id']}/image"
        )
        # Asking again fetches nothing more.
        second = await fetch_all(client, sitting_id)
    assert body["pending"] == 0 and second["entries"] == []
    assert entries["Test Tee 1"]["payload"]["image"] == "held"
    assert entries["Test Tee 2"]["payload"]["image"] == "failed"
    assert "404" in entries["Test Tee 2"]["payload"]["image_error"]
    assert entries["Test Tee 3"]["payload"]["image"] == "none"
    assert photo.status_code == 200 and photo.headers["content-type"] == "image/webp"
    assert await count(sessionmaker_for_test, IntakePhoto) == 1


@pytest.mark.asyncio
async def test_check_cannot_change_the_servers_record_of_a_row(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        sitting_id = await start(client)
        await upload(client, sitting_id, HEADER + line(1))
        (entry,) = await entries_of(client, sitting_id)
        edited = {
            **entry["payload"],
            "size": "L",
            "image": "held",
            "seed": {"image_url": "https://169.254.169.254/x"},
        }
        saved = (
            await client.patch(
                f"/api/intake/entries/{entry['id']}", json={"payload": edited}
            )
        ).json()
    assert saved["payload"]["size"] == "L"
    assert saved["payload"]["image"] == "pending"
    assert saved["payload"]["seed"] == entry["payload"]["seed"]


@pytest.mark.asyncio
async def test_commit_writes_the_garment_its_product_and_its_photo(
    sessionmaker_for_test,
):
    text = (
        HEADER
        + line(1, store_item_no="SKU-1", price_usd="$48.50")
        + line(2, image_url=BAD)
        + line(3, still_owned="no")
    )
    async with client_for(sessionmaker_for_test) as client:
        sitting_id = await start(client)
        await upload(client, sitting_id, text)
        await fetch_all(client, sitting_id)
        (first, _) = await entries_of(client, sitting_id)
        # Check edits the store colour and picks the family by hand.
        await client.patch(
            f"/api/intake/entries/{first['id']}",
            json={"payload": {**first["payload"], "brand": "Acme Co"}},
        )
        response = await client.post(
            f"/api/intake/sittings/{sitting_id}/commit", json={"today": "2026-11-16"}
        )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["added"] == 2 and body["images_missing"] == 1
    assert body["file_import"] == {
        "added": 2,
        "skipped_not_owned": 1,
        "skipped_known_not_owned": 0,
        "already_imported": 0,
        "duplicates": 0,
        "unreadable": 0,
    }
    async with sessionmaker_for_test() as session:
        garments = (await session.scalars(select(Garment).order_by(Garment.name))).all()
        assert [g.name for g in garments] == ["Test Tee 1", "Test Tee 2"]
        one = garments[0]
        assert (one.brand, one.color_name, one.size) == ("Acme Co", "Burgundy", "M")
        assert one.color_source is GarmentColorSource.VENDOR
        assert one.primary_color == "red" and one.primary_hex is None
        assert one.status is GarmentStatus.UNTAGGED and one.tag_source is None
        assert one.category.value == "top"
        assert one.acquired_on.isoformat() == "2025-03-04"
        product = await session.scalar(
            select(GarmentProduct).where(GarmentProduct.garment_id == one.id)
        )
        assert product.source is GarmentProductSource.STITCHFIX
        assert (product.order_ref, product.store_item_no) == ("ORD-1", "SKU-1")
        assert product.title == "Test Tee 1" and product.price == Decimal("48.50")
        assert product.snapshot["color_name"] == "Burgundy"
        assert product.fetched_at is not None
        image = await session.get(GarmentImage, one.id)
        assert max(image.width, image.height) == 800
        assert await session.get(GarmentImage, garments[1].id) is None
        # Nothing of the sitting is left behind.
        assert (
            await session.scalar(select(func.count()).select_from(IntakeSitting)) == 0
        )
        assert await session.scalar(select(func.count()).select_from(IntakePhoto)) == 0
        assert (
            await session.scalar(select(func.count()).select_from(IntakeSetting)) == 0
        )


@pytest.mark.asyncio
async def test_uploading_the_same_file_again_adds_nothing(sessionmaker_for_test):
    text = HEADER + line(1, store_item_no="SKU-1") + line(2)
    async with client_for(sessionmaker_for_test) as client:
        first = await start(client)
        await upload(client, first, text)
        await client.post(f"/api/intake/sittings/{first}/commit", json={})
        second = await start(client)
        body = (await upload(client, second, text)).json()
        # The commit of an empty sitting still reports the file's counts.
        done = await client.post(f"/api/intake/sittings/{second}/commit", json={})
    assert body["added"] == 0 and body["already_imported"] == 2
    assert done.json()["added"] == 0
    assert done.json()["file_import"]["already_imported"] == 2
    assert await count(sessionmaker_for_test, Garment) == 2


@pytest.mark.asyncio
async def test_an_item_number_matches_across_orders(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        first = await start(client)
        await upload(client, first, HEADER + line(1, store_item_no="SKU-1"))
        await client.post(f"/api/intake/sittings/{first}/commit", json={})
        second = await start(client)
        body = (
            await upload(
                client, second, HEADER + line(9, store_item_no="sku-1", name="Other")
            )
        ).json()
    assert body["already_imported"] == 1 and body["added"] == 0


@pytest.mark.asyncio
async def test_dont_own_this_removes_the_piece_and_every_later_file_skips_it(
    sessionmaker_for_test,
):
    async with client_for(sessionmaker_for_test) as client:
        sitting_id = await start(client)
        await upload(client, sitting_id)
        await fetch_all(client, sitting_id)
        first, _ = await entries_of(client, sitting_id)
        answer = await client.post(f"/api/intake/entries/{first['id']}/not-owned")
        later = await start(client)
        body = (await upload(client, later)).json()
        commit = await client.post(f"/api/intake/sittings/{sitting_id}/commit", json={})
    assert answer.status_code == 200
    assert answer.json()["state"] == "ignored" and answer.json()["photo_id"] is None
    assert body["skipped_known_not_owned"] == 1 and body["added"] == 1
    assert commit.json()["added"] == 1  # only the piece kept
    async with sessionmaker_for_test() as session:
        stored = await session.get(ClosetSetting, "import.not_owned")
        assert stored.value == {"keys": ["stitchfix|ord-1|test tee 1+burgundy+m"]}
        assert await count(sessionmaker_for_test, IntakePhoto) == 0  # none held


@pytest.mark.asyncio
async def test_dont_own_this_is_for_file_pieces_only(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        sitting_id = await start(client)
        entry = (
            await client.post(
                f"/api/intake/sittings/{sitting_id}/entries",
                json={"kind": "garment", "payload": {"name": "Hand typed"}},
            )
        ).json()
        refused = await client.post(f"/api/intake/entries/{entry['id']}/not-owned")
        missing = await client.post(f"/api/intake/entries/{uuid.uuid4()}/not-owned")
    assert refused.status_code == 409 and missing.status_code == 404


@pytest.mark.asyncio
async def test_the_not_owned_list_can_be_seeded_and_is_idempotent(
    sessionmaker_for_test,
):
    async with sessionmaker_for_test() as session:
        assert (
            await seed_import.add_not_owned(session, ["a|1|x", "b|2|y", "a|1|x"]) == 2
        )
        await session.commit()
    async with sessionmaker_for_test() as session:
        assert await seed_import.add_not_owned(session, ["b|2|y", "c|3|z"]) == 1
        await session.commit()
        assert await seed_import.not_owned_keys(session) == {"a|1|x", "b|2|y", "c|3|z"}


@pytest.mark.asyncio
async def test_a_removed_piece_is_never_written_and_discarding_drops_the_counts(
    sessionmaker_for_test,
):
    async with client_for(sessionmaker_for_test) as client:
        sitting_id = await start(client)
        await upload(client, sitting_id)
        first, _ = await entries_of(client, sitting_id)
        await client.patch(
            f"/api/intake/entries/{first['id']}", json={"state": "ignored"}
        )
        await client.delete(f"/api/intake/sittings/{sitting_id}")
    assert await count(sessionmaker_for_test, Garment) == 0
    assert await count(sessionmaker_for_test, IntakeSetting) == 0
    assert await count(sessionmaker_for_test, IntakeEntry) == 0


@pytest.mark.asyncio
async def test_a_piece_with_a_field_too_long_for_the_closet_is_unreadable(
    sessionmaker_for_test,
):
    async with client_for(sessionmaker_for_test) as client:
        sitting_id = await start(client)
        body = (
            await upload(client, sitting_id, HEADER + line(1, name="n" * 200))
        ).json()
    assert body["added"] == 0 and body["unreadable"] == 1
    assert "name" in body["problems"][0]


@pytest.mark.asyncio
async def test_the_entry_states_stay_typed_until_commit(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        sitting_id = await start(client)
        await upload(client, sitting_id)
    async with sessionmaker_for_test() as session:
        states = set(await session.scalars(select(IntakeEntry.state)))
    assert states == {IntakeEntryState.TYPED}


@pytest.mark.asyncio
async def test_an_expired_sittings_file_counts_go_with_it(sessionmaker_for_test):
    from datetime import UTC, datetime, timedelta

    from sqlalchemy import update

    from intake.nightly import expire_sittings

    async with client_for(sessionmaker_for_test) as client:
        sitting_id = await start(client)
        await upload(client, sitting_id)
    async with sessionmaker_for_test() as session:
        old = datetime.now(UTC) - timedelta(days=90)
        await session.execute(update(IntakeEntry).values(updated_at=old))
        await session.execute(update(IntakeSitting).values(updated_at=old))
        await session.commit()
        removed, _ = await expire_sittings(session, datetime.now(UTC))
        await session.commit()
    assert removed == 1
    assert await count(sessionmaker_for_test, IntakeSetting) == 0


# --- review findings ---------------------------------------------------------


async def _raw_entry(factory, sitting_id, payload, state=IntakeEntryState.TYPED):
    async with factory() as session:
        row = IntakeEntry(
            sitting_id=uuid.UUID(sitting_id),
            kind="garment",
            state=state,
            payload=payload,
        )
        session.add(row)
        await session.commit()
        return str(row.id)


@pytest.mark.asyncio
async def test_a_client_can_never_plant_the_servers_keys(sessionmaker_for_test):
    planted = {
        "name": "Tee",
        "image": "pending",
        "image_error": "x",
        "seed": {"image_url": "https://169.254.169.254/x", "source": "duer"},
    }
    async with client_for(sessionmaker_for_test) as client:
        sitting_id = await start(client)
        made = (
            await client.post(
                f"/api/intake/sittings/{sitting_id}/entries",
                json={"kind": "garment", "payload": planted},
            )
        ).json()
        plain = (
            await client.patch(
                f"/api/intake/entries/{made['id']}", json={"payload": planted}
            )
        ).json()
        fetched = (
            await client.post(f"/api/intake/sittings/{sitting_id}/seed-images")
        ).json()
    assert made["payload"] == {"name": "Tee"}
    assert plain["payload"] == {"name": "Tee"}
    assert fetched == {"entries": [], "pending": 0}


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "seed",
    [
        {"source": "nope", "key": "k", "not_owned_key": "n"},
        {"key": "k", "not_owned_key": "n"},
        {"source": 5, "key": "k", "not_owned_key": "n"},
        {"source": "duer", "order_id": 7, "key": "k", "not_owned_key": "n"},
        {"source": "duer", "price_usd": "abc", "key": "k", "not_owned_key": "n"},
        {"source": "duer", "price_usd": "99999999", "key": "k", "not_owned_key": "n"},
        "not a dict",
    ],
)
async def test_a_damaged_seed_record_refuses_its_entry_not_the_server(
    sessionmaker_for_test, seed
):
    async with client_for(sessionmaker_for_test) as client:
        sitting_id = await start(client)
        entry_id = await _raw_entry(
            sessionmaker_for_test, sitting_id, {"name": "Tee", "seed": seed}
        )
        response = await client.post(
            f"/api/intake/sittings/{sitting_id}/commit", json={}
        )
    assert response.status_code == 422, response.text
    assert [r["entry_id"] for r in response.json()["refused"]] == [entry_id]
    assert await count(sessionmaker_for_test, Garment) == 0


@pytest.mark.asyncio
async def test_only_the_photos_of_pieces_written_are_deleted(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        sitting_id = await start(client)
        await upload(client, sitting_id, HEADER + line(1))
        await fetch_all(client, sitting_id)
        (written,) = await entries_of(client, sitting_id)
        kept_id = await _raw_entry(
            sessionmaker_for_test,
            sitting_id,
            {"name": "Later", "seed": {"source": "duer"}},
            state=IntakeEntryState.CHECK,
        )
        async with sessionmaker_for_test() as session:
            photo = IntakePhoto(
                sitting_id=uuid.UUID(sitting_id),
                state=IntakePhotoState.READ,
                thumb_webp=b"x",
                width=1,
                height=1,
            )
            session.add(photo)
            await session.flush()
            entry = await session.get(IntakeEntry, uuid.UUID(kept_id))
            entry.photo_id = photo.id
            await session.commit()
            kept_photo = photo.id
        response = await client.post(
            f"/api/intake/sittings/{sitting_id}/commit", json={}
        )
    assert response.json()["added"] == 1 and written["photo_id"]
    async with sessionmaker_for_test() as session:
        left = set(await session.scalars(select(IntakePhoto.id)))
    assert left == {kept_photo}


@pytest.mark.asyncio
async def test_a_long_order_id_still_matches_what_was_stored(sessionmaker_for_test):
    text = HEADER + line(1, order_id="O" * 120)
    async with client_for(sessionmaker_for_test) as client:
        first = await start(client)
        await upload(client, first, text)
        await client.post(f"/api/intake/sittings/{first}/commit", json={})
        second = await start(client)
        body = (await upload(client, second, text)).json()
    assert body["already_imported"] == 1 and body["added"] == 0


@pytest.mark.asyncio
async def test_a_price_the_column_cannot_hold_makes_the_line_unreadable(
    sessionmaker_for_test,
):
    async with client_for(sessionmaker_for_test) as client:
        sitting_id = await start(client)
        body = (
            await upload(
                client,
                sitting_id,
                HEADER + line(1, price_usd="1000000") + line(2, price_usd="999999.99"),
            )
        ).json()
    assert body["added"] == 1 and body["unreadable"] == 1
    assert "price" in body["problems"][0]
