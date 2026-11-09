"""Lists the tags FACET_MAP does not map yet, most common first.

Reads the anonymised collection export (tests/fixtures/picker_collection.json,
written by export_picker_fixture.py), so it touches no database:

    ./.venv/bin/python scripts/facet_coverage.py
    ./.venv/bin/python scripts/facet_coverage.py --min 2 --limit 50

The export pseudonymises unmapped free-text tags, so on the file this
reports the fixed vocabularies readably and keywords as `tag-…` counts.
For readable keywords, run `export_picker_fixture.py --coverage MIN`, which
reads the live rows.

Each line is `count  source  kind  value`. A tag carried by two or more items
is a candidate for a FACET_MAP row (the curation rule in facets.py); copy the
value exactly as printed.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from types import SimpleNamespace

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))

from facets import TAG_KINDS, coverage  # noqa: E402

EXPORT = BACKEND / "tests" / "fixtures" / "picker_collection.json"


def items_from_export(body: dict) -> list[SimpleNamespace]:
    return [
        SimpleNamespace(
            type=entry["type"],
            source=entry.get("source"),
            tags=tuple(
                (kind, value)
                for kind in TAG_KINDS
                for value in entry.get("tags", {}).get(kind, [])
            ),
        )
        for entry in body["items"]
    ]


def report(body: dict, minimum: int, limit: int | None) -> list[str]:
    rows = [row for row in coverage(items_from_export(body)) if row[3] >= minimum]
    return [
        f"{count:4d}  {source}  {kind}  {value}"
        for source, kind, value, count in rows[:limit]
    ]


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--file", type=Path, default=EXPORT, help="collection export")
    parser.add_argument(
        "--min", type=int, default=1, help="fewest items carrying a tag"
    )
    parser.add_argument("--limit", type=int, default=None, help="most lines to print")
    args = parser.parse_args(argv)
    if not args.file.exists():
        print(
            f"{args.file} not found: run export_picker_fixture.py first",
            file=sys.stderr,
        )
        return 1
    lines = report(json.loads(args.file.read_text()), args.min, args.limit)
    print("\n".join(lines) if lines else "every tag is mapped")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
