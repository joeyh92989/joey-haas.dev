"""The copy-field write rules. Pure: no database, no request."""

import pytest

from formats import (
    CARTRIDGE_ONLY_PLATFORMS,
    HOME_REGION,
    CopyFieldError,
    apply_copy_fields,
    apply_registry_format,
)
from models import FormatSource, Item, ItemStatus, ItemType, PhysicalFormat
from sources.igdb import PLATFORM_IDS, PLATFORM_NAMES, platform_id


def _row(**fields) -> Item:
    return Item(type=ItemType.GAME, title="Game", status=ItemStatus.BACKLOG, **fields)


# --- platform --------------------------------------------------------------


def test_a_known_platform_id_resolves_its_name():
    assert apply_copy_fields({"platform_id": 508}, None) == {
        "platform_id": 508,
        "platform": "Nintendo Switch 2",
    }


def test_clearing_the_platform_clears_its_name():
    assert apply_copy_fields({"platform_id": None}, _row(platform_id=130)) == {
        "platform_id": None,
        "platform": None,
    }


def test_an_unknown_platform_id_is_refused():
    with pytest.raises(CopyFieldError, match="Unknown platform id 999"):
        apply_copy_fields({"platform_id": 999}, None)


def test_every_known_platform_has_a_display_name():
    assert set(PLATFORM_IDS.values()) <= set(PLATFORM_NAMES)


def test_n64_is_a_known_platform():
    assert platform_id("Nintendo 64") == 4
    assert platform_id("N64") == 4


def test_server_derived_fields_in_the_input_are_discarded():
    result = apply_copy_fields(
        {"platform": "Anything", "format_source": "registry", "region": "eur"}, None
    )
    assert result == {"region": "EUR"}


# --- cart ID ---------------------------------------------------------------


@pytest.mark.parametrize(
    ("cart", "expected"),
    [
        ("LP-AAC4B-USA-0", "game_key_card"),
        ("LB-AAE7A-USA-1", "game_card"),
        ("LN-AB12C-EUR-0", "game_card"),
    ],
)
def test_a_cart_id_decides_the_format(cart, expected):
    result = apply_copy_fields({"cart_id": cart}, _row(platform_id=508))
    assert result["physical_format"] == expected
    assert result["format_source"] == "cart_id"


def test_a_cart_id_is_normalised():
    result = apply_copy_fields({"cart_id": "  lp-aac4b-usa-0 "}, None)
    assert result["cart_id"] == "LP-AAC4B-USA-0"


def test_the_third_segment_sets_the_region():
    assert apply_copy_fields({"cart_id": "LB-AAE7A-EUR-1"}, None)["region"] == "EUR"


def test_a_region_in_the_body_beats_the_segment():
    result = apply_copy_fields({"cart_id": "LB-AAE7A-EUR-1", "region": "usa"}, None)
    assert result["region"] == "USA"


@pytest.mark.parametrize("cart", ["LP-AAC4B-USA", "XP-AAC4B-USA-0", "LP-AAC4-USA-0"])
def test_a_malformed_cart_id_is_refused(cart):
    with pytest.raises(CopyFieldError, match="does not look like"):
        apply_copy_fields({"cart_id": cart}, None)


def test_an_la_cart_on_a_switch_2_copy_is_refused():
    with pytest.raises(CopyFieldError, match="Switch 1 cartridge"):
        apply_copy_fields({"cart_id": "LA-AAAAA-USA-0"}, _row(platform_id=508))


def test_an_la_cart_in_the_same_body_as_switch_2_is_refused():
    with pytest.raises(CopyFieldError, match="Switch 1 cartridge"):
        apply_copy_fields({"cart_id": "LA-AAAAA-USA-0", "platform_id": 508}, None)


def test_an_la_cart_on_a_switch_copy_is_a_game_card():
    result = apply_copy_fields({"cart_id": "LA-AAAAA-USA-0"}, _row(platform_id=130))
    assert result["physical_format"] == "game_card"


# --- conflicts and manual formats ------------------------------------------


def test_a_format_that_contradicts_the_cart_id_is_refused():
    with pytest.raises(CopyFieldError, match="Game-Key Card"):
        apply_copy_fields(
            {"cart_id": "LP-AAC4B-USA-0", "physical_format": "game_card"}, None
        )


def test_a_format_that_contradicts_the_stored_cart_id_is_refused():
    row = _row(cart_id="LP-AAC4B-USA-0", physical_format="game_key_card")
    with pytest.raises(CopyFieldError, match="clear the cart ID"):
        apply_copy_fields({"physical_format": "game_card"}, row)


def test_a_format_that_agrees_with_the_cart_id_is_accepted():
    result = apply_copy_fields(
        {"cart_id": "LP-AAC4B-USA-0", "physical_format": "game_key_card"}, None
    )
    assert result["format_source"] == "cart_id"


def test_a_format_without_a_cart_id_is_manual():
    result = apply_copy_fields({"physical_format": "game_card"}, _row())
    assert result["format_source"] == "manual"


def test_clearing_the_format_clears_its_source_and_the_cart_id():
    row = _row(cart_id="LP-AAC4B-USA-0", physical_format="game_key_card")
    assert apply_copy_fields({"physical_format": None}, row) == {
        "physical_format": None,
        "format_source": None,
        "cart_id": None,
    }


def test_clearing_the_cart_id_keeps_the_format_as_manual():
    row = _row(cart_id="LP-AAC4B-USA-0", physical_format="game_key_card")
    result = apply_copy_fields({"cart_id": None}, row)
    assert result == {"cart_id": None, "format_source": "manual"}


def test_clearing_the_cart_id_with_no_format_clears_the_source():
    assert apply_copy_fields({"cart_id": None}, _row()) == {
        "cart_id": None,
        "format_source": None,
    }


def test_clearing_the_cart_id_frees_a_different_format():
    row = _row(cart_id="LP-AAC4B-USA-0", physical_format="game_key_card")
    result = apply_copy_fields({"cart_id": None, "physical_format": "game_card"}, row)
    assert result["format_source"] == "manual"


# --- region, completeness, purity -----------------------------------------


@pytest.mark.parametrize("region", ["U", "USAXX", "U5A"])
def test_a_malformed_region_is_refused(region):
    with pytest.raises(CopyFieldError, match="2 to 4 letters"):
        apply_copy_fields({"region": region}, None)


def test_the_home_region_is_usa():
    assert HOME_REGION == "USA"


def test_completeness_passes_through():
    assert apply_copy_fields({"completeness": "cib"}, None) == {"completeness": "cib"}


def test_unrelated_changes_pass_through_untouched():
    assert apply_copy_fields({"rating": 7, "title": "X"}, _row()) == {
        "rating": 7,
        "title": "X",
    }


def test_the_inputs_are_never_mutated():
    changes = {"cart_id": "lp-aac4b-usa-0", "platform": "x"}
    row = _row(platform_id=130)
    apply_copy_fields(changes, row)
    assert changes == {"cart_id": "lp-aac4b-usa-0", "platform": "x"}
    assert row.platform_id == 130


# --- The registry (E7c) -------------------------------------------------------


def test_cartridge_only_platforms_are_n64_and_switch():
    assert CARTRIDGE_ONLY_PLATFORMS == frozenset({4, 130})


@pytest.mark.parametrize("source", ["manual", "cart_id", "photo"])
def test_the_registry_never_overwrites_what_the_owner_recorded(source):
    row = _row(physical_format="game_card", format_source=FormatSource(source))
    with pytest.raises(CopyFieldError):
        apply_registry_format(row, "game_key_card")


def test_the_registry_fills_an_unrecorded_format():
    assert apply_registry_format(_row(), "game_key_card") == {
        "physical_format": PhysicalFormat.GAME_KEY_CARD,
        "format_source": FormatSource.REGISTRY,
    }


def test_the_registry_updates_its_own_earlier_value():
    row = _row(physical_format="game_key_card", format_source=FormatSource.REGISTRY)
    assert apply_registry_format(row, "game_card")["physical_format"] == (
        PhysicalFormat.GAME_CARD
    )


def test_an_edition_without_a_format_changes_nothing():
    assert apply_registry_format(_row(), None) == {}


def test_edition_id_adopts_the_registry_format():
    result = apply_copy_fields(
        {"edition_id": "e-1", "edition_format": "game_card"}, _row()
    )
    assert result == {
        "physical_format": PhysicalFormat.GAME_CARD,
        "format_source": FormatSource.REGISTRY,
    }
    assert "edition_id" not in result and "cart_id" not in result


def test_edition_id_is_refused_when_the_copy_has_a_cart_id():
    row = _row(
        cart_id="LP-AAC4B-USA-0",
        physical_format="game_key_card",
        format_source=FormatSource.CART_ID,
    )
    with pytest.raises(CopyFieldError, match="LP-AAC4B-USA-0"):
        apply_copy_fields({"edition_id": "e-1", "edition_format": "game_card"}, row)


def test_edition_id_with_a_format_is_refused():
    with pytest.raises(CopyFieldError):
        apply_copy_fields(
            {
                "edition_id": "e-1",
                "edition_format": "game_card",
                "physical_format": "disc",
            },
            _row(),
        )


def test_edition_id_keeps_the_other_rules():
    result = apply_copy_fields(
        {"edition_id": "e-1", "edition_format": "game_key_card", "region": "eur"},
        _row(),
    )
    assert (result["region"], result["format_source"]) == ("EUR", FormatSource.REGISTRY)


def test_an_edition_with_no_card_type_is_refused():
    with pytest.raises(CopyFieldError, match="no card type"):
        apply_copy_fields({"edition_id": "e-1", "edition_format": None}, _row())
