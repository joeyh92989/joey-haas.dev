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
import time
import uuid
from collections.abc import AsyncIterator
from dataclasses import asdict
from datetime import UTC, date, datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Path, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

import comic_contents
import tags as tag_words
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
    held_ranges,
    load_holds,
    load_holds_many,
    mark_mismatches,
    owned_set,
    parse_ranges,
    plan_mark,
    pull_weeks,
    read_to_of,
    row_run,
    series_from_row,
    sync_marks,
    sync_volumes_from_editions,
    volume_counts,
    volume_reads,
)
from comics_schemas import (
    BackfillOut,
    ComicsStatusOut,
    ComicStateOut,
    ContentsParseIn,
    ContentsParseOut,
    EditionLinkOut,
    IssueHitOut,
    IssuesSyncOut,
    MarkOut,
    PullListOut,
    RefreshAllOut,
    TagsGenerateOut,
    UnfollowRemovedOut,
    UnheldOut,
    VolumeAdminOut,
    VolumeCreateIn,
    VolumeDeletedOut,
    VolumeDeletePreviewOut,
    VolumeHitOut,
    VolumeLinkIn,
    VolumeLinkOut,
    VolumeListItemOut,
    VolumeMarkIn,
    VolumeMoveIn,
    VolumeMoveOut,
    VolumeReplaceIn,
    VolumeStateOut,
    WallOut,
)
from intake.budget import pacific_day, remaining
from items import _apply_detail, _copy_fields, _http_error_for, require_admin
from llm import LLMError
from models import (
    CatalogueRun,
    ComicIssue,
    ComicVolume,
    ComicVolumeCollect,
    Item,
    ItemStatus,
    ItemType,
    OwnedFormat,
)
from physical_sources.catalogue import finish_run, run_failed, start_run
from playthroughs import apply_status
from public_comics import comic_detail, read_marks_count
from public_issues import _line_order, build_wall
from sources.base import SourceError
from sources.cv_text import paragraphs
from sources.registry import adapter_for

logger = logging.getLogger(__name__)

SOURCE = "comicvine"
RUN_SOURCE = "comic_issues"  # the catalogue_runs source of the issue sync
REFRESH_SOURCE = "comic_refresh"  # ... of the followed comics refresh
TAGS_SOURCE = "comic_tags"  # ... of the comic tag job
# The tag job: one model call per series, at most this many a run (the free
# tier's own budget caps it further).
TAG_JOB_DEFAULT = 12
TAG_JOB_MAX = 50
# Unusable answers after which the job stops asking about a series (#232).
TAG_ATTEMPT_LIMIT = 3
# One call may walk the model chain this long, and the whole run stops
# starting new calls after TAG_RUN_SECONDS, under the nightly's 600 s curl.
TAG_CALL_SECONDS = 40.0
# The contents parse's one model call gets the same 40 s.
CONTENTS_CALL_SECONDS = 40.0
TAG_RUN_SECONDS = 480.0


def _monotonic() -> float:
    return time.monotonic()


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


def _state(item: Item, held: list[dict] | None = None) -> dict:
    """A row's comic state after a write, for the page to redraw in place.
    `held` is the owned volumes' `held_ranges`; the routes pass it through
    `_state_of`, so the run counts volumes (#326), not the `editions` mirror."""
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
            item.editions if held is None else held,
            item.read_to,
            item.source_metadata,
        ),
    }


async def _state_of(session: AsyncSession, item: Item) -> dict:
    """`_state` over the item's owned volumes."""
    return _state(item, held_ranges(await load_holds(session, item.id)))


async def _follow_read_to(
    session: AsyncSession, item: Item, result: MarksResult
) -> None:
    """`read_to` is derived from the marks: after a re-sync that changed any,
    recompute it from the rows (the volume routes' tail)."""
    if not (result.rows_changed or result.stubs_added or result.stubs_removed):
        return
    rows = (
        await session.execute(
            select(ComicIssue.number, ComicIssue.owned, ComicIssue.read).where(
                ComicIssue.item_id == item.id
            )
        )
    ).all()
    item.read_to = read_to_of(
        [n for n, owned, _ in rows if owned],
        [n for n, owned, read in rows if owned and read],
    )


def _exception_error(error: BaseException) -> dict:
    """A run's error entry for the exception that ended it."""
    detail = getattr(error, "detail", None) or str(error) or type(error).__name__
    return {"code": "exception", "detail": str(detail), "item_id": None}


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


def tags_run_summary(
    run: CatalogueRun | None, now: datetime | None = None, gave_up: int = 0
) -> dict | None:
    """The Jobs page's view of the comic tag job's last run, null before any.

    failed: the model stopped the run (no model, a model error), the route
    raised, or the run never finished. partial: the budget or the time ran
    out with series left untagged."""
    if run is None:
        return None
    at = (run.finished_at or run.started_at).isoformat()
    if run.ok is False or run_failed(run, now):
        errors = run.errors or []
        if errors:
            detail = errors[0].get("detail") or errors[0].get("code") or "failed"
            note = f"Tagging stopped: {detail}"
        else:
            note = "The run did not finish"
        return {"at": at, "state": "failed", "ok": False, "note": note}
    if run.short_run:
        waiting = run.unresolved_remaining
        noun = "series waits" if waiting == 1 else "series wait"
        return {
            "at": at,
            "state": "partial",
            "ok": True,
            "note": f"Budget spent; {waiting} {noun}",
        }
    summary = {"at": at, "state": "ok", "ok": True}
    if gave_up:
        summary["note"] = (
            f"{gave_up} series given up on after {TAG_ATTEMPT_LIMIT} unusable answers"
        )
    return summary


def create_comics_router(
    factory: async_sessionmaker[AsyncSession],
    registry: dict,
    lock: asyncio.Lock | None = None,
    provider_factory=None,
) -> APIRouter:
    """Builds `/api/comics`. `lock` serialises the ComicVine refreshes, which
    write every followed row; a second refresh meanwhile is a 409.
    `provider_factory` builds the model the tag job asks (None: no model)."""
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

    @router.get("/search", response_model=list[VolumeHitOut])
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

    @router.post("/follow", response_model=ComicStateOut)
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
        return await _state_of(session, item)

    @router.post("/unfollow", response_model=ComicStateOut | UnfollowRemovedOut)
    async def unfollow(body: VolumeIn, session: AsyncSession = Depends(get_session)):
        """Stops following. A followed-only row holding nothing else is
        removed, since Follow is what made it; any other row keeps everything
        but the flag."""
        item = await _by_volume(session, body.external_id)
        if item is None:
            raise HTTPException(status_code=404, detail="Not following that series")
        has_volumes = await session.scalar(
            select(func.count())
            .select_from(ComicVolume)
            .where(ComicVolume.item_id == item.id)
        )
        followed_only = (
            not has_volumes
            and item.owned_format == OwnedFormat.NONE
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
        return await _state_of(session, item)

    @router.post("/want", status_code=201, response_model=ComicStateOut)
    async def want(body: VolumeIn, session: AsyncSession = Depends(get_session)):
        """A public want: no owned copy, as Radar's Want. A followed-only row
        becomes the want; a series already owned is a 409."""
        item = await _by_volume(session, body.external_id)
        if item is None:
            item = await _create(
                session, body.external_id, public=True, following=False
            )
            return await _state_of(session, item)
        if item.owned_format != OwnedFormat.NONE:
            raise HTTPException(status_code=409, detail="Already on your shelf")
        item.is_public = True
        await session.commit()
        await session.refresh(item)
        return await _state_of(session, item)

    @router.get("/pull-list", response_model=PullListOut)
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
        holds = await load_holds_many(session, [row.id for row in rows])
        series = [
            series_from_row(
                str(row.id),
                row.title,
                (row.source_metadata or {}).get("publisher") or row.creator,
                row.issues_owned,
                row.issues_skipped,
                held_ranges(holds[row.id]),
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

    @router.post("/{item_id}/issues/{number}/got", response_model=ComicStateOut)
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
        return await _state_of(session, item)

    @router.post("/{item_id}/issues/{number}/skip", response_model=ComicStateOut)
    async def skip(
        item_id: uuid.UUID,
        number: IssueNumber,
        session: AsyncSession = Depends(get_session),
    ) -> dict:
        """Records the issue as skipped: off the pull list, a gap on the bar."""
        item = await _comic(session, item_id)
        await sync_volumes_from_editions(session, item)
        held = held_ranges(await load_holds(session, item.id))
        if number in owned_set(item.issues_owned, held):
            raise HTTPException(status_code=409, detail=f"#{number} is already owned")
        skipped = expand(parse_ranges(item.issues_skipped)) | {number}
        changes = _copy_fields({"issues_skipped": format_ranges(skipped)}, item)
        for field, value in changes.items():
            setattr(item, field, value)
        await sync_marks(session, item)
        await session.commit()
        await session.refresh(item)
        return await _state_of(session, item)

    @router.post("/{item_id}/issues/{number}/mark", response_model=MarkOut)
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
        await sync_volumes_from_editions(session, item)
        held = held_ranges(await load_holds(session, item.id))
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
                change = plan_mark(owned, skipped, held, reads, each, body.state)
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
        return (await _state_of(session, item)) | {
            "number": number,
            "state": body.state,
            "previous": {k: v for k, v in before.items() if after[k] != v} or None,
        }

    @router.get("/{item_id}/wall", response_model=WallOut)
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
        read_numbers = set(
            await session.scalars(
                select(ComicIssue.number).where(
                    ComicIssue.item_id == item_id,
                    ComicIssue.owned.is_(True),
                    ComicIssue.read.is_(True),
                )
            )
        )
        holds = await load_holds(session, item_id)
        return {
            "wall": built,
            "comic": comic_detail(
                item,
                today,
                await read_marks_count(session, item_id),
                volumes=volume_counts(holds, read_numbers, item.read_to),
            ),
        }

    @router.post("/marks/backfill", response_model=BackfillOut)
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
                held_ranges(await load_holds(session, item.id)),
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

    async def _record_run(session: AsyncSession, run_id, **fields) -> None:
        """Finishes the run row `start_run` committed."""
        finished = await session.get(CatalogueRun, run_id)
        await finish_run(session, finished, **fields)
        await session.commit()

    @router.post("/refresh", response_model=RefreshAllOut)
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
        # The run row is committed at once, so the refresh's per-series
        # commits and rollbacks cannot take it along; it is re-read by id to
        # finish.
        run = await start_run(session, REFRESH_SOURCE)
        run_id = run.id
        await session.commit()
        try:
            summary = await _refresh_followed(session)
        except BaseException as error:
            await session.rollback()
            await _record_run(
                session,
                run_id,
                ok=False,
                errors=[_exception_error(error)],
            )
            raise
        errors = [
            {
                "code": "source_error",
                "detail": f"{e['title']}: {e['error']}",
                "item_id": e["item_id"],
            }
            for e in summary["errors"]
        ]
        await _record_run(
            session,
            run_id,
            ok=summary["ok"],
            rows_seen=summary["refreshed"] + len(errors),
            rows_changed=summary["refreshed"],
            errors=errors,
        )
        return summary

    async def _refresh_followed(session: AsyncSession) -> dict:
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

    @router.post("/{item_id}/refresh", response_model=ComicStateOut)
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
        return await _state_of(session, item)

    @router.get("/issues/search", response_model=list[IssueHitOut])
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

    @router.post("/tags/generate", response_model=TagsGenerateOut)
    async def generate_tags(
        budget: int = Query(TAG_JOB_DEFAULT, ge=1, le=TAG_JOB_MAX),
        _lock=Depends(exclusive),
        session: AsyncSession = Depends(get_session),
    ) -> dict:
        """Runs the tag job and records it as a `comic_tags` run for the
        Jobs page (see `_generate_tags` for what the job does)."""
        run = await start_run(session, TAGS_SOURCE)
        run_id = run.id
        await session.commit()
        try:
            summary = await _generate_tags(budget, session)
        except BaseException as error:
            await session.rollback()
            await _record_run(
                session, run_id, ok=False, errors=[_exception_error(error)]
            )
            raise
        errors = [
            {
                "code": "tag_error",
                "detail": f"{e['title']}: {e['error']}" if e["title"] else e["error"],
                "item_id": e["id"],
            }
            for e in summary["errors"]
        ]
        if not summary["ok"] and errors:
            # The stop is the last error appended; the Jobs note names it.
            errors.insert(0, errors.pop())
        await _record_run(
            session,
            run_id,
            ok=summary["ok"],
            rows_seen=summary["tagged"] + summary["waiting"],
            rows_changed=summary["tagged"],
            unresolved_remaining=summary["waiting"],
            short_run=summary["stopped"] in ("budget", "time")
            and summary["waiting"] > 0,
            errors=errors,
        )
        return summary

    async def _generate_tags(budget: int, session: AsyncSession) -> dict:
        """Tags public series that have none, one model call each, oldest
        title first (the nightly step, after the issue sync).

        The model answers with indices into tags.py's vocabulary, so it can
        only choose a tag, never invent one. At most `budget` series, and
        never past what the free tier has left today (the reader's reserve
        is kept back). A series whose tags the owner saved is never taken,
        and the row is re-read under lock before the write, so an edit made
        during the call wins. A model error stops the run (the next call
        would meet the same wall); an unusable answer leaves that series
        untagged for the next night, and the third strike (`tag_attempts`) gives
        the series up: it leaves the queue and is listed in `gave_up`."""
        if provider_factory is None:
            raise HTTPException(status_code=503, detail="No model is configured")
        left = await remaining(session, day=pacific_day(datetime.now(UTC)))
        rows = (
            await session.execute(
                select(Item.id)
                .where(
                    Item.type == ItemType.COMIC,
                    Item.is_public.is_(True),
                    Item.tags_edited.is_(False),
                    Item.tag_attempts < TAG_ATTEMPT_LIMIT,
                    func.jsonb_array_length(Item.tags) == 0,
                )
                .order_by(Item.title, Item.id)
            )
        ).all()
        queue = [row_id for (row_id,) in rows]
        allowed = min(budget, left)
        tagged: list[dict] = []
        errors: list[dict] = []
        gave_up: list[dict] = []
        calls = 0
        stopped: str | None = "budget" if allowed < len(queue) else None
        if not queue:
            stopped = None
        provider = None
        if queue and allowed > 0:
            try:
                provider = provider_factory()
            except LLMError as error:
                logger.warning("comic tags: no model: %s", error)
                errors.append({"id": None, "title": None, "error": str(error)})
                stopped = "no model"
        started = _monotonic()
        for row_id in queue[:allowed] if provider is not None else ():
            if _monotonic() - started >= TAG_RUN_SECONDS:
                stopped = "time"
                break
            item = await session.get(Item, row_id)
            if item is None:
                continue
            metadata = item.source_metadata or {}
            prompt = tag_words.comic_prompt(
                item.title,
                metadata.get("publisher") or item.creator,
                metadata.get("start_year") or item.year,
                metadata.get("issue_count"),
                paragraphs(metadata.get("description")),
            )
            title = item.title
            await session.rollback()  # no transaction open across the call
            calls += 1
            try:
                payload = await provider.complete_json(
                    prompt, tag_words.COMIC_SCHEMA, budget_seconds=TAG_CALL_SECONDS
                )
            except LLMError as error:
                logger.warning("comic tags: model call failed for %s: %s", title, error)
                errors.append({"id": str(row_id), "title": title, "error": str(error)})
                stopped = "model error"
                break
            result = tag_words.comic_tags_from(payload)
            fresh = await session.get(Item, row_id, with_for_update=True)
            if fresh is None or fresh.tags_edited or fresh.tags:
                await session.rollback()
                continue
            if result is None:
                errors.append(
                    {"id": str(row_id), "title": title, "error": "unusable answer"}
                )
                fresh.tag_attempts += 1
                if fresh.tag_attempts >= TAG_ATTEMPT_LIMIT:
                    gave_up.append({"id": str(row_id), "title": title})
                await session.commit()
                continue
            fresh.tags = result
            await session.commit()
            tagged.append({"id": str(row_id), "title": title, "tags": result})
        summary = {
            "tagged": len(tagged),
            "failed": len(errors),
            # False on a stop that says the night's tagging did not run, so
            # the nightly's jq check warns.
            "ok": stopped not in ("model error", "no model"),
            "calls": calls,
            "budget": left,
            "waiting": len(queue) - len(tagged) - len(gave_up),
            "gave_up": gave_up,
            "stopped": stopped,
            "series": tagged,
            "errors": errors,
        }
        logger.info(
            "comic tags: %s tagged, %s failed, %s waiting (%s)",
            summary["tagged"],
            summary["failed"],
            summary["waiting"],
            stopped or "done",
        )
        return summary

    @router.post("/issues/sync", response_model=IssuesSyncOut)
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

    @router.get("/status", response_model=ComicsStatusOut)
    async def status(session: AsyncSession = Depends(get_session)) -> dict:
        """The last run of the issue sync, the followed comics refresh and
        the tag job, each null before its first. Admin only: it is not a
        job route."""
        run = await session.scalar(
            select(CatalogueRun)
            .where(CatalogueRun.source == RUN_SOURCE)
            .order_by(CatalogueRun.started_at.desc())
            .limit(1)
        )
        refresh = await session.scalar(
            select(CatalogueRun)
            .where(CatalogueRun.source == REFRESH_SOURCE)
            .order_by(CatalogueRun.started_at.desc())
            .limit(1)
        )
        tags = await session.scalar(
            select(CatalogueRun)
            .where(CatalogueRun.source == TAGS_SOURCE)
            .order_by(CatalogueRun.started_at.desc())
            .limit(1)
        )
        given_up = await session.scalar(
            select(func.count())
            .select_from(Item)
            .where(
                Item.type == ItemType.COMIC,
                Item.is_public.is_(True),
                Item.tags_edited.is_(False),
                Item.tag_attempts >= TAG_ATTEMPT_LIMIT,
                func.jsonb_array_length(Item.tags) == 0,
            )
        )
        return {
            "issues.last_run": issues_run_summary(run),
            "refresh.last_run": issues_run_summary(refresh),
            "tags.last_run": tags_run_summary(tags, gave_up=given_up or 0),
        }

    @router.patch("/volumes/{volume_id}", response_model=VolumeStateOut)
    async def mark_volume(
        volume_id: uuid.UUID,
        body: VolumeMarkIn,
        session: AsyncSession = Depends(get_session),
    ) -> dict:
        """Owns, disowns, reads or unreads a volume: its own write, kept across
        reloads. The marks follow (#326): every row the volume's linked
        collects touch is re-synced, its own title and any other series it
        links into, and a volume marked read marks those issues read (unread
        takes them back, unless another read volume still covers them)."""
        changes = body.model_dump(exclude_none=True)
        if not changes:
            raise HTTPException(status_code=422, detail="Send owned or read")
        # Items first, in id order, then the volume: the order the sibling
        # routes lock in. The volume is peeked unlocked to learn which items.
        peek = await session.get(ComicVolume, volume_id)
        if peek is None:
            raise HTTPException(status_code=404, detail="No such volume")
        linked = await session.scalars(
            select(ComicVolumeCollect.item_id).where(
                ComicVolumeCollect.volume_id == volume_id,
                ComicVolumeCollect.item_id.is_not(None),
                ComicVolumeCollect.from_number.is_not(None),
                ComicVolumeCollect.to_number.is_not(None),
            )
        )
        touched = sorted({peek.item_id, *linked}, key=str)
        items = []
        for each in touched:
            row = await session.get(Item, each, with_for_update=True)
            if row is not None and row.type == ItemType.COMIC:
                # The volume may be one the shim is about to drop or rename.
                await sync_volumes_from_editions(session, row)
                items.append(row)
        volume = await session.get(
            ComicVolume, volume_id, with_for_update=True, populate_existing=True
        )
        if volume is None:
            await session.commit()
            raise HTTPException(status_code=404, detail="No such volume")
        read_changed = "read" in changes and changes["read"] != volume.read
        for field, value in changes.items():
            setattr(volume, field, value)
        await session.flush()
        for item in items:
            holds = await load_holds(session, item.id)
            mine = next((h for h in holds if h.volume_id == volume.id), None)
            if read_changed and mine is not None:
                covered = expand(mine.ranges)
                reads = set(
                    await session.scalars(
                        select(ComicIssue.number).where(
                            ComicIssue.item_id == item.id,
                            ComicIssue.read.is_(True),
                        )
                    )
                )
                if volume.read and volume.owned:
                    reads |= covered
                elif not volume.read:
                    # Only what nothing else still reads: a single of its own,
                    # or another owned volume that is read.
                    keep = expand(parse_ranges(item.issues_owned)) | volume_reads(holds)
                    reads -= covered - keep
                result = await sync_marks(session, item, reads=reads)
            else:
                result = await sync_marks(session, item)
            await _follow_read_to(session, item, result)
        own = next((i for i in items if i.id == volume.item_id), None)
        run = None
        if own is not None:
            run = row_run(
                own.issues_owned,
                own.issues_skipped,
                held_ranges(await load_holds(session, own.id)),
                own.read_to,
                own.source_metadata,
            )
        await session.commit()
        await session.refresh(volume)
        return {
            "id": str(volume.id),
            "item_id": str(volume.item_id),
            "slug": volume.slug,
            "label": volume.label,
            "kind": volume.kind,
            "owned": volume.owned,
            "read": volume.read,
            "comic_run": run,
            "touched": [str(i.id) for i in items],
        }

    # --- The admin volume editor (#334) ---------------------------------------
    # Every write locks the touched `items` rows first, in sorted id order,
    # then the volume (the order PATCH /volumes/{id} and the item routes use),
    # runs the compat shim on each touched title before reading volumes, and
    # ends in `sync_marks` for every touched title: the old and the new link
    # targets, the old and the new title.

    async def _linked_ids(session: AsyncSession, volume_id: uuid.UUID) -> set:
        return set(
            await session.scalars(
                select(ComicVolumeCollect.item_id).where(
                    ComicVolumeCollect.volume_id == volume_id,
                    ComicVolumeCollect.item_id.is_not(None),
                )
            )
        )

    async def _lock_titles(session: AsyncSession, ids: set) -> dict:
        """Locks the comic rows among `ids` in sorted order and runs the shim
        on each; returns {id: Item} for those that exist and are comics."""
        items: dict = {}
        for each in sorted(ids, key=str):
            row = await session.get(Item, each, with_for_update=True)
            if row is not None and row.type == ItemType.COMIC:
                await sync_volumes_from_editions(session, row)
                items[each] = row
        return items

    async def _lock_volume(
        session: AsyncSession, volume_id: uuid.UUID, extra: set = frozenset()
    ) -> tuple[ComicVolume, dict]:
        """Items first (the volume's title, its collects' targets, `extra`),
        then the volume. 404 when the volume is gone, also after the shim
        dropped it; 409 when it moved to another title meanwhile."""
        peek = await session.get(ComicVolume, volume_id)
        if peek is None:
            raise HTTPException(status_code=404, detail="No such volume")
        linked = await _linked_ids(session, volume_id)
        items = await _lock_titles(session, {peek.item_id, *linked, *extra})
        volume = await session.get(
            ComicVolume, volume_id, with_for_update=True, populate_existing=True
        )
        if volume is None:
            await session.commit()  # keep what the shim did
            raise HTTPException(status_code=404, detail="No such volume")
        if volume.item_id != peek.item_id or not (
            await _linked_ids(session, volume_id) <= set(items) | {None}
        ):
            await session.rollback()
            raise HTTPException(
                status_code=409, detail="The volume changed meanwhile; reload it"
            )
        return volume, items

    async def _finish(session: AsyncSession, items: dict) -> list[str]:
        """sync_marks for every touched title (sorted), then commit."""
        for each in sorted(items, key=str):
            result = await sync_marks(session, items[each])
            await _follow_read_to(session, items[each], result)
        await session.commit()
        return [str(each) for each in sorted(items, key=str)]

    def _drop_edition_entry(item: Item, volume: ComicVolume) -> bool:
        """An edition-origin volume (`ed-*`, edited or not) stands for an entry
        of `items.editions`: take the entry out, so the shim cannot recreate
        the volume where it was. The entry is the one `edition_slugs` gives
        the volume's slug over the CURRENT list; none matching (range edited
        away, already removed) is a quiet False."""
        if not volume.slug.startswith("ed-"):
            return False
        editions = [dict(e) for e in item.editions or [] if isinstance(e, dict)]
        slugs = edition_slugs(editions)
        if volume.slug not in slugs:
            return False
        del editions[slugs.index(volume.slug)]
        item.editions = editions
        return True

    async def _free_slug(session: AsyncSession, item_id: uuid.UUID) -> str:
        taken = set(
            await session.scalars(
                select(ComicVolume.slug).where(ComicVolume.item_id == item_id)
            )
        )
        n = 1
        while f"vol-{n}" in taken:
            n += 1
        return f"vol-{n}"

    async def _next_position(session: AsyncSession, item_id: uuid.UUID) -> int:
        top = await session.scalar(
            select(func.max(ComicVolume.position)).where(ComicVolume.item_id == item_id)
        )
        return 0 if top is None else top + 1

    async def _view(session: AsyncSession, volume: ComicVolume) -> dict:
        title = await session.get(Item, volume.item_id)
        rows = (
            await session.execute(
                select(ComicVolumeCollect, Item)
                .outerjoin(Item, Item.id == ComicVolumeCollect.item_id)
                .where(ComicVolumeCollect.volume_id == volume.id)
                .order_by(ComicVolumeCollect.position)
            )
        ).all()
        line = sorted(
            await session.scalars(
                select(ComicVolume).where(ComicVolume.item_id == volume.item_id)
            ),
            key=_line_order,
        )
        index = next(i for i, v in enumerate(line) if v.id == volume.id)

        def neighbour(other: ComicVolume | None) -> dict | None:
            if other is None:
                return None
            return {
                "id": str(other.id),
                "slug": other.slug,
                "label": other.label,
                "line_number": other.line_number,
                "owned": other.owned,
            }

        mine = next(
            (h for h in await load_holds(session, volume.item_id)
             if h.volume_id == volume.id),
            None,
        )  # fmt: skip
        ranges = mine.ranges if mine is not None else ()
        return {
            "id": str(volume.id),
            "item_id": str(volume.item_id),
            "slug": volume.slug,
            "position": volume.position,
            "label": volume.label,
            "kind": volume.kind,
            "kind_raw": volume.kind_raw,
            "line_number": volume.line_number,
            "isbn": volume.isbn,
            "pages": volume.pages,
            "description": volume.description,
            "cover_url": volume.cover_url,
            "large_url": volume.large_url,
            "cv_id": volume.cv_id,
            "owned": volume.owned,
            "read": volume.read,
            "edited": volume.edited,
            "created_at": volume.created_at.isoformat(),
            "title": {
                "id": str(title.id),
                "title": title.title,
                "is_public": title.is_public,
            },
            "collects": [
                {
                    "id": str(collect.id),
                    "position": collect.position,
                    "series_name": collect.series_name,
                    "issue_text": collect.issue_text,
                    "source": collect.source,
                    "link": None
                    if target is None
                    else {
                        "item_id": str(target.id),
                        "title": target.title,
                        "from_number": collect.from_number,
                        "to_number": collect.to_number,
                        "is_public": target.is_public,
                    },
                }
                for collect, target in rows
            ],
            "prev": neighbour(line[index - 1] if index > 0 else None),
            "next": neighbour(line[index + 1] if index + 1 < len(line) else None),
            "held_issues": format_ranges(ranges) or None,
            "held_count": len(expand(ranges)),
        }

    async def _apply_parsed(
        session: AsyncSession,
        volume: ComicVolume,
        title: Item,
        found: list[comic_contents.Entry],
    ) -> tuple[int, int]:
        """Replaces this volume's `parsed` entries with `found`; returns
        (added, replaced). Typed, migrated and photo entries are never read
        for change or removed, and a new entry equal to one of them (same
        normalised series, same issue text) is skipped. An entry with no
        series takes the title's name; one of the title's own series with
        one plain range or number is linked to the title (the only
        auto-link), everything else is text. Nothing found changes nothing,
        so an earlier parse is never lost to a worse one."""
        if not found:
            return 0, 0
        existing = list(
            await session.scalars(
                select(ComicVolumeCollect)
                .where(ComicVolumeCollect.volume_id == volume.id)
                .order_by(ComicVolumeCollect.position)
            )
        )
        kept = [row for row in existing if row.source != "parsed"]
        old = [row for row in existing if row.source == "parsed"]

        def key(series: str, issues: str) -> tuple[str, str]:
            return comic_contents.normalize_name(series), " ".join(
                issues.lower().split()
            )

        taken = {key(row.series_name, row.issue_text) for row in kept}
        own = comic_contents.normalize_name(title.title)
        position = max((row.position for row in kept), default=-1) + 1
        fresh: list[ComicVolumeCollect] = []
        for entry in found:
            series = entry.series_name or title.title
            if key(series, entry.issue_text) in taken:
                continue
            taken.add(key(series, entry.issue_text))
            plain = comic_contents.plain_range(entry.issue_text)
            linked = plain is not None and comic_contents.normalize_name(series) == own
            fresh.append(
                ComicVolumeCollect(
                    id=uuid.uuid4(),
                    volume_id=volume.id,
                    position=position,
                    series_name=series,
                    issue_text=entry.issue_text,
                    source="parsed",
                    item_id=title.id if linked else None,
                    from_number=plain[0] if linked else None,
                    to_number=plain[1] if linked else None,
                )
            )
            position += 1
        for row in old:
            await session.delete(row)
        await session.flush()
        session.add_all(fresh)
        volume.edited = True
        await session.flush()
        return len(fresh), len(old)

    async def _model_contents(
        session: AsyncSession, text: str
    ) -> tuple[list[comic_contents.Entry], bool, str | None]:
        """The fallback: (entries, a call was made, reason). One call, no
        retry, only inside the free tier's budget. Whatever goes wrong is a
        reason, never an error for the owner."""
        if provider_factory is None:
            return [], False, "model_error"
        left = await remaining(session, day=pacific_day(datetime.now(UTC)))
        if left <= 0:
            return [], False, "budget"
        try:
            provider = provider_factory()
        except LLMError as error:
            logger.warning("comic contents: no model: %s", error)
            return [], False, "model_error"
        await session.rollback()  # no transaction open across the call
        try:
            payload = await provider.complete_json(
                comic_contents.model_prompt(text),
                comic_contents.CONTENTS_SCHEMA,
                budget_seconds=CONTENTS_CALL_SECONDS,
            )
        except Exception as error:  # noqa: BLE001 -- a reason, never a 500
            logger.warning("comic contents: model call failed: %s", error)
            return [], True, "model_error"
        found = comic_contents.validate_model(payload, text)
        return found, True, None if found else "no_match"

    @router.post("/volumes/{volume_id}/contents/parse", response_model=ContentsParseOut)
    async def parse_volume_contents(
        volume_id: uuid.UUID,
        body: ContentsParseIn,
        session: AsyncSession = Depends(get_session),
    ) -> dict:
        """Reads the volume's contents from its description and the owner's
        pasted reprint note: rules first, then (only when they find nothing
        and the budget allows) one validated model call. Replaces only this
        volume's `parsed` entries; see `_apply_parsed`. The model call runs
        before any row lock, so no lock is held across it; the write then
        locks items first, then the volume, like its siblings."""
        peek = await session.get(ComicVolume, volume_id)
        if peek is None:
            raise HTTPException(status_code=404, detail="No such volume")
        text = "\n\n".join(
            part.strip()
            for part in (peek.description, body.note)
            if part and part.strip()
        )
        found: list[comic_contents.Entry] = []
        used_model, reason = False, None
        if not text:
            reason = "no_text"
        else:
            found = comic_contents.parse_contents(text)
            if not found:
                found, used_model, reason = await _model_contents(session, text)
        added = replaced = 0
        volume, items = await _lock_volume(session, volume_id)
        if reason is None or reason == "no_match":
            title = items.get(volume.item_id)
            if title is not None:
                added, replaced = await _apply_parsed(session, volume, title, found)
            if not found:
                reason = "no_match"
        if added or replaced:
            await _finish(session, items)
            await session.refresh(volume)
        else:
            await session.commit()  # keep what the shim did
        view = await _view(session, volume)
        return {
            "entries_added": added,
            "entries_replaced": replaced,
            "used_model": used_model,
            "reason": reason if not (added or replaced) else None,
            "collects": view["collects"],
        }

    @router.get("/volumes/{volume_id}", response_model=VolumeAdminOut)
    async def get_volume(
        volume_id: uuid.UUID, session: AsyncSession = Depends(get_session)
    ) -> dict:
        """The whole admin view of one volume, private data included."""
        volume = await session.get(ComicVolume, volume_id)
        if volume is None:
            raise HTTPException(status_code=404, detail="No such volume")
        return await _view(session, volume)

    @router.get("/{item_id}/volumes", response_model=list[VolumeListItemOut])
    async def list_volumes(
        item_id: uuid.UUID, session: AsyncSession = Depends(get_session)
    ) -> list[dict]:
        """A title's books in line order (numbered books by number, the rest
        after them), owned or not, for the admin Books panel."""
        if await session.get(Item, item_id) is None:
            raise HTTPException(status_code=404, detail="No such comic")
        counts = dict(
            (
                await session.execute(
                    select(ComicVolumeCollect.volume_id, func.count())
                    .join(ComicVolume, ComicVolume.id == ComicVolumeCollect.volume_id)
                    .where(ComicVolume.item_id == item_id)
                    .group_by(ComicVolumeCollect.volume_id)
                )
            ).all()
        )
        volumes = sorted(
            await session.scalars(
                select(ComicVolume).where(ComicVolume.item_id == item_id)
            ),
            key=_line_order,
        )
        return [
            {
                "id": str(v.id),
                "slug": v.slug,
                "label": v.label,
                "kind": v.kind,
                "line_number": v.line_number,
                "owned": v.owned,
                "read": v.read,
                "edited": v.edited,
                "collects_count": counts.get(v.id, 0),
                "cover_url": v.cover_url,
            }
            for v in volumes
        ]

    @router.post("/{item_id}/volumes", status_code=201, response_model=VolumeAdminOut)
    async def create_volume(
        item_id: uuid.UUID,
        body: VolumeCreateIn,
        session: AsyncSession = Depends(get_session),
    ) -> dict:
        """Adds a book to a comic title by hand: slug `vol-<n>` (the smallest
        free n), last in the order, `edited` from the start."""
        items = await _lock_titles(session, {item_id})
        if item_id not in items:
            raise HTTPException(status_code=404, detail="No such comic")
        volume = ComicVolume(
            id=uuid.uuid4(),
            item_id=item_id,
            slug=await _free_slug(session, item_id),
            position=await _next_position(session, item_id),
            edited=True,
            **body.model_dump(),
        )
        session.add(volume)
        await session.flush()
        await _finish(session, items)
        await session.refresh(volume)
        return await _view(session, volume)

    def _refuse(index: int, tail: list, message: str) -> HTTPException:
        """A 422 shaped like FastAPI's own, so the UI reads one format."""
        return HTTPException(
            status_code=422,
            detail=[
                {
                    "loc": ["body", "collects", index, *tail],
                    "msg": message,
                    "type": "value_error",
                }
            ],
        )

    @router.put("/volumes/{volume_id}", response_model=VolumeAdminOut)
    async def replace_volume(
        volume_id: uuid.UUID,
        body: VolumeReplaceIn,
        session: AsyncSession = Depends(get_session),
    ) -> dict:
        """Replaces the editable fields and the whole contents list. An entry
        sent back with its id and unchanged keeps its stored source; a new or
        changed one is `typed`. Order is the array's. Every touched title is
        re-synced, the old and the new link targets alike."""
        wanted = {c.link.item_id for c in body.collects if c.link is not None}
        volume, items = await _lock_volume(session, volume_id, wanted)
        for index, entry in enumerate(body.collects):
            if entry.link is not None and entry.link.item_id not in items:
                raise _refuse(index, ["link", "item_id"], "No such comic to link to")
        stored = {
            c.id: c
            for c in await session.scalars(
                select(ComicVolumeCollect).where(
                    ComicVolumeCollect.volume_id == volume.id
                )
            )
        }

        def same(row: ComicVolumeCollect, entry) -> bool:
            target = entry.link
            return (
                row.series_name == entry.series_name
                and row.issue_text == entry.issue_text
                and row.item_id == (target.item_id if target else None)
                and row.from_number == (target.from_number if target else None)
                and row.to_number == (target.to_number if target else None)
            )

        plan: list[tuple[ComicVolumeCollect | None, str]] = []
        seen_ids: set = set()
        for index, entry in enumerate(body.collects):
            row = None
            if entry.id is not None:
                if entry.id in seen_ids:
                    raise _refuse(index, ["id"], "This entry is listed twice")
                seen_ids.add(entry.id)
                row = stored.get(entry.id)
                if row is None:
                    raise _refuse(index, ["id"], "No such entry on this volume")
            unchanged = row is not None and same(row, entry)
            if not unchanged and entry.source not in (None, "typed"):
                raise _refuse(
                    index, ["source"], "An entry you add or change is 'typed'"
                )
            plan.append((row, row.source if unchanged else "typed"))
        if body.kind != volume.kind:
            volume.kind_raw = None  # the original text no longer describes it
        for field, value in body.model_dump(exclude={"collects"}).items():
            setattr(volume, field, value)
        volume.edited = True
        keep = {row.id for row, _ in plan if row is not None}
        for row in stored.values():
            if row.id not in keep:
                await session.delete(row)
        await session.flush()
        for index, (entry, (row, source)) in enumerate(
            zip(body.collects, plan, strict=True)
        ):
            target = entry.link
            fields = {
                "position": index,
                "series_name": entry.series_name,
                "issue_text": entry.issue_text,
                "source": source,
                "item_id": target.item_id if target else None,
                "from_number": target.from_number if target else None,
                "to_number": target.to_number if target else None,
            }
            if row is None:
                session.add(
                    ComicVolumeCollect(id=uuid.uuid4(), volume_id=volume.id, **fields)
                )
            else:
                for key, value in fields.items():
                    if getattr(row, key) != value:
                        setattr(row, key, value)
        await session.flush()
        # Every touched title: the old targets (locked above) and the new.
        await _finish(session, items)
        await session.refresh(volume)
        return await _view(session, volume)

    @router.post("/volumes/{volume_id}/move", response_model=VolumeMoveOut)
    async def move_volume(
        volume_id: uuid.UUID,
        body: VolumeMoveIn,
        session: AsyncSession = Depends(get_session),
    ) -> dict:
        """Moves a book to another comic title. It keeps its slug unless the
        new title already has it (then `vol-<n>`), goes last, and counts as
        edited. An un-edited `ed-*` book also leaves the old title's
        `items.editions`, or the shim would recreate it there."""
        volume, items = await _lock_volume(session, volume_id, {body.item_id})
        target = items.get(body.item_id)
        if target is None:
            raise HTTPException(status_code=404, detail="No such comic")
        if volume.item_id == body.item_id:
            raise HTTPException(status_code=422, detail="Already on that title")
        old = items[volume.item_id]
        previous = volume.slug
        _drop_edition_entry(old, volume)
        taken = set(
            await session.scalars(
                select(ComicVolume.slug).where(ComicVolume.item_id == body.item_id)
            )
        )
        slug = (
            previous
            if previous not in taken
            else await _free_slug(session, body.item_id)
        )
        volume.position = await _next_position(session, body.item_id)
        volume.slug = slug
        volume.item_id = body.item_id
        volume.edited = True
        await session.flush()
        touched = await _finish(session, items)
        await session.refresh(volume)
        return {
            "volume": await _view(session, volume),
            "previous_slug": previous,
            "slug_kept": slug == previous,
            "touched": touched,
        }

    @router.get(
        "/volumes/{volume_id}/delete-preview", response_model=VolumeDeletePreviewOut
    )
    async def volume_delete_preview(
        volume_id: uuid.UUID, session: AsyncSession = Depends(get_session)
    ) -> dict:
        """Read-only: what deleting the volume takes with it. Per touched
        title, the issues nothing else would hold (a loose single or another
        owned volume keeps its issues), and how many read marks go with them."""
        volume = await session.get(ComicVolume, volume_id)
        if volume is None:
            raise HTTPException(status_code=404, detail="No such volume")
        title = await session.get(Item, volume.item_id)
        count = await session.scalar(
            select(func.count())
            .select_from(ComicVolumeCollect)
            .where(ComicVolumeCollect.volume_id == volume_id)
        )
        unheld: list[UnheldOut] = []
        lost = 0
        ids = {volume.item_id, *await _linked_ids(session, volume_id)}
        holds_by = await load_holds_many(session, ids)
        for each in sorted(ids, key=str):
            item = await session.get(Item, each)
            if item is None or item.type != ItemType.COMIC:
                continue
            holds = holds_by[each]
            singles = expand(parse_ranges(item.issues_owned))
            others = [h for h in holds if h.volume_id != volume_id]
            now = singles | expand(pair for h in holds if h.owned for pair in h.ranges)
            after = singles | expand(
                pair for h in others if h.owned for pair in h.ranges
            )
            gone = now - after
            if not gone:
                continue
            reads = await session.scalar(
                select(func.count())
                .select_from(ComicIssue)
                .where(
                    ComicIssue.item_id == each,
                    ComicIssue.number.in_(gone),
                    ComicIssue.read.is_(True),
                )
            )
            lost += reads or 0
            unheld.append(
                UnheldOut(
                    item_id=str(each),
                    title=item.title,
                    numbers=format_ranges(gone),
                    count=len(gone),
                )
            )
        return {
            "label": volume.label,
            "title": title.title,
            "collects_count": count or 0,
            "issues_unheld": unheld,
            "read_marks_lost": lost,
        }

    @router.delete("/volumes/{volume_id}", response_model=VolumeDeletedOut)
    async def delete_volume(
        volume_id: uuid.UUID, session: AsyncSession = Depends(get_session)
    ) -> dict:
        """Deletes the volume (its collects go with it). An un-edited `ed-*`
        book also leaves `items.editions`, so the shim cannot bring it back.
        Every title its collects touched is re-synced (the link targets too),
        and loose issue records stay except what the marks recompute."""
        volume, items = await _lock_volume(session, volume_id)
        item_id = volume.item_id
        _drop_edition_entry(items[item_id], volume)
        for collect in await session.scalars(
            select(ComicVolumeCollect).where(ComicVolumeCollect.volume_id == volume_id)
        ):
            session.expunge(collect)  # the delete cascades in the database
        await session.delete(volume)
        await session.flush()
        touched = await _finish(session, items)
        return {"id": str(volume_id), "item_id": str(item_id), "touched": touched}

    @router.put("/volumes/{volume_id}/link", response_model=VolumeLinkOut)
    async def link_volume(
        volume_id: uuid.UUID,
        body: VolumeLinkIn,
        session: AsyncSession = Depends(get_session),
    ) -> dict:
        """Links a volume to a Comic Vine issue (or unlinks it): cover and
        description come from Comic Vine here, never from the client."""
        await _lock_volume(session, volume_id)
        issue = None
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
        volume, items = await _lock_volume(session, volume_id)  # may have changed
        volume.cv_id = issue.cv_id if issue else None
        volume.cover_url = issue.cover_url if issue else None
        volume.large_url = issue.large_url if issue else None
        volume.description = "\n\n".join(issue.description) or None if issue else None
        volume.edited = True
        await session.flush()
        title = items.get(volume.item_id)
        if title is not None and volume.description:
            # Rules only: a link never asks a model and never spends budget.
            # A failure here must not fail the link, so it runs in a savepoint.
            try:
                async with session.begin_nested():
                    await _apply_parsed(
                        session,
                        volume,
                        title,
                        comic_contents.parse_contents(volume.description),
                    )
            except Exception:  # noqa: BLE001 -- the link stands without it
                logger.warning("comic contents: link parse failed", exc_info=True)
        await _finish(session, items)
        await session.refresh(volume)
        return {
            "id": str(volume.id),
            "cv_id": volume.cv_id,
            "cover_url": volume.cover_url,
            "large_url": volume.large_url,
            "description": volume.description,
            "edited": volume.edited,
        }

    @router.put("/{item_id}/editions/{slug}/link", response_model=EditionLinkOut)
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
