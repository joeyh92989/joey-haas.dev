"""The figures row's book-first numbers on /api/public/comics (#333).

Each number is checked against a hand count over one small shelf, so a change
to a definition shows as a changed sum here, not just a changed field list.
"""

import re
from pathlib import Path

import pytest
from sqlalchemy import event

from models import ComicIssue
from public_comics import PublicComicStats
from tests.test_public_comics import (
    STATS_FIELDS,
    _add,
    _comic,
    _keys,
    client_for,
    clock,  # noqa: F401  (the frozen clock this file's routes need)
)
from tests.test_public_comics_kind import _volume

pytestmark = pytest.mark.asyncio

NEW_FIELDS = {"books_owned", "volumes_missing", "issues_read"}


def _title(name, **fields):
    return _comic(name, issues_owned=None, source_metadata=None, **fields)


def _vols(item, *specs):
    """(slug, line_number, owned) per book, in line order."""
    return [
        _volume(item.id, slug, i, line_number=number, owned=owned)
        for i, (slug, number, owned) in enumerate(specs)
    ]


async def _shelf(factory):
    """
    Line A      public, owned Vol. 1, 2, 4 plus an UNOWNED Vol. 3.
                books 3, missing 1 (Vol. 3: the unowned book fills nothing).
    Line B      public, owned Vol. 1 and 5 plus one book with no number.
                books 3, missing 3 (Vol. 2, 3, 4; the unnumbered book adds none).
    Mad Max     public, one-issue Comic Vine volume, issue #1 held as a single,
                no volume. books 1 (the one-issue book), missing 0. #1 read.
    Both        public, one owned volume (Vol. 1) AND singles 1-3, all read:
                the volume is read too, so marks are 1, 2, 3 once each.
                books 1, missing 0 (not a book_line). read 3.
    Haunt       public, one-issue volume, #1 held, AND an owned volume:
                books 1 (the volume only: never 2). read 0.
    Monstress   public run 1-10, no books. #1-#3 read as singles. read 3.
    New Series  public, ongoing, released 1, #1 held: a first issue, not a book.
    Secret      PRIVATE, 2 owned volumes, a read single: contributes nothing.
    """
    line_a = _title("Line A")
    line_b = _title("Line B")
    mad_max = _comic(
        "Mad Max TPB",
        issues_owned="1",
        source_metadata={"released": 1, "issue_count": 1, "ongoing": False},
    )
    both = _comic(
        "Both",
        issues_owned="1–3",
        source_metadata={"released": 8, "ongoing": False},
    )
    haunt = _comic(
        "Haunt",
        issues_owned="1",
        source_metadata={"released": 1, "issue_count": 1, "ongoing": False},
    )
    monstress = _comic(
        "Monstress",
        issues_owned="1–10",
        source_metadata={"released": 10, "ongoing": False},
    )
    fresh = _comic(
        "New Series",
        issues_owned="1",
        source_metadata={"released": 1, "issue_count": 1, "ongoing": True},
    )
    secret = _comic("Secret", is_public=False, issues_owned="5", source_metadata=None)
    await _add(factory, line_a, line_b, mad_max, both, haunt, monstress, fresh, secret)
    await _add(
        factory,
        *_vols(
            line_a,
            ("vol-1", 1, True),
            ("vol-2", 2, True),
            ("vol-3", 3, False),
            ("vol-4", 4, True),
        ),
        *_vols(line_b, ("vol-1", 1, True), ("vol-5", 5, True), ("extra", None, True)),
        *_vols(both, ("vol-1", 1, True)),
        *_vols(haunt, ("vol-1", 1, True)),
        *_vols(secret, ("vol-1", 1, True), ("vol-2", 2, True)),
    )

    def marks(item, *numbers):
        return [
            ComicIssue(item_id=item.id, number=n, owned=True, read=True)
            for n in numbers
        ]

    await _add(
        factory,
        *marks(mad_max, 1),
        *marks(both, 1, 2, 3),
        *marks(monstress, 1, 2, 3),
        *marks(secret, 5),
    )


async def _stats(factory) -> dict:
    async with client_for(factory) as client:
        response = await client.get("/api/public/comics")
    assert response.status_code == 200
    return response.json()["stats"]


async def test_the_stats_model_carries_the_three_new_fields_and_no_other():
    assert NEW_FIELDS <= STATS_FIELDS
    assert set(PublicComicStats.model_fields) == STATS_FIELDS
    assert "book_lines_started" not in STATS_FIELDS


async def test_books_owned_matches_a_hand_count(sessionmaker_for_test):
    await _shelf(sessionmaker_for_test)
    # Line A 3 + Line B 3 + Mad Max 1 + Both 1 + Haunt 1 = 9.
    assert (await _stats(sessionmaker_for_test))["books_owned"] == 9


async def test_volumes_missing_matches_a_hand_count(sessionmaker_for_test):
    await _shelf(sessionmaker_for_test)
    # Line A: 1..4 minus {1, 2, 4} = 1. Line B: 1..5 minus {1, 5} = 3.
    assert (await _stats(sessionmaker_for_test))["volumes_missing"] == 4


async def test_issues_read_counts_each_marked_issue_once(sessionmaker_for_test):
    await _shelf(sessionmaker_for_test)
    # Mad Max 1 + Both 3 (a read volume and singles, the same three issues
    # once) + Monstress 3 = 7. The private title's read mark adds nothing.
    assert (await _stats(sessionmaker_for_test))["issues_read"] == 7


async def test_the_existing_figures_do_not_move(sessionmaker_for_test):
    await _shelf(sessionmaker_for_test)
    stats = await _stats(sessionmaker_for_test)
    # Public titles holding singles: Mad Max 1, Both 3, Haunt 1, Monstress 10,
    # New Series 1 = 16 issues; the book-only lines add no issues.
    assert stats["issues_owned"] == 16
    assert stats["series"] == 7


async def test_a_private_title_and_an_unowned_book_contribute_nothing(
    sessionmaker_for_test,
):
    line = _title("Only unowned")
    await _add(sessionmaker_for_test, line)
    await _add(
        sessionmaker_for_test,
        *_vols(line, ("vol-1", 1, False), ("vol-2", 2, False)),
    )
    private = _title("Hidden", is_public=False)
    await _add(sessionmaker_for_test, private)
    await _add(
        sessionmaker_for_test,
        *_vols(private, ("vol-1", 1, True), ("vol-4", 4, True)),
        ComicIssue(item_id=private.id, number=1, owned=True, read=True),
    )
    stats = await _stats(sessionmaker_for_test)
    assert (stats["books_owned"], stats["volumes_missing"], stats["issues_read"]) == (
        0,
        0,
        0,
    )


async def test_a_line_with_no_numbered_book_has_no_missing(sessionmaker_for_test):
    line = _title("Unnumbered")
    await _add(sessionmaker_for_test, line)
    await _add(
        sessionmaker_for_test, *_vols(line, ("a", None, True), ("b", None, True))
    )
    stats = await _stats(sessionmaker_for_test)
    assert (stats["books_owned"], stats["volumes_missing"]) == (2, 0)


async def test_an_empty_shelf_counts_zero(sessionmaker_for_test):
    stats = await _stats(sessionmaker_for_test)
    assert (stats["books_owned"], stats["volumes_missing"], stats["issues_read"]) == (
        0,
        0,
        0,
    )


async def test_the_stats_add_no_query_per_title(sessionmaker_for_test, engine):
    seen: list[str] = []

    def record(conn, cursor, statement, *args):
        seen.append(statement)

    await _shelf(sessionmaker_for_test)
    event.listen(engine.sync_engine, "before_cursor_execute", record)
    try:
        await _stats(sessionmaker_for_test)
        small = len(seen)
        for n in range(10):
            extra = _title(f"More {n}")
            await _add(sessionmaker_for_test, extra)
            await _add(
                sessionmaker_for_test,
                *_vols(extra, ("vol-1", 1, True), ("v3", 3, True)),
            )
        seen.clear()
        await _stats(sessionmaker_for_test)
    finally:
        event.remove(engine.sync_engine, "before_cursor_execute", record)
    assert len(seen) == small


async def test_the_new_stats_keys_dodge_the_smoke_private_keys(sessionmaker_for_test):
    smoke = (Path(__file__).resolve().parents[2] / "scripts" / "smoke.sh").read_text()
    line = next(ln for ln in smoke.splitlines() if ln.startswith("PRIVATE_KEYS="))
    private = re.compile(
        line.split("=", 1)[1].strip().strip("'").replace("[[:space:]]", r"\s")
    )
    assert private.search('{"price": 1}')  # the regex was really read
    await _shelf(sessionmaker_for_test)
    async with client_for(sessionmaker_for_test) as client:
        text = (await client.get("/api/public/comics")).text
    assert private.search(text) is None
    assert not [f for f in STATS_FIELDS if private.search(f'"{f}":')]
    assert NEW_FIELDS <= set(_keys((await _stats(sessionmaker_for_test))))


async def test_the_admin_rows_issues_read_agree_with_the_public_figure(
    sessionmaker_for_test,
):
    """One definition for both twins: the admin rows carry the same read
    marks, so over the public titles their sum is the public `issues_read`.
    The private title's mark is in the admin row too (5 read, 1 mark)."""
    from tests.test_items_comics import client_for as admin_client

    await _shelf(sessionmaker_for_test)
    async with admin_client(sessionmaker_for_test) as client:
        response = await client.get("/api/items")
    assert response.status_code == 200
    comics = [r for r in response.json() if r["type"] == "comic"]
    public = sum(r["comic_run"]["issues_read"] for r in comics if r["is_public"])
    private = sum(r["comic_run"]["issues_read"] for r in comics if not r["is_public"])
    assert public == (await _stats(sessionmaker_for_test))["issues_read"] == 7
    assert private == 1


async def test_the_admin_list_reads_the_marks_in_one_query(
    sessionmaker_for_test, engine
):
    from tests.test_items_comics import client_for as admin_client

    seen: list[str] = []

    def record(conn, cursor, statement, *args):
        seen.append(statement)

    for n in range(8):
        await _add(sessionmaker_for_test, _title(f"Many {n}"))
    event.listen(engine.sync_engine, "before_cursor_execute", record)
    try:
        async with admin_client(sessionmaker_for_test) as client:
            rows = (await client.get("/api/items")).json()
    finally:
        event.remove(engine.sync_engine, "before_cursor_execute", record)
    assert len(rows) == 8
    assert len([q for q in seen if "FROM comic_issues" in q]) == 1
