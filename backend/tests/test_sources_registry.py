"""Registry dispatch and the lazy configuration check."""

import pytest

from config import Config
from models import ItemType
from sources.base import SourceNotConfigured
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


def test_movies_dispatch_to_tmdb():
    registry = build_registry(_config(tmdb_api_token="token"))
    assert adapter_for(registry, ItemType.MOVIE).source_name == "tmdb"


def test_an_unconfigured_adapter_raises_naming_the_source():
    registry = build_registry(_config())
    with pytest.raises(SourceNotConfigured) as excinfo:
        adapter_for(registry, ItemType.MOVIE)
    assert "tmdb" in str(excinfo.value)


def test_an_unimplemented_type_raises_rather_than_key_erroring():
    # Until the remaining adapters land, asking for a comic must explain
    # itself. A KeyError here would say only "comic", which is the least
    # useful half of the problem.
    registry = build_registry(_config(tmdb_api_token="token"))
    with pytest.raises(SourceNotConfigured) as excinfo:
        adapter_for(registry, ItemType.COMIC)
    assert "comic" in str(excinfo.value)


def test_configured_sources_lists_only_those_with_credentials():
    assert configured_sources(build_registry(_config())) == []
    assert configured_sources(build_registry(_config(tmdb_api_token="t"))) == ["tmdb"]
