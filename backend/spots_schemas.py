"""Response bodies of the spots routes that answered plain dicts:
`spots_routes.py` (status), `spots_weekend_routes.py` (weather job, plan,
constraints, answers) and `spots_candidates_routes.py` (finder job).

Stored `spot_settings` values and job summaries can evolve or be damaged, so
they stay `dict[str, Any]`; the models pin only the keys the code writes.
"""

from __future__ import annotations

from typing import Any, NotRequired, TypedDict

from pydantic import BaseModel, Field


class SpotsStatusOut(BaseModel):
    """`GET /status`. The keys carry dots, so the fields are aliased
    (FastAPI serialises by alias)."""

    candidates_last_run: dict[str, Any] | None = Field(alias="candidates.last_run")
    weather_last_run: dict[str, Any] | None = Field(alias="weather.last_run")


class WeatherRunOut(BaseModel):
    """`POST /weather/refresh`: the summary it also stores."""

    at: str
    state: str
    gridpoint: str
    hours: int


class FinderRunOut(TypedDict):
    """`POST /candidates/refresh`: the summary it also stores. With no anchor
    it holds only `at` and `state`, so the rest are `NotRequired` (the keys
    stay absent, not null)."""

    at: str
    state: str
    found: NotRequired[int]
    after_dedupe: NotRequired[int]
    queued: NotRequired[int]
    new: NotRequired[int]
    ranked_by: NotRequired[str | None]
    note: NotRequired[str | None]


class ConstraintsOut(BaseModel):
    """`planner.Constraints` as stored."""

    kid_along: bool
    bike_if_dry: bool
    max_miles: float | None
    home_by: int | None


class SuggestionOut(BaseModel):
    """`planner.Suggestion`."""

    slot_key: str
    slot: str
    day: str | None
    when: str
    spot_id: str
    name: str
    tags: list[str]
    distance: str | None
    reasons: list[str]
    saved: bool


class SkippedSpotOut(BaseModel):
    spot_id: str
    name: str


class RecentVisitOut(BaseModel):
    id: str
    spot_id: str
    name: str
    visited_on: str


class AskOut(BaseModel):
    """One "Did you go?" prompt: a saved slot whose day has passed."""

    week: str
    slot: str
    spot_id: str
    spot_name: str
    neighbourhood: str | None
    day: str
    slot_label: str


class DidntOut(BaseModel):
    """`POST /plan/didnt`: the asks still open."""

    asks: list[AskOut]


class PlanOut(BaseModel):
    """`GET /plan`. `days` is the planner's own structure; `weather` is the
    stored last-run summary."""

    today: str
    week: str
    days: list[dict[str, Any]]
    suggestions: list[SuggestionOut]
    constraints: ConstraintsOut
    skips: list[SkippedSpotOut]
    weather: dict[str, Any] | None
    recent_visits: list[RecentVisitOut]
    asks: list[AskOut]
    seed: int


class WeekOut(BaseModel):
    """The week's answers (`plan:<iso-week>`): slot to spot id, slot to day,
    the skipped spot ids and the slots answered "Didn't". Values come from a
    stored row, so they stay open."""

    saved: dict[str, Any]
    days: dict[str, Any]
    skips: list[Any]
    didnt: list[Any]
