"""Writes a public comic title's detail body for each title kind.

`GET /api/public/items/{id}` for a comic carries a `comic` block
(`PublicComicDetail`) with `kind`, `volumes`, `volumes_owned` and `slots`.
Here the kind and the slots come from the real `comics.title_kind` and
`public_comics.volume_slots`, run over unattached `ComicVolume` rows, and the
whole body is validated through `PublicItemDetailOut`, so the frontend's tests
cannot carry a key the API never sends. Run from `backend/`:
`./.venv/bin/python scripts/export_public_comic_fixtures.py`.
Writes `frontend/e2e/fixtures/api/public-comic-<kind>.json` (run, book_line,
single_book, both) and `public-comic-wall-both.json` (the issue wall of the
`both` title). All data is invented.
"""

import json
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from comics import title_kind
from models import ComicVolume
from public import PublicItemDetailOut
from public_comics import (
    PublicComicDetail,
    PublicTitleVolume,
    line_order,
    volume_slots,
)
from public_issues import PublicWall

OUT = str(Path(__file__).resolve().parents[2] / "frontend/e2e/fixtures/api") + "/"
IDS = {
    "run": "22222222-bbbb-4bbb-8bbb-000000000002",
    "book_line": "33333333-bbbb-4bbb-8bbb-000000000003",
    "single_book": "44444444-bbbb-4bbb-8bbb-000000000004",
    "both": "55555555-bbbb-4bbb-8bbb-000000000005",
}
TITLES = {
    "run": "Paper Moons",
    "book_line": "Lantern Tales",
    "single_book": "Salt Road",
    "both": "Harbor Lights",
}


def volume(slug, label, kind, line_number, *, read=False, position=0):
    return ComicVolume(
        id=uuid.uuid4(),
        slug=slug,
        label=label,
        kind=kind,
        line_number=line_number,
        cover_url=None,
        owned=True,
        read=read,
        position=position,
    )


# Owned books per title; the book line owns 1, 2 and 4 of its line (3 is a gap)
# and one book with no number.
BOOKS = {
    "run": [],
    "book_line": [
        volume("vol-1", "Lantern Tales, Book One", "hardcover", 1, read=True),
        volume("vol-2", "Lantern Tales, Book Two", "hardcover", 2, position=1),
        volume("vol-4", "Lantern Tales, Book Four", "hardcover", 4, position=2),
        volume("vol-5", "Lantern Tales: Origins", "ogn", None, position=3),
    ],
    "single_book": [
        volume("vol-1", "Salt Road", "ogn", None, read=True),
    ],
    "both": [
        volume("vol-1", "Harbor Lights, Book One", "trade", 1),
        volume("vol-3", "Harbor Lights, Book Three", "trade", 3, position=1),
    ],
}
LOOSE = {"run": 6, "book_line": 0, "single_book": 0, "both": 4}


def comic_block(kind):
    books = sorted(BOOKS[kind], key=line_order)
    derived = title_kind(len(books), LOOSE[kind])
    assert derived == kind, (derived, kind)
    loose = LOOSE[kind]
    return PublicComicDetail(
        publisher="Fixture Press",
        owned_text=f"1-{loose}" if loose else "",
        released=8 if loose else 0,
        ongoing=bool(loose),
        run_state="gaps" if loose else "unrecorded",
        missing=8 - loose if loose else 0,
        segments=(
            [
                {"kind": "owned", "length": loose},
                {"kind": "missing", "length": 8 - loose},
            ]
            if loose
            else []
        ),
        read_to=2 if loose else None,
        read=2 if loose else 0,
        status="active",
        caught_up=False,
        read_next=3 if loose else None,
        issue_count=8 if loose else None,
        editions=[],
        next_issue=None,
        shelf_format="trades" if books else "singles",
        as_of="2026-11-10" if loose else None,
        kind=kind,
        volumes=[
            PublicTitleVolume(
                slug=v.slug,
                label=v.label,
                kind=v.kind,
                line_number=v.line_number,
                cover_url=v.cover_url,
                read=v.read,
            )
            for v in books
        ],
        volumes_owned=len(books),
        slots=volume_slots(books) if kind == "book_line" else [],
    )


def detail(kind):
    return PublicItemDetailOut.model_validate(
        dict(
            id=IDS[kind],
            type="comic",
            title=TITLES[kind],
            year=2020,
            creator="Fixture Press",
            cover_url=None,
            status="active",
            rating=None,
            favorite=False,
            finished_at=None,
            genres=[],
            tags=[],
            community_score=None,
            platforms=[],
            created_at="2026-01-01T00:00:00Z",
            wanted=False,
            release_date=None,
            platform=None,
            physical_format=None,
            disc_format=None,
            completeness=None,
            time_to_beat_hours=None,
            pinned=False,
            description="An invented comic for the test fixture.",
            community_votes=None,
            started_at=None,
            similar_in_collection=[],
            themes=[],
            time_to_beat=None,
            comic=comic_block(kind).model_dump(mode="json"),
        )
    )


def write(name, model):
    with open(OUT + name, "w") as f:
        f.write(json.dumps(json.loads(model.model_dump_json()), indent=2) + "\n")


for kind in IDS:
    write(f"public-comic-{kind}.json", detail(kind))

write(
    "public-comic-wall-both.json",
    PublicWall.model_validate(
        dict(
            series_title=TITLES["both"],
            publisher="Fixture Press",
            issues=[
                dict(
                    number=n,
                    owned=n <= 4,
                    read=n <= 2,
                    name=None,
                    store_date="2020-01-01",
                    cover_url=None,
                )
                for n in range(1, 9)
            ],
            editions=[],
        )
    ),
)
