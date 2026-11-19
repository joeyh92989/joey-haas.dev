"""Find a book's contents on Metron: a PROPOSAL, never a write.

`find_contents` searches Metron for the volume's title and line number, keeps
the rows whose series name equals the title (Metron matches by substring, so
"Saga" also returns "Clone Saga"), fetches at most `MAX_CANDIDATES` records and
keeps those that are a collected series type with a reprint list. A candidate
whose ISBN equals the volume's is `strong`; otherwise they are `possible` and
show their ISBN. Every failure is a status and a sentence, never an exception.
The route (`comics_routes.py`) adds the reconcile rule and the owner Accepts
through the ordinary volume save. Design:
`docs/planning/2026-11-18-metron-contents-design.md`.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field

from comic_contents import Entry, normalize_name
from sources.base import (
    SourceError,
    SourceNotConfigured,
    SourceRateLimited,
    SourceUnavailable,
)
from sources.metron import (
    IssueRow,
    MetronClient,
    MetronUnauthorized,
    entries_from_reprints,
    is_collected_type,
    isbn_matches,
)

logger = logging.getLogger(__name__)

MAX_CANDIDATES = 5


@dataclass(frozen=True)
class Candidate:
    metron_id: int
    title: str | None
    series_name: str
    series_type: str
    isbn: str | None
    pages: int | None
    resource_url: str | None
    strong: bool
    entries: list[Entry] = field(default_factory=list)


@dataclass(frozen=True)
class Found:
    """`status`: strong, possible, not_found, not_configured, unauthorized,
    rate_limited or unavailable."""

    status: str
    message: str | None = None
    candidates: list[Candidate] = field(default_factory=list)


MESSAGES = {
    "not_configured": "Metron is not set up on this server (METRON_TOKEN is missing).",
    "unauthorized": "Metron refused the token. Check METRON_TOKEN.",
    "rate_limited": "Metron is rate limiting this server. Try again in a minute.",
    "unavailable": "Metron could not be reached just now. Try again later.",
    "error": "Metron answered something unreadable.",
    "not_found": "Metron has no matching book for this title and number.",
}


def pick_rows(rows: list[IssueRow], title: str) -> list[IssueRow]:
    """The search rows of a series named exactly `title` (case, `&`, a bracketed
    year and a leading "the" aside), those whose label carries a format suffix
    ("Saga TPB (2012) #1") first, at most MAX_CANDIDATES. Pure."""
    wanted = normalize_name(title)
    own = [r for r in rows if normalize_name(r.series_name) == wanted]

    def suffixed(row: IssueRow) -> bool:
        return not row.issue.startswith(f"{row.series_name} (")

    return sorted(own, key=lambda r: (not suffixed(r), r.id))[:MAX_CANDIDATES]


async def find_contents(
    client: MetronClient, *, title: str, line_number: int | None, isbn: str | None
) -> Found:
    if not client.configured():
        return Found("not_configured", MESSAGES["not_configured"])
    try:
        rows = pick_rows(await client.search_issues(title, line_number), title)
        found: list[Candidate] = []
        for row in rows:
            issue = await client.fetch_issue(row.id)
            if issue is None or not is_collected_type(issue.series_type):
                continue
            entries = entries_from_reprints(issue.reprints)
            if not entries:
                continue
            found.append(
                Candidate(
                    metron_id=issue.id,
                    title=issue.title,
                    series_name=issue.series_name,
                    series_type=issue.series_type,
                    isbn=issue.isbn,
                    pages=issue.pages,
                    resource_url=issue.resource_url,
                    strong=isbn_matches(isbn, issue.isbn),
                    entries=entries,
                )
            )
    except SourceNotConfigured:
        return Found("not_configured", MESSAGES["not_configured"])
    except MetronUnauthorized:
        return Found("unauthorized", MESSAGES["unauthorized"])
    except SourceRateLimited:
        return Found("rate_limited", MESSAGES["rate_limited"])
    except SourceUnavailable:
        return Found("unavailable", MESSAGES["unavailable"])
    except SourceError as error:
        logger.warning("metron: %s", error)
        return Found("unavailable", MESSAGES["error"])
    if not found:
        return Found("not_found", MESSAGES["not_found"])
    found.sort(key=lambda c: not c.strong)  # stable: strong first
    return Found("strong" if found[0].strong else "possible", None, found)
