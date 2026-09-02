"""The contract every metadata source implements.

Sources differ in wire format (JSON, XML), in authentication (bearer token,
query parameter, OAuth token exchange, none at all), and in how hard they
throttle. They do not differ in what the rest of the application wants from
them: find candidates for a title, then fetch the details of one. Everything
source-specific stays behind this interface, so the picker and the importer
never learn which source they are talking to.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from typing import Protocol

from models import ItemType


class SourceError(RuntimeError):
    """A metadata source failed.

    Carries the source name so a partially-failed import can report which one
    broke without the caller parsing it back out of the message.
    """

    def __init__(self, source: str, message: str) -> None:
        super().__init__(f"{source}: {message}")
        self.source = source


class SourceNotConfigured(SourceError):
    """The source has no credentials.

    Distinct from SourceError because it is not a failure. It means the feature
    was never enabled on this deploy, so the right response is to disable that
    media type -- not to retry, and not to alert.
    """


class SourceRateLimited(SourceError):
    """The source refused the call for rate reasons, after retries."""


@dataclass(frozen=True)
class SourceResult:
    """One candidate from a search: enough to render a picker row."""

    external_id: str
    title: str
    year: int | None = None
    thumbnail_url: str | None = None


@dataclass(frozen=True)
class SourceDetail:
    """The full record for one external id, mapped onto Item's columns."""

    external_id: str
    title: str
    year: int | None = None
    creator: str | None = None
    cover_url: str | None = None
    source_metadata: dict = field(default_factory=dict)


class SourceAdapter(Protocol):
    """What every source module provides."""

    source_name: str
    item_type: ItemType

    def configured(self) -> bool:
        """Whether this source has the credentials it needs.

        Checked lazily rather than at boot: a missing ComicVine key should make
        comic lookups unavailable, not stop the service starting.
        """
        ...

    async def search(
        self,
        query: str,
        year: int | None = None,
        platform: str | None = None,
    ) -> list[SourceResult]:
        """Candidates for `query`.

        `platform` is free text read off a game case ("Nintendo Switch 2").
        Only IGDB can use it -- two releases of a game can share a title
        exactly, and then the platform is the only thing separating them --
        but it is on the shared signature so the importer does not have to
        know which source it is talking to. Sources that cannot use it ignore
        it.
        """
        ...

    async def fetch(self, external_id: str) -> SourceDetail: ...


class Throttle:
    """Spaces calls to one source by at least `min_interval` seconds.

    Per-source rather than global. A single limiter set to BGG's pace would
    make a shelf of films resolve at board-game speed; a mixed batch should be
    only as slow as its slowest rows, and only those rows.

    The lock is held across the sleep so that concurrent callers queue instead
    of all waking together and bursting -- bursting is the behaviour BGG's
    velocity detection actually penalises.
    """

    def __init__(self, min_interval: float) -> None:
        self._min_interval = min_interval
        self._lock = asyncio.Lock()
        self._next_allowed = 0.0

    async def wait(self) -> None:
        """Blocks until this source may be called again."""
        async with self._lock:
            loop = asyncio.get_running_loop()
            delay = self._next_allowed - loop.time()
            if delay > 0:
                await asyncio.sleep(delay)
            self._next_allowed = loop.time() + self._min_interval


def year_from_date(value: str | int | None) -> int | None:
    """The year in a source's date field, or None if there isn't one.

    Sources return `1999-03-31`, a bare `1999`, an empty string, and
    occasionally something unparseable. A malformed value is missing data, not
    an error: raising here would let one bad row fail a 200-item import.
    """
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    try:
        return int(text[:4])
    except ValueError:
        return None
