"""Comic Vine's description HTML as plain paragraphs.

Comic Vine descriptions are editor-written HTML: paragraphs, headings, lists,
links and, for issues, a table of cover credits. The public issue pages show
text only, so this reduces the markup to a list of paragraphs and nothing else:
no tag, attribute or link target survives. Tables and scripts are dropped with
everything inside them.
"""

from __future__ import annotations

import re
from html.parser import HTMLParser

# Each of these ends the paragraph being collected and starts a new one.
BLOCK_TAGS = frozenset(
    {"p", "h1", "h2", "h3", "h4", "h5", "h6", "li", "div", "br", "ul", "ol"}
)
# Everything between these tags and their matching end tag is discarded.
SKIPPED_TAGS = frozenset({"script", "style", "table"})

_SPACE = re.compile(r"\s+")


class _Collector(HTMLParser):
    def __init__(self) -> None:
        # convert_charrefs decodes &amp; and numeric references in the text.
        super().__init__(convert_charrefs=True)
        self.lines: list[str] = []
        self._parts: list[str] = []
        self._skipped: dict[str, int] = {}

    def _flush(self) -> None:
        text = _SPACE.sub(" ", "".join(self._parts)).strip()
        self._parts = []
        if text:
            self.lines.append(text)

    def handle_starttag(self, tag: str, attrs: list) -> None:
        if tag in SKIPPED_TAGS:
            self._flush()
            self._skipped[tag] = self._skipped.get(tag, 0) + 1
        elif tag in BLOCK_TAGS and not self._skipped:
            self._flush()

    def handle_startendtag(self, tag: str, attrs: list) -> None:
        # <br/> is a break; a self-closed skipped tag has no content to drop.
        if tag in BLOCK_TAGS and not self._skipped:
            self._flush()

    def handle_endtag(self, tag: str) -> None:
        if tag in SKIPPED_TAGS:
            if self._skipped.get(tag):
                self._skipped[tag] -= 1
                if not self._skipped[tag]:
                    del self._skipped[tag]
        elif tag in BLOCK_TAGS and not self._skipped:
            self._flush()

    def handle_data(self, data: str) -> None:
        if not self._skipped:
            self._parts.append(data)


def paragraphs(html: str | None) -> list[str]:
    """The text of `html` as non-empty paragraphs, in order.

    Block elements (p, h1-h6, li, div) and line breaks each end a paragraph;
    inline markup is flattened into the text around it. Whitespace is
    collapsed, entities decoded, and tables, scripts and styles dropped.
    """
    if not html:
        return []
    collector = _Collector()
    collector.feed(html)
    collector.close()
    collector._flush()
    return collector.lines
