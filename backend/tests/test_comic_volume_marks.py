"""#326: marks come from loose singles and owned volumes; the compat shim keeps
edition-origin volumes in step with items.editions; the volume write route."""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import select

from comics import (
    MarkRefused,
    VolumeHold,
    expand,
    held_ranges,
    held_through,
    holds_covering,
    load_holds,
    mark_plan,
    parse_ranges,
    plan_mark,
    shown_status,
    sync_marks,
    sync_volumes_from_editions,
    volume_counts,
    volume_reads,
)
from models import (
    ComicIssue,
    ComicVolume,
    ComicVolumeCollect,
    Item,
    ItemStatus,
    ItemType,
    OwnedFormat,
)
from tests.test_comics_routes import FakeComicVine, client_for

pytestmark = pytest.mark.asyncio


def ed(label, low, high, kind="TPB", **extra):
    return {"kind": kind, "label": label, "from": low, "to": high, **extra}


def hold(slug="vol-1", label="Book", owned=True, read=False, own=True, ranges=()):
    return VolumeHold(uuid.uuid4(), slug, label, owned, read, own, tuple(ranges))


async def make(factory, title="Saga", **fields) -> uuid.UUID:
    base = {
        "type": ItemType.COMIC,
        "title": title,
        "status": ItemStatus.BACKLOG,
        "owned_format": OwnedFormat.PHYSICAL,
    }
    async with factory() as session:
        item = Item(**(base | fields))
        session.add(item)
        await session.flush()
        await sync_marks(session, item)
        await session.commit()
        return item.id


async def marks(factory, item_id):
    async with factory() as session:
        rows = await session.scalars(
            select(ComicIssue)
            .where(ComicIssue.item_id == item_id)
            .order_by(ComicIssue.number)
        )
        return {r.number: (r.owned, r.read, r.skipped) for r in rows}


async def add_volume(
    factory, item_id, slug="vol-1", links=(), owned=True, read=False, label="Book"
) -> uuid.UUID:
    """A hand-made volume; `links` are (item_id | None, from, to) collects."""
    async with factory() as session:
        volume = ComicVolume(
            id=uuid.uuid4(), item_id=item_id, position=9, slug=slug, label=label,
            kind="trade", owned=owned, read=read,
        )  # fmt: skip
        session.add(volume)
        await session.flush()
        for position, (target, low, high) in enumerate(links):
            session.add(
                ComicVolumeCollect(
                    volume_id=volume.id,
                    position=position,
                    series_name="x",
                    issue_text="as written",
                    source="typed",
                    item_id=target,
                    from_number=low,
                    to_number=high,
                )  # fmt: skip
            )
        await session.commit()
        return volume.id


async def resync(factory, item_id):
    async with factory() as session:
        await sync_marks(session, await session.get(Item, item_id))
        await session.commit()


async def volumes(factory, item_id) -> list[ComicVolume]:
    async with factory() as session:
        return list(
            await session.scalars(
                select(ComicVolume)
                .where(ComicVolume.item_id == item_id)
                .order_by(ComicVolume.position, ComicVolume.slug)
            )
        )


# --- pure ---------------------------------------------------------------------


async def test_plan_marks_a_read_volume_read_without_read_to():
    plan = mark_plan("1", None, [{"from": 3, "to": 4, "label": "B"}], None, {3, 4})
    assert {n: m.read for n, m in plan.items()} == {1: False, 3: True, 4: True}


async def test_volume_helpers_count_only_owned_volumes_and_linked_ranges():
    holds = [
        hold("a", "A", ranges=[(1, 3)], read=True),
        hold("b", "B", owned=False, ranges=[(5, 6)], read=True),
        hold("c", "C", ranges=[]),  # text only: marks nothing
    ]
    assert held_ranges(holds) == [{"from": 1, "to": 3, "label": "A", "slug": "a"}]
    assert volume_reads(holds) == {1, 2, 3}
    assert holds_covering(holds, 2) == [{"slug": "a", "label": "A"}]
    assert holds_covering(holds, 5) == []  # not owned
    assert holds_covering(holds, 9) == []


async def test_a_single_and_a_volume_count_once():
    held = [{"from": 2, "to": 3, "label": "Book 1", "slug": "vol-1"}]
    plan = mark_plan("1-2", None, held, None)
    assert sorted(plan) == [1, 2, 3]


async def test_missing_on_a_volume_held_issue_names_the_volume():
    held = [{"from": 3, "to": 4, "label": "Omnibus One", "slug": "vol-1"}]
    with pytest.raises(MarkRefused, match="In Omnibus One"):
        plan_mark("1", None, held, [], 3, "missing")
    # held by a single as well: the single can go, the volume still holds it
    change = plan_mark("3", None, held, [3], 3, "missing")
    assert change.issues_owned is None
    assert change.reads == frozenset({3})


async def test_volume_counts_read_by_flag_or_by_every_linked_issue_read():
    holds = [
        hold("a", ranges=[(1, 2)]),  # all linked issues read
        hold("b", ranges=[(3, 4)]),  # not
        hold("c", ranges=[], read=True),  # flag
        hold("d", ranges=[]),  # text only, unread
        hold("e", own=False, ranges=[(1, 2)]),  # another title's book
        hold("f", owned=False, ranges=[(1, 2)]),
    ]
    assert volume_counts(holds, {1, 2}) == (4, 2)


def shown(**kw):
    base = dict(owned=5, read=5, released=5, ongoing=False, missing=0)
    return shown_status("backlog", **(base | kw))


async def test_shown_status_without_volumes_is_unchanged():
    assert shown() == ("finished", False)
    assert shown(read=4) == ("backlog", False)
    assert shown(owned=0, read=0) == ("backlog", False)


async def test_only_owned_unread_volumes_is_not_caught_up():
    assert shown(owned=0, read=0, volumes_owned=1, volumes_read=0) == (
        "backlog",
        False,
    )
    # every issue read but a volume unread: still unread
    assert shown(volumes_owned=2, volumes_read=1) == ("backlog", False)


async def test_caught_up_when_every_volume_and_issue_is_read():
    assert shown(volumes_owned=2, volumes_read=2) == ("finished", False)
    assert shown(ongoing=True, volumes_owned=1, volumes_read=1) == ("backlog", True)
    assert shown(owned=0, read=0, released=None, volumes_owned=1, volumes_read=1) == (
        "backlog",
        True,
    )


async def test_a_stored_override_wins_over_volumes():
    assert shown_status(
        "active", owned=0, read=0, released=1, ongoing=False, missing=1,
        volumes_owned=1, volumes_read=0,
    ) == ("active", False)  # fmt: skip


# --- the shim -----------------------------------------------------------------


async def test_shim_makes_one_volume_and_one_collect_per_edition(sessionmaker_for_test):
    item_id = await make(
        sessionmaker_for_test,
        editions=[
            ed("Book 1", 1, 6, kind="Hardcover", cv_id=99, cover_url="https://c/1"),
            ed("Book 2", 7, 7, kind="Weird", description=["a", "b"]),
        ],
    )
    rows = await volumes(sessionmaker_for_test, item_id)
    assert [(v.slug, v.label, v.kind, v.kind_raw, v.owned, v.read) for v in rows] == [
        ("ed-1-6", "Book 1", "hardcover", "Hardcover", True, False),
        ("ed-7-7", "Book 2", "trade", "Weird", True, False),
    ]
    assert rows[0].cv_id == 99 and rows[0].cover_url == "https://c/1"
    assert rows[1].description == "a\n\nb"
    async with sessionmaker_for_test() as session:
        collects = {
            c.volume_id: c for c in await session.scalars(select(ComicVolumeCollect))
        }
    first, second = (collects[v.id] for v in rows)
    assert (first.issue_text, first.item_id, first.from_number, first.to_number) == (
        "#1-6", item_id, 1, 6,
    )  # fmt: skip
    assert (second.issue_text, first.source) == ("#7", "migrated")


async def test_shim_is_idempotent_and_never_resets_read_or_owned(
    sessionmaker_for_test,
):
    item_id = await make(sessionmaker_for_test, editions=[ed("Book 1", 1, 2)])
    before = await volumes(sessionmaker_for_test, item_id)
    async with sessionmaker_for_test() as session:
        volume = await session.get(ComicVolume, before[0].id)
        volume.read, volume.owned = True, False
        await session.commit()
    for _ in range(2):
        await resync(sessionmaker_for_test, item_id)
    after = await volumes(sessionmaker_for_test, item_id)
    assert [v.id for v in after] == [v.id for v in before]
    assert (after[0].read, after[0].owned) == (True, False)
    async with sessionmaker_for_test() as session:
        assert len(list(await session.scalars(select(ComicVolumeCollect)))) == 1


async def test_shim_updates_a_changed_edition_and_drops_a_removed_one(
    sessionmaker_for_test,
):
    item_id = await make(
        sessionmaker_for_test, editions=[ed("Book 1", 1, 2), ed("Book 2", 3, 4)]
    )
    async with sessionmaker_for_test() as session:
        item = await session.get(Item, item_id)
        item.editions = [ed("Renamed", 1, 2)]
        await sync_marks(session, item)
        await session.commit()
    rows = await volumes(sessionmaker_for_test, item_id)
    assert [(v.slug, v.label) for v in rows] == [("ed-1-2", "Renamed")]
    async with sessionmaker_for_test() as session:
        assert len(list(await session.scalars(select(ComicVolumeCollect)))) == 1
    assert set(await marks(sessionmaker_for_test, item_id)) == {1, 2}


async def test_shim_never_touches_a_volume_that_is_not_edition_origin(
    sessionmaker_for_test,
):
    item_id = await make(sessionmaker_for_test, editions=[ed("Book 1", 1, 2)])
    hand = await add_volume(
        sessionmaker_for_test, item_id, "vol-1", [(item_id, 5, 6)], read=True
    )
    async with sessionmaker_for_test() as session:
        item = await session.get(Item, item_id)
        item.editions = None
        await sync_marks(session, item)
        await session.commit()
    rows = await volumes(sessionmaker_for_test, item_id)
    assert [(v.id, v.slug) for v in rows] == [(hand, "vol-1")]
    assert rows[0].read is True
    assert set(await marks(sessionmaker_for_test, item_id)) == {5, 6}


async def test_a_row_that_is_not_a_comic_has_no_edition_volumes(sessionmaker_for_test):
    item_id = await make(sessionmaker_for_test, editions=[ed("Book 1", 1, 2)])
    async with sessionmaker_for_test() as session:
        item = await session.get(Item, item_id)
        item.type = ItemType.GAME
        item.editions = None
        await sync_volumes_from_editions(session, item)
        await session.commit()
    assert await volumes(sessionmaker_for_test, item_id) == []


# --- marks equal what editions gave --------------------------------------------

FIXTURES = {
    "singles only": dict(issues_owned="1-3, 7", issues_skipped="5", read_to=2),
    "edition only": dict(editions=[ed("Book 1", 1, 6)], read_to=4),
    "overlapping editions": dict(
        editions=[ed("A", 1, 4), ed("B", 3, 8), ed("A again", 1, 4)], read_to=5
    ),
    "edition and singles": dict(
        issues_owned="1, 9-10",
        issues_skipped="2, 20",
        editions=[ed("Book 1", 2, 4)],
        read_to=1,
    ),
    "edition with cv_id": dict(
        editions=[ed("Book 1", 1, 3, cv_id=1234, cover_url="https://c/1")],
    ),
    "single edition issue": dict(editions=[ed("One shot", 5, 5)], read_to=9),
}


@pytest.mark.parametrize("name", FIXTURES)
async def test_marks_equal_the_old_editions_derivation(sessionmaker_for_test, name):
    fields = FIXTURES[name]
    item_id = await make(sessionmaker_for_test, **fields)
    # The oracle is the old rule, written out: held = singles + edition ranges,
    # read = held up to read_to, skipped = skipped and not held.
    held = expand(parse_ranges(fields.get("issues_owned")))
    for edition in fields.get("editions", []):
        held |= set(range(edition["from"], edition["to"] + 1))
    skipped = expand(parse_ranges(fields.get("issues_skipped"))) - held
    read_to = fields.get("read_to")
    expected = {
        n: (True, read_to is not None and n <= read_to, False) for n in held
    } | {n: (False, False, True) for n in skipped}
    assert await marks(sessionmaker_for_test, item_id) == expected
    # and a second sync (the backfill) changes nothing
    await resync(sessionmaker_for_test, item_id)
    assert await marks(sessionmaker_for_test, item_id) == expected


# --- volume sources ------------------------------------------------------------


async def test_owned_volume_holds_its_linked_issues_and_read_marks_them_read(
    sessionmaker_for_test,
):
    item_id = await make(sessionmaker_for_test, issues_owned="1")
    volume_id = await add_volume(
        sessionmaker_for_test, item_id, links=[(item_id, 3, 4)]
    )
    await resync(sessionmaker_for_test, item_id)
    assert await marks(sessionmaker_for_test, item_id) == {
        1: (True, False, False),
        3: (True, False, False),
        4: (True, False, False),
    }
    async with client_for(sessionmaker_for_test, FakeComicVine()) as client:
        response = await client.patch(
            f"/api/comics/volumes/{volume_id}", json={"read": True}
        )
    assert response.status_code == 200, response.text
    body = response.json()
    assert (body["owned"], body["read"], body["slug"]) == (True, True, "vol-1")
    assert body["touched"] == [str(item_id)]
    assert await marks(sessionmaker_for_test, item_id) == {
        1: (True, False, False),
        3: (True, True, False),
        4: (True, True, False),
    }
    async with sessionmaker_for_test() as session:
        # read_to follows the marks: #1 is unread, so the chain is empty
        assert (await session.get(Item, item_id)).read_to is None


async def test_unreading_a_volume_takes_its_issues_back(sessionmaker_for_test):
    item_id = await make(sessionmaker_for_test, issues_owned="1")
    first = await add_volume(sessionmaker_for_test, item_id, "vol-1", [(item_id, 3, 4)])
    second = await add_volume(
        sessionmaker_for_test, item_id, "vol-2", [(item_id, 4, 5)]
    )
    async with client_for(sessionmaker_for_test, FakeComicVine()) as client:
        for volume_id in (first, second):
            await client.patch(f"/api/comics/volumes/{volume_id}", json={"read": True})
        await client.patch(f"/api/comics/volumes/{first}", json={"read": False})
    # #4 stays read through the second volume, #3 goes back
    assert (await marks(sessionmaker_for_test, item_id)) == {
        1: (True, False, False),
        3: (True, False, False),
        4: (True, True, False),
        5: (True, True, False),
    }


async def test_disowning_a_volume_drops_issues_held_only_through_it(
    sessionmaker_for_test,
):
    item_id = await make(sessionmaker_for_test, issues_owned="1")
    volume_id = await add_volume(
        sessionmaker_for_test, item_id, links=[(item_id, 1, 2)]
    )
    await resync(sessionmaker_for_test, item_id)
    async with client_for(sessionmaker_for_test, FakeComicVine()) as client:
        response = await client.patch(
            f"/api/comics/volumes/{volume_id}", json={"owned": False}
        )
        assert response.json()["comic_run"]["owned"] == 1
    # #1 is still a single; #2 was only in the volume (a stub with no mark goes)
    assert await marks(sessionmaker_for_test, item_id) == {1: (True, False, False)}
    # the write survives a reload
    assert (await volumes(sessionmaker_for_test, item_id))[0].owned is False


async def test_a_text_only_volume_can_be_owned_and_read_and_marks_nothing(
    sessionmaker_for_test,
):
    item_id = await make(sessionmaker_for_test, issues_owned="1")
    unlinked = await add_volume(sessionmaker_for_test, item_id, "vol-1", [(None, 1, 2)])
    no_numbers = await add_volume(
        sessionmaker_for_test, item_id, "vol-2", [(item_id, None, None)]
    )
    async with client_for(sessionmaker_for_test, FakeComicVine()) as client:
        for volume_id in (unlinked, no_numbers):
            response = await client.patch(
                f"/api/comics/volumes/{volume_id}", json={"owned": True, "read": True}
            )
            assert response.status_code == 200, response.text
    assert await marks(sessionmaker_for_test, item_id) == {1: (True, False, False)}
    assert all(v.read for v in await volumes(sessionmaker_for_test, item_id))


async def test_a_cross_series_link_marks_the_other_titles_issues(
    sessionmaker_for_test,
):
    book = await make(sessionmaker_for_test, "Crossover Book")
    other = await make(
        sessionmaker_for_test, "Other Run", issues_owned="1", external_id="2"
    )
    volume_id = await add_volume(
        sessionmaker_for_test, book, "vol-1", [(other, 2, 3), (book, 7, 7)]
    )
    async with client_for(sessionmaker_for_test, FakeComicVine()) as client:
        response = await client.patch(
            f"/api/comics/volumes/{volume_id}", json={"read": True}
        )
    assert response.status_code == 200, response.text
    assert sorted(response.json()["touched"]) == sorted([str(book), str(other)])
    assert await marks(sessionmaker_for_test, other) == {
        1: (True, False, False),
        2: (True, True, False),
        3: (True, True, False),
    }
    assert await marks(sessionmaker_for_test, book) == {7: (True, True, False)}
    async with sessionmaker_for_test() as session:
        # a later sync of the other title keeps what the volume gave it
        await sync_marks(session, await session.get(Item, other))
        holds = await load_holds(session, other)
        assert [(h.slug, h.own, h.ranges) for h in holds] == [
            ("vol-1", False, ((2, 3),))
        ]
        assert [h["label"] for h in await held_through(session, other, 3)] == ["Book"]
        assert await held_through(session, other, 1) == []
    assert (await marks(sessionmaker_for_test, other))[3] == (True, True, False)


async def test_held_through_lists_owned_volumes_only(sessionmaker_for_test):
    item_id = await make(sessionmaker_for_test, issues_owned="3")
    await add_volume(sessionmaker_for_test, item_id, "vol-1", [(item_id, 3, 4)])
    await add_volume(
        sessionmaker_for_test, item_id, "vol-2", [(item_id, 3, 3)], owned=False
    )
    async with sessionmaker_for_test() as session:
        assert await held_through(session, item_id, 3) == [
            {"slug": "vol-1", "label": "Book"}
        ]


async def test_the_mark_route_refuses_missing_on_a_volume_held_issue(
    sessionmaker_for_test,
):
    item_id = await make(sessionmaker_for_test, issues_owned="1")
    await add_volume(
        sessionmaker_for_test, item_id, "vol-1", [(item_id, 3, 4)], label="Big Book"
    )
    async with client_for(sessionmaker_for_test, FakeComicVine()) as client:
        refused = await client.post(
            f"/api/comics/{item_id}/issues/3/mark", json={"state": "missing"}
        )
        skipped = await client.post(f"/api/comics/{item_id}/issues/4/skip")
    assert refused.status_code == 409
    assert refused.json()["detail"] == "In Big Book. Edit the volume to change it."
    assert skipped.status_code == 409


async def test_volume_route_errors(sessionmaker_for_test):
    item_id = await make(sessionmaker_for_test)
    volume_id = await add_volume(sessionmaker_for_test, item_id)
    async with client_for(sessionmaker_for_test, FakeComicVine()) as client:
        empty = await client.patch(f"/api/comics/volumes/{volume_id}", json={})
        missing = await client.patch(
            f"/api/comics/volumes/{uuid.uuid4()}", json={"read": True}
        )
        extra = await client.patch(
            f"/api/comics/volumes/{volume_id}", json={"label": "x"}
        )
    assert (empty.status_code, missing.status_code, extra.status_code) == (
        422,
        404,
        422,
    )


# --- review fixes ---------------------------------------------------------------


async def patch_volume(factory, volume_id, **body):
    async with client_for(factory, FakeComicVine()) as client:
        return await client.patch(f"/api/comics/volumes/{volume_id}", json=body)


async def edit_editions(factory, item_id, editions):
    async with factory() as session:
        item = await session.get(Item, item_id)
        item.editions = editions
        await sync_marks(session, item)
        await session.commit()


async def test_admin_state_and_pull_list_follow_an_unowned_volume(
    sessionmaker_for_test,
):
    item_id = await make(
        sessionmaker_for_test,
        issues_owned="1",
        following=True,
        editions=[ed("Book 1", 3, 4)],
    )
    (volume,) = await volumes(sessionmaker_for_test, item_id)
    response = await patch_volume(sessionmaker_for_test, volume.id, owned=False)
    assert response.json()["comic_run"]["owned"] == 1
    async with client_for(sessionmaker_for_test, FakeComicVine()) as client:
        listed = await client.get("/api/items")
        got = await client.post(f"/api/comics/{item_id}/issues/9/skip")
        pulled = await client.get("/api/comics/pull-list")
    assert got.json()["comic_run"]["owned"] == 1
    assert pulled.status_code == 200
    row = next(i for i in listed.json() if i["id"] == str(item_id))
    assert row["comic_run"]["owned"] == 1


async def test_owned_and_read_survive_a_changed_range(sessionmaker_for_test):
    item_id = await make(sessionmaker_for_test, editions=[ed("Book 1", 1, 3)])
    (volume,) = await volumes(sessionmaker_for_test, item_id)
    await patch_volume(sessionmaker_for_test, volume.id, owned=False)
    await edit_editions(sessionmaker_for_test, item_id, [ed("Book 1", 1, 4)])
    (after,) = await volumes(sessionmaker_for_test, item_id)
    assert (after.id, after.slug, after.owned) == (volume.id, "ed-1-4", False)
    assert await marks(sessionmaker_for_test, item_id) == {}
    await patch_volume(sessionmaker_for_test, volume.id, owned=True, read=True)
    await edit_editions(sessionmaker_for_test, item_id, [ed("Renamed", 2, 5)])
    (again,) = await volumes(sessionmaker_for_test, item_id)
    assert (again.id, again.slug, again.read, again.owned) == (
        volume.id, "ed-2-5", True, True,
    )  # fmt: skip
    assert set(await marks(sessionmaker_for_test, item_id)) == {2, 3, 4, 5}


async def test_same_range_duplicates_keep_their_flags_when_reordered(
    sessionmaker_for_test,
):
    a, b = ed("A", 1, 3, cv_id=None), ed("B", 1, 3)
    item_id = await make(sessionmaker_for_test, editions=[a, b])
    first, second = await volumes(sessionmaker_for_test, item_id)
    await patch_volume(sessionmaker_for_test, second.id, owned=False)
    await edit_editions(sessionmaker_for_test, item_id, [b, a])
    rows = {v.label: v for v in await volumes(sessionmaker_for_test, item_id)}
    assert rows["B"].id == second.id and rows["B"].owned is False
    assert rows["A"].id == first.id and rows["A"].owned is True
    assert sorted(v.slug for v in rows.values()) == ["ed-1-3", "ed-1-3-2"]


async def test_volume_route_404s_when_the_shim_drops_the_volume(
    sessionmaker_for_test,
):
    item_id = await make(sessionmaker_for_test, editions=[ed("Book 1", 1, 3)])
    (volume,) = await volumes(sessionmaker_for_test, item_id)
    async with sessionmaker_for_test() as session:  # drift: no sync after
        item = await session.get(Item, item_id)
        item.editions = None
        await session.commit()
    response = await patch_volume(sessionmaker_for_test, volume.id, read=True)
    assert response.status_code == 404


async def test_reading_an_unowned_volume_marks_nothing(sessionmaker_for_test):
    item_id = await make(sessionmaker_for_test, issues_owned="1")
    volume_id = await add_volume(
        sessionmaker_for_test, item_id, links=[(item_id, 3, 4)], owned=False
    )
    response = await patch_volume(sessionmaker_for_test, volume_id, read=True)
    assert response.status_code == 200
    assert await marks(sessionmaker_for_test, item_id) == {1: (True, False, False)}


async def test_unreading_a_volume_keeps_what_singles_still_read(
    sessionmaker_for_test,
):
    item_id = await make(sessionmaker_for_test, issues_owned="1-4", read_to=4)
    volume_id = await add_volume(
        sessionmaker_for_test, item_id, links=[(item_id, 3, 4)]
    )
    await patch_volume(sessionmaker_for_test, volume_id, read=True)
    await patch_volume(sessionmaker_for_test, volume_id, read=False)
    assert all(m[1] for m in (await marks(sessionmaker_for_test, item_id)).values())


async def test_volume_counts_count_read_to_without_read_rows(sessionmaker_for_test):
    holds = [hold("a", ranges=[(1, 3)])]
    assert volume_counts(holds, set(), read_to=3) == (1, 1)
    assert volume_counts(holds, set(), read_to=2) == (1, 0)
    assert volume_counts(holds, set()) == (1, 0)
