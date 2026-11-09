"""The weekend planner: three suggestions for the coming Saturday and Sunday.

Pure. Spots, visits and the cached forecast arrive as plain values and the
plan leaves as dataclasses; `today` is passed in, never read, so a test can
stand on any day. The reasons are written here by rule from the forecast,
the tags and the visit history -- the model is not on this page (spec: Key
decisions). `PLANNER` is the one tuning point.

Slots, in order:

1. **Best fit** -- the better day (the longer ride window; Saturday on a
   tie), from the outdoor pool.
2. **Try somewhere new** -- the other day, from spots never visited.
3. **Haven't been in a while** -- either afternoon, the visited spot gone
   longest without a visit.

A day with no ride window turns the slots that would be outdoors on it
into **Snow day** (and **Snow day, quieter**) over the rainy-day pool.

Spec and plan: docs/planning/2026-11-08-denver-spots-design.md.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from dataclasses import dataclass, field
from datetime import date, timedelta

import spots
import weather

PLANNER = {
    # Outdoor score: tag points, then distance, then the visit history.
    "outdoor_tags": {"park": 3.0, "bike-friendly": 2.0, "coffee": 1.0, "food": 1.0},
    "indoor_tags": {"rainy-day": 3.0, "kid-ok": 1.0, "food": 1.0, "coffee": 1.0},
    "mode_points": {"walk": 2.0, "bike": 1.0, "drive or bus": 0.0},
    # With "Bike if dry" on, a bike-friendly spot on a dry day.
    "bike_if_dry": 2.0,
    "never_visited": 1.0,
    # Half a point per month away, up to three.
    "stale_per_30_days": 0.5,
    "stale_cap": 3.0,
    # Somewhere visited this recently is pushed down the list.
    "recent_days": 14,
    "recent_penalty": 6.0,
    # Reroll steps through this many of each slot's best.
    "reroll_depth": 3,
}

SLOT_LABELS = {
    "best": "Best fit",
    "new": "Try somewhere new",
    "while": "Haven't been in a while",
    "snow": "Snow day",
    "snow_quiet": "Snow day, quieter",
}

OUTDOOR = frozenset({"park", "bike-friendly"})
RAINY = "rainy-day"
KID = "kid-ok"


@dataclass(frozen=True)
class PlanSpot:
    id: str
    name: str
    lat: float
    lng: float
    tags: tuple[str, ...] = ()
    anchor: bool = False


@dataclass(frozen=True)
class Constraints:
    """The owner's standing pills. `max_miles` drops what is farther from
    the nearest anchor; `home_by` is a local hour the when-line respects."""

    kid_along: bool = True
    bike_if_dry: bool = True
    max_miles: float | None = None
    home_by: int | None = None

    @classmethod
    def from_blob(cls, blob: Mapping | None) -> Constraints:
        blob = blob or {}
        miles = blob.get("max_miles")
        home = blob.get("home_by")
        return cls(
            kid_along=bool(blob.get("kid_along", True)),
            bike_if_dry=bool(blob.get("bike_if_dry", True)),
            max_miles=float(miles) if isinstance(miles, int | float) else None,
            home_by=home if isinstance(home, int) and 0 < home < 24 else None,
        )


@dataclass(frozen=True)
class Suggestion:
    slot_key: str  # "best", "new" or "while": stable across a snow swap
    slot: str
    day: str | None  # ISO date, or None for "either"
    when: str
    spot_id: str
    name: str
    tags: tuple[str, ...]
    distance: str | None
    reasons: tuple[str, ...]
    saved: bool = False


@dataclass(frozen=True)
class Plan:
    days: list[dict]
    suggestions: list[Suggestion] = field(default_factory=list)


def weekend_of(today: date) -> list[date]:
    """The weekend's days still ahead: Saturday and Sunday, or only Sunday
    when today is Sunday. Monday to Friday look at the coming weekend."""
    if today.weekday() == 6:
        return [today]
    saturday = today + timedelta(days=5 - today.weekday())
    return [saturday, saturday + timedelta(days=1)]


def _part(hour: int) -> str:
    if hour < 10:
        return "morning"
    if hour < 12:
        return "late morning"
    if hour < 17:
        return "afternoon"
    return "evening"


def _ago(days: int) -> str:
    if days <= 1:
        return "yesterday" if days == 1 else "today"
    if days < 14:
        return f"{days} days ago"
    if days < 60:
        return f"{days // 7} weeks ago"
    return f"{days // 30} months ago"


class _Context:
    def __init__(self, spot_rows, visits, constraints, today):
        rows = list(spot_rows)
        self.anchors = [s for s in rows if s.anchor]
        self.today = today
        self.constraints = constraints
        last: dict[str, date] = {}
        for spot_id, visited_on in visits:
            if visited_on <= today and (
                spot_id not in last or visited_on > last[spot_id]
            ):
                last[spot_id] = visited_on
        self.last = last
        self.nearest = {
            s.id: spots.nearest_anchor((s.lat, s.lng), self.anchors) for s in rows
        }
        self.pool = [s for s in rows if not s.anchor and self._near_enough(s)]

    def _near_enough(self, spot: PlanSpot) -> bool:
        limit = self.constraints.max_miles
        near = self.nearest.get(spot.id)
        return limit is None or near is None or near.miles <= limit

    def mode(self, spot: PlanSpot) -> str | None:
        near = self.nearest.get(spot.id)
        return spots.distance_mode(near.miles) if near else None

    def distance(self, spot: PlanSpot) -> str | None:
        near = self.nearest.get(spot.id)
        if near is None:
            return None
        return spots.distance_line(near.miles, near.anchor.name)

    def days_since(self, spot: PlanSpot) -> int | None:
        last = self.last.get(spot.id)
        return None if last is None else (self.today - last).days

    def history(self, spot: PlanSpot) -> float:
        since = self.days_since(spot)
        if since is None:
            return PLANNER["never_visited"]
        points = min(PLANNER["stale_cap"], since / 30 * PLANNER["stale_per_30_days"])
        if since < PLANNER["recent_days"]:
            points -= PLANNER["recent_penalty"]
        return points

    def kid_filter(self, pool: list[PlanSpot]) -> list[PlanSpot]:
        if not self.constraints.kid_along:
            return pool
        kid = [s for s in pool if KID in s.tags]
        return kid or pool

    def visit_reason(self, spot: PlanSpot) -> str:
        since = self.days_since(spot)
        if since is None:
            return "Never logged."
        return f"Last there {_ago(since)}."


def _outdoor_score(ctx: _Context, spot: PlanSpot, dry: bool) -> float:
    score = sum(PLANNER["outdoor_tags"].get(t, 0.0) for t in spot.tags)
    mode = ctx.mode(spot)
    score += PLANNER["mode_points"].get(mode, 0.0) if mode else 0.0
    if dry and ctx.constraints.bike_if_dry and "bike-friendly" in spot.tags:
        score += PLANNER["bike_if_dry"]
    return score + ctx.history(spot)


def _indoor_score(ctx: _Context, spot: PlanSpot) -> float:
    score = sum(PLANNER["indoor_tags"].get(t, 0.0) for t in spot.tags)
    mode = ctx.mode(spot)
    score += PLANNER["mode_points"].get(mode, 0.0) if mode else 0.0
    return score + ctx.history(spot)


def _rank(pool, score, taken) -> list[PlanSpot]:
    # Score first, then name, so a tie is stable whatever order rows came in.
    return sorted(
        (s for s in pool if s.id not in taken), key=lambda s: (-score(s), s.name)
    )


def _choose(ranked: list[PlanSpot], seed: int) -> PlanSpot | None:
    if not ranked:
        return None
    depth = min(PLANNER["reroll_depth"], len(ranked))
    return ranked[seed % depth]


def _outdoor_pool(ctx: _Context) -> list[PlanSpot]:
    outdoor = [s for s in ctx.pool if OUTDOOR & set(s.tags)]
    return outdoor or [s for s in ctx.pool if RAINY not in s.tags]


def _indoor_pool(ctx: _Context) -> list[PlanSpot]:
    return [s for s in ctx.pool if RAINY in s.tags]


def _window_length(view: dict) -> int:
    window = view["verdict"]["window"]
    return window[1] - window[0] if window else 0


def _start(view: dict) -> int:
    return view["verdict"]["window"][0]


def _weather_reason(view: dict, spot: PlanSpot, ctx: _Context) -> str:
    start, end = view["verdict"]["window"]
    peak = max(
        (h for h in view["hours"] if start <= h["hour"] < end),
        key=lambda h: h["temp_f"],
    )
    text = (
        f"Dry {weather.clock(start)}–{weather.clock(end)}, "
        f"{peak['temp_f']}° at {weather.clock(peak['hour'])}"
    )
    home_by = ctx.constraints.home_by
    if home_by is not None and start < home_by:
        text += f"; go at {weather.clock(start)}, home by {weather.clock(home_by)}"
    return text + "."


def _snow_reason(view: dict) -> str:
    blocker = view["verdict"]["text"].removeprefix("No ride window: ")
    return f"{view['name']}: {blocker}, so indoors."


def plan(
    spot_rows: Iterable[PlanSpot],
    visits: Iterable[tuple[str, date]],
    hours: Iterable[weather.Hour],
    constraints: Constraints,
    today: date,
    *,
    skips: Iterable[str] = (),
    pinned: Mapping[str, str] | None = None,
    seed: int = 0,
) -> Plan:
    """The weekend's day views and up to three suggestions.

    `skips` are this weekend's skipped spot ids, left out of every slot.
    `pinned` maps a slot key to a saved spot id, which keeps its slot
    whatever the reroll `seed`; the seed steps every other slot through
    its best few. A slot with nobody to suggest is left out rather than
    filled with a poor fit.
    """
    hours = list(hours)
    ctx = _Context(spot_rows, visits, constraints, today)
    by_id = {s.id: s for s in ctx.pool}
    skipped = set(skips)
    pinned = {k: v for k, v in (pinned or {}).items() if v in by_id}
    kept = set(pinned.values())
    ctx.pool = [s for s in ctx.pool if s.id not in skipped or s.id in kept]

    days = weekend_of(today)
    views = [weather.day_view(hours, day) for day in days]
    # The better day leads: the longer window, the earlier day on a tie.
    order = sorted(range(len(views)), key=lambda i: (-_window_length(views[i]), i))
    first = views[order[0]]
    second = views[order[1]] if len(order) > 1 else first
    first_dry = first["verdict"]["state"] == "ok"
    second_dry = second["verdict"]["state"] == "ok"
    both = len(views) > 1

    taken: set[str] = set(pinned.values())
    out: list[Suggestion] = []

    def pick(key: str, ranked: list[PlanSpot]) -> PlanSpot | None:
        if key in pinned:
            return by_id[pinned[key]]
        chosen = _choose(ranked, seed)
        if chosen is not None:
            taken.add(chosen.id)
        return chosen

    def add(key, label, view, when, spot, reasons):
        out.append(
            Suggestion(
                slot_key=key,
                slot=label,
                day=view["date"] if view is not None else None,
                when=when,
                spot_id=spot.id,
                name=spot.name,
                tags=tuple(spot.tags),
                distance=ctx.distance(spot),
                reasons=tuple(r for r in reasons if r)[:2],
                saved=pinned.get(key) == spot.id,
            )
        )

    indoor_ranked = lambda: _rank(  # noqa: E731
        ctx.kid_filter(_indoor_pool(ctx)), lambda s: _indoor_score(ctx, s), taken
    )

    # 1. Best fit.
    if first_dry:
        ranked = _rank(
            ctx.kid_filter(_outdoor_pool(ctx)),
            lambda s: _outdoor_score(ctx, s, True),
            taken,
        )
        spot = pick("best", ranked)
        if spot:
            reasons = [_weather_reason(first, spot, ctx)]
            if both and not second_dry:
                reasons[0] = reasons[0].rstrip(".") + (
                    f"; {second['name']} is a write-off, so {first['name']} "
                    "carries the outdoor plan."
                )
            reasons.append(ctx.visit_reason(spot))
            when = f"{first['name']} {_part(_start(first))}"
            add("best", SLOT_LABELS["best"], first, when, spot, reasons)
    else:
        spot = pick("best", indoor_ranked())
        if spot:
            add(
                "best",
                SLOT_LABELS["snow"],
                first,
                first["name"],
                spot,
                [_snow_reason(first), ctx.visit_reason(spot)],
            )

    # 2. Somewhere new, or the other day's snow day.
    if second_dry and (both or first_dry):
        new_pool = [s for s in ctx.pool if s.id not in ctx.last]
        ranked = _rank(
            ctx.kid_filter(new_pool), lambda s: _outdoor_score(ctx, s, True), taken
        )
        spot = pick("new", ranked)
        if spot:
            when = f"{second['name']} {_part(_start(second))}"
            add(
                "new",
                SLOT_LABELS["new"],
                second,
                when,
                spot,
                ["Never logged.", _weather_reason(second, spot, ctx)],
            )
    else:
        spot = pick("new", indoor_ranked())
        if spot:
            add(
                "new",
                SLOT_LABELS["snow"],
                second,
                second["name"],
                spot,
                [_snow_reason(second), ctx.visit_reason(spot)],
            )

    # 3. Haven't been in a while, or a quieter snow-day stop.
    if second_dry:
        visited = ctx.kid_filter([s for s in ctx.pool if s.id in ctx.last])
        ranked = sorted(
            (s for s in visited if s.id not in taken),
            key=lambda s: (-(ctx.days_since(s) or 0), s.name),
        )
        spot = pick("while", ranked)
        if spot:
            when = "Either afternoon" if both else f"{first['name']} afternoon"
            add(
                "while",
                SLOT_LABELS["while"],
                None if both else first,
                when,
                spot,
                [ctx.visit_reason(spot)],
            )
    else:
        spot = pick("while", indoor_ranked())
        if spot:
            add(
                "while",
                SLOT_LABELS["snow_quiet"],
                second,
                f"{second['name']} afternoon",
                spot,
                [ctx.visit_reason(spot), "A second stop if the first empties out."],
            )

    return Plan(days=views, suggestions=out)
