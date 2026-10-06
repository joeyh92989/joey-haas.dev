"""next_load: the database side of What's next (Spine Next spec, K9)."""

import uuid
from datetime import UTC, date, datetime, timedelta

import pytest

from models import (
    CatalogueRun,
    Item,
    ItemStatus,
    ItemType,
    OwnedFormat,
    PhysicalFormat,
    ReasonSource,
    Recommendation,
    RecommendationKind,
    RecommendationStatus,
)
from next_load import catalogue_times, load_next, taste_sparing_owned
from physical_sources.stores import STORES

pytestmark = pytest.mark.asyncio

TODAY = date(2026, 9, 28)


def _game(title: str, **fields) -> Item:
    base = dict(
        type=ItemType.GAME,
        title=title,
        status=ItemStatus.BACKLOG,
        is_public=True,
        owned_format=OwnedFormat.PHYSICAL,
        source_metadata={"genres": ["Roguelike", "Indie"]},
    )
    return Item(**{**base, **fields})


def _radar(title: str, **fields) -> Recommendation:
    metadata = {
        "lane": "preorder",
        "section": "suggested",
        "release_precision": "day",
        "release_source": "registry",
        "hypes": 40,
        "store_lines": [
            {
                "store": "Limited Run Games",
                "price": "59.99",
                "currency": "USD",
                "availability": "preorder",
                "preorder_closes_at": "2026-11-08T00:00:00+00:00",
                "url": "https://limitedrungames.com/products/x",
            }
        ],
        "snapshot": {"url": f"https://www.igdb.com/games/{title.lower()}"},
    }
    base = dict(
        kind=RecommendationKind.RADAR,
        type=ItemType.GAME,
        title=title,
        external_source="igdb",
        external_id=title.lower().replace(" ", "-"),
        release_date=TODAY + timedelta(days=60),
        cover_url=f"https://images.igdb.com/{title}.jpg",
        reason="Pre-orders close Nov 8 at Limited Run Games · $59.99",
        reason_source=ReasonSource.TEMPLATE,
        based_on=["x"],
        score=50,
        batch_id=uuid.uuid4(),
        status=RecommendationStatus.PENDING,
        platform_id=508,
        platform="Nintendo Switch 2",
        physical_format=PhysicalFormat.GAME_CARD,
        source_metadata=metadata,
    )
    overrides = fields.pop("source_metadata", None)
    row = Recommendation(**{**base, **fields})
    if overrides is not None:
        row.source_metadata = {**metadata, **overrides}
    return row


async def _add(factory, *rows):
    async with factory() as session:
        session.add_all(rows)
        await session.commit()


async def test_candidates_are_pending_rows_of_both_kinds(sessionmaker_for_test):
    discover = _radar(
        "Pick", kind=RecommendationKind.DISCOVER, source_metadata={"rank": 2}
    )
    await _add(sessionmaker_for_test, _radar("Coming"), discover)
    async with sessionmaker_for_test() as session:
        data = await load_next(session)
    by_title = {c.title: c for c in data.candidates}
    assert set(by_title) == {"Coming", "Pick"}
    assert by_title["Pick"].kind == "discover" and by_title["Pick"].rank == 2
    assert by_title["Coming"].release_source == "registry"
    assert by_title["Coming"].payload.title == "Coming"


@pytest.mark.parametrize(
    "status",
    [
        RecommendationStatus.WANTED,
        RecommendationStatus.OWNED,
        RecommendationStatus.DISMISSED,
        RecommendationStatus.SKIPPED,
    ],
)
async def test_answered_rows_are_not_candidates(sessionmaker_for_test, status):
    await _add(sessionmaker_for_test, _radar("Coming"), _radar("Gone", status=status))
    async with sessionmaker_for_test() as session:
        data = await load_next(session)
    assert [c.title for c in data.candidates] == ["Coming"]


ANSWERED = [
    RecommendationStatus.WANTED,
    RecommendationStatus.OWNED,
    RecommendationStatus.DISMISSED,
    RecommendationStatus.SKIPPED,
]


@pytest.mark.parametrize("status", ANSWERED)
async def test_public_mode_keeps_answered_rows_of_the_latest_batch(
    sessionmaker_for_test, status
):
    """The public store sections are frozen to the batch (spec, S9): an
    answer leaves the public page only when a new generation runs."""
    batch, at = uuid.uuid4(), datetime(2026, 9, 28, 6, 0, tzinfo=UTC)
    await _add(
        sessionmaker_for_test,
        _radar("Coming", batch_id=batch, generated_at=at),
        _radar("Answered", status=status, batch_id=batch, generated_at=at),
    )
    async with sessionmaker_for_test() as session:
        public = await load_next(session, public=True)
        admin = await load_next(session)
    assert {c.title for c in public.candidates} == {"Coming", "Answered"}
    assert [c.title for c in admin.candidates] == ["Coming"]


@pytest.mark.parametrize("status", ANSWERED)
async def test_public_mode_drops_answered_rows_of_an_older_batch(
    sessionmaker_for_test, status
):
    older, newer = (
        datetime(2026, 9, 27, 6, 0, tzinfo=UTC),
        datetime(2026, 9, 28, 6, 0, tzinfo=UTC),
    )
    await _add(
        sessionmaker_for_test,
        _radar("Old Answer", status=status, generated_at=older),
        _radar("Old Pending", generated_at=older),
        _radar("New", generated_at=newer),
        # Discover's latest batch is its own: Radar's newer one does not end it.
        _radar(
            "Pick Answered",
            kind=RecommendationKind.DISCOVER,
            status=status,
            generated_at=older,
            batch_id=PICKS,
        ),
        _radar(
            "Pick Pending",
            kind=RecommendationKind.DISCOVER,
            generated_at=older,
            batch_id=PICKS,
        ),
    )
    async with sessionmaker_for_test() as session:
        public = await load_next(session, public=True)
    assert {c.title for c in public.candidates} == {
        "Old Pending",
        "New",
        "Pick Answered",
        "Pick Pending",
    }


PICKS = uuid.uuid4()


async def test_public_mode_reads_every_batch_generated_at_the_latest_instant(
    sessionmaker_for_test,
):
    """A tie is one generation: its batches freeze together."""
    at = datetime(2026, 9, 28, 6, 0, tzinfo=UTC)
    await _add(
        sessionmaker_for_test,
        _radar("First", status=RecommendationStatus.DISMISSED, generated_at=at),
        _radar("Second", status=RecommendationStatus.WANTED, generated_at=at),
        _radar("Third", generated_at=at),
    )
    async with sessionmaker_for_test() as session:
        public = await load_next(session, public=True)
    assert {c.title for c in public.candidates} == {"First", "Second", "Third"}


async def test_a_platform_limited_generate_keeps_other_platforms_frozen(
    sessionmaker_for_test,
):
    """Radar replaces pending rows per platform it covered, so the latest
    batch is per (kind, platform): a generate on Switch 1 alone must not end
    Switch 2's frozen answers, or exactly the answered games would vanish."""
    first, later = (
        datetime(2026, 9, 27, 6, 0, tzinfo=UTC),
        datetime(2026, 9, 28, 6, 0, tzinfo=UTC),
    )
    nightly, switch1_only = uuid.uuid4(), uuid.uuid4()
    await _add(
        sessionmaker_for_test,
        _radar("Two Pending", batch_id=nightly, generated_at=first),
        _radar(
            "Two Answered",
            status=RecommendationStatus.DISMISSED,
            batch_id=nightly,
            generated_at=first,
        ),
        _radar(
            "One Answered",
            status=RecommendationStatus.DISMISSED,
            batch_id=nightly,
            generated_at=first,
            platform_id=130,
        ),
        _radar("One Fresh", batch_id=switch1_only, generated_at=later, platform_id=130),
    )
    async with sessionmaker_for_test() as session:
        public = await load_next(session, public=True)
    assert {c.title for c in public.candidates} == {
        "Two Pending",
        "Two Answered",
        "One Fresh",
    }


async def test_a_batch_with_nothing_pending_shows_no_answered_row(
    sessionmaker_for_test,
):
    """Fails closed: after a generate that wrote no rows (its pending rows
    deleted), the old batch is still the latest, holding only answers;
    publishing them would list exactly what the owner answered."""
    batch, at = uuid.uuid4(), datetime(2026, 9, 28, 6, 0, tzinfo=UTC)
    await _add(
        sessionmaker_for_test,
        *[
            _radar(f"Answered {s.value}", status=s, batch_id=batch, generated_at=at)
            for s in ANSWERED
        ],
    )
    async with sessionmaker_for_test() as session:
        public = await load_next(session, public=True)
    assert public.candidates == []


async def test_candidates_run_by_score_then_title(sessionmaker_for_test):
    await _add(
        sessionmaker_for_test,
        _radar("Zeta", score=80),
        _radar("Beta", score=50),
        _radar("Alpha", score=50),
        _radar("Low", score=10),
    )
    async with sessionmaker_for_test() as session:
        data = await load_next(session)
    assert [c.title for c in data.candidates] == ["Zeta", "Alpha", "Beta", "Low"]


async def test_taste_holds_public_games_and_private_titles(sessionmaker_for_test):
    shown = _game("Shown", rating=9)
    hidden = _game("Hidden", is_public=False)
    wanted = _game("Wanted Hidden", is_public=False, owned_format=OwnedFormat.NONE)
    second = _game("Second Hidden", is_public=False)
    shown.id, hidden.id, wanted.id, second.id = (uuid.uuid4() for _ in range(4))
    public_movie = _game("Public Movie", type=ItemType.MOVIE)
    private_movie = _game("Private Movie", type=ItemType.MOVIE, is_public=False)
    await _add(
        sessionmaker_for_test,
        shown,
        hidden,
        wanted,
        second,
        public_movie,
        private_movie,
    )
    async with sessionmaker_for_test() as session:
        data = await load_next(session)
    assert [item.title for item in data.public_games] == ["Shown"]
    # Every non-public game, owned or wanted, and nothing that is not a game.
    assert set(data.taste.private_titles) == {
        "Hidden",
        "Wanted Hidden",
        "Second Hidden",
    }
    assert data.taste.public_ids == frozenset({str(shown.id)})
    assert str(hidden.id) not in data.taste.public_ids


async def test_generated_at_is_each_kinds_last_generation(sessionmaker_for_test):
    earlier = datetime(2026, 9, 1, 6, 0, tzinfo=UTC)
    later = datetime(2026, 9, 2, 6, 0, tzinfo=UTC)
    await _add(
        sessionmaker_for_test,
        _radar("Coming", generated_at=earlier),
        # Any status counts: the answered row is the latest generation.
        _radar("Gone", status=RecommendationStatus.DISMISSED, generated_at=later),
    )
    async with sessionmaker_for_test() as session:
        data = await load_next(session)
    assert data.generated_at["radar"] == later
    assert data.generated_at["discover"] is None


async def test_catalogue_times_is_the_stalest_good_store_run(sessionmaker_for_test):
    first, second = list(STORES)[:2]
    older = datetime(2026, 9, 20, 6, 0, tzinfo=UTC)
    newer = datetime(2026, 9, 27, 6, 0, tzinfo=UTC)

    def run(source: str, finished: datetime, ok: bool) -> CatalogueRun:
        return CatalogueRun(
            source=source,
            started_at=finished - timedelta(minutes=1),
            finished_at=finished,
            ok=ok,
        )

    await _add(
        sessionmaker_for_test,
        run(first, older, True),
        run(second, newer, True),
        run(first, newer + timedelta(days=1), False),
        run("nscollectors", newer, True),
    )
    async with sessionmaker_for_test() as session:
        times = await catalogue_times(session)
    assert times["stores_at"] == older
    assert times["registry_at"] == newer


async def test_the_scan_is_lifted_only_for_an_owned_row_of_the_same_game(
    sessionmaker_for_test,
):
    """By identity, never by title (spec, S9): the Already own item carries
    the row's IGDB id and platform; a same-titled game without one, or a
    row that is not rendered, lifts nothing."""
    at = datetime(2026, 9, 28, 6, 0, tzinfo=UTC)
    owned_row = _radar("Listed", status=RecommendationStatus.OWNED, generated_at=at)
    twin_row = _radar("Twin", generated_at=at)
    await _add(
        sessionmaker_for_test,
        _game(
            "Listed",
            is_public=False,
            external_source="igdb",
            external_id="listed",
            platform_id=508,
        ),
        _game("Twin", is_public=False),
        _game("Hidden", is_public=False),
        owned_row,
        twin_row,
    )
    async with sessionmaker_for_test() as session:
        public = await load_next(session, public=True)
    rows = {c.title: c.payload for c in public.candidates}
    everything = {"Listed", "Twin", "Hidden"}
    assert set(public.taste.private_titles) == everything
    spared = taste_sparing_owned(public, [rows["Listed"], rows["Twin"]])
    assert set(spared.private_titles) == {"Twin", "Hidden"}
    unrendered = taste_sparing_owned(public, [rows["Twin"]])
    assert set(unrendered.private_titles) == everything


async def _scanned_titles(factory, item_title: str) -> set[str]:
    """The private titles still scanned for an Already own item carrying the
    owned, rendered row "Hades II"'s IGDB id and platform under `item_title`."""
    at = datetime(2026, 9, 28, 6, 0, tzinfo=UTC)
    await _add(
        factory,
        _game(
            item_title,
            is_public=False,
            external_source="igdb",
            external_id="hades-ii",
            platform_id=508,
        ),
        _radar("Hades II", status=RecommendationStatus.OWNED, generated_at=at),
        # The generation needs a pending row, or the freeze fails closed.
        _radar("Pending", generated_at=at),
    )
    async with factory() as session:
        public = await load_next(session, public=True)
    row = next(c.payload for c in public.candidates if c.title == "Hades II")
    return set(taste_sparing_owned(public, [row]).private_titles)


async def test_a_renamed_or_relinked_item_is_scanned_like_any_private_game(
    sessionmaker_for_test,
):
    """#43: sparing needs the item's current title to still be the owned
    row's. The same IGDB id and platform under another title lifts nothing,
    so the new title is scanned."""
    assert await _scanned_titles(sessionmaker_for_test, "Secret Rename") == {
        "Secret Rename"
    }


async def test_the_title_match_ignores_case_and_surrounding_space(
    sessionmaker_for_test,
):
    assert await _scanned_titles(sessionmaker_for_test, "  HADES ii ") == set()
