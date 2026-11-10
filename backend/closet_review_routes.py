"""Review: the cull's deck, its four outcomes, the season turn and due-back.

- **`GET /review`** is the whole page: the deck (`closet.deck` over every
  garment, with the latest opinion batch attached to flagged pieces only),
  the four tiles, the season-turn banner, the packed garments due back,
  the listed garments awaiting Mark sold, and the next turn for the empty
  state. Nothing is stored about the deck itself; it is recomputed.
- **The season turn** in force is the latest turn date on or before today
  (`closet.current_turn`, from the profile). It is *open* until its banner
  is dismissed (`review.dismissed` in `closet_settings`, the turn's date):
  while open, out-of-season pieces are flagged and the banner offers Pack
  all. A Keep decided on or after the turn date keeps the piece out of the
  deck until the next turn.
- **Every outcome writes one `garment_decisions` row** (Keep `kept`, Pack
  away `packed` with its month, Sell `listed`, Donate `donated`, Mark sold
  `sold`) and moves the status (`packed`, `listed`, `gone`). Pack all
  writes one per garment; Unpack all only moves status (no outcome).
- **Undo** is one level deep: each write stores the prior status and
  `back_on` of what it touched and the decision rows it wrote under
  `review.undo` with a fresh token, and `POST /undo` with that token puts
  them back exactly and deletes those rows.
- **The Sunday opinion** (`POST /jobs/opinion`, a job route) asks the
  model once about the deck (`closet_opinion.py`) and replaces
  `opinion.batch`; any failure keeps the last batch, stores nothing new,
  and writes the reason to `opinion.last_run`.

Admin only, at the router, with its own lock for the job.
Spec and plan: docs/planning/2026-11-09-outfit-design.md (PR D, tasks 19-20).
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from collections import Counter
from collections.abc import AsyncIterator, Callable
from datetime import UTC, date, datetime, timedelta
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

import closet
import closet_opinion
from closet_routes import garment_out, load_profile, profile_out
from closet_today_routes import owner_today
from items import require_admin
from llm import LLMError, LLMProvider
from models import (
    ClosetSetting,
    Garment,
    GarmentDecision,
    GarmentImage,
    GarmentOutcome,
    GarmentStatus,
    Wear,
)
from public import OWNER_TZ
from recommendations_routes import _failure_note

logger = logging.getLogger(__name__)

OPINION_STATUS_KEY = "opinion.last_run"
OPINION_BATCH_KEY = "opinion.batch"
DISMISSED_KEY = "review.dismissed"
UNDO_KEY = "review.undo"
WORN_WINDOW_DAYS = 30
# One model call, inside nightly.yml's 300 s curl timeout for this step.
OPINION_BUDGET_S = 240
NO_UNDO = "That can no longer be undone"
# The season a turn closes, for the banner's sentence.
CLOSING = {"autumn": "summer", "spring": "winter"}

Outcome = Literal["keep", "pack", "sell", "donate"]
OUTCOMES: dict[str, tuple[GarmentOutcome, GarmentStatus | None]] = {
    "keep": (GarmentOutcome.KEPT, None),
    "pack": (GarmentOutcome.PACKED, GarmentStatus.PACKED),
    "sell": (GarmentOutcome.LISTED, GarmentStatus.LISTED),
    "donate": (GarmentOutcome.DONATED, GarmentStatus.GONE),
}


class DecisionIn(BaseModel):
    outcome: Outcome
    back_on: date | None = None  # Pack away's month; any day in it


class UndoIn(BaseModel):
    token: str


def _held(row: Garment, wears: int, last: date | None) -> closet.Held:
    owned = row.acquired_on or row.created_at.astimezone(OWNER_TZ).date()
    return closet.Held(
        id=str(row.id),
        name=row.name or f"unnamed {row.category.value}",
        category=row.category.value,
        status=row.status.value,
        primary_color=row.primary_color,
        formality=row.formality,
        seasons=tuple(row.seasons or ()),
        notes=row.notes,
        owned_since=owned,
        wears_12mo=wears,
        last_worn=last,
        back_on=row.back_on,
    )


def _month_name(on: date) -> str:
    return closet.MONTH_NAMES[on.month - 1]


def create_closet_review_router(
    factory: async_sessionmaker[AsyncSession],
    provider_factory: Callable[[], LLMProvider] | None = None,
    lock: asyncio.Lock | None = None,
    today: Callable[[], date] = owner_today,
) -> APIRouter:
    job_lock = lock or asyncio.Lock()
    router = APIRouter(
        prefix="/api/closet",
        tags=["closet"],
        dependencies=[Depends(require_admin)],
    )

    async def get_session() -> AsyncIterator[AsyncSession]:
        async with factory() as session:
            yield session

    # --- reading ------------------------------------------------------------

    async def _setting(session: AsyncSession, key: str) -> dict | None:
        row = await session.get(ClosetSetting, key)
        return row.value if row else None

    async def _put(session: AsyncSession, key: str, value: dict[str, Any]) -> None:
        await session.execute(
            insert(ClosetSetting)
            .values(key=key, value=value)
            .on_conflict_do_update(
                index_elements=[ClosetSetting.key],
                set_={"value": value, "updated_at": func.now()},
            )
        )

    async def _load(
        session: AsyncSession, day: date
    ) -> tuple[list[closet.Held], dict[str, Garment], dict[str, int], dict]:
        """Every tagged garment as the cull sees it, the rows by id, wears
        in twelve months by id, and the last-worn dates."""
        rows = (
            await session.scalars(
                select(Garment)
                .where(Garment.category.is_not(None))
                .order_by(Garment.created_at, Garment.id)
            )
        ).all()
        since = day - timedelta(days=closet.YEAR_DAYS)
        worn = (
            await session.execute(
                select(
                    Wear.garment_id,
                    func.count(Wear.id).filter(Wear.worn_on > since),
                    func.max(Wear.worn_on),
                )
                .where(Wear.worn_on <= day)
                .group_by(Wear.garment_id)
            )
        ).all()
        wears = {str(g): count for g, count, _ in worn}
        last = {str(g): latest for g, _, latest in worn}
        held = [
            _held(row, wears.get(str(row.id), 0), last.get(str(row.id))) for row in rows
        ]
        return held, {str(row.id): row for row in rows}, wears, last

    async def _turn_state(
        session: AsyncSession, day: date, profile: dict[str, Any]
    ) -> tuple[closet.Turn, bool]:
        turn = closet.current_turn(day, profile["spring_turn"], profile["autumn_turn"])
        dismissed = await _setting(session, DISMISSED_KEY)
        is_open = (dismissed or {}).get("turn_on") != turn.on.isoformat()
        return turn, is_open

    async def _kept_since(session: AsyncSession, on: date) -> set[str]:
        ids = await session.scalars(
            select(GarmentDecision.garment_id).where(
                GarmentDecision.outcome == GarmentOutcome.KEPT,
                GarmentDecision.decided_on >= on,
            )
        )
        return {str(i) for i in ids}

    async def _deck(
        session: AsyncSession, day: date
    ) -> tuple[list[closet.Flagged], list[closet.Held], dict[str, Garment], dict]:
        profile = profile_out(await load_profile(session))
        held, rows, wears, last = await _load(session, day)
        turn, is_open = await _turn_state(session, day, profile)
        cards = closet.deck(held, day, is_open, await _kept_since(session, turn.on))
        return cards, held, rows, {"profile": profile, "turn": turn, "open": is_open}

    @router.get("/review")
    async def review(session: AsyncSession = Depends(get_session)) -> dict[str, Any]:
        day = today()
        cards, held, rows, state = await _deck(session, day)
        profile, turn, is_open = state["profile"], state["turn"], state["open"]
        photos = set((await session.scalars(select(GarmentImage.garment_id))).all())
        batch = await _setting(session, OPINION_BATCH_KEY) or {}
        opinions = batch.get("opinions") or {}
        by_id = {h.id: h for h in held}

        def out(garment_id: str) -> dict[str, Any]:
            row = rows[garment_id]
            return garment_out(
                row,
                has_image=row.id in photos,
                wears_12mo=by_id[garment_id].wears_12mo,
                last_worn=by_id[garment_id].last_worn,
            ).model_dump(mode="json")

        members = closet.turn_members(held, day)
        banner = None
        if is_open and members:
            backs = Counter(closet.bring_back(h, day) for h in members)
            banner = {
                "turn": turn.name,
                "turn_on": turn.on.isoformat(),
                "season": CLOSING[turn.name],
                "count": len(members),
                "until": _month_name(backs.most_common(1)[0][0]),
            }
        due = closet.due_back(held, day)
        since = day - timedelta(days=WORN_WINDOW_DAYS)
        worn_30 = await session.scalar(
            select(func.count(func.distinct(Wear.garment_id))).where(
                Wear.worn_on > since, Wear.worn_on <= day
            )
        )
        gone = await session.scalar(
            select(func.count(GarmentDecision.id)).where(
                GarmentDecision.outcome.in_(
                    [GarmentOutcome.SOLD, GarmentOutcome.DONATED]
                ),
                GarmentDecision.decided_on >= date(day.year, 1, 1),
            )
        )
        upcoming = closet.next_turn(day, profile["spring_turn"], profile["autumn_turn"])
        sizes = profile.get("sizes") or {}
        return {
            "day": day.isoformat(),
            "turn": {"name": turn.name, "on": turn.on.isoformat(), "open": is_open},
            "next_turn": closet.roughly(upcoming.on),
            "banner": banner,
            "tiles": {
                "active": sum(1 for h in held if h.status == "active"),
                "worn_30": worn_30 or 0,
                "flagged": len(cards),
                "gone_this_year": gone or 0,
            },
            "deck": [
                {
                    "garment": out(card.held.id),
                    "flags": [
                        {"kind": f.kind, "sentence": f.sentence} for f in card.flags
                    ],
                    "opinion": opinions.get(card.held.id),
                    "suggested": card.suggested,
                    "back_on": card.back_on.isoformat(),
                    "size": sizes.get(card.held.category or ""),
                }
                for card in cards
            ],
            "due_back": [out(h.id) for h in due],
            "listed": [out(h.id) for h in held if h.status == "listed"],
            "opinion_batch_on": batch.get("batch_on"),
        }

    # --- writing ------------------------------------------------------------

    async def _remember(
        session: AsyncSession,
        rows: list[Garment],
        decisions: list[GarmentDecision],
    ) -> str:
        """Store what an undo restores; the caller then changes `rows`."""
        token = uuid.uuid4().hex
        await _put(
            session,
            UNDO_KEY,
            {
                "token": token,
                "garments": [
                    {
                        "id": str(row.id),
                        "status": row.status.value,
                        "back_on": row.back_on.isoformat() if row.back_on else None,
                    }
                    for row in rows
                ],
                "decisions": [str(d.id) for d in decisions],
            },
        )
        return token

    def _decision(
        row: Garment, outcome: GarmentOutcome, day: date, back_on: date | None = None
    ) -> GarmentDecision:
        return GarmentDecision(
            id=uuid.uuid4(),
            garment_id=row.id,
            outcome=outcome,
            decided_on=day,
            back_on=back_on,
        )

    async def _found(session: AsyncSession, garment_id: uuid.UUID) -> Garment:
        row = await session.get(Garment, garment_id)
        if row is None:
            raise HTTPException(status_code=404, detail="No such garment")
        return row

    @router.post("/garments/{garment_id}/decision")
    async def decide(
        garment_id: uuid.UUID,
        body: DecisionIn,
        session: AsyncSession = Depends(get_session),
    ) -> dict[str, Any]:
        """One of the four outcomes on an active garment."""
        day = today()
        row = await _found(session, garment_id)
        if row.status != GarmentStatus.ACTIVE:
            raise HTTPException(
                status_code=409, detail="Only an active garment can be reviewed"
            )
        outcome, status = OUTCOMES[body.outcome]
        back_on = None
        if body.outcome == "pack":
            back_on = body.back_on.replace(day=1) if body.back_on else None
            if back_on is None:
                held = _held(row, 0, None)
                back_on = closet.bring_back(held, day)
            if back_on <= day:
                raise HTTPException(
                    status_code=422, detail="Bring it back in a month still to come"
                )
        decision = _decision(row, outcome, day, back_on)
        token = await _remember(session, [row], [decision])
        session.add(decision)
        if status is not None:
            row.status = status
            row.back_on = back_on
        await session.commit()
        return {"undo": token, "id": str(row.id), "status": row.status.value}

    @router.post("/garments/{garment_id}/sold")
    async def mark_sold(
        garment_id: uuid.UUID, session: AsyncSession = Depends(get_session)
    ) -> dict[str, Any]:
        """A listed garment sold: gone, dated."""
        row = await _found(session, garment_id)
        if row.status != GarmentStatus.LISTED:
            raise HTTPException(
                status_code=409, detail="Only a listed garment can be sold"
            )
        decision = _decision(row, GarmentOutcome.SOLD, today())
        token = await _remember(session, [row], [decision])
        session.add(decision)
        row.status = GarmentStatus.GONE
        row.back_on = None
        await session.commit()
        return {"undo": token, "id": str(row.id), "status": row.status.value}

    @router.post("/pack-all")
    async def pack_all(session: AsyncSession = Depends(get_session)) -> dict[str, Any]:
        """The season turn's Pack all: every active garment out of season,
        packed until its window opens."""
        day = today()
        held, rows, _, _ = await _load(session, day)
        members = closet.turn_members(held, day)
        targets = [rows[h.id] for h in members]
        decisions = [
            _decision(rows[h.id], GarmentOutcome.PACKED, day, closet.bring_back(h, day))
            for h in members
        ]
        token = await _remember(session, targets, decisions)
        for held_piece, decision in zip(members, decisions, strict=True):
            row = rows[held_piece.id]
            session.add(decision)
            row.status = GarmentStatus.PACKED
            row.back_on = decision.back_on
        await session.commit()
        return {"ids": [h.id for h in members], "undo": token}

    @router.post("/unpack-all")
    async def unpack_all(
        session: AsyncSession = Depends(get_session),
    ) -> dict[str, Any]:
        """Packed garments whose month has come, back to active."""
        day = today()
        held, rows, _, _ = await _load(session, day)
        due = closet.due_back(held, day)
        targets = [rows[h.id] for h in due]
        token = await _remember(session, targets, [])
        for row in targets:
            row.status = GarmentStatus.ACTIVE
            row.back_on = None
        await session.commit()
        return {"ids": [h.id for h in due], "undo": token}

    @router.post("/undo")
    async def undo(
        body: UndoIn, session: AsyncSession = Depends(get_session)
    ) -> dict[str, Any]:
        """Put back exactly what the write with this token changed."""
        saved = await _setting(session, UNDO_KEY)
        if not saved or saved.get("token") != body.token:
            raise HTTPException(status_code=409, detail=NO_UNDO)
        restored = []
        for entry in saved.get("garments") or []:
            row = await session.get(Garment, uuid.UUID(entry["id"]))
            if row is None:
                continue
            row.status = GarmentStatus(entry["status"])
            row.back_on = (
                date.fromisoformat(entry["back_on"]) if entry["back_on"] else None
            )
            restored.append(entry["id"])
        ids = [uuid.UUID(d) for d in saved.get("decisions") or []]
        if ids:
            await session.execute(
                delete(GarmentDecision).where(GarmentDecision.id.in_(ids))
            )
        await session.execute(
            delete(ClosetSetting).where(ClosetSetting.key == UNDO_KEY)
        )
        await session.commit()
        return {"ids": restored}

    @router.post("/review/dismiss")
    async def dismiss(session: AsyncSession = Depends(get_session)) -> dict[str, Any]:
        """Close the current turn's banner (and its out-of-season flags)."""
        day = today()
        profile = profile_out(await load_profile(session))
        turn = closet.current_turn(day, profile["spring_turn"], profile["autumn_turn"])
        await _put(session, DISMISSED_KEY, {"turn_on": turn.on.isoformat()})
        await session.commit()
        return {"turn_on": turn.on.isoformat()}

    # --- the Sunday opinion -------------------------------------------------

    async def ask(prompt: str) -> tuple[dict | None, str | None]:
        """One model call, or why there was none. Never raises."""
        if provider_factory is None:
            return None, "No model is configured"
        try:
            provider = provider_factory()
            payload = await asyncio.wait_for(
                provider.complete_json(prompt, closet_opinion.SCHEMA),
                timeout=OPINION_BUDGET_S,
            )
        except LLMError as error:
            logger.warning("closet opinion model call failed: %s", error)
            return None, _failure_note(str(error))
        except TimeoutError:
            return None, "The model ran out of time"
        except Exception as error:  # a malformed answer must not stop the job
            logger.exception("closet opinion model call failed unexpectedly")
            return None, f"The model’s answer couldn’t be read ({type(error).__name__})"
        return payload, None

    async def _opinions(session: AsyncSession, at: str) -> dict[str, Any]:
        day = today()
        cards, held, _, state = await _deck(session, day)
        summary: dict[str, Any] = {"at": at, "ok": True, "flagged": len(cards)}
        if not cards:
            summary.update(state="empty", opinions=0)
        else:
            active = [
                (h.category or "", h.wears_12mo) for h in held if h.status == "active"
            ]
            prompt = closet_opinion.build_prompt(cards, state["profile"], active)
            payload, note = await ask(prompt)
            kept = (
                closet_opinion.validate(payload, cards) if payload is not None else {}
            )
            if payload is not None and not kept and note is None:
                note = "The model’s opinions did not hold up"
            if kept:
                await _put(session, OPINION_BATCH_KEY, closet_opinion.batch(kept, day))
                summary.update(state="ok", opinions=len(kept))
            else:
                # Nothing new is stored: the last batch stands, and the
                # deck is the data's either way.
                summary.update(state="skipped", opinions=0, note=note)
        await _put(session, OPINION_STATUS_KEY, summary)
        await session.commit()
        logger.info("closet opinion: %s", summary)
        return summary

    @router.post("/jobs/opinion")
    async def opinion_job(
        session: AsyncSession = Depends(get_session),
    ) -> dict[str, Any]:
        """The Sunday step: one model call over the flagged deck. Writes
        `opinion.last_run`."""
        if job_lock.locked():
            raise HTTPException(status_code=409, detail="Opinions are already running")
        async with job_lock:
            at = datetime.now(UTC).isoformat()
            try:
                return await _opinions(session, at)
            except Exception as error:
                logger.exception("closet opinion job failed")
                await session.rollback()
                await _put(
                    session,
                    OPINION_STATUS_KEY,
                    {
                        "at": at,
                        "state": "failed",
                        "ok": False,
                        "note": f"{type(error).__name__}: {error}"[:300],
                    },
                )
                await session.commit()
                raise

    return router
