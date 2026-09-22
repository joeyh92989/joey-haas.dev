"""The public router. The leak tests here are the point of the module."""

import uuid
from contextlib import asynccontextmanager
from datetime import UTC, date, datetime

import pytest
from fastapi import FastAPI
from httpx2 import ASGITransport, AsyncClient

from models import Item, ItemStatus, ItemType, OwnedFormat
from public import PublicItemDetailOut, PublicItemOut, create_public_router

pytestmark = pytest.mark.asyncio


@asynccontextmanager
async def client_for(factory):
    app = FastAPI()
    app.include_router(create_public_router(factory))
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        yield client


async def _seed(factory) -> None:
    async with factory() as session:
        session.add_all(
            [
                Item(
                    type=ItemType.MOVIE,
                    title="Public Film",
                    status=ItemStatus.FINISHED,
                    rating=9,
                    favorite=True,
                    is_public=True,
                    year=2021,
                    creator="Denis Villeneuve",
                    cover_url="https://image.tmdb.org/t/p/w342/a.jpg",
                    finished_at=date(2026, 3, 14),
                    notes="a private thought",
                    owned_format=OwnedFormat.PHYSICAL,
                    source_metadata={
                        "genres": ["Science Fiction"],
                        "community_score": 7.8,
                        "description": "not published",
                    },
                ),
                Item(
                    type=ItemType.GAME,
                    title="Public Game",
                    status=ItemStatus.BACKLOG,
                    is_public=True,
                    finished_at=None,
                    owned_format=OwnedFormat.NONE,
                ),
                Item(
                    type=ItemType.COMIC,
                    title="Private Thing",
                    status=ItemStatus.ACTIVE,
                    rating=4,
                    is_public=False,
                    notes="secret",
                    finished_at=date(2026, 3, 20),
                ),
            ]
        )
        await session.commit()


async def test_private_fields_are_absent_from_the_response(sessionmaker_for_test):
    # The whole reason the response model is written by hand. Serializing the
    # ORM object would publish any column added later, silently.
    await _seed(sessionmaker_for_test)
    async with client_for(sessionmaker_for_test) as client:
        body = (await client.get("/api/public/items")).json()

    assert body
    for row in body:
        assert "notes" not in row
        assert "owned_format" not in row
        assert "is_public" not in row
        assert "source_metadata" not in row


async def test_non_public_rows_are_never_returned(sessionmaker_for_test):
    await _seed(sessionmaker_for_test)
    async with client_for(sessionmaker_for_test) as client:
        body = (await client.get("/api/public/items")).json()

    assert {row["title"] for row in body} == {"Public Film", "Public Game"}


async def test_the_public_routes_need_no_session(sessionmaker_for_test):
    await _seed(sessionmaker_for_test)
    async with client_for(sessionmaker_for_test) as client:
        assert (await client.get("/api/public/items")).status_code == 200
        assert (await client.get("/api/public/stats")).status_code == 200


async def test_display_fields_survive_the_mapping(sessionmaker_for_test):
    await _seed(sessionmaker_for_test)
    async with client_for(sessionmaker_for_test) as client:
        body = (await client.get("/api/public/items")).json()

    film = next(row for row in body if row["title"] == "Public Film")
    assert film["year"] == 2021
    assert film["creator"] == "Denis Villeneuve"
    assert film["cover_url"].startswith("https://image.tmdb.org/")
    assert film["favorite"] is True
    assert film["finished_at"] == "2026-03-14"
    # Lifted out of the snapshot rather than publishing the snapshot itself.
    assert film["genres"] == ["Science Fiction"]
    assert film["community_score"] == 7.8


async def test_an_item_with_no_snapshot_still_renders(sessionmaker_for_test):
    await _seed(sessionmaker_for_test)
    async with client_for(sessionmaker_for_test) as client:
        body = (await client.get("/api/public/items")).json()

    game = next(row for row in body if row["title"] == "Public Game")
    assert game["genres"] == []
    assert game["community_score"] is None


async def test_stats_count_only_public_rows(sessionmaker_for_test):
    await _seed(sessionmaker_for_test)
    async with client_for(sessionmaker_for_test) as client:
        stats = (await client.get("/api/public/stats")).json()

    assert stats["total"] == 2
    assert stats["by_type"] == {"movie": 1, "game": 1}
    assert stats["by_status"] == {"finished": 1, "backlog": 1}
    # The private row is rated 4 and finished in March; neither may appear.
    assert stats["rating_histogram"] == {"9": 1}
    assert stats["finishes_by_month"] == {"2026-03": 1}


async def test_stats_on_an_empty_collection_are_zeroes_not_an_error(
    sessionmaker_for_test,
):
    async with client_for(sessionmaker_for_test) as client:
        response = await client.get("/api/public/stats")

    assert response.status_code == 200
    assert response.json() == {
        "total": 0,
        "by_type": {},
        "by_status": {},
        "rating_histogram": {},
        "finishes_by_month": {},
        "owned": 0,
        "finished_this_year": 0,
        # Null rather than 0: an empty collection has no average, and 0 would
        # render as the lowest possible score.
        "average_rating": None,
    }


async def test_items_are_ordered_by_most_recently_finished(sessionmaker_for_test):
    await _seed(sessionmaker_for_test)
    async with client_for(sessionmaker_for_test) as client:
        body = (await client.get("/api/public/items")).json()

    # The finished film first; the unfinished game sorts after it rather than
    # ahead of everything on a NULL date.
    assert body[0]["title"] == "Public Film"


# --- The shelf: new list fields, the item page, and the richer stats. -------

# Every field the public may see, named by hand. Adding one means editing
# these sets -- that is the review signal the allowlist exists to produce.
LIST_FIELDS = {
    "id",
    "type",
    "title",
    "year",
    "creator",
    "cover_url",
    "status",
    "rating",
    "favorite",
    "finished_at",
    "genres",
    "community_score",
    "platforms",
    "created_at",
    "wanted",
}
DETAIL_FIELDS = LIST_FIELDS | {
    "description",
    "community_votes",
    "times_completed",
    "started_at",
    "similar_in_collection",
}
NEVER_PUBLIC = {
    "notes",
    "owned_format",
    "source_metadata",
    "similar_games",
    "external_source",
    "external_id",
    "is_public",
}


async def test_the_list_model_publishes_exactly_these_fields():
    assert set(PublicItemOut.model_fields) == LIST_FIELDS


async def test_the_detail_model_publishes_exactly_these_fields():
    assert set(PublicItemDetailOut.model_fields) == DETAIL_FIELDS


def _game(title: str, **fields) -> Item:
    return Item(
        type=fields.pop("type", ItemType.GAME),
        title=title,
        status=fields.pop("status", ItemStatus.BACKLOG),
        is_public=fields.pop("is_public", True),
        **fields,
    )


async def _seed_shelf(factory) -> dict[str, uuid.UUID]:
    """A small shelf around one IGDB game, returning ids by title.

    Hades links Dead Cells and a private row through similar_games; Slay the
    Spire links back to Hades; Gungeon shares two genres and Celeste one. A
    film carries the same external_id as Dead Cells to prove the link is
    matched per source, not on the bare id.
    """
    rows = [
        _game(
            "Hades",
            status=ItemStatus.FINISHED,
            rating=10,
            external_source="igdb",
            external_id="1000",
            started_at=date(2026, 1, 2),
            finished_at=date(2026, 2, 3),
            times_completed=2,
            owned_format=OwnedFormat.PHYSICAL,
            notes="private",
            source_metadata={
                "genres": ["Roguelike", "Action", "Indie"],
                "platforms": ["PC", "Nintendo Switch"],
                "description": "Defy the god of the dead.",
                "community_score": 93.1,
                "community_votes": 512,
                # Ints in the snapshot; external_id is a string column.
                "similar_games": [2000, 9999],
            },
        ),
        _game(
            "Dead Cells",
            rating=7,
            external_source="igdb",
            external_id="2000",
            source_metadata={"genres": ["Platformer"]},
        ),
        _game(
            "Slay the Spire",
            rating=8,
            external_source="igdb",
            external_id="3000",
            source_metadata={"genres": ["Card"], "similar_games": [1000]},
        ),
        _game(
            "Enter the Gungeon",
            rating=8,
            source_metadata={"genres": ["Roguelike", "Action"]},
        ),
        _game("Celeste", rating=9, source_metadata={"genres": ["Indie"]}),
        _game(
            "Same Id Film",
            type=ItemType.MOVIE,
            external_source="tmdb",
            external_id="2000",
        ),
        _game("Wanted Game", owned_format=OwnedFormat.NONE),
        _game(
            "Private Link",
            is_public=False,
            external_source="igdb",
            external_id="9999",
            source_metadata={"genres": ["Roguelike", "Action"]},
        ),
    ]
    async with factory() as session:
        session.add_all(rows)
        await session.commit()
    return {row.title: row.id for row in rows}


async def test_the_list_carries_the_new_fields_and_none_of_the_private_ones(
    sessionmaker_for_test,
):
    await _seed_shelf(sessionmaker_for_test)
    async with client_for(sessionmaker_for_test) as client:
        body = (await client.get("/api/public/items")).json()

    for row in body:
        assert set(row) == LIST_FIELDS
        assert not NEVER_PUBLIC & set(row)
        assert "description" not in row
    hades = next(row for row in body if row["title"] == "Hades")
    assert hades["platforms"] == ["PC", "Nintendo Switch"]
    assert hades["created_at"]
    # Snapshots from TMDB and Comic Vine have no platforms at all.
    celeste = next(row for row in body if row["title"] == "Celeste")
    assert celeste["platforms"] == []


async def test_wanted_is_derived_from_owned_format(sessionmaker_for_test):
    await _seed_shelf(sessionmaker_for_test)
    async with client_for(sessionmaker_for_test) as client:
        body = {
            row["title"]: row for row in (await client.get("/api/public/items")).json()
        }

    assert body["Wanted Game"]["wanted"] is True
    # Physical is owned, and so is NULL: an unset format is not a want.
    assert body["Hades"]["wanted"] is False
    assert body["Celeste"]["wanted"] is False


async def test_the_detail_page_carries_the_extra_fields(sessionmaker_for_test):
    ids = await _seed_shelf(sessionmaker_for_test)
    async with client_for(sessionmaker_for_test) as client:
        response = await client.get(f"/api/public/items/{ids['Hades']}")

    assert response.status_code == 200
    body = response.json()
    assert set(body) == DETAIL_FIELDS
    assert not NEVER_PUBLIC & set(body)
    assert body["description"] == "Defy the god of the dead."
    assert body["community_votes"] == 512
    assert body["times_completed"] == 2
    assert body["started_at"] == "2026-01-02"
    for card in body["similar_in_collection"]:
        assert set(card) == {"id", "type", "title", "cover_url"}


async def test_an_unknown_item_is_a_404(sessionmaker_for_test):
    await _seed_shelf(sessionmaker_for_test)
    async with client_for(sessionmaker_for_test) as client:
        response = await client.get(f"/api/public/items/{uuid.uuid4()}")

    assert response.status_code == 404


async def test_a_private_item_is_a_404_not_a_403(sessionmaker_for_test):
    # A 403 would confirm that a private row exists at that id.
    ids = await _seed_shelf(sessionmaker_for_test)
    async with client_for(sessionmaker_for_test) as client:
        response = await client.get(f"/api/public/items/{ids['Private Link']}")

    assert response.status_code == 404


async def test_stats_still_answers_beside_the_uuid_route(sessionmaker_for_test):
    # /items/{item_id} is declared after the literal routes; this proves
    # neither /items nor /stats is swallowed by it.
    async with client_for(sessionmaker_for_test) as client:
        assert (await client.get("/api/public/stats")).status_code == 200
        assert (await client.get("/api/public/items")).status_code == 200


async def _similar_titles(factory, ids, title) -> list[str]:
    async with client_for(factory) as client:
        body = (await client.get(f"/api/public/items/{ids[title]}")).json()
    return [card["title"] for card in body["similar_in_collection"]]


async def test_similar_items_follow_links_both_ways_and_two_shared_genres(
    sessionmaker_for_test,
):
    ids = await _seed_shelf(sessionmaker_for_test)
    titles = await _similar_titles(sessionmaker_for_test, ids, "Hades")

    # Dead Cells by Hades' link, Slay the Spire by its link back, Gungeon by
    # two genres. Rating descending, then title.
    assert titles == ["Enter the Gungeon", "Slay the Spire", "Dead Cells"]


async def test_one_shared_genre_is_not_enough(sessionmaker_for_test):
    ids = await _seed_shelf(sessionmaker_for_test)
    assert "Celeste" not in await _similar_titles(sessionmaker_for_test, ids, "Hades")


async def test_a_link_is_matched_per_source_not_on_the_bare_id(
    sessionmaker_for_test,
):
    ids = await _seed_shelf(sessionmaker_for_test)
    titles = await _similar_titles(sessionmaker_for_test, ids, "Hades")
    assert "Same Id Film" not in titles
    # Linked by similar_games and sharing two genres, but private.
    assert "Private Link" not in titles


async def test_the_reverse_link_works_from_the_other_side(sessionmaker_for_test):
    ids = await _seed_shelf(sessionmaker_for_test)
    titles = await _similar_titles(sessionmaker_for_test, ids, "Dead Cells")
    assert titles == ["Hades"]


async def test_an_item_is_never_similar_to_itself(sessionmaker_for_test):
    ids = await _seed_shelf(sessionmaker_for_test)
    assert "Hades" not in await _similar_titles(sessionmaker_for_test, ids, "Hades")


async def test_similar_items_are_capped_at_eight(sessionmaker_for_test):
    base = _game("Base", source_metadata={"genres": ["A", "B"]})
    others = [
        _game(f"Match {n:02d}", rating=n, source_metadata={"genres": ["A", "B"]})
        for n in range(1, 11)
    ]
    async with sessionmaker_for_test() as session:
        session.add_all([base, *others])
        await session.commit()

    titles = await _similar_titles(sessionmaker_for_test, {"Base": base.id}, "Base")
    assert titles == [f"Match {n:02d}" for n in range(10, 2, -1)]


async def test_stats_add_owned_this_years_finishes_and_the_average(
    sessionmaker_for_test,
):
    today = datetime.now(UTC).date()
    async with sessionmaker_for_test() as session:
        session.add_all(
            [
                _game("This Year", rating=8, finished_at=today),
                _game(
                    "Last Year",
                    rating=5,
                    finished_at=date(today.year - 1, 12, 31),
                    owned_format=OwnedFormat.PHYSICAL,
                ),
                _game("Unrated Want", owned_format=OwnedFormat.NONE, rating=6),
                _game("Private", is_public=False, rating=1, finished_at=today),
            ]
        )
        await session.commit()

    async with client_for(sessionmaker_for_test) as client:
        stats = (await client.get("/api/public/stats")).json()

    # NULL and physical are owned; the want is not; the private row is absent.
    assert stats["owned"] == 2
    assert stats["finished_this_year"] == 1
    # (8 + 5 + 6) / 3, to one decimal.
    assert stats["average_rating"] == 6.3
