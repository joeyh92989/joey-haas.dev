"""The free-tier budget: model calls counted per model and Pacific day (spec D3).

Gemini's free tier resets its per-day quota at midnight Pacific, so the day
here is the Los Angeles calendar day, not UTC and not Denver. Every attempt
is counted -- a 503 that is retried spends a request as surely as a 200 --
and a per-day 429 marks the model exhausted for the rest of the day.

The recorder opens its own short session per write and commits it, so a
count survives the rollback of whatever request made the call. A database
failure while counting is logged and swallowed: the budget is advice to the
reader, never a reason to fail the call it is counting.
"""

from __future__ import annotations

import logging
from collections.abc import Callable, Sequence
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from config import Config
from llm import FREE_TIER_DAILY_REQUESTS, GEMINI_MODELS
from models import LlmUsage

logger = logging.getLogger(__name__)

PACIFIC = ZoneInfo("America/Los_Angeles")
DAILY_REQUESTS = FREE_TIER_DAILY_REQUESTS
# Kept back from the reader for the rest of the site's model calls
# (Discover, Closet, the photo importer).
RESERVE = 12


def pacific_day(now: datetime) -> date:
    """The Pacific calendar day ``now`` falls on: the free tier's day."""
    return now.astimezone(PACIFIC).date()


def _next_pacific_midnight(now: datetime) -> datetime:
    tomorrow = pacific_day(now) + timedelta(days=1)
    return datetime.combine(tomorrow, time(0), tzinfo=PACIFIC).astimezone(UTC)


class UsageRecorder:
    """Counts model attempts in ``llm_usage`` from its own sessions."""

    def __init__(
        self,
        session_factory: async_sessionmaker[AsyncSession],
        clock: Callable[[], datetime] | None = None,
    ) -> None:
        self._session_factory = session_factory
        self._clock = clock or (lambda: datetime.now(UTC))

    async def attempt(self, model: str) -> None:
        """Count one request to ``model`` today."""
        await self._upsert(model, {"calls": LlmUsage.calls + 1}, calls=1)

    async def exhausted(self, model: str) -> None:
        """Mark ``model`` out of requests for the rest of today."""
        await self._upsert(model, {"exhausted": True}, exhausted=True)

    async def _upsert(self, model: str, update: dict, **values) -> None:
        day = pacific_day(self._clock())
        statement = (
            insert(LlmUsage)
            .values(day=day, model=model, **values)
            .on_conflict_do_update(
                index_elements=[LlmUsage.day, LlmUsage.model],
                set_={**update, "updated_at": datetime.now(UTC)},
            )
        )
        try:
            async with self._session_factory() as session:
                await session.execute(statement)
                await session.commit()
        except Exception:  # noqa: BLE001 -- counting never fails the call
            logger.warning("could not record llm usage for %s", model, exc_info=True)


async def remaining(
    session: AsyncSession,
    models: Sequence[str] = GEMINI_MODELS,
    reserve: int = RESERVE,
    *,
    day: date,
) -> int:
    """Requests left today across ``models``, less the reserve, never negative."""
    rows = (
        await session.scalars(
            select(LlmUsage).where(LlmUsage.day == day, LlmUsage.model.in_(models))
        )
    ).all()
    by_model = {row.model: row for row in rows}
    left = 0
    for model in models:
        row = by_model.get(model)
        if row is None:
            left += DAILY_REQUESTS
        elif not row.exhausted:
            left += max(0, DAILY_REQUESTS - row.calls)
    return max(0, left - reserve)


async def budget_state(
    session: AsyncSession, config: Config, now: datetime | None = None
) -> dict:
    """``{remaining, enforced, resets_at}`` for the reader and the page.

    Enforced only on Gemini: another provider has no free-tier day to spend.
    """
    now = now or datetime.now(UTC)
    enforced = (config.llm_provider or "gemini").lower() == "gemini"
    return {
        "remaining": await remaining(session, GEMINI_MODELS, day=pacific_day(now)),
        "enforced": enforced,
        "resets_at": _next_pacific_midnight(now),
    }
