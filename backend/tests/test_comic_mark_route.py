"""POST /api/comics/{id}/issues/{n}/mark: the one write behind every tap on a
cover (5c). The marks are the record; ranges and read_to follow."""

from __future__ import annotations

import pytest
from sqlalchemy import select

from comics import plan_mark, read_to_of
from models import ComicIssue, Item, ItemType, OwnedFormat
from tests.test_comic_marks_paths import marks
from tests.test_comics_routes import FakeComicVine
from tests.test_comics_routes import _seed as seed_comic
from tests.test_comics_routes import client_for as comics_client

pytestmark = pytest.mark.asyncio

EDITION = {"kind": "TPB", "label": "Book 1", "from": 3, "to": 4}


async def tap(client, item_id, n, state):
    return await client.post(
        f"/api/comics/{item_id}/issues/{n}/mark", json={"state": state}
    )


async def row(factory, item_id) -> Item:
    async with factory() as session:
        return await session.get(Item, item_id)


async def test_owned_adds_the_single_and_clears_a_skip(sessionmaker_for_test):
    item_id = await seed_comic(
        sessionmaker_for_test,
        owned_format=OwnedFormat.PHYSICAL,
        issues_owned="1",
        issues_skipped="2",
    )
    async with comics_client(sessionmaker_for_test, FakeComicVine()) as client:
        response = await tap(client, item_id, 2, "owned")
    assert response.status_code == 200, response.text
    assert response.json()["issues_owned"] == "1–2"
    assert response.json()["issues_skipped"] is None
    assert (response.json()["number"], response.json()["state"]) == (2, "owned")
    assert (await marks(sessionmaker_for_test, item_id))[2] == (True, False, False)


async def test_read_sets_owned_and_read_and_read_to_follows(sessionmaker_for_test):
    item_id = await seed_comic(
        sessionmaker_for_test, owned_format=OwnedFormat.PHYSICAL, issues_owned="1–3"
    )
    async with comics_client(sessionmaker_for_test, FakeComicVine()) as client:
        # Reading #2 first: #1 is unread, so read_to stays unset.
        await tap(client, item_id, 2, "read")
        assert (await row(sessionmaker_for_test, item_id)).read_to is None
        assert (await marks(sessionmaker_for_test, item_id))[2] == (True, True, False)
        # Reading #1 closes the gap: every owned issue up to 2 is read.
        await tap(client, item_id, 1, "read")
        assert (await row(sessionmaker_for_test, item_id)).read_to == 2
        await tap(client, item_id, 3, "read")
        assert (await row(sessionmaker_for_test, item_id)).read_to == 3
        # Unreading #2 (back to owned) drops the marker to #1.
        await tap(client, item_id, 2, "owned")
    assert (await row(sessionmaker_for_test, item_id)).read_to == 1
    got = await marks(sessionmaker_for_test, item_id)
    assert got[2] == (True, False, False) and got[3] == (True, True, False)


async def test_read_on_a_missing_issue_also_owns_it(sessionmaker_for_test):
    item_id = await seed_comic(sessionmaker_for_test, owned_format=OwnedFormat.PHYSICAL)
    async with comics_client(sessionmaker_for_test, FakeComicVine()) as client:
        response = await tap(client, item_id, 5, "read")
    assert response.json()["issues_owned"] == "5"
    assert (await marks(sessionmaker_for_test, item_id))[5] == (True, True, False)


async def test_missing_removes_the_single_and_its_read_mark(sessionmaker_for_test):
    item_id = await seed_comic(
        sessionmaker_for_test,
        owned_format=OwnedFormat.PHYSICAL,
        issues_owned="1–2",
        read_to=2,
    )
    async with comics_client(sessionmaker_for_test, FakeComicVine()) as client:
        await client.post("/api/comics/marks/backfill")  # reads follow read_to
        response = await tap(client, item_id, 2, "missing")
    assert response.json()["issues_owned"] == "1"
    assert (await row(sessionmaker_for_test, item_id)).read_to == 1
    # The stub with nothing left to mark is gone; #1 keeps its mark.
    assert await marks(sessionmaker_for_test, item_id) == {1: (True, True, False)}


async def test_undo_posts_the_previous_state_back(sessionmaker_for_test):
    item_id = await seed_comic(
        sessionmaker_for_test, owned_format=OwnedFormat.PHYSICAL, issues_owned="1–2"
    )
    async with comics_client(sessionmaker_for_test, FakeComicVine()) as client:
        await client.post("/api/comics/marks/backfill")
        before = await marks(sessionmaker_for_test, item_id)
        for state, previous in (("read", "owned"), ("missing", "owned")):
            await tap(client, item_id, 2, state)
            await tap(client, item_id, 2, previous)  # Undo
    assert await marks(sessionmaker_for_test, item_id) == before
    assert (await row(sessionmaker_for_test, item_id)).issues_owned == "1–2"


async def test_edition_held_cannot_go_missing_but_cycles_owned_and_read(
    sessionmaker_for_test,
):
    item_id = await seed_comic(
        sessionmaker_for_test,
        owned_format=OwnedFormat.PHYSICAL,
        issues_owned="1",
        editions=[EDITION],
    )
    async with comics_client(sessionmaker_for_test, FakeComicVine()) as client:
        refused = await tap(client, item_id, 3, "missing")
        assert refused.status_code == 409
        assert refused.json()["detail"] == (
            "In Book 1. Edit editions on the comic's page."
        )
        assert (await tap(client, item_id, 3, "read")).status_code == 200
        assert (await marks(sessionmaker_for_test, item_id))[3] == (True, True, False)
        assert (await tap(client, item_id, 3, "owned")).status_code == 200
    saved = await row(sessionmaker_for_test, item_id)
    assert saved.issues_owned == "1"  # never copied into the singles
    assert (await marks(sessionmaker_for_test, item_id))[3] == (True, False, False)


async def test_an_unknown_state_is_422_and_a_non_comic_404(sessionmaker_for_test):
    item_id = await seed_comic(sessionmaker_for_test, issues_owned="1")
    async with sessionmaker_for_test() as session:
        game = Item(type=ItemType.GAME, title="Zelda", status="backlog")
        session.add(game)
        await session.commit()
        game_id = game.id
    async with comics_client(sessionmaker_for_test, FakeComicVine()) as client:
        assert (await tap(client, item_id, 1, "skipped")).status_code == 422
        assert (await tap(client, game_id, 1, "owned")).status_code == 404


async def test_other_writes_keep_per_book_reads(sessionmaker_for_test):
    """Skip and Got it re-sync the marks; a read mark must survive them."""
    item_id = await seed_comic(
        sessionmaker_for_test, owned_format=OwnedFormat.PHYSICAL, issues_owned="1–3"
    )
    async with comics_client(sessionmaker_for_test, FakeComicVine()) as client:
        await tap(client, item_id, 3, "read")
        assert (
            await client.post(f"/api/comics/{item_id}/issues/9/skip")
        ).status_code == 200
        assert (
            await client.post(f"/api/comics/{item_id}/issues/4/got")
        ).status_code == 200
    got = await marks(sessionmaker_for_test, item_id)
    assert got[3] == (True, True, False)
    assert got[1] == (True, False, False)
    assert got[9] == (False, False, True)


async def test_an_explicit_read_to_still_derives_every_read(sessionmaker_for_test):
    """PATCH read_to marks every owned issue up to it read and clears above."""
    item_id = await seed_comic(
        sessionmaker_for_test, owned_format=OwnedFormat.PHYSICAL, issues_owned="1–4"
    )
    from tests.test_items_bulk import client_for as items_client

    async with comics_client(sessionmaker_for_test, FakeComicVine()) as client:
        await tap(client, item_id, 4, "read")
    async with items_client(sessionmaker_for_test) as client:
        patched = await client.patch(f"/api/items/{item_id}", json={"read_to": 2})
    assert patched.status_code == 200, patched.text
    got = await marks(sessionmaker_for_test, item_id)
    assert [got[n][1] for n in (1, 2, 3, 4)] == [True, True, False, False]


async def test_a_row_recorded_before_keeps_its_issues(sessionmaker_for_test):
    """Waterworld: #1-4 owned, no reads, marks backfilled. A tap on #5 and a
    re-sync leave #1-4 exactly as they were."""
    item_id = await seed_comic(
        sessionmaker_for_test, owned_format=OwnedFormat.PHYSICAL, issues_owned="1–4"
    )
    async with comics_client(sessionmaker_for_test, FakeComicVine()) as client:
        assert (await client.post("/api/comics/marks/backfill")).status_code == 200
        before = await marks(sessionmaker_for_test, item_id)
        await tap(client, item_id, 5, "owned")
        again = (await client.post("/api/comics/marks/backfill")).json()
    after = await marks(sessionmaker_for_test, item_id)
    assert {n: after[n] for n in (1, 2, 3, 4)} == before
    assert (await row(sessionmaker_for_test, item_id)).issues_owned == "1–5"
    assert again["mismatches"] == [] and again["rows_changed"] == 0


async def test_a_series_with_a_synced_row_keeps_it(sessionmaker_for_test):
    item_id = await seed_comic(
        sessionmaker_for_test, owned_format=OwnedFormat.PHYSICAL, issues_owned="1"
    )
    async with sessionmaker_for_test() as session:
        session.add(ComicIssue(item_id=item_id, number=2, cv_id=77))
        await session.commit()
    async with comics_client(sessionmaker_for_test, FakeComicVine()) as client:
        await tap(client, item_id, 2, "owned")
        await tap(client, item_id, 2, "missing")
    async with sessionmaker_for_test() as session:
        kept = await session.scalar(
            select(ComicIssue).where(
                ComicIssue.item_id == item_id, ComicIssue.number == 2
            )
        )
    assert kept is not None and (kept.owned, kept.read) == (False, False)


@pytest.mark.filterwarnings("ignore")
def test_read_to_of_and_plan_are_pure():
    assert read_to_of({1, 2, 4}, {1, 2, 4}) == 4
    assert read_to_of({1, 2, 4}, {2, 4}) is None
    change = plan_mark("1", None, None, set(), 3, "read")
    assert (change.issues_owned, change.read_to) == ("1, 3", None)


async def test_a_range_marks_a_whole_book_read(sessionmaker_for_test):
    item_id = await seed_comic(
        sessionmaker_for_test,
        owned_format=OwnedFormat.PHYSICAL,
        issues_owned="1",
        editions=[EDITION],
    )
    async with comics_client(sessionmaker_for_test, FakeComicVine()) as client:
        response = await client.post(
            f"/api/comics/{item_id}/issues/3/mark", json={"state": "read", "to": 4}
        )
        backwards = await client.post(
            f"/api/comics/{item_id}/issues/4/mark", json={"state": "read", "to": 3}
        )
    assert response.status_code == 200, response.text
    got = await marks(sessionmaker_for_test, item_id)
    assert got[3] == got[4] == (True, True, False)
    assert backwards.status_code == 422


async def test_the_admin_wall_serves_a_private_series_and_never_a_skip(
    sessionmaker_for_test,
):
    """The admin comic page draws the wall for a private series too."""
    item_id = await seed_comic(
        sessionmaker_for_test,
        owned_format=OwnedFormat.PHYSICAL,
        issues_owned="1–2",
        issues_skipped="3",
        is_public=False,
    )
    async with comics_client(sessionmaker_for_test, FakeComicVine()) as client:
        await client.post("/api/comics/marks/backfill")
        await tap(client, item_id, 2, "read")
        body = (await client.get(f"/api/comics/{item_id}/wall")).json()
        missing = await client.get(
            "/api/comics/00000000-0000-0000-0000-000000000000/wall"
        )
    assert missing.status_code == 404
    issues = {i["number"]: i for i in body["wall"]["issues"]}
    assert (issues[1]["owned"], issues[1]["read"]) == (True, False)
    assert (issues[2]["owned"], issues[2]["read"]) == (True, True)
    assert 3 not in issues  # a skipped stub is no page
    assert body["comic"]["read"] == 1 and body["comic"]["owned_text"] == "1–2"
    assert "skipped" not in str(body) and "issues_skipped" not in str(body)


async def test_missing_on_a_book_held_twice_keeps_its_read_mark():
    """Trade 1-6 with #3 also a single, #3 read: missing removes the single
    only; the trade still holds it, and it stays read."""
    edition = [{"kind": "TPB", "label": "Book 1", "from": 1, "to": 6}]
    change = plan_mark("3", None, edition, {3}, 3, "missing")
    assert change.issues_owned is None
    assert 3 in change.reads


async def test_a_number_with_no_row_gets_a_stub_and_shows_on_the_wall(
    sessionmaker_for_test,
):
    """A series Comic Vine has not synced, or a number past what it lists."""
    item_id = await seed_comic(
        sessionmaker_for_test, owned_format=OwnedFormat.PHYSICAL, is_public=True
    )
    async with comics_client(sessionmaker_for_test, FakeComicVine()) as client:
        response = await tap(client, item_id, 9999, "owned")
        wall = (await client.get(f"/api/comics/{item_id}/wall")).json()
    assert response.status_code == 200, response.text
    assert (await marks(sessionmaker_for_test, item_id))[9999] == (True, False, False)
    issue = next(i for i in wall["wall"]["issues"] if i["number"] == 9999)
    assert (issue["owned"], issue["cover_url"]) == (True, None)


async def test_a_tap_on_a_want_reports_what_it_moved_so_undo_can_restore(
    sessionmaker_for_test,
):
    item_id = await seed_comic(sessionmaker_for_test, owned_format=OwnedFormat.NONE)
    async with comics_client(sessionmaker_for_test, FakeComicVine()) as client:
        first = (await tap(client, item_id, 1, "owned")).json()
        second = (await tap(client, item_id, 2, "owned")).json()
    assert first["previous"] == {"owned_format": "none"}
    assert first["owned_format"] == "physical"
    assert second["previous"] is None
