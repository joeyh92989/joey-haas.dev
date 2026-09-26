"""The r/NSCollectors Switch 2 registry, read through the Google Sheets API.

Two tabs, both in the Release Details layout: `Switch 2 Release Details`
(released games) and `Upcoming Switch 2 Releases` (announced ones, where a
card type may still read TBC). Each row is one edition of a title in a
region, dated by its own Release Date. Neither summary tab is read: the
details tabs date every row themselves (plan, Execution summary).

The sheet is found by gid, because tab titles change and gids do not; the
header row is found by content, because it is not row 0 and has moved. The
CSV export is never fetched: docs.google.com's robots.txt disallows it.

Only fetch_properties and fetch_tab touch the network. The API key travels
as a query parameter and is never logged, and no error raised here carries
a request URL.
"""

from __future__ import annotations

import logging
from urllib.parse import quote

from matching import normalize_title
from physical_sources.base import EditionRow, HostThrottle, PhysicalSourceError
from physical_sources.limits import CART_ID_PATTERN, SWITCH_2
from physical_sources.parse import game_title, parse_loose_date, parse_ymd

logger = logging.getLogger(__name__)

SOURCE = "nscollectors"
SHEET_ID = "1LEIJUOanvkKq9kv1fSOnD40GdE1Jt5LzSYsg8yAPmb8"
SHEETS_API = f"https://sheets.googleapis.com/v4/spreadsheets/{SHEET_ID}"
SHEETS_HOST = "sheets.googleapis.com"
# Tab -> gid.
TABS = {"details": 764784245, "upcoming_details": 238551450}

REQUIRED_DETAILS = ("Game Title", "Region", "Card Type")
# Missing optional columns are warnings and NULL fields, never a failed run.
OPTIONAL_DETAILS = ("Master Title", "Cart ID", "Publisher", "Editions", "Release Date")

# Case-folded card type -> (is_physical, format).
CARD_TYPES: dict[str, tuple[bool | None, str | None]] = {
    "game card": (True, "game_card"),
    "game-key card": (True, "game_key_card"),
    "game key card": (True, "game_key_card"),
    "code in box": (True, "code_in_box"),
    "code-in-box": (True, "code_in_box"),
    "code in a box": (True, "code_in_box"),
    "retail code": (True, "code_in_box"),
    "digital": (False, None),
    "digital only": (False, None),
    # Announced, card type not listed yet: pools read NULL as unknown.
    "tbc": (None, None),
}


class SheetsNotConfigured(PhysicalSourceError):
    """No GOOGLE_SHEETS_API_KEY on this deploy: the registry is skipped."""

    code = "sheets_not_configured"


class SheetSchemaError(PhysicalSourceError):
    """A tab or a required column is missing; the run writes nothing."""

    code = "schema_missing_columns"


def tab_titles(properties: dict) -> dict[str, str]:
    """{tab: current title} for TABS, from a sheets.properties response."""
    by_gid = {
        sheet.get("properties", {}).get("sheetId"): sheet.get("properties", {}).get(
            "title"
        )
        for sheet in properties.get("sheets", [])
    }
    missing = [f"{tab} (gid {gid})" for tab, gid in TABS.items() if not by_gid.get(gid)]
    if missing:
        raise SheetSchemaError(f"sheet tab not found: {', '.join(missing)}")
    return {tab: by_gid[gid] for tab, gid in TABS.items()}


def rows_from_values(payload: dict) -> list[list[str]]:
    """A values response as rows padded to the widest row.

    The API omits trailing empty cells, so a row whose last columns are blank
    comes back short.
    """
    rows = [
        [str(cell) for cell in row]
        for row in payload.get("values", [])
        if isinstance(row, list)
    ]
    width = max((len(row) for row in rows), default=0)
    return [row + [""] * (width - len(row)) for row in rows]


def locate_header(rows: list[list[str]], required: tuple[str, ...]) -> int:
    """The first row holding every required column name."""
    for index, row in enumerate(rows):
        cells = {cell.strip() for cell in row}
        if all(column in cells for column in required):
            return index
    raise SheetSchemaError(f"no header row with {', '.join(required)}")


def _yes_no(value: str) -> bool | None:
    return {"yes": True, "no": False}.get(value.strip().lower())


def _cart_id(value: str) -> str | None:
    cart_id = value.strip().upper()
    return cart_id if CART_ID_PATTERN.match(cart_id) else None


def parse_details(
    rows: list[list[str]], upcoming: bool = False
) -> tuple[list[dict], list[str]]:
    """Rows of either details tab -> (editions as dicts, warnings).

    A blank card type is physical with an unknown format on Release Details,
    and unknown altogether on Upcoming Releases, where blank means not listed
    yet. A card type outside CARD_TYPES is physical with an unknown format,
    and named in the warnings so new vocabulary is seen.
    """
    header_index = locate_header(rows, REQUIRED_DETAILS)
    columns = {cell.strip(): index for index, cell in enumerate(rows[header_index])}
    # Upcoming Releases has never had a Master Title column.
    expected = [n for n in OPTIONAL_DETAILS if not (upcoming and n == "Master Title")]
    warnings = [f"missing_column:{name}" for name in expected if name not in columns]
    ns1 = next((name for name in columns if "NS1" in name), None)
    if ns1 is None:
        warnings.append("missing_column:NS1")

    def cell(row: list[str], name: str | None) -> str:
        index = columns.get(name) if name else None
        return row[index].strip() if index is not None and index < len(row) else ""

    editions: list[dict] = []
    unknown: set[str] = set()
    for row in rows[header_index + 1 :]:
        title = cell(row, "Game Title")
        if not title:
            continue
        card_type = cell(row, "Card Type")
        key = card_type.casefold()
        if key in CARD_TYPES:
            is_physical, fmt = CARD_TYPES[key]
        elif not key:
            is_physical, fmt = (None if upcoming else True), None
        else:
            is_physical, fmt = True, None
            unknown.add(card_type)
        release_text = cell(row, "Release Date")
        released = parse_ymd(release_text)
        precision = "day" if released else None
        if released is None:
            released, precision = parse_loose_date(release_text)
        editions.append(
            {
                "title": title,
                "master_title": cell(row, "Master Title") or None,
                "region": cell(row, "Region").upper(),
                "card_type": card_type,
                "is_physical": is_physical,
                "physical_format": fmt,
                "cart_id": _cart_id(cell(row, "Cart ID")),
                "publisher": cell(row, "Publisher") or None,
                "editions": cell(row, "Editions") or None,
                "ns1_compatible": _yes_no(cell(row, ns1)),
                "release_date": released,
                "release_precision": precision,
            }
        )
    warnings += [f"unknown_card_type:{value}" for value in sorted(unknown)]
    return editions, warnings


def source_ref(
    title: str, region: str, publisher: str | None, card_type: str | None
) -> str:
    """normalize_title(title) | REGION | normalize_title(publisher) | card type.

    Title and region alone are not unique: WWE 2K25 EUR has a Game-Key Card
    row and a Code in a Box row from one publisher.
    """
    return "|".join(
        (
            normalize_title(title),
            region.upper(),
            normalize_title(publisher or ""),
            (card_type or "").strip().casefold(),
        )
    )


def _edition(row: dict) -> EditionRow:
    return EditionRow(
        source=SOURCE,
        source_ref=source_ref(
            row["title"], row["region"], row["publisher"], row["card_type"]
        ),
        title=row["title"],
        title_normalized=normalize_title(game_title(row["title"])),
        platform_id=SWITCH_2,
        region=row["region"],
        is_physical=row["is_physical"],
        physical_format=row["physical_format"],
        format_source="registry" if row["physical_format"] else None,
        cart_id=row["cart_id"],
        publisher=row["publisher"],
        editions=row["editions"],
        ns1_compatible=row["ns1_compatible"],
        release_date=row["release_date"],
        release_precision=row["release_precision"],
    )


def merge(details: list[dict], upcoming: list[dict]) -> list[EditionRow]:
    """One EditionRow per row of either tab; a source_ref already seen is
    dropped, so Release Details wins over Upcoming Releases and a repeated
    row never reaches the unique key twice."""
    seen: set[str] = set()
    rows: list[EditionRow] = []
    for row in (*details, *upcoming):
        edition = _edition(row)
        if edition.source_ref in seen:
            continue
        seen.add(edition.source_ref)
        rows.append(edition)
    return rows


def _a1_sheet(title: str) -> str:
    """The whole tab in A1 notation; quotes are required around spaces."""
    return "'" + title.replace("'", "''") + "'"


async def _get_json(client, url: str, params: dict, throttle: HostThrottle | None):
    if throttle is not None:
        await throttle.wait(SHEETS_HOST)
    try:
        response = await client.get(url, params=params)
    except Exception as error:
        # The exception text can carry the request URL, and with it the key.
        raise PhysicalSourceError(
            f"Sheets API request failed: {type(error).__name__}", code="http_error"
        ) from None
    if response.status_code in (403, 404):
        raise PhysicalSourceError(
            f"Sheets API refused the sheet: HTTP {response.status_code}",
            code="sheet_unavailable",
        )
    if response.status_code != 200:
        raise PhysicalSourceError(
            f"Sheets API: HTTP {response.status_code}", code="http_error"
        )
    try:
        payload = response.json()
    except ValueError:
        raise PhysicalSourceError(
            "Sheets API: body is not JSON", code="http_error"
        ) from None
    if not isinstance(payload, dict):
        raise PhysicalSourceError(
            "Sheets API: unexpected body", code="schema_missing_columns"
        )
    return payload


async def fetch_properties(
    client, key: str, throttle: HostThrottle | None = None
) -> dict:
    """GET /v4/spreadsheets/{id}?fields=sheets.properties."""
    # Every query parameter goes in `params`: httpx2 replaces a URL's own
    # query string with them rather than merging.
    return await _get_json(
        client, SHEETS_API, {"fields": "sheets.properties", "key": key}, throttle
    )


async def fetch_tab(
    client, key: str, title: str, throttle: HostThrottle | None = None
) -> dict:
    """GET /v4/spreadsheets/{id}/values/{title}: one whole tab."""
    url = f"{SHEETS_API}/values/{quote(_a1_sheet(title), safe='')}"
    return await _get_json(client, url, {"key": key}, throttle)


async def list_editions(
    client, key: str | None, throttle: HostThrottle | None = None
) -> tuple[list[EditionRow], list[str]]:
    """Every registry edition, and the warnings the run should record."""
    if not key:
        raise SheetsNotConfigured("GOOGLE_SHEETS_API_KEY is not set")
    titles = tab_titles(await fetch_properties(client, key, throttle))
    parsed: dict[str, list[dict]] = {}
    warnings: list[str] = []
    for tab, title in titles.items():
        rows = rows_from_values(await fetch_tab(client, key, title, throttle))
        editions, tab_warnings = parse_details(rows, upcoming=tab != "details")
        parsed[tab] = editions
        warnings += [f"{tab}:{warning}" for warning in tab_warnings]
        logger.info("registry %s (%s): %d rows", tab, title, len(editions))
    return merge(parsed["details"], parsed["upcoming_details"]), warnings
