"""Response bodies of the closet admin routes (`closet_routes.py`,
`closet_today_routes.py`, `closet_review_routes.py`).

Each model describes the JSON its route already answers with, key for key.
Where today's body leaves a key out (rather than sending null) the model is
a TypedDict with that key `NotRequired`, so the key stays absent. Open-ended
content (the stored run summaries, a model's tag attributes) stays
`dict[str, Any]`. Request bodies and the routes' own helpers stay beside the
routes.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any, NotRequired, TypedDict

from pydantic import BaseModel, Field

from models import (
    GarmentCategory,
    GarmentColorSource,
    GarmentStatus,
    GarmentTagSource,
)

# --- garments and the profile (closet_routes) -------------------------------


class GarmentOut(BaseModel):
    id: uuid.UUID
    name: str | None
    category: GarmentCategory | None
    subtype: str | None
    brand: str | None
    primary_color: str | None
    primary_hex: str | None
    secondary_color: str | None
    secondary_hex: str | None
    color_name: str | None
    color_source: GarmentColorSource | None
    size: str | None
    pattern: str | None
    material: str | None
    warmth: int | None
    formality: int | None
    seasons: list[int]
    notes: str | None
    acquired_on: date | None
    status: GarmentStatus
    back_on: date | None
    tag_source: GarmentTagSource | None
    tag_attempts: int
    created_at: datetime
    updated_at: datetime
    # The photo's URL, versioned by updated_at so a changed garment is
    # fetched again; null for a garment without one.
    image: str | None
    wears_12mo: int
    last_worn: date | None


class GarmentCountsOut(BaseModel):
    """`total` and one count per `GarmentStatus`."""

    total: int
    untagged: int
    active: int
    packed: int
    listed: int
    gone: int


class GarmentListOut(BaseModel):
    """`GET /garments`."""

    garments: list[GarmentOut]
    counts: GarmentCountsOut


class UploadOut(BaseModel):
    """`POST /garments/photos`."""

    added: int
    garments: list[GarmentOut]


class ProfileOut(BaseModel):
    """`GET` and `PATCH /profile` (`closet_routes.profile_out`)."""

    sizes: dict[str, str]
    coloring: dict[str, str]
    build_fit: str | None
    style_words: list[str]
    dislikes: list[str]
    weekly_occasions: list[str]
    weekly_bike: list[bool]
    spring_turn: str
    autumn_turn: str
    repeat_top_days: int
    repeat_outfit_weeks: int
    tag_budget: int
    occasions: list[str]


class JobStatusOut(BaseModel):
    """`GET /status`. The keys carry dots, so the fields are aliased
    (FastAPI serialises by alias). Each value is the job's stored run
    summary (open JSONB), or null while it has not run."""

    tag_last_run: dict[str, Any] | None = Field(alias="tag.last_run")
    plan_last_run: dict[str, Any] | None = Field(alias="plan.last_run")
    opinion_last_run: dict[str, Any] | None = Field(alias="opinion.last_run")


class TagNowOut(BaseModel):
    """`POST /tag`."""

    tagged: int
    calls: int
    note: str | None
    remaining: int


class TagJobOut(BaseModel):
    """`POST /jobs/tag`: the summary it also stores as `tag.last_run`."""

    at: str
    state: str
    ok: bool
    tagged: int
    calls: int
    remaining: int
    note: str | None


# --- Today (closet_today_routes) ---------------------------------------------


class TileOut(BaseModel):
    """One piece of an outfit, or one swap candidate."""

    slot: str
    id: str
    name: str
    primary_hex: str | None
    secondary_hex: str | None
    image: str | None
    qualifier: str
    transient: bool


class WornGarmentOut(BaseModel):
    slot: str
    id: str


class WornOut(BaseModel):
    """What was worn today (`worn_today`)."""

    id: str
    occasion: str
    bike: bool
    source: str
    garments: list[WornGarmentOut]


class DefaultsOut(BaseModel):
    occasion: str
    bike: bool


class TodayOut(BaseModel):
    """`GET /today`, `POST /plan` and `POST /match`."""

    # The day's plan is the stored body (open JSONB, `make_plan`'s shape, plus
    # `match` on Match this's answer). A stored plan that no longer reads is
    # tolerated and planned again, so it cannot be a strict model.
    plan: dict[str, Any] | None
    planned_just_now: bool
    worn: WornOut | None
    defaults: DefaultsOut
    occasions: list[str]


class CandidatesOut(BaseModel):
    """`GET /candidates`."""

    slot: str
    candidates: list[TileOut]


class WoreOut(BaseModel):
    """`POST /wore`."""

    worn: WornOut | None


class PlanRunOut(BaseModel):
    occasion: str
    ranked_by: str | None
    note: str | None


class PlanJobOut(BaseModel):
    """`POST /jobs/plan`: the summary it also stores as `plan.last_run`."""

    at: str
    state: str
    ok: bool
    day: str
    occasion: str
    bike: bool
    ranked_by: str | None
    note: str | None
    plans: list[PlanRunOut]


# --- Review (closet_review_routes) -------------------------------------------


class TurnOut(BaseModel):
    name: str
    on: str
    open: bool


class BannerOut(BaseModel):
    turn: str
    turn_on: str
    season: str
    count: int
    until: str


class TilesOut(BaseModel):
    active: int
    worn_30: int
    flagged: int
    gone_this_year: int


class FlagOut(BaseModel):
    kind: str
    sentence: str


class CardOut(BaseModel):
    garment: GarmentOut
    flags: list[FlagOut]
    opinion: str | None
    suggested: str
    back_on: str
    size: str | None


class ReviewOut(BaseModel):
    """`GET /review`."""

    day: str
    turn: TurnOut
    next_turn: str
    banner: BannerOut | None
    tiles: TilesOut
    deck: list[CardOut]
    due_back: list[GarmentOut]
    listed: list[GarmentOut]
    opinion_batch_on: str | None


class DecisionOut(BaseModel):
    """`POST /garments/{id}/decision` and `/sold`."""

    undo: str
    id: str
    status: str


class MovedOut(BaseModel):
    """`POST /pack-all` and `/unpack-all`; `undo` is null when nothing moved."""

    ids: list[str]
    undo: str | None


class UndoOut(BaseModel):
    """`POST /undo`."""

    ids: list[str]
    skipped: int


class DismissOut(BaseModel):
    """`POST /review/dismiss`."""

    turn_on: str


class OpinionJobOut(TypedDict):
    """`POST /jobs/opinion`: the summary it also stores as `opinion.last_run`.
    `note` is there only on a run that stored nothing new."""

    at: str
    ok: bool
    flagged: int
    state: str
    opinions: int
    note: NotRequired[str | None]
