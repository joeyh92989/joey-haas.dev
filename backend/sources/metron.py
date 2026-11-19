"""Metron -- what a collected book contains, as data.

Not a `SourceAdapter`: it is not asked to find a title for the picker. It answers
one question, "which issues does this trade collect", for the volume page's
"Find contents" button (`comic_metron.py`, `comics_routes.py`). Design:
`docs/planning/2026-11-18-metron-contents-design.md`.

`https://metron.cloud/api/` is a community comics database. Auth is a Bearer
token (`METRON_TOKEN`, an account's API Tokens page). Confirmed against the live
API (fixtures recorded 2026-11-18, `tests/fixtures/metron_*.json`):

- `GET /api/issue/?series_name=Saga&number=1` matches the name as a SUBSTRING
  (34 hits, alphabetical, "Clone Saga" before "Saga"), so the list is filtered
  to the exact series name here before any detail call is spent. A row holds
  `id`, `series{name,year_began}`, `number`, `issue` ("Saga TPB (2012) #1").
  There is no ISBN filter.
- `GET /api/issue/{id}/` has `isbn`, `title`, `page`, `resource_url`,
  `series.series_type.name` and `reprints: [{id, issue: "Saga (2012) #1"}]`. On
  a trade `reprints` is its contents; on a single issue it is the trades that
  reprint it, which is why only a collected series type is ever proposed.
- Limits arrive as `X-RateLimit-Burst-*` and `X-RateLimit-Sustained-*` headers
  (seen: burst 20, sustained 5000; not hard-coded here) and a 429. The client
  reads `Burst-Remaining` / `Burst-Reset` (epoch seconds) and waits for the
  reset when a burst is nearly spent; a 429 is a `MetronRateLimited`.
- Metron asks for a User-Agent. Content is CC BY-SA 4.0: the public volume page
  credits it wherever a `metron` contents row shows.

The token is read from config only, sent in one header, and never logged: the
log lines name the path, not the query or the headers.
"""

from __future__ import annotations

import asyncio
import logging
import re
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field

import httpx2

from comic_contents import MAX_ISSUE_TEXT, MAX_SERIES, Entry
from sources.base import (
    SourceError,
    SourceNotConfigured,
    SourceRateLimited,
    SourceUnavailable,
    Throttle,
    read_json,
)
from sources.openlibrary import InvalidIsbn, normalize_isbn

logger = logging.getLogger(__name__)

SOURCE_NAME = "metron"
API_ROOT = "https://metron.cloud/api"
USER_AGENT = (
    "joey-haas.dev-tracker/1.0 (personal portfolio project; https://joey-haas.dev)"
)
TIMEOUT = 15.0
# Never sleep longer than this for a burst window to reopen; past it the call
# fails as rate limited and the owner clicks again.
MAX_BACKOFF_SECONDS = 10.0

CREDIT_LICENCE_URL = "https://creativecommons.org/licenses/by-sa/4.0/"

# Series types whose issues collect other issues. Matched as words in the type's
# name, so "Trade Paperback", "Hardcover" and "Omnibus" count and "Single
# Issue", "Annual" and "One-Shot" do not.
_COLLECTED_TYPES = (
    "trade paperback",
    "hardcover",
    "omnibus",
    "graphic novel",
    "compendium",
    "softcover",
    "library edition",
    "deluxe",
)


class MetronUnauthorized(SourceError):
    """Metron refused the token (401 or 403)."""


class MetronRateLimited(SourceRateLimited):
    """Metron answered 429. `retry_after` is seconds, when the headers said."""

    def __init__(self, message: str, retry_after: float | None = None) -> None:
        super().__init__(SOURCE_NAME, message)
        self.retry_after = retry_after


@dataclass(frozen=True)
class IssueRow:
    """One row of an issue search."""

    id: int
    series_name: str
    year: int | None
    number: str
    issue: str


@dataclass(frozen=True)
class MetronIssue:
    """The parts of an issue record the proposal uses."""

    id: int
    series_name: str
    series_type: str
    title: str | None
    isbn: str | None
    pages: int | None
    resource_url: str | None
    reprints: list[dict] = field(default_factory=list)


def is_collected_type(series_type: str | None) -> bool:
    name = (series_type or "").lower()
    return any(word in name for word in _COLLECTED_TYPES)


def isbn_matches(ours: str | None, theirs: str | None) -> bool:
    """Whether two ISBNs (any form, ISBN-10 or -13) name the same book. A
    missing or invalid one never matches."""
    try:
        return bool(ours and theirs) and normalize_isbn(ours) == normalize_isbn(theirs)
    except InvalidIsbn:
        return False


# --- Reprints: "Saga (2012) #1" -> entries ------------------------------------

_REPRINT = re.compile(
    r"^(?P<name>.+?)\s*\((?P<year>\d{4})\)\s*#(?P<number>\S+)$",
)


@dataclass(frozen=True)
class Reprint:
    """A parsed reprint line. `number` is a whole number, or None when the
    issue number is not one (`1AU`, `½`): then `raw_number` carries it."""

    series_name: str
    year: int
    number: int | None
    raw_number: str


def parse_reprint(text: object) -> Reprint | None:
    """`"Saga (2012) #1"` as a Reprint, or None when it does not have that
    shape. Pure; the caller keeps what it cannot read."""
    if not isinstance(text, str):
        return None
    found = _REPRINT.match(text.strip())
    if found is None:
        return None
    raw = found.group("number")
    return Reprint(
        series_name=found.group("name").strip(),
        year=int(found.group("year")),
        number=int(raw) if re.fullmatch(r"\d{1,4}", raw) else None,
        raw_number=raw,
    )


def _ranges(numbers: list[int]) -> list[str]:
    """Sorted unique numbers as `#1-6` / `#7` pieces, consecutive ones merged."""
    pieces: list[str] = []
    start = prev = None
    for number in sorted(set(numbers)):
        if start is None:
            start = prev = number
        elif number == prev + 1:
            prev = number
        else:
            pieces.append(_piece(start, prev))
            start = prev = number
    if start is not None:
        pieces.append(_piece(start, prev))
    return pieces


def _piece(low: int, high: int) -> str:
    return f"#{low}" if low == high else f"#{low}-{high}"


def _chunks(pieces: list[str]) -> list[str]:
    """Pieces joined with ", " into texts of at most MAX_ISSUE_TEXT."""
    texts: list[str] = []
    current = ""
    for piece in pieces:
        joined = f"{current}, {piece}" if current else piece
        if current and len(joined) > MAX_ISSUE_TEXT:
            texts.append(current)
            current = piece
        else:
            current = joined
    if current:
        texts.append(current)
    return texts


def entries_from_reprints(reprints: object) -> list[Entry]:
    """Contents entries for a `reprints` list: one per series (and year), in the
    order each first appears, its numbers merged into ranges (`#1-6`, gaps as
    `#1-2, #4`). A number that is not whole (`#1AU`) stays in the text as it
    is. A line that cannot be parsed is kept whole as the series name with no
    issues, never dropped. Pure."""
    if not isinstance(reprints, list):
        return []
    order: list[tuple[str, int] | str] = []
    numbers: dict[tuple[str, int], list[int]] = {}
    extras: dict[tuple[str, int], list[str]] = {}
    for row in reprints:
        line = row.get("issue") if isinstance(row, dict) else None
        if not isinstance(line, str) or not line.strip():
            continue
        parsed = parse_reprint(line)
        if parsed is None:
            order.append(" ".join(line.split()))
            continue
        key = (parsed.series_name, parsed.year)
        if key not in numbers:
            order.append(key)
            numbers[key] = []
            extras[key] = []
        if parsed.number is None:
            extras[key].append(f"#{parsed.raw_number}")
        else:
            numbers[key].append(parsed.number)
    entries: list[Entry] = []
    seen: set = set()
    for item in order:
        if isinstance(item, str):
            entries.append(Entry(series_name=item[:MAX_SERIES], issue_text=""))
            continue
        if item in seen:
            continue
        seen.add(item)
        pieces = _ranges(numbers[item]) + list(dict.fromkeys(extras[item]))
        for text in _chunks(pieces) or [""]:
            entries.append(
                Entry(series_name=item[0][:MAX_SERIES], issue_text=text, year=item[1])
            )
    return entries


# --- The client ----------------------------------------------------------------


def _number_header(headers, name: str) -> float | None:
    try:
        return float(headers.get(name))
    except (TypeError, ValueError):
        return None


class MetronClient:
    """Reads Metron with one token. Built once from config; `configured()` is
    False without a token and every call then raises SourceNotConfigured."""

    def __init__(
        self,
        token: str | None,
        *,
        clock: Callable[[], float] = time.time,
        sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
    ) -> None:
        self._token = (token or "").strip() or None
        self._throttle = Throttle(min_interval=1.0)
        self._clock = clock
        self._sleep = sleep
        # Epoch second the burst window reopens when it is spent, else None.
        self._burst_closed_until: float | None = None

    def configured(self) -> bool:
        return self._token is not None

    async def _pace(self) -> None:
        await self._throttle.wait()
        until = self._burst_closed_until
        if until is None:
            return
        wait = until - self._clock()
        self._burst_closed_until = None
        if wait > MAX_BACKOFF_SECONDS:
            raise MetronRateLimited(
                "Metron's burst limit is spent; try again shortly", retry_after=wait
            )
        if wait > 0:
            await self._sleep(wait)

    def _note_limits(self, headers) -> None:
        remaining = _number_header(headers, "X-RateLimit-Burst-Remaining")
        reset = _number_header(headers, "X-RateLimit-Burst-Reset")
        if remaining is not None and reset is not None and remaining <= 1:
            self._burst_closed_until = reset

    async def _get(self, path: str, params: dict | None = None):
        if self._token is None:
            raise SourceNotConfigured(SOURCE_NAME, "METRON_TOKEN is not set")
        await self._pace()
        try:
            async with httpx2.AsyncClient(timeout=TIMEOUT) as client:
                response = await client.get(
                    f"{API_ROOT}{path}",
                    params=params,
                    headers={
                        "Authorization": f"Bearer {self._token}",
                        "User-Agent": USER_AGENT,
                        "Accept": "application/json",
                    },
                )
        except httpx2.HTTPError as error:
            # The message is the client's, which names the URL, never the header.
            raise SourceUnavailable(
                SOURCE_NAME, f"request failed: {type(error).__name__}"
            ) from error
        logger.info("metron GET %s -> %s", path, response.status_code)
        headers = getattr(response, "headers", None) or {}
        self._note_limits(headers)
        status = response.status_code
        if status == 429:
            retry = _number_header(headers, "Retry-After")
            if retry is None:
                reset = _number_header(headers, "X-RateLimit-Burst-Reset")
                retry = max(reset - self._clock(), 0.0) if reset else None
            raise MetronRateLimited("throttled by Metron", retry_after=retry)
        if status in (401, 403):
            raise MetronUnauthorized(SOURCE_NAME, f"HTTP {status}: token refused")
        if status == 404:
            return None
        if status >= 500:
            raise SourceUnavailable(SOURCE_NAME, f"HTTP {status} from Metron")
        if status >= 400:
            raise SourceError(SOURCE_NAME, f"HTTP {status} from Metron")
        return read_json(response, SOURCE_NAME, dict)

    async def search_issues(
        self, series_name: str, number: int | None = None
    ) -> list[IssueRow]:
        """First page of issues whose series name contains `series_name` (and
        whose number is `number`). Metron matches by substring; the caller
        narrows it (`exact_series`)."""
        params: dict = {"series_name": series_name}
        if number is not None:
            params["number"] = str(number)
        payload = await self._get("/issue/", params) or {}
        rows: list[IssueRow] = []
        for row in payload.get("results") or []:
            if not isinstance(row, dict) or not isinstance(row.get("id"), int):
                continue
            series = row.get("series") if isinstance(row.get("series"), dict) else {}
            year = series.get("year_began")
            rows.append(
                IssueRow(
                    id=row["id"],
                    series_name=str(series.get("name") or ""),
                    year=year if isinstance(year, int) else None,
                    number=str(row.get("number") or ""),
                    issue=str(row.get("issue") or ""),
                )
            )
        return rows

    async def fetch_issue(self, issue_id: int) -> MetronIssue | None:
        """One issue record, or None when Metron has none."""
        payload = await self._get(f"/issue/{int(issue_id)}/")
        if payload is None or not isinstance(payload.get("id"), int):
            return None
        series = (
            payload.get("series") if isinstance(payload.get("series"), dict) else {}
        )
        kind = series.get("series_type")
        pages = payload.get("page")
        reprints = payload.get("reprints")
        return MetronIssue(
            id=payload["id"],
            series_name=str(series.get("name") or ""),
            series_type=str(kind.get("name") or "") if isinstance(kind, dict) else "",
            title=payload.get("title") or None,
            isbn=payload.get("isbn") or None,
            pages=pages
            if isinstance(pages, int) and not isinstance(pages, bool)
            else None,
            resource_url=payload.get("resource_url") or None,
            reprints=[r for r in reprints if isinstance(r, dict)]
            if isinstance(reprints, list)
            else [],
        )
