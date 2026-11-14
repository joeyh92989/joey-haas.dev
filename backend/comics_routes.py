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
from dataclasses import asdict
from datetime import UTC, date, datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Path, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from comic_issues import sync_series
from comics import (
    MARK_STATES,
    MAX_ISSUE,
    MarkRefused,
    MarksResult,
    RangeError,
    comic_snapshot,
    edition_slugs,
    expand,
    format_ranges,
    mark_mismatches,
    owned_set,
    parse_ranges,
    plan_mark,
    pull_weeks,
    row_run,
    series_from_row,
    sync_marks,
)
from items import _apply_detail, _copy_fields, _http_error_for, require_admin
from models import CatalogueRun, ComicIssue, Item, ItemStatus, ItemType, OwnedFormat
from physical_sources.catalogue import finish_run, run_failed, start_run
from playthroughs import apply_status
from public_comics import comic_detail, read_marks_count
from public_issues import build_wall
from sources.base import SourceError
from sources.registry import adapter_for

logger = logging.getLogger(__name__)

SOURCE = "comicvine"
RUN_SOURCE = "comic_issues"  # the catalogue_runs source of the issue sync


def _today() -> date:
    return datetime.now(UTC).date()


# Requests a create or a refresh may spend on issues: one page (up to 100
# issues). The request waits on it, so the nightly sync finishes longer runs.
ISSUE_SYNC_BUDGET = 1


LINK_KEYS = ("cv_id", "cover_url", "large_url", "description")


class LinkIn(BaseModel):
    cv_id: int | None = Field(default=None, ge=1)


IssueNumber = Annotated[int, Path(ge=1, le=MAX_ISSUE)]


class VolumeIn(BaseModel):
    external_id: str = Field(pattern=r"^\d{1,12}$")


async def got_issues(
    session: AsyncSession, item: Item, numbers: set[int], today: date
) -> int:
    """Got it's rule for a set of issues: adds them to the owned ranges and
    takes them out of the skipped ones; a followed-only or wanted row becomes
    an owned one, To read. Never removes an owned issue. Returns how many
    issues were not owned before. Does not commit (the pull list's Got it
    and intake's commit share it)."""
    before = expand(parse_ranges(item.issues_owned))
    owned = before | numbers
    skipped = expand(parse_ranges(item.issues_skipped)) - numbers
    body: dict = {
        "issues_owned": format_ranges(owned),
        "issues_skipped": format_ranges(skipped) or None,
    }
    if item.owned_format == OwnedFormat.NONE:
        body.update(owned_format=OwnedFormat.PHYSICAL)
        # Through playthroughs.py, the one writer of status (a no-op for
        # the usual Want, already in the backlog).
        await apply_status(session, item, ItemStatus.BACKLOG, today)
    for field, value in _copy_fields(body, item).items():
        setattr(item, field, value)
    await sync_marks(session, item)
    return len(owned - before)


class MarkBody(BaseModel):
    state: Literal[*MARK_STATES]
    # Through this number, for a whole book at once (the edition page's Read
    # to the end): every issue from the path's number to it gets the state.
    to: Annotated[int, Field(ge=1, le=MAX_ISSUE)] | None = None


def _state(item: Item) -> dict:
    """A row's comic state after a write, for the page to redraw in place."""
    return {
        "item_id": str(item.id),
        "title": item.title,
        "owned_format": item.owned_format.value if item.owned_format else None,
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


def issues_run_summary(
    run: CatalogueRun | None, now: datetime | None = None
) -> dict | None:
    """The Jobs page's view of the issue sync's last run, null before any.

    failed: the run recorded a series error or an exception, or never
    finished (open past STALE_RUN_MINUTES). partial: no error, but the
    budget ran out before every series was complete."""
    if run is None:
        return None
    failed = run.ok is False or run_failed(run, now)
    at = (run.finished_at or run.started_at).isoformat()
    if failed:
        errors = run.errors or []
        if errors:
            detail = errors[0].get("detail") or errors[0].get("code") or "failed"
            note = f"{len(errors)} of {run.rows_seen} series failed: {detail}"
        else:
            note = "The run did not finish"
        return {"at": at, "state": "failed", "ok": False, "note": note}
    if run.short_run:
        waiting = run.unresolved_remaining
        noun = "series wait" if waiting != 1 else "series waits"
        return {
            "at": at,
            "state": "partial",
            "ok": True,
            "note": f"Budget spent; {waiting} {noun}",
        }
    return {"at": at, "state": "ok", "ok": True}


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
        await _sync_quietly(item)
        return item

    async def _sync_quietly(item: Item) -> None:
        """The issue pages' first pull, at most `ISSUE_SYNC_BUDGET` requests.
        Best effort: a failure is logged and the sync job finishes it later.

        It runs in a session of its own, so the caller's row (already fresh)
        is never expired by the sync's commits: a series deleted mid-sync
        cannot turn a successful write into a 500, and nothing has to be
        refreshed afterwards."""
        item_id, volume_id = item.id, item.external_id
        if item.external_source != SOURCE or not volume_id:
            return
        try:
            async with factory() as sync_session:
                linked = await sync_session.get(Item, item_id)
                if linked is None:
                    return
                result = await sync_series(
                    sync_session, source(), linked, ISSUE_SYNC_BUDGET, _today()
                )
            if result.error:
                logger.warning("issue sync for %s failed: %s", item_id, result.error)
        except Exception:
            logger.exception("issue sync for %s failed", item_id)

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
        await got_issues(session, item, {number}, date.today())
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
        await sync_marks(session, item)
        await session.commit()
        await session.refresh(item)
        return _state(item)

    @router.post("/{item_id}/issues/{number}/mark")
    async def mark(
        item_id: uuid.UUID,
        number: IssueNumber,
        body: MarkBody,
        session: AsyncSession = Depends(get_session),
    ) -> dict:
        """Sets one book to missing, owned or read: the one write behind every
        tap on a cover (the series page, the issue page, the admin page). The
        marks on the issue rows are the record; the range text and `read_to`
        are kept in step from them. Undo posts the previous state back."""
        item = await _comic(session, item_id)
        reads = set(
            await session.scalars(
                select(ComicIssue.number).where(
                    ComicIssue.item_id == item.id, ComicIssue.read.is_(True)
                )
            )
        )
        if body.to is not None and body.to < number:
            raise HTTPException(status_code=422, detail="To runs from the number up")
        try:
            owned, skipped = item.issues_owned, item.issues_skipped
            for each in range(number, (body.to or number) + 1):
                change = plan_mark(
                    owned, skipped, item.editions, reads, each, body.state
                )
                owned, skipped = change.issues_owned, change.issues_skipped
                reads = set(change.reads)
        except MarkRefused as error:
            raise HTTPException(status_code=409, detail=str(error)) from error
        body_fields: dict = {
            "issues_owned": change.issues_owned,
            "issues_skipped": change.issues_skipped,
            "read_to": change.read_to,
        }
        before = {
            "status": item.status.value,
            "owned_format": item.owned_format.value if item.owned_format else None,
        }
        if body.state != "missing" and item.owned_format == OwnedFormat.NONE:
            body_fields.update(owned_format=OwnedFormat.PHYSICAL)
            await apply_status(session, item, ItemStatus.BACKLOG, _today())
        for field, value in _copy_fields(body_fields, item).items():
            setattr(item, field, value)
        await sync_marks(session, item, reads=set(change.reads))
        await session.commit()
        await session.refresh(item)
        after = {
            "status": item.status.value,
            "owned_format": item.owned_format.value if item.owned_format else None,
        }
        # What the tap moved on the series itself (a Want becomes owned, To
        # read), so Undo can put it back.
        return _state(item) | {
            "number": number,
            "state": body.state,
            "previous": {k: v for k, v in before.items() if after[k] != v} or None,
        }

    @router.get("/{item_id}/wall")
    async def wall(
        item_id: uuid.UUID,
        session: AsyncSession = Depends(get_session),
    ) -> dict:
        """The cover wall and the comic block the series page draws, for any
        comic, private ones too: the admin comic page carries the same wall.
        The public builders, so a skip is in neither body."""
        item = await session.get(Item, item_id)
        if item is None or item.type != ItemType.COMIC:
            raise HTTPException(status_code=404, detail="No such comic")
        today = _today()
        built = await build_wall(session, item_id, today, public_only=False)
        return {
            "wall": built,
            "comic": comic_detail(
                item, today, await read_marks_count(session, item_id)
            ),
        }

    @router.post("/marks/backfill")
    async def backfill_marks(
        session: AsyncSession = Depends(get_session),
    ) -> dict:
        """Runs `sync_marks` on every comic row (the issue marks of 5b), run
        once after the deploy; idempotent, so a second run changes nothing.

        Derives only from what each row already records. Answers the parity
        check: `mismatches` lists series whose stored marks still disagree
        with their ranges (empty when the two agree), `errors` the series
        whose stored ranges would not parse (left unmarked, the rest done).
        Not a job route: it is run by hand, signed in."""
        items = (
            await session.scalars(
                select(Item).where(Item.type == ItemType.COMIC).order_by(Item.title)
            )
        ).all()
        total = MarksResult()
        mismatches: list[dict] = []
        errors: list[dict] = []
        for item in items:
            try:
                async with session.begin_nested():
                    total += await sync_marks(session, item)
            except RangeError as error:
                errors.append(
                    {"id": str(item.id), "title": item.title, "error": str(error)}
                )
                continue
            rows = (
                await session.execute(
                    select(
                        ComicIssue.number,
                        ComicIssue.owned,
                        ComicIssue.read,
                        ComicIssue.skipped,
                    ).where(ComicIssue.item_id == item.id)
                )
            ).all()
            wrong = mark_mismatches(
                [tuple(r) for r in rows],
                item.issues_owned,
                item.issues_skipped,
                item.editions,
                item.read_to,
            )
            if wrong:
                mismatches.append(
                    {"id": str(item.id), "title": item.title, "numbers": wrong}
                )
        await session.commit()
        return {
            "series": len(items),
            "rows_marked": total.rows_marked,
            "stubs_added": total.stubs_added,
            "rows_changed": total.rows_changed,
            "mismatches": mismatches,
            "errors": errors,
        }

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
        await _sync_quietly(item)
        return _state(item)

    @router.get("/issues/search")
    async def search_issues(q: str) -> list[dict]:
        """Comic Vine issues, for choosing what an edition collects."""
        query = q.strip()
        if not query:
            raise HTTPException(status_code=422, detail="Type an issue to find")
        try:
            hits = await source().search_issues(query)
        except SourceError as error:
            raise _http_error_for(error) from error
        return [asdict(hit) for hit in hits]

    @router.post("/issues/sync")
    async def sync_issues(
        budget: int = Query(120, ge=1, le=190),
        _lock=Depends(exclusive),
        session: AsyncSession = Depends(get_session),
    ) -> dict:
        """Pages every issue of each public linked series into comic_issues,
        stalest first, within `budget` Comic Vine requests.

        One series' failure is reported and the run goes on; a rate limit
        stops it (every later request would meet the same wall). Each page
        commits on its own and no lock is held across a request.
        """
        adapter = source()
        rows = (
            await session.execute(
                select(Item.id)
                .where(
                    Item.type == ItemType.COMIC,
                    Item.is_public.is_(True),
                    Item.external_source == SOURCE,
                    Item.external_id.is_not(None),
                )
                .order_by(Item.issues_synced_on.asc().nulls_first(), Item.id)
            )
        ).all()
        today = _today()
        remaining = budget
        series: list[dict] = []
        errors: list[dict] = []
        rate_limited = False
        # The run row is committed at once: sync_series commits and rolls
        # back per page, which must not take it along, and the session's
        # objects expire, so it is re-fetched by id to finish.
        run = await start_run(session, RUN_SOURCE)
        run_id = run.id
        await session.commit()

        async def record(*, ok: bool, extra_errors: list[dict] | None = None) -> None:
            finished = await session.get(CatalogueRun, run_id)
            done = sum(1 for s in series if s["complete"])
            await finish_run(
                session,
                finished,
                ok=ok,
                rows_seen=len(series),
                rows_changed=sum(s["written"] for s in series),
                items_synced=done,
                unresolved_remaining=len(rows) - done,
                short_run=(remaining <= 0 or rate_limited) and done < len(rows),
                errors=errors + (extra_errors or []),
            )
            await session.commit()

        try:
            for (row_id,) in rows:
                if remaining <= 0:
                    break
                # A fresh row each time: an earlier series' rollback expires
                # every object the session holds.
                item = await session.get(Item, row_id)
                if item is None:
                    continue
                item_id = str(row_id)
                result = await sync_series(session, adapter, item, remaining, today)
                remaining -= result.requests
                entry = {
                    "id": item_id,
                    "requests": result.requests,
                    "written": result.written,
                    "complete": result.complete,
                }
                if result.error:
                    entry["error"] = result.error
                    errors.append(
                        {
                            "code": "rate_limited"
                            if result.rate_limited
                            else "source_error",
                            "detail": result.error,
                            "item_id": item_id,
                        }
                    )
                series.append(entry)
                if result.rate_limited:
                    rate_limited = True
                    break
        except Exception as error:
            await session.rollback()
            await record(
                ok=False,
                extra_errors=[
                    {
                        "code": "exception",
                        "detail": str(error) or type(error).__name__,
                        "item_id": None,
                    }
                ],
            )
            raise
        await record(ok=not any("error" in s for s in series))
        return {
            "ok": not any("error" in s for s in series),
            "series": series,
            "requests": budget - remaining,
        }

    @router.get("/status")
    async def status(session: AsyncSession = Depends(get_session)) -> dict:
        """The issue sync's last run, null before its first. Admin only: it
        is not a job route."""
        run = await session.scalar(
            select(CatalogueRun)
            .where(CatalogueRun.source == RUN_SOURCE)
            .order_by(CatalogueRun.started_at.desc())
            .limit(1)
        )
        return {"issues.last_run": issues_run_summary(run)}

    @router.put("/{item_id}/editions/{slug}/link")
    async def link_edition(
        item_id: uuid.UUID,
        slug: str,
        body: LinkIn,
        session: AsyncSession = Depends(get_session),
    ) -> dict:
        """Links a collected edition to a Comic Vine issue (or unlinks it)."""

        def locate(item: Item) -> tuple[list[dict], dict]:
            editions = [dict(e) for e in item.editions or []]
            slugs = edition_slugs(editions)
            if slug not in slugs:
                raise HTTPException(status_code=404, detail="No such edition")
            edition = editions[slugs.index(slug)]
            for key in LINK_KEYS:
                edition.pop(key, None)
            return editions, edition

        item = await _comic(session, item_id)
        editions, edition = locate(item)
        if body.cv_id is not None:
            await session.rollback()  # no row lock across the request
            try:
                issue = await source().fetch_issue(body.cv_id)
            except SourceError as error:
                raise _http_error_for(error) from error
            if issue is None:
                raise HTTPException(
                    status_code=422, detail="Comic Vine has no such issue"
                )
            item = await _comic(session, item_id)
            editions, edition = locate(item)  # it may have changed meanwhile
            edition.update(
                cv_id=issue.cv_id,
                cover_url=issue.cover_url,
                large_url=issue.large_url,
                description=list(issue.description),
            )
        item.editions = editions
        await sync_marks(session, item)
        await session.commit()
        await session.refresh(item)
        return {"item_id": str(item.id), "editions": item.editions}

    return router
