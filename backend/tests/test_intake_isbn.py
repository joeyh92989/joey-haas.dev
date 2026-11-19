"""ISBN lookup route (story #336) and the ISBN carried on typed books."""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import select

from intake import volume_plan
from intake.comic_books import BookEditError, edit_book, typed_books
from models import ComicVolume, Item, ItemStatus, ItemType
from sources import openlibrary
from sources.base import SourceRateLimited, SourceUnavailable
from tests.test_intake_commit import (
    TRADE,
    S,
    _commit,
    _seed,
    _series,
    _typed,
    _volumes,
)
from tests.test_intake_kinds import client_for

SAGA = "9781607066019"


def _book(**over) -> openlibrary.IsbnBook:
    fields = dict(
        isbn=SAGA,
        title="Saga",
        subtitle="Volume One",
        volume_number=1,
        publisher="Image Comics",
        year=2012,
        pages=160,
        cover_url="https://covers.openlibrary.org/b/id/12679639-M.jpg",
    )
    return openlibrary.IsbnBook(**{**fields, **over})


def _stub(monkeypatch, result=None, raises=None) -> list[str]:
    seen: list[str] = []

    async def fake(isbn):
        seen.append(isbn)
        if raises:
            raise raises
        return result

    monkeypatch.setattr(openlibrary, "lookup", fake)
    return seen


async def _saga_volume(factory, isbn: str | None) -> Item:
    async with factory() as session:
        item = Item(type=ItemType.COMIC, title="Saga", status=ItemStatus.BACKLOG)
        session.add(item)
        await session.flush()
        session.add(
            ComicVolume(
                id=uuid.uuid4(),
                item_id=item.id,
                slug="vol-1",
                position=0,
                label="Volume One",
                kind="trade",
                isbn=isbn,
                owned=True,
                read=False,
            )
        )
        await session.commit()
        return item


@pytest.mark.asyncio
async def test_a_hit_maps_the_book(sessionmaker_for_test, monkeypatch):
    seen = _stub(monkeypatch, _book())
    async with client_for(sessionmaker_for_test) as client:
        response = await client.get("/api/intake/isbn/978-1-60706-601-9")
    assert response.status_code == 200, response.text
    body = response.json()
    assert seen == [SAGA]
    assert body["found"] is True and body["isbn"] == SAGA
    assert (body["title"], body["volume_number"], body["publisher"]) == (
        "Saga",
        1,
        "Image Comics",
    )
    assert (body["year"], body["pages"]) == (2012, 160)
    assert body["cover_url"].startswith("https://covers.openlibrary.org/")
    assert body["on_shelf"] == []


@pytest.mark.asyncio
async def test_a_miss_is_found_false(sessionmaker_for_test, monkeypatch):
    _stub(monkeypatch, None)
    async with client_for(sessionmaker_for_test) as client:
        response = await client.get(f"/api/intake/isbn/{SAGA}")
    assert response.status_code == 200
    assert response.json()["found"] is False
    assert response.json()["reason"] == "not_found"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "error, reason",
    [
        (SourceUnavailable("openlibrary", "down"), "unavailable"),
        (SourceRateLimited("openlibrary", "slow"), "rate_limited"),
    ],
)
async def test_a_source_failure_is_never_a_500(
    sessionmaker_for_test, monkeypatch, error, reason
):
    _stub(monkeypatch, raises=error)
    async with client_for(sessionmaker_for_test) as client:
        response = await client.get(f"/api/intake/isbn/{SAGA}")
    assert response.status_code == 200
    assert (response.json()["found"], response.json()["reason"]) == (False, reason)


@pytest.mark.asyncio
async def test_a_bad_isbn_is_422_and_never_requested(
    sessionmaker_for_test, monkeypatch
):
    seen = _stub(monkeypatch, _book())
    async with client_for(sessionmaker_for_test) as client:
        response = await client.get("/api/intake/isbn/9781607066010")
    assert response.status_code == 422
    assert seen == []


@pytest.mark.asyncio
async def test_signed_out_is_refused(sessionmaker_for_test, monkeypatch):
    _stub(monkeypatch, _book())
    async with client_for(sessionmaker_for_test, signed_in=False) as client:
        response = await client.get(f"/api/intake/isbn/{SAGA}")
    assert response.status_code in (401, 403)


@pytest.mark.asyncio
@pytest.mark.parametrize("stored", [SAGA, "978-1-60706-601-9", "1-60706-601-7"])
async def test_on_shelf_matches_any_stored_form(
    sessionmaker_for_test, monkeypatch, stored
):
    item = await _saga_volume(sessionmaker_for_test, stored)
    await _saga_volume(sessionmaker_for_test, "9780000000002")
    _stub(monkeypatch, raises=SourceUnavailable("openlibrary", "down"))
    async with client_for(sessionmaker_for_test) as client:
        body = (await client.get(f"/api/intake/isbn/{SAGA}")).json()
    assert body["found"] is False  # a failed lookup still reports the shelf
    assert body["on_shelf"] == [
        {"item_id": str(item.id), "title": "Saga", "volume_slug": "vol-1"}
    ]


def test_typed_books_normalise_and_check_the_isbn():
    [book] = typed_books({"books": [{**TRADE, "isbn": "1-60706-601-7"}]})
    assert book["isbn"] == SAGA
    [plain] = typed_books({"books": [{**TRADE, "isbn": "  "}]})
    assert "isbn" not in plain
    with pytest.raises(BookEditError) as error:
        typed_books({"books": [{**TRADE, "isbn": "9781607066010"}]})
    assert error.value.field == "books"
    with pytest.raises(BookEditError):
        edit_book({}, {"books": [{**TRADE, "isbn": 5}]})


@pytest.mark.asyncio
async def test_a_typed_book_with_an_isbn_commits_a_volume_with_it(
    sessionmaker_for_test,
):
    book = {**TRADE, "isbn": SAGA}
    entries = [("comic", S.READY, _typed(book), _series())]
    sitting_id = await _seed(sessionmaker_for_test, entries=entries)
    async with client_for(sessionmaker_for_test) as client:
        response = await _commit(client, sitting_id)
    assert response.status_code == 200, response.text
    [volume] = await _volumes(sessionmaker_for_test)
    assert volume.isbn == SAGA


@pytest.mark.asyncio
async def test_a_bad_isbn_is_a_422_at_the_entry(sessionmaker_for_test):
    entries = [("comic", S.CHECK, _typed(TRADE), _series())]
    sitting_id = await _seed(sessionmaker_for_test, entries=entries)
    async with client_for(sessionmaker_for_test) as client:
        sitting = (await client.get(f"/api/intake/sittings/{sitting_id}")).json()
        entry = sitting["entries"][0]
        bad = _typed({**TRADE, "isbn": "9781607066010"})
        response = await client.patch(
            f"/api/intake/entries/{entry['id']}", json={"payload": bad}
        )
    assert response.status_code == 422, response.text
    assert response.json()["detail"]["field"] == "books"


@pytest.mark.asyncio
async def test_writing_the_same_book_twice_makes_one_volume(sessionmaker_for_test):
    plan = volume_plan.typed_plans(
        uuid.uuid4(), [{**TRADE, "isbn": SAGA}], "Waterworld"
    )[0]
    assert plan.isbn == SAGA
    key = plan.entry_key
    async with sessionmaker_for_test() as session:
        title = Item(type=ItemType.COMIC, title="Waterworld", status=ItemStatus.BACKLOG)
        session.add(title)
        await session.flush()
        first = await volume_plan.write_volume(session, title, key, plan)
        second = await volume_plan.write_volume(session, title, key, plan)
        await session.commit()
        rows = list(await session.scalars(select(ComicVolume)))
    assert (first[1], second[1]) == (True, False)
    assert [v.isbn for v in rows] == [SAGA]


@pytest.mark.asyncio
async def test_check_previews_a_typed_book_with_its_isbn_and_leaves_adds_alone(
    sessionmaker_for_test,
):
    """Typed books are not in `adds` (the pinned shape); they have their own
    `books_preview`, which is what the commit writes, ISBN included."""
    book = {**TRADE, "isbn": SAGA}
    entries = [("comic", S.READY, _typed(book, TRADE), _series())]
    sitting_id = await _seed(sessionmaker_for_test, entries=entries)
    async with client_for(sessionmaker_for_test) as client:
        [entry] = (await client.get(f"/api/intake/sittings/{sitting_id}")).json()[
            "entries"
        ]
        assert (await _commit(client, sitting_id)).status_code == 200
    assert "isbn" not in entry["adds"]
    previewed = [
        (b["label"], b["edition_kind"], b["isbn"]) for b in entry["books_preview"]
    ]
    written = [(v.label, v.kind, v.isbn) for v in await _volumes(sessionmaker_for_test)]
    assert sorted(previewed, key=str) == sorted(written, key=str)
    assert {b["isbn"] for b in entry["books_preview"]} == {SAGA, None}
