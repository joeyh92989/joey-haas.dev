"""Cross-kind search for the add bar (spec D5).

One query goes to the source of every kind in the area at once, each under
its own `SEARCH_TIMEOUT`, so a slow Comic Vine never holds up IGDB's answer.
Each kind reports a state the page words: `ok`, `not_configured` (with the
reason `GET /api/intake/kinds` gives), `busy` (rate-limited, down or past
the timeout: try again, not a miss) or `failed` (any other error, worded
the same whatever it was; the error itself is only logged). A result whose
`(external_source, external_id)` is already an item carries
`owned_item_id`, the commit's own duplicate rule, so the page links to it
instead of adding it twice.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from sqlalchemy import select, tuple_
from sqlalchemy.ext.asyncio import AsyncSession

from intake.kinds import Kind, describe, kinds_for
from models import IntakeArea, Item
from sources.base import SourceError, SourceRateLimited, SourceUnavailable

logger = logging.getLogger(__name__)

# Seconds one source may take before it is reported busy.
SEARCH_TIMEOUT = 8.0


def _failed(kind: Kind, adapter: Any) -> dict:
    """A failed source's state, in fixed wording whatever went wrong."""
    reason = f"{adapter.source_name} could not be searched just now"
    return {"kind": kind.key, "state": "failed", "reason": reason}


async def _search_kind(kind: Kind, registry: dict, query: str) -> tuple[dict, list]:
    adapter = registry.get(kind.source)
    if adapter is None or not adapter.configured():
        reason = describe(kind, registry)["source_state"]
        return {"kind": kind.key, "state": "not_configured", "reason": reason}, []
    try:
        found = await asyncio.wait_for(adapter.search(query), SEARCH_TIMEOUT)
    except (SourceRateLimited, SourceUnavailable, TimeoutError):
        reason = f"{adapter.source_name} is busy; try again in a moment"
        return {"kind": kind.key, "state": "busy", "reason": reason}, []
    except SourceError as error:
        # The error's text can carry a request URL, and some sources' keys
        # travel in the query string: it goes to the log, never the client.
        logger.info("intake search: %s failed: %s", adapter.source_name, error)
        return _failed(kind, adapter), []
    except Exception:
        # A parsing bug in one adapter fails that source, not the search.
        logger.exception("intake search: %s raised", adapter.source_name)
        return _failed(kind, adapter), []
    rows = []
    for result in found:
        row = {
            "kind": kind.key,
            "external_source": adapter.source_name,
            "external_id": str(result.external_id),
            "title": result.title,
            "year": result.year,
            "thumbnail_url": result.thumbnail_url,
        }
        # Only ComicVine knows these; other sources' rows are unchanged.
        if result.publisher:
            row["publisher"] = result.publisher
        if result.issue_count is not None:
            row["issue_count"] = result.issue_count
        rows.append(row)
    return {"kind": kind.key, "state": "ok", "reason": None}, rows


async def search_area(
    session: AsyncSession, registry: dict, area: IntakeArea, query: str
) -> dict[str, Any]:
    """`{results, sources}` for `query` across the area's kinds that have a
    source; an area with none (the Closet) answers both empty."""
    kinds = [kind for kind in kinds_for(area) if kind.source is not None]
    answers = await asyncio.gather(
        *(_search_kind(kind, registry, query) for kind in kinds)
    )
    sources = [state for state, _ in answers]
    results = [row for _, rows in answers for row in rows]
    keys = {(row["external_source"], row["external_id"]) for row in results}
    owned: dict[tuple[str, str], str] = {}
    if keys:
        found = await session.execute(
            select(Item.id, Item.external_source, Item.external_id).where(
                tuple_(Item.external_source, Item.external_id).in_(keys)
            )
        )
        owned = {(source, eid): str(item_id) for item_id, source, eid in found.all()}
    for row in results:
        row["owned_item_id"] = owned.get((row["external_source"], row["external_id"]))
    return {"results": results, "sources": sources}
