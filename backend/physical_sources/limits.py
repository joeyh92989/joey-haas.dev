"""Every tunable number in the physical catalogue, and the constants it shares.

Tuning is one file. The format constants live here rather than in formats.py
because formats.py imports models (SQLAlchemy) and the parsers must not;
formats.py imports them from here instead, so each has one definition.
"""

from __future__ import annotations

import re

USER_AGENT = "joey-haas.dev tracker (+https://joey-haas.dev; josephthaas@gmail.com)"

# Per host, across every request a run makes to it.
REQUESTS_PER_SECOND = 2
PAGE_SIZE_SHOPIFY = 250
PAGE_SIZE_WOO = 100
REQUEST_TIMEOUT_SECONDS = 30.0

# Keys resolved to IGDB per press of Resolve; the button loops.
RESOLVE_LIMIT = 100
SNAPSHOT_MAX_AGE_DAYS = 30
# How often the Limited Run product page is re-read for one listing.
HTML_RECHECK_DAYS = 7

# A run that sees fewer rows than this share of its source's last successful
# run is short: its rows upsert, nothing is retired or archived.
SHORT_RUN_RATIO = 0.5
# Consecutive failed runs of one source before the status page flags it.
NEEDS_ATTENTION_AFTER = 3
# A run still unfinished after this long was interrupted (a restart
# mid-refresh) and counts as failed.
STALE_RUN_MINUTES = 30

SWITCH_2 = 508
SWITCH = 130
N64 = 4
# The platforms the catalogue resolves and pools. A listing on any other
# platform is stored with it and never resolved.
CATALOGUE_PLATFORMS = frozenset({SWITCH_2, SWITCH, N64})
# Every copy on these is a full-game cartridge: N64 had nothing else, and no
# Game-Key Card exists for Switch 1. Used only when a listing's text is silent.
CARTRIDGE_ONLY_PLATFORMS = frozenset({N64, SWITCH})

# The region a NULL item region means, and the one the collapse answers for.
HOME_REGION = "USA"

# LP-AAC4B-USA-0: format prefix, product code, region, revision.
CART_ID_PATTERN = re.compile(r"^L[PBNA]-[A-Z0-9]{5}-[A-Z0-9]{3}-[0-9A-Z]$")
