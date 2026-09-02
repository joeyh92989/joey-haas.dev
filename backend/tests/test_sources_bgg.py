"""BGG is registered but unavailable. These tests pin why, so the reason
survives as something checked rather than as a comment nobody reads.
"""

import pytest

from config import Config
from models import ItemType
from sources.base import SourceNotConfigured
from sources.bgg import REGISTRATION_URL, BggSource
from sources.registry import adapter_for, build_registry, configured_sources


def _config(**overrides) -> Config:
    base = dict(
        google_client_id="x",
        google_client_secret="x",
        session_secret="x",
        admin_email="x@example.com",
        frontend_url="http://localhost:5173",
        database_url="postgresql://x",
        database_url_direct="postgresql://x",
    )
    return Config(**{**base, **overrides})


def test_bgg_reports_itself_unconfigured_even_with_a_token():
    # A token alone is not enough: the response parsing is deliberately
    # unwritten, so claiming to be configured would turn a clear
    # "unavailable" into methods that raise, i.e. a 502.
    assert BggSource(_config()).configured() is False
    assert BggSource(_config(bgg_token="a-token")).configured() is False


@pytest.mark.asyncio
async def test_searching_explains_the_registration_requirement():
    with pytest.raises(SourceNotConfigured) as excinfo:
        await BggSource(_config()).search("Gloomhaven")

    message = str(excinfo.value)
    assert "BGG_TOKEN" in message
    assert REGISTRATION_URL in message


@pytest.mark.asyncio
async def test_fetching_explains_it_too():
    with pytest.raises(SourceNotConfigured):
        await BggSource(_config()).fetch("174430")


def test_board_games_resolve_to_bgg_rather_than_reporting_no_source():
    # Registered in the registry on purpose. Omitting it would report board
    # games as an unimplemented type, which is the wrong diagnosis: the source
    # exists and is blocked on registration.
    registry = build_registry(_config())
    with pytest.raises(SourceNotConfigured) as excinfo:
        adapter_for(registry, ItemType.BOARDGAME)
    assert "bgg" in str(excinfo.value)


def test_bgg_never_appears_in_the_configured_sources_log():
    assert "bgg" not in configured_sources(build_registry(_config(bgg_token="t")))
