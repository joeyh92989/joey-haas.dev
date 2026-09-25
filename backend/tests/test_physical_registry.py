"""The NSCollectors registry reader, on the recorded Sheets API responses."""

import json
from collections import Counter
from datetime import date
from pathlib import Path

import httpx2
import pytest

from physical_sources.base import PhysicalSourceError
from physical_sources.registry import (
    CARD_TYPES,
    SheetSchemaError,
    SheetsNotConfigured,
    list_editions,
    locate_header,
    merge,
    parse_details,
    rows_from_values,
    source_ref,
    tab_titles,
)

REGISTRY = Path(__file__).parent / "fixtures" / "physical" / "registry"


def _load(name: str) -> dict:
    return json.loads((REGISTRY / f"{name}.json").read_text())


def _rows(name: str) -> list[list[str]]:
    return rows_from_values(_load(name))


@pytest.fixture(scope="module")
def details():
    return parse_details(_rows("details"))


@pytest.fixture(scope="module")
def upcoming():
    return parse_details(_rows("upcoming_details"), upcoming=True)


def _find(rows, title_start, region, **match):
    return [
        row
        for row in rows
        if row["title"].startswith(title_start)
        and row["region"] == region
        and all(row[key] == value for key, value in match.items())
    ]


# --- Tabs, rows and headers ---------------------------------------------------------


def test_tab_titles_maps_both_gids():
    assert tab_titles(_load("properties")) == {
        "details": "Switch 2 Release Details",
        "upcoming_details": "Upcoming Switch 2 Releases",
    }


def test_a_missing_gid_is_named():
    properties = _load("properties")
    kept = [s for s in properties["sheets"] if s["properties"]["sheetId"] != 238551450]
    with pytest.raises(SheetSchemaError, match="238551450"):
        tab_titles({"sheets": kept})


def test_rows_are_padded_to_the_widest_row():
    rows = rows_from_values({"values": [["a", "b", "c"], ["x"], []]})
    assert rows == [["a", "b", "c"], ["x", "", ""], ["", "", ""]]


def test_the_recorded_rows_are_ragged_before_padding():
    raw = _load("details")["values"]
    assert len({len(row) for row in raw}) > 1
    assert len({len(row) for row in _rows("details")}) == 1


def test_the_header_is_found_below_row_0():
    assert locate_header(_rows("details"), ("Game Title", "Region", "Card Type")) == 3
    assert locate_header(_rows("upcoming_details"), ("Game Title",)) == 3


def test_a_missing_required_column_fails_the_run():
    rows = [["Game Title", "Region"], ["A", "USA"]]
    with pytest.raises(SheetSchemaError) as error:
        parse_details(rows)
    assert error.value.code == "schema_missing_columns"


# --- Card types ---------------------------------------------------------------------


def test_every_recorded_card_type_is_known(details, upcoming):
    seen = Counter(row["card_type"] for row in (*details[0], *upcoming[0]))
    print("card types:", dict(seen))  # a new value shows up in -s output
    unknown = [value for value in seen if value and value.casefold() not in CARD_TYPES]
    assert unknown == []
    assert not [w for w in (*details[1], *upcoming[1]) if "unknown_card_type" in w]


def test_an_unknown_card_type_is_physical_unknown_and_warned():
    rows = [["Game Title", "Region", "Card Type"], ["A", "usa", "Mystery Cart"]]
    editions, warnings = parse_details(rows)
    assert (editions[0]["is_physical"], editions[0]["physical_format"]) == (True, None)
    assert editions[0]["region"] == "USA"
    assert "unknown_card_type:Mystery Cart" in warnings


def test_digital_is_not_physical():
    rows = [["Game Title", "Region", "Card Type"], ["A", "USA", "Digital only"]]
    edition = parse_details(rows)[0][0]
    assert (edition["is_physical"], edition["physical_format"]) == (False, None)


def test_blank_card_type_depends_on_the_tab():
    rows = [["Game Title", "Region", "Card Type"], ["A", "USA", ""]]
    assert parse_details(rows)[0][0]["is_physical"] is True
    assert parse_details(rows, upcoming=True)[0][0]["is_physical"] is None


def test_tbc_upcoming_rows_are_unknown(upcoming):
    tbc = [row for row in upcoming[0] if row["card_type"] == "TBC"]
    assert len(tbc) == 64
    assert {(row["is_physical"], row["physical_format"]) for row in tbc} == {
        (None, None)
    }


def test_upcoming_releases_warns_about_nothing_it_never_had(upcoming):
    assert upcoming[1] == []


# --- Cart IDs, dates, NS1 -----------------------------------------------------------


def test_a_key_card_keeps_its_cart_id(details):
    row = _find(details[0], "A-Train9 Evolution", "JPN")[0]
    assert (row["physical_format"], row["cart_id"]) == (
        "game_key_card",
        "LP-ABX4A-JPN-0",
    )


def test_an_na_cart_id_is_null_and_the_format_comes_from_card_type(details):
    row = _find(details[0], "WWE 2K25", "EUR", card_type="Code in a Box")[0]
    assert (row["cart_id"], row["physical_format"]) == (None, "code_in_box")


def test_release_dates_are_per_row_at_day_precision(details):
    row = _find(details[0], "Cyberpunk 2077: Ultimate Edition", "USA")[0]
    assert (row["release_date"], row["release_precision"]) == (date(2025, 6, 5), "day")
    assert all(row["release_precision"] == "day" for row in details[0])


def test_a_looser_release_text_falls_back():
    rows = [
        ["Game Title", "Region", "Card Type", "Release Date"],
        ["A", "USA", "Game Card", "Q1 2027"],
        ["B", "USA", "Game Card", "TBA"],
    ]
    editions = parse_details(rows)[0]
    assert (editions[0]["release_date"], editions[0]["release_precision"]) == (
        date(2027, 1, 1),
        "quarter",
    )
    assert editions[1]["release_date"] is None


def test_ns1_compatible_is_read(details):
    assert {row["ns1_compatible"] for row in details[0]} == {True, False}


# --- Edition identity and merge ------------------------------------------------------


def test_source_ref_shape():
    assert source_ref("WWE 2K25", "eur", "2k", "Code in a Box") == (
        "wwe 2k25|EUR|2k|code in a box"
    )


def test_wwe_2k25_eur_editions_get_distinct_refs(details):
    refs = {
        source_ref(r["title"], r["region"], r["publisher"], r["card_type"])
        for r in _find(details[0], "WWE 2K25", "EUR")
    }
    assert len(refs) == 2


def test_human_fall_flat_2_eur_editions_get_distinct_refs(upcoming):
    rows = _find(upcoming[0], "Human Fall Flat 2", "EUR")
    refs = {
        source_ref(r["title"], r["region"], r["publisher"], r["card_type"])
        for r in rows
    }
    assert len(rows) == 2 and len(refs) == 2


@pytest.mark.parametrize("tab", ["details", "upcoming"])
def test_every_ref_is_unique_within_its_tab(tab, details, upcoming):
    rows = (details if tab == "details" else upcoming)[0]
    refs = [
        source_ref(r["title"], r["region"], r["publisher"], r["card_type"])
        for r in rows
    ]
    assert len(refs) == len(set(refs))


def test_merge_prefers_release_details_for_a_shared_ref(details, upcoming):
    editions = merge(details[0], upcoming[0])
    refs = [edition.source_ref for edition in editions]
    assert len(refs) == len(set(refs))
    shared = {
        source_ref(r["title"], r["region"], r["publisher"], r["card_type"])
        for r in details[0]
    } & {
        source_ref(r["title"], r["region"], r["publisher"], r["card_type"])
        for r in upcoming[0]
    }
    assert len(editions) == len(details[0]) + len(upcoming[0]) - len(shared)


def test_merged_editions_carry_the_registry_fields(details, upcoming):
    editions = merge(details[0], upcoming[0])
    key_card = next(e for e in editions if e.cart_id == "LP-ABX4A-JPN-0")
    assert (key_card.source, key_card.platform_id, key_card.format_source) == (
        "nscollectors",
        508,
        "registry",
    )
    assert key_card.title_normalized == "a train9 evolution"
    unknown = next(e for e in editions if e.is_physical is None)
    assert (unknown.physical_format, unknown.format_source) == (None, None)


# --- Fetching -----------------------------------------------------------------------


def _client(handler):
    return httpx2.AsyncClient(transport=httpx2.MockTransport(handler))


def _serving_the_fixtures(request):
    assert request.url.params["key"] == "test-key"
    path = request.url.path
    if request.url.params.get("fields") == "sheets.properties":
        return httpx2.Response(200, json=_load("properties"))
    if "Upcoming" in path:
        return httpx2.Response(200, json=_load("upcoming_details"))
    if "Release%20Details" in str(request.url) or "Release Details" in path:
        return httpx2.Response(200, json=_load("details"))
    return httpx2.Response(404)


@pytest.mark.asyncio
async def test_list_editions_reads_both_tabs():
    async with _client(_serving_the_fixtures) as client:
        editions, warnings = await list_editions(client, "test-key")
    assert len(editions) > 900
    assert warnings == []


@pytest.mark.asyncio
async def test_without_a_key_nothing_is_fetched():
    def refuse(request):
        raise AssertionError("fetched without a key")

    async with _client(refuse) as client:
        with pytest.raises(SheetsNotConfigured) as error:
            await list_editions(client, None)
    assert error.value.code == "sheets_not_configured"


@pytest.mark.asyncio
async def test_a_403_is_sheet_unavailable_without_the_key():
    async with _client(lambda request: httpx2.Response(403)) as client:
        with pytest.raises(PhysicalSourceError) as error:
            await list_editions(client, "secret-key")
    assert error.value.code == "sheet_unavailable"
    assert "secret-key" not in str(error.value)


@pytest.mark.asyncio
async def test_a_network_error_never_carries_the_url():
    def handler(request):
        raise httpx2.ConnectError(f"failed {request.url}", request=request)

    async with _client(handler) as client:
        with pytest.raises(PhysicalSourceError) as error:
            await list_editions(client, "secret-key")
    assert error.value.code == "http_error"
    assert "secret-key" not in str(error.value)
