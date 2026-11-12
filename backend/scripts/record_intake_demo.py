"""Records one real shelf photo through intake as the public demo's file.

Run from backend/ in any checkout or worktree:

    ./.venv/bin/python scripts/record_intake_demo.py PATH/TO/shelf.jpg
    ./.venv/bin/python scripts/record_intake_demo.py PATH/TO/shelf.jpg --yes

The photo goes through the same path a sitting's photo does: the reading
copy (`closet_images.make_reading_copy`), one model call with the reader's
prompt and schema (`importer.EXTRACTION_PROMPT`, `DETECTION_SCHEMA`), then
the matcher against the configured sources (`importer.resolve_detections`).
Confidence comes from `matching.py`, never from the model. It writes
frontend/src/content/intake-demo.json, the only file the public demo at
/shelf/intake reads: what was read, the candidates' titles and years, the
confidence and the two stages' timings. No image bytes, no external ids,
no cover URLs (the public page makes no third-party request).

Every string the file would publish (what was read, the match and candidate
titles) is printed first; without --yes the run stops there and writes
nothing, so the owner reads the list before it goes public. A match on an
item whose `is_public` is false refuses the run, --yes or not, naming the
private titles: pick a shelf of published titles.

A run where a source could not answer, or where nothing was read, writes
nothing: the demo would show a miss that is not one. Keys come from the
main checkout's backend/.env (worktrees have none); nothing else is printed.
Never edit the output by hand; re-record instead.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
import time
from collections.abc import Callable
from datetime import date
from pathlib import Path
from typing import Any

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))
sys.path.insert(0, str(BACKEND / "scripts"))

from sqlalchemy import select, tuple_  # noqa: E402
from sqlalchemy.ext.asyncio import AsyncSession  # noqa: E402

from closet_images import make_reading_copy  # noqa: E402
from importer import (  # noqa: E402
    DETECTION_SCHEMA,
    EXTRACTION_PROMPT,
    parse_detections,
    resolve_detections,
)
from intake.reader import CONFIDENCE_STATES  # noqa: E402
from llm import Image, LLMProvider  # noqa: E402
from models import Item, ItemType  # noqa: E402
from sources.base import SourceAdapter, SourceError  # noqa: E402

OUTPUT = BACKEND.parent / "frontend" / "src" / "content" / "intake-demo.json"


class RecordingRefused(RuntimeError):
    """The run would not make an honest demo; nothing is written."""


class _Noting:
    """An adapter that remembers any source error, which the importer
    folds into an unresolved row indistinguishable from a real miss."""

    def __init__(self, adapter: SourceAdapter, errors: list[str]):
        self.adapter = adapter
        self.errors = errors

    @property
    def source_name(self) -> str:
        return self.adapter.source_name

    def configured(self) -> bool:
        return self.adapter.configured()

    async def search(self, query, year=None, platform=None):
        try:
            return await self.adapter.search(query, year, platform)
        except SourceError as error:
            self.errors.append(str(error))
            raise


def _title(candidate: dict | None) -> dict | None:
    if candidate is None:
        return None
    return {"title": candidate["title"], "year": candidate["year"]}


def _row(row: dict) -> dict[str, Any]:
    return {
        "read": row["detected_title"],
        "year": row["detected_year"],
        "kind": row["media_type"],
        "confidence": CONFIDENCE_STATES[row["confidence"]].value,
        "match": _title(row["match"]),
        "candidates": [_title(candidate) for candidate in row["candidates"]],
    }


async def private_matches(session: AsyncSession, rows: list[dict]) -> list[str]:
    """Titles of the matches that are items on the shelf with `is_public`
    false: the public demo must not name them."""
    keys = {
        (row["match"]["external_source"], row["match"]["external_id"])
        for row in rows
        if row["match"] is not None
    }
    if not keys:
        return []
    result = await session.execute(
        select(Item.title)
        .where(tuple_(Item.external_source, Item.external_id).in_(keys))
        .where(Item.is_public.is_(False))
        .order_by(Item.title)
    )
    return list(result.scalars())


async def record(
    photo: bytes,
    provider: LLMProvider,
    registry: dict[ItemType, SourceAdapter],
    *,
    session: AsyncSession,
    clock: Callable[[], float] = time.perf_counter,
    today: date | None = None,
) -> dict[str, Any]:
    """The demo document for one photo, or RecordingRefused."""
    image = Image("image/jpeg", make_reading_copy(photo))
    started = clock()
    payload = await provider.complete_json(EXTRACTION_PROMPT, DETECTION_SCHEMA, [image])
    detections = parse_detections(payload)
    read = clock()
    if not detections:
        raise RecordingRefused("the model read no titles off this photo")
    errors: list[str] = []
    noting = {kind: _Noting(adapter, errors) for kind, adapter in registry.items()}
    rows = await resolve_detections(noting, detections)
    matched = clock()
    if errors:
        raise RecordingRefused("a source could not answer: " + "; ".join(errors))
    private = await private_matches(session, rows)
    if private:
        raise RecordingRefused(
            "these matches are private items (is_public false): "
            + ", ".join(private)
            + "; pick a shelf of published titles"
        )
    kinds = {detection.media_type for detection in detections}
    return {
        "provisional": False,
        "recorded_on": (today or date.today()).isoformat(),
        "sources": sorted(
            {registry[kind].source_name for kind in kinds if kind in registry}
        ),
        "stages": {
            "read_ms": round((read - started) * 1000),
            "match_ms": round((matched - read) * 1000),
        },
        "titles": [_row(row) for row in rows],
    }


def keep_spines(demo: dict[str, Any], out: Path) -> dict[str, Any]:
    """The demo with each row's hand-written `spine` label carried over from
    the file at `out`, matched by the row's `read` text, so a re-record does
    not drop the short spine labels. A row already carrying one keeps it."""
    try:
        old = json.loads(out.read_text())
    except (OSError, ValueError):
        return demo
    labels = {
        row["read"]: row["spine"]
        for row in old.get("titles", [])
        if isinstance(row, dict) and row.get("spine") and "read" in row
    }
    titles = [
        {**row, "spine": labels[row["read"]]}
        if "spine" not in row and row.get("read") in labels
        else row
        for row in demo["titles"]
    ]
    return {**demo, "titles": titles}


def write(demo: dict[str, Any], out: Path = OUTPUT) -> None:
    """Writes the document as the frontend reads it."""
    out.write_text(
        json.dumps(demo, indent=2, sort_keys=True, ensure_ascii=False) + "\n"
    )


def trim(
    demo: dict[str, Any], *, skip: list[str], alternatives: bool
) -> dict[str, Any]:
    """The demo without skipped titles, and with only the match as candidate
    when alternatives are off. A skip matches the read or matched title,
    case-insensitively, as a substring."""
    needles = [needle.casefold() for needle in skip if needle.strip()]

    def skipped(row: dict) -> bool:
        texts = [row["read"], (row["match"] or {}).get("title", "")]
        return any(n in (text or "").casefold() for n in needles for text in texts)

    titles = []
    for row in demo["titles"]:
        if skipped(row):
            continue
        if not alternatives:
            row = {**row, "candidates": [row["match"]] if row["match"] else []}
        titles.append(row)
    return {**demo, "titles": titles}


def public_strings(demo: dict[str, Any]) -> list[str]:
    """Every title the file would publish, once each, in reading order."""
    seen: dict[str, None] = {}
    for row in demo["titles"]:
        seen.setdefault(row["read"], None)
        for title in [row["match"], *row["candidates"]]:
            if title is not None:
                seen.setdefault(title["title"], None)
    return list(seen)


async def run(
    photo: bytes,
    provider: LLMProvider,
    registry: dict[ItemType, SourceAdapter],
    session: AsyncSession,
    *,
    out: Path = OUTPUT,
    yes: bool = False,
    skip: list[str] | None = None,
    alternatives: bool = True,
    clock: Callable[[], float] = time.perf_counter,
    today: date | None = None,
) -> int:
    """Records, prints every public string, and writes only with `yes`."""
    try:
        demo = await record(
            photo, provider, registry, session=session, clock=clock, today=today
        )
    except Exception as error:  # noqa: BLE001 -- reported, never a traceback with keys
        print(f"FAILED: {type(error).__name__}: {error}", file=sys.stderr)
        return 1
    demo = trim(demo, skip=skip or [], alternatives=alternatives)
    print("These strings will be public at /shelf/intake:")
    for public in public_strings(demo):
        print(f"  {public}")
    if not yes:
        print("Nothing written. Check each is a published title; re-run with --yes.")
        return 0
    write(keep_spines(demo, out), out)
    counts: dict[str, int] = {}
    for row in demo["titles"]:
        counts[row["confidence"]] = counts.get(row["confidence"], 0) + 1
    summary = ", ".join(f"{n} {state}" for state, n in sorted(counts.items()))
    print(f"{len(demo['titles'])} read ({summary}); wrote {out}")
    return 0


def parse_args(argv: list[str]) -> argparse.Namespace:
    """The command line: the photo, where to write, and what to leave out."""
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("photo", type=Path, help="the shelf photo (JPEG, PNG, HEIC)")
    parser.add_argument("--out", type=Path, default=OUTPUT)
    parser.add_argument(
        "--yes",
        action="store_true",
        help="write the file (default: print the public strings and stop)",
    )
    parser.add_argument(
        "--skip",
        action="append",
        default=[],
        metavar="TITLE",
        help="leave out a title (read or matched text, case-insensitive); repeatable",
    )
    parser.add_argument(
        "--no-alternatives",
        dest="alternatives",
        action="store_false",
        help="publish only each title's match, not the other candidates",
    )
    return parser.parse_args(argv)


def main(argv: list[str]) -> int:
    args = parse_args(argv)

    from dotenv import load_dotenv
    from migrate_neon import main_checkout_env

    load_dotenv(main_checkout_env())
    from config import load_config
    from db import create_engine_and_sessionmaker
    from llm import build_provider
    from sources.registry import build_registry

    config = load_config()

    try:
        photo = args.photo.read_bytes()
        provider, registry = build_provider(config), build_registry(config)
    except Exception as error:  # noqa: BLE001 -- reported, never a traceback with keys
        print(f"FAILED: {type(error).__name__}: {error}", file=sys.stderr)
        return 1

    async def _run() -> int:
        engine, factory = create_engine_and_sessionmaker(config.database_url)
        try:
            async with factory() as session:
                return await run(
                    photo,
                    provider,
                    registry,
                    session,
                    out=args.out,
                    yes=args.yes,
                    skip=args.skip,
                    alternatives=args.alternatives,
                )
        finally:
            await engine.dispose()

    return asyncio.run(_run())


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
