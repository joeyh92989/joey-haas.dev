"""Analytics routes: the public beacon, the admin read and the nightly rollup.

`POST /api/track` is unauthenticated and answers 204 to every request that
origin_check lets through (a foreign Origin is a 403 before it runs), so a
visitor's browser never sees an error and a caller learns nothing from it.
The body is validated by analytics.normalise; the visitor is a daily-salted
hash, and neither the IP nor the user agent is stored or logged.

`GET /api/analytics` and `POST /api/analytics/rollup` are admin only; the
rollup is also on items.JOB_ROUTES for the nightly workflow.
"""

from __future__ import annotations

import asyncio
import logging
import time
from collections.abc import AsyncIterator, Awaitable, Callable
from datetime import UTC, date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from sqlalchemy import delete, distinct, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from analytics import (
    MAX_BODY_BYTES,
    RANGES,
    RETENTION_DAYS,
    DailyCap,
    Stat,
    cap_key,
    client_ip,
    daily_salt,
    normalise,
    range_start,
    rollup_day,
    summarise,
    visitor_hash,
)
from auth import session_admin
from items import require_admin
from models import DailyStat, PageView

logger = logging.getLogger(__name__)

Clock = Callable[[], datetime]


def _utc_now() -> datetime:
    return datetime.now(UTC)


async def _read_capped(request: Request) -> bytes | None:
    """The body, or None once it passes MAX_BODY_BYTES (read no further)."""
    body = bytearray()
    async for chunk in request.stream():
        body += chunk
        if len(body) > MAX_BODY_BYTES:
            return None
    return bytes(body)


def _opted_out(request: Request) -> bool:
    """Global Privacy Control or Do Not Track. The beacon checks both before
    sending; this catches a browser that sends the header only."""
    return request.headers.get("sec-gpc") == "1" or request.headers.get("dnt") == "1"


def create_track_router(
    factory: async_sessionmaker[AsyncSession],
    secret: str,
    now: Clock = _utc_now,
) -> APIRouter:
    """The beacon's route. Unauthenticated: the gate is the validation."""
    router = APIRouter(tags=["analytics"])
    cap = DailyCap()

    @router.post("/api/track", status_code=204)
    async def track(request: Request) -> Response:
        done = Response(status_code=204)
        if _opted_out(request) or session_admin(request) is not None:
            return done
        raw = await _read_capped(request)
        event = normalise(raw) if raw is not None else None
        if event is None:
            return done
        day = now().astimezone(UTC).date()
        salt = daily_salt(secret, day)
        ip = client_ip(request.headers, request.client.host if request.client else None)
        if not cap.allow(cap_key(salt, ip), day):
            return done
        row = PageView(
            day=day,
            path=event.path,
            referrer_host=event.ref,
            device=event.device,
            visitor_hash=visitor_hash(salt, ip, request.headers.get("user-agent", "")),
        )
        try:
            async with factory() as session:
                session.add(row)
                await session.commit()
        except Exception as error:  # noqa: BLE001 -- the beacon never errors
            # The type only: the row's fields are not worth a log line.
            logger.warning("page view not stored: %s", type(error).__name__)
        return done

    return router


class SummaryCache:
    """The read's bodies for up to 60 seconds, one per range: keyed on the
    range and the monotonic minute, with PublicNextCache's lock and double
    check so concurrent misses build once."""

    def __init__(self, clock: Callable[[], float] = time.monotonic) -> None:
        self._clock = clock
        self._entries: dict[str, tuple[int, dict]] = {}
        self._lock = asyncio.Lock()

    async def get(self, key: str, build: Callable[[], Awaitable[dict]]) -> dict:
        minute = int(self._clock() // 60)
        hit = self._entries.get(key)
        if hit is not None and hit[0] == minute:
            return hit[1]
        async with self._lock:
            hit = self._entries.get(key)
            if hit is None or hit[0] != minute:
                hit = (minute, await build())
                self._entries[key] = hit
            return hit[1]

    def clear(self) -> None:
        self._entries.clear()


async def _raw_stats(
    session: AsyncSession,
    days: list[date] | None,
    since: date | None = None,
    skip: set[date] | None = None,
) -> list[Stat]:
    """Stat rows computed from raw views, for `days` or from `since` on,
    leaving out the days in `skip` in SQL rather than after loading them."""
    query = select(
        PageView.day,
        PageView.path,
        PageView.referrer_host,
        PageView.device,
        PageView.visitor_hash,
    )
    if days is not None:
        query = query.where(PageView.day.in_(days))
    if since is not None:
        query = query.where(PageView.day >= since)
    if skip:
        query = query.where(PageView.day.not_in(skip))
    grouped: dict[date, list[tuple]] = {}
    for day, *view in (await session.execute(query)).all():
        grouped.setdefault(day, []).append(tuple(view))
    return [stat for day, views in grouped.items() for stat in rollup_day(day, views)]


def create_analytics_router(
    factory: async_sessionmaker[AsyncSession],
    now: Clock = _utc_now,
    cache: SummaryCache | None = None,
) -> APIRouter:
    """The admin read and the rollup. `cache` is for tests."""
    router = APIRouter(
        prefix="/api/analytics",
        tags=["analytics"],
        dependencies=[Depends(require_admin)],
    )
    cache = cache or SummaryCache()
    # Two overlapping rollups (a manual run during the nightly one) would
    # each delete a day's stats and then both insert them.
    rollup_lock = asyncio.Lock()

    async def get_session() -> AsyncIterator[AsyncSession]:
        async with factory() as session:
            yield session

    @router.get("")
    async def read(
        span: str = Query("30d", alias="range"),
        session: AsyncSession = Depends(get_session),
    ) -> dict:
        """Tiles, the day series and the three lists over a range ending
        today. Rolled-up days come from daily_stats; any day not rolled up
        yet (today, or a night the job missed) is counted from raw rows."""
        if span not in RANGES:
            raise HTTPException(status_code=422, detail="Unknown range")
        today = now().astimezone(UTC).date()
        start = range_start(span, today)

        async def build() -> dict:
            rolled = (
                await session.scalars(
                    select(DailyStat).where(
                        DailyStat.day >= start, DailyStat.day <= today
                    )
                )
            ).all()
            stats = [
                Stat(row.day, row.dimension, row.value, row.views, row.visitors)
                for row in rolled
            ]
            done = {stat.day for stat in stats}
            pending = await _raw_stats(session, None, since=start, skip=done)
            return summarise([*stats, *pending], start, today)

        return {"range": span, **await cache.get(span, build)}

    @router.post("/rollup")
    async def rollup(session: AsyncSession = Depends(get_session)) -> dict:
        """Recomputes daily_stats for every finished day that still has raw
        rows, then deletes raw rows older than RETENTION_DAYS. Idempotent, so
        a missed night is caught up by the next run."""
        async with rollup_lock:
            return await _rollup(session)

    async def _rollup(session: AsyncSession) -> dict:
        today = now().astimezone(UTC).date()
        days = list(
            (
                await session.scalars(
                    select(distinct(PageView.day)).where(PageView.day < today)
                )
            ).all()
        )
        stats = await _raw_stats(session, days) if days else []
        if days:
            await session.execute(delete(DailyStat).where(DailyStat.day.in_(days)))
        session.add_all(
            DailyStat(
                day=stat.day,
                dimension=stat.dimension,
                value=stat.value,
                views=stat.views,
                visitors=stat.visitors,
            )
            for stat in stats
        )
        cutoff = today - timedelta(days=RETENTION_DAYS)
        deleted = await session.execute(delete(PageView).where(PageView.day < cutoff))
        await session.commit()
        cache.clear()
        return {"days": len(days), "deleted": deleted.rowcount}

    return router
