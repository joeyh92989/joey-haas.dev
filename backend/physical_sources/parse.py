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

from matching import normalize_title

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


PREORDER_CLOSE = re.compile(r"pre-?orders? close (?:on )?(.{0,120})", re.IGNORECASE)
_STOP = re.compile(r"\.(?=\s|$)")
_ABBREVIATED_MONTH = re.compile(
    r"\b(?:jan|feb|mar|apr|jun|jul|aug|sept?|oct|nov|dec)$", re.I
)


def _first_sentence(text: str) -> str:
    """`text` up to the full stop that ends its sentence -- not the one in
    "Nov. 8, 2026" -- so a date in the next sentence is never read."""
    for stop in _STOP.finditer(text):
        if not _ABBREVIATED_MONTH.search(text[: stop.start()]):
            return text[: stop.start()]
    return text


def parse_preorder_close(text: str | None) -> date | None:
    """'PRE-ORDERS CLOSE ON SUNDAY, NOVEMBER 8, 2026, AT 11:59 PM …' -> the day."""
    match = PREORDER_CLOSE.search(_SPACE.sub(" ", text or ""))
    if not match:
        return None
    value, precision, _ = find_date(_first_sentence(match.group(1)))
    return value if precision == "day" else None


# A Switch 2 Edition keys as its base game, so the phrase goes with whatever
# follows it: a bundled expansion ("+ Star-Crossed World"), a pack, a closing
# dash or an inverted article.
_SWITCH_2_EDITION = re.compile(
    r"\s*[-–:]?\s*\b(?:Nintendo\s+)?Switch™?\s*2\s+Edition\b.*$",
    re.IGNORECASE,
)
# Stripped with str.rstrip, not a `[...]+$` pattern: that rescans the run from
# every position in it and goes quadratic on a long " - - -" tail.
_TRAILING = " -–:,"
# The registry files "The Duskbloods" as "Duskbloods, The".
_INVERTED_ARTICLE = re.compile(r"^(.+?),\s*(The|An?)\s*$", re.IGNORECASE)


# The words stores use for a platform. The listing's platform is stored on
# its own, so none of them belongs in a key; tests/test_physical_keys.py
# holds every recorded key to this list.
PLATFORM_WORDS = (
    "nintendo switch 2",
    "nintendo switch",
    "switch 2",
    "nsw",
    "ns2",
    "playstation 5",
    "playstation 4",
    "playstation",
    "ps5",
    "ps4",
    "xbox series x",
    "xbox series s",
    "xbox one",
    "xbox",
    "various platforms",
)
_STORE_PLATFORM = (
    r"(?:nintendo\s+)?switch™?(?:\s*2)?|ns[w2]|playstation®?(?:\s*[45])?|ps[45]"
    r"|xbox(?:\s+one|\s+series\s+[xs](?:\s*[|/]\s*[xs])?)?|pc|steam"
    r"|mega\s+drive|genesis|s?nes|n64|gb[ca]?|smd|sg|md"
)
_REGION = r"eur?|usa|us|uk|jpn?|asia|pal|ntsc"
_ONE_PLATFORM = rf"(?:{_STORE_PLATFORM}|{_REGION}|various\s+platforms)"
_PLATFORM_LIST = rf"{_ONE_PLATFORM}(?:\s*(?:[,/&+|]|and)\s*{_ONE_PLATFORM})*"
# The platforms a title may end on with no separator. A lone "Switch" or "PC"
# is not among them: "Everybody 1-2-Switch!" is a name.
_BARE_PLATFORM = (
    r"nintendo\s+switch™?(?:\s*2)?|nsw|ns2|playstation®?\s*[45]|ps[45]"
    r"|xbox(?:\s+one|\s+series\s+[xs])"
)

# Innermost brackets only, their words tested separately: a class that could
# cross an opener rescanned the title from every "(" in it. A bracket naming
# a platform, a region, "with" extras or a pre-order goes whole, since stores
# write "(iam8bit Nintendo Switch 2 Exclusive Edition)" as often as "(NSW)".
_BRACKETED = re.compile(r"\s*[(\[]([^()\[\]]*)[)\]]")
# A store prefix for its web-only runs ("ONLINE EXCLUSIVE EDTION: 7'scarlet",
# the store's own spelling).
_LEADING = re.compile(
    r"^(?:online\s+)?exclusive(?:\s+edi?tion)?\s*[-–:]\s*", re.IGNORECASE
)
# Printing and packaging notes, not the game.
_MARKERS = re.compile(
    r"\s+(?:first\s+press(?:\s+se)?|limited\s+to\s+[\d,.]+|usk\s+version)\b.*$"
    r"|\s[-–]\s*[^-–]{0,30}\bcover\b.*$"
    r"|\s[-–]\s*(?:pre-?order|standard\s+release)\b.*$"
    r"|\s+(?:japanese|english|asian|us|eu)\s+version$",
    re.IGNORECASE,
)
# A tail after a dash, a colon, "for", or an opener the store never closed
# ("Popslinger - Extra Elite Edition [Nintendo Switch").
_PLATFORM_TAIL = re.compile(
    rf"(?:\s[-–]|:|\s+for|\s*[(\[])\s*(?:{_PLATFORM_LIST})\s*[-–]?$",
    re.IGNORECASE,
)
_PLATFORM_TRAILING = re.compile(rf"\s+(?:{_BARE_PLATFORM})$", re.IGNORECASE)
# Words a store puts before "Edition" for packaging, not for the game, in
# any position of a run ("Special Limited Edition", "Collector's/Limited").
# The store names are there for "- iam8bit Exclusive Edition".
_RUN_WORD = (
    r"standard|limited|special|collector['’]?s|premium|elite|physical|silver"
    r"|gold|bronze|steelbook|signature|exclusive|retail|launch|first|anniversary"
    r"|retro|extra|ultra|online|day\s+one|\d+(?:st|nd|rd|th)|iam8bit|fangamer"
)
# Words that are packaging only right before "Edition": elsewhere they are
# the game's ("Spelunker HD Deluxe Collector's Edition", "Mario Kart 8
# Deluxe Limited Edition").
_FINAL_WORD = r"deluxe|complete|definitive|ultimate"
_PACKAGING_EDITION = (
    rf"(?:(?:{_RUN_WORD})[\s/]+){{0,3}}(?:{_RUN_WORD}|{_FINAL_WORD})[\s/]+edition"
)
# A run of packaging words before "Edition", with a dash before and a "Box"
# after going with them. A named edition is not packaging and stays ("Elden
# Ring Tarnished Edition", "Tales of Arise - Beyond the Dawn Edition"): IGDB
# lists many of them as the Switch game. So does "Bundle": whether an
# "Edition Bundle" holds one game or five, the title does not say.
_EDITION_PHRASE = re.compile(
    rf"(?:\s[-–])?\s*\b{_PACKAGING_EDITION}\b(?:\s+box)?\s*[-–]?",
    re.IGNORECASE,
)
# Two or more packaging words in front of a named edition: "Epics of
# Hammerwatch: Special Limited Heroes' Edition" is the Heroes' Edition.
_NAMED_EDITION_LEAD = re.compile(
    rf"\s+(?:(?:{_RUN_WORD})[\s/]+){{2,3}}(?=\S+\s+edition$)", re.IGNORECASE
)
# The run without "Edition": "Wonder Boy Ultra Collector's", "Ankora
# Collector's Ed.", "Cotton 16-Bit LE".
_PACKAGING_TAIL = re.compile(
    rf"\s+(?:(?:(?:{_RUN_WORD})\s+){{0,2}}collector['’]?s(?:\s+ed\.?)?|le|ce)$",
    re.IGNORECASE,
)
_MERCH = (
    r"plush(?:ie)?|book|soundtrack|showroom|marionette|yunomi|cup|art"
    r"|poster|vinyl|album|merch|figure|steelbook|nendoroid"
)
# A single-game bundle is the game: "Plushie Bundle" goes with its merch
# words. A bare, "LE" or "CE" "Bundle" stays: "Taito Milestones 1&2 CE
# Bundle" is more than one game. The run is bounded, or it rescans from
# every word in it.
_BUNDLE = re.compile(
    rf"\s+(?:(?:{_MERCH})\s+){{1,3}}bundle(?:\s+upgrade)?$", re.IGNORECASE
)
# A bracket naming a platform, region, packaging edition, version, rating
# board, extras or a pre-order goes whole. A named edition in brackets stays:
# "Elden Ring (Tarnished Edition)" is still the Tarnished Edition.
_BRACKET_WORDS = re.compile(
    rf"\b(?:{_ONE_PLATFORM}|{_PACKAGING_EDITION}|pre-?order|with|version|pegi|usk)\b"
    r"|\bnintendo(?:switch)?(?![a-z])|\bswitch(?![a-z])",
    re.IGNORECASE,
)
_EXTRAS = re.compile(
    r"\s*\+\s*(?:character\s+cards|soundtrack(?:\s+cd)?|art\s*book|plush\w*)$",
    re.IGNORECASE,
)
_CLEANERS = (
    _PLATFORM_TAIL,
    _PLATFORM_TRAILING,
    _EDITION_PHRASE,
    _NAMED_EDITION_LEAD,
    _PACKAGING_TAIL,
    _BUNDLE,
    _EXTRAS,
)


def _platform_bracket(match: re.Match) -> str:
    return "" if _BRACKET_WORDS.search(match.group(1)) else match.group(0)


def _tidy(text: str) -> str:
    return _SPACE.sub(" ", text).rstrip(_TRAILING).strip()


def strip_title(title: str, patterns: Iterable[re.Pattern] = ()) -> str:
    r"""The game's own title, for keys and searches.

    In order: the store's own patterns; the Switch 2 Edition phrase and
    everything after it (first, or removing "- Nintendo Switch 2" as a
    platform tail would strand "Edition"); bracket groups naming a platform,
    region, extras or pre-order (twice, for a bracket inside a bracket);
    printing notes; then platform tails, packaging editions, bundle suffixes
    and merch extras, for up to four passes, since each can uncover another
    ("UFO 50 for Nintendo Switch™ Deluxe Edition"). A title that is nothing but those
    is kept whole rather than keyed as an empty string.

    Whitespace is collapsed first: the phrase patterns open with `\s*`, and
    on a long run of spaces in third-party text they backtrack for minutes.
    """
    collapsed = _SPACE.sub(" ", title).strip()
    stripped = collapsed
    for pattern in patterns:
        stripped = pattern.sub("", stripped)
    stripped = _LEADING.sub("", stripped)
    stripped = _SWITCH_2_EDITION.sub("", stripped)
    for _ in range(2):
        stripped = _BRACKETED.sub(_platform_bracket, stripped)
    stripped = _tidy(_MARKERS.sub("", stripped))
    for _ in range(4):
        before = stripped
        for pattern in _CLEANERS:
            # A space, not nothing: "A - Silver Edition B" is "A B", not "AB".
            stripped = _tidy(pattern.sub(" ", stripped))
        if stripped == before:
            break
    return stripped or collapsed


def edition_fallbacks(title: str, most: int = 3) -> list[str]:
    """Shorter searches for a title ending in a named edition, for when the
    full name finds nothing: "GEX Trilogy Tail Time Edition" -> "gex trilogy
    tail", then "gex trilogy". Words are normalized first, so punctuation
    never becomes a query, and at least two are kept. IGDB lists many named
    editions as the game itself, so the full name is always searched first,
    and what a shorter search finds is never linked without a human.
    """
    words = normalize_title(title).split()
    if len(words) < 4 or words[-1] != "edition":
        return []
    words = words[:-1]
    return [
        " ".join(words[:-drop]) for drop in range(1, most + 1) if len(words) - drop >= 2
    ]


def is_switch_2_edition(title: str) -> bool:
    """Whether a raw title names a Nintendo Switch 2 Edition, the Switch 2
    upgrade of a Switch 1 game."""
    return _SWITCH_2_EDITION.search(_SPACE.sub(" ", title)) is not None


def _uninvert(title: str) -> str:
    inverted = _INVERTED_ARTICLE.match(title)
    return f"{inverted.group(2)} {inverted.group(1)}" if inverted else title


def game_title(title: str) -> str:
    """A registry title as the game's own name: a trailing ', The' moved to
    the front, then `strip_title`. The article is checked again after the
    strip, for one the stripped suffix followed. What the catalogue keys and
    searches by."""
    return _uninvert(strip_title(_uninvert(title.strip())))


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
