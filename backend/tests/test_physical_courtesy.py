"""robots.txt checks (RFC 9309), on every store host's recorded robots.txt."""

import time
from pathlib import Path

import httpx2
import pytest

from physical_sources.courtesy import (
    ALLOW_ALL,
    DISALLOW_ALL,
    allowed,
    parse_robots,
    robots_for,
)

ROBOTS = Path(__file__).parent / "fixtures" / "physical" / "robots"

SHOPIFY_PATH = "/collections/coming-soon/products.json?limit=250&page=1"
WOO_PATH = "/wp-json/wc/store/v1/products?per_page=100&page=1&category=65"
PRODUCT_PAGE = "/products/terranigma-foiled-standard-edition-switch-2-ps5-xbox"
WOO_HOSTS = {"www.pixelheart.eu", "gamefairy.io", "1printgames.com"}


def _robots(host: str):
    return parse_robots((ROBOTS / f"{host}.txt").read_text())


@pytest.mark.parametrize("path", sorted(ROBOTS.glob("*.txt")), ids=lambda p: p.stem)
def test_every_store_allows_the_path_its_adapter_reads(path):
    host = path.stem
    robots = parse_robots(path.read_text())
    request = WOO_PATH if host in WOO_HOSTS else SHOPIFY_PATH
    assert allowed(robots, f"https://{host}{request}")


def test_every_store_host_has_a_recorded_robots_file():
    assert len(list(ROBOTS.glob("*.txt"))) == 12


def test_limited_run_allows_the_product_page_the_html_step_reads():
    robots = _robots("limitedrungames.com")
    assert allowed(robots, f"https://limitedrungames.com{PRODUCT_PAGE}")


def test_shopify_rules_bite_despite_the_leading_allow():
    # Every Shopify file opens with `Allow: /`. Under first-match (the
    # stdlib parser) that allows everything; under longest-match the
    # Disallows below it still apply.
    robots = _robots("limitedrungames.com")
    assert not allowed(robots, "https://limitedrungames.com/admin")
    assert not allowed(robots, "https://limitedrungames.com/checkout")
    assert not allowed(robots, "https://limitedrungames.com/cart/")


def test_shopify_wildcard_rules_bite():
    robots = _robots("limitedrungames.com")
    sorted_url = "https://limitedrungames.com/collections/all?sort_by=price"
    assert not allowed(robots, sorted_url)


def test_the_longest_rule_wins_and_allow_wins_a_tie():
    robots = parse_robots(
        "User-agent: *\n"
        "Disallow: /collections/\n"
        "Allow: /collections/games/\n"
        "Disallow: /same\n"
        "Allow: /same\n"
    )
    assert not allowed(robots, "https://example.test/collections/merch/x")
    assert allowed(robots, "https://example.test/collections/games/x")
    assert allowed(robots, "https://example.test/same")


def test_wildcard_and_end_anchor():
    robots = parse_robots("User-agent: *\nDisallow: /*.json$\n")
    assert not allowed(robots, "https://example.test/products.json")
    assert allowed(robots, "https://example.test/products.json?page=1")


def test_a_group_for_our_token_replaces_the_star_group():
    robots = parse_robots(
        "User-agent: *\nDisallow: /\n\nUser-agent: joey-haas.dev\nAllow: /\n"
    )
    assert allowed(robots, "https://example.test/collections/x/products.json")


def test_percent_encoding_is_compared_per_rfc():
    # The Aksys EU handle: a raw ™ in a rule matches its encoded form.
    robots = parse_robots("User-agent: *\nDisallow: /collections/nintendo-switch™\n")
    url = "https://example.test/collections/nintendo-switch%e2%84%a2-1/products.json"
    assert not allowed(robots, url)
    tilde = parse_robots("User-agent: *\nDisallow: /~a\n")
    assert not allowed(tilde, "https://example.test/%7Ea")


def test_a_disallowed_collection_is_refused():
    robots = parse_robots("User-agent: *\nDisallow: /collections/\n")
    assert not allowed(robots, f"https://example.test{SHOPIFY_PATH}")
    assert allowed(robots, "https://example.test/products/thing")


def test_robots_txt_itself_is_always_allowed():
    assert DISALLOW_ALL.can_fetch("https://example.test/robots.txt")
    assert not DISALLOW_ALL.can_fetch(f"https://example.test{SHOPIFY_PATH}")


def test_never_checked_is_allowed():
    assert allowed(None, f"https://example.test{SHOPIFY_PATH}")


def _client(handler):
    return httpx2.AsyncClient(transport=httpx2.MockTransport(handler))


@pytest.mark.asyncio
async def test_robots_for_parses_a_200():
    body = (ROBOTS / "superraregames.com.txt").read_text()

    def handler(request):
        assert str(request.url) == "https://superraregames.com/robots.txt"
        return httpx2.Response(200, text=body)

    async with _client(handler) as client:
        robots = await robots_for("superraregames.com", client)
    assert robots is not None
    assert allowed(robots, f"https://superraregames.com{SHOPIFY_PATH}")


@pytest.mark.asyncio
async def test_robots_for_a_4xx_means_no_rules():
    async with _client(lambda request: httpx2.Response(404)) as client:
        assert await robots_for("example.test", client) == ALLOW_ALL


@pytest.mark.asyncio
async def test_robots_for_a_5xx_means_disallow_all():
    async with _client(lambda request: httpx2.Response(503)) as client:
        assert await robots_for("example.test", client) == DISALLOW_ALL


@pytest.mark.asyncio
async def test_robots_for_a_network_error_means_disallow_all():
    def handler(request):
        raise httpx2.ConnectError("refused", request=request)

    async with _client(handler) as client:
        assert await robots_for("example.test", client) == DISALLOW_ALL


def test_a_star_heavy_pattern_is_matched_in_linear_time():
    robots = parse_robots("User-agent: *\nDisallow: /*a*a*a*a*a*a*a*a*a*a*a*b\n")
    started = time.perf_counter()
    result = allowed(robots, "https://example.test/" + "a" * 5000)
    assert result is True
    assert time.perf_counter() - started < 0.1


@pytest.mark.parametrize(
    ("pattern", "path", "matches"),
    [
        ("/a*b*c", "/axxbyyc", True),
        ("/a*b*c", "/axxcyyb", False),
        ("/a*c$", "/abc", True),
        ("/a*c$", "/abcd", False),
        ("/*.json$", "/p.json", True),
        ("/p", "/products", True),
        ("/p$", "/products", False),
        ("*", "/anything", True),
        ("/a**b", "/ab", True),
    ],
)
def test_glob_matching(pattern, path, matches):
    robots = parse_robots(f"User-agent: *\nDisallow: {pattern}\n")
    assert allowed(robots, f"https://example.test{path}") is not matches
