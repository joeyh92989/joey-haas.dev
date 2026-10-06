"""No credential reaches the logs through the HTTP client's request lines."""

import logging

import httpx2
import pytest

from config import configure_logging


@pytest.mark.asyncio
async def test_no_query_string_key_reaches_the_logs(caplog):
    # httpx2 logs each request URL at INFO. ComicVine's api_key and the Twitch
    # client secret travel as query parameters; at INFO both were written to
    # Render's logs.
    configure_logging()
    caplog.set_level(logging.INFO)
    transport = httpx2.MockTransport(lambda request: httpx2.Response(200, json={}))
    async with httpx2.AsyncClient(transport=transport) as client:
        await client.get(
            "https://comicvine.gamespot.com/api/search/",
            params={"api_key": "SECRET-COMICVINE-KEY"},
        )
        await client.post(
            "https://id.twitch.tv/oauth2/token",
            params={"client_secret": "SECRET-TWITCH-SECRET"},
        )
    assert "SECRET-COMICVINE-KEY" not in caplog.text
    assert "SECRET-TWITCH-SECRET" not in caplog.text
