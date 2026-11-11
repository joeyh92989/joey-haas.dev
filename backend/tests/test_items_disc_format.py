"""A movie's best disc (`items.disc_format`, intake spec D1).

Movies only: any other type is refused with a 422, as the comic fields are.
"""

import pytest

from tests.test_items import client_for

pytestmark = pytest.mark.asyncio


async def test_a_movie_keeps_its_disc_format(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test, signed_in=True) as client:
        created = await client.post(
            "/api/items",
            json={
                "type": "movie",
                "title": "Heat",
                "status": "backlog",
                "disc_format": "bluray",
            },
        )
        assert created.status_code == 201, created.text
        assert created.json()["disc_format"] == "bluray"

        item_id = created.json()["id"]
        url = f"/api/items/{item_id}"
        patched = await client.patch(url, json={"disc_format": "uhd"})
        assert patched.status_code == 200, patched.text
        assert patched.json()["disc_format"] == "uhd"

        cleared = await client.patch(url, json={"disc_format": None})
        assert cleared.status_code == 200, cleared.text
        assert cleared.json()["disc_format"] is None


async def test_disc_format_is_refused_on_a_game(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test, signed_in=True) as client:
        created = await client.post(
            "/api/items",
            json={
                "type": "game",
                "title": "Hades",
                "status": "backlog",
                "disc_format": "dvd",
            },
        )
        assert created.status_code == 422, created.text
        assert "movies only" in created.text

        game = await client.post(
            "/api/items", json={"type": "game", "title": "Hades", "status": "backlog"}
        )
        assert game.status_code == 201, game.text
        patched = await client.patch(
            f"/api/items/{game.json()['id']}", json={"disc_format": "dvd"}
        )
        assert patched.status_code == 422, patched.text
        assert "movies only" in patched.text
