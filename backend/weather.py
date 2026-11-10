"""The weekend planner's weather: the NWS hourly forecast and its verdict.

Two halves. `fetch_hourly` resolves the downtown gridpoint through
`/points` and reads its `forecastHourly` URL with the caller's client (the
catalogue's, for its identifying User-Agent, which NWS requires). The rest
is pure: `parse_periods` turns NWS periods into `Hour`s, `day_view` picks
one Denver day's 8 am to 8 pm, and `verdict` names the ride window or the
blocker. No FastAPI and no SQLAlchemy in the import graph --
tests/test_physical_imports.py holds it to that -- and only the job route
calls `fetch_hourly`: nothing on a page's request path reaches NWS.

`hours_for_day` is the one read of the cached `weather_hours`, shared by
the weekend planner and Closet's Today. It takes the caller's session and
imports SQLAlchemy and the model inside the function, so importing this
module still loads neither.

Spec and plan: docs/planning/2026-11-08-denver-spots-design.md.
"""

from __future__ import annotations

import re
from collections import Counter
from collections.abc import Iterable
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

# The verdict's rules, in one place (spec: Key decisions, Weather verdict
# rules). Hours `first_hour` to `last_hour` inclusive are the day's 13 bars;
# an hour is rideable at `min_temp_f` or warmer, below `wet_pct`
# precipitation probability (a null one counts as 0), and below
# `max_wind_mph`. The longest rideable run of `min_window_hours` or more is
# the window.
VERDICT = {
    "first_hour": 8,
    "last_hour": 20,
    "min_temp_f": 45,
    "wet_pct": 40,
    "max_wind_mph": 20,
    "min_window_hours": 2,
}


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


# --- One day, and its verdict ------------------------------------------------


def _local(hour: Hour) -> datetime:
    return hour.starts_at.astimezone(DENVER_TZ)


def _rideable(hour: Hour) -> bool:
    return (
        hour.temp_f >= VERDICT["min_temp_f"]
        and (hour.precip_pct or 0) < VERDICT["wet_pct"]
        and hour.wind_mph < VERDICT["max_wind_mph"]
    )


def is_wet(hour: Hour) -> bool:
    return (hour.precip_pct or 0) >= VERDICT["wet_pct"]


def clock(hour: int) -> str:
    """8 -> "8a", 12 -> "noon", 15 -> "3p", 0 or 24 -> "midnight"."""
    hour %= 24
    if hour == 0:
        return "midnight"
    if hour == 12:
        return "noon"
    return f"{hour}a" if hour < 12 else f"{hour - 12}p"


def daytime(hours: Iterable[Hour], day: date) -> list[Hour]:
    """`day`'s hours from 8 am to 8 pm, Denver time, in order."""
    first, last = VERDICT["first_hour"], VERDICT["last_hour"]
    picked = [
        h for h in hours if _local(h).date() == day and first <= _local(h).hour <= last
    ]
    return sorted(picked, key=lambda h: h.starts_at)


def _window(hours: list[Hour]) -> tuple[int, int] | None:
    """The longest run of rideable consecutive hours, as (start, end) local
    hours with `end` the hour the run stops; the earlier run wins a tie."""
    best: tuple[int, int] | None = None
    start: int | None = None
    previous: int | None = None
    for hour in [*hours, None]:
        local = _local(hour).hour if hour is not None else None
        ok = hour is not None and _rideable(hour)
        if ok and start is not None and previous is not None and local == previous + 1:
            previous = local
            continue
        if start is not None and previous is not None:
            if best is None or previous + 1 - start > best[1] - best[0]:
                best = (start, previous + 1)
        start, previous = (local, local) if ok else (None, None)
    return best


def _precip_word(hour: Hour) -> str:
    return "snow" if "snow" in hour.short.lower() else "rain"


def _blocker(hours: list[Hour]) -> str:
    """What rules the day out, precipitation first, then cold, then wind."""
    wet = [h for h in hours if is_wet(h)]
    if wet:
        return f"{_precip_word(wet[0])} from {clock(_local(wet[0]).hour)}"
    if all(h.temp_f < VERDICT["min_temp_f"] for h in hours):
        return f"too cold, {max(h.temp_f for h in hours)}° at best"
    if any(h.temp_f < VERDICT["min_temp_f"] for h in hours):
        return "too cold some of the day"
    # Nothing wet and nothing cold leaves wind as the only thing `_rideable`
    # refuses, so it is the blocker by elimination.
    return f"wind {VERDICT['max_wind_mph']} mph or more"


def verdict(hours: list[Hour]) -> dict:
    """`{state, text, window}` for one day's 8 am to 8 pm hours.

    `ok` names the longest rideable run of two hours or more ("Ride window
    10a–3p"); `warn` names what blocks the day. `window` is `[start, end]`
    in local hours, or null.
    """
    if not hours:
        return {"state": "warn", "text": "No forecast for this day yet", "window": None}
    window = _window(hours)
    if window and window[1] - window[0] >= VERDICT["min_window_hours"]:
        text = f"Ride window {clock(window[0])}–{clock(window[1])}"
        return {"state": "ok", "text": text, "window": list(window)}
    return {
        "state": "warn",
        "text": f"No ride window: {_blocker(hours)}",
        "window": None,
    }


def day_view(hours: Iterable[Hour], day: date) -> dict:
    """What the page draws for one day: the 13 bars, high and low over the
    whole local day, the commonest daytime forecast, and the verdict."""
    hours = list(hours)
    whole = [h for h in hours if _local(h).date() == day]
    bars = daytime(hours, day)
    summary = Counter(h.short for h in bars if h.short).most_common(1)
    return {
        "date": day.isoformat(),
        "name": day.strftime("%A"),
        "high": max((h.temp_f for h in whole), default=None),
        "low": min((h.temp_f for h in whole), default=None),
        "summary": summary[0][0] if summary else None,
        "hours": [
            {
                "hour": _local(h).hour,
                "label": clock(_local(h).hour),
                "temp_f": h.temp_f,
                "precip_pct": h.precip_pct,
                "wind_mph": h.wind_mph,
                "wet": is_wet(h),
                "rideable": _rideable(h),
            }
            for h in bars
        ],
        "verdict": verdict(bars),
    }
