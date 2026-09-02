"""Confidence scoring: which candidate a detected title actually refers to."""

from matching import Confidence, best_match, normalize_title
from sources.base import SourceResult


def r(external_id: str, title: str, year: int | None = None) -> SourceResult:
    return SourceResult(external_id=external_id, title=title, year=year)


def test_normalize_folds_case_and_punctuation():
    assert normalize_title("The Lord of the Rings!") == "the lord of the rings"
    assert normalize_title("  Spider-Man:  No Way Home ") == "spider man no way home"
    assert normalize_title("WALL·E") == "wall e"


def test_an_unambiguous_match_is_exact():
    match = best_match("Inscryption", None, [r("1", "Inscryption"), r("2", "Cryptid")])
    assert match.confidence is Confidence.EXACT
    assert match.result.external_id == "1"


def test_a_close_reading_is_probable_not_exact():
    # OCR off a spine drops characters. Still the right film, still worth
    # pre-selecting -- but flagged for a look.
    match = best_match("Blade Runer", None, [r("1", "Blade Runner")])
    assert match.confidence is Confidence.PROBABLE


def test_no_candidates_is_uncertain_with_no_result():
    match = best_match("Some Obscure Box", None, [])
    assert match.confidence is Confidence.UNCERTAIN
    assert match.result is None


def test_year_filters_candidates_before_ranking():
    # Two identical titles tie at 1.0 and the margin collapses to zero, which
    # would force UNCERTAIN on a detection the year already settled. Filtering
    # before ranking is what keeps the margin meaningful.
    match = best_match("Dune", 2021, [r("1", "Dune", 1984), r("2", "Dune", 2021)])
    assert match.confidence is Confidence.EXACT
    assert match.result.external_id == "2"


def test_year_tolerance_allows_a_year_of_drift():
    # Release years disagree across sources routinely: festival versus general
    # release, regional publication dates, a board game's print run.
    match = best_match("Dune", 2020, [r("2", "Dune", 2021)])
    assert match.result.external_id == "2"


def test_a_year_matching_nothing_falls_back_rather_than_giving_up():
    # Dropping every candidate would report "no match" for a title that was
    # found. Better to rank the unfiltered set and let the margin mark it.
    match = best_match("Dune", 1600, [r("1", "Dune", 1984), r("2", "Dune", 2021)])
    assert match.result is not None
    assert match.confidence is Confidence.UNCERTAIN


def test_two_equally_good_candidates_are_uncertain():
    match = best_match("Dune", None, [r("1", "Dune", 1984), r("2", "Dune", 2021)])
    assert match.confidence is Confidence.UNCERTAIN


def test_a_wholly_different_title_is_uncertain():
    match = best_match("Gloomhaven", None, [r("1", "Monopoly")])
    assert match.confidence is Confidence.UNCERTAIN


def test_punctuation_differences_do_not_cost_an_exact_match():
    # Spines and catalogues disagree on hyphens and colons constantly.
    match = best_match(
        "Spider-Man: No Way Home", None, [r("1", "Spider Man No Way Home")]
    )
    assert match.confidence is Confidence.EXACT


def test_the_score_is_reported_for_display():
    match = best_match("Dune", None, [r("1", "Dune")])
    assert match.score == 1.0


def test_a_tie_keeps_the_source_ordering():
    # Caught from live data: searching TMDB for "The Thing" returns the 1982
    # film first and the 2011 one second, both scoring 1.0. The result is
    # uncertain either way, but the row is pre-selected, so the default must
    # be the source's best guess rather than its worst.
    match = best_match(
        "The Thing", None, [r("1091", "The Thing", 1982), r("83533", "The Thing", 2011)]
    )
    assert match.result.external_id == "1091"
    assert match.confidence is Confidence.UNCERTAIN


def test_a_tie_still_prefers_the_better_scoring_candidate_over_order():
    # Ordering only decides ties; it must never outrank the score itself.
    match = best_match(
        "Gloomhaven",
        None,
        [r("1", "Gloomhaven: Jaws of the Lion"), r("2", "Gloomhaven")],
    )
    assert match.result.external_id == "2"
