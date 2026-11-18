"""Open Library -- a book's facts from its ISBN.

Not a `SourceAdapter`: it answers "what is this ISBN", not "find a title", so it
has no item type and is not in the registry. The intake's ISBN route calls
`lookup` directly (`intake/isbn_route.py`).

`GET https://openlibrary.org/api/books?bibkeys=ISBN:<isbn13>&jscmd=data&format=json`
is keyless. Its answer is an object keyed by `ISBN:<isbn13>`, and `{}` when
Open Library has no such book (never a 404). Recorded fixtures:
`tests/fixtures/openlibrary_saga.json` and `openlibrary_miss.json`.

The response has no series, so the volume number is read from the subtitle
("Volume One") by `parse_volume_number`; when it cannot be read it stays
`None`. Only bibliographic facts are kept, and the cover is linked, never
copied (https://openlibrary.org/developers/licensing).

Open Library asks for 1 request a second, or 3 with an identifying
User-Agent (https://openlibrary.org/developers/api): this sends one and
throttles at 1 a second.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass

import httpx2

from sources.base import (
    SourceError,
    SourceRateLimited,
    SourceUnavailable,
    Throttle,
    read_json,
    year_from_date,
)

logger = logging.getLogger(__name__)

SOURCE_NAME = "openlibrary"
API_URL = "https://openlibrary.org/api/books"
USER_AGENT = (
    "joey-haas.dev-tracker/1.0 (personal portfolio project; https://joey-haas.dev)"
)
TIMEOUT = 10.0

_THROTTLE = Throttle(min_interval=1.0)


class InvalidIsbn(ValueError):
    """The text is not an ISBN: wrong length, a stray character or a bad check
    digit. Raised before any request, so a typo never leaves the server."""


@dataclass(frozen=True)
class IsbnBook:
    """What Open Library knows of one ISBN. `volume_number` is read from the
    subtitle and is `None` unless the subtitle says it."""

    isbn: str
    title: str
    subtitle: str | None
    volume_number: int | None
    publisher: str | None
    year: int | None
    pages: int | None
    cover_url: str | None


def _isbn13_check(first12: str) -> str:
    total = sum(int(d) * (3 if i % 2 else 1) for i, d in enumerate(first12))
    return str((10 - total % 10) % 10)


def normalize_isbn(raw: str) -> str:
    """The ISBN-13 for `raw`, or InvalidIsbn.

    Hyphens and spaces are dropped. An ISBN-10 (its last character may be
    `X`) is checked and converted to 13; an ISBN-13 must start 978 or 979. The
    check digit is verified either way."""
    text = re.sub(r"[\s-]", "", raw or "").upper()
    if re.fullmatch(r"\d{9}[\dX]", text):
        total = sum((10 if c == "X" else int(c)) * (10 - i) for i, c in enumerate(text))
        if total % 11 != 0:
            raise InvalidIsbn("That ISBN-10's check digit is wrong.")
        body = "978" + text[:9]
        return body + _isbn13_check(body)
    if re.fullmatch(r"\d{13}", text):
        if not text.startswith(("978", "979")):
            raise InvalidIsbn("An ISBN-13 starts 978 or 979.")
        if _isbn13_check(text[:12]) != text[12]:
            raise InvalidIsbn("That ISBN-13's check digit is wrong.")
        return text
    raise InvalidIsbn("An ISBN is 10 or 13 digits.")


def isbn10_of(isbn13: str) -> str | None:
    """The ISBN-10 form of a 978 ISBN-13 (None for 979), so a volume stored
    under either form is found."""
    if not isbn13.startswith("978"):
        return None
    body = isbn13[3:12]
    total = sum(int(c) * (10 - i) for i, c in enumerate(body))
    check = (11 - total % 11) % 11
    return body + ("X" if check == 10 else str(check))


_NUMBER_WORDS = {
    word: n
    for n, word in enumerate(
        (
            "one two three four five six seven eight nine ten eleven twelve "
            "thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty"
        ).split(),
        start=1,
    )
}
# The keyword must open the subtitle or follow a separator, and the number
# must close it ("Volume One", "Saga: Book Three"), so "Book Nine Lives" and
# "A Book One Hundred Years Hence" read as nothing.
_VOLUME = re.compile(
    r"(?:^|[:,(\-\u2013\u2014]\s*)(?:volume|vol|book|tome)\b\.?\s*(\d{1,3}|"
    + "|".join(sorted(_NUMBER_WORDS, key=len, reverse=True))
    + r")\s*(?:$|[:,;.)\-\u2013\u2014])",
    re.IGNORECASE,
)


def parse_volume_number(subtitle: str | None) -> int | None:
    """The volume number a subtitle states: "Volume One", "Vol. 2" and
    "Book Three" read as 1, 2 and 3. Anything else, or a number past 999, is
    `None`; nothing is guessed."""
    found = _VOLUME.search(subtitle or "")
    if found is None:
        return None
    token = found.group(1).lower()
    number = int(token) if token.isdigit() else _NUMBER_WORDS[token]
    return number if 1 <= number <= 999 else None


def _text(value: object) -> str | None:
    return value.strip() or None if isinstance(value, str) else None


def _parse_book(isbn: str, payload: dict) -> IsbnBook | None:
    """The `ISBN:<isbn>` entry of an answer as an IsbnBook, or `None` when the
    answer has no such entry (Open Library answers `{}`). Pure."""
    entry = payload.get(f"ISBN:{isbn}")
    if not isinstance(entry, dict):
        return None
    title = _text(entry.get("title"))
    if title is None:
        return None
    subtitle = _text(entry.get("subtitle"))
    publishers = entry.get("publishers")
    publisher = (
        _text(publishers[0].get("name"))
        if isinstance(publishers, list)
        and publishers
        and isinstance(publishers[0], dict)
        else None
    )
    pages = entry.get("number_of_pages")
    cover = entry.get("cover")
    return IsbnBook(
        isbn=isbn,
        title=title,
        subtitle=subtitle,
        volume_number=parse_volume_number(subtitle),
        publisher=publisher,
        year=year_from_date(_year_text(entry.get("publish_date"))),
        pages=pages if isinstance(pages, int) and not isinstance(pages, bool) else None,
        cover_url=_text(cover.get("medium")) if isinstance(cover, dict) else None,
    )


def _year_text(value: object) -> str | None:
    """The four-digit year in a free-text date ("2012", "Nov 6, 2012")."""
    found = re.search(r"\b(\d{4})\b", value) if isinstance(value, str) else None
    return found.group(1) if found else None


async def lookup(isbn: str) -> IsbnBook | None:
    """The book for `isbn` (any form `normalize_isbn` accepts), `None` when
    Open Library has none. Raises InvalidIsbn before any request, then
    SourceRateLimited (429), SourceUnavailable (timeout, dropped connection,
    5xx) or SourceError (anything else)."""
    isbn13 = normalize_isbn(isbn)
    await _THROTTLE.wait()
    try:
        async with httpx2.AsyncClient(timeout=TIMEOUT) as client:
            response = await client.get(
                API_URL,
                params={
                    "bibkeys": f"ISBN:{isbn13}",
                    "jscmd": "data",
                    "format": "json",
                },
                headers={"User-Agent": USER_AGENT},
            )
    except httpx2.HTTPError as error:
        raise SourceUnavailable(SOURCE_NAME, f"request failed: {error}") from error

    logger.info("openlibrary GET books -> %s", response.status_code)
    if response.status_code == 429:
        raise SourceRateLimited(SOURCE_NAME, "throttled by Open Library")
    if response.status_code >= 500:
        raise SourceUnavailable(
            SOURCE_NAME, f"HTTP {response.status_code} from Open Library"
        )
    if response.status_code >= 400:
        raise SourceError(SOURCE_NAME, f"HTTP {response.status_code} from Open Library")
    return _parse_book(isbn13, read_json(response, SOURCE_NAME, dict))
