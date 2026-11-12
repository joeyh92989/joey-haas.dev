"""The shelf copy states how many stores are watched; it must follow STORES."""

import re
from pathlib import Path

from physical_sources.stores import STORES

SPINE_JS = (
    Path(__file__).resolve().parents[2] / "frontend" / "src" / "content" / "spine.js"
)


def test_spine_store_count_matches_the_store_list():
    match = re.search(r"\['Stores', '(\d+) watched'\]", SPINE_JS.read_text())
    assert match, "spine.js lost its ['Stores', 'N watched'] fallback"
    assert int(match.group(1)) == len(STORES), (
        "frontend/src/content/spine.js says "
        f"'{match.group(1)} watched' but physical_sources.stores.STORES has "
        f"{len(STORES)}; update both together"
    )
