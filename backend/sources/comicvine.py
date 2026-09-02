"""ComicVine -- comics, tracked at the volume level.

A volume is a series, which is the level a physical shelf is organised at: the
row is "Saga", not "Saga #17". Issue-level tracking is deliberately out of
scope.

Two things confirmed against the live API rather than the documentation:

ComicVine blocks default HTTP client user agents outright, answering 403 with
"Anonymous Bot or Scraper Blocked". A custom User-Agent is required, not
courteous.

Their documentation states no rate limits at all -- the 200-per-hour figure
repeated elsewhere is community lore, not theirs -- so this throttles at about
one request per second and never fans out.

Strictly non-commercial use; a personal portfolio qualifies. A link back to
Comic Vine is required wherever this data is shown.
"""

from __future__ import annotations

import logging

import httpx2

from config import Config
from models import ItemType
from sources.base import (
    SourceDetail,
    SourceError,
    SourceNotConfigured,
    SourceRateLimited,
    SourceResult,
    Throttle,
    year_from_date,
)

logger = logging.getLogger(__name__)

API_ROOT = "https://comicvine.gamespot.com/api"
USER_AGENT = "joey-haas.dev-tracker/1.0 (personal portfolio project)"

# ComicVine's own documentation caps /search at 10 and will not return more.
SEARCH_LIMIT = 10

# Volumes are prefixed 4050- in ComicVine's own id scheme.
VOLUME_PREFIX = "4050"

FIELD_LIST = (
    "id,name,start_year,publisher,count_of_issues,image,description,site_detail_url"
)
TIMEOUT = 15.0


class ComicVineSource:
    """Comic series metadata from ComicVine."""

    source_name = "comicvine"
    item_type = ItemType.COMIC

    def __init__(self, config: Config) -> None:
        self._api_key = config.comicvine_api_key
        # No documented limit to design against, and burst detection is
        # reported anecdotally, so this stays slow and never fans out.
        self._throttle = Throttle(min_interval=1.0)

    def configured(self) -> bool:
        return bool(self._api_key)

    def _require_key(self) -> str:
        if not self._api_key:
            raise SourceNotConfigured(self.source_name, "COMICVINE_API_KEY is not set")
        return self._api_key

    async def _get(self, path: str, params: dict) -> dict:
        key = self._require_key()
        await self._throttle.wait()
        query = {"api_key": key, "format": "json", "field_list": FIELD_LIST, **params}
        try:
            async with httpx2.AsyncClient(timeout=TIMEOUT) as client:
                response = await client.get(
                    f"{API_ROOT}{path}",
                    params=query,
                    # Required, not courteous: without it ComicVine answers
                    # 403 "Anonymous Bot or Scraper Blocked".
                    headers={"User-Agent": USER_AGENT},
                )
        except httpx2.HTTPError as error:
            raise SourceError(self.source_name, f"request failed: {error}") from error

        logger.info("comicvine GET %s -> %s", path, response.status_code)

        if response.status_code == 420:
            # ComicVine's own throttle response.
            raise SourceRateLimited(self.source_name, "throttled by ComicVine")
        if response.status_code == 403:
            raise SourceError(
                self.source_name,
                "403 from ComicVine — the API key or the User-Agent was rejected",
            )
        if response.status_code >= 400:
            raise SourceError(
                self.source_name, f"HTTP {response.status_code} from ComicVine"
            )

        payload = response.json()
        # ComicVine reports its own errors inside a 200 body.
        if payload.get("error") not in (None, "OK"):
            raise SourceError(self.source_name, str(payload["error"]))
        return payload

    def _image_url(self, row: dict, key: str) -> str | None:
        return (row.get("image") or {}).get(key) or None

    def _parse_search(self, payload: dict) -> list[SourceResult]:
        """Maps a /search body onto picker rows."""
        return [
            SourceResult(
                external_id=str(row["id"]),
                title=row.get("name") or "",
                year=year_from_date(row.get("start_year")),
                thumbnail_url=self._image_url(row, "icon_url"),
            )
            for row in payload.get("results") or []
        ][:SEARCH_LIMIT]

    def _parse_detail(self, payload: dict) -> SourceDetail:
        """Maps a /volume body onto Item's columns plus the snapshot."""
        row = payload.get("results") or {}
        publisher = (row.get("publisher") or {}).get("name")
        return SourceDetail(
            external_id=str(row["id"]),
            title=row.get("name") or "",
            year=year_from_date(row.get("start_year")),
            # The publisher is the closest thing to a creator at volume level:
            # writers and artists belong to issues, which are out of scope.
            creator=publisher,
            cover_url=self._image_url(row, "medium_url"),
            source_metadata={
                # ComicVine exposes no community rating at all, so there is
                # deliberately no community_score key here rather than a null
                # one pretending the field exists.
                "genres": [],
                "description": row.get("description") or None,
                "publisher": publisher,
                "issue_count": row.get("count_of_issues"),
                "start_year": row.get("start_year"),
                "source_url": row.get("site_detail_url"),
            },
        )

    async def search(self, query: str, year: int | None = None) -> list[SourceResult]:
        """Candidate comic volumes for `query`.

        ComicVine's search takes no year filter, so `year` is accepted for
        interface compatibility and applied by the matching layer.
        """
        payload = await self._get(
            "/search/",
            {"query": query, "resources": "volume", "limit": SEARCH_LIMIT},
        )
        return self._parse_search(payload)

    async def fetch(self, external_id: str) -> SourceDetail:
        """Full detail for one ComicVine volume id."""
        if not external_id.isdigit():
            raise SourceError(self.source_name, f"invalid volume id {external_id!r}")
        payload = await self._get(f"/volume/{VOLUME_PREFIX}-{external_id}/", {})
        if not payload.get("results"):
            raise SourceError(self.source_name, f"no volume with id {external_id}")
        return self._parse_detail(payload)
