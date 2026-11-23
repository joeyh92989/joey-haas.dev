"""The closet's link resolver (closet_resolver.py, #398).

Marine Layer and Duer are RECORDED fixtures (tests/fixtures/closet/, written
by scripts/record_closet_fixtures.py from the stores' public pages). Every
other body here is a small SYNTHETIC document, marked as such, made to reach
a branch the two stores do not (several colours, an @graph, a refusal)."""

from __future__ import annotations

import json
from pathlib import Path

import httpx2
import pytest

import closet_resolver as cr
from closet_resolver import (
    Fetcher,
    parse_jsonld,
    parse_shopify_json,
    resolve,
    shopify_handle,
)

FIXTURES = Path(__file__).parent / "fixtures" / "closet"
ML = "https://www.marinelayer.com/products/chalet-lounge-pant"
DUER = "https://www.duer.com/products/no-sweat-athletic-taper-chestnut"


def fixture(name: str) -> str:
    return (FIXTURES / name).read_text(encoding="utf-8")


async def public(host):
    return ["93.184.216.34"]


ROBOTS_OK = "User-agent: *\nAllow: /\n"


class Store:
    """A mocked store: path -> (status, content type, body, extra headers).
    Records every URL asked, in order."""

    def __init__(self, routes: dict[str, tuple], robots: str | None = ROBOTS_OK):
        self.routes = dict(routes)
        if robots is not None:
            self.routes.setdefault("/robots.txt", (200, "text/plain", robots))
        self.asked: list[str] = []

    def __call__(self, request: httpx2.Request) -> httpx2.Response:
        self.asked.append(str(request.url))
        route = self.routes.get(request.url.path)
        if route is None:
            return httpx2.Response(404, content=b"not found")
        status, kind, body, *extra = route
        headers = {"content-type": kind, **(extra[0] if extra else {})}
        content = body if isinstance(body, bytes) else body.encode()
        return httpx2.Response(status, content=content, headers=headers)


def fetcher(store: Store) -> Fetcher:
    client = httpx2.AsyncClient(
        transport=httpx2.MockTransport(store), follow_redirects=False
    )
    return Fetcher(client=client, resolver=public, throttle=None)


def store_for(name: str, handle: str, with_json=True, with_page=True) -> Store:
    routes = {}
    if with_json:
        routes[f"/products/{handle}.json"] = (
            200,
            "application/json",
            fixture(f"{name}_product.json"),
        )
    if with_page:
        routes[f"/products/{handle}"] = (
            200,
            "text/html; charset=utf-8",
            fixture(f"{name}_page.html"),
        )
    return Store(routes, robots=fixture(f"{name}_robots.txt"))


# --- link shapes --------------------------------------------------------------


@pytest.mark.parametrize(
    "url,expected",
    [
        (ML, ("https://www.marinelayer.com", "chalet-lounge-pant")),
        (
            "https://shop.test/collections/men/products/a-tee?variant=7",
            ("https://shop.test", "a-tee"),
        ),
        ("https://shop.test/en-ca/products/a-tee.json", ("https://shop.test", "a-tee")),
        ("https://shop.test/products", None),
        ("https://shop.test/pages/about", None),
    ],
)
def test_shopify_handle(url, expected):
    assert shopify_handle(url) == expected


def test_link_variant_is_read_from_the_query():
    assert cr.link_variant("https://shop.test/products/a?variant=42") == "42"
    assert cr.link_variant("https://shop.test/products/a") is None


def test_source_follows_the_host():
    assert cr.source_for(ML) == "marinelayer"
    assert cr.source_for(DUER) == "duer"
    assert cr.source_for("https://duer.com/products/x") == "duer"
    assert cr.source_for("https://small-brand.test/products/x") == "link"


# --- recorded Shopify JSON ----------------------------------------------------


def test_marine_layer_product_json():
    product = parse_shopify_json(json.loads(fixture("marinelayer_product.json")), ML)
    assert product.via == "shopify"
    assert product.title == "Chalet Lounge Pant"
    assert product.brand == "Marine Layer"
    assert product.currency == "USD"
    [colour] = product.colours
    assert colour.name == "Grey Twill"
    assert colour.external_id == "42542862794826"
    assert colour.price == "118.00"
    assert colour.image_url.startswith("https://")
    assert [s.size for s in colour.sizes] == [
        "Small",
        "Medium",
        "Large",
        "Extra Large",
        "2XL",
    ]
    assert colour.sizes[0].variant_id == "42542862794826"


def test_duer_product_json_takes_its_colour_from_the_tag():
    product = parse_shopify_json(json.loads(fixture("duer_product.json")), DUER)
    assert product.title == "No Sweat Athletic Taper - Chestnut"
    assert product.brand == "Duer"
    [colour] = product.colours
    assert colour.name == "Chestnut"
    assert colour.price == "129.00"
    assert len(colour.sizes) == 16
    assert colour.sizes[0].size == "30 / 30"
    assert colour.image_url.startswith("https://cdn.shopify.com/")


def test_snapshot_is_the_parsed_product_not_the_page():
    product = parse_shopify_json(json.loads(fixture("duer_product.json")), DUER)
    snapshot = product.as_json()
    assert set(snapshot) == {"via", "url", "title", "brand", "currency", "colours"}
    assert "body_html" not in json.dumps(snapshot)
    json.dumps(snapshot)


def shopify(**over):
    """SYNTHETIC: a two-colour product with a Color option."""
    product = {
        "title": "Test Crew",
        "vendor": "Acme",
        "tags": "a, b",
        "options": [{"name": "Color"}, {"name": "Size"}],
        "images": [
            {"id": 1, "src": "https://cdn.test/red.jpg", "variant_ids": []},
            {"id": 2, "src": "https://cdn.test/blue.jpg", "variant_ids": []},
        ],
        "variants": [
            {
                "id": 11,
                "option1": "Red",
                "option2": "S",
                "price": "40.00",
                "available": False,
                "image_id": 1,
            },
            {
                "id": 12,
                "option1": "Red",
                "option2": "M",
                "price": "42.50",
                "available": True,
                "image_id": 1,
            },
            {
                "id": 13,
                "option1": "Blue",
                "option2": "S",
                "price": "40.00",
                "available": True,
                "image_id": 2,
            },
        ],
    }
    product.update(over)
    return {"product": product}


def test_several_colours_are_candidates_with_unique_ids_and_their_own_images():
    product = parse_shopify_json(shopify(), "https://shop.test/products/t")
    red, blue = product.colours
    assert (red.name, blue.name) == ("Red", "Blue")
    assert (red.external_id, blue.external_id) == ("11", "13")
    assert red.image_url == "https://cdn.test/red.jpg"
    assert blue.image_url == "https://cdn.test/blue.jpg"
    assert red.price == "42.50"  # an available size's price first
    assert [(s.size, s.available) for s in red.sizes] == [("S", False), ("M", True)]


def test_variant_image_falls_back_to_the_images_variant_ids_then_the_first_image():
    payload = shopify()
    for variant in payload["product"]["variants"]:
        variant["image_id"] = None
    payload["product"]["images"][1]["variant_ids"] = [13]
    product = parse_shopify_json(payload, "https://shop.test/products/t")
    red, blue = product.colours
    assert blue.image_url == "https://cdn.test/blue.jpg"
    assert red.image_url == "https://cdn.test/red.jpg"  # the product's first image


@pytest.mark.parametrize(
    "payload",
    [None, [], {}, {"product": []}, {"product": {"title": "x", "variants": []}}],
)
def test_a_body_that_is_not_a_product_is_none(payload):
    assert parse_shopify_json(payload, "https://shop.test/products/t") is None


def test_an_http_image_is_not_kept():
    payload = shopify()
    for image in payload["product"]["images"]:
        image["src"] = image["src"].replace("https", "http")
    product = parse_shopify_json(payload, "https://shop.test/products/t")
    assert product.image_url is None


# --- JSON-LD ------------------------------------------------------------------


def test_marine_layer_page_jsonld_is_one_product():
    product = parse_jsonld(fixture("marinelayer_page.html"), ML)
    assert product.via == "jsonld"
    assert product.title == "Chalet Lounge Pant"
    assert product.brand == "Marine Layer"
    [colour] = product.colours
    assert colour.price == "118.00"
    assert colour.image_url.startswith("https://www.marinelayer.com/cdn/")


def test_duer_page_jsonld_is_a_group_whose_variants_are_sizes_of_one_colour():
    product = parse_jsonld(fixture("duer_page.html"), DUER)
    assert product.title == "No Sweat Athletic Taper - Chestnut"
    [colour] = product.colours
    assert colour.name == "Chestnut"
    assert len(colour.sizes) == 16
    assert colour.sizes[0].size == "30W / 30L"
    assert colour.sizes[0].variant_id == "MFNR1002-DR1-30-30"
    assert colour.price == "129.00"


GROUP = """<html><head><title>x</title>
<script type="application/ld+json">
{"@context":"https://schema.org","@graph":[
 {"@type":"WebSite","name":"Shop"},
 {"@type":"ProductGroup","name":"Synthetic Jacket",
  "brand":{"@type":"Brand","name":"Acme"},
  "image":"/img/group.jpg","hasVariant":[
   {"@type":"Product","sku":"J-RED-S","color":"Red","size":"S",
    "image":["https://cdn.test/red.jpg"],
    "offers":{"@type":"Offer","price":"90","priceCurrency":"USD","availability":"https://schema.org/InStock"}},
   {"@type":"Product","sku":"J-RED-M","color":"Red","size":"M",
    "offers":[{"@type":"Offer","price":"90","availability":"https://schema.org/OutOfStock"}]},
   {"@type":"Product","sku":"J-BLU-S","color":"Blue","size":"S",
    "offers":{"@type":"AggregateOffer","lowPrice":"85.5","priceCurrency":"USD"}}]}]}
</script></head></html>"""


def test_synthetic_group_in_a_graph_gives_colours_sizes_and_prices():
    product = parse_jsonld(GROUP, "https://shop.test/products/j")
    assert product.title == "Synthetic Jacket"
    assert product.brand == "Acme"
    assert product.currency == "USD"
    red, blue = product.colours
    assert (red.name, red.external_id) == ("Red", "J-RED-S")
    assert (blue.name, blue.external_id) == ("Blue", "J-BLU-S")
    assert [(s.size, s.available) for s in red.sizes] == [("S", True), ("M", False)]
    assert red.image_url == "https://cdn.test/red.jpg"
    # The group's own relative image is the fallback, made absolute.
    assert blue.image_url == "https://shop.test/img/group.jpg"
    assert blue.price == "85.50"


def test_a_bare_product_with_no_colour_is_one_unnamed_colour():
    page = (
        '<script type="application/ld+json">'
        '{"@type":["Thing","Product"],"name":"Synthetic Hat","sku":"H1",'
        '"offers":{"price":19.99}}</script>'
    )
    product = parse_jsonld(page, "https://shop.test/p/hat")
    [colour] = product.colours
    assert colour.name is None and colour.external_id == "H1"
    assert colour.price == "19.99"


@pytest.mark.parametrize(
    "page",
    [
        "<html></html>",
        '<script type="application/ld+json">{not json}</script>',
        '<script type="application/ld+json">{"@type":"Organization"}</script>',
        '<script type="application/ld+json">{"@type":"Product"}</script>',
    ],
)
def test_pages_without_a_product_are_none(page):
    assert parse_jsonld(page, "https://shop.test/p") is None


def test_page_title_prefers_og_title():
    page = (
        "<title> Plain &amp; Simple </title>"
        '<meta property="og:title" content="Og &amp; Title">'
    )
    assert cr.page_title(page) == "Og & Title"
    assert cr.page_title("<title> Plain &amp; Simple </title>") == "Plain & Simple"
    assert cr.page_title("<p>none</p>") is None


def test_name_from_link_reads_the_handle_else_the_host():
    assert cr.name_from_link(ML) == "Chalet lounge pant"
    assert cr.name_from_link("https://small-brand.test/shop/x") == "small-brand.test"


# --- resolving: the order of trust --------------------------------------------


@pytest.mark.asyncio
async def test_marine_layer_resolves_from_the_product_json():
    store = store_for("marinelayer", "chalet-lounge-pant")
    async with fetcher(store) as f:
        found = await resolve(ML, fetcher=f)
    assert found.product.via == "shopify"
    assert found.product.title == "Chalet Lounge Pant"
    # robots.txt first, then the JSON; the page is never fetched.
    assert store.asked == [
        "https://www.marinelayer.com/robots.txt",
        "https://www.marinelayer.com/products/chalet-lounge-pant.json",
    ]


@pytest.mark.asyncio
async def test_duer_resolves_from_the_product_json():
    store = store_for("duer", "no-sweat-athletic-taper-chestnut")
    async with fetcher(store) as f:
        found = await resolve(DUER, fetcher=f)
    assert found.product.via == "shopify"
    assert found.product.colours[0].name == "Chestnut"
    assert found.product.brand == "Duer"


@pytest.mark.asyncio
async def test_without_product_json_the_pages_jsonld_is_used():
    store = store_for("duer", "no-sweat-athletic-taper-chestnut", with_json=False)
    async with fetcher(store) as f:
        found = await resolve(DUER, fetcher=f)
    assert found.product.via == "jsonld"
    assert len(found.product.colours[0].sizes) == 16


@pytest.mark.asyncio
async def test_a_page_without_a_product_is_kept_with_its_title():
    store = Store(
        {"/shop/x": (200, "text/html", "<title>Some Page</title><p>hello</p>")}
    )
    async with fetcher(store) as f:
        found = await resolve("https://shop.test/shop/x", fetcher=f)
    assert found.product is None
    assert found.code == "not_product"
    assert found.title == "Some Page"
    # No /products/ path: no product JSON is tried.
    assert store.asked == [
        "https://shop.test/robots.txt",
        "https://shop.test/shop/x",
    ]


# --- a store that refuses -----------------------------------------------------


@pytest.mark.asyncio
async def test_robots_disallow_keeps_the_link_and_asks_for_nothing_else():
    store = Store(
        {"/products/t.json": (200, "application/json", "{}")},
        robots="User-agent: *\nDisallow: /products/\n",
    )
    async with fetcher(store) as f:
        found = await resolve("https://shop.test/products/t", fetcher=f)
    assert found.code == "robots"
    assert "robots.txt" in found.message
    assert store.asked == ["https://shop.test/robots.txt"]


@pytest.mark.asyncio
async def test_an_unreachable_robots_file_is_a_disallow():
    store = Store({}, robots=None)
    store.routes["/robots.txt"] = (503, "text/plain", "down")
    async with fetcher(store) as f:
        found = await resolve("https://shop.test/products/t", fetcher=f)
    assert found.code == "robots"


@pytest.mark.asyncio
async def test_only_the_json_disallowed_falls_back_to_the_page():
    store = Store(
        {
            "/products/t": (
                200,
                "text/html",
                '<script type="application/ld+json">'
                '{"@type":"Product","name":"Synthetic Tee","sku":"T"}</script>',
            )
        },
        robots="User-agent: *\nDisallow: /products/t.json\n",
    )
    async with fetcher(store) as f:
        found = await resolve("https://shop.test/products/t", fetcher=f)
    assert found.product.title == "Synthetic Tee"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "status,words",
    [(403, "refused"), (429, "slow down"), (404, "no page"), (500, "answered 500")],
)
async def test_a_refusal_is_a_kept_link_with_a_sentence(status, words):
    store = Store({"/products/t.json": (status, "text/plain", "no")})
    store.routes["/products/t"] = (status, "text/plain", "no")
    async with fetcher(store) as f:
        found = await resolve("https://shop.test/products/t", fetcher=f)
    assert found.product is None
    assert words in found.message


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "url,code",
    [
        ("http://shop.test/products/t", "not_https"),
        ("https://user:pw@shop.test/products/t", "not_https"),
        ("https://shop.test:8443/products/t", "not_https"),
        ("https://127.0.0.1/products/t", "private_address"),
        ("https://169.254.169.254/latest/meta-data", "private_address"),
        ("not a link", "not_a_link"),
    ],
)
async def test_unsafe_links_are_kept_and_nothing_is_asked(url, code):
    store = Store({})
    async with fetcher(store) as f:
        found = await resolve(url, fetcher=f)
    assert found.code == code
    assert store.asked == []


@pytest.mark.asyncio
async def test_a_host_that_resolves_privately_is_refused():
    async def private(host):
        return ["93.184.216.34", "10.0.0.5"]

    store = Store({})
    f = fetcher(store)
    f.resolver = private
    async with f:
        found = await resolve("https://shop.test/products/t", fetcher=f)
    assert found.code == "private_address"
    assert store.asked == []


@pytest.mark.asyncio
async def test_a_redirect_off_the_store_is_refused():
    store = Store(
        {
            "/products/t.json": (
                302,
                "text/plain",
                "",
                {"location": "https://elsewhere.test/products/t.json"},
            )
        }
    )
    async with fetcher(store) as f:
        found = await resolve("https://shop.test/products/t", fetcher=f)
    assert found.code == "redirected"
    assert not any("elsewhere.test" in url for url in store.asked)


@pytest.mark.asyncio
async def test_a_redirect_to_the_stores_www_is_followed():
    store = Store(
        {"/products/t.json": (301, "text/plain", "", {"location": "/new.json"})}
    )
    store.routes["/new.json"] = (200, "application/json", json.dumps(shopify()))
    async with fetcher(store) as f:
        found = await resolve("https://shop.test/products/t", fetcher=f)
    assert found.product.title == "Test Crew"


@pytest.mark.asyncio
async def test_a_redirect_to_a_private_address_is_refused():
    store = Store(
        {
            "/products/t.json": (
                302,
                "text/plain",
                "",
                {"location": "https://127.0.0.1/x"},
            )
        }
    )
    async with fetcher(store) as f:
        found = await resolve("https://shop.test/products/t", fetcher=f)
    assert found.product is None
    assert found.code in ("redirected", "private_address")


@pytest.mark.asyncio
async def test_an_oversize_page_is_refused(monkeypatch):
    monkeypatch.setattr(cr, "MAX_BYTES", 100)
    store = Store({"/shop/x": (200, "text/html", "x" * 500)})
    async with fetcher(store) as f:
        found = await resolve("https://shop.test/shop/x", fetcher=f)
    assert found.code == "too_large"


@pytest.mark.asyncio
async def test_a_compressed_answer_is_refused():
    import gzip

    store = Store(
        {
            "/shop/x": (
                200,
                "text/html",
                gzip.compress(b"<p>x</p>"),
                {"content-encoding": "gzip"},
            )
        }
    )
    async with fetcher(store) as f:
        found = await resolve("https://shop.test/shop/x", fetcher=f)
    assert found.code == "unreadable"


@pytest.mark.asyncio
async def test_a_non_page_is_not_a_product():
    store = Store({"/shop/x": (200, "image/png", b"\x89PNG")})
    async with fetcher(store) as f:
        found = await resolve("https://shop.test/shop/x", fetcher=f)
    assert found.code == "not_product"


@pytest.mark.asyncio
async def test_a_transport_failure_is_kept():
    def boom(request):
        raise httpx2.ConnectError("down")

    client = httpx2.AsyncClient(transport=httpx2.MockTransport(boom))
    async with Fetcher(client=client, resolver=public, throttle=None) as f:
        found = await resolve("https://shop.test/shop/x", fetcher=f)
    # robots.txt is unreachable, which is a disallow.
    assert found.code == "robots"


@pytest.mark.asyncio
async def test_the_deadline_keeps_the_link(monkeypatch):
    import asyncio

    monkeypatch.setattr(cr, "DEADLINE_SECONDS", 0.05)

    async def slow(host):
        await asyncio.sleep(1)
        return ["93.184.216.34"]

    f = fetcher(Store({}))
    f.resolver = slow
    async with f:
        found = await resolve("https://shop.test/products/t", fetcher=f)
    assert found.code == "timeout"


@pytest.mark.asyncio
async def test_hosts_are_spaced_by_the_throttle():
    waited = []

    class Spy:
        async def wait(self, host):
            waited.append(host)

    store = Store({"/shop/x": (200, "text/html", "<p>x</p>")})
    f = fetcher(store)
    f.throttle = Spy()
    async with f:
        await resolve("https://shop.test/shop/x", fetcher=f)
    # robots.txt and the page each wait their turn.
    assert waited == ["shop.test", "shop.test"]


# --- one odd link never breaks a paste ----------------------------------------


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "url",
    [
        "https://shop.test/products/a%00b",
        "https://shop.test/products/%0d%0aX-Evil:1",
        "https://shop.test/products/a b",
    ],
)
async def test_control_characters_in_a_handle_never_reach_the_request(url):
    store = Store({"/products/x": (200, "text/html", "<p>x</p>")})
    async with fetcher(store) as f:
        found = await resolve(url, fetcher=f)
    assert found.product is None
    assert found.code == "not_a_link"
    assert store.asked == []


@pytest.mark.asyncio
async def test_an_invalid_url_error_is_a_kept_link():
    def boom(request):
        raise httpx2.InvalidURL("bad")

    client = httpx2.AsyncClient(transport=httpx2.MockTransport(boom))
    async with Fetcher(client=client, resolver=public, throttle=None) as f:
        found = await resolve("https://shop.test/shop/x", fetcher=f)
    assert found.product is None


@pytest.mark.asyncio
async def test_an_unknown_charset_is_read_as_utf8():
    store = Store(
        {
            "/shop/x": (
                200,
                "text/html; charset=no-such-charset",
                "<title>Fine Page</title>",
            )
        }
    )
    async with fetcher(store) as f:
        found = await resolve("https://shop.test/shop/x", fetcher=f)
    assert found.title == "Fine Page"


@pytest.mark.asyncio
async def test_json_nested_past_the_recursion_limit_is_not_a_product():
    store = Store(
        {
            "/products/t.json": (200, "application/json", "[" * 200000),
            "/products/t": (200, "text/html", "<p>none</p>"),
        }
    )
    async with fetcher(store) as f:
        found = await resolve("https://shop.test/products/t", fetcher=f)
    assert found.product is None and found.code == "not_product"


@pytest.mark.asyncio
async def test_any_unexpected_error_is_a_kept_link(monkeypatch):
    async def explode(self, url, accept, *, own_site=True):
        raise RuntimeError("surprise")

    monkeypatch.setattr(Fetcher, "get", explode)
    async with fetcher(Store({})) as f:
        found = await resolve("https://shop.test/products/t", fetcher=f)
    assert found.code == "unreadable"


def test_nat64_and_mapped_addresses_are_not_public():
    from intake.seed_image import _public

    assert not _public("64:ff9b::7f00:1")  # NAT64 for 127.0.0.1
    assert not _public("64:ff9b::808:808")
    assert not _public("::ffff:10.0.0.5")
    assert _public("93.184.216.34")


def test_scoped_ids_differ_by_product_and_stay_within_the_column():
    a = cr.item_ref("https://shop.test/products/a", "c0")
    b = cr.item_ref("https://shop.test/products/b", "c0")
    assert a != b
    assert a == cr.item_ref("https://www.shop.test/products/a?variant=1", "c0")
    long = cr.item_ref("https://shop.test/products/" + "x" * 300, "c0")
    assert len(long) <= 80
    assert long != cr.item_ref("https://shop.test/products/" + "x" * 301, "c0")


def one_per_colour(title, **over):
    """SYNTHETIC: a product with only a Size option, as a store that sells
    each colour as its own product lists it (Everlane)."""
    product = {
        "title": title,
        "vendor": "Acme",
        "tags": "",
        "options": [{"name": "Size"}],
        "images": [{"id": 1, "src": "https://cdn.test/c.jpg", "variant_ids": []}],
        "variants": [
            {"id": 21, "option1": "S", "price": "60.00", "available": True},
            {"id": 22, "option1": "M", "price": "60.00", "available": True},
        ],
    }
    product.update(over)
    return {"product": product}


@pytest.mark.parametrize(
    "title, colour",
    [
        ("The Classic Short-Sleeve Shirt in Linen | Cocoa", "Cocoa"),
        ("Shirt | Dusty  Rose", "Dusty Rose"),
        ("Shirt |    Cocoa", "Cocoa"),
        ("Shirt | Linen | Cocoa", "Cocoa"),
        ("Shirt - Taper | Cocoa", "Cocoa"),
        ("Shirt | ", None),
        ("Shirt |", None),
        ("Shirt|Cocoa", None),
        ("Plain Shirt", None),
        ("Taper - Chestnut", "Chestnut"),
    ],
)
def test_a_one_product_per_colour_title_gives_the_colour(title, colour):
    product = parse_shopify_json(one_per_colour(title), "https://shop.test/products/t")
    assert product.title == " ".join(title.split())
    assert [c.name for c in product.colours] == [colour]
    assert [s.size for s in product.colours[0].sizes] == ["S", "M"]


def test_a_colour_option_beats_the_title_suffix():
    product = parse_shopify_json(
        shopify(title="Test Crew | Green"), "https://shop.test/products/t"
    )
    assert [c.name for c in product.colours] == ["Red", "Blue"]


def test_the_colour_tag_beats_the_title_suffix():
    product = parse_shopify_json(
        one_per_colour("Shirt | Cocoa", tags="color_Sand"),
        "https://shop.test/products/t",
    )
    assert [c.name for c in product.colours] == ["Sand"]
