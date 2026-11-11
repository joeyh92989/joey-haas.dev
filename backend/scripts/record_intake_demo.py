"""Records one real shelf photo through intake as the public demo's file.

Run from backend/ in any checkout or worktree:

    ./.venv/bin/python scripts/record_intake_demo.py PATH/TO/shelf.jpg

The photo goes through the same path a sitting's photo does: the reading
copy (`closet_images.make_reading_copy`), one model call with the reader's
prompt and schema (`importer.EXTRACTION_PROMPT`, `DETECTION_SCHEMA`), then
the matcher against the configured sources (`importer.resolve_detections`).
Confidence comes from `matching.py`, never from the model. It writes
frontend/src/content/intake-demo.json, the only file the public demo at
/shelf/intake reads: what was read, the candidates' titles and years, the
confidence and the two stages' timings. No image bytes, no external ids,
no cover URLs (the public page makes no third-party request).

A run where a source could not answer, or where nothing was read, writes
nothing: the demo would show a miss that is not one. Keys come from the
main checkout's backend/.env (worktrees have none); nothing is printed but
the summary line. Never edit the output by hand; re-record instead.
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

from closet_images import make_reading_copy  # noqa: E402
from importer import (  # noqa: E402
    DETECTION_SCHEMA,
    EXTRACTION_PROMPT,
    parse_detections,
    resolve_detections,
)
from intake.reader import CONFIDENCE_STATES  # noqa: E402
from llm import Image, LLMProvider  # noqa: E402
from models import ItemType  # noqa: E402
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


async def record(
    photo: bytes,
    provider: LLMProvider,
    registry: dict[ItemType, SourceAdapter],
    *,
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


def write(demo: dict[str, Any], out: Path = OUTPUT) -> None:
    """Writes the document as the frontend reads it."""
    out.write_text(
        json.dumps(demo, indent=2, sort_keys=True, ensure_ascii=False) + "\n"
    )


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("photo", type=Path, help="the shelf photo (JPEG, PNG, HEIC)")
    parser.add_argument("--out", type=Path, default=OUTPUT)
    args = parser.parse_args(argv)

    from dotenv import load_dotenv
    from migrate_neon import main_checkout_env

    load_dotenv(main_checkout_env())
    from config import load_config
    from llm import build_provider
    from sources.registry import build_registry

    config = load_config()
    try:
        demo = asyncio.run(
            record(
                args.photo.read_bytes(), build_provider(config), build_registry(config)
            )
        )
    except Exception as error:  # noqa: BLE001 -- reported, never a traceback with keys
        print(f"FAILED: {type(error).__name__}: {error}", file=sys.stderr)
        return 1
    write(demo, args.out)
    counts: dict[str, int] = {}
    for row in demo["titles"]:
        counts[row["confidence"]] = counts.get(row["confidence"], 0) + 1
    summary = ", ".join(f"{n} {state}" for state, n in sorted(counts.items()))
    print(f"{len(demo['titles'])} read ({summary}); wrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
