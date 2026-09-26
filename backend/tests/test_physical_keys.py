"""Every catalogue key names the game alone, across the recorded catalogue.

A key that keeps a platform or packaging word finds nothing on IGDB (live:
"7th sector" finds 7th Sector, "7th sector nsw" finds nothing), and the
first production store refresh queued 337 such keys with no candidate.
"""

import re

from physical_support import corpus_rows

from matching import normalize_title
from physical_sources.parse import PLATFORM_WORDS, strip_title

PLATFORM = re.compile(
    r"\b(?:" + "|".join(re.escape(word) for word in PLATFORM_WORDS) + r")\b"
)
# Packaging leftovers the fixed-point check cannot see: normalizing removed
# the dash or bracket the cleaner needed ("- Preorder", "(EU)").
RESIDUE = re.compile(
    r"\b(?:preorder|pre order|standard release|collector s(?: ed)?|limited edition"
    r"|special edition|deluxe edition|japanese version|plushie bundle"
    r"|soundtrack bundle|book bundle)$"
    r"|\s(?:le|ce|eu|eur|pegi|usk|box)$"
    r"|^online exclusive"
)
# A real product whose own name keeps a forbidden word, with the reason.
ALLOWED: dict[str, str] = {
    "simple series for nintendo switch 2 vol 1 the mahjong": (
        "the series is named for the console"
    ),
    "simple series for nintendo switch 2 vol 2 the billiards": (
        "the series is named for the console"
    ),
}


def _offenders(broken) -> list[str]:
    return sorted(
        f"{source}: {title!r} -> {key!r}"
        for source, title, key, _ in corpus_rows()
        if key not in ALLOWED and broken(key)
    )


def test_the_corpus_covers_every_source_and_later_pages():
    rows = corpus_rows()
    sources = {source for source, *_ in rows}
    assert {"nscollectors", "switch2tracker", "strictly_limited", "iam8bit"} <= sources
    # Only on Strictly Limited's nintendo-switch page 2.
    assert any(title.startswith("Velocity 2X") for _, title, *_ in rows)


def test_no_key_keeps_a_platform_word():
    offenders = _offenders(PLATFORM.search)
    assert offenders == [], "\n".join(offenders[:60])


def test_no_key_keeps_a_packaging_leftover():
    offenders = _offenders(RESIDUE.search)
    assert offenders == [], "\n".join(offenders[:60])


def test_an_extras_suffix_does_not_split_a_game():
    """'+ Character Cards' is merch: both VIRCHE listings are one game."""
    keys = {
        key for _, title, key, _ in corpus_rows() if title.startswith("VIRCHE EVERMORE")
    }
    assert len(keys) == 1, keys


def test_every_key_is_already_clean():
    """Cleaning a key again changes nothing: no packaging edition ("limited
    edition"), platform tail or printing note is left. A named edition
    ("elden ring tarnished edition") stays: IGDB lists many of them as the
    Switch game itself, and Resolve retries without it when it finds nothing.
    """
    offenders = _offenders(lambda key: normalize_title(strip_title(key)) != key)
    assert offenders == [], "\n".join(offenders[:60])


def test_no_key_is_empty():
    assert [title for _, title, key, _ in corpus_rows() if not key.strip()] == []
