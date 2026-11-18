"""A collected book commits as a volume (#328): sitting and add bar, the
contents it writes, idempotence, and Check's preview agreeing with the commit.

No model is called anywhere on this path: the contents are read by rules only.
"""

from __future__ import annotations

import uuid
from datetime import date

import pytest
from sqlalchemy import select

import comic_contents
from intake.commit import commit_one
from models import (
    ComicIssue,
    ComicVolume,
    ComicVolumeCollect,
    IntakeEntry,
    IntakeEntryState,
    IntakeSitting,
    Item,
    ItemType,
)
from tests.test_intake_commit import (
    _book,
    _collects,
    _commit,
    _count,
    _items,
    _match,
    _seed,
    _seed_series,
    _series,
    _trade,
    _volumes,
    client_for,
)

S = IntakeEntryState


@pytest.fixture(autouse=True)
def no_model(monkeypatch):
    """The contents are read by rules: any model step is a failure."""
    calls = []

    def refuse(*args, **kwargs):
        calls.append(args)
        raise AssertionError("the model must not be called by a commit")

    for name in ("model_prompt", "model_source", "validate_model"):
        monkeypatch.setattr(comic_contents, name, refuse)
    yield calls
    assert calls == []


def _run(count=12, **extra) -> dict:
    """A Comic Vine volume with a known issue count, as `chosen`."""
    return {**_series(), "issue_count": count, **extra}


async def _marks(factory, item_id) -> dict[int, tuple[bool, bool]]:
    async with factory() as session:
        rows = await session.execute(
            select(ComicIssue.number, ComicIssue.owned, ComicIssue.read).where(
                ComicIssue.item_id == item_id
            )
        )
        return {n: (owned, read) for n, owned, read in rows}


async def _commit_book(factory, payload, chosen, state=S.EXACT):
    sitting_id = await _seed(factory, entries=[("comic", state, payload, chosen)])
    async with client_for(factory) as client:
        response = await _commit(client, sitting_id)
    assert response.status_code == 200, response.text
    return response.json()


def _pairs(rows) -> list[tuple]:
    return [
        (c.series_name, c.issue_text, c.source, c.from_number, c.to_number)
        for c in rows
    ]


# --- A book with a series match ---------------------------------------------


@pytest.mark.asyncio
async def test_a_collected_book_is_a_volume_with_linked_contents_and_marks(
    sessionmaker_for_test,
):
    payload = _trade(1, 6, kind="hardcover", detected_title="Waterworld Deluxe")
    payload["line_number"] = 2
    body = await _commit_book(sessionmaker_for_test, payload, _run())
    [item] = await _items(sessionmaker_for_test)
    [volume] = await _volumes(sessionmaker_for_test)
    assert (volume.item_id, volume.slug, volume.position) == (item.id, "vol-1", 0)
    assert (volume.label, volume.kind, volume.line_number) == (
        "Waterworld Deluxe",
        "hardcover",
        2,
    )
    assert (volume.owned, volume.read, volume.edited) == (True, False, True)
    assert volume.intake_entry_id is not None
    assert _pairs(await _collects(sessionmaker_for_test, volume)) == [
        ("Waterworld", "#1-6", "photo", 1, 6)
    ]
    # Never an editions row; the link is what holds issues 1-6.
    assert item.issues_owned is None
    marks = await _marks(sessionmaker_for_test, item.id)
    assert {n for n, (owned, _) in marks.items() if owned} == {1, 2, 3, 4, 5, 6}
    assert body["volumes_new"] == [
        {
            "id": str(volume.id),
            "slug": "vol-1",
            "label": "Waterworld Deluxe",
            "kind": "hardcover",
            "line_number": 2,
            "title": "Waterworld",
            "title_id": str(item.id),
            "title_created": True,
        }
    ]
    assert body["titles_created"] == [{"id": str(item.id), "title": "Waterworld"}]
    assert item.is_public is False  # new titles are private


@pytest.mark.asyncio
async def test_a_book_on_a_series_already_on_the_shelf_is_a_volume_not_a_title(
    sessionmaker_for_test,
):
    await _seed_series(sessionmaker_for_test, issues_owned="9", issues_skipped="2, 8")
    body = await _commit_book(
        sessionmaker_for_test, _trade(1, 6), _run(), state=S.OWNED
    )
    [item] = await _items(sessionmaker_for_test)
    [volume] = await _volumes(sessionmaker_for_test)
    assert volume.item_id == item.id
    assert body["titles_created"] == []
    assert body["volumes_new"][0]["title_created"] is False
    [grew] = body["series_grew"]
    assert grew["books_added"] == []
    assert item.issues_skipped == "8"  # the book holds #2 now


@pytest.mark.asyncio
async def test_a_title_with_old_edition_volumes_is_unaffected(sessionmaker_for_test):
    held = [{"kind": "Trade", "label": "Vol. 1", "from": 1, "to": 3}]
    await _seed_series(sessionmaker_for_test, editions=held)
    await _commit_book(sessionmaker_for_test, _trade(4, 6), _run(), state=S.OWNED)
    [item] = await _items(sessionmaker_for_test)
    assert sorted(v.slug for v in await _volumes(sessionmaker_for_test)) == [
        "ed-1-3",
        "vol-1",
    ]


@pytest.mark.asyncio
async def test_a_reprint_note_adds_photo_entries_without_repeating_the_range(
    sessionmaker_for_test,
):
    payload = _trade(1, 3, reprint_note="Collects Waterworld #1-3 and Hellboy #4.")
    await _commit_book(sessionmaker_for_test, payload, _run())
    [volume] = await _volumes(sessionmaker_for_test)
    assert _pairs(await _collects(sessionmaker_for_test, volume)) == [
        ("Waterworld", "#1-3", "photo", 1, 3),
        ("Hellboy", "#4", "photo", None, None),
    ]


@pytest.mark.asyncio
async def test_a_reprint_note_alone_writes_its_entries_with_the_contents_bound(
    sessionmaker_for_test,
):
    note = "Collects Waterworld #1-3, Waterworld #40-50 and Waterworld (2001) #5."
    await _commit_book(
        sessionmaker_for_test, _trade(None, None, reprint_note=note), _run(12)
    )
    [volume] = await _volumes(sessionmaker_for_test)
    rows = _pairs(await _collects(sessionmaker_for_test, volume))
    by_text = {text: (lo, hi) for _, text, _, lo, hi in rows}
    assert by_text["#1-3"] == (1, 3)  # own title, inside the 12 issues
    assert by_text["#40-50"] == (None, None)  # beyond the run: text only
    assert [r for r in rows if "5" in r[1] and r[3] is not None] == []  # wrong year


@pytest.mark.asyncio
async def test_the_issue_count_of_a_series_on_the_shelf_bounds_the_links(
    sessionmaker_for_test,
):
    await _seed_series(sessionmaker_for_test, source_metadata={"issue_count": 4})
    payload = _trade(1, 6, reprint_note="Collects Waterworld #1-3 and #5-6.")
    await _commit_book(sessionmaker_for_test, payload, _series(), state=S.OWNED)
    [volume] = await _volumes(sessionmaker_for_test)
    rows = _pairs(await _collects(sessionmaker_for_test, volume))
    # The printed range is the owner's reading and links; the note's #1-3
    # repeats nothing of "#1-6" and links inside 4; "#5-6" is beyond it.
    assert ("Waterworld", "#1-6", "photo", 1, 6) in rows
    assert ("Waterworld", "#1-3", "photo", 1, 3) in rows
    assert ("Waterworld", "#5-6", "photo", None, None) in rows


@pytest.mark.asyncio
async def test_a_book_with_no_range_has_no_contents_and_still_a_volume(
    sessionmaker_for_test,
):
    await _commit_book(sessionmaker_for_test, _trade(None, None), _run())
    [volume] = await _volumes(sessionmaker_for_test)
    assert await _collects(sessionmaker_for_test, volume) == []


@pytest.mark.asyncio
async def test_the_kind_and_label_defaults(sessionmaker_for_test):
    book = _trade(None, None, kind="ogn")
    book.pop("detected_title")
    await _commit_book(sessionmaker_for_test, book, _run())
    [volume] = await _volumes(sessionmaker_for_test)
    assert (volume.kind, volume.label) == ("ogn", "Waterworld")
    # A stored kind this build does not know is a trade, never a failed write.
    book = _trade(
        None, None, kind="mystery", detected_title="Waterworld " + "Deluxe " * 30
    )
    await _commit_book(sessionmaker_for_test, book, _run())
    last = (await _volumes(sessionmaker_for_test))[-1]
    assert (last.kind, len(last.label)) == ("trade", 80)


@pytest.mark.asyncio
async def test_two_different_books_with_the_same_range_are_two_volumes(
    sessionmaker_for_test,
):
    entries = [
        ("comic", S.EXACT, _trade(1, 6, detected_title="Vol. 1"), _run()),
        (
            "comic",
            S.EXACT,
            _trade(1, 6, kind="hardcover", detected_title="HC"),
            _run(),
        ),
    ]
    sitting_id = await _seed(sessionmaker_for_test, entries=entries)
    async with client_for(sessionmaker_for_test) as client:
        response = await _commit(client, sitting_id)
    assert len(response.json()["volumes_new"]) == 2
    volumes = await _volumes(sessionmaker_for_test)
    assert sorted(v.slug for v in volumes) == ["vol-1", "vol-2"]
    assert sorted(v.position for v in volumes) == [0, 1]
    for volume in volumes:
        assert len(await _collects(sessionmaker_for_test, volume)) == 1
    assert await _count(sessionmaker_for_test, Item) == 1


# --- A book with no series match --------------------------------------------


@pytest.mark.asyncio
async def test_a_book_with_no_match_is_a_new_private_title_with_a_volume(
    sessionmaker_for_test,
):
    payload = _trade(1, 6, kind="ogn", detected_title="Blankets")
    body = await _commit_book(sessionmaker_for_test, payload, None)
    [item] = await _items(sessionmaker_for_test)
    assert (item.type, item.title) == (ItemType.COMIC, "Blankets")
    assert (item.external_source, item.external_id) == (None, None)
    assert item.is_public is False and item.status.value == "backlog"
    [volume] = await _volumes(sessionmaker_for_test)
    assert (volume.item_id, volume.kind, volume.label) == (item.id, "ogn", "Blankets")
    # No series to point at: the printed range is text, never a link.
    assert _pairs(await _collects(sessionmaker_for_test, volume)) == [
        ("Blankets", "#1-6", "photo", None, None)
    ]
    assert body["added"] == 1
    assert body["titles_created"] == [{"id": str(item.id), "title": "Blankets"}]
    assert body["volumes_new"][0]["title_created"] is True
    assert await _marks(sessionmaker_for_test, item.id) == {}  # holds no issue


@pytest.mark.asyncio
async def test_books_of_one_unmatched_name_share_one_title(sessionmaker_for_test):
    entries = [
        ("comic", S.TYPED, _trade(None, None, detected_title="Berserk"), None),
        ("comic", S.TYPED, _trade(None, None, detected_title="BERSERK"), None),
        ("comic", S.TYPED, _trade(None, None, detected_title="Maus"), None),
    ]
    sitting_id = await _seed(sessionmaker_for_test, entries=entries)
    async with client_for(sessionmaker_for_test) as client:
        response = await _commit(client, sitting_id)
    assert response.status_code == 200, response.text
    body = response.json()
    assert await _count(sessionmaker_for_test, Item) == 2
    assert len(body["titles_created"]) == 2 and len(body["volumes_new"]) == 3
    per_title = {}
    for volume in await _volumes(sessionmaker_for_test):
        per_title.setdefault(volume.item_id, []).append(volume.slug)
    assert sorted(sorted(v) for v in per_title.values()) == [
        ["vol-1"],
        ["vol-1", "vol-2"],
    ]


@pytest.mark.asyncio
async def test_a_reprint_note_on_an_unmatched_book_is_text_only(sessionmaker_for_test):
    payload = _trade(1, 3, detected_title="Maus", reprint_note="Collects Maus #1-3.")
    await _commit_book(sessionmaker_for_test, payload, None)
    [volume] = await _volumes(sessionmaker_for_test)
    rows = await _collects(sessionmaker_for_test, volume)
    assert [(c.issue_text, c.item_id) for c in rows] == [("#1-3", None)]


# --- Idempotence -------------------------------------------------------------


async def _recommit(factory, entry_ids, payload, chosen, **extra):
    """The same entries, again, in a sitting of their own."""
    async with factory() as session:
        sitting = IntakeSitting(area="shelf")
        session.add(sitting)
        await session.flush()
        for entry_id in entry_ids:
            session.add(
                IntakeEntry(
                    id=entry_id,
                    sitting_id=sitting.id,
                    kind="comic",
                    state=S.EXACT,
                    payload=payload,
                    chosen=chosen,
                )
            )
        await session.commit()
        sitting_id = sitting.id
    async with client_for(factory) as client:
        return await _commit(client, sitting_id)


@pytest.mark.asyncio
async def test_committing_the_same_entry_again_makes_no_second_volume(
    sessionmaker_for_test,
):
    payload = _trade(1, 6, reprint_note="Collects Waterworld #1-6 and Hellboy #2.")
    sitting_id = await _seed(
        sessionmaker_for_test, entries=[("comic", S.EXACT, payload, _run())]
    )
    async with sessionmaker_for_test() as session:
        entry_id = await session.scalar(
            select(IntakeEntry.id).where(IntakeEntry.sitting_id == sitting_id)
        )
    async with client_for(sessionmaker_for_test) as client:
        first = await _commit(client, sitting_id)
    assert len(first.json()["volumes_new"]) == 1
    for _ in range(2):
        again = await _recommit(sessionmaker_for_test, [entry_id], payload, _run())
        assert again.status_code == 200, again.text
        assert again.json()["volumes_new"] == []
        assert again.json()["titles_created"] == []
    assert await _count(sessionmaker_for_test, ComicVolume) == 1
    assert await _count(sessionmaker_for_test, ComicVolumeCollect) == 2
    assert await _count(sessionmaker_for_test, Item) == 1


@pytest.mark.asyncio
async def test_an_unmatched_book_committed_again_makes_no_second_title(
    sessionmaker_for_test,
):
    payload = _trade(None, None, detected_title="Maus")
    sitting_id = await _seed(
        sessionmaker_for_test, entries=[("comic", S.TYPED, payload, None)]
    )
    async with sessionmaker_for_test() as session:
        entry_id = await session.scalar(select(IntakeEntry.id))
    async with client_for(sessionmaker_for_test) as client:
        await _commit(client, sitting_id)
    again = await _recommit(sessionmaker_for_test, [entry_id], payload, None)
    assert again.status_code == 200, again.text
    assert (
        await _count(sessionmaker_for_test, Item),
        await _count(sessionmaker_for_test, ComicVolume),
    ) == (1, 1)


@pytest.mark.asyncio
async def test_a_second_writer_winning_the_unique_index_is_not_an_error(
    sessionmaker_for_test, monkeypatch
):
    """The commit looked, found no volume, and a second writer inserted one
    before this one did: the unique `intake_entry_id` refuses the insert and
    the commit takes the winner's volume instead of failing or doubling."""
    payload = _trade(1, 6)
    sitting_id = await _seed(
        sessionmaker_for_test, entries=[("comic", S.EXACT, payload, _run())]
    )
    async with sessionmaker_for_test() as session:
        entry_id = await session.scalar(select(IntakeEntry.id))
    async with client_for(sessionmaker_for_test) as client:
        await _commit(client, sitting_id)

    async def blind(session, entry_ids):
        return {}

    monkeypatch.setattr("intake.commit.existing_volumes", blind)
    again = await _recommit(sessionmaker_for_test, [entry_id], payload, _run())
    assert again.status_code == 200, again.text
    assert again.json()["volumes_new"] == []
    assert await _count(sessionmaker_for_test, ComicVolume) == 1


@pytest.mark.asyncio
async def test_the_add_bar_book_is_once_per_entry_id(sessionmaker_for_test):
    entry_id = uuid.uuid4()
    for expected in (1, 0):
        async with sessionmaker_for_test() as session:
            outcome = await commit_one(
                session,
                "comic",
                chosen=_run(),
                payload=_trade(1, 6),
                today=date(2026, 11, 17),
                entry_id=entry_id,
            )
            await session.commit()
        assert len(outcome.volumes_new) == expected
    assert await _count(sessionmaker_for_test, ComicVolume) == 1


# --- Singles are as they were --------------------------------------------------


@pytest.mark.asyncio
async def test_a_single_issue_writes_an_issue_and_no_volume(sessionmaker_for_test):
    body = await _commit_book(sessionmaker_for_test, _book(3), _run())
    [item] = await _items(sessionmaker_for_test)
    assert item.issues_owned == "3"
    assert await _count(sessionmaker_for_test, ComicVolume) == 0
    assert body["volumes_new"] == [] and body["titles_created"] == []


@pytest.mark.asyncio
async def test_singles_and_a_book_of_one_series_in_one_sitting(sessionmaker_for_test):
    entries = [
        ("comic", S.EXACT, _book(7), _run()),
        ("comic", S.EXACT, _trade(1, 6), _run()),
    ]
    sitting_id = await _seed(sessionmaker_for_test, entries=entries)
    async with client_for(sessionmaker_for_test) as client:
        response = await _commit(client, sitting_id)
    assert response.status_code == 200, response.text
    [item] = await _items(sessionmaker_for_test)
    assert item.issues_owned == "7"
    assert await _count(sessionmaker_for_test, ComicVolume) == 1
    marks = await _marks(sessionmaker_for_test, item.id)
    assert {n for n, (owned, _) in marks.items() if owned} == {1, 2, 3, 4, 5, 6, 7}


# --- The add bar ---------------------------------------------------------------


@pytest.mark.asyncio
async def test_the_add_bar_adds_a_book_as_a_volume(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        first = await client.post(
            "/api/intake/add",
            json={
                "kind": "comic",
                "chosen": _run(),
                "payload": {
                    "format": "collected",
                    "edition_kind": "compendium",
                    "collects_from": 1,
                    "collects_to": 6,
                    "detected_title": "Compendium One",
                },
            },
        )
    assert first.status_code == 201, first.text
    body = first.json()
    [volume] = body["volumes_new"]
    assert (volume["label"], volume["kind"], volume["title_created"]) == (
        "Compendium One",
        "compendium",
        True,
    )
    assert body["titles_created"][0]["title"] == "Waterworld"
    [item] = await _items(sessionmaker_for_test)
    marks = await _marks(sessionmaker_for_test, item.id)
    assert {n for n, (owned, _) in marks.items() if owned} == {1, 2, 3, 4, 5, 6}


@pytest.mark.asyncio
async def test_the_add_bar_book_with_no_match_makes_a_title(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test) as client:
        response = await client.post(
            "/api/intake/add",
            json={
                "kind": "comic",
                "payload": {
                    "title": "Blankets",
                    "format": "collected",
                    "edition_kind": "ogn",
                },
            },
        )
    assert response.status_code == 201, response.text
    [item] = await _items(sessionmaker_for_test)
    assert (item.title, item.is_public) == ("Blankets", False)
    [volume] = await _volumes(sessionmaker_for_test)
    assert (volume.kind, volume.label) == ("ogn", "Blankets")


@pytest.mark.asyncio
async def test_the_add_bar_book_on_a_shelf_series_grows_it(sessionmaker_for_test):
    await _seed_series(sessionmaker_for_test, issues_owned="1")
    async with client_for(sessionmaker_for_test) as client:
        response = await client.post(
            "/api/intake/add",
            json={
                "kind": "comic",
                "chosen": _run(),
                "payload": {
                    "format": "collected",
                    "collects_from": 2,
                    "collects_to": 4,
                },
            },
        )
    body = response.json()
    assert response.status_code == 200, response.text
    assert (body["added"], body["already_owned"]) == (0, 0)
    assert len(body["volumes_new"]) == 1 and body["titles_created"] == []
    assert len(body["series_grew"]) == 1


# --- Check's preview is what the commit writes ----------------------------------

SCENARIOS = {
    "matched range": (_trade(1, 6), _run(), None),
    "matched range and note": (
        _trade(1, 3, reprint_note="Collects Waterworld #1-3 and Hellboy #4."),
        _run(),
        None,
    ),
    "note beyond the run": (
        _trade(None, None, reprint_note="Collects Waterworld #1-3, #20-30."),
        _run(10),
        None,
    ),
    "no series match": (
        _trade(1, 6, detected_title="Blankets", kind="ogn"),
        None,
        None,
    ),
    "unmatched with a note": (
        _trade(None, None, detected_title="Maus", reprint_note="Collects Maus #1-3."),
        None,
        None,
    ),
    "on the shelf, count known": (
        _trade(1, 4, reprint_note="Collects Waterworld #1-2 and #7-9."),
        _series(),
        {"source_metadata": {"issue_count": 5}, "year": 2020},
    ),
    "a year that is not the title's": (
        _trade(None, None, reprint_note="Collects Waterworld (1999) #1-3."),
        _run(),
        None,
    ),
}


@pytest.mark.asyncio
@pytest.mark.parametrize("name", list(SCENARIOS))
async def test_check_previews_exactly_what_the_commit_writes(
    sessionmaker_for_test, name
):
    payload, chosen, shelf = SCENARIOS[name]
    if shelf is not None:
        await _seed_series(sessionmaker_for_test, **shelf)
    state = S.OWNED if shelf is not None else S.EXACT
    if chosen is None:
        state = S.TYPED
    sitting_id = await _seed(
        sessionmaker_for_test, entries=[("comic", state, payload, chosen)]
    )
    async with client_for(sessionmaker_for_test) as client:
        shown = (await client.get(f"/api/intake/sittings/{sitting_id}")).json()
        [entry] = shown["entries"]
        response = await _commit(client, sitting_id)
    assert response.status_code == 200, response.text
    body = response.json()
    [volume] = await _volumes(sessionmaker_for_test)
    written = [
        (c.series_name, c.issue_text, c.from_number is not None)
        for c in await _collects(sessionmaker_for_test, volume)
    ]
    previewed = [
        (c["series_name"], c["issue_text"], c["will_link"])
        for c in entry["contents_preview"]
    ]
    assert previewed == written
    assert entry["adds"] == {
        "kind": "volume",
        "label": volume.label,
        "edition_kind": volume.kind,
        "line_number": volume.line_number,
        "title": body["volumes_new"][0]["title"],
        "title_id": None if shelf is None else body["volumes_new"][0]["title_id"],
    }
    assert entry["title_will_be_created"] is body["volumes_new"][0]["title_created"]


@pytest.mark.asyncio
async def test_check_says_a_single_adds_an_issue(sessionmaker_for_test):
    sitting_id = await _seed(
        sessionmaker_for_test, entries=[("comic", S.EXACT, _book(4), _run())]
    )
    async with client_for(sessionmaker_for_test) as client:
        [entry] = (await client.get(f"/api/intake/sittings/{sitting_id}")).json()[
            "entries"
        ]
    assert entry["adds"] == {"kind": "issue", "issue_number": 4}
    assert entry["title_will_be_created"] is True
    assert "contents_preview" not in entry


@pytest.mark.asyncio
async def test_check_knows_a_title_already_on_the_shelf(sessionmaker_for_test):
    await _seed_series(sessionmaker_for_test)
    sitting_id = await _seed(
        sessionmaker_for_test, entries=[("comic", S.OWNED, _trade(1, 6), _run())]
    )
    async with client_for(sessionmaker_for_test) as client:
        [entry] = (await client.get(f"/api/intake/sittings/{sitting_id}")).json()[
            "entries"
        ]
    [item] = await _items(sessionmaker_for_test)
    assert entry["title_will_be_created"] is False
    assert entry["adds"]["title_id"] == str(item.id)


@pytest.mark.asyncio
async def test_a_garment_or_a_game_has_no_comic_preview(sessionmaker_for_test):
    sitting_id = await _seed(
        sessionmaker_for_test, entries=[("game", S.EXACT, {}, _match(1))]
    )
    async with client_for(sessionmaker_for_test) as client:
        [entry] = (await client.get(f"/api/intake/sittings/{sitting_id}")).json()[
            "entries"
        ]
    assert not {"adds", "contents_preview", "title_will_be_created"} & set(entry)


# --- Edits and refusals ------------------------------------------------------------


@pytest.mark.asyncio
async def test_patching_the_line_number_and_kind(sessionmaker_for_test):
    sitting_id = await _seed(
        sessionmaker_for_test, entries=[("comic", S.EXACT, _trade(1, 6), _run())]
    )
    async with sessionmaker_for_test() as session:
        entry_id = await session.scalar(select(IntakeEntry.id))
    async with client_for(sessionmaker_for_test) as client:
        path = f"/api/intake/entries/{entry_id}"
        ok = await client.patch(
            path,
            json={"payload": {**_trade(1, 6), "line_number": 3, "edition_kind": "ogn"}},
        )
        assert ok.status_code == 200, ok.text
        assert ok.json()["payload"]["line_number"] == 3
        assert ok.json()["adds"]["line_number"] == 3
        assert ok.json()["adds"]["edition_kind"] == "ogn"
        for bad in (
            {"line_number": 0},
            {"line_number": 10000},
            {"edition_kind": "zine"},
        ):
            refused = await client.patch(
                path, json={"payload": {**_trade(1, 6), **bad}}
            )
            assert refused.status_code == 422, bad
            assert refused.json()["detail"]["field"] in {"line_number", "edition_kind"}
        response = await _commit(client, sitting_id)
    assert response.status_code == 200
    [volume] = await _volumes(sessionmaker_for_test)
    assert (volume.line_number, volume.kind) == (3, "ogn")


@pytest.mark.asyncio
async def test_a_commit_that_refuses_a_row_writes_no_volume(sessionmaker_for_test):
    entries = [
        ("comic", S.EXACT, _trade(1, 6), _run()),
        ("comic", S.EXACT, {"issues_owned": "nonsense"}, _match(8, "comicvine")),
    ]
    sitting_id = await _seed(sessionmaker_for_test, entries=entries)
    async with client_for(sessionmaker_for_test) as client:
        response = await _commit(client, sitting_id)
    assert response.status_code == 422
    assert await _count(sessionmaker_for_test, ComicVolume) == 0
    assert await _count(sessionmaker_for_test, Item) == 0
    body = response.json()
    assert body["volumes_new"] == [] and body["titles_created"] == []


# --- Cold-review fixes (#436) ----------------------------------------------------


async def _adds_of(factory, sitting_id) -> list[dict]:
    async with client_for(factory) as client:
        shown = (await client.get(f"/api/intake/sittings/{sitting_id}")).json()
    return shown["entries"]


@pytest.mark.asyncio
async def test_an_unmatched_book_marked_owned_writes_nothing(sessionmaker_for_test):
    payload = _trade(1, 3, detected_title="Maus")
    sitting_id = await _seed(
        sessionmaker_for_test, entries=[("comic", S.OWNED, payload, None)]
    )
    async with client_for(sessionmaker_for_test) as client:
        response = await _commit(client, sitting_id)
    assert response.status_code == 200, response.text
    body = response.json()
    assert (body["added"], body["already_owned"]) == (0, 1)
    assert body["volumes_new"] == [] and body["titles_created"] == []
    assert await _count(sessionmaker_for_test, Item) == 0
    assert await _count(sessionmaker_for_test, ComicVolume) == 0


@pytest.mark.asyncio
async def test_a_book_is_put_on_its_own_title_not_a_single_of_the_same_name(
    sessionmaker_for_test,
):
    for n in range(8):  # insert order differs run to run: look several times
        name = f"Saga {n}"
        entries = [
            ("comic", S.TYPED, _book(1, "none", detected_title=name), None),
            ("comic", S.TYPED, _trade(None, None, detected_title=name), None),
        ]
        sitting_id = await _seed(sessionmaker_for_test, entries=entries)
        async with client_for(sessionmaker_for_test) as client:
            response = await _commit(client, sitting_id)
        assert response.status_code == 200, response.text
        [made] = response.json()["volumes_new"]
        async with sessionmaker_for_test() as session:
            held = await session.get(Item, uuid.UUID(made["title_id"]))
            others = (
                await session.scalars(
                    select(Item).where(Item.title == name, Item.id != held.id)
                )
            ).all()
        assert held.issues_owned is None, name  # the book's title, not the single
        assert [o.issues_owned for o in others] == ["1"], name


async def _book_in_sitting(factory, title="Maus", state=S.TYPED, **extra):
    payload = _trade(None, None, detected_title=title, **extra)
    sitting_id = await _seed(factory, entries=[("comic", state, payload, None)])
    return sitting_id


@pytest.mark.asyncio
async def test_a_re_photographed_book_is_flagged_but_still_a_second_volume(
    sessionmaker_for_test,
):
    first = await _commit_book(sessionmaker_for_test, _trade(1, 6), _run())
    [held] = first["volumes_new"]
    sitting_id = await _seed(
        sessionmaker_for_test, entries=[("comic", S.OWNED, _trade(1, 6), _run())]
    )
    [entry] = await _adds_of(sessionmaker_for_test, sitting_id)
    assert entry["already_held"] == {
        "volume_id": held["id"],
        "slug": "vol-1",
        "label": "Waterworld",
    }
    async with client_for(sessionmaker_for_test) as client:
        response = await _commit(client, sitting_id)
    assert [v["slug"] for v in response.json()["volumes_new"]] == ["vol-2"]


@pytest.mark.asyncio
async def test_a_different_range_or_kind_or_unowned_volume_is_not_flagged(
    sessionmaker_for_test,
):
    await _commit_book(sessionmaker_for_test, _trade(1, 6), _run())
    for payload in (_trade(1, 5), _trade(2, 6), _trade(1, 6, kind="hardcover")):
        sitting_id = await _seed(
            sessionmaker_for_test, entries=[("comic", S.OWNED, payload, _run())]
        )
        [entry] = await _adds_of(sessionmaker_for_test, sitting_id)
        assert entry["already_held"] is None, payload
    async with sessionmaker_for_test() as session:
        for volume in await session.scalars(select(ComicVolume)):
            volume.owned = False
        await session.commit()
    sitting_id = await _seed(
        sessionmaker_for_test, entries=[("comic", S.OWNED, _trade(1, 6), _run())]
    )
    [entry] = await _adds_of(sessionmaker_for_test, sitting_id)
    assert entry["already_held"] is None  # a volume I no longer own holds nothing


@pytest.mark.asyncio
async def test_a_book_with_no_title_yet_is_never_flagged(sessionmaker_for_test):
    sitting_id = await _book_in_sitting(sessionmaker_for_test)
    [entry] = await _adds_of(sessionmaker_for_test, sitting_id)
    assert entry["already_held"] is None
    assert (
        "already_held"
        not in (
            await _adds_of(
                sessionmaker_for_test,
                await _seed(
                    sessionmaker_for_test,
                    entries=[("comic", S.EXACT, _book(2), _run())],
                ),
            )
        )[0]
    )


@pytest.mark.asyncio
async def test_an_unmatched_book_reuses_the_title_of_the_same_name(
    sessionmaker_for_test,
):
    for title in ("Maus", "MAUS!", "The Maus"):
        sitting_id = await _book_in_sitting(sessionmaker_for_test, title)
        async with client_for(sessionmaker_for_test) as client:
            response = await _commit(client, sitting_id)
        assert response.status_code == 200, response.text
    assert await _count(sessionmaker_for_test, Item) == 1
    volumes = await _volumes(sessionmaker_for_test)
    assert sorted(v.slug for v in volumes) == ["vol-1", "vol-2", "vol-3"]
    assert len({v.item_id for v in volumes}) == 1


@pytest.mark.asyncio
async def test_the_preview_says_a_same_named_title_is_reused(sessionmaker_for_test):
    first = await _book_in_sitting(sessionmaker_for_test)
    [entry] = await _adds_of(sessionmaker_for_test, first)
    assert entry["title_will_be_created"] is True
    async with client_for(sessionmaker_for_test) as client:
        await _commit(client, first)
    [item] = await _items(sessionmaker_for_test)
    second = await _book_in_sitting(sessionmaker_for_test)
    [entry] = await _adds_of(sessionmaker_for_test, second)
    assert entry["title_will_be_created"] is False
    assert entry["adds"]["title_id"] == str(item.id)
    async with client_for(sessionmaker_for_test) as client:
        response = await _commit(client, second)
    assert response.json()["titles_created"] == []
    assert response.json()["volumes_new"][0]["title_created"] is False


@pytest.mark.asyncio
async def test_a_different_name_makes_a_new_title(sessionmaker_for_test):
    for title in ("Maus", "Maus II"):
        async with client_for(sessionmaker_for_test) as client:
            await _commit(client, await _book_in_sitting(sessionmaker_for_test, title))
    assert await _count(sessionmaker_for_test, Item) == 2


@pytest.mark.asyncio
async def test_two_add_bar_books_of_one_name_share_a_title(sessionmaker_for_test):
    bodies = []
    async with client_for(sessionmaker_for_test) as client:
        for _ in range(2):
            response = await client.post(
                "/api/intake/add",
                json={
                    "kind": "comic",
                    "payload": {
                        "title": "Blankets",
                        "format": "collected",
                        "edition_kind": "ogn",
                    },
                },
            )
            assert response.status_code in (200, 201), response.text
            bodies.append(response.json())
    assert await _count(sessionmaker_for_test, Item) == 1
    assert [v["slug"] for b in bodies for v in b["volumes_new"]] == ["vol-1", "vol-2"]
    assert bodies[1]["titles_created"] == []


@pytest.mark.asyncio
async def test_a_groups_typed_books_are_all_volumes_of_the_one_title(
    sessionmaker_for_test,
):
    """Entries of one name with no match share one title; each typed book is
    its own volume (the same book typed twice is two books)."""
    one = {"kind": "Trade", "label": "A", "from": 1, "to": 3}
    two = {"kind": "Trade", "label": "B", "from": 4, "to": 6}
    entries = [
        (
            "comic",
            S.TYPED,
            {"detected_title": "Maus", "shelf_format": "trades", "books": [e]},
            None,
        )
        for e in (one, two, one)
    ]
    sitting_id = await _seed(sessionmaker_for_test, entries=entries)
    async with client_for(sessionmaker_for_test) as client:
        response = await _commit(client, sitting_id)
    assert response.status_code == 200, response.text
    [item] = await _items(sessionmaker_for_test)
    volumes = await _volumes(sessionmaker_for_test)
    assert sorted(v.label for v in volumes) == ["A", "A", "B"]
    assert {v.item_id for v in volumes} == {item.id}
    assert sorted(v.slug for v in volumes) == ["vol-1", "vol-2", "vol-3"]


# --- Which title a book goes to (#330) ------------------------------------------


async def _titles(factory) -> dict[str, Item]:
    return {item.title: item for item in await _items(factory)}


@pytest.mark.asyncio
async def test_a_book_that_does_not_share_the_series_title_is_its_own_title(
    sessionmaker_for_test,
):
    """Matched to Waterworld, but "The Complete Collection" is not the series'
    name: the book is a manual title of its own, and the series is untouched."""
    await _seed_series(sessionmaker_for_test, issues_owned="9")
    payload = _trade(1, 6, detected_title="Waterworld: The Complete Collection")
    body = await _commit_book(sessionmaker_for_test, payload, _run(), state=S.EXACT)
    titles = await _titles(sessionmaker_for_test)
    own = titles["Waterworld: The Complete Collection"]
    assert (own.external_source, own.external_id) == (None, None)
    assert own.is_public is False
    [volume] = await _volumes(sessionmaker_for_test)
    assert volume.item_id == own.id  # not on the series
    # The series' issues are recorded as text: no link, the volume is not there.
    assert _pairs(await _collects(sessionmaker_for_test, volume)) == [
        ("Waterworld", "#1-6", "photo", None, None)
    ]
    assert titles["Waterworld"].issues_owned == "9"  # the series is untouched
    assert await _marks(sessionmaker_for_test, own.id) == {}  # holds no issue
    [new] = body["volumes_new"]
    assert (new["title_id"], new["title_created"]) == (str(own.id), True)
    assert body["titles_created"] == [
        {"id": str(own.id), "title": "Waterworld: The Complete Collection"}
    ]


@pytest.mark.asyncio
async def test_a_book_that_shares_the_series_title_is_a_volume_on_it(
    sessionmaker_for_test,
):
    await _seed_series(sessionmaker_for_test)
    payload = _trade(1, 6, detected_title="Waterworld Book Two")
    await _commit_book(sessionmaker_for_test, payload, _run(), state=S.OWNED)
    [item] = await _items(sessionmaker_for_test)
    [volume] = await _volumes(sessionmaker_for_test)
    assert volume.item_id == item.id
    assert _pairs(await _collects(sessionmaker_for_test, volume)) == [
        ("Waterworld", "#1-6", "photo", 1, 6)
    ]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("note", "shares"),
    [
        # 5 of 8 issues are Waterworld's (62.5%): on the series
        ("Collects Waterworld #1-5 and Hellboy #1-3.", True),
        # 4 of 8 (50%): its own title, though the name matches
        ("Collects Waterworld #1-4 and Hellboy #1-4.", False),
    ],
)
async def test_the_share_of_the_contents_decides_beside_the_title(
    sessionmaker_for_test, note, shares
):
    await _seed_series(sessionmaker_for_test)
    payload = _trade(None, None, detected_title="Waterworld Vol. 1", reprint_note=note)
    await _commit_book(sessionmaker_for_test, payload, _run(), state=S.EXACT)
    [volume] = await _volumes(sessionmaker_for_test)
    series = next(i for i in await _items(sessionmaker_for_test) if i.external_id)
    assert (volume.item_id == series.id) is shares
    rows = await _collects(sessionmaker_for_test, volume)
    assert [(c.series_name, c.item_id is not None) for c in rows] == [
        ("Waterworld", shares),
        ("Hellboy", False),
    ]


@pytest.mark.asyncio
async def test_check_agrees_when_a_book_is_not_shared(sessionmaker_for_test):
    await _seed_series(sessionmaker_for_test)
    payload = _trade(1, 6, detected_title="Waterworld: The Complete Collection")
    sitting_id = await _seed(
        sessionmaker_for_test, entries=[("comic", S.OWNED, payload, _run())]
    )
    [entry] = await _adds_of(sessionmaker_for_test, sitting_id)
    assert entry["title_will_be_created"] is True
    assert entry["adds"]["title"] == "Waterworld: The Complete Collection"
    assert entry["adds"]["title_id"] is None
    assert [c["will_link"] for c in entry["contents_preview"]] == [False]
    assert [c["series_name"] for c in entry["contents_preview"]] == ["Waterworld"]
    assert entry.get("series_on_shelf") in (None, False)  # not on that series


@pytest.mark.asyncio
async def test_check_agrees_when_a_book_is_shared(sessionmaker_for_test):
    await _seed_series(sessionmaker_for_test)
    sitting_id = await _seed(
        sessionmaker_for_test,
        entries=[
            (
                "comic",
                S.OWNED,
                _trade(1, 6, detected_title="Waterworld Compendium"),
                _run(),
            )
        ],
    )
    [entry] = await _adds_of(sessionmaker_for_test, sitting_id)
    [item] = await _items(sessionmaker_for_test)
    assert entry["title_will_be_created"] is False
    assert entry["adds"]["title_id"] == str(item.id)
    assert [c["will_link"] for c in entry["contents_preview"]] == [True]


@pytest.mark.asyncio
async def test_books_of_one_unshared_name_share_one_title_and_recommit_is_idempotent(
    sessionmaker_for_test,
):
    entries = [
        (
            "comic",
            S.EXACT,
            _trade(1, 6, detected_title="Waterworld: Origins"),
            _run(),
        ),
        (
            "comic",
            S.EXACT,
            _trade(7, 12, detected_title="WATERWORLD: ORIGINS"),
            _run(),
        ),
    ]
    sitting_id = await _seed(sessionmaker_for_test, entries=entries)
    async with client_for(sessionmaker_for_test) as client:
        response = await _commit(client, sitting_id)
    assert response.status_code == 200, response.text
    assert len(response.json()["titles_created"]) == 1
    assert (
        response.json()["titles_created"][0]["title"].lower() == "waterworld: origins"
    )
    volumes = await _volumes(sessionmaker_for_test)
    assert sorted(v.slug for v in volumes) == ["vol-1", "vol-2"]
    assert len({v.item_id for v in volumes}) == 1
    # The same entries again write nothing more.
    ids = [v.intake_entry_id for v in volumes]
    again = await _recommit(sessionmaker_for_test, ids, entries[0][2], _run())
    assert again.status_code == 200
    assert len(await _volumes(sessionmaker_for_test)) == 2


@pytest.mark.asyncio
async def test_the_add_bar_places_an_unshared_book_on_its_own_title(
    sessionmaker_for_test,
):
    await _seed_series(sessionmaker_for_test)
    async with client_for(sessionmaker_for_test) as client:
        response = await client.post(
            "/api/intake/add",
            json={
                "kind": "comic",
                "chosen": _run(),
                "payload": {
                    "format": "collected",
                    "edition_kind": "hardcover",
                    "collects_from": 1,
                    "collects_to": 6,
                    "detected_title": "Waterworld: Year One",
                },
            },
        )
    assert response.status_code == 201, response.text
    [new] = response.json()["volumes_new"]
    assert new["title"] == "Waterworld: Year One" and new["title_created"] is True
    own = (await _titles(sessionmaker_for_test))["Waterworld: Year One"]
    assert (own.external_source, own.external_id) == (None, None)
