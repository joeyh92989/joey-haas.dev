"""The comics admin routes: series search, follow and want, the pull list,
Got it and Skip, and the ComicVine refreshes.

Every rule about issue numbers lives in comics.py; this module loads rows,
calls ComicVine and writes. Writes to a row's comic fields go through
items._copy_fields, the same gate as create and PATCH, so a range Got it
builds is canonicalised and checked exactly as a typed one is.

A followed-only series is an ordinary item: a comic with owned_format none,
private, following. Follow alone never makes anything public (spec D5).
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from collections.abc import AsyncIterator
from datetime import UTC, date, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from comics import (
    MAX_ISSUE,
    comic_snapshot,
    expand,
    format_ranges,
    owned_set,
    parse_ranges,
    pull_weeks,
    row_run,
    series_from_row,
)
from items import _apply_detail, _copy_fields, _http_error_for, require_admin
from models import Item, ItemStatus, ItemType, OwnedFormat
from playthroughs import apply_status
from sources.base import SourceError
from sources.registry import adapter_for

logger = logging.getLogger(__name__)

SOURCE = "comicvine"


def _today() -> date:
    return datetime.now(UTC).date()


IssueNumber = Annotated[int, Path(ge=1, le=MAX_ISSUE)]


class VolumeIn(BaseModel):
    external_id: str = Field(pattern=r"^\d{1,12}$")


def _state(item: Item) -> dict:
    """A row's comic state after a write, for the page to redraw in place."""
    return {
        "item_id": str(item.id),
        "title": item.title,
        "owned_format": item.owned_format.value,
        "status": item.status.value,
        "is_public": item.is_public,
        "following": item.following,
        "issues_owned": item.issues_owned,
        "issues_skipped": item.issues_skipped,
        "comic_run": row_run(
            item.issues_owned,
            item.issues_skipped,
            item.editions,
            item.read_to,
            item.source_metadata,
        ),
    }


def create_comics_router(
    factory: async_sessionmaker[AsyncSession],
    registry: dict,
    lock: asyncio.Lock | None = None,
) -> APIRouter:
    """Builds `/api/comics`. `lock` serialises the ComicVine refreshes, which
    write every followed row; a second refresh meanwhile is a 409."""
    lock = lock or asyncio.Lock()
    router = APIRouter(
        prefix="/api/comics",
        tags=["comics"],
        dependencies=[Depends(require_admin)],
    )

    async def get_session() -> AsyncIterator[AsyncSession]:
        async with factory() as session:
            yield session

    async def exclusive():
        if lock.locked():
            raise HTTPException(status_code=409, detail="A refresh is already running")
        async with lock:
            yield

    def source():
        try:
            return adapter_for(registry, ItemType.COMIC)
        except SourceError as error:
            raise _http_error_for(error) from error

    async def _by_volume(session: AsyncSession, external_id: str) -> Item | None:
        return await session.scalar(
            select(Item).where(
                Item.external_source == SOURCE, Item.external_id == external_id
            )
        )

    async def _comic(session: AsyncSession, item_id: uuid.UUID) -> Item:
        item = await session.get(Item, item_id, with_for_update=True)
        if item is None or item.type != ItemType.COMIC:
            raise HTTPException(status_code=404, detail="No such comic")
        return item

    async def _fetch_series(external_id: str) -> tuple:
        """The volume and its latest issues: two requests."""
        adapter = source()
        try:
            detail = await adapter.fetch(external_id)
            issues = await adapter.fetch_issues(external_id)
        except SourceError as error:
            raise _http_error_for(error) from error
        return detail, issues

    def _apply_series(item: Item, detail, issues: list[dict]) -> None:
        _apply_detail(item, detail)
        metadata = dict(item.source_metadata or {})
        metadata.update(comic_snapshot(metadata.get("issue_count"), issues, _today()))
        item.source_metadata = metadata

    async def _create(
        session: AsyncSession, external_id: str, *, public: bool, following: bool
    ) -> Item:
        detail, issues = await _fetch_series(external_id)
        item = Item(
            type=ItemType.COMIC,
            title=detail.title,
            status=ItemStatus.BACKLOG,
            is_public=public,
            owned_format=OwnedFormat.NONE,
            external_source=SOURCE,
            external_id=external_id,
            following=following,
        )
        _apply_series(item, detail, issues)
        session.add(item)
        try:
            await session.commit()
        except IntegrityError as error:
            # Two presses at once: ux_items_external let only one through.
            await session.rollback()
            if "ux_items_external" not in str(error.orig):
                raise
            raise HTTPException(
                status_code=409, detail="Already on your shelf"
            ) from None
        await session.refresh(item)
        return item

    @router.get("/search")
    async def search(q: str, session: AsyncSession = Depends(get_session)) -> list:
        """ComicVine volumes, each marked with what the shelf already holds."""
        query = q.strip()
        if not query:
            raise HTTPException(status_code=422, detail="Type a series name")
        try:
            volumes = await source().search_volumes(query)
        except SourceError as error:
            raise _http_error_for(error) from error
        ids = [v.external_id for v in volumes]
        rows = (
            await session.scalars(
                select(Item).where(
                    Item.external_source == SOURCE, Item.external_id.in_(ids)
                )
            )
            if ids
            else []
        )
        held = {row.external_id: row for row in rows}
        out = []
        for volume in volumes:
            row = held.get(volume.external_id)
            out.append(
                {
                    "external_id": volume.external_id,
                    "title": volume.title,
                    "year": volume.year,
                    "publisher": volume.publisher,
                    "issue_count": volume.issue_count,
                    "thumbnail_url": volume.thumbnail_url,
                    "item_id": str(row.id) if row else None,
                    "in_shelf": bool(row and row.owned_format != OwnedFormat.NONE),
                    "wanted": bool(
                        row and row.owned_format == OwnedFormat.NONE and row.is_public
                    ),
                    "following": bool(row and row.following),
                }
            )
        return out

    @router.post("/follow")
    async def follow(body: VolumeIn, session: AsyncSession = Depends(get_session)):
        """Follows a series, creating a private followed-only row if needed."""
        item = await _by_volume(session, body.external_id)
        if item is None:
            item = await _create(
                session, body.external_id, public=False, following=True
            )
        elif not item.following:
            item.following = True
            await session.commit()
            await session.refresh(item)
        return _state(item)

    @router.post("/unfollow")
    async def unfollow(body: VolumeIn, session: AsyncSession = Depends(get_session)):
        """Stops following. A followed-only row holding nothing else is
        removed, since Follow is what made it; any other row keeps everything
        but the flag."""
        item = await _by_volume(session, body.external_id)
        if item is None:
            raise HTTPException(status_code=404, detail="Not following that series")
        followed_only = (
            item.owned_format == OwnedFormat.NONE
            and not item.is_public
            and not (item.issues_owned or item.issues_skipped or item.editions)
            and item.read_to is None
        )
        if followed_only:
            await session.delete(item)
            await session.commit()
            return {"item_id": None, "following": False}
        item.following = False
        await session.commit()
        await session.refresh(item)
        return _state(item)

    @router.post("/want", status_code=201)
    async def want(body: VolumeIn, session: AsyncSession = Depends(get_session)):
        """A public want: no owned copy, as Radar's Want. A followed-only row
        becomes the want; a series already owned is a 409."""
        item = await _by_volume(session, body.external_id)
        if item is None:
            item = await _create(
                session, body.external_id, public=True, following=False
            )
            return _state(item)
        if item.owned_format != OwnedFormat.NONE:
            raise HTTPException(status_code=409, detail="Already on your shelf")
        item.is_public = True
        await session.commit()
        await session.refresh(item)
        return _state(item)

    @router.get("/pull-list")
    async def pull_list(session: AsyncSession = Depends(get_session)) -> dict:
        """This week and the next three, the undated note, and when the
        followed series were last refreshed."""
        rows = list(
            await session.scalars(
                select(Item).where(
                    Item.type == ItemType.COMIC, Item.following.is_(True)
                )
            )
        )
        by_id = {str(row.id): row for row in rows}
        series = [
            series_from_row(
                str(row.id),
                row.title,
                (row.source_metadata or {}).get("publisher") or row.creator,
                row.issues_owned,
                row.issues_skipped,
                row.editions,
                row.read_to,
                row.source_metadata,
                row.owned_format != OwnedFormat.NONE,
                row.following,
            )
            for row in rows
        ]
        listing = pull_weeks(series, _today())
        fetched = [
            (row.source_metadata or {}).get("fetched_on")
            for row in rows
            if (row.source_metadata or {}).get("fetched_on")
        ]
        return {
            "following": len(rows),
            "last_refresh": max(fetched, default=None),
            "weeks": [
                {
                    "start": week.start.isoformat(),
                    "this_week": week.this_week,
                    "rows": [
                        {
                            "item_id": row.series_id,
                            "title": row.title,
                            "publisher": row.publisher,
                            "number": row.issue.count,
                            "name": row.issue.name,
                            "store_date": row.issue.store_date.isoformat(),
                            "cover_url": row.issue.cover_url
                            or by_id[row.series_id].cover_url,
                            "owned_text": row.owned_text,
                            "released": row.released,
                            "on_shelf": by_id[row.series_id].owned_format
                            != OwnedFormat.NONE,
                        }
                        for row in week.rows
                    ],
                }
                for week in listing.weeks
            ],
            "undated": [{"item_id": s.id, "title": s.title} for s in listing.undated],
        }

    @router.post("/{item_id}/issues/{number}/got")
    async def got(
        item_id: uuid.UUID,
        number: IssueNumber,
        session: AsyncSession = Depends(get_session),
    ) -> dict:
        """Adds the issue to the owned ranges (and out of the skipped ones).
        A followed-only or wanted row becomes an owned one, To read."""
        item = await _comic(session, item_id)
        owned = expand(parse_ranges(item.issues_owned)) | {number}
        skipped = expand(parse_ranges(item.issues_skipped)) - {number}
        body: dict = {
            "issues_owned": format_ranges(owned),
            "issues_skipped": format_ranges(skipped) or None,
        }
        if item.owned_format == OwnedFormat.NONE:
            body.update(owned_format=OwnedFormat.PHYSICAL)
            # Through playthroughs.py, the one writer of status (a no-op for
            # the usual Want, already in the backlog).
            await apply_status(session, item, ItemStatus.BACKLOG, date.today())
        for field, value in _copy_fields(body, item).items():
            setattr(item, field, value)
        await session.commit()
        await session.refresh(item)
        return _state(item)

    @router.post("/{item_id}/issues/{number}/skip")
    async def skip(
        item_id: uuid.UUID,
        number: IssueNumber,
        session: AsyncSession = Depends(get_session),
    ) -> dict:
        """Records the issue as skipped: off the pull list, a gap on the bar."""
        item = await _comic(session, item_id)
        if number in owned_set(item.issues_owned, item.editions):
            raise HTTPException(status_code=409, detail=f"#{number} is already owned")
        skipped = expand(parse_ranges(item.issues_skipped)) | {number}
        changes = _copy_fields({"issues_skipped": format_ranges(skipped)}, item)
        for field, value in changes.items():
            setattr(item, field, value)
        await session.commit()
        await session.refresh(item)
        return _state(item)

    @router.post("/refresh")
    async def refresh_all(
        _lock=Depends(exclusive), session: AsyncSession = Depends(get_session)
    ) -> dict:
        """The latest issues of every followed series: one request each.

        The volume record is left as it is (its count only floors released);
        "Refresh from Comic Vine" on a row re-reads it. A series that fails is
        reported and keeps its previous snapshot.

        Each row is re-read under FOR UPDATE after its fetch and committed on
        its own, so no lock is held across a Comic Vine request, a series
        unfollowed (and deleted) meanwhile is skipped rather than failing the
        run, and a concurrent "Refresh from Comic Vine" is not overwritten.
        """
        adapter = source()
        rows = (
            await session.execute(
                select(Item.id, Item.external_id, Item.title)
                .where(
                    Item.type == ItemType.COMIC,
                    Item.following.is_(True),
                    Item.external_source == SOURCE,
                    Item.external_id.is_not(None),
                )
                .order_by(Item.title)
            )
        ).all()
        await session.commit()  # ends the read transaction before the fetches
        refreshed = 0
        errors: list[dict] = []
        today = _today()
        for item_id, external_id, title in rows:
            try:
                issues = await adapter.fetch_issues(external_id)
            except SourceError as error:
                logger.info("comics refresh failed for %s: %s", title, error)
                errors.append(
                    {"item_id": str(item_id), "title": title, "error": str(error)}
                )
                continue
            item = await session.get(
                Item, item_id, with_for_update=True, populate_existing=True
            )
            if item is None or item.external_id != external_id:
                await session.rollback()
                continue
            metadata = dict(item.source_metadata or {})
            metadata.update(comic_snapshot(metadata.get("issue_count"), issues, today))
            item.source_metadata = metadata
            await session.commit()
            refreshed += 1
        return {"ok": not errors, "refreshed": refreshed, "errors": errors}

    @router.post("/{item_id}/refresh")
    async def refresh_one(
        item_id: uuid.UUID,
        _lock=Depends(exclusive),
        session: AsyncSession = Depends(get_session),
    ) -> dict:
        """Refresh from Comic Vine: the volume record and its latest issues."""
        item = await _comic(session, item_id)
        if item.external_source != SOURCE or not item.external_id:
            raise HTTPException(
                status_code=409, detail="This comic is not linked to Comic Vine"
            )
        detail, issues = await _fetch_series(item.external_id)
        _apply_series(item, detail, issues)
        await session.commit()
        await session.refresh(item)
        return _state(item)

    return router
