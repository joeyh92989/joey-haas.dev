"""IGDB -- video games.

Authentication is a Twitch client-credentials token. Confirmed against the live
API on 2026-09-01, because api-docs.igdb.com was unreachable during research:
the token comes back as `bearer` with expires_in of about 65 days, and queries
are Apicalypse bodies POSTed to /v4/games with Client-ID and Authorization
headers.

The token is cached on the instance and refreshed on 401. Fetching one per
request would spend a round trip on every lookup for a credential that lasts two
months.

`first_release_date` is a Unix timestamp, not a date string -- the shared
year_from_date helper would read 1559001600 as the year 1559. That is the one
place this source genuinely differs from the others.

Covers are hotlinked, which is the documented pattern. IGDB requires no
attribution; the collection page credits it anyway.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime

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
)

logger = logging.getLogger(__name__)

TOKEN_URL = "https://id.twitch.tv/oauth2/token"
API_URL = "https://api.igdb.com/v4/games"
IMAGE_ROOT = "https://images.igdb.com/igdb/image/upload"
COVER_SIZE = "t_cover_big"
THUMBNAIL_SIZE = "t_cover_small"
SEARCH_LIMIT = 10
TIMEOUT = 15.0

FIELDS = (
    "fields name,first_release_date,cover.image_id,genres.name,summary,rating,"
    "aggregated_rating,total_rating,total_rating_count,platforms.name,"
    "involved_companies.company.name,involved_companies.developer,similar_games;"
)


def year_from_unix(value: int | None) -> int | None:
    """The year of a Unix timestamp, or None.

    IGDB alone returns release dates as epoch seconds. Passing one to
    year_from_date would silently yield 1559 from 1559001600 -- a plausible
    -looking year that would then filter the candidate list in matching.py and
    hide the right answer.
    """
    if not isinstance(value, int):
        return None
    try:
        return datetime.fromtimestamp(value, tz=UTC).year
    except (OverflowError, OSError, ValueError):
        return None


class IgdbSource:
    """Video game metadata from IGDB."""

    source_name = "igdb"
    item_type = ItemType.GAME

    def __init__(self, config: Config) -> None:
        self._client_id = config.igdb_client_id
        self._client_secret = config.igdb_client_secret
        self._token: str | None = None
        # IGDB documents 4 requests per second per Client ID. The live API
        # returns no rate-limit headers to confirm against, so this stays
        # conservative.
        self._throttle = Throttle(min_interval=0.25)

    def configured(self) -> bool:
        return bool(self._client_id and self._client_secret)

    def _require_credentials(self) -> tuple[str, str]:
        if not self.configured():
            raise SourceNotConfigured(
                self.source_name,
                "IGDB_CLIENT_ID and IGDB_CLIENT_SECRET are not both set",
            )
        return self._client_id, self._client_secret

    async def _fetch_token(self) -> str:
        client_id, client_secret = self._require_credentials()
        try:
            async with httpx2.AsyncClient(timeout=TIMEOUT) as client:
                response = await client.post(
                    TOKEN_URL,
                    params={
                        "client_id": client_id,
                        "client_secret": client_secret,
                        "grant_type": "client_credentials",
                    },
                )
        except httpx2.HTTPError as error:
            raise SourceError(
                self.source_name, f"token request failed: {error}"
            ) from error

        if response.status_code >= 400:
            raise SourceError(
                self.source_name,
                f"HTTP {response.status_code} from Twitch while getting a token",
            )

        token = response.json().get("access_token")
        if not token:
            raise SourceError(self.source_name, "Twitch returned no access token")

        logger.info("igdb obtained a new app token")
        self._token = token
        return token

    async def _query(self, body: str) -> list[dict]:
        """Runs one Apicalypse query, refreshing the token once on a 401."""
        client_id, _ = self._require_credentials()
        token = self._token or await self._fetch_token()

        for attempt in (1, 2):
            await self._throttle.wait()
            headers = {
                "Client-ID": client_id,
                "Authorization": f"Bearer {token}",
                "Accept": "application/json",
            }
            try:
                async with httpx2.AsyncClient(timeout=TIMEOUT) as client:
                    response = await client.post(API_URL, content=body, headers=headers)
            except httpx2.HTTPError as error:
                raise SourceError(
                    self.source_name, f"request failed: {error}"
                ) from error

            logger.info("igdb POST /v4/games -> %s", response.status_code)

            if response.status_code == 401 and attempt == 1:
                # The app token lasts about two months, so this is rare -- but
                # when it does expire the fix is a new token, not an error.
                self._token = None
                token = await self._fetch_token()
                continue
            if response.status_code == 429:
                raise SourceRateLimited(self.source_name, "rate limited by IGDB")
            if response.status_code >= 400:
                raise SourceError(
                    self.source_name, f"HTTP {response.status_code} from IGDB"
                )
            return response.json()

        raise SourceError(self.source_name, "authentication failed twice")

    def _image_url(self, row: dict, size: str) -> str | None:
        image_id = (row.get("cover") or {}).get("image_id")
        return f"{IMAGE_ROOT}/{size}/{image_id}.jpg" if image_id else None

    def _parse_search(self, payload: list[dict]) -> list[SourceResult]:
        """Maps a games query onto picker rows."""
        return [
            SourceResult(
                external_id=str(row["id"]),
                title=row.get("name") or "",
                year=year_from_unix(row.get("first_release_date")),
                thumbnail_url=self._image_url(row, THUMBNAIL_SIZE),
            )
            for row in payload[:SEARCH_LIMIT]
        ]

    def _parse_detail(self, row: dict) -> SourceDetail:
        """Maps one game onto Item's columns plus the snapshot."""
        developers = [
            (involved.get("company") or {}).get("name")
            for involved in row.get("involved_companies") or []
            if involved.get("developer") and (involved.get("company") or {}).get("name")
        ]
        return SourceDetail(
            external_id=str(row["id"]),
            title=row.get("name") or "",
            year=year_from_unix(row.get("first_release_date")),
            creator=", ".join(dict.fromkeys(developers)) or None,
            cover_url=self._image_url(row, COVER_SIZE),
            source_metadata={
                "genres": [genre["name"] for genre in row.get("genres") or []],
                "description": row.get("summary") or None,
                "community_score": row.get("total_rating") or row.get("rating"),
                "community_votes": row.get("total_rating_count"),
                "critic_score": row.get("aggregated_rating"),
                "platforms": [p["name"] for p in row.get("platforms") or []],
                # Kept for a future recommendation engine, which is the only
                # reason this field is requested at all.
                "similar_games": row.get("similar_games") or [],
            },
        )

    async def search(self, query: str, year: int | None = None) -> list[SourceResult]:
        """Candidate games for `query`.

        IGDB's search does not take a year filter, so `year` is accepted for
        interface compatibility and applied later by the matching layer.
        """
        escaped = query.replace('"', '\\"')
        payload = await self._query(
            f'search "{escaped}"; {FIELDS} limit {SEARCH_LIMIT};'
        )
        return self._parse_search(payload)

    async def fetch(self, external_id: str) -> SourceDetail:
        """Full detail for one IGDB game id."""
        if not external_id.isdigit():
            raise SourceError(self.source_name, f"invalid IGDB id {external_id!r}")
        payload = await self._query(f"where id = {external_id}; {FIELDS} limit 1;")
        if not payload:
            raise SourceError(self.source_name, f"no game with id {external_id}")
        return self._parse_detail(payload[0])
