"""The collapse rule and the registry note (spec §4 and §5)."""

from datetime import date
from decimal import Decimal

from physical_sources.collapse import (
    EditionView,
    GameView,
    ItemView,
    ListingView,
    collapse,
    item_note,
)

GAME = GameView(igdb_id=1, title="Some Game", release_date=date(2027, 3, 1))


def edition(format, region="USA", source="nscollectors", **extra):
    return EditionView(
        id=f"e-{source}-{region}-{format}",
        source=source,
        region=region,
        platform_id=508,
        is_physical=True,
        physical_format=format,
        format_source="registry" if format else None,
        **extra,
    )


def listing(store, format, tier="store_text", region="USA", **extra):
    fields = {
        "id": f"l-{store}",
        "store": store.lower().replace(" ", "_"),
        "store_name": store,
        "region": region,
        "platform_id": 508,
        "availability": "preorder",
        "url": f"https://example.test/{store}",
        "price": Decimal("49.99"),
        "format_hint": format,
        "format_tier": tier if format else None,
        **extra,
    }
    return ListingView(**fields)


def test_home_key_card_with_a_foreign_cartridge_is_a_note():
    result = collapse(
        1,
        508,
        [edition("game_key_card")],
        [listing("Super Rare", "game_card", region="EUR", currency="GBP")],
        GAME,
    )
    assert result.physical_format == "game_key_card"
    assert result.region_of_answer == "USA"
    assert result.format_note == "Full game on cartridge in EUR — Super Rare"


def test_a_home_boutique_cartridge_beats_a_registry_key_card():
    result = collapse(
        1, 508, [edition("game_key_card")], [listing("Limited Run", "game_card")], GAME
    )
    assert (result.physical_format, result.format_route) == ("game_card", "Limited Run")
    assert result.format_source == "store_text"
    assert result.format_note is None


def test_a_policy_cartridge_still_wins_and_the_route_says_so():
    result = collapse(
        1,
        508,
        [edition("game_key_card")],
        [listing("Limited Run", "game_card", tier="store_policy")],
        GAME,
    )
    assert result.physical_format == "game_card"
    assert result.format_route == "Limited Run (store policy)"


def test_a_registry_cartridge_and_a_key_card_listing():
    result = collapse(
        1,
        508,
        [edition("game_card")],
        [listing("Limited Run", "game_key_card")],
        GAME,
    )
    assert (result.physical_format, result.format_route) == (
        "game_card",
        "r/NSCollectors (USA)",
    )
    (line,) = result.store_lines
    assert line.listing_format == "game_key_card"


def test_only_a_foreign_registry_row_answers_from_there():
    result = collapse(1, 508, [edition("game_card", region="EUR")], [], GAME)
    assert (result.physical_format, result.region_of_answer) == ("game_card", "EUR")


def test_an_unknown_format_listing_is_buyable_and_unlabelled():
    result = collapse(1, 508, [], [listing("Nicalis", None)], GAME)
    assert result.physical_format is None
    assert result.buyable is True
    assert result.store_lines[0].listing_format is None


def test_nothing_known_at_all():
    result = collapse(1, 508, [], [], GAME)
    assert (result.physical_format, result.buyable, result.store_lines) == (
        None,
        False,
        (),
    )


def test_the_sheet_beats_the_tracker_in_its_region():
    result = collapse(
        1,
        508,
        [
            edition("game_key_card", source="switch2tracker"),
            edition("game_key_card"),
        ],
        [],
        GAME,
    )
    assert result.format_route == "r/NSCollectors (USA)"
    assert result.edition_ids == ("e-nscollectors-USA-game_key_card",)


def test_the_tracker_never_overrides_the_sheet_in_its_region():
    # The tracker says cartridge, the sheet key card: the sheet speaks here.
    result = collapse(
        1,
        508,
        [edition("game_card", source="switch2tracker"), edition("game_key_card")],
        [],
        GAME,
    )
    assert result.physical_format == "game_key_card"


def test_the_tracker_answers_where_the_sheet_is_silent():
    result = collapse(
        1,
        508,
        [edition("code_in_box", region="ALL", source="switch2tracker")],
        [],
        GAME,
    )
    assert (result.physical_format, result.format_route) == (
        "code_in_box",
        "switch2-tracker",
    )


def test_digital_and_other_platforms_and_archived_are_ignored():
    digital = EditionView("d", "nscollectors", "USA", 508, False, None, None)
    other = listing("Limited Run", "game_card", platform_id=167)
    archived = listing("Fangamer", "game_card", availability="archived")
    result = collapse(1, 508, [digital], [other, archived], GAME)
    assert result.physical_format is None
    assert result.listing_ids == () and result.edition_ids == ()


def test_release_date_prefers_the_home_registry_row():
    rows = [
        edition("game_card", release_date=date(2026, 11, 19), release_precision="day"),
        edition(
            "game_card",
            region="JPN",
            release_date=date(2026, 10, 1),
            release_precision="day",
        ),
    ]
    result = collapse(1, 508, rows, [], GAME)
    assert (result.release_date, result.release_precision) == (
        date(2026, 11, 19),
        "day",
    )


def test_release_date_falls_back_to_listings_then_igdb():
    dated = listing(
        "Limited Run",
        None,
        release_date=date(2027, 1, 1),
        release_precision="month",
    )
    assert collapse(1, 508, [], [dated], GAME).release_date == date(2027, 1, 1)
    assert collapse(1, 508, [], [], GAME).release_date == date(2027, 3, 1)


# --- The registry note ---------------------------------------------------------


def item(format, source, cart_id=None, region=None):
    return ItemView("i", 508, region, format, source, cart_id)


def test_a_manual_cartridge_against_a_registry_key_card():
    note = item_note(
        item("game_card", "manual"),
        [edition("game_key_card", cart_id="LP-AAC4B-USA-0")],
    )
    assert note.agrees is False
    assert note.note == (
        "r/NSCollectors lists the USA edition as Game-Key Card (LP-AAC4B-USA-0); "
        "you recorded full game on cartridge (manual)"
    )


def test_a_registry_copy_agrees():
    note = item_note(item("game_card", "registry"), [edition("game_card")])
    assert (note.agrees, note.note) == (True, "Registry agrees: Game Card (USA)")


def test_no_edition_is_not_in_the_registry():
    note = item_note(item("game_card", "manual"), [])
    assert (note.agrees, note.edition, note.note) == (None, None, "Not in the registry")


def test_the_copy_picks_its_edition_by_cart_id_then_format():
    rows = [
        edition("game_key_card", region="EUR", cart_id="LP-AAMBA-EUR-0"),
        edition("code_in_box", region="EUR"),
    ]
    by_cart = item_note(item(None, None, cart_id="LP-AAMBA-EUR-0", region="EUR"), rows)
    assert by_cart.edition.physical_format == "game_key_card"
    by_format = item_note(item("code_in_box", "manual", region="EUR"), rows)
    assert (by_format.agrees, by_format.edition.physical_format) == (
        True,
        "code_in_box",
    )


def test_an_item_region_picks_that_regions_row():
    rows = [edition("game_key_card"), edition("game_card", region="EUR")]
    assert item_note(item("game_card", "registry", region="EUR"), rows).agrees is True


def test_a_tbc_edition_neither_agrees_nor_disagrees():
    tbc = EditionView("t", "nscollectors", "USA", 508, None, None, None)
    note = item_note(item("game_card", "manual"), [tbc])
    assert note.agrees is None
    assert "without a card type" in note.note
