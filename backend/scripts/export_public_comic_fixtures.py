"""Writes a public comic title's detail body for each title kind.

`GET /api/public/items/{id}` for a comic carries a `comic` block
(`PublicComicDetail`) with `kind`, `volumes`, `volumes_owned` and `slots`.
Here the kind and the slots come from the real `comics.title_kind` and
`public_comics.volume_slots`, run over unattached `ComicVolume` rows, and the
whole body is validated through `PublicItemDetailOut`, so the frontend's tests
cannot carry a key the API never sends. Run from `backend/`:
`./.venv/bin/python scripts/export_public_comic_fixtures.py`.
It also writes the issue page bodies `issue.json` (held as a single and in two
books, one of another title), `issue-single.json` and `issue-volumes.json`:
`also_in` comes from the real `public_issues.also_in_rows` and `held_single`
from `held_single`, and each body is validated through `PublicIssuePage`.
Writes `frontend/e2e/fixtures/api/public-comic-<kind>.json` (run, book_line,
single_book, both) and `public-comic-wall-both.json` (the issue wall of the
`both` title). It also writes `frontend/e2e/fixtures/snapshot/comics.json`,
the shelf's `GET /api/public/comics` body with one title of each kind: its rows
are built by the real `public_comics._row` (`kind`, `volumes_owned` and
`volume_numbers` included) over unattached `Item` rows, and the whole body is
validated through `PublicComicsOut`. All data is invented.
"""

import json
import sys
import uuid
from datetime import UTC, date, datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from comics import owned_line_numbers, sort_series, title_kind
from models import ComicVolume, Item, ItemStatus, ItemType, OwnedFormat
from public import PublicItemDetailOut
from public_comics import (
    PublicComicDetail,
    PublicComicsOut,
    PublicTitleVolume,
    _row,
    comic_stats,
    comic_weeks,
    line_order,
    series_of,
    volume_slots,
)
from public_issues import PublicIssuePage, PublicWall, also_in_rows, held_single

FIXTURES = Path(__file__).resolve().parents[2] / "frontend/e2e/fixtures"
OUT = str(FIXTURES / "api") + "/"
SNAPSHOT = str(FIXTURES / "snapshot") + "/"
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


def shelf_item(kind):
    """A public comic row as the database holds it (never flushed). The run
    and the `both` title hold loose issues; the others hold none."""
    loose = LOOSE[kind]
    return Item(
        id=uuid.UUID(IDS[kind]),
        type=ItemType.COMIC,
        title=TITLES[kind],
        creator="Fixture Press",
        year=2020,
        status=ItemStatus.ACTIVE,
        owned_format=OwnedFormat.PHYSICAL,
        is_public=True,
        following=False,
        issues_owned=f"1-{loose}" if loose else None,
        issues_skipped=None,
        editions=None,
        read_to=2 if loose else None,
        source_metadata={"released": 8, "ongoing": True} if loose else None,
        shelf_format="trades" if BOOKS[kind] else "singles",
        tags=[],
        created_at=datetime(2026, 1, 1, tzinfo=UTC),
    )


def shelf():
    """GET /api/public/comics over the four invented titles."""
    today = date(2026, 11, 10)
    items = {kind: shelf_item(kind) for kind in IDS}
    series = {kind: series_of(item) for kind, item in items.items()}
    marks = {item.id: 2 if LOOSE[k] else 0 for k, item in items.items()}
    by_id = {s.id: kind for kind, s in series.items()}
    rows = []
    for s in sort_series(series.values(), "next", today):
        kind = by_id[s.id]
        owned_books = [v for v in BOOKS[kind] if v.owned]
        rows.append(
            _row(
                items[kind],
                s,
                today,
                marks[items[kind].id],
                len(owned_books),
                owned_line_numbers(v.line_number for v in owned_books),
            )
        )
        assert rows[-1].kind == kind, (rows[-1].kind, kind)
    return PublicComicsOut(
        series=rows,
        stats=comic_stats(list(items.values()), today, marks),
        this_week=comic_weeks(items.values(), today),
    )


def write(name, model, out=None):
    with open((out or OUT) + name, "w") as f:
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

write("comics.json", shelf(), SNAPSHOT)


def issue_page(kind, number, books, *, state="owned"):
    """One issue page body: `books` are (ComicVolume, title name) pairs."""
    item = shelf_item(kind)
    for v, _ in books:
        if v.item_id is None:
            v.item_id = item.id
    return PublicIssuePage.model_validate(
        dict(
            series_id=IDS[kind],
            series_title=TITLES[kind],
            publisher="Fixture Press",
            number=number,
            name="First Light" if number == 1 else None,
            store_date="2020-01-08",
            cover_date="2020-03-01",
            cover_url=None,
            large_url=None,
            description=["An invented issue for the test fixture."],
            state=state,
            owned=True,
            read=False,
            held_single=held_single(item, number),
            also_in=[
                a.model_dump()
                for a in also_in_rows(item.id, {v.id: (v, t) for v, t in books})
            ],
            released=8 if LOOSE[kind] else 3,
            ongoing=bool(LOOSE[kind]),
            neighbours=[dict(number=number, cover_url=None, state=state)],
            source_url="https://comicvine.gamespot.com/",
        )
    )


def book(slug, label, line_number, title_kind, kind="trade"):
    v = volume(slug, label, kind, line_number)
    v.item_id = uuid.UUID(IDS[title_kind])
    return v


# Paper Moons holds 1-6 as singles. #1 is also in its own Volume One and in a
# book of another title; #5 is a single only. Lantern Tales holds no singles:
# its #2 is in two books, one of them Harbor Lights'.
write(
    "issue.json",
    issue_page(
        "run",
        1,
        [
            (book("ed-1-1", "Volume One", 1, "run"), TITLES["run"]),
            (
                book("vol-1", "Harbor Lights, Book One", 1, "both"),
                TITLES["both"],
            ),
        ],
    ),
)
write("issue-single.json", issue_page("run", 5, []))
write(
    "issue-volumes.json",
    issue_page(
        "book_line",
        2,
        [
            (
                book("vol-2", "Lantern Tales, Book Two", 2, "book_line", "hardcover"),
                TITLES["book_line"],
            ),
            (book("vol-1", "Harbor Lights, Book One", 1, "both"), TITLES["both"]),
        ],
    ),
)
