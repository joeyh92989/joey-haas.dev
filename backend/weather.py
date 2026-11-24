"""The cached NWS hourly forecast: fetch, parse, and read back by Denver day.

Two halves. `fetch_hourly` resolves the downtown gridpoint through
`/points` and reads its `forecastHourly` URL with the caller's client (the
catalogue's, for its identifying User-Agent, which NWS requires). The rest
is pure: `parse_periods` turns NWS periods into `Hour`s, and `is_wet` and
`clock` are the two words the Closet's Today reads them with. No FastAPI and
no SQLAlchemy in the import graph -- tests/test_physical_imports.py holds it
to that -- and only the job route (`weather_routes.py`) calls
`fetch_hourly`: nothing on a page's request path reaches NWS.

`hours_for_day` is the one read of the cached `weather_hours`, used by the
Closet's Today. It takes the caller's session and imports SQLAlchemy and the
model inside the function, so importing this module still loads neither.

The recorded answers in tests/fixtures/nws_*.json were recorded by hand from
api.weather.gov; there is no recorder script.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

import httpx2

NWS_BASE = "https://api.weather.gov"
# Denver's downtown, resolved to a gridpoint on every run: the NWS docs ask
# callers to re-check /points rather than pin a gridpoint.
DOWNTOWN = (39.7392, -104.9903)
DENVER_TZ = ZoneInfo("America/Denver")
REQUEST_TIMEOUT_SECONDS = 30.0

# An hour is wet at this precipitation probability or more (a null one
# counts as 0).
WET_PCT = 40


class WeatherError(Exception):
    """NWS could not be reached or answered something unreadable."""


@dataclass(frozen=True)
class Hour:
    starts_at: datetime  # timezone-aware
    temp_f: int
    precip_pct: int | None
    wind_mph: int
    short: str


def _number(value: object) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int | float):
        return float(value)
    if isinstance(value, dict):
        return _number(value.get("value"))
    return None


def _temperature_f(period: dict) -> int | None:
    raw = period.get("temperature")
    value = _number(raw)
    if value is None:
        return None
    unit = period.get("temperatureUnit")
    if isinstance(raw, dict):
        unit = "C" if "degC" in str(raw.get("unitCode") or "") else "F"
    if unit == "C":
        value = value * 9 / 5 + 32
    return round(value)


_SPEED = re.compile(r"\d+(?:\.\d+)?")


def _wind_mph(text: object) -> int:
    """The top of "5 mph" or "10 to 15 mph"; 0 for "Calm" or anything else
    without a number, since the hour still has to be drawn."""
    if isinstance(text, int | float) and not isinstance(text, bool):
        return round(text)
    numbers = [float(n) for n in _SPEED.findall(str(text or ""))]
    if not numbers:
        return 0
    top = max(numbers)
    if "km" in str(text).lower():
        top = top / 1.609344
    return round(top)


def _precip(period: dict) -> int | None:
    value = _number(period.get("probabilityOfPrecipitation"))
    return None if value is None else max(0, min(100, round(value)))


def parse_periods(payload: dict) -> list[Hour]:
    """The hourly periods NWS sent, in its order. A period with no readable
    start or temperature is skipped, never an error."""
    properties = payload.get("properties") if isinstance(payload, dict) else None
    periods = (properties or {}).get("periods") or []
    hours: list[Hour] = []
    for period in periods:
        if not isinstance(period, dict):
            continue
        try:
            starts_at = datetime.fromisoformat(str(period.get("startTime")))
        except ValueError:
            continue
        temp = _temperature_f(period)
        if starts_at.tzinfo is None or temp is None:
            continue
        hours.append(
            Hour(
                starts_at=starts_at,
                temp_f=temp,
                precip_pct=_precip(period),
                wind_mph=_wind_mph(period.get("windSpeed")),
                short=str(period.get("shortForecast") or "").strip()[:120],
            )
        )
    return hours


def gridpoint_of(points: dict) -> tuple[str, str]:
    """`("BOU/63,62", forecastHourly URL)` from a /points answer."""
    props = (points or {}).get("properties") or {}
    url = props.get("forecastHourly")
    grid = props.get("gridId")
    x, y = props.get("gridX"), props.get("gridY")
    if not isinstance(url, str) or not url.startswith(NWS_BASE + "/"):
        raise WeatherError("NWS's /points answer had no hourly forecast URL")
    if not isinstance(grid, str) or not isinstance(x, int) or not isinstance(y, int):
        raise WeatherError("NWS's /points answer had no gridpoint")
    return f"{grid}/{x},{y}", url


async def _get_json(client: httpx2.AsyncClient, url: str) -> dict:
    try:
        response = await client.get(
            url,
            headers={"Accept": "application/geo+json"},
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
    except httpx2.HTTPError as error:
        raise WeatherError(
            f"NWS could not be reached ({type(error).__name__})"
        ) from error
    if response.status_code != 200:
        raise WeatherError(f"NWS answered {response.status_code}")
    try:
        payload = response.json()
    except ValueError as error:
        raise WeatherError("NWS's answer was not JSON") from error
    if not isinstance(payload, dict):
        raise WeatherError("NWS's answer was not an object")
    return payload


async def fetch_hourly(
    client: httpx2.AsyncClient,
    lat: float = DOWNTOWN[0],
    lng: float = DOWNTOWN[1],
) -> tuple[str, dict]:
    """`(gridpoint, hourly payload)`: /points first, then its forecastHourly.

    Raises `WeatherError` for a failure at either step.
    """
    points = await _get_json(client, f"{NWS_BASE}/points/{lat:.4f},{lng:.4f}")
    gridpoint, url = gridpoint_of(points)
    return gridpoint, await _get_json(client, url)


# --- The cached hours ---------------------------------------------------------


def day_window(first: date, last: date | None = None) -> tuple[datetime, datetime]:
    """`[start, end)` covering Denver days `first` to `last` inclusive:
    local midnight to the next local midnight, so a DST day is 23 or 25
    hours long rather than a UTC day."""
    end_day = (last or first) + timedelta(days=1)
    return (
        datetime.combine(first, time(), DENVER_TZ),
        datetime.combine(end_day, time(), DENVER_TZ),
    )


async def hours_for_day(session, day: date, last: date | None = None) -> list[Hour]:
    """The cached hours for Denver day `day` (through `last` when given),
    from the gridpoint fetched last, in time order; [] before any fetch."""
    from sqlalchemy import select

    from models import WeatherHour

    latest = await session.scalar(
        select(WeatherHour.gridpoint).order_by(WeatherHour.fetched_at.desc()).limit(1)
    )
    if latest is None:
        return []
    start, end = day_window(day, last)
    rows = await session.scalars(
        select(WeatherHour)
        .where(
            WeatherHour.gridpoint == latest,
            WeatherHour.starts_at >= start,
            WeatherHour.starts_at < end,
        )
        .order_by(WeatherHour.starts_at)
    )
    return [
        Hour(r.starts_at, r.temp_f, r.precip_pct, r.wind_mph, r.short) for r in rows
    ]


def is_wet(hour: Hour) -> bool:
    return (hour.precip_pct or 0) >= WET_PCT


def clock(hour: int) -> str:
    """8 -> "8a", 12 -> "noon", 15 -> "3p", 0 or 24 -> "midnight"."""
    hour %= 24
    if hour == 0:
        return "midnight"
    if hour == 12:
        return "noon"
    return f"{hour}a" if hour < 12 else f"{hour - 12}p"
