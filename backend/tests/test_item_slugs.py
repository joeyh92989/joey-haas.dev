"""Readable item URLs (#479): the generator, the insert paths and the lookup."""

import re
import uuid
from datetime import date
from pathlib import Path

import pytest
from sqlalchemy import select

import item_slugs
from analytics_routes import public_path_filter
from models import Item, ItemStatus, ItemType
from tests.test_items_bulk import _item
from tests.test_items_bulk import client_for as items_client
from tests.test_public import client_for as public_client

BACKEND = Path(__file__).resolve().parent.parent


# --- slugify ---------------------------------------------------------------


@pytest.mark.parametrize(
    ("title", "expected"),
    [
        ("Catherine: Full Body", "catherine-full-body"),
        ("Pokémon Red", "pokemon-red"),
        ("Baldur's Gate 3", "baldurs-gate-3"),
        ("  Spaced   Out  ", "spaced-out"),
        ("Half-Life 2", "half-life-2"),
        ("Ōkami HD", "okami-hd"),
        ("Saga #1: Vol. 2", "saga-1-vol-2"),
    ],
)
def test_slugify_makes_lowercase_ascii_words(title, expected):
    assert item_slugs.slugify(title, "game") == expected
    assert item_slugs.SLUG_SHAPE.fullmatch(expected)


@pytest.mark.parametrize("title", ["???", "", "   ", "🎮", None, "日本語"])
def test_a_title_with_nothing_usable_falls_back_to_the_kind(title):
    assert item_slugs.slugify(title, "game") == "game"
    assert item_slugs.slugify(title, "board_game") == "board-game"


def test_a_long_title_is_cut_at_a_hyphen():
    slug = item_slugs.slugify("word " * 40, "game")
    assert len(slug) <= item_slugs.MAX_LENGTH
    assert not slug.endswith("-")
    assert set(slug.split("-")) == {"word"}


def test_unique_slug_is_bare_when_free_and_suffixed_when_taken():
    one, two = uuid.uuid4(), uuid.uuid4()
    assert item_slugs.unique_slug("Dune", "movie", one, lambda c: False) == "dune"
    taken = {"dune"}
    second = item_slugs.unique_slug("Dune", "movie", two, taken.__contains__)
    assert second == f"dune-{two.hex[:6]}"


def test_unique_slug_lengthens_the_suffix_when_that_is_taken_too():
    item = uuid.uuid4()
    taken = {"dune", f"dune-{item.hex[:6]}"}
    assert (
        item_slugs.unique_slug("Dune", "movie", item, taken.__contains__)
        == f"dune-{item.hex[:8]}"
    )


@pytest.mark.parametrize("title", sorted(item_slugs.RESERVED - {"feed-xml"}))
def test_a_reserved_page_name_is_suffixed(title):
    item = uuid.uuid4()
    slug = item_slugs.unique_slug(title.title(), "game", item, lambda c: False)
    assert slug == f"{title}-{item.hex[:6]}"


def test_a_title_that_is_a_uuid_never_becomes_a_uuid_shaped_slug():
    item = uuid.uuid4()
    other = str(uuid.uuid4())
    slug = item_slugs.unique_slug(other, "game", item, lambda c: False)
    assert not item_slugs.is_id(slug)


def test_backfill_gives_the_oldest_row_the_bare_slug():
    a, b, c = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    out = item_slugs.backfill(
        [(a, "Dune", "movie"), (b, "Dune", "movie"), (c, "???", "game")]
    )
    assert out[a] == "dune"
    assert out[b] == f"dune-{b.hex[:6]}"
    assert out[c] == "game"
    assert len(set(out.values())) == 3


def test_is_id_tells_a_uuid_from_a_slug():
    assert item_slugs.is_id(str(uuid.uuid4()))
    assert not item_slugs.is_id("catherine-full-body")


# --- every insert path fills the slug ---------------------------------------


@pytest.mark.asyncio
async def test_an_orm_insert_gets_a_slug_and_same_title_rows_in_one_flush_differ(
    sessionmaker_for_test,
):
    async with sessionmaker_for_test() as session:
        rows = [
            Item(type=ItemType.GAME, title="Celeste", status=ItemStatus.BACKLOG),
            Item(type=ItemType.GAME, title="Celeste", status=ItemStatus.BACKLOG),
            Item(type=ItemType.MOVIE, title="Celeste", status=ItemStatus.BACKLOG),
        ]
        session.add_all(rows)
        await session.commit()
        slugs = [row.slug for row in rows]
    assert all(slugs)
    assert len(set(slugs)) == 3
    assert "celeste" in slugs


@pytest.mark.asyncio
async def test_a_later_insert_does_not_take_an_existing_slug(sessionmaker_for_test):
    async with sessionmaker_for_test() as session:
        first = Item(type=ItemType.GAME, title="Hades", status=ItemStatus.BACKLOG)
        session.add(first)
        await session.commit()
    async with sessionmaker_for_test() as session:
        second = Item(type=ItemType.GAME, title="Hades", status=ItemStatus.BACKLOG)
        session.add(second)
        await session.commit()
        assert second.slug == f"hades-{second.id.hex[:6]}"
        assert first.slug == "hades"


@pytest.mark.asyncio
async def test_the_slug_stays_when_the_title_changes(sessionmaker_for_test):
    async with sessionmaker_for_test() as session:
        item = Item(type=ItemType.GAME, title="Old Name", status=ItemStatus.BACKLOG)
        session.add(item)
        await session.commit()
        item.title = "New Name"
        await session.commit()
        await session.refresh(item)
        assert item.slug == "old-name"


@pytest.mark.asyncio
async def test_post_items_returns_a_slug(sessionmaker_for_test):
    async with items_client(sessionmaker_for_test) as client:
        response = await client.post("/api/items", json=_item("Arrival"))
    assert response.status_code == 201
    assert response.json()["slug"] == "arrival"


@pytest.mark.asyncio
async def test_bulk_gives_every_row_a_distinct_slug(sessionmaker_for_test):
    async with items_client(sessionmaker_for_test) as client:
        await client.post("/api/items", json=_item("Dune"))
        response = await client.post(
            "/api/items/bulk",
            json={
                "items": [
                    _item("Dune", external_source="tmdb", external_id="1"),
                    _item("Dune", external_source="tmdb", external_id="2"),
                    _item("Arrival", external_source="tmdb", external_id="3"),
                ]
            },
        )
    assert response.status_code == 201
    async with sessionmaker_for_test() as session:
        slugs = list(await session.scalars(select(Item.slug)))
    assert None not in slugs
    assert len(slugs) == 4 and len(set(slugs)) == 4
    assert "dune" in slugs and "arrival" in slugs


def test_no_module_inserts_items_outside_the_covered_paths():
    """A new way to create an Item that skips the ORM listener would leave its
    slug null. Every `Item(` construction outside tests is an ORM insert
    (covered by models.py's listener); the only Core insert is items.py's bulk
    path, which names `_new_slug`. Anything else fails here."""
    core = []
    for path in BACKEND.glob("*.py"):
        source = path.read_text()
        if (
            re.search(r"(pg_)?insert\(\s*Item\b", source)
            or "Item.__table__.insert" in source
        ):
            core.append(path.name)
    assert core == ["items.py"]
    assert "_new_slug" in (BACKEND / "items.py").read_text()


# --- lookup by slug and by id ------------------------------------------------


async def _public_item(factory, title, **extra) -> Item:
    async with factory() as session:
        item = Item(
            type=ItemType.GAME,
            title=title,
            status=ItemStatus.FINISHED,
            finished_at=date(2026, 1, 1),
            is_public=extra.pop("is_public", True),
            **extra,
        )
        session.add(item)
        await session.commit()
        await session.refresh(item)
        return item


@pytest.mark.asyncio
async def test_the_public_item_reads_by_slug_and_by_id(sessionmaker_for_test):
    item = await _public_item(sessionmaker_for_test, "Catherine: Full Body")
    async with public_client(sessionmaker_for_test) as client:
        by_slug = await client.get("/api/public/items/catherine-full-body")
        by_id = await client.get(f"/api/public/items/{item.id}")
        listing = await client.get("/api/public/items")
    assert by_slug.status_code == by_id.status_code == 200
    assert by_slug.json()["id"] == by_id.json()["id"] == str(item.id)
    assert by_slug.json()["slug"] == "catherine-full-body"
    assert [row["slug"] for row in listing.json()] == ["catherine-full-body"]


@pytest.mark.asyncio
async def test_an_unknown_or_private_key_is_a_404(sessionmaker_for_test):
    private = await _public_item(sessionmaker_for_test, "Secret", is_public=False)
    async with public_client(sessionmaker_for_test) as client:
        assert (await client.get("/api/public/items/nothing-here")).status_code == 404
        assert (await client.get("/api/public/items/secret")).status_code == 404
        assert (await client.get(f"/api/public/items/{private.id}")).status_code == 404
        assert (await client.get("/api/public/items/Not_A_Slug")).status_code == 404


@pytest.mark.asyncio
async def test_the_comic_reads_under_an_item_accept_a_slug(sessionmaker_for_test):
    async with sessionmaker_for_test() as session:
        comic = Item(
            type=ItemType.COMIC, title="Saga", status=ItemStatus.BACKLOG, is_public=True
        )
        session.add(comic)
        await session.commit()
    async with public_client(sessionmaker_for_test) as client:
        wall = await client.get("/api/public/items/saga/issues")
        missing = await client.get("/api/public/items/nope/issues")
    assert wall.status_code == 200
    assert missing.status_code == 404


# --- the public stats filter -------------------------------------------------


@pytest.mark.asyncio
async def test_the_public_stats_filter_names_a_page_only_for_a_public_item(
    sessionmaker_for_test,
):
    public = await _public_item(sessionmaker_for_test, "Open Game")
    private = await _public_item(sessionmaker_for_test, "Hidden Game", is_public=False)
    async with sessionmaker_for_test() as session:
        keep = await public_path_filter(session)
    assert keep("/shelf/open-game")
    assert keep(f"/shelf/{public.id}")
    assert keep("/shelf/open-game/12")
    assert not keep("/shelf/hidden-game")
    assert not keep(f"/shelf/{private.id}")
    assert not keep("/shelf/unknown-slug")
    # Pages that are not items are untouched, so the year page is still named.
    assert keep("/shelf/year/2026")
    assert keep("/shelf/games")
