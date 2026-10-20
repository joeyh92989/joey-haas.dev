"""The analytics core (analytics.py): pure, so no database and no app."""

import ast
import json
from datetime import date, timedelta
from pathlib import Path

import pytest

from analytics import (
    ANALYTICS_LIVE_SINCE,
    MAX_BODY_BYTES,
    DailyCap,
    Event,
    cap_key,
    client_ip,
    daily_salt,
    normalise,
    range_start,
    rollup_day,
    summarise,
    visitor_hash,
)

DAY = date(2026, 10, 20)
IP = "203.0.113.7"
UA = "Mozilla/5.0 (Macintosh)"
ITEM = "/spine/0b7c6f3e-1111-4c1c-9a50-000000000001"


def body(**fields) -> bytes:
    return json.dumps({"path": "/", "ref": "", "device": "desktop", **fields}).encode()


def test_the_module_imports_no_framework():
    tree = ast.parse((Path(__file__).parent.parent / "analytics.py").read_text())
    imported = {
        (node.module or "").split(".")[0]
        for node in ast.walk(tree)
        if isinstance(node, ast.ImportFrom)
    } | {
        alias.name.split(".")[0]
        for node in ast.walk(tree)
        if isinstance(node, ast.Import)
        for alias in node.names
    }
    assert not imported & {"fastapi", "starlette", "sqlalchemy"}


# --- Visitors. -------------------------------------------------------------


def test_the_same_client_on_one_day_is_one_visitor_and_another_the_next():
    today = visitor_hash(daily_salt("secret", DAY), IP, UA)
    again = visitor_hash(daily_salt("secret", DAY), IP, UA)
    tomorrow = visitor_hash(daily_salt("secret", DAY + timedelta(days=1)), IP, UA)
    assert today == again
    assert today != tomorrow
    assert visitor_hash(daily_salt("secret", DAY), IP, "Other") != today


def test_the_hash_holds_neither_the_ip_nor_the_user_agent():
    value = visitor_hash(daily_salt("secret", DAY), IP, UA)
    assert len(value) == 32
    assert IP not in value and "203" not in value
    assert "Mozilla" not in value


def test_the_salt_depends_on_the_secret():
    assert daily_salt("one", DAY) != daily_salt("two", DAY)


def test_the_cap_key_ignores_the_user_agent():
    salt = daily_salt("secret", DAY)
    assert cap_key(salt, IP) == cap_key(salt, IP)
    assert cap_key(salt, IP) != cap_key(salt, "198.51.100.1")
    assert cap_key(salt, IP) != visitor_hash(salt, IP, "")


# --- The client IP. --------------------------------------------------------


def test_cloudflare_wins_over_a_spoofed_forwarded_for():
    headers = {"x-forwarded-for": "1.2.3.4", "cf-connecting-ip": IP}
    assert client_ip(headers, "10.0.0.1") == IP


def test_true_client_ip_then_the_socket():
    assert client_ip({"true-client-ip": IP}, "10.0.0.1") == IP
    assert client_ip({"x-forwarded-for": "1.2.3.4"}, "10.0.0.1") == "10.0.0.1"
    assert client_ip({}, None) == ""


# --- Normalising the body. -------------------------------------------------


@pytest.mark.parametrize(
    ("path", "expected"),
    [
        ("/", "/"),
        ("/about", "/about"),
        ("/about/", "/about"),
        ("/spine/next?utm=x", "/spine/next"),
        (f"{ITEM}/", ITEM),
        ("/spine/year/2026/", "/spine/year/2026"),
        ("/spine/journal/2026-10/", "/spine/journal/2026-10"),
        ("/blog/how-spine-works#top", "/blog/how-spine-works"),
    ],
)
def test_a_public_path_is_kept_in_one_form(path, expected):
    assert normalise(body(path=path)) == Event(
        path=expected, ref=None, device="desktop"
    )


@pytest.mark.parametrize(
    "path",
    [
        "/admin",
        "/admin/collection",
        "/wp-login.php",
        "/spine/not-an-id",
        "/collection",
        "/blog/../admin",
        "about",
        "/" + "a" * 250,
        None,
        42,
    ],
)
def test_a_path_that_is_not_a_public_route_is_dropped(path):
    assert normalise(body(path=path)) is None


def test_a_referrer_is_a_lower_case_hostname_or_nothing():
    assert normalise(body(ref="News.YCombinator.com")).ref == "news.ycombinator.com"
    assert normalise(body(ref=None)).ref is None
    for bad in ("https://x.com/", "x.com/path", "a b", "x" * 101, 7, "<script>"):
        assert normalise(body(ref=bad)) is None, bad


def test_an_unknown_device_or_a_bad_body_is_dropped():
    assert normalise(body(device="fridge")) is None
    assert normalise(b"not json") is None
    assert normalise(b"[1, 2]") is None
    assert normalise(b"\xff\xfe") is None
    padded = body(pad="x" * MAX_BODY_BYTES)
    assert normalise(padded) is None


# --- The daily cap. --------------------------------------------------------


def test_the_cap_blocks_the_101st_view_and_resets_the_next_day():
    cap = DailyCap()
    assert all(cap.allow("k", DAY) for _ in range(100))
    assert cap.allow("k", DAY) is False
    assert cap.allow("other", DAY) is True
    assert cap.allow("k", DAY + timedelta(days=1)) is True


def test_the_cap_refuses_new_keys_once_full():
    cap = DailyCap(limit=5, max_keys=2)
    assert cap.allow("a", DAY) and cap.allow("b", DAY)
    assert cap.allow("c", DAY) is False
    assert cap.allow("a", DAY) is True


# --- The rollup and the summary. -------------------------------------------


def views(*rows):
    return [(path, ref, device, visitor) for path, ref, device, visitor in rows]


def test_a_day_rolls_up_by_dimension_with_true_visitor_counts():
    stats = rollup_day(
        DAY,
        views(
            ("/", None, "desktop", "v1"),
            ("/about", None, "desktop", "v1"),
            ("/", "x.com", "phone", "v2"),
        ),
    )
    table = {(s.dimension, s.value): (s.views, s.visitors) for s in stats}
    assert table[("total", "")] == (3, 2)
    assert table[("path", "/")] == (2, 2)
    assert table[("path", "/about")] == (1, 1)
    assert table[("referrer", "")] == (2, 1)
    assert table[("referrer", "x.com")] == (1, 1)
    assert table[("device", "desktop")] == (2, 1)
    assert all(s.day == DAY for s in stats)


def test_a_summary_over_an_empty_range_is_all_zeros():
    start = DAY - timedelta(days=6)
    summary = summarise([], start, DAY)
    assert summary["views"] == summary["visitors"] == 0
    assert summary["views_per_visitor"] == 0
    assert summary["best_day"] is None
    assert summary["pages"] == summary["referrers"] == summary["devices"] == []
    assert [point["views"] for point in summary["series"]] == [0] * 7
    assert summary["live_since"] == ANALYTICS_LIVE_SINCE


def test_a_summary_adds_days_and_names_a_dominant_referrer():
    yesterday = DAY - timedelta(days=1)
    stats = [
        *rollup_day(yesterday, views(("/", None, "desktop", "a"))),
        *rollup_day(
            DAY,
            views(
                ("/", "x.com", "phone", "a"),
                ("/about", "x.com", "phone", "b"),
                ("/", None, "desktop", "c"),
            ),
        ),
        # Outside the range: ignored.
        *rollup_day(DAY - timedelta(days=30), views(("/", None, "desktop", "z"))),
    ]
    summary = summarise(stats, DAY - timedelta(days=6), DAY)
    assert (summary["views"], summary["visitors"]) == (4, 4)
    assert summary["views_per_visitor"] == 1.0
    assert summary["best_day"] == {"day": DAY, "views": 3, "referrer": "x.com"}
    assert summary["series"][-2:] == [
        {"day": yesterday, "views": 1},
        {"day": DAY, "views": 3},
    ]
    assert summary["pages"][0] == {"value": "/", "count": 3}
    # Direct first, whatever its count; referrers by visitors.
    assert [row["value"] for row in summary["referrers"]] == ["", "x.com"]
    assert summary["devices"] == [
        {"value": "desktop", "count": 2},
        {"value": "phone", "count": 2},
    ]


def test_no_dominant_referrer_at_half_or_less():
    stats = rollup_day(
        DAY, views(("/", "x.com", "phone", "a"), ("/", None, "desktop", "b"))
    )
    assert summarise(stats, DAY, DAY)["best_day"]["referrer"] is None


def test_ranges_end_today_and_all_starts_at_the_launch():
    assert range_start("7d", DAY) == DAY - timedelta(days=6)
    assert range_start("90d", DAY) == DAY - timedelta(days=89)
    assert range_start("all", DAY) == ANALYTICS_LIVE_SINCE
    assert range_start("all", date(2026, 1, 1)) == date(2026, 1, 1)
