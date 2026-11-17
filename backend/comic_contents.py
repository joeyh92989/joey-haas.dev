"""What a book collects, read from its description or reprint note (#327). Pure.

Comic Vine describes a trade in prose ("Collects Saga #1-6 and Hellboy #3").
`parse_contents` reads those lines with rules and nothing else: it returns the
entries it is sure of, and `[]` for anything it is not. It never guesses, so a
description that merely mentions numbers ("Issue #1 sold 1 million", "Volume
2 of 5") yields nothing.

Only when the rules find nothing may the caller ask a model (the route does,
inside the free-tier budget). The model's answer is checked here, hard:
`validate_model` keeps it only if every issue number and every series name
can be found in the source text, and discards the whole answer otherwise.

This module imports neither FastAPI nor SQLAlchemy (tests/test_physical_imports
pins that), so the route and the intake commit (#328) share it.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

MAX_ENTRIES = 20
MAX_SERIES = 120
MAX_ISSUE_TEXT = 200
# A source longer than this is cut before it goes to the model.
MAX_SOURCE = 4000
# The first and last issue number a link may carry (comics.MAX_ISSUE).
LINK_MAX = 9999
# A series name is a title: a handful of words, not a sentence.
_MAX_SERIES_WORDS = 8


@dataclass(frozen=True)
class Entry:
    """One thing a book collects: the series as written ('' when the text
    names none) and the issues as written (`#1-6`, `Annual #1`)."""

    series_name: str
    issue_text: str


def normalize_name(name: object) -> str:
    """A series name for comparing: lower case, `&` as `and`, no year in
    brackets, spaces collapsed."""
    if not isinstance(name, str):
        return ""
    text = re.sub(r"\(\s*\d{4}(?:\s*-\s*(?:\d{4})?)?\s*\)", " ", name.lower())
    text = text.replace("&", " and ")
    return re.sub(r"\s+", " ", text).strip()


_PLAIN = re.compile(r"^#?\s*(\d{1,4})(?:\s*-\s*(\d{1,4}))?$")


def plain_range(issue_text: object) -> tuple[int, int] | None:
    """`(from, to)` when the text is one plain number or range within
    1..9999 (`#7`, `#1-6`, `1-6`): the only kind of entry that may link to a
    title. Anything else (`Annual #1`, `#1-3, #5`, `#0`) is None."""
    found = _PLAIN.match(issue_text.strip()) if isinstance(issue_text, str) else None
    if found is None:
        return None
    low = int(found.group(1))
    high = int(found.group(2) or found.group(1))
    if not 1 <= low <= high <= LINK_MAX:
        return None
    return low, high


# --- The rules ---------------------------------------------------------------

_DASHES = dict.fromkeys(map(ord, "‐‑‒–—―−"), "-")

_TRIGGER = re.compile(
    r"\b(?:collects|collecting|reprints|reprinting|includes|contains"
    r"|originally\s+published\s+(?:in|as))\b",
    re.IGNORECASE,
)
# A sentence ends at a full stop and a capital, except after these.
_SENTENCE_END = re.compile(
    r"(?<!\bVol)(?<!\bNo)(?<!\bNos)(?<!\bvs)(?<!\bAnn)\.\s+(?=[A-Z\"'(<])"
)

_NUM = r"\d{1,4}"
_SEP = r"(?:-|to|through|thru)"
_ITEM = rf"{_NUM}(?:\s*{_SEP}\s*{_NUM})?"
# After the first item a bare number is at most three digits (so a year, as in
# "#1-6, 2013", is not an issue) and must not start a word ("5 more").
_MORE = (
    rf"(?:\s*(?:,|&|and|\+)\s*(?:#\s*{_ITEM}"
    rf"|\d{{1,3}}(?:\s*{_SEP}\s*\d{{1,3}})?(?!\s+(?!and\b)[A-Za-z])))*"
)
_KIND = r"(?:(?:giant|king)[- ]size\s+)?(?:annual|special|one[- ]shot)"
_SPEC = re.compile(
    rf"(?P<kind>\b{_KIND}\b)(?:\s*#?\s*(?P<kn>\d{{1,3}}(?:\s*-\s*\d{{1,3}})?))?"
    rf"|(?P<marker>\#|\bissues?\b\s*\#?|\bnos?\b\.?\s*\#?|\bnumbers?\b\s*\#?)"
    rf"\s*(?P<list>{_ITEM}{_MORE})(?![\d]|[/.]\d)",
    re.IGNORECASE,
)
_ITEM_RE = re.compile(rf"(\d+)(?:\s*{_SEP}\s*(\d+))?", re.IGNORECASE)

# Words that may follow a number and still be the end of the entry.
_TAIL_WORDS = {"and", "plus", "of", "from", "in", "as", "with", "by", "for", "along"}
_CONNECTORS = {
    "of",
    "the",
    "and",
    "a",
    "an",
    "in",
    "to",
    "vs",
    "for",
    "from",
    "on",
    "at",
    "de",
    "la",
    "le",
    "von",
    "van",
    "&",
}
# Said before a title, not part of it.
_FILLER = {
    "the",
    "complete",
    "entire",
    "whole",
    "material",
    "from",
    "issues",
    "issue",
    "stories",
    "story",
    "series",
    "in",
    "of",
    "collected",
}
_LEAD = re.compile(r"^(?:[\s,;:&+\-]|and\b|plus\b|as well as\b|with\b)+", re.IGNORECASE)


def _strip_leading(gap: str) -> str:
    """The gap without leading separators and filler words."""
    while True:
        before = gap
        gap = _LEAD.sub("", gap)
        words = gap.split(" ", 1)
        if words and words[0].lower().strip(".,:;") in _FILLER:
            gap = words[1] if len(words) > 1 else ""
        if gap == before:
            return gap.strip()


def _clean_series(gap: str) -> str | None:
    """The series a gap names: '' for none, None when the gap is not a title."""
    text = _strip_leading(gap)
    text = re.sub(r"\(\s*\d{4}(?:\s*-\s*(?:\d{4})?)?\s*\)", " ", text)
    text = re.sub(r"\bvol(?:ume)?\.?\s*\d+\b", " ", text, flags=re.IGNORECASE)
    text = text.strip(" \t,;:-&+\"'“”")
    text = re.sub(r"\s+(?:and|&|of|the)$", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\s+", " ", text).strip()
    if not text:
        return ""
    words = text.split(" ")
    if len(words) > _MAX_SERIES_WORDS or len(text) > MAX_SERIES:
        return None
    for word in words:
        bare = word.strip(".,:;'\"()[]!?")
        letters = [ch for ch in bare if ch.isalpha()]
        if letters and not any(ch.isupper() for ch in letters):
            if bare.lower() not in _CONNECTORS:
                return None
        if "(" in word or ")" in word or "[" in word:
            return None
    return text


def _kind_text(kind: str) -> str:
    return re.sub(r"\s+", " ", kind.replace("-", " ")).title().replace("Size", "Size")


def _read_clause(clause: str) -> list[Entry] | None:
    """The entries a clause (the text after a trigger, to the end of its
    sentence) lists, or None when any part of it is not a clean contents
    line: a clause is trusted whole or not at all."""
    entries: list[Entry] = []
    previous_end = 0
    series = ""
    found_any = False
    for spec in _SPEC.finditer(clause):
        gap = clause[previous_end : spec.start()]
        named = _clean_series(gap)
        if named is None:
            return None
        if named or not found_any:
            series = named
        # What follows the spec must end the entry, not carry on in prose.
        tail = clause[spec.end() :].lstrip()
        first = re.match(r"[A-Za-z]+", tail)
        if first and first.group(0).lower() not in _TAIL_WORDS:
            if not _SPEC.match(tail):
                return None
        previous_end = spec.end()
        found_any = True
        if spec.group("kind"):
            kind = _kind_text(spec.group("kind"))
            if spec.group("kn") is None:
                if not series:
                    return None  # a bare "Special" with no book is not contents
                entries.append(Entry(series, kind))
                continue
            for text in _items(spec.group("kn")) or []:
                entries.append(Entry(series, f"{kind} {text}"))
            if _items(spec.group("kn")) is None:
                return None
            continue
        items = _items(spec.group("list"))
        if items is None:
            return None
        entries.extend(Entry(series, text) for text in items)
    return entries if found_any else []


def _items(text: str) -> list[str] | None:
    """`1-3, 5` as `['#1-3', '#5']`; None when a range runs backwards."""
    out = []
    for found in _ITEM_RE.finditer(text):
        low = int(found.group(1))
        if found.group(2) is None:
            out.append(f"#{low}")
            continue
        high = int(found.group(2))
        if low > high:
            return None
        out.append(f"#{low}" if low == high else f"#{low}-{high}")
    return out


def parse_contents(text: object) -> list[Entry]:
    """The entries a description or reprint note plainly lists, in order,
    each once; `[]` when it lists none or the wording is not clear. At most
    MAX_ENTRIES, series up to MAX_SERIES and issue text up to MAX_ISSUE_TEXT
    characters."""
    if not isinstance(text, str) or not text.strip():
        return []
    flat = text.translate(_DASHES)
    entries: list[Entry] = []
    for paragraph in re.split(r"[\r\n]+", flat):
        position = 0
        while True:
            trigger = _TRIGGER.search(paragraph, position)
            if trigger is None:
                break
            rest = paragraph[trigger.end() :]
            end = _SENTENCE_END.search(rest)
            clause = rest[: end.start() + 1] if end else rest
            position = trigger.end() + len(clause)
            read = _read_clause(clause)
            for entry in read or []:
                if len(entry.series_name) > MAX_SERIES or len(entry.issue_text) > (
                    MAX_ISSUE_TEXT
                ):
                    continue
                if entry not in entries:
                    entries.append(entry)
    return entries[:MAX_ENTRIES]


# --- The model fallback: the question and the checks on the answer ---------

CONTENTS_SCHEMA = {
    "type": "object",
    "properties": {
        "entries": {
            "type": "array",
            "maxItems": MAX_ENTRIES,
            "items": {
                "type": "object",
                "properties": {
                    "series_name": {"type": "string"},
                    "issue_text": {"type": "string"},
                },
                "required": ["series_name", "issue_text"],
            },
        }
    },
    "required": ["entries"],
}

INSTRUCTIONS = (
    "Below is a comic book's description, or the reprint note printed on it. "
    "If, and only if, the text says which issues this collected edition "
    "reprints, answer with one entry per series: series_name as the text "
    "writes it (empty when the text names no series) and issue_text, the "
    "issue numbers as the text writes them (for example '#1-6' or 'Annual "
    "#1'). Use only what the text says; never add a series or an issue from "
    "your own knowledge. If the text does not say, answer with no entries."
)


def model_prompt(text: str) -> str:
    """The one prompt the fallback sends: the question, then the text."""
    return f"{INSTRUCTIONS}\n\nText:\n{text.strip()[:MAX_SOURCE]}"


def validate_model(payload: object, source: str) -> list[Entry]:
    """A model answer as entries, or `[]`. Hard: one bad entry discards the
    whole answer. Every entry needs a number in its issue text, every number
    must stand in `source` as a whole number, the series name must be empty
    or appear in `source` (any case), and lengths and the count are capped."""
    if not isinstance(payload, dict):
        return []
    raw = payload.get("entries")
    if not isinstance(raw, list) or not raw or len(raw) > MAX_ENTRIES:
        return []
    haystack = source.lower()
    entries: list[Entry] = []
    for item in raw:
        if not isinstance(item, dict):
            return []
        series, issue = item.get("series_name"), item.get("issue_text")
        if not isinstance(series, str) or not isinstance(issue, str):
            return []
        series, issue = series.strip(), issue.strip()
        if len(series) > MAX_SERIES or not issue or len(issue) > MAX_ISSUE_TEXT:
            return []
        numbers = re.findall(r"\d+", issue)
        if not numbers:
            return []
        for number in numbers:
            if not re.search(rf"(?<!\d){re.escape(number)}(?!\d)", source):
                return []
        if series and series.lower() not in haystack:
            return []
        entry = Entry(series, issue)
        if entry not in entries:
            entries.append(entry)
    return entries
