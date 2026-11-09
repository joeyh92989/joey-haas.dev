"""Records live Overpass and NWS answers as the spots' test fixtures.

Run from backend/ in any checkout or worktree:

    ./.venv/bin/python scripts/record_spot_fixtures.py            # Overpass
    ./.venv/bin/python scripts/record_spot_fixtures.py --weather  # NWS

With `--weather` it records the planner's NWS calls instead: `/points` for
downtown and the `forecastHourly` answer it points at, to
`tests/fixtures/nws_points.json` and `tests/fixtures/nws_hourly.json`.

It sends the finder's own query (`spot_sources.overpass.build_query`)
around Denver Union Station, with a smaller radius than the job's so the
fixture stays small, and writes the answer unedited to
`tests/fixtures/overpass_candidates.json`. Overpass is keyless; the request
carries the catalogue's identifying User-Agent, as the job's does.

Re-record when `TAG_SET` or the query's shape changes (or NWS's hourly
shape does); never edit a fixture by hand.
"""

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))

import httpx2  # noqa: E402

from physical_sources.limits import USER_AGENT  # noqa: E402
from spot_sources.overpass import Anchor, build_query, fetch, parse  # noqa: E402
from weather import DOWNTOWN, NWS_BASE, gridpoint_of, parse_periods  # noqa: E402

FIXTURE = BACKEND / "tests" / "fixtures" / "overpass_candidates.json"
UNION_STATION = Anchor(lat=39.7527, lng=-105.0002)
RADIUS_M = 600
NWS_POINTS = BACKEND / "tests" / "fixtures" / "nws_points.json"
NWS_HOURLY = BACKEND / "tests" / "fixtures" / "nws_hourly.json"


def _write(path: Path, payload: dict) -> None:
    path.write_text(json.dumps(payload, indent=1, ensure_ascii=False) + "\n")
    print(f"wrote {path.relative_to(BACKEND)}")


async def record_weather() -> None:
    headers = {"User-Agent": USER_AGENT, "Accept": "application/geo+json"}
    async with httpx2.AsyncClient(headers=headers, timeout=30.0) as client:
        lat, lng = DOWNTOWN
        points = (await client.get(f"{NWS_BASE}/points/{lat:.4f},{lng:.4f}")).json()
        gridpoint, url = gridpoint_of(points)
        response = await client.get(url)
        response.raise_for_status()
        hourly = response.json()
    _write(NWS_POINTS, points)
    _write(NWS_HOURLY, hourly)
    print(f"{gridpoint}: {len(parse_periods(hourly))} hours")


async def main() -> None:
    query = build_query([UNION_STATION], RADIUS_M)
    async with httpx2.AsyncClient(headers={"User-Agent": USER_AGENT}) as client:
        payload = await fetch(client, query)
    FIXTURE.write_text(json.dumps(payload, indent=1, ensure_ascii=False) + "\n")
    rows = parse(payload)
    print(f"{len(payload.get('elements') or [])} elements, {len(rows)} places")
    print(f"wrote {FIXTURE.relative_to(BACKEND)}")


if __name__ == "__main__":
    asyncio.run(record_weather() if "--weather" in sys.argv[1:] else main())
