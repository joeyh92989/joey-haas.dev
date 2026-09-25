"""Classify a store listing's physical format from its own words.

Pure. `classify(text, policy, platform_id)` runs the spec §2 steps in order:

1. Strip false positives (a soundtrack's download code, a bonus game's code
   in the box, Steam and Teeto keys).
2. Key-card and not-full-cart phrases -> game_key_card / code_in_box at
   store_text. Fangamer's upgrade-pack phrase -> a Switch 1 cartridge
   (game_card with platform_override 130), not a native Switch 2 card.
3. Full-cartridge phrases -> game_card at store_text.
4. The store's format_policy at store_policy.
5. A cartridge-only platform -> game_card at platform_policy.
6. Otherwise nothing: the absence of a key-card phrase is never evidence of
   a full cartridge.

Step 2 runs before step 3, so text naming both is a key card. The phrases
are the ones seen on the stores (research §2.3, re-checked on the recorded
fixtures), never invented; `evidence` is the matched text as the store wrote
it.
"""

from __future__ import annotations

import html
import re
from dataclasses import dataclass

from physical_sources.limits import CARTRIDGE_ONLY_PLATFORMS, SWITCH


@dataclass(frozen=True)
class Classification:
    """A format, how it was decided, and the words that decided it."""

    format: str | None
    tier: str | None
    platform_override: int | None
    evidence: str | None


NOTHING = Classification(None, None, None, None)

_FLAGS = re.IGNORECASE

FALSE_POSITIVES: tuple[re.Pattern, ...] = tuple(
    re.compile(pattern, _FLAGS)
    for pattern in (
        r"download code for the .{0,80}?soundtrack",
        r"code in the box for [^.;\n]{0,80}",
        r"\bsteam key\b",
        r"\bteeto key\b",
    )
)

UPGRADE_PACK = re.compile(
    r"includes the nintendo switch game and the nintendo switch 2 edition "
    r"upgrade pack",
    _FLAGS,
)

KEY_CARD_PHRASES: tuple[tuple[re.Pattern, str], ...] = tuple(
    (re.compile(pattern, _FLAGS), fmt)
    for pattern, fmt in (
        (r"\bgame[- ]?key[- ]?card\b", "game_key_card"),
        (r"full game download via internet required", "game_key_card"),
        (r"download code in a box", "code_in_box"),
        (r"\bcode[- ]in[- ](?:a[- ])?box\b", "code_in_box"),
    )
)

# Most specific first, so evidence names the fullest phrase present.
FULL_CART_PHRASES: tuple[tuple[re.Pattern, str], ...] = tuple(
    (re.compile(pattern, _FLAGS), fmt)
    for pattern, fmt in (
        (r"fully assembled .{0,60}?game with cartridge", "game_card"),
        (r"entire game data on cartridge", "game_card"),
        (r"cartridge includes the full game", "game_card"),
        (r"full game included on cartridge", "game_card"),
        (r"full game on cartridge", "game_card"),
        (r"full physical cartridge", "game_card"),
        (r"full game cartridge", "game_card"),
        (r"region-free physical cart\b", "game_card"),
        (r"\bis a game card\b", "game_card"),
        (r"complete (?:game, )?on cartridge", "game_card"),
        (r"complete (?:game, )?on disc", "disc"),
        (r"switch case and cartridge", "game_card"),
        (r"physical case and game", "game_card"),
        (r"on the same cartridge", "game_card"),
        (r"game with cartridge", "game_card"),
        (r"game on cartridge", "game_card"),
        (r"\(game card\)\s*$", "game_card"),
    )
)

_TAG = re.compile(r"<[^>]+>")
_SPACE = re.compile(r"\s+")


def plain_text(text: str) -> str:
    """Tags dropped, entities decoded, whitespace collapsed."""
    return _SPACE.sub(" ", html.unescape(_TAG.sub(" ", text or ""))).strip()


def _strip_false_positives(text: str) -> str:
    for pattern in FALSE_POSITIVES:
        text = pattern.sub(" ", text)
    return text


def classify(text: str, policy: str | None, platform_id: int | None) -> Classification:
    """The format a listing's text, store and platform support, or nothing."""
    cleaned = _strip_false_positives(plain_text(text))

    upgrade = UPGRADE_PACK.search(cleaned)
    if upgrade:
        return Classification("game_card", "store_text", SWITCH, upgrade.group(0))
    for pattern, fmt in KEY_CARD_PHRASES:
        found = pattern.search(cleaned)
        if found:
            return Classification(fmt, "store_text", None, found.group(0))
    for pattern, fmt in FULL_CART_PHRASES:
        found = pattern.search(cleaned)
        if found:
            return Classification(fmt, "store_text", None, found.group(0).strip())
    if policy:
        return Classification(policy, "store_policy", None, None)
    if platform_id in CARTRIDGE_ONLY_PLATFORMS:
        return Classification("game_card", "platform_policy", None, None)
    return NOTHING
