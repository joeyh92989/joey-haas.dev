"""The recommendation engine's taste: reference weights, facet profile, affinity.

Pure, tested without a database (tests/test_taste.py). Play Next and the
public picks read it; Radar and Discover still use picker.reference_weights,
picker.attribute_table and picker.affinity, which are frozen to their batches
and move here in a later change (recommendation engine spec, "Siblings now").

A reference is an item that says something about taste: a favorite, a rated
item, a finish or an abandon, or something in progress that the owner keeps
coming back to (engagement of at least ENGAGED). Its weight:

- favorite 1.0, finished 0.3, abandoned -0.5 (BASE_WEIGHTS);
- plus the rating measured from the mean of the item's own type, since a
  comic scale and a game scale differ;
- a finish never counts for less than FINISHED_FLOOR, then gains a recency
  bonus of at most RECENCY_CAP (halving every RECENCY_HALF_LIFE_DAYS) and up
  to ENGAGEMENT_BONUS for how fully it was played;
- in progress and engaged: IN_PROGRESS_WEIGHT;
- a bounce (one journal day, then paused or abandoned) costs BOUNCE_PENALTY;
- capped at 1.0 unless it is a favorite: a favorite stays the one way to say
  "this, specifically".

The play record and the bounce move weights only. No reason mentions them.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date
from statistics import mean

from facets import facets_of, specificity
from picker_items import PickerItem

BASE_WEIGHTS = {"favorite": 1.0, "finished": 0.3, "abandoned": -0.5}
FINISHED_FLOOR = 0.1
RECENCY_CAP = 0.15
RECENCY_HALF_LIFE_DAYS = 14
# Engagement is clamped to this; ENGAGEMENT_BONUS is reached at the clamp.
ENGAGEMENT_MAX = 1.5
ENGAGEMENT_BONUS = 0.3
# Sessions standing in for a whole play when the length is unknown.
SESSIONS_FOR_FULL = 8
ENGAGED = 0.5
IN_PROGRESS_WEIGHT = 0.3
BOUNCE_PENALTY = 0.2
WEIGHT_CAP = 1.0

IN_PROGRESS = ("active", "paused")
# A facet's floor share of the vote: common facets still count a little.
SPECIFICITY_FLOOR = 0.25
# Below this many seen facets, affinity is shrunk toward neutral.
FULL_COVERAGE = 3
NEUTRAL = 50.0


def recency_bonus(finished_at: date | None, today: date | None) -> float:
    """RECENCY_CAP on the day of the finish, half of it two weeks later."""
    if finished_at is None or today is None:
        return 0.0
    days = max(0, (today - finished_at).days)
    return RECENCY_CAP * 0.5 ** (days / RECENCY_HALF_LIFE_DAYS)


def engagement(item: PickerItem) -> float | None:
    """How fully the item was taken in, 0 to ENGAGEMENT_MAX; None when unknown.

    A game: journal hours over its time to beat, or sessions over
    SESSIONS_FOR_FULL when its length is unknown. A comic: issues read over
    issues owned. A movie: 1 once watched.
    """
    if item.type == "comic":
        if not item.issues_owned_count or item.issues_read is None:
            return None
        value = item.issues_read / item.issues_owned_count
    elif item.type == "movie":
        if item.status != "finished":
            return None
        value = 1.0
    else:
        play = item.play
        if play is None or (play.hours <= 0 and play.sessions <= 0):
            return None
        length = item.time_to_beat_hours
        if length and length > 0 and play.hours > 0:
            value = play.hours / length
        else:
            value = play.sessions / SESSIONS_FOR_FULL
    return max(0.0, min(ENGAGEMENT_MAX, value))


def is_finished(item: PickerItem) -> bool:
    """Finished, or a comic run read to its last owned issue."""
    if item.status == "finished":
        return True
    return (
        item.type == "comic"
        and bool(item.issues_owned_count)
        and item.issues_read is not None
        and item.issues_read >= item.issues_owned_count
    )


def _bounced(item: PickerItem) -> bool:
    return item.play is not None and item.play.bounced


def _engaged_in_progress(item: PickerItem) -> bool:
    if item.status not in IN_PROGRESS or is_finished(item):
        return False
    value = engagement(item)
    return value is not None and value >= ENGAGED


def is_reference(item: PickerItem) -> bool:
    """Whether the item says anything about taste."""
    if item.favorite or item.rating is not None or is_finished(item):
        return True
    if item.status == "abandoned" or _bounced(item):
        return True
    return _engaged_in_progress(item)


def _rating_shift(rating: int, average: float) -> float:
    if rating > average and average < 10:
        return (rating - average) / (10 - average)
    if rating < average and average > 0:
        return (rating - average) / average
    return 0.0


def taste_weights(items: Iterable[PickerItem], today: date | None) -> dict[str, float]:
    """Each reference item's weight, keyed by id (see the module docstring).

    `today` None leaves the recency bonus out.
    """
    references = [item for item in items if is_reference(item)]
    ratings: dict[str, list[int]] = {}
    for item in references:
        if item.rating is not None:
            ratings.setdefault(item.type, []).append(item.rating)
    averages = {kind: mean(values) for kind, values in ratings.items()}

    weights: dict[str, float] = {}
    for item in references:
        finished = is_finished(item)
        if item.favorite:
            weight = BASE_WEIGHTS["favorite"]
        elif finished:
            weight = BASE_WEIGHTS["finished"]
        elif item.status == "abandoned":
            weight = BASE_WEIGHTS["abandoned"]
        elif _engaged_in_progress(item):
            weight = IN_PROGRESS_WEIGHT
        else:
            weight = 0.0
        if item.rating is not None:
            weight += _rating_shift(item.rating, averages[item.type])
        if finished:
            weight = max(weight, FINISHED_FLOOR)
            weight += recency_bonus(item.finished_at, today)
            value = engagement(item)
            if value is not None:
                weight += ENGAGEMENT_BONUS * value / ENGAGEMENT_MAX
        if _bounced(item):
            weight -= BOUNCE_PENALTY
        if not item.favorite:
            weight = min(weight, WEIGHT_CAP)
        weights[item.id] = weight
    return weights


@dataclass(frozen=True)
class Profile:
    """facet -> mean weight over the references carrying it, and every
    facet's specificity over the whole collection."""

    weights: dict[str, float]
    specificity: dict[str, float]

    def seen(self, facets: Iterable[str]) -> list[str]:
        return sorted(facet for facet in facets if facet in self.weights)


def facet_profile(items: Iterable[PickerItem], weights: dict[str, float]) -> Profile:
    items = list(items)
    carried: dict[str, list[float]] = {}
    for item in items:
        if item.id not in weights:
            continue
        for facet in facets_of(item):
            carried.setdefault(facet, []).append(weights[item.id])
    return Profile(
        weights={facet: mean(values) for facet, values in carried.items()},
        specificity=specificity(items),
    )


def facet_vote(facet: str, profile: Profile) -> float:
    """A seen facet's share of the vote: SPECIFICITY_FLOOR for a facet every
    item carries, 1 for the rarest of its kind."""
    spec = profile.specificity.get(facet, 0.0)
    return SPECIFICITY_FLOOR + (1 - SPECIFICITY_FLOOR) * spec


def affinity(item: PickerItem, profile: Profile) -> float:
    """0-100, 50 neutral: the specificity-weighted mean weight of the item's
    seen facets, shrunk toward 50 when fewer than FULL_COVERAGE are seen.
    A facet the profile has never seen does not vote."""
    seen = profile.seen(facets_of(item))
    if not seen:
        return NEUTRAL
    votes = [facet_vote(facet, profile) for facet in seen]
    total = sum(votes)
    signal = sum(
        profile.weights[facet] * vote for facet, vote in zip(seen, votes, strict=True)
    )
    raw = max(0.0, min(100.0, NEUTRAL + NEUTRAL * signal / total))
    coverage = min(1.0, len(seen) / FULL_COVERAGE)
    return NEUTRAL + (raw - NEUTRAL) * coverage


def leading_facet(item: PickerItem, profile: Profile) -> str | None:
    """The seen facet that pulls the item's affinity most, for diversity and
    the reason sentence: weight times vote, ties broken by the facet."""
    seen = profile.seen(facets_of(item))
    if not seen:
        return None
    return max(
        seen,
        key=lambda facet: (profile.weights[facet] * facet_vote(facet, profile), facet),
    )
