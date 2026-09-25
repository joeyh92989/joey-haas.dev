"""robots.txt, honoured per host before any store is read (RFC 9309).

Each host's /robots.txt is fetched once per run and every path an adapter
will request is checked against it. A disallowed path skips the source with
robots_disallowed.

The matcher follows RFC 9309 rather than urllib.robotparser, which applies
the first matching rule and reads `*` literally. Every Shopify robots.txt
opens with `Allow: /`, so under first-match every later Disallow is dead and
the check would pass for any path. Here the longest matching rule wins, an
Allow wins a tie, `*` matches any run of characters and a trailing `$`
anchors the end.

Status handling is the RFC's too: a 4xx means there are no rules, so
everything is allowed; a 5xx or a network failure means complete disallow
for this run, because an unreachable file is not evidence of consent.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from urllib.parse import urlsplit

from physical_sources.base import HostThrottle
from physical_sources.limits import USER_AGENT

logger = logging.getLogger(__name__)

# A group naming this token applies instead of `*`. No store names it today.
PRODUCT_TOKEN = USER_AGENT.split()[0].lower()
_UNRESERVED = re.compile(r"[A-Za-z0-9\-._~]")
_PERCENT = re.compile(r"%([0-9A-Fa-f]{2})")


@dataclass(frozen=True)
class Robots:
    """The rules that apply to this crawler on one host.

    `rules` holds (allow, pattern) pairs. `disallow_all` is set when the
    file could not be reached, which the RFC reads as a complete disallow.
    """

    rules: tuple[tuple[bool, str], ...] = ()
    disallow_all: bool = False

    def can_fetch(self, url: str) -> bool:
        parts = urlsplit(url)
        path = _normalise(parts.path or "/")
        if path == "/robots.txt":
            return True  # always implicitly allowed
        if self.disallow_all:
            return False
        target = path + (f"?{_normalise(parts.query)}" if parts.query else "")
        best: tuple[int, bool] | None = None
        for allow, pattern in self.rules:
            if _matches(pattern, target):
                # Longest pattern wins; on equal length, Allow (True > False).
                candidate = (len(pattern.encode()), allow)
                if best is None or candidate > best:
                    best = candidate
        return True if best is None else best[1]


ALLOW_ALL = Robots()
DISALLOW_ALL = Robots(disallow_all=True)


def _normalise(text: str) -> str:
    """Decode only percent-escapes of unreserved characters; encode the rest.

    RFC 9309 §2.2.2: octets are compared unencoded unless reserved or outside
    the unreserved range, so `%7E` equals `~` but `%E2%84%A2` stays encoded
    and a raw `™` in a pattern is encoded to match it.
    """

    def decode(match: re.Match) -> str:
        char = chr(int(match.group(1), 16))
        return char if _UNRESERVED.fullmatch(char) else match.group(0).upper()

    decoded = _PERCENT.sub(decode, text)
    return "".join(
        char if ord(char) < 128 else "".join(f"%{b:02X}" for b in char.encode())
        for char in decoded
    )


def _matches(pattern: str, target: str) -> bool:
    anchored = pattern.endswith("$")
    body = pattern[:-1] if anchored else pattern
    regex = ".*".join(re.escape(part) for part in body.split("*"))
    return re.match(regex + ("$" if anchored else ""), target) is not None


def parse_robots(text: str, token: str = PRODUCT_TOKEN) -> Robots:
    """The rules for `token`'s groups, else for the `*` groups, combined."""
    groups: list[tuple[set[str], list[tuple[bool, str]]]] = []
    in_agents = False
    for raw in text.splitlines():
        line = raw.split("#", 1)[0].strip()
        if ":" not in line:
            continue
        key, value = (part.strip() for part in line.split(":", 1))
        key = key.lower()
        if key == "user-agent":
            if not in_agents:
                groups.append((set(), []))
                in_agents = True
            groups[-1][0].add(value.lower())
        elif key in ("allow", "disallow"):
            in_agents = False
            if groups and value:  # an empty Disallow is no rule at all
                groups[-1][1].append((key == "allow", _normalise(value)))
        else:
            in_agents = False  # sitemap and the like end an agent run too

    def rules_for(agent: str) -> list[tuple[bool, str]]:
        return [rule for agents, rules in groups if agent in agents for rule in rules]

    named = any(token in agents for agents, _ in groups)
    return Robots(rules=tuple(rules_for(token if named else "*")))


def allowed(robots: Robots | None, url: str) -> bool:
    """Whether `url` may be fetched; None (never checked) is allowed."""
    return robots is None or robots.can_fetch(url)


async def robots_for(host: str, client, throttle: HostThrottle | None = None) -> Robots:
    """One GET of https://<host>/robots.txt, read per RFC 9309 §2.3.1."""
    if throttle is not None:
        await throttle.wait(host)
    url = f"https://{host}/robots.txt"
    try:
        response = await client.get(url)
    except Exception as error:  # any transport failure is "unreachable"
        logger.warning("robots.txt for %s unreachable (%s): disallow all", host, error)
        return DISALLOW_ALL
    status = response.status_code
    if 400 <= status < 500:
        logger.info("robots.txt for %s: HTTP %s, no rules", host, status)
        return ALLOW_ALL
    if status != 200:
        logger.warning("robots.txt for %s: HTTP %s, disallow all", host, status)
        return DISALLOW_ALL
    logger.info("robots.txt for %s: %d bytes", host, len(response.content))
    return parse_robots(response.text)
