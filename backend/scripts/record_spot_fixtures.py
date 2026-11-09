"""Records a live Overpass answer as the spot finder's test fixture.

Run from backend/ in any checkout or worktree:

    ./.venv/bin/python scripts/record_spot_fixtures.py

It sends the finder's own query (`spot_sources.overpass.build_query`)
around Denver Union Station, with a smaller radius than the job's so the
fixture stays small, and writes the answer unedited to
`tests/fixtures/overpass_candidates.json`. Overpass is keyless; the request
carries the catalogue's identifying User-Agent, as the job's does.

Re-record when `TAG_SET` or the query's shape changes; never edit the
fixture by hand.
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

FIXTURE = BACKEND / "tests" / "fixtures" / "overpass_candidates.json"
UNION_STATION = Anchor(lat=39.7527, lng=-105.0002)
RADIUS_M = 600


async def main() -> None:
    query = build_query([UNION_STATION], RADIUS_M)
    async with httpx2.AsyncClient(headers={"User-Agent": USER_AGENT}) as client:
        payload = await fetch(client, query)
    FIXTURE.write_text(json.dumps(payload, indent=1, ensure_ascii=False) + "\n")
    rows = parse(payload)
    print(f"{len(payload.get('elements') or [])} elements, {len(rows)} places")
    print(f"wrote {FIXTURE.relative_to(BACKEND)}")


if __name__ == "__main__":
    asyncio.run(main())
