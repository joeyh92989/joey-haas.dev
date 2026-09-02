"""Deciding which candidate a detected title actually refers to.

Confidence is measured, never asked for. A vision model will report high
confidence on a confidently wrong reading, because it is grading its own work.
String distance between what was read off a spine and what a source
independently returned is a measurement of agreement between two separate
things, which is a weaker claim but a trustworthy one.

The thresholds are first guesses. They are named constants here so that tuning
them against a real shelf is one edit in one place.
"""

from __future__ import annotations

import enum
import re
from dataclasses import dataclass
from difflib import SequenceMatcher

from sources.base import SourceResult

# 0.98 rather than 0.95 deliberately. Normalization already removes the
# differences that do not matter, so a genuine match usually scores exactly
# 1.0 and EXACT can mean "effectively identical". At 0.95, "Blade Runer"
# scored 0.956 against "Blade Runner" and was called exact -- but a dropped
# character is precisely the misread that needs a human glance, because it is
# also what a different work looks like.
EXACT_RATIO = 0.98
PROBABLE_RATIO = 0.75

# How far ahead of the runner-up the best candidate must be. Without this, two
# equally plausible candidates would produce a confident answer chosen by
# nothing more than sort order.
REQUIRED_MARGIN = 0.15

# Release years disagree by a year across sources routinely: festival versus
# general release, regional publication dates, a board game's print run.
YEAR_TOLERANCE = 1

_NON_ALPHANUMERIC = re.compile(r"[^a-z0-9]+")


class Confidence(str, enum.Enum):
    """How far a match should be trusted without a human looking at it."""

    EXACT = "exact"
    PROBABLE = "probable"
    UNCERTAIN = "uncertain"


@dataclass(frozen=True)
class Match:
    """The chosen candidate, or None when nothing was found."""

    result: SourceResult | None
    confidence: Confidence
    score: float


def normalize_title(title: str) -> str:
    """Case-folded, punctuation-free, single-spaced.

    Spines and box art disagree with catalogues about hyphens, colons, and
    typographic characters constantly. Comparing raw strings would score
    "Spider-Man: No Way Home" against "Spider Man No Way Home" as a near miss
    rather than the same film.
    """
    return _NON_ALPHANUMERIC.sub(" ", title.casefold()).strip()


def _ratio(left: str, right: str) -> float:
    return SequenceMatcher(None, left, right).ratio()


def best_match(
    detected_title: str,
    detected_year: int | None,
    candidates: list[SourceResult],
) -> Match:
    """The candidate a detection most likely refers to.

    Year is applied as a filter before ranking, not as a tiebreaker after it.
    Two same-titled releases both score 1.0, so the margin between them is zero
    and the result would be forced to UNCERTAIN even though the year already
    settled it.

    A year that eliminates every candidate is treated as a misreading rather
    than as evidence of absence: the unfiltered set is ranked instead, and the
    margin marks the ambiguity that remains.
    """
    if not candidates:
        return Match(result=None, confidence=Confidence.UNCERTAIN, score=0.0)

    considered = candidates
    if detected_year is not None:
        in_range = [
            candidate
            for candidate in candidates
            if candidate.year is not None
            and abs(candidate.year - detected_year) <= YEAR_TOLERANCE
        ]
        if in_range:
            considered = in_range

    target = normalize_title(detected_title)
    scored = sorted(
        (_ratio(target, normalize_title(c.title)), index, c)
        for index, c in enumerate(considered)
    )
    scored.reverse()

    top_score, _, top = scored[0]
    runner_up = scored[1][0] if len(scored) > 1 else 0.0
    margin = top_score - runner_up

    if top_score >= EXACT_RATIO and margin >= REQUIRED_MARGIN:
        confidence = Confidence.EXACT
    elif top_score >= PROBABLE_RATIO and margin >= REQUIRED_MARGIN:
        confidence = Confidence.PROBABLE
    else:
        confidence = Confidence.UNCERTAIN

    return Match(result=top, confidence=confidence, score=top_score)
