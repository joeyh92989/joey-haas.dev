"""Dates, availability, edition labels and titles, as stores and registries write them.

Pure. Every date comes back with its precision: "Shipping Q4 2026" is the
first of October at quarter precision, never the first of October as a day.
The forms are the ones seen in the recorded fixtures and the spec; anything
else is None rather than a guess.
"""

from __future__ import annotations

import re
from collections.abc import Iterable
from datetime import date

EDITION_LABEL = re.compile(
    r"\b(Standard|Collector['’]?s|Deluxe|Special|First|Limited|Exclusive|Retro|"
    r"Premium)\b( Edition)?",
    re.IGNORECASE,
)

MONTHS = {
    name: number
    for number, names in enumerate(
        (
            ("jan", "january"),
            ("feb", "february"),
            ("mar", "march"),
            ("apr", "april"),
            ("may",),
            ("jun", "june"),
            ("jul", "july"),
            ("aug", "august"),
            ("sep", "sept", "september"),
            ("oct", "october"),
            ("nov", "november"),
            ("dec", "december"),
        ),
        start=1,
    )
    for name in names
}
_MONTH = (
    r"(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?"
    r"|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?"
)
_DAY = r"(\d{1,2})(?:st|nd|rd|th)?"
# Announcements name the coming season; winter is taken as the one that
# starts in December of the named year.
SEASON_QUARTERS = {"spring": 2, "summer": 3, "fall": 4, "autumn": 4, "winter": 4}

# Most specific first; find_date takes the earliest match in the text and,
# at one position, the first form listed.
_FORMS: tuple[tuple[str, re.Pattern], ...] = tuple(
    (name, re.compile(pattern, re.IGNORECASE))
    for name, pattern in (
        ("ymd", r"\b(\d{4})[/-](\d{1,2})[/-](\d{1,2})\b"),
        # "Dec 1 - Jan 31 2027", "Jan 12 – 31, 2027": a window, read as the
        # month it opens in.
        (
            "range",
            rf"\b{_MONTH} {_DAY}\s*[-–—]\s*(?:{_MONTH} )?{_DAY},? (\d{{4}})\b",
        ),
        ("mdy", rf"\b{_MONTH} {_DAY},? (\d{{4}})\b"),
        ("my", rf"\b{_MONTH},? (\d{{4}})\b"),
        ("ym", r"\b(\d{4})-(\d{1,2})\b"),
        ("quarter", r"\bQ([1-4]) (\d{4})\b"),
        ("season", r"\b(spring|summer|fall|autumn|winter) (\d{4})\b"),
        ("year", r"\b(20\d{2}|19\d{2})\b"),
    )
)


def _month_number(token: str) -> int:
    return MONTHS[token.lower().rstrip(".")]


def _safe_date(year: int, month: int, day: int) -> date | None:
    try:
        return date(year, month, day)
    except ValueError:
        return None


def _read(name: str, match: re.Match) -> tuple[date | None, str | None]:
    groups = match.groups()
    if name == "ymd":
        year, month, day = (int(value) for value in groups)
        return _safe_date(year, month, day), "day"
    if name == "range":
        first_month, _first_day, last_month, _last_day, year = groups
        start = _month_number(first_month)
        end = _month_number(last_month) if last_month else start
        # A window that crosses the new year opens in the year before.
        opens = int(year) - 1 if start > end else int(year)
        return _safe_date(opens, start, 1), "month"
    if name == "mdy":
        month, day, year = groups
        return _safe_date(int(year), _month_number(month), int(day)), "day"
    if name == "my":
        month, year = groups
        return _safe_date(int(year), _month_number(month), 1), "month"
    if name == "ym":
        year, month = (int(value) for value in groups)
        return _safe_date(year, month, 1), "month"
    if name == "quarter":
        quarter, year = (int(value) for value in groups)
        return date(year, 3 * quarter - 2, 1), "quarter"
    if name == "season":
        season, year = groups
        quarter = SEASON_QUARTERS[season.lower()]
        return date(int(year), 3 * quarter - 2, 1), "quarter"
    return date(int(groups[0]), 1, 1), "year"


def find_date(text: str) -> tuple[date | None, str | None, str | None]:
    """The earliest date-like phrase in `text`: (date, precision, phrase).

    A phrase that looks like a date but is not one ("2025-26" read as month
    26) gives way to the next candidate rather than ending the search.
    """
    found = []
    for rank, (name, pattern) in enumerate(_FORMS):
        for match in pattern.finditer(text):
            found.append((match.start(), rank, name, match))
    for _, _, name, match in sorted(found, key=lambda entry: entry[:2]):
        value, precision = _read(name, match)
        if value is not None:
            return value, precision, match.group(0)
    return None, None, None


def parse_loose_date(text: str | None) -> tuple[date | None, str | None]:
    """A date field: 'Mon D, YYYY' -> day; 'Mon YYYY' / 'YYYY-MM' -> month;
    'Qn YYYY' -> quarter; 'YYYY' -> year; TBA, blank or anything else -> None."""
    value, precision, _ = find_date((text or "").strip())
    return value, precision


def parse_ymd(text: str | None) -> date | None:
    """YYYY/MM/DD (the sheet) or YYYY-MM-DD, and nothing looser."""
    match = re.fullmatch(r"\s*(\d{4})[/-](\d{1,2})[/-](\d{1,2})\s*", text or "")
    if not match:
        return None
    return _safe_date(*(int(value) for value in match.groups()))


_SPACE = re.compile(r"\s+")
# Where a store states a release or ship date, and how far past it to look.
RELEASE_ANCHORS = re.compile(
    r"(release date:?|estimated ship date:?|shipping|ships|releasing|\best\b)",
    re.IGNORECASE,
)
# Wide enough for "September 15th - October 31st, 2026"; the date must still
# start at the anchor, so a wider window never borrows a later sentence's.
ANCHOR_WINDOW = 50


def parse_release(text: str | None) -> tuple[date | None, str | None, str | None]:
    """(release_date, precision, matched_text) from the first date a store
    anchors with Release Date, Estimated Ship Date, Shipping, Releasing or
    EST, read from the ANCHOR_WINDOW characters after the anchor. The date
    must follow its anchor directly, so "Shipping Q3 Wave 2 -
    Shipping Q4 Remaining Orders - Q1 2027" dates nothing rather than
    borrowing the last wave's year for the first."""
    flat = _SPACE.sub(" ", text or "")
    for anchor in RELEASE_ANCHORS.finditer(flat):
        window = flat[anchor.end() : anchor.end() + ANCHOR_WINDOW].lstrip(" :")
        value, precision, phrase = find_date(window)
        if value is not None and window.lower().startswith(phrase.lower()):
            return value, precision, f"{anchor.group(0)} {phrase}".strip()
    return None, None, None


# Up to 80 characters, not up to the first full stop: "Nov. 8, 2026" has one.
PREORDER_CLOSE = re.compile(r"pre-?orders? close (?:on )?(.{0,80})", re.IGNORECASE)


def parse_preorder_close(text: str | None) -> date | None:
    """'PRE-ORDERS CLOSE ON SUNDAY, NOVEMBER 8, 2026, AT 11:59 PM …' -> the day."""
    match = PREORDER_CLOSE.search(_SPACE.sub(" ", text or ""))
    if not match:
        return None
    value, precision, _ = find_date(match.group(1))
    return value if precision == "day" else None


# Platform lists and pre-order markers stores put in a title's brackets.
_BRACKETED = re.compile(
    r"\s*[(\[][^)\]]*(?:switch|ps[45]|xbox|pc|nintendo|pre-?order|gbc?|genesis)"
    r"[^)\]]*[)\]]",
    re.IGNORECASE,
)
_EDITION_PHRASE = re.compile(
    r"\s*[-–:]?\s*\b(?:Standard|Collector['’]?s|Deluxe|Special|First|Limited|"
    r"Exclusive|Retro|Premium) Edition\b",
    re.IGNORECASE,
)
_TRAILING = re.compile(r"[\s\-–:,]+$")


def strip_title(title: str, patterns: Iterable[re.Pattern] = ()) -> str:
    """The game's own title: the store's prefixes and suffixes removed, then
    bracketed platform lists, then an '<label> Edition' phrase."""
    stripped = title
    for pattern in patterns:
        stripped = pattern.sub("", stripped)
    stripped = _BRACKETED.sub("", stripped)
    stripped = _EDITION_PHRASE.sub("", stripped)
    return _TRAILING.sub("", _SPACE.sub(" ", stripped)).strip()


def edition_label(*texts: str | None) -> str | None:
    """The first edition word in the title or option values, e.g. 'Standard'."""
    for text in texts:
        match = EDITION_LABEL.search(text or "")
        if match:
            word = match.group(1).replace("’", "'")
            return word[0].upper() + word[1:].lower()
    return None


def _tags(product: dict) -> set[str]:
    tags = product.get("tags") or []
    if isinstance(tags, str):
        tags = tags.split(",")
    return {tag.strip().lower() for tag in tags if tag.strip()}


def status_from(
    strategy: Iterable[str],
    product: dict,
    variant: dict,
    collections_seen: Iterable[str],
) -> str:
    """preorder | in_stock | sold_out, from the store's strategy in order.

    Steps: 'collection:<handle>=<status>', 'tag:<tag>=<status>',
    'tag_prefix:<prefix>=<status>', 'tag_if_unavailable:<tag>=<status>' (a
    tag trusted only when the variant is unavailable: Strictly Limited left
    a Sold Out tag on an available item), 'title_prefix:<p>=<status>',
    'title_contains:<s>=<status>', and 'available', which always answers
    from variant.available. The first step that matches wins.
    """
    tags = _tags(product)
    title = (product.get("title") or product.get("name") or "").lower()
    seen = {handle.lower() for handle in collections_seen}
    available = bool(variant.get("available"))
    for step in strategy:
        if step == "available":
            return "in_stock" if available else "sold_out"
        kind, _, rule = step.partition(":")
        value, _, status = rule.rpartition("=")
        value = value.lower()
        if (
            (kind == "collection" and value in seen)
            or (kind == "tag" and value in tags)
            or (kind == "tag_prefix" and any(tag.startswith(value) for tag in tags))
            or (kind == "tag_if_unavailable" and not available and value in tags)
            or (kind == "title_prefix" and title.startswith(value))
            or (kind == "title_contains" and value in title)
        ):
            return status
    return "in_stock" if available else "sold_out"


# --- Platforms ----------------------------------------------------------------------
#
# (pattern, IGDB id or None, label), most specific first: "Switch 2" before
# "Switch", "SNES" before "NES", "Game Boy Color" before "Game Boy". Ids are
# only the ones this codebase has verified (sources.igdb.PLATFORM_NAMES);
# retro platforms carry a label alone rather than a remembered id.
PLATFORMS: tuple[tuple[str, int | None, str], ...] = (
    (r"switch ?2|\bnsw ?2\b|\bns2\b|\bsw2\b", 508, "Nintendo Switch 2"),
    (r"\bswitch\b|\bnsw\b", 130, "Nintendo Switch"),
    (r"\bn64\b|nintendo 64", 4, "Nintendo 64"),
    (r"\bps ?vita\b|playstation ?vita|\bvita\b", None, "PS Vita"),
    (r"\bps ?5\b|playstation ?5", 167, "PlayStation 5"),
    (r"\bps ?4\b|playstation ?4", 48, "PlayStation 4"),
    (r"xbox one", 49, "Xbox One"),
    (r"xbox series|xbox ?x\b", 169, "Xbox Series X|S"),
    (r"\bxbox\b", None, "Xbox"),
    (r"\b3ds\b", 37, "Nintendo 3DS"),
    (r"\bwii ?u\b", 41, "Wii U"),
    (r"\bpc\b|\bsteam\b", 6, "PC"),
    (r"\bsnes\b|super nintendo", None, "SNES"),
    (r"\bnes\b|nintendo entertainment system", None, "NES"),
    (r"game ?boy colou?r|\bgbc\b", None, "Game Boy Color"),
    (r"game ?boy advance|\bgba\b", None, "Game Boy Advance"),
    (r"game ?boy|\bgb\b|\bdmg\b", None, "Game Boy"),
    (r"genesis|mega ?drive", None, "Sega Genesis"),
    (r"sega ?cd|\bscd\b", None, "Sega CD"),
    (r"dreamcast", None, "Dreamcast"),
    (r"nintendo ds|\bds\b", None, "Nintendo DS"),
    (r"playstation", None, "PlayStation"),
)
_PLATFORM = re.compile(
    "|".join(
        f"(?P<p{index}>{pattern})" for index, (pattern, _, _) in enumerate(PLATFORMS)
    ),
    re.IGNORECASE,
)
_MARKS = re.compile(r"[™®©]|\bsystem\b")


def platforms_in(text: str | None) -> list[tuple[int | None, str]]:
    """Every platform named in `text`, in order, each once: [(id, label)]."""
    found: list[tuple[int | None, str]] = []
    for match in _PLATFORM.finditer(_MARKS.sub("", text or "")):
        index = int(match.lastgroup[1:])
        platform = PLATFORMS[index][1:]
        if platform not in found:
            found.append(platform)
    return found


def platform_of(text: str | None) -> tuple[int | None, str | None]:
    """The one platform `text` names, or (None, None) when it names none or
    several (a title listing "Switch 2, PS5, Xbox" is not one platform)."""
    found = platforms_in(text)
    return found[0] if len(found) == 1 else (None, None)
