"""robots.txt, honoured per host before any store is read.

Each host's /robots.txt is fetched once per run and every path an adapter
will request is checked under `User-agent: *`. A disallowed path skips the
source with robots_disallowed. A robots file that cannot be read (non-200 or
a network error) is treated as allowed, and logged: the file's absence is
not a prohibition, and failing closed would let one flaky host stop a run.

urllib.robotparser applies the first matching rule rather than the longest,
and reads `*` in a path literally. Shopify's wildcard rules (`/*/collections/
*sort_by*` and the like) therefore never match; none of them names a path an
adapter requests, which test_physical_courtesy checks on the recorded files.
"""

from __future__ import annotations

import logging
from urllib.robotparser import RobotFileParser

from physical_sources.base import HostThrottle

logger = logging.getLogger(__name__)

# The rules checked are the ones every crawler must follow. The tracker's own
# User-Agent names it for a site owner reading logs; no store has a rule for it.
ROBOTS_AGENT = "*"


def parse_robots(text: str) -> RobotFileParser:
    """A parser loaded with one robots.txt body."""
    robots = RobotFileParser()
    robots.parse(text.splitlines())
    return robots


def allowed(robots: RobotFileParser | None, url: str) -> bool:
    """None (robots unreadable) is allowed; otherwise can_fetch under '*'."""
    return robots is None or robots.can_fetch(ROBOTS_AGENT, url)


async def robots_for(
    host: str, client, throttle: HostThrottle | None = None
) -> RobotFileParser | None:
    """One GET of https://<host>/robots.txt; unreadable -> None, logged."""
    if throttle is not None:
        await throttle.wait(host)
    url = f"https://{host}/robots.txt"
    try:
        response = await client.get(url)
    except Exception as error:  # any transport failure reads as "no file"
        logger.warning("robots.txt for %s unreachable: %s", host, error)
        return None
    if response.status_code != 200:
        logger.info(
            "robots.txt for %s: HTTP %s, treated as allowed",
            host,
            response.status_code,
        )
        return None
    logger.info("robots.txt for %s: %d bytes", host, len(response.content))
    return parse_robots(response.text)
