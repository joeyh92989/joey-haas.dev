"""Game tags are written with the item, and the owner's edits are kept.

Tags come from the IGDB snapshot through tags.game_tags: on create, on bulk
create, on refresh (single and bulk) and by the one-off backfill. Comics are
tagged by their own job (test_comic_tags_job.py), never here. A row whose
tags the owner saved (tags_edited) is never regenerated.
"""

from contextlib import asynccontextmanager

import pytest
from fastapi import FastAPI
from httpx2 import ASGITransport, AsyncClient
from sqlalchemy import select
from starlette.middleware.sessions import SessionMiddleware

from items import JOB_ROUTES, create_items_router
from models import Item, ItemStatus, ItemType
from sources.base import SourceDetail

pytestmark = pytest.mark.asyncio

SHOOTER = {"genres": ["Shooter", "Adventure"], "themes": ["Science fiction"]}
SHOOTER_TAGS = [
    {"group": "play_style", "tag": "shooter"},
    {"group": "setting", "tag": "sci-fi"},
]


class StubIgdb:
    source_name = "igdb"
    item_type = ItemType.GAME

    def __init__(self, snapshot: dict):
        self._snapshot = snapshot

    def configured(self) -> bool:
        return True

    async def search(self, query, year=None, platform=None):
        return []

    def _detail(self, external_id):
        return SourceDetail(
            external_id=external_id,
            title="ignored",
            year=2026,
            creator="Studio",
            cover_url=None,
            source_metadata=self._snapshot,
        )

    async def fetch(self, external_id):
        return self._detail(external_id)

    async def fetch_many(self, external_ids):
        return [self._detail(i) for i in external_ids]


@asynccontextmanager
async def client_for(factory, registry=None, signed_in: bool = True):
    app = FastAPI()
    app.include_router(create_items_router(factory, registry))

    if signed_in:

        @app.middleware("http")
        async def _sign_in(request, call_next):
            request.session["user"] = {"sub": "1", "email": "admin@example.com"}
            return await call_next(request)

    app.add_middleware(SessionMiddleware, secret_key="test-secret", https_only=False)
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        yield client


async def _rows(factory) -> dict[str, Item]:
    async with factory() as session:
        return {row.title: row for row in await session.scalars(select(Item))}


def _game(title: str, **fields) -> dict:
    return {
        "type": "game",
        "title": title,
        "status": "backlog",
        "owned_format": "physical",
        **fields,
    }


async def test_a_created_game_is_tagged_from_its_snapshot(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        response = await client.post(
            "/api/items", json=_game("Doom", source_metadata=SHOOTER)
        )
    assert response.status_code == 201
    assert response.json()["tags"] == SHOOTER_TAGS
    assert response.json()["tags_edited"] is False


async def test_a_game_with_no_snapshot_and_a_comic_start_untagged(
    sessionmaker_for_test,
):
    async with client_for(sessionmaker_for_test) as client:
        manual = await client.post("/api/items", json=_game("Manual"))
        comic = await client.post(
            "/api/items",
            json={
                "type": "comic",
                "title": "Series",
                "status": "backlog",
                "source_metadata": SHOOTER,
            },
        )
    assert manual.json()["tags"] == []
    assert comic.json()["tags"] == []


async def test_bulk_create_tags_games_and_leaves_other_types_empty(
    sessionmaker_for_test,
):
    async with client_for(sessionmaker_for_test) as client:
        response = await client.post(
            "/api/items/bulk",
            json={
                "items": [
                    _game("Doom", source_metadata=SHOOTER),
                    _game("Bare"),
                    {
                        "type": "movie",
                        "title": "Dune",
                        "status": "backlog",
                        "owned_format": "physical",
                    },
                ]
            },
        )
    assert response.status_code == 201
    rows = await _rows(sessionmaker_for_test)
    assert rows["Doom"].tags == SHOOTER_TAGS
    assert rows["Bare"].tags == [] and rows["Dune"].tags == []


async def test_the_owner_saves_tags_and_that_sets_tags_edited(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        made = (
            await client.post("/api/items", json=_game("Doom", source_metadata=SHOOTER))
        ).json()
        response = await client.patch(
            f"/api/items/{made['id']}",
            json={
                "tags": [
                    {"group": "tone", "tag": "comedy"},
                    {"group": "play_style", "tag": "puzzle"},
                ]
            },
        )
    assert response.status_code == 200
    assert response.json()["tags"] == [
        {"group": "play_style", "tag": "puzzle"},
        {"group": "tone", "tag": "comedy"},
    ]
    assert response.json()["tags_edited"] is True


async def test_an_empty_save_is_an_edit_too(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        made = (
            await client.post("/api/items", json=_game("Doom", source_metadata=SHOOTER))
        ).json()
        response = await client.patch(f"/api/items/{made['id']}", json={"tags": []})
    assert (response.json()["tags"], response.json()["tags_edited"]) == ([], True)


@pytest.mark.parametrize(
    "body",
    [
        {"tags": [{"group": "genre", "tag": "horror"}]},
        {"tags": [{"group": "tone", "tag": "western"}]},
        {"tags": [{"group": "tone", "tag": "drama", "extra": 1}, {"group": "x"}]},
        {"tags": None},
    ],
)
async def test_a_tag_outside_the_vocabulary_is_a_422(sessionmaker_for_test, body):
    async with client_for(sessionmaker_for_test) as client:
        made = (await client.post("/api/items", json=_game("Doom"))).json()
        response = await client.patch(f"/api/items/{made['id']}", json=body)
    assert response.status_code == 422


async def test_a_game_cannot_take_a_comic_tag_and_a_movie_takes_none(
    sessionmaker_for_test,
):
    async with client_for(sessionmaker_for_test) as client:
        movie = (
            await client.post(
                "/api/items",
                json={"type": "movie", "title": "Dune", "status": "backlog"},
            )
        ).json()
        response = await client.patch(
            f"/api/items/{movie['id']}",
            json={"tags": [{"group": "tone", "tag": "comedy"}]},
        )
    assert response.status_code == 422


async def test_a_refresh_retags_an_unedited_game_and_keeps_an_edited_one(
    sessionmaker_for_test,
):
    registry = {ItemType.GAME: StubIgdb(SHOOTER)}
    async with client_for(sessionmaker_for_test, registry) as client:
        plain = (
            await client.post(
                "/api/items",
                json=_game("Plain", external_source="igdb", external_id="1"),
            )
        ).json()
        edited = (
            await client.post(
                "/api/items",
                json=_game("Edited", external_source="igdb", external_id="2"),
            )
        ).json()
        await client.patch(
            f"/api/items/{edited['id']}",
            json={"tags": [{"group": "tone", "tag": "drama"}]},
        )
        one = await client.post(f"/api/items/{plain['id']}/refresh-metadata")
        two = await client.post(f"/api/items/{edited['id']}/refresh-metadata")
    assert one.json()["tags"] == SHOOTER_TAGS
    assert two.json()["tags"] == [{"group": "tone", "tag": "drama"}]


async def test_a_bulk_refresh_retags_unedited_games_only(sessionmaker_for_test):
    registry = {ItemType.GAME: StubIgdb(SHOOTER)}
    async with client_for(sessionmaker_for_test, registry) as client:
        for title, external_id in (("Plain", "1"), ("Edited", "2")):
            await client.post(
                "/api/items",
                json=_game(title, external_source="igdb", external_id=external_id),
            )
        rows = await _rows(sessionmaker_for_test)
        await client.patch(
            f"/api/items/{rows['Edited'].id}",
            json={"tags": [{"group": "tone", "tag": "drama"}]},
        )
        response = await client.post("/api/items/refresh-metadata/bulk?type=game")
    assert response.status_code == 200
    rows = await _rows(sessionmaker_for_test)
    assert rows["Plain"].tags == SHOOTER_TAGS
    assert rows["Edited"].tags == [{"group": "tone", "tag": "drama"}]


# --- The backfill ------------------------------------------------------------


async def _seed(factory, *rows: Item) -> None:
    async with factory() as session:
        session.add_all(rows)
        await session.commit()


def _row(title, **fields) -> Item:
    return Item(
        type=fields.pop("type", ItemType.GAME),
        title=title,
        status=ItemStatus.BACKLOG,
        **fields,
    )


async def test_the_backfill_tags_games_skips_edited_and_is_idempotent(
    sessionmaker_for_test,
):
    await _seed(
        sessionmaker_for_test,
        _row("Public", is_public=True, source_metadata=SHOOTER),
        _row("Private", source_metadata=SHOOTER),
        _row(
            "Edited",
            is_public=True,
            source_metadata=SHOOTER,
            tags=[{"group": "tone", "tag": "drama"}],
            tags_edited=True,
        ),
        _row("Bare", is_public=True),
        _row("Comic", type=ItemType.COMIC, source_metadata=SHOOTER),
    )
    async with client_for(sessionmaker_for_test) as client:
        first = await client.post("/api/items/tags/backfill")
        second = await client.post("/api/items/tags/backfill")

    assert first.status_code == 200
    assert first.json() == {
        "games": 4,
        "changed": 2,
        "skipped_edited": 1,
        "untagged": 1,
        "by_tag": {
            "play_style": {"shooter": 1},
            "setting": {"sci-fi": 1},
            "tone": {"drama": 1},
        },
    }
    assert second.json()["changed"] == 0
    rows = await _rows(sessionmaker_for_test)
    assert rows["Public"].tags == SHOOTER_TAGS
    assert rows["Private"].tags == SHOOTER_TAGS
    assert rows["Edited"].tags == [{"group": "tone", "tag": "drama"}]
    assert rows["Comic"].tags == []


async def test_the_backfill_is_admin_only_and_not_a_job_route(sessionmaker_for_test):
    assert ("POST", "/api/items/tags/backfill") not in JOB_ROUTES
    async with client_for(sessionmaker_for_test, signed_in=False) as client:
        response = await client.post("/api/items/tags/backfill")
    assert response.status_code == 401


async def test_changing_type_rederives_tags_and_clears_the_edit(sessionmaker_for_test):
    registry = {}
    async with client_for(sessionmaker_for_test, registry) as client:
        made = (
            await client.post("/api/items", json=_game("Doom", source_metadata=SHOOTER))
        ).json()
        await client.patch(
            f"/api/items/{made['id']}",
            json={"tags": [{"group": "tone", "tag": "drama"}]},
        )
        movie = await client.patch(f"/api/items/{made['id']}", json={"type": "movie"})
        back = await client.patch(f"/api/items/{made['id']}", json={"type": "game"})
    assert (movie.json()["tags"], movie.json()["tags_edited"]) == ([], False)
    assert (back.json()["tags"], back.json()["tags_edited"]) == (SHOOTER_TAGS, False)


async def test_a_type_change_that_sends_tags_keeps_those_tags(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        made = (await client.post("/api/items", json=_game("Doom"))).json()
        response = await client.patch(
            f"/api/items/{made['id']}",
            json={"type": "game", "tags": [{"group": "tone", "tag": "drama"}]},
        )
    assert response.json()["tags"] == [{"group": "tone", "tag": "drama"}]
    assert response.json()["tags_edited"] is True
