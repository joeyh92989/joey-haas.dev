"""Intake's nightly step (spec D4), behind `POST /api/intake/jobs/nightly`.

First it expires sittings nobody has touched for `EXPIRE_AFTER` (thirty
days): the sitting, its photos and its entries go together. "Touched" is
the newest `updated_at` of the sitting or anything in it, so a photo read
or an entry checked last week keeps a month-old sitting.

Then it matches again the entries a busy source left `reading`
(`retry_reading`, no model call), and reads waiting shelf photos, oldest
first across sittings, one `read_next` at a time, while the free tier
has calls left above the reserve (`intake.budget`). The budget is read
afresh before every photo, because the recorder counts each call in its
own session. A failed read stops the night (the next photo would most
likely fail the same way, and a failed photo waits for Retry); a missing
model key fails it without a call.

The run's summary is stored as `intake_settings["nightly.last_run"]`
whatever happened, and is what the Jobs page's Intake row reads.
"""

from __future__ import annotations

import logging
import uuid
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import delete, exists, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from config import Config
from intake.budget import budget_state
from intake.reader import read_next, retry_reading
from llm import LLMError, LLMProvider
from models import (
    IntakeArea,
    IntakeEntry,
    IntakePhoto,
    IntakePhotoState,
    IntakeSetting,
    IntakeSitting,
)

logger = logging.getLogger(__name__)

EXPIRE_AFTER = timedelta(days=30)
LAST_RUN_KEY = "nightly.last_run"
NO_MODEL = "No model is configured"


async def expire_sittings(session: AsyncSession, now: datetime) -> tuple[int, int]:
    """Delete sittings untouched since `now - EXPIRE_AFTER`, with their
    photos and entries (FK cascade). Returns `(sittings, photos)` removed.
    The caller commits."""
    cutoff = now - EXPIRE_AFTER
    fresh_photo = exists().where(
        IntakePhoto.sitting_id == IntakeSitting.id, IntakePhoto.updated_at >= cutoff
    )
    fresh_entry = exists().where(
        IntakeEntry.sitting_id == IntakeSitting.id, IntakeEntry.updated_at >= cutoff
    )
    ids = list(
        (
            await session.scalars(
                select(IntakeSitting.id).where(
                    IntakeSitting.updated_at < cutoff, ~fresh_photo, ~fresh_entry
                )
            )
        ).all()
    )
    if not ids:
        return 0, 0
    photos = await session.scalar(
        select(func.count())
        .select_from(IntakePhoto)
        .where(IntakePhoto.sitting_id.in_(ids))
    )
    await session.execute(delete(IntakeSitting).where(IntakeSitting.id.in_(ids)))
    return len(ids), photos or 0


def _waiting_photos():
    return (
        select(IntakePhoto)
        .join(IntakeSitting, IntakeSitting.id == IntakePhoto.sitting_id)
        .where(
            IntakePhoto.state == IntakePhotoState.UPLOADED,
            IntakeSitting.area == IntakeArea.SHELF,
        )
    )


async def _next_sitting(session: AsyncSession) -> uuid.UUID | None:
    photo = await session.scalar(
        _waiting_photos().order_by(IntakePhoto.created_at, IntakePhoto.id).limit(1)
    )
    return photo.sitting_id if photo is not None else None


async def _waiting(session: AsyncSession) -> int:
    return await session.scalar(
        select(func.count()).select_from(_waiting_photos().subquery())
    )


async def run_nightly(
    session: AsyncSession,
    config: Config,
    provider_factory: Callable[[], LLMProvider] | None,
    registry: dict,
    now: datetime | None = None,
) -> dict[str, Any]:
    """Expire, then read within the budget; store and return the summary.

    `state` is `ok` (read until nothing waited), `empty` (nothing to read),
    `waiting` (today's budget ran out with photos left), `stopped` (a read
    failed) or `failed` (no model). `ok` is false for the last two, which
    the workflow reports as a failed step.
    """
    now = now or datetime.now(UTC)
    expired, photos_expired = await expire_sittings(session, now)
    await session.commit()
    # Entries a busy source left `reading` are matched again first: no
    # model call, so it runs whatever the budget says.
    await retry_reading(session, registry)

    read = 0
    state = "empty"
    note: str | None = None
    provider: LLMProvider | None = None
    while (sitting_id := await _next_sitting(session)) is not None:
        budget = await budget_state(session, config)
        left = budget["remaining"] if budget["enforced"] else 1
        if left <= 0:
            state = "waiting"
            break
        if provider is None:
            try:
                if provider_factory is None:
                    raise LLMError("no provider")
                provider = provider_factory()
            except LLMError as error:
                state, note = "failed", f"{NO_MODEL}: {error}"
                break
        outcome = await read_next(
            session, sitting_id, provider, left, registry=registry
        )
        if outcome.status == "failed":
            state = "stopped"
            note = outcome.photo.error if outcome.photo else None
            break
        if outcome.status in ("read", "empty"):
            read += 1
            state = "ok"
        else:  # waiting or idle: the queue moved under us; try again tomorrow
            break

    summary = {
        "at": now.isoformat(),
        "state": state,
        "ok": state not in ("failed", "stopped"),
        "expired": expired,
        "photos_expired": photos_expired,
        "read": read,
        "waiting": await _waiting(session),
        "note": note,
    }
    await session.execute(
        insert(IntakeSetting)
        .values(key=LAST_RUN_KEY, value=summary)
        .on_conflict_do_update(
            index_elements=[IntakeSetting.key],
            set_={"value": summary, "updated_at": func.now()},
        )
    )
    await session.commit()
    logger.info(
        "intake nightly: %s, %d expired, %d read, %d waiting",
        state,
        expired,
        read,
        summary["waiting"],
    )
    return summary
