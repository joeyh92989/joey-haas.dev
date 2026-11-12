"""Probes the live Comic Vine issue endpoints and records two fixtures.

Run once, from backend/ in any checkout or worktree, by the owner:

    ./.venv/bin/python scripts/probe_comicvine_issues.py

It makes the calls the issue pages depend on and checks them against the live
API before the parser is trusted:

1. One /issues page of Saga (volume 46568), with the adapter's own
   ALL_ISSUES_FIELD_LIST, filter=volume:<id> and sort=id:asc. It prints
   whether the volume filter HELD and whether `description` came back on the
   list endpoint; it exits non-zero when either is false. The page is
   trimmed to the first rows before writing, with the real
   number_of_total_results kept.
2. One trade-paperback issue (Vinland Saga, "Volume 1", found by the
   /search?resources=issue endpoint) through /issue/4000-<id>/.
3. The pixel size of every `image` key of that trade issue, read from the
   first bytes of each image, so the cover sizes used by the site are
   measured rather than assumed.

The key is COMICVINE_API_KEY from the main checkout's backend/.env (worktrees
have none). It is read here, never printed, and a fixture is refused if the
key appears in its text. Requests are spaced by the adapter's own throttle
(one a second) and carry its User-Agent.
"""

from __future__ import annotations

import asyncio
import json
import struct
import sys
from datetime import date
from pathlib import Path
from types import SimpleNamespace

import httpx2

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))
sys.path.insert(0, str(BACKEND / "scripts"))

from migrate_neon import main_checkout_env, read_variable  # noqa: E402

from sources.comicvine import (  # noqa: E402
    ALL_ISSUES_FIELD_LIST,
    ALL_ISSUES_PAGE,
    ALL_ISSUES_SORT,
    USER_AGENT,
    ComicVineSource,
)

FIXTURES = BACKEND / "tests" / "fixtures"
VARIABLE = "COMICVINE_API_KEY"
PAGE_FIXTURE = "comicvine_issues_page.json"
DETAIL_FIXTURE = "comicvine_issue_detail.json"

SAGA_VOLUME = 46568
# Rows kept in the page fixture: enough to cover a few numbers and a
# description with a table in it, small enough to read in a diff.
KEEP_ROWS = 15
# The trade issue: found through the issue search so its id is not typed from
# memory. (volume name, issue name) must match exactly.
TRADE_QUERY = "Vinland Saga Volume 1"
TRADE_VOLUME = "Vinland Saga"
TRADE_NAME = "Volume 1"


def filter_held(payload: dict, volume_id: int) -> bool:
    """True when every issue returned belongs to the requested volume."""
    rows = payload.get("results") or []
    return bool(rows) and all(
        (row.get("volume") or {}).get("id") == volume_id for row in rows
    )


def descriptions_present(payload: dict) -> bool:
    """True when the list endpoint returned a description on every row."""
    rows = payload.get("results") or []
    return bool(rows) and all(row.get("description") for row in rows)


def pick_trade(results: list[dict]) -> dict | None:
    """The search row for exactly the trade issue, or None."""
    for row in results:
        if (row.get("volume") or {}).get("name") == TRADE_VOLUME and (
            row.get("name") == TRADE_NAME
        ):
            return row
    return None


def image_size(data: bytes) -> tuple[int, int] | None:
    """Width and height of a JPEG, PNG or GIF from its leading bytes."""
    if data[:8] == b"\x89PNG\r\n\x1a\n" and len(data) >= 24:
        return struct.unpack(">II", data[16:24])
    if data[:6] in (b"GIF87a", b"GIF89a") and len(data) >= 10:
        return struct.unpack("<HH", data[6:10])
    if data[:2] == b"\xff\xd8":
        i = 2
        while i + 9 < len(data):
            if data[i] != 0xFF:
                i += 1
                continue
            marker = data[i + 1]
            if marker in (0xD8, 0x01) or 0xD0 <= marker <= 0xD7:
                i += 2
                continue
            length = struct.unpack(">H", data[i + 2 : i + 4])[0]
            if marker in (0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB):
                height, width = struct.unpack(">HH", data[i + 5 : i + 9])
                return width, height
            i += 2 + length
    return None


def _write(name: str, body: object, key: str) -> Path:
    text = json.dumps(body, indent=2, sort_keys=True) + "\n"
    if key in text:
        raise RuntimeError(f"the API key appears in {name}; refusing to write it")
    path = FIXTURES / name
    path.write_text(text)
    return path


async def measure_images(source: ComicVineSource, image: dict) -> dict:
    """{key: 'WxH'} for every image url, from the first 64 KB of each."""
    sizes: dict[str, str] = {}
    for name, url in image.items():
        if not name.endswith("_url"):
            continue
        await source._throttle.wait()
        async with httpx2.AsyncClient(timeout=20.0) as client:
            response = await client.get(
                url, headers={"User-Agent": USER_AGENT, "Range": "bytes=0-65535"}
            )
        size = image_size(response.content)
        sizes[name] = f"{size[0]}x{size[1]}" if size else "unreadable"
    return sizes


async def probe(source: ComicVineSource, key: str, today: date) -> int:
    failures = 0
    payload = await source._get(
        "/issues/",
        {
            "filter": f"volume:{SAGA_VOLUME}",
            "sort": ALL_ISSUES_SORT,
            "limit": ALL_ISSUES_PAGE,
            "offset": 0,
            "field_list": ALL_ISSUES_FIELD_LIST,
        },
    )
    held = filter_held(payload, SAGA_VOLUME)
    described = descriptions_present(payload)
    rows = payload["results"]
    numbers = [row.get("issue_number") for row in rows]
    odd = [n for n in numbers if not str(n).isdigit()]
    print(
        f"volume {SAGA_VOLUME}: {len(rows)} of "
        f"{payload.get('number_of_total_results')} rows, "
        f"filter {'HELD' if held else 'NOT HELD'}, "
        f"description {'on every row' if described else 'MISSING'}, "
        f"non-whole numbers: {odd or 'none'}"
    )
    failures += (not held) + (not described)
    trimmed = dict(payload, results=rows[:KEEP_ROWS])
    path = _write(
        PAGE_FIXTURE,
        {"recorded_on": today.isoformat(), "volume_id": SAGA_VOLUME, "issues": trimmed},
        key,
    )
    print(f"wrote {path.relative_to(BACKEND)} ({KEEP_ROWS} rows kept)")

    found = await source._get(
        "/search/",
        {
            "query": TRADE_QUERY,
            "resources": "issue",
            "limit": 10,
            "field_list": "id,issue_number,name,volume,image,cover_date",
        },
    )
    trade = pick_trade(found.get("results") or [])
    if trade is None:
        print(f"no {TRADE_VOLUME!r} {TRADE_NAME!r} in the issue search; skipped")
        return failures + 1
    detail = await source._get(
        f"/issue/4000-{trade['id']}/", {"field_list": ALL_ISSUES_FIELD_LIST}
    )
    path = _write(DETAIL_FIXTURE, detail, key)
    print(f"issue {trade['id']}: wrote {path.relative_to(BACKEND)}")
    sizes = await measure_images(source, detail["results"].get("image") or {})
    for name, size in sizes.items():
        print(f"  image {name}: {size}")
    return failures


def main() -> int:
    env_file = main_checkout_env()
    key = read_variable(env_file.read_text(), VARIABLE) if env_file.exists() else None
    if not key:
        print(f"{VARIABLE} is not set in {env_file}", file=sys.stderr)
        return 1
    source = ComicVineSource(SimpleNamespace(comicvine_api_key=key))
    try:
        failures = asyncio.run(probe(source, key, date.today()))
    except Exception as error:  # noqa: BLE001 -- reported, redacted, not raised
        print(f"FAILED: {f'{type(error).__name__}: {error}'.replace(key, '***')}")
        return 1
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
