"""weather.py: the NWS parser, the day window and the cached hours.

The parser runs over a recorded answer (fixtures/nws_*.json).
"""

from __future__ import annotations

import json
from datetime import UTC, date, datetime, timedelta
from pathlib import Path

import httpx2
import pytest

import weather
from weather import (
    DENVER_TZ,
    Hour,
    WeatherError,
    clock,
    fetch_hourly,
    gridpoint_of,
    parse_periods,
)

FIXTURES = Path(__file__).parent / "fixtures"
SATURDAY = date(2026, 11, 14)


@pytest.fixture
def hourly():
    return json.loads((FIXTURES / "nws_hourly.json").read_text())


@pytest.fixture
def points():
    return json.loads((FIXTURES / "nws_points.json").read_text())


def _hour(at: int, temp=55, precip=0, wind=5, short="Sunny", day=SATURDAY):
    start = datetime(day.year, day.month, day.day, at, tzinfo=DENVER_TZ)
    return Hour(start, temp, precip, wind, short)


# --- parse_periods -------------------------------------------------------------


def test_the_recorded_answer_parses_every_hour(hourly):
    hours = parse_periods(hourly)
    assert len(hours) == len(hourly["properties"]["periods"])
    first = hours[0]
    assert first.starts_at.tzinfo is not None
    assert isinstance(first.temp_f, int)
    assert isinstance(first.wind_mph, int)
    assert first.short


def _period(**overrides):
    base = {
        "startTime": "2026-11-14T10:00:00-07:00",
        "temperature": 50,
        "temperatureUnit": "F",
        "probabilityOfPrecipitation": {"unitCode": "wmoUnit:percent", "value": 10},
        "windSpeed": "5 mph",
        "shortForecast": "Sunny",
    }
    base.update(overrides)
    return {"properties": {"periods": [base]}}


def test_a_null_precipitation_probability_is_kept_as_none():
    (hour,) = parse_periods(_period(probabilityOfPrecipitation={"value": None}))
    assert hour.precip_pct is None


def test_a_missing_precipitation_block_is_none():
    payload = _period()
    del payload["properties"]["periods"][0]["probabilityOfPrecipitation"]
    (hour,) = parse_periods(payload)
    assert hour.precip_pct is None


@pytest.mark.parametrize(
    ("text", "mph"),
    [("5 mph", 5), ("10 to 15 mph", 15), ("Calm", 0), ("", 0), (None, 0), (12, 12)],
)
def test_wind_speed_strings(text, mph):
    (hour,) = parse_periods(_period(windSpeed=text))
    assert hour.wind_mph == mph


def test_a_celsius_temperature_is_converted():
    (hour,) = parse_periods(_period(temperature=10, temperatureUnit="C"))
    assert hour.temp_f == 50


def test_a_quantitative_temperature_is_read():
    value = {"unitCode": "wmoUnit:degC", "value": 0}
    (hour,) = parse_periods(_period(temperature=value))
    assert hour.temp_f == 32


@pytest.mark.parametrize(
    "overrides",
    [
        {"startTime": "not a time"},
        {"startTime": "2026-11-14T10:00:00"},  # no offset
        {"temperature": None},
        {"temperature": "warm"},
    ],
)
def test_an_unreadable_period_is_skipped(overrides):
    assert parse_periods(_period(**overrides)) == []


def test_an_odd_payload_parses_to_nothing():
    assert parse_periods({}) == []
    assert parse_periods({"properties": {"periods": None}}) == []
    assert parse_periods({"properties": {"periods": ["x", 3]}}) == []


def test_a_long_short_forecast_is_cut_to_the_column():
    (hour,) = parse_periods(_period(shortForecast="x" * 300))
    assert len(hour.short) == 120


# --- gridpoint and fetch -------------------------------------------------------


def test_the_gridpoint_comes_from_points(points):
    gridpoint, url = gridpoint_of(points)
    assert gridpoint.startswith(points["properties"]["gridId"] + "/")
    assert url == points["properties"]["forecastHourly"]


@pytest.mark.parametrize(
    "props",
    [
        {},
        {
            "forecastHourly": "https://evil.test/x",
            "gridId": "BOU",
            "gridX": 1,
            "gridY": 2,
        },
        {"forecastHourly": "https://api.weather.gov/x", "gridId": None},
    ],
)
def test_a_points_answer_without_a_forecast_is_refused(props):
    with pytest.raises(WeatherError):
        gridpoint_of({"properties": props})


def test_a_lookalike_host_is_refused():
    props = {
        "forecastHourly": "https://api.weather.gov.evil.test/x",
        "gridId": "BOU",
        "gridX": 1,
        "gridY": 2,
    }
    with pytest.raises(WeatherError):
        gridpoint_of({"properties": props})


def _client(responses, seen):
    answers = iter(responses)

    def handler(request):
        seen.append(request)
        return next(answers)

    return httpx2.AsyncClient(transport=httpx2.MockTransport(handler))


@pytest.mark.asyncio
async def test_fetch_resolves_points_then_reads_the_hourly_url(points, hourly):
    seen = []
    responses = [httpx2.Response(200, json=points), httpx2.Response(200, json=hourly)]
    async with _client(responses, seen) as client:
        gridpoint, payload = await fetch_hourly(client)
    assert payload == hourly
    assert gridpoint == gridpoint_of(points)[0]
    first, second = seen
    assert str(first.url) == "https://api.weather.gov/points/39.7392,-104.9903"
    assert str(second.url) == points["properties"]["forecastHourly"]
    assert first.headers["accept"] == "application/geo+json"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "response",
    [
        httpx2.Response(500),
        httpx2.Response(200, text="<html>"),
        httpx2.Response(200, json=[]),
    ],
)
async def test_fetch_raises_a_weather_error(response):
    async with _client([response], []) as client:
        with pytest.raises(WeatherError):
            await fetch_hourly(client)


@pytest.mark.asyncio
async def test_an_unreachable_nws_is_a_weather_error():
    def handler(request):
        raise httpx2.ConnectError("down", request=request)

    async with httpx2.AsyncClient(transport=httpx2.MockTransport(handler)) as client:
        with pytest.raises(WeatherError, match="could not be reached"):
            await fetch_hourly(client)


# --- the two words the Closet reads hours with ---------------------------------


@pytest.mark.parametrize(
    ("hour", "text"),
    [
        (0, "midnight"),
        (8, "8a"),
        (12, "noon"),
        (15, "3p"),
        (20, "8p"),
        (24, "midnight"),
    ],
)
def test_clock(hour, text):
    assert clock(hour) == text


def test_an_hour_is_wet_at_forty_percent_and_a_null_counts_as_dry():
    assert weather.is_wet(_hour(9, precip=40))
    assert not weather.is_wet(_hour(9, precip=39))
    assert not weather.is_wet(_hour(9, precip=None))


# --- The cached hours' day window -------------------------------------------


@pytest.mark.parametrize(
    ("first", "last", "start_utc", "hours"),
    [
        # An ordinary November day: Denver midnight is 07:00 UTC, 24 hours.
        (date(2026, 11, 14), None, datetime(2026, 11, 14, 7, tzinfo=UTC), 24),
        # A summer day under MDT: midnight is 06:00 UTC.
        (date(2026, 7, 4), None, datetime(2026, 7, 4, 6, tzinfo=UTC), 24),
        # The spring-forward day is 23 hours, the fall-back day 25.
        (date(2026, 3, 8), None, datetime(2026, 3, 8, 7, tzinfo=UTC), 23),
        (date(2026, 11, 1), None, datetime(2026, 11, 1, 6, tzinfo=UTC), 25),
        # A weekend: Saturday's midnight to Monday's.
        (
            date(2026, 11, 14),
            date(2026, 11, 15),
            datetime(2026, 11, 14, 7, tzinfo=UTC),
            48,
        ),
    ],
)
def test_the_day_window_is_the_denver_day(first, last, start_utc, hours):
    start, end = weather.day_window(first, last)
    assert start == start_utc
    assert end.astimezone(UTC) - start.astimezone(UTC) == timedelta(hours=hours)
    assert start.astimezone(DENVER_TZ).hour == 0
    assert end.astimezone(DENVER_TZ).hour == 0


@pytest.mark.asyncio
async def test_hours_for_day_reads_the_latest_gridpoint_s_denver_day(
    sessionmaker_for_test,
):
    from models import WeatherHour

    friday_late = datetime(2026, 11, 13, 23, tzinfo=DENVER_TZ)
    saturday = [datetime(2026, 11, 14, h, tzinfo=DENVER_TZ) for h in (0, 8, 23)]
    sunday_early = datetime(2026, 11, 15, 0, tzinfo=DENVER_TZ)
    older = datetime(2026, 11, 10, tzinfo=UTC)
    newer = datetime(2026, 11, 11, tzinfo=UTC)
    async with sessionmaker_for_test() as session:
        for at in [friday_late, *saturday, sunday_early]:
            session.add(
                WeatherHour(
                    gridpoint="NEW",
                    starts_at=at,
                    temp_f=40,
                    precip_pct=None,
                    wind_mph=3,
                    short="Clear",
                    fetched_at=newer,
                )
            )
        session.add(
            WeatherHour(
                gridpoint="OLD",
                starts_at=saturday[1],
                temp_f=99,
                precip_pct=0,
                wind_mph=0,
                short="Hot",
                fetched_at=older,
            )
        )
        await session.commit()
        hours = await weather.hours_for_day(session, SATURDAY)
    assert [h.starts_at for h in hours] == saturday
    assert {h.temp_f for h in hours} == {40}


@pytest.mark.asyncio
async def test_hours_for_day_is_empty_before_any_fetch(sessionmaker_for_test):
    async with sessionmaker_for_test() as session:
        assert await weather.hours_for_day(session, SATURDAY) == []
