"""Response bodies of the remaining routes (#377): the version read, the
admin session check, the analytics admin read and rollup, and the photo
import.

Each model describes the JSON its route already answers with, key for key.
Where today's body leaves a key out (rather than sending null) the model is
a TypedDict with that key `NotRequired`, so the key stays absent.
Redirects and 204 routes carry `response_model=None` at the route instead.
"""

from __future__ import annotations

from datetime import date
from typing import NotRequired, TypedDict

from pydantic import BaseModel


class VersionOut(BaseModel):
    """GET /api/version: read by the deploy workflow and scripts/smoke.sh."""

    commit: str


class MeOut(TypedDict):
    """GET /api/auth/me. Signed in: `email` (plus `signed_in: true` with
    `?quiet=1`). Signed out with `?quiet=1`: `signed_in: false` alone. A
    plain signed-out call is a 401 JSONResponse, which skips the model."""

    email: NotRequired[str]
    signed_in: NotRequired[bool]


class AdminBestDayOut(BaseModel):
    """The admin read keeps the best day's referrer (the public read drops it)."""

    day: date
    views: int
    referrer: str | None


class AdminDayOut(BaseModel):
    day: date
    views: int


class AdminCountOut(BaseModel):
    value: str
    count: int


class AdminSummaryOut(BaseModel):
    """GET /api/analytics: `analytics.summarise`'s body plus the range."""

    range: str
    start: date
    end: date
    views: int
    visitors: int
    # 0 (an int) when there are no visitors, else a rounded float.
    views_per_visitor: float | int
    best_day: AdminBestDayOut | None
    series: list[AdminDayOut]
    pages: list[AdminCountOut]
    referrers: list[AdminCountOut]
    referrers_other: int
    devices: list[AdminCountOut]
    live_since: date


class RollupOut(BaseModel):
    """POST /api/analytics/rollup."""

    days: int
    deleted: int


class ImportCandidateOut(TypedDict):
    """`importer._candidate_json`; publisher and issue_count only when the
    source knows them (Comic Vine)."""

    external_source: str
    external_id: str
    title: str
    year: int | None
    thumbnail_url: str | None
    publisher: NotRequired[str]
    issue_count: NotRequired[int]


class ImportRowOut(BaseModel):
    """One detection, resolved or not (`importer._resolve_one`)."""

    index: int
    detected_title: str
    media_type: str
    detected_year: int | None
    detected_platform: str | None
    platform_id: int | None
    status: str
    confidence: str
    reason: str | None
    match: ImportCandidateOut | None
    candidates: list[ImportCandidateOut]


class ImportPhotosOut(BaseModel):
    """POST /api/import/photos."""

    detections: list[ImportRowOut]
