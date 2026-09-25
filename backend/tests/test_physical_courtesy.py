"""robots.txt checks, on every store host's recorded robots.txt."""

from pathlib import Path

import httpx2
import pytest

from physical_sources.courtesy import allowed, parse_robots, robots_for

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


def test_shopify_rules_still_bite():
    # The recorded file is not vacuous: it refuses the admin, as every
    # Shopify store's does.
    robots = _robots("limitedrungames.com")
    assert not allowed(robots, "https://limitedrungames.com/admin")


def test_a_disallowed_collection_is_refused():
    robots = parse_robots("User-agent: *\nDisallow: /collections/\n")
    assert not allowed(robots, f"https://example.test{SHOPIFY_PATH}")
    assert allowed(robots, "https://example.test/products/thing")


def test_unreadable_robots_is_allowed():
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
async def test_robots_for_a_missing_file_is_none():
    async with _client(lambda request: httpx2.Response(404)) as client:
        assert await robots_for("example.test", client) is None


@pytest.mark.asyncio
async def test_robots_for_a_network_error_is_none():
    def handler(request):
        raise httpx2.ConnectError("refused", request=request)

    async with _client(handler) as client:
        assert await robots_for("example.test", client) is None
