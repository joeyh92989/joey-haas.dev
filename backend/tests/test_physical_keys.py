"""Every catalogue key names the game alone, across the recorded catalogue.

A key that keeps a platform or packaging word finds nothing on IGDB (live:
"7th sector" finds 7th Sector, "7th sector nsw" finds nothing), and the
first production store refresh queued 337 such keys with no candidate.
"""

import re

from physical_support import corpus_rows

from matching import normalize_title
from physical_sources.parse import PLATFORM_WORDS, strip_title

ROWS = corpus_rows()
PLATFORM_OR_BUNDLE = re.compile(
    r"\b(?:" + "|".join(re.escape(word) for word in PLATFORM_WORDS) + r"|bundle)\b"
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
        for source, title, key, _ in ROWS
        if key not in ALLOWED and broken(key)
    )


def test_the_corpus_covers_every_source():
    sources = {source for source, *_ in ROWS}
    assert {"nscollectors", "switch2tracker", "strictly_limited", "iam8bit"} <= sources
    assert len(ROWS) > 1000


def test_no_key_keeps_a_platform_word_or_a_bundle():
    offenders = _offenders(PLATFORM_OR_BUNDLE.search)
    assert offenders == [], "\n".join(offenders[:60])


def test_every_key_is_already_clean():
    """Cleaning a key again changes nothing: no packaging edition ("limited
    edition"), platform tail or printing note is left. A named edition
    ("elden ring tarnished edition") stays: IGDB lists many of them as the
    Switch game itself, and Resolve retries without it when it finds nothing.
    """
    offenders = _offenders(lambda key: normalize_title(strip_title(key)) != key)
    assert offenders == [], "\n".join(offenders[:60])


def test_no_key_is_empty():
    assert [title for _, title, key, _ in ROWS if not key.strip()] == []
