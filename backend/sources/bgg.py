"""BoardGameGeek -- board games. Blocked on registration, deliberately unbuilt.

The requirements doc recorded BGG's XML API as keyless. That is no longer true.
Verified on 2026-09-01: every request to xmlapi2 *and* the older xmlapi returns

    401 Unauthorized. See https://boardgamegeek.com/using_the_xml_api

regardless of User-Agent, with no credentials accepted anonymously. BGG began
requiring registered applications and authorization tokens in late 2025 and now
enforces it.

Only the configuration check is implemented here. Search and detail parsing are
deliberately absent rather than written against the documented XML shape,
because nothing in this repository could verify them: the adapters in this
package are tested against recorded real responses, and there is no way to
record one without a token. Guessing at the mapping would produce code that
looks finished, passes its own invented fixtures, and fails on first contact.

To finish this source:

1. Register the application via the form linked from
   boardgamegeek.com/using_the_xml_api and obtain a token.
2. Set BGG_TOKEN.
3. Record real search and thing fixtures, then implement _parse_search and
   _parse_detail the way tmdb.py and igdb.py do.

The behaviour until then is correct rather than merely absent: board games
detected in a photograph import as manual rows with the title that was read,
and the picker reports that the source is unavailable.
"""

from __future__ import annotations

from config import Config
from models import ItemType
from sources.base import SourceDetail, SourceNotConfigured, SourceResult

REGISTRATION_URL = "https://boardgamegeek.com/using_the_xml_api"

UNAVAILABLE = (
    "BoardGameGeek now requires a registered application and an authorization "
    f"token; set BGG_TOKEN after registering at {REGISTRATION_URL}"
)


class BggSource:
    """Board game metadata from BGG. Not yet usable -- see the module docstring."""

    source_name = "bgg"
    item_type = ItemType.BOARDGAME

    def __init__(self, config: Config) -> None:
        self._token = config.bgg_token

    def configured(self) -> bool:
        """Always False until a token exists *and* the parsing is written.

        Reporting True on the strength of a token alone would let the picker
        call methods that raise, turning a clear "unavailable" into a 502.
        """
        return False

    async def search(
        self,
        query: str,
        year: int | None = None,
        platform: str | None = None,
    ) -> list[SourceResult]:
        raise SourceNotConfigured(self.source_name, UNAVAILABLE)

    async def fetch(self, external_id: str) -> SourceDetail:
        raise SourceNotConfigured(self.source_name, UNAVAILABLE)
