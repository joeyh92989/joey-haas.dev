"""The r/NSCollectors Switch 1 sheet, "Switch Physical Releases", read through
the Google Sheets API with registry.py's helpers.

Two tabs, found by gid: Physical Release Master, one row per physical
release of a title in a region (about 4,200 titles), and the code-in-a-box
tab. A Master row with a Switch 1 cart ID (LA-H-...) is a full cartridge at
the registry tier; one without is physical with an unknown format. A CIAB
row marked "CIAB only? = Yes" is a code in a box; one marked No adds
nothing, because its cartridge is already in Master. Every Switch 1
cartridge counts as the full game (switch1 spec, decision 5).

Optional columns are matched without case: the sheet spells one "Master
TItle". It is read only to notice a header that moved; "LP #", "Other Info",
"Verified By" and "Check" are not read at all.

Only list_editions touches the network, through registry.fetch_properties
and registry.fetch_tab, which never put a request URL (and with it the key)
in an error.
"""

from __future__ import annotations

import logging

from matching import normalize_title
from physical_sources.base import EditionRow, HostThrottle
from physical_sources.limits import SWITCH, SWITCH_1_CART_ID_PATTERN
from physical_sources.parse import game_title, parse_loose_date, parse_ymd
from physical_sources.registry import (
    SheetsNotConfigured,
    _cart_id,
    fetch_properties,
    fetch_tab,
    locate_header,
    rows_from_values,
    source_ref,
    tab_titles,
    unique_by_ref,
)

logger = logging.getLogger(__name__)

SOURCE = "nscollectors_ns1"
SHEET_ID = "1FNyvbbU64Pb9lheg28gC_5fMalIYJ0aD763T7M1QqF0"
# Tab -> gid.
TABS = {"master": 2004832329, "ciab": 1406641930}

REQUIRED_MASTER = ("Game Title", "Region")
# Missing optional columns are warnings and NULL fields, never a failed run.
OPTIONAL_MASTER = (
    "Master Title",
    "Release Date",
    "Cart ID",
    "Publisher",
    "Edition Info",
)
REQUIRED_CIAB = ("Game Title", "Region", "CIAB only?")
OPTIONAL_CIAB = ("Publisher", "Release Date")

# physical_editions.region is String(4): a longer region (a future "GLOBAL")
# would fail the whole run's flush, so its rows are skipped and named in the
# warnings instead.
REGION_LENGTH = 4

# The kind part of a source_ref: what a row of each tab is.
MASTER_KIND = "master"
CIAB_KIND = "code in box"


def _reader(rows: list[list[str]], required, optional):
    """(rows below the header, a cell reader, missing-column warnings)."""
    header_index = locate_header(rows, required)
    columns: dict[str, int] = {}
    for index, cell in enumerate(rows[header_index]):
        columns.setdefault(cell.strip().casefold(), index)
    warnings = [
        f"missing_column:{name}" for name in optional if name.casefold() not in columns
    ]

    def cell(row: list[str], name: str) -> str:
        index = columns.get(name.casefold())
        return row[index].strip() if index is not None and index < len(row) else ""

    return rows[header_index + 1 :], cell, warnings


def _too_long(regions: set[str]) -> list[str]:
    return [f"region_too_long:{region}" for region in sorted(regions)]


def _first_cart(text: str) -> str:
    """A cell naming two carts ("LA-H-ATPDA-EUR / LA-H-ATPDC-EUR") is read as
    its first."""
    return text.split(" / ")[0].strip()


def _release(text: str):
    released = parse_ymd(text)
    if released is not None:
        return released, "day"
    return parse_loose_date(text)


def parse_master(rows: list[list[str]]) -> tuple[list[dict], list[str]]:
    """Master tab rows -> (editions as dicts, warnings)."""
    body, cell, warnings = _reader(rows, REQUIRED_MASTER, OPTIONAL_MASTER)
    editions: list[dict] = []
    too_long: set[str] = set()
    for row in body:
        title, region = cell(row, "Game Title"), cell(row, "Region").upper()
        if not title or not region:
            continue
        if len(region) > REGION_LENGTH:
            too_long.add(region)
            continue
        cart_id = _cart_id(_first_cart(cell(row, "Cart ID")), SWITCH_1_CART_ID_PATTERN)
        released, precision = _release(cell(row, "Release Date"))
        editions.append(
            {
                "title": title,
                "region": region,
                "kind": MASTER_KIND,
                "physical_format": "game_card" if cart_id else None,
                "cart_id": cart_id,
                "publisher": cell(row, "Publisher") or None,
                "editions": cell(row, "Edition Info") or None,
                "release_date": released,
                "release_precision": precision,
            }
        )
    return editions, warnings + _too_long(too_long)


def parse_ciab(rows: list[list[str]]) -> tuple[list[dict], list[str]]:
    """CIAB tab rows -> (code-in-a-box editions as dicts, warnings); only
    rows marked "CIAB only? = Yes"."""
    body, cell, warnings = _reader(rows, REQUIRED_CIAB, OPTIONAL_CIAB)
    editions: list[dict] = []
    if any(cell(row, "Game Title") for row in body) and not any(
        cell(row, "CIAB only?").casefold() == "yes" for row in body
    ):
        warnings.append("no_ciab_only_rows")
    too_long: set[str] = set()
    for row in body:
        title, region = cell(row, "Game Title"), cell(row, "Region").upper()
        if not title or not region or cell(row, "CIAB only?").casefold() != "yes":
            continue
        if len(region) > REGION_LENGTH:
            too_long.add(region)
            continue
        released, precision = _release(cell(row, "Release Date"))
        editions.append(
            {
                "title": title,
                "region": region,
                "kind": CIAB_KIND,
                "physical_format": "code_in_box",
                "cart_id": None,
                "publisher": cell(row, "Publisher") or None,
                "editions": None,
                "release_date": released,
                "release_precision": precision,
            }
        )
    return editions, warnings + _too_long(too_long)


def _ref(row: dict) -> str:
    """registry.source_ref (title | REGION | publisher | kind), then the
    edition info: one publisher can print a standard and a limited edition
    of a title in one region."""
    return "|".join(
        (
            source_ref(row["title"], row["region"], row["publisher"], row["kind"]),
            normalize_title(row["editions"] or ""),
        )
    )


def _edition(row: dict) -> EditionRow:
    return EditionRow(
        source=SOURCE,
        source_ref=_ref(row),
        title=row["title"],
        title_normalized=normalize_title(game_title(row["title"])),
        platform_id=SWITCH,
        region=row["region"],
        is_physical=True,
        physical_format=row["physical_format"],
        format_source="registry" if row["physical_format"] else None,
        cart_id=row["cart_id"],
        publisher=row["publisher"],
        editions=row["editions"],
        release_date=row["release_date"],
        release_precision=row["release_precision"],
    )


def to_editions(master: list[dict], ciab: list[dict]) -> list[EditionRow]:
    """One EditionRow per row of either tab, each source_ref once (Master
    first)."""
    return unique_by_ref(_edition(row) for row in (*master, *ciab))


async def list_editions(
    client, key: str | None, throttle: HostThrottle | None = None
) -> tuple[list[EditionRow], list[str]]:
    """Every Switch 1 edition, and the warnings the run should record."""
    if not key:
        raise SheetsNotConfigured("GOOGLE_SHEETS_API_KEY is not set")
    properties = await fetch_properties(client, key, throttle, sheet_id=SHEET_ID)
    titles = tab_titles(properties, TABS)
    master_rows = rows_from_values(
        await fetch_tab(client, key, titles["master"], throttle, sheet_id=SHEET_ID)
    )
    ciab_rows = rows_from_values(
        await fetch_tab(client, key, titles["ciab"], throttle, sheet_id=SHEET_ID)
    )
    master, master_warnings = parse_master(master_rows)
    ciab, ciab_warnings = parse_ciab(ciab_rows)
    logger.info("switch 1 registry: %d master rows, %d ciab", len(master), len(ciab))
    warnings = [f"master:{w}" for w in master_warnings]
    warnings += [f"ciab:{w}" for w in ciab_warnings]
    return to_editions(master, ciab), warnings
