"""weather.py: the NWS parser, the day view and the ride verdict.

The parser runs over a recorded answer (scripts/record_spot_fixtures.py
--weather); the verdict over built hours, since one recorded week is
rarely both dry and snowy.
"""

from __future__ import annotations

import json
from datetime import date, datetime, timedelta
from pathlib import Path

import httpx2
import pytest

import weather
from weather import (
    DENVER_TZ,
    Hour,
    WeatherError,
    clock,
    day_view,
    daytime,
    fetch_hourly,
    gridpoint_of,
    parse_periods,
    verdict,
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


def _day(temps=None, precip=None, wind=None, short="Sunny", day=SATURDAY):
    """The 13 daytime hours, 8 am to 8 pm, with per-hour overrides."""
    out = []
    for i, at in enumerate(range(8, 21)):
        out.append(
            _hour(
                at,
                temp=(temps or {}).get(at, 55),
                precip=(precip or {}).get(at, 0),
                wind=(wind or {}).get(at, 5),
                short=short if not callable(short) else short(at),
                day=day,
            )
        )
    return out


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


# --- the day and its verdict ---------------------------------------------------


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


def test_a_dry_day_names_its_window():
    # The mockup's Saturday: rideable 10a to 3p, cold before, windy after.
    hours = _day(temps={8: 40, 9: 44}, wind={h: 22 for h in range(15, 21)})
    assert verdict(hours) == {
        "state": "ok",
        "text": "Ride window 10a–3p",
        "window": [10, 15],
    }


def test_the_longest_run_wins_and_an_earlier_one_breaks_a_tie():
    hours = _day(precip={11: 60, 14: 60})  # 8-11, 12-14, 15-21
    assert verdict(hours)["window"] == [15, 21]
    hours = _day(precip={10: 60, 13: 60, 14: 60, 15: 60, 16: 60, 17: 60, 18: 60})
    assert verdict(hours)["window"] == [8, 10]  # ties 19-21, earlier wins


def test_a_snowy_day_names_the_snow():
    # The mockup's Sunday: cold all day, snow 10a to 5p.
    hours = _day(
        temps={h: 34 for h in range(8, 21)},
        precip={h: 80 for h in range(10, 17)},
        short=lambda h: "Snow" if 10 <= h < 17 else "Cloudy",
    )
    assert verdict(hours) == {
        "state": "warn",
        "text": "No ride window: snow from 10a",
        "window": None,
    }


def test_rain_is_rain():
    hours = _day(precip={h: 70 for h in range(8, 21)}, short="Chance Rain Showers")
    assert verdict(hours)["text"] == "No ride window: rain from 8a"


def test_a_null_probability_counts_as_dry():
    hours = _day(precip={h: None for h in range(8, 21)})
    assert verdict(hours)["state"] == "ok"


def test_precipitation_is_named_before_cold_and_wind():
    hours = _day(
        temps={h: 30 for h in range(8, 21)},
        wind={h: 30 for h in range(8, 21)},
        precip={14: 50},
    )
    assert verdict(hours)["text"] == "No ride window: rain from 2p"


def test_cold_all_day_names_the_high():
    hours = _day(temps={h: 30 + (h - 8) for h in range(8, 21)})
    assert verdict(hours)["text"] == "No ride window: too cold, 42° at best"


def test_cold_is_named_before_wind():
    hours = _day(
        temps={h: 40 for h in range(8, 15)}, wind={h: 25 for h in range(15, 21)}
    )
    assert verdict(hours)["text"] == "No ride window: too cold most of the day"


def test_wind_alone():
    hours = _day(wind={h: 25 for h in range(8, 21)})
    assert verdict(hours)["text"] == "No ride window: wind 20 mph or more"


def test_one_rideable_hour_is_not_a_window():
    hours = _day(wind={h: 25 for h in range(8, 21) if h != 12})
    assert verdict(hours)["state"] == "warn"


def test_the_thresholds_are_the_spec_s():
    edge = _day(
        temps={h: weather.VERDICT["min_temp_f"] for h in range(8, 21)},
        precip={h: weather.VERDICT["wet_pct"] - 1 for h in range(8, 21)},
        wind={h: weather.VERDICT["max_wind_mph"] - 1 for h in range(8, 21)},
    )
    assert verdict(edge)["window"] == [8, 21]


def test_no_hours_is_a_warning_not_an_error():
    assert verdict([]) == {
        "state": "warn",
        "text": "No forecast for this day yet",
        "window": None,
    }


def test_daytime_keeps_8am_to_8pm_on_the_day_in_denver():
    late = [_hour(h) for h in range(0, 24)]
    next_day = [_hour(9, day=SATURDAY + timedelta(days=1))]
    picked = daytime(late + next_day, SATURDAY)
    assert [h.starts_at.hour for h in picked] == list(range(8, 21))


def test_daytime_reads_utc_starts_in_denver_time():
    utc = Hour(datetime(2026, 11, 14, 15, tzinfo=weather.ZoneInfo("UTC")), 50, 0, 5, "")
    assert daytime([utc], SATURDAY) == [utc]  # 8 am in Denver


def test_the_day_view(hourly):
    hours = parse_periods(hourly)
    first_full = hours[0].starts_at.astimezone(DENVER_TZ).date() + timedelta(days=1)
    view = day_view(hours, first_full)
    assert view["date"] == first_full.isoformat()
    assert view["name"] == first_full.strftime("%A")
    assert len(view["hours"]) == 13
    assert [h["label"] for h in view["hours"]][:5] == ["8a", "9a", "10a", "11a", "noon"]
    assert view["low"] <= min(h["temp_f"] for h in view["hours"])
    assert view["high"] >= max(h["temp_f"] for h in view["hours"])
    assert view["verdict"]["state"] in {"ok", "warn"}
    assert view["summary"]


def test_a_day_past_the_forecast_has_no_bars():
    view = day_view([], SATURDAY)
    assert view["hours"] == [] and view["high"] is None
    assert view["verdict"]["state"] == "warn"
