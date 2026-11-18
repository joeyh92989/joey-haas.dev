"""The title kind and the volume slots on the public comic bodies (#330).

`kind` is derived from owned volumes and issues, never stored; `volumes` lists
the OWNED books in line order, `slots` the Vol. places 1..the highest owned
number (a gap is a null slug). The shelf rows carry `kind` and `volumes_owned`
from one batched query.
"""

import re
import uuid
from pathlib import Path

import pytest
from sqlalchemy import event

from models import ComicVolume, Item
from public_comics import PublicComicRow, PublicTitleVolume, PublicVolumeSlot
from tests.test_comics_routes import FakeComicVine
from tests.test_comics_routes import client_for as comics_client
from tests.test_public_comics import (
    COMIC_FORBIDDEN,
    _add,
    _comic,
    _keys,
    client_for,
    clock,  # noqa: F401  (the frozen clock this file's routes need)
)

pytestmark = pytest.mark.asyncio

# Keys no title body may carry at any depth: everything the volume or the
# intake keeps private, on top of the comics list.
KIND_FORBIDDEN = COMIC_FORBIDDEN | {
    "kind_raw", "position", "edited", "intake_entry_id", "collects", "skips",
    "cv_id", "isbn", "pages", "description",
}  # fmt: skip
VOLUME_FIELDS = {"slug", "label", "kind", "line_number", "cover_url", "read"}
SLOT_FIELDS = {"number", "slug"}


def _volume(item_id, slug, position, **fields) -> ComicVolume:
    base = dict(
        id=uuid.uuid4(),
        item_id=item_id,
        position=position,
        slug=slug,
        label=f"Book {position}",
        kind="trade",
        kind_raw="Trade paperback",
        line_number=None,
        cover_url=f"https://cv.test/{slug}.jpg",
        owned=True,
        read=False,
        edited=True,
    )
    return ComicVolume(**{**base, **fields})


def _title(title="Berserk", **fields) -> Item:
    return _comic(title, issues_owned=None, source_metadata=None, **fields)


async def _detail(factory, item_id) -> dict:
    async with client_for(factory) as client:
        response = await client.get(f"/api/public/items/{item_id}")
    assert response.status_code == 200, response.text
    return response.json()["comic"]


async def _seed(factory, item, *volumes) -> uuid.UUID:
    await _add(factory, item)
    if volumes:
        await _add(factory, *[v(item.id) for v in volumes])
    return item.id


async def test_the_new_models_publish_exactly_these_fields():
    assert set(PublicTitleVolume.model_fields) == VOLUME_FIELDS
    assert set(PublicVolumeSlot.model_fields) == SLOT_FIELDS
    for model in (PublicTitleVolume, PublicVolumeSlot):
        assert KIND_FORBIDDEN.isdisjoint(set(model.model_fields)), model


async def test_a_run_only_title_is_a_run_with_no_volumes(sessionmaker_for_test):
    item = _comic("Saga", issues_owned="1-5", source_metadata={"released": 5})
    body = await _detail(
        sessionmaker_for_test, await _seed(sessionmaker_for_test, item)
    )
    assert body["kind"] == "run"
    assert (body["volumes"], body["slots"], body["volumes_owned"]) == ([], [], 0)


async def test_a_book_line_lists_owned_volumes_and_slots_with_gaps(
    sessionmaker_for_test,
):
    item_id = await _seed(
        sessionmaker_for_test,
        _title(),
        lambda i: _volume(i, "vol-1", 0, line_number=1, label="Vol. 1", read=True),
        lambda i: _volume(i, "vol-4", 2, line_number=4, label="Vol. 4"),
        lambda i: _volume(i, "vol-x", 3, label="Extra"),  # unnumbered: after
        lambda i: _volume(i, "vol-3", 1, line_number=3, owned=False),  # not owned
    )
    body = await _detail(sessionmaker_for_test, item_id)
    assert body["kind"] == "book_line"
    assert body["volumes_owned"] == 3
    assert [v["slug"] for v in body["volumes"]] == ["vol-1", "vol-4", "vol-x"]
    assert set(body["volumes"][0]) == VOLUME_FIELDS
    assert body["volumes"][0] == {
        "slug": "vol-1",
        "label": "Vol. 1",
        "kind": "trade",
        "line_number": 1,
        "cover_url": "https://cv.test/vol-1.jpg",
        "read": True,
    }
    # 1..4, the highest owned number; 2 and 3 are not owned (3 is not shown).
    assert body["slots"] == [
        {"number": 1, "slug": "vol-1"},
        {"number": 2, "slug": None},
        {"number": 3, "slug": None},
        {"number": 4, "slug": "vol-4"},
    ]
    assert all(set(slot) == SLOT_FIELDS for slot in body["slots"])
    assert "vol-3" not in str(body)  # a book not owned is never published


async def test_no_numbered_volume_means_no_slots(sessionmaker_for_test):
    item_id = await _seed(
        sessionmaker_for_test,
        _title(),
        lambda i: _volume(i, "vol-1", 0),
        lambda i: _volume(i, "vol-2", 1),
    )
    body = await _detail(sessionmaker_for_test, item_id)
    assert (body["kind"], body["slots"]) == ("book_line", [])


async def test_one_volume_and_no_issues_is_a_single_book(sessionmaker_for_test):
    item_id = await _seed(
        sessionmaker_for_test,
        _title("Blankets"),
        lambda i: _volume(i, "vol-1", 0, line_number=1),
    )
    body = await _detail(sessionmaker_for_test, item_id)
    assert body["kind"] == "single_book"
    assert body["volumes_owned"] == 1
    assert body["slots"] == []  # only a line of books has slots


async def test_volumes_and_issues_are_both(sessionmaker_for_test):
    item = _comic("Saga", issues_owned="1-3", source_metadata={"released": 5})
    item_id = await _seed(
        sessionmaker_for_test,
        item,
        lambda i: _volume(i, "vol-1", 0, line_number=1),
    )
    body = await _detail(sessionmaker_for_test, item_id)
    assert body["kind"] == "both"
    assert body["slots"] == []


async def test_a_volume_that_is_not_owned_does_not_make_a_book_title(
    sessionmaker_for_test,
):
    item = _comic("Saga", issues_owned="1-3", source_metadata={"released": 5})
    item_id = await _seed(
        sessionmaker_for_test, item, lambda i: _volume(i, "vol-1", 0, owned=False)
    )
    body = await _detail(sessionmaker_for_test, item_id)
    assert (body["kind"], body["volumes"], body["volumes_owned"]) == ("run", [], 0)


async def test_a_private_title_stays_private(sessionmaker_for_test):
    item_id = await _seed(
        sessionmaker_for_test,
        _title("Hidden", is_public=False),
        lambda i: _volume(i, "vol-1", 0, line_number=1),
    )
    async with client_for(sessionmaker_for_test) as client:
        assert (await client.get(f"/api/public/items/{item_id}")).status_code == 404
        shelf = (await client.get("/api/public/comics")).json()["series"]
    assert shelf == []


async def test_no_private_key_at_any_depth(sessionmaker_for_test):
    item_id = await _seed(
        sessionmaker_for_test,
        _title(),
        lambda i: _volume(i, "vol-1", 0, line_number=1, kind_raw="Secret raw"),
        lambda i: _volume(i, "vol-2", 1, line_number=2),
    )
    async with client_for(sessionmaker_for_test) as client:
        detail = (await client.get(f"/api/public/items/{item_id}")).json()
        shelf = (await client.get("/api/public/comics")).json()
    for body in (detail["comic"], shelf["series"]):
        assert KIND_FORBIDDEN.isdisjoint(set(_keys(body)))
    assert "Secret raw" not in str(detail) + str(shelf)


async def test_the_shelf_rows_carry_kind_and_volumes_owned(sessionmaker_for_test):
    await _add(
        sessionmaker_for_test,
        _comic("Saga", issues_owned="1-3", source_metadata={"released": 5}),
    )
    one = await _seed(
        sessionmaker_for_test, _title("One"), lambda i: _volume(i, "vol-1", 0)
    )
    line = await _seed(
        sessionmaker_for_test,
        _title("Line"),
        lambda i: _volume(i, "vol-1", 0, line_number=1),
        lambda i: _volume(i, "vol-2", 1, line_number=2),
        lambda i: _volume(i, "vol-3", 2, line_number=3, owned=False),
        # A second book on 2 and one with no number: 2 is listed once.
        lambda i: _volume(i, "vol-2b", 3, line_number=2),
        lambda i: _volume(i, "vol-x", 4),
    )
    both = _comic("Both", issues_owned="1", source_metadata={"released": 5})
    await _seed(sessionmaker_for_test, both, lambda i: _volume(i, "vol-1", 0))
    async with client_for(sessionmaker_for_test) as client:
        rows = (await client.get("/api/public/comics")).json()["series"]
    by_title = {
        r["title"]: (r["kind"], r["volumes_owned"], r["volume_numbers"]) for r in rows
    }
    # Owned books only: Vol. 3 is not owned, so 3 is never published; an
    # unnumbered book counts in volumes_owned but has no number.
    assert by_title == {
        "Saga": ("run", 0, []),
        "One": ("single_book", 1, []),
        "Line": ("book_line", 4, [1, 2]),
        "Both": ("both", 1, []),
    }
    assert {str(one), str(line)} <= {r["item_id"] for r in rows}
    assert {"kind", "volumes_owned", "volume_numbers"} <= set(
        PublicComicRow.model_fields
    )


@pytest.fixture
def statements(engine):
    seen: list[str] = []

    def record(conn, cursor, statement, *args):
        seen.append(statement)

    event.listen(engine.sync_engine, "before_cursor_execute", record)
    yield seen
    event.remove(engine.sync_engine, "before_cursor_execute", record)


async def test_the_shelf_reads_volumes_in_one_query_for_any_number_of_titles(
    sessionmaker_for_test, statements
):
    for n in range(12):
        await _seed(
            sessionmaker_for_test,
            _title(f"Title {n}"),
            lambda i: _volume(i, "vol-1", 0, line_number=1),
            lambda i: _volume(i, "vol-2", 1, line_number=2),
        )
    statements.clear()
    async with client_for(sessionmaker_for_test) as client:
        rows = (await client.get("/api/public/comics")).json()["series"]
    assert len(rows) == 12 and all(r["volumes_owned"] == 2 for r in rows)
    assert all(r["volume_numbers"] == [1, 2] for r in rows)
    # The line's own read filters on `owned`; the series runs' holds read
    # (`load_holds_many`) is one more, not one per title.
    owned = [q for q in statements if "comic_volumes.owned IS true" in q]
    assert len(owned) == 1
    assert len([q for q in statements if "FROM comic_volumes" in q]) == 2


async def test_the_new_field_names_dodge_the_smoke_private_keys(sessionmaker_for_test):
    smoke = (Path(__file__).resolve().parents[2] / "scripts" / "smoke.sh").read_text()
    line = next(ln for ln in smoke.splitlines() if ln.startswith("PRIVATE_KEYS="))
    private = re.compile(
        line.split("=", 1)[1].strip().strip("'").replace("[[:space:]]", r"\s")
    )
    assert private.search('{"price": 1}')  # the regex was really read
    item_id = await _seed(
        sessionmaker_for_test,
        _title(),
        lambda i: _volume(i, "vol-1", 0, line_number=1),
        lambda i: _volume(i, "vol-3", 1, line_number=3),
    )
    async with client_for(sessionmaker_for_test) as client:
        bodies = [
            (await client.get(f"/api/public/items/{item_id}")).text,
            (await client.get("/api/public/comics")).text,
        ]
    for text in bodies:
        assert private.search(text) is None, private.search(text)
    fields = (
        set(PublicTitleVolume.model_fields)
        | set(PublicVolumeSlot.model_fields)
        | {"kind", "volumes", "slots", "volumes_owned", "volume_numbers"}
    )
    assert not [f for f in fields if private.search(f'"{f}":')]


async def test_the_admin_wall_carries_the_same_block(sessionmaker_for_test):
    """`GET /api/comics/{id}/wall` shares the model: private titles too."""
    item_id = await _seed(
        sessionmaker_for_test,
        _title("Hidden", is_public=False),
        lambda i: _volume(i, "vol-2", 0, line_number=2),
        lambda i: _volume(i, "vol-5", 1, line_number=5, owned=False),
    )
    async with comics_client(sessionmaker_for_test, FakeComicVine()) as client:
        body = (await client.get(f"/api/comics/{item_id}/wall")).json()["comic"]
    assert body["kind"] == "single_book"
    assert body["volumes_owned"] == 1
    assert [v["slug"] for v in body["volumes"]] == ["vol-2"]
    assert KIND_FORBIDDEN.isdisjoint(set(_keys(body)))


async def test_the_comic_issues_index_carries_the_kind_for_the_prerender(
    sessionmaker_for_test,
):
    """`frontend/scripts/prerender-lib.mjs` builds link previews from
    comic-issues.json, not comics.json: the kind has to be in this body."""
    await _seed(
        sessionmaker_for_test,
        _title("Line"),
        lambda i: _volume(i, "vol-1", 0, line_number=1),
        lambda i: _volume(i, "vol-2", 1, line_number=2),
    )
    await _add(
        sessionmaker_for_test,
        _comic("Saga", issues_owned="1-3", source_metadata={"released": 5}),
    )
    async with client_for(sessionmaker_for_test) as client:
        body = (await client.get("/api/public/comic-issues")).json()
    assert {row["series_title"]: row["kind"] for row in body} == {
        "Line": "book_line",
        "Saga": "run",
    }
