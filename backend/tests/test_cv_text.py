"""Comic Vine description HTML to plain paragraphs."""

import json
from pathlib import Path

from sources.cv_text import paragraphs

FIXTURES = Path(__file__).parent / "fixtures"


def test_paragraphs_drop_empty_ones_and_flatten_links():
    html = "<p>One</p><p></p><p>Two <a href='x'>link</a></p>"
    assert paragraphs(html) == ["One", "Two link"]


def test_script_and_style_are_dropped():
    assert paragraphs("<script>x</script><p>A</p>") == ["A"]
    assert paragraphs("<style>p{}</style><p>A</p>") == ["A"]


def test_headings_are_their_own_paragraph():
    html = "<p>Intro</p><h4>List of covers</h4><p>After</p>"
    assert paragraphs(html) == ["Intro", "List of covers", "After"]


def test_tables_are_dropped_with_everything_inside():
    html = "<p>A</p><table><tr><td><p>cell</p></td></tr></table><p>B</p>"
    assert paragraphs(html) == ["A", "B"]


def test_none_and_empty_are_no_paragraphs():
    assert paragraphs(None) == []
    assert paragraphs("") == []
    assert paragraphs("   ") == []


def test_entities_are_decoded():
    assert paragraphs("<p>Tom &amp; Jerry &mdash; &#39;hi&#39;</p>") == [
        "Tom & Jerry — 'hi'"
    ]


def test_whitespace_is_collapsed_and_inline_tags_do_not_split():
    html = "<p>One\n   <i>two</i>  <b>three</b>\t</p>"
    assert paragraphs(html) == ["One two three"]


def test_list_items_and_nested_divs_are_separate_lines():
    html = "<ul><li>a</li><li>b</li></ul><div>c<div>d</div></div>"
    assert paragraphs(html) == ["a", "b", "c", "d"]


def test_text_outside_any_block_is_kept():
    assert paragraphs("bare <i>text</i><p>then</p>") == ["bare text", "then"]


def test_br_breaks_a_line():
    assert paragraphs("<p>one<br>two</p>") == ["one", "two"]


def test_unclosed_and_malformed_markup_does_not_raise():
    assert paragraphs("<p>open <b>never closed<p>next") == ["open never closed", "next"]


def test_the_recorded_descriptions_come_out_as_plain_text():
    recorded = json.loads((FIXTURES / "comicvine_issues_page.json").read_text())
    for row in recorded["issues"]["results"]:
        lines = paragraphs(row["description"])
        assert lines
        assert all(line == line.strip() and "<" not in line for line in lines)
