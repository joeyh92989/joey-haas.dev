"""The finder's limits on Overpass: radius, timeouts, backoff and caps.

Overpass's public instance is shared and asks callers to keep to fair use:
an identifying User-Agent (the catalogue's `USER_AGENT`, reused), a 30 s
wait after a 429 or 406, and no parallel queries. The finder sends one
query a week, so these are about being a good neighbour rather than
staying under a quota. Sources: the plan's Docs alignment table
(docs/planning/2026-11-08-denver-spots-design.md).
"""

from __future__ import annotations

OVERPASS_URL = "https://overpass-api.de/api/interpreter"

# Two miles around each anchor: the "by bike" band's far edge, in metres.
RADIUS_M = 3200

# The query's own server-side limit, and the client's, which must outlast it
# or the client gives up on an answer the server is still building.
QUERY_TIMEOUT_SECONDS = 60
REQUEST_TIMEOUT_SECONDS = 90.0

# A 429 (too many requests) or 406 (refused) waits this long, then retries
# this many times; anything else fails the run at once.
BACKOFF_SECONDS = 30.0
RETRIES = 1
BACKOFF_STATUSES = frozenset({406, 429})

# Two places are one when they are this close and their names agree.
SAME_PLACE_METRES = 75.0
SAME_NAME_RATIO = 0.85
