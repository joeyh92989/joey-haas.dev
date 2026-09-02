"""The shared source contract: error types, throttling, and date parsing."""

import asyncio

import pytest

from sources.base import (
    SourceError,
    SourceNotConfigured,
    SourceRateLimited,
    Throttle,
    year_from_date,
)


def test_not_configured_is_a_source_error_naming_its_source():
    error = SourceNotConfigured("tmdb", "TMDB_API_TOKEN is not set")
    assert isinstance(error, SourceError)
    assert error.source == "tmdb"
    assert "TMDB_API_TOKEN" in str(error)


def test_rate_limited_is_a_source_error():
    assert isinstance(SourceRateLimited("bgg", "429"), SourceError)


def test_year_from_date_handles_the_shapes_sources_actually_return():
    assert year_from_date("1999-03-31") == 1999
    assert year_from_date("1999") == 1999
    assert year_from_date(1999) == 1999
    assert year_from_date("") is None
    assert year_from_date(None) is None
    # Missing data, not a crash: one unparseable release date must not fail a
    # 200-item import.
    assert year_from_date("not a date") is None


@pytest.mark.asyncio
async def test_throttle_spaces_calls_by_at_least_the_interval():
    throttle = Throttle(min_interval=0.05)
    loop = asyncio.get_running_loop()

    await throttle.wait()
    first = loop.time()
    await throttle.wait()

    assert loop.time() - first >= 0.05


@pytest.mark.asyncio
async def test_throttle_serialises_concurrent_callers():
    # Three callers racing must still be spaced. This is what stops BGG seeing
    # a burst when one import happens to resolve several board games.
    throttle = Throttle(min_interval=0.05)
    loop = asyncio.get_running_loop()
    started = loop.time()

    await asyncio.gather(*(throttle.wait() for _ in range(3)))

    assert loop.time() - started >= 0.10
