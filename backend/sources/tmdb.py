"""TMDB -- films.

Authentication is the v4 Bearer token. TMDB documents the v3 api_key parameter
and the v4 token as granting identical access; the token wins here only because
it is one credential across both API versions.

Covers are hotlinked, which is TMDB's documented intent. Nothing is cached
locally: Render's free tier has an ephemeral disk, so a cache would be lost on
every restart while still being a data-retention surface.

TMDB requires attribution wherever this data is shown -- see the collection
page footer.
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

API_ROOT = "https://api.themoviedb.org/3"
IMAGE_ROOT = "https://image.tmdb.org/t/p"
POSTER_SIZE = "w342"
THUMBNAIL_SIZE = "w185"
SEARCH_LIMIT = 10
TIMEOUT = 10.0


class TmdbSource:
    """Film metadata from TMDB."""

    source_name = "tmdb"
    item_type = ItemType.MOVIE

    def __init__(self, config: Config) -> None:
        self._token = config.tmdb_api_token
        # TMDB's own documentation puts the ceiling "somewhere in the 40
        # requests per second range" and says it could change at any time.
        # 20/s leaves headroom without making the picker feel slow.
        self._throttle = Throttle(min_interval=0.05)

    def configured(self) -> bool:
        return bool(self._token)

    def _require_token(self) -> str:
        if not self._token:
            raise SourceNotConfigured(self.source_name, "TMDB_API_TOKEN is not set")
        return self._token

    async def _get(self, path: str, params: dict) -> dict:
        token = self._require_token()
        await self._throttle.wait()
        headers = {"Authorization": f"Bearer {token}", "accept": "application/json"}
        try:
            async with httpx2.AsyncClient(timeout=TIMEOUT) as client:
                response = await client.get(
                    f"{API_ROOT}{path}", params=params, headers=headers
                )
        except httpx2.HTTPError as error:
            raise SourceError(self.source_name, f"request failed: {error}") from error

        logger.info("tmdb GET %s -> %s", path, response.status_code)

        if response.status_code == 429:
            raise SourceRateLimited(self.source_name, "rate limited by TMDB")
        if response.status_code >= 400:
            raise SourceError(
                self.source_name, f"HTTP {response.status_code} from TMDB"
            )
        return response.json()

    def _image_url(self, poster_path: str | None, size: str) -> str | None:
        return f"{IMAGE_ROOT}/{size}{poster_path}" if poster_path else None

    def _parse_search(self, payload: dict) -> list[SourceResult]:
        """Maps a /search/movie body onto picker rows.

        Split out from search() so the mapping is tested against a recorded
        response rather than a mocked HTTP client.
        """
        return [
            SourceResult(
                external_id=str(row["id"]),
                title=row.get("title") or row.get("original_title") or "",
                year=year_from_date(row.get("release_date")),
                thumbnail_url=self._image_url(row.get("poster_path"), THUMBNAIL_SIZE),
            )
            for row in payload.get("results", [])[:SEARCH_LIMIT]
        ]

    def _parse_detail(self, payload: dict) -> SourceDetail:
        """Maps a /movie/{id} body onto Item's columns plus the snapshot."""
        crew = (payload.get("credits") or {}).get("crew") or []
        directors = [
            member.get("name")
            for member in crew
            if member.get("job") == "Director" and member.get("name")
        ]
        return SourceDetail(
            external_id=str(payload["id"]),
            title=payload.get("title") or payload.get("original_title") or "",
            year=year_from_date(payload.get("release_date")),
            creator=", ".join(directors) or None,
            cover_url=self._image_url(payload.get("poster_path"), POSTER_SIZE),
            source_metadata={
                "genres": [g["name"] for g in payload.get("genres") or []],
                "description": payload.get("overview") or None,
                "community_score": payload.get("vote_average"),
                "community_votes": payload.get("vote_count"),
                "runtime_minutes": payload.get("runtime"),
                "original_language": payload.get("original_language"),
            },
        )

    async def search(self, query: str, year: int | None = None) -> list[SourceResult]:
        """Candidate films for `query`, most relevant first."""
        params = {"query": query, "include_adult": "false"}
        if year is not None:
            params["year"] = str(year)
        return self._parse_search(await self._get("/search/movie", params))

    async def fetch(self, external_id: str) -> SourceDetail:
        """Full detail for one TMDB film id, including the directing credit."""
        payload = await self._get(
            f"/movie/{external_id}", {"append_to_response": "credits"}
        )
        return self._parse_detail(payload)
