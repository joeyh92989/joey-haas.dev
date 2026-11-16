"""Response bodies of the recommendations routes (`recommendations_routes.py`).

Admin-only bodies, described key for key as they are today. Public Radar and
Discover rows are a different shape (`PublicNextRow`); nothing here is
reused for them. Open-ended stored content stays `dict[str, Any]`.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel


class RadarGeneratedOut(BaseModel):
    """`POST /generate` for Radar: the batch and rows per section."""

    batch_id: str
    counts: dict[str, int]
    digital_error: str | None


class DiscoverGeneratedOut(BaseModel):
    """`POST /generate` for Discover."""

    batch_id: str
    count: int
    ranked_by: str
    model_note: str | None


class RecommendationRowOut(BaseModel):
    """A suggestion as the admin page reads it (`_row_out`)."""

    id: str
    title: str
    cover_url: str | None
    release_date: str | None
    release_precision: str | None
    platform: str | None
    physical_format: str | None
    format_note: str | None
    reasons: list[str]
    score: int | float | None
    status: str
    store_lines: list[Any]
    hypes: Any
    lane: str | None
    igdb_url: str | None


class DiscoverPickOut(RecommendationRowOut):
    based_on_titles: list[str]
    genres: list[str]


class DiscoverListOut(BaseModel):
    generated_at: datetime | None
    personalised: bool
    ranked_by: str | None
    model_note: str | None
    picks: list[DiscoverPickOut]


class RadarListOut(BaseModel):
    generated_at: datetime | None
    personalised: bool
    catalogue: dict[str, datetime | None]
    sections: dict[str, list[RecommendationRowOut]]


class StoreListRowOut(RecommendationRowOut):
    top_pick: bool
    new: bool
    kind: str


class StoreListOut(BaseModel):
    generated_at: dict[str, datetime | None]
    catalogue: dict[str, datetime | None]
    sections: dict[str, list[StoreListRowOut]]


class WatchingItemOut(BaseModel):
    id: str
    title: str
    cover_url: str | None
    platform: str | None
    release_date: str | None
    physical_format: str | None


class WatchingPreorderOut(BaseModel):
    store: str
    closes_at: str | None
    price: str | None
    currency: str | None
    url: str | None


class WatchingOut(BaseModel):
    """`GET /watching`: a watched game still to come."""

    item: WatchingItemOut
    preorder: WatchingPreorderOut | None


class ItemAddedOut(BaseModel):
    """Want and Already own: the item the answer created."""

    item_id: str


class AnswerOut(BaseModel):
    """Dismiss and Skip: the status the suggestion now holds."""

    status: str
