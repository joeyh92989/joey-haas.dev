"""The Switch 1 registry reader, on the recorded Sheets API responses.

The first block pins the recorded shape the parser was written against. If
one of those fails after a re-record, stop and read the drift report rather
than loosening the test.
"""

import json
from pathlib import Path
from urllib.parse import unquote

import httpx2
import pytest

from matching import normalize_title
from physical_sources.limits import SWITCH, SWITCH_1_CART_ID_PATTERN
from physical_sources.parse import game_title, parse_loose_date, parse_ymd
from physical_sources.registry import (
    SheetSchemaError,
    SheetsNotConfigured,
    locate_header,
    rows_from_values,
    tab_titles,
)
from physical_sources.registry_switch1 import (
    REQUIRED_CIAB,
    REQUIRED_MASTER,
    SHEET_ID,
    SOURCE,
    TABS,
    list_editions,
    parse_ciab,
    parse_master,
    to_editions,
)

FIXTURES = Path(__file__).parent / "fixtures" / "physical" / "registry_switch1"
SPEC_MASTER_HEADER = [
    "Master TItle",
    "Game Title",
    "Region",
    "Release Date",
    "Cart ID",
    "Publisher",
    "LP #",
    "Edition Info",
    "Other Info",
    "Verified By",
    "Check",
]


def _load(name: str) -> dict:
    return json.loads((FIXTURES / f"{name}.json").read_text())


def _rows(name: str) -> list[list[str]]:
    return rows_from_values(_load(name))


def _column(tab: str, required: tuple[str, ...], name: str) -> list[str]:
    """Every filled cell of one column below the header."""
    rows = _rows(tab)
    header = locate_header(rows, required)
    folded = [cell.strip().casefold() for cell in rows[header]]
    index = folded.index(name.casefold())
    return [row[index].strip() for row in rows[header + 1 :] if row[index].strip()]


@pytest.fixture(scope="module")
def master():
    return parse_master(_rows("master"))


@pytest.fixture(scope="module")
def ciab():
    return parse_ciab(_rows("ciab"))


@pytest.fixture(scope="module")
def editions(master, ciab):
    return to_editions(master[0], ciab[0])


# --- The recorded shape -------------------------------------------------------------


def test_the_master_header_is_the_specs():
    rows = _rows("master")
    header = rows[locate_header(rows, REQUIRED_MASTER)]
    assert [cell.strip() for cell in header if cell.strip()] == SPEC_MASTER_HEADER


def test_the_ciab_tab_has_the_columns_it_is_read_by():
    assert locate_header(_rows("ciab"), REQUIRED_CIAB) >= 0


def test_tab_titles_maps_both_switch_1_gids():
    titles = tab_titles(_load("properties"), TABS)
    assert set(titles) == {"master", "ciab"} and all(titles.values())


def test_every_region_fits_the_column(master, ciab):
    regions = {row["region"] for row in master[0] + ciab[0]}
    assert regions and all(len(region) <= 4 for region in regions)


def test_most_cart_ids_have_the_switch_1_shape():
    carts = _column("master", REQUIRED_MASTER, "Cart ID")
    shaped = [cart for cart in carts if SWITCH_1_CART_ID_PATTERN.match(cart.upper())]
    assert carts and len(shaped) >= 0.9 * len(carts)


def test_most_release_dates_parse():
    dates = _column("master", REQUIRED_MASTER, "Release Date")
    parsed = [text for text in dates if parse_ymd(text) or parse_loose_date(text)[0]]
    assert dates and len(parsed) >= 0.95 * len(dates)


# --- Parsing ------------------------------------------------------------------------


def test_both_tabs_parse_without_warnings(master, ciab):
    assert (master[1], ciab[1]) == ([], [])


def test_every_row_is_a_physical_switch_1_edition(editions):
    assert editions
    assert {(row.source, row.platform_id, row.is_physical) for row in editions} == {
        (SOURCE, SWITCH, True)
    }


def test_a_cart_id_makes_a_registry_cartridge(master):
    with_cart = [row for row in master[0] if row["cart_id"]]
    without = [row for row in master[0] if not row["cart_id"]]
    assert with_cart
    assert {row["physical_format"] for row in with_cart} == {"game_card"}
    assert all(row["physical_format"] is None for row in without)


def test_format_source_is_registry_exactly_when_there_is_a_format(editions):
    assert all(
        (row.format_source == "registry") == (row.physical_format is not None)
        for row in editions
    )


def test_the_cart_id_is_kept_on_the_edition(editions):
    carts = [row.cart_id for row in editions if row.cart_id]
    assert carts and all(SWITCH_1_CART_ID_PATTERN.match(cart) for cart in carts)


def test_ciab_only_rows_become_codes_in_a_box(ciab):
    yes = [
        v for v in _column("ciab", REQUIRED_CIAB, "CIAB only?") if v.casefold() == "yes"
    ]
    assert ciab[0] and len(ciab[0]) <= len(yes)
    assert {row["physical_format"] for row in ciab[0]} == {"code_in_box"}


def test_deaths_door_is_a_switch_1_cartridge(editions):
    found = [row for row in editions if row.title_normalized == "death s door"]
    assert found and any(row.physical_format == "game_card" for row in found)


def test_keys_are_the_base_game(editions):
    assert all(
        row.title_normalized == normalize_title(game_title(row.title))
        for row in editions
    )


def test_refs_are_unique_and_the_key_loses_few_rows(master, ciab, editions):
    assert len({row.source_ref for row in editions}) == len(editions)
    assert len(editions) >= 0.98 * (len(master[0]) + len(ciab[0]))


# --- Shapes the recording may not show ---------------------------------------------

HEADER = list(SPEC_MASTER_HEADER)


def test_the_header_typo_and_lower_case_cells_are_read():
    row = ["Hades", "Hades", "usa", "2020/09/18", "la-h-aqxha-usa", "Supergiant"]
    found, warnings = parse_master([["Switch Physical Releases"], HEADER, row])
    assert warnings == []
    (edition,) = found
    assert (edition["region"], edition["cart_id"], edition["physical_format"]) == (
        "USA",
        "LA-H-AQXHA-USA",
        "game_card",
    )
    assert (edition["release_date"].isoformat(), edition["release_precision"]) == (
        "2020-09-18",
        "day",
    )


def test_a_missing_optional_column_is_a_warning_not_a_failure():
    (edition,), warnings = parse_master([["Game Title", "Region"], ["Hades", "USA"]])
    assert edition["physical_format"] is None
    assert "missing_column:Cart ID" in warnings


def test_a_missing_required_column_fails():
    with pytest.raises(SheetSchemaError):
        parse_master([["Game Title", "Publisher"], ["Hades", "Supergiant"]])


def test_rows_without_a_title_or_region_are_skipped():
    found, _ = parse_master([["Game Title", "Region"], ["", "USA"], ["Hades", ""]])
    assert found == []


def test_a_ciab_no_row_adds_nothing():
    rows = [
        ["Game Title", "Region", "Publisher", "CIAB only?"],
        ["A", "USA", "P", "Yes"],
        ["B", "USA", "P", "No"],
    ]
    found, _ = parse_ciab(rows)
    assert [row["title"] for row in found] == ["A"]


def test_a_cartridge_and_a_code_in_a_box_are_two_editions():
    master, _ = parse_master([["Game Title", "Region", "Publisher"], ["A", "USA", "P"]])
    ciab, _ = parse_ciab(
        [["Game Title", "Region", "Publisher", "CIAB only?"], ["A", "USA", "P", "Yes"]]
    )
    assert len(to_editions(master, ciab)) == 2


def test_two_printings_in_one_region_are_two_editions():
    master, _ = parse_master(
        [
            ["Game Title", "Region", "Publisher", "Edition Info"],
            ["A", "USA", "P", ""],
            ["A", "USA", "P", "Limited Edition"],
            ["A", "USA", "P", ""],
        ]
    )
    assert len(to_editions(master, [])) == 2


# --- Fetching -----------------------------------------------------------------------


def _a1(title: str) -> str:
    return "'" + title.replace("'", "''") + "'"


def _serving_the_fixtures(request):
    assert request.url.params["key"] == "test-key"
    assert SHEET_ID in request.url.path
    if request.url.params.get("fields") == "sheets.properties":
        return httpx2.Response(200, json=_load("properties"))
    ciab = _a1(tab_titles(_load("properties"), TABS)["ciab"])
    name = "ciab" if unquote(request.url.path).endswith(ciab) else "master"
    return httpx2.Response(200, json=_load(name))


@pytest.mark.asyncio
async def test_list_editions_reads_both_tabs_of_the_switch_1_sheet(editions):
    transport = httpx2.MockTransport(_serving_the_fixtures)
    async with httpx2.AsyncClient(transport=transport) as client:
        found, warnings = await list_editions(client, "test-key")
    assert (len(found), warnings) == (len(editions), [])


@pytest.mark.asyncio
async def test_without_a_key_the_switch_1_sheet_is_not_fetched():
    def refuse(request):
        raise AssertionError("fetched without a key")

    async with httpx2.AsyncClient(transport=httpx2.MockTransport(refuse)) as client:
        with pytest.raises(SheetsNotConfigured):
            await list_editions(client, None)
