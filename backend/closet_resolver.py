"""A product link read into a garment draft's facts (issue #398, design D11).

`resolve(url)` answers one `Resolution`: either a `Product` (title, brand,
price, image and the colours the store offers, each with its sizes) or, when
nothing could be read, the link kept as typed with the sentence for why. It
never raises for a store's behaviour: robots, a refusal, a timeout, a private
address, a page that is no product all come back as a kept link.

Order of trust, as read from the store itself, never a model:

1. Shopify's per-product JSON, `<origin>/products/<handle>.json`.
2. JSON-LD (`Product`, or `ProductGroup` with `hasVariant`) on the page.
3. Otherwise the link is kept; its `<title>` / `og:title` is the name.

This is not in `physical_sources/` because it feeds drafts, not the catalogue,
but it reuses that package's courtesy: `HostThrottle` (2 requests a second a
host) and `Robots` (RFC 9309, an unreachable robots.txt is a disallow).

Every fetch is guarded like `intake/seed_image.py`: https on 443 only, every
address the host resolves to public, redirects followed by hand (a product
redirect may only stay on the store's own site), a byte cap, a total deadline
and no compression. The residual DNS-rebinding risk noted there applies here
too; the caller is an admin-only route fed by the owner's own paste.

The parsers (`parse_shopify_json`, `parse_jsonld`, `page_title`) are pure.
"""

from __future__ import annotations

import asyncio
import hashlib
import html
import ipaddress
import json
import re
import socket
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation
from typing import Any
from urllib.parse import parse_qs, quote, unquote, urljoin, urlsplit, urlunsplit

import httpx2

from intake.seed_image import _public
from physical_sources.base import HostThrottle
from physical_sources.courtesy import Robots, allowed, robots_for
from physical_sources.limits import MAX_PRICE, USER_AGENT

MAX_BYTES = 3 * 1024 * 1024
MAX_REDIRECTS = 3
# The whole resolution: robots, product JSON, page, redirects and bodies.
DEADLINE_SECONDS = 20.0
TIMEOUT = httpx2.Timeout(8.0, connect=4.0)
MAX_URL_CHARS = 2000
# Colours and sizes kept per product: a page that lists more is not a garment.
MAX_COLOURS = 40
MAX_SIZES = 60

Resolver = Callable[[str], Awaitable[list[str]]]

# Spacing per host, for the process: two requests a second, as the stores'
# catalogue walk is held to.
_THROTTLE = HostThrottle(per_second=2)

# Hosts whose products have their own `garment_products.source`.
STORE_SOURCES = {"marinelayer.com": "marinelayer", "duer.com": "duer"}

COLOUR_OPTIONS = frozenset({"color", "colour"})


class LinkError(Exception):
    """A link that cannot be read; `code` is machine-readable and `message`
    is the owner's sentence."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


# --- what a link resolves to --------------------------------------------------


@dataclass(frozen=True)
class SizeOption:
    size: str | None
    variant_id: str | None
    available: bool | None

    def as_json(self) -> dict[str, Any]:
        return {
            "size": self.size,
            "variant_id": self.variant_id,
            "available": self.available,
        }


@dataclass(frozen=True)
class Colour:
    """One colour the product comes in. `external_id` is the store's id of
    the colour's first variant (a Shopify variant id, a JSON-LD sku or id),
    unique within the product: it keys the radio in Check."""

    external_id: str
    name: str | None
    image_url: str | None
    price: str | None
    sizes: tuple[SizeOption, ...] = ()

    def as_json(self) -> dict[str, Any]:
        return {
            "external_id": self.external_id,
            "title": self.name or "No colour listed",
            "color_name": self.name,
            "image_url": self.image_url,
            "price": self.price,
            "sizes": [size.as_json() for size in self.sizes],
        }


@dataclass(frozen=True)
class Product:
    via: str  # "shopify" or "jsonld"
    url: str
    title: str
    brand: str | None
    currency: str | None
    colours: tuple[Colour, ...]

    @property
    def image_url(self) -> str | None:
        return next((c.image_url for c in self.colours if c.image_url), None)

    def as_json(self) -> dict[str, Any]:
        """The snapshot: the parsed product, never the raw page."""
        return {
            "via": self.via,
            "url": self.url,
            "title": self.title,
            "brand": self.brand,
            "currency": self.currency,
            "colours": [colour.as_json() for colour in self.colours],
        }


@dataclass(frozen=True)
class Resolution:
    url: str
    product: Product | None = None
    # When there is no product: why, in the owner's words, and a name for the
    # entry taken from the page's title or the link itself.
    code: str | None = None
    message: str | None = None
    title: str | None = None


def source_for(url: str) -> str:
    """`garment_products.source` for a link's host: the store when it is one
    with its own source, else `link`."""
    host = (urlsplit(url).hostname or "").lower().removeprefix("www.")
    return STORE_SOURCES.get(host, "link")


# --- parsing: Shopify ---------------------------------------------------------


def shopify_handle(url: str) -> tuple[str, str] | None:
    """(origin, handle) for a `/products/<handle>` link, also behind
    `/collections/x` or a locale prefix; None for any other path."""
    parts = urlsplit(url)
    segments = [segment for segment in parts.path.split("/") if segment]
    if "products" not in segments:
        return None
    at = segments.index("products")
    if at + 1 >= len(segments):
        return None
    handle = unquote(segments[at + 1]).removesuffix(".json").removesuffix(".js")
    if (
        not handle
        or "/" in handle
        or any(c.isspace() or not c.isprintable() for c in handle)
    ):
        return None
    return f"{parts.scheme}://{parts.netloc}", handle


def item_ref(url: str, external_id: str) -> str:
    """The `garment_products.store_item_no` of one colour of one linked
    product: the store's own ids are only unique inside a product (a JSON-LD
    page without a sku is `c0` everywhere), so the host and path scope them.
    Cut to the column's 80 characters, hashed when it would overflow."""
    parts = urlsplit(url)
    host = (parts.hostname or "").lower().removeprefix("www.")
    full = f"{host}{parts.path.rstrip('/').lower()}|{external_id}"
    if len(full) <= 80:
        return full
    return f"{host[:30]}|{hashlib.sha1(full.encode()).hexdigest()}"


def link_variant(url: str) -> str | None:
    """The `?variant=` id a store link carries, if any."""
    values = parse_qs(urlsplit(url).query).get("variant")
    return values[0] if values else None


def _text(value: Any, limit: int = 400) -> str | None:
    if not isinstance(value, str | int | float) or isinstance(value, bool):
        return None
    text = " ".join(html.unescape(str(value)).split())
    return text[:limit] or None


def _price(value: Any) -> str | None:
    """A price to the cent as text, or None when it is no price a store means."""
    if value in (None, "") or isinstance(value, bool):
        return None
    try:
        price = Decimal(str(value)).quantize(Decimal("0.01"))
    except (InvalidOperation, ValueError):
        return None
    if not price.is_finite() or price < 0 or price > MAX_PRICE:
        return None
    return str(price)


def _https(url: Any, base: str | None = None) -> str | None:
    """An absolute https address for an image or link, else None."""
    if not isinstance(url, str) or not url.strip():
        return None
    absolute = urljoin(base, url.strip()) if base else url.strip()
    if absolute.startswith("//"):
        absolute = "https:" + absolute
    return absolute if absolute.startswith("https://") else None


def _tags(product: dict) -> list[str]:
    tags = product.get("tags") or []
    if isinstance(tags, str):
        tags = tags.split(",")
    return [tag.strip() for tag in tags if isinstance(tag, str) and tag.strip()]


def _colour_from_tags(product: dict) -> str | None:
    """Duer lists one product per colour with no Color option; its tags say
    `color_Chestnut`."""
    for tag in _tags(product):
        if tag.lower().startswith("color_"):
            return _text(tag[6:].replace("_", " "), 80)
    return None


def _colour_from_title(title: str) -> str | None:
    """The colour a one-product-per-colour store puts at the end of its title:
    after the last " | " ("The Classic Short-Sleeve Shirt in Linen | Cocoa",
    Everlane) when there is one, else after the last " - " ("No Sweat Taper -
    Chestnut", Duer). Verbatim; an empty suffix is no colour."""
    if title.rstrip().endswith("|"):
        return None
    for sep in (" | ", " - "):
        if sep in title:
            return _text(title.rsplit(sep, 1)[1], 80)
    return None


def parse_shopify_json(payload: Any, url: str) -> Product | None:
    """A Shopify per-product JSON (`/products/<handle>.json`) as a Product,
    or None when the body is not one with variants.

    Colours: variants grouped by the `Color`/`Colour` option; a product with
    no such option is one colour, read from its `color_` tag, else from the
    title after " | " or " - ", else unnamed. A size is the variant's other option
    values joined with " / " ("Small", "30 / 30"). A colour's image is its
    first variant's own image when the product gives one, else the
    product's first image."""
    product = payload.get("product") if isinstance(payload, dict) else None
    if not isinstance(product, dict):
        return None
    variants = [v for v in (product.get("variants") or []) if isinstance(v, dict)]
    title = _text(product.get("title"), 200)
    if not variants or not title:
        return None
    options = [o for o in (product.get("options") or []) if isinstance(o, dict)]
    names = [str(o.get("name") or "").strip().lower() for o in options]
    colour_at = next(
        (i for i, name in enumerate(names) if name in COLOUR_OPTIONS), None
    )
    images = [i for i in (product.get("images") or []) if isinstance(i, dict)]
    by_id = {i.get("id"): _https(i.get("src")) for i in images}
    first_image = next(
        (_https(i.get("src")) for i in images if _https(i.get("src"))), None
    )
    fallback_colour = (
        None
        if colour_at is not None
        else _colour_from_tags(product) or _colour_from_title(title)
    )

    def option(variant: dict, index: int) -> str | None:
        return _text(variant.get(f"option{index + 1}"), 80)

    def variant_image(variant: dict) -> str | None:
        found = by_id.get(variant.get("image_id"))
        if found:
            return found
        for image in images:
            if variant.get("id") in (image.get("variant_ids") or []):
                return _https(image.get("src"))
        return None

    groups: dict[str | None, list[dict]] = {}
    for variant in variants:
        key = option(variant, colour_at) if colour_at is not None else fallback_colour
        groups.setdefault(key, []).append(variant)
    if len(groups) > MAX_COLOURS:
        return None
    colours = []
    for name, group in groups.items():
        sizes = []
        for variant in group[:MAX_SIZES]:
            labels = [
                value
                for index in range(len(options))
                if index != colour_at and (value := option(variant, index))
            ]
            sizes.append(
                SizeOption(
                    size=" / ".join(labels)[:40] or None,
                    variant_id=_text(variant.get("id"), 40),
                    available=variant.get("available")
                    if isinstance(variant.get("available"), bool)
                    else None,
                )
            )
        lead = group[0]
        ordered = sorted(
            group, key=lambda v: (v.get("available") is not True, group.index(v))
        )
        colours.append(
            Colour(
                external_id=_text(lead.get("id"), 40) or f"c{len(colours)}",
                name=name,
                image_url=next(
                    (found for v in ordered if (found := variant_image(v))), None
                )
                or first_image,
                price=_price(ordered[0].get("price")),
                sizes=tuple(sizes),
            )
        )
    currency = _text(variants[0].get("price_currency"), 3)
    return Product(
        via="shopify",
        url=url,
        title=title,
        brand=_text(product.get("vendor"), 80),
        currency=currency.upper() if currency else None,
        colours=tuple(colours),
    )


# --- parsing: JSON-LD and the page --------------------------------------------

_LDJSON = re.compile(
    r"<script\b[^>]*\btype\s*=\s*[\"']application/ld\+json[\"'][^>]*>(.*?)</script>",
    re.IGNORECASE | re.DOTALL,
)
_TITLE = re.compile(r"<title[^>]*>(.*?)</title>", re.IGNORECASE | re.DOTALL)
_META = re.compile(r"<meta\b[^>]*>", re.IGNORECASE)
_ATTR = re.compile(r"([\w:-]+)\s*=\s*(\"[^\"]*\"|'[^']*')")


def _nodes(value: Any, depth: int = 0) -> list[dict]:
    """Every dict under a JSON-LD document in document order, @graph arrays
    included."""
    if depth > 6:
        return []
    if isinstance(value, list):
        return [n for item in value for n in _nodes(item, depth + 1)]
    if not isinstance(value, dict):
        return []
    found = [value]
    if value.get("@graph"):
        found += _nodes(value["@graph"], depth + 1)
    return found


def _types(node: dict) -> set[str]:
    kind = node.get("@type")
    kinds = kind if isinstance(kind, list) else [kind]
    return {k.rsplit("/", 1)[-1] for k in kinds if isinstance(k, str)}


def _ld_name(value: Any, limit: int = 80) -> str | None:
    if isinstance(value, dict):
        value = value.get("name")
    if isinstance(value, list):
        value = value[0] if value else None
    return _text(value, limit)


def _ld_image(value: Any, base: str) -> str | None:
    if isinstance(value, list):
        value = value[0] if value else None
    if isinstance(value, dict):
        value = value.get("url") or value.get("contentUrl")
    return _https(value, base)


def _ld_offers(value: Any) -> list[dict]:
    if isinstance(value, dict):
        nested = value.get("offers")
        return _ld_offers(nested) if nested else [value]
    if isinstance(value, list):
        return [o for item in value for o in _ld_offers(item)]
    return []


def _ld_price(offers: list[dict]) -> tuple[str | None, str | None]:
    for offer in offers:
        for key in ("price", "lowPrice"):
            price = _price(offer.get(key))
            if price:
                currency = _text(offer.get("priceCurrency"), 3)
                return price, currency.upper() if currency else None
    return None, None


def _ld_available(offers: list[dict]) -> bool | None:
    if not offers:
        return None
    states = [str(o.get("availability") or "") for o in offers]
    if not any(states):
        return None
    return any(s.rsplit("/", 1)[-1] == "InStock" for s in states)


def parse_jsonld(page: str, url: str) -> Product | None:
    """A `Product` or `ProductGroup` (its `hasVariant` Products are the
    colours and sizes) from the page's JSON-LD, or None.

    Variants are grouped by their `color`; a size is the variant's `size`.
    A plain Product is one colour. Relative addresses resolve against the
    page; only https images are kept."""
    roots: list[dict] = []
    for match in _LDJSON.finditer(page):
        try:
            roots.extend(_nodes(json.loads(match.group(1).strip())))
        except (ValueError, RecursionError):
            continue
    candidates = [n for n in roots if _types(n) & {"Product", "ProductGroup"}]
    if not candidates:
        return None
    # The node that names the most variants wins (a page may carry a bare
    # ProductGroup beside the full one); ties keep page order.
    node = max(
        candidates,
        key=lambda n: (
            len([m for m in _nodes(n.get("hasVariant") or []) if m is not n]),
            "ProductGroup" in _types(n),
        ),
    )
    title = _ld_name(node.get("name"), 200)
    if not title:
        return None
    members = [m for m in _nodes(node.get("hasVariant") or []) if m is not node]
    members = [m for m in members if _types(m) & {"Product"} or not _types(m)]
    sources = members or [node]
    groups: dict[str | None, list[dict]] = {}
    for member in sources:
        groups.setdefault(_ld_name(member.get("color")), []).append(member)
    if len(groups) > MAX_COLOURS:
        return None
    used: set[str] = set()
    colours = []
    currency = None
    for name, group_members in groups.items():
        sizes = []
        for member in group_members[:MAX_SIZES]:
            offers = _ld_offers(member.get("offers"))
            ident = _text(member.get("sku") or member.get("@id"), 40)
            sizes.append(
                SizeOption(
                    size=_ld_name(member.get("size"), 40),
                    variant_id=ident,
                    available=_ld_available(offers),
                )
            )
        lead = group_members[0]
        offers = _ld_offers(lead.get("offers"))
        price, seen = _ld_price(offers)
        currency = currency or seen
        ident = _text(lead.get("sku") or lead.get("@id"), 40) or f"c{len(colours)}"
        while ident in used:
            ident += "+"
        used.add(ident)
        colours.append(
            Colour(
                external_id=ident,
                name=name,
                image_url=_ld_image(lead.get("image"), url)
                or _ld_image(node.get("image"), url),
                price=price,
                sizes=tuple(s for s in sizes if s.size or len(sizes) > 1),
            )
        )
    return Product(
        via="jsonld",
        url=url,
        title=title,
        brand=_ld_name(node.get("brand")),
        currency=currency,
        colours=tuple(colours),
    )


def page_title(page: str) -> str | None:
    """`og:title`, else `<title>`, as plain text."""
    for tag in _META.findall(page):
        attrs = {k.lower(): v[1:-1] for k, v in _ATTR.findall(tag)}
        if attrs.get("property", "").lower() == "og:title" and attrs.get("content"):
            if title := _text(attrs["content"], 200):
                return title
    match = _TITLE.search(page)
    return _text(match.group(1), 200) if match else None


def name_from_link(url: str) -> str:
    """A readable name for a link nothing could be read from: its product
    handle in words, else its host."""
    parts = urlsplit(url)
    found = shopify_handle(url)
    if found:
        return found[1].replace("-", " ").replace("_", " ").strip().capitalize()[:120]
    return (parts.hostname or "link")[:120]


# --- fetching -----------------------------------------------------------------


async def resolve_host(host: str) -> list[str]:
    """Every address `host` resolves to."""
    loop = asyncio.get_running_loop()
    try:
        infos = await loop.getaddrinfo(host, 443, type=socket.SOCK_STREAM)
    except OSError:
        raise LinkError("unreachable", f"{host} does not resolve") from None
    return sorted({info[4][0] for info in infos})


async def check_url(url: str, resolver: Resolver = resolve_host) -> str:
    """The URL's host once it is known to be an https address on the public
    internet, else LinkError."""
    try:
        parts = urlsplit(url)
        port = parts.port
    except ValueError:
        raise LinkError("not_a_link", "That is not a valid link") from None
    if not parts.scheme or not parts.hostname:
        raise LinkError("not_a_link", "That is not a valid link")
    decoded = unquote(url)
    if any(c.isspace() or not c.isprintable() for c in decoded):
        raise LinkError("not_a_link", "That link has characters a link cannot hold")
    if parts.scheme != "https":
        raise LinkError(
            "not_https", "Only https links are read; the link is kept as typed"
        )
    if parts.username or parts.password or port not in (None, 443):
        raise LinkError("not_https", "Only plain https links are read")
    host = parts.hostname
    try:
        addresses = [str(ipaddress.ip_address(host))]
    except ValueError:
        addresses = await resolver(host)
    if not addresses or not all(_public(address) for address in addresses):
        raise LinkError("private_address", "That link is not on the public internet")
    return host


@dataclass
class Answer:
    """What a request came back with: enough of a response for `robots_for`."""

    status_code: int
    headers: Any
    content: bytes
    url: str
    location: str | None = None
    encoding: str = "utf-8"

    @property
    def text(self) -> str:
        try:
            return self.content.decode(self.encoding, errors="replace")
        except LookupError:
            return self.content.decode("utf-8", errors="replace")


def _same_site(host: str, other: str | None) -> bool:
    return (other or "").removeprefix("www.") == host.removeprefix("www.")


@dataclass
class Fetcher:
    """Guarded, throttled, robots-honouring GETs for one resolution batch;
    robots.txt is read once per host. `client` and `resolver` are for tests."""

    client: httpx2.AsyncClient | None = None
    resolver: Resolver = resolve_host
    throttle: HostThrottle | None = field(default_factory=lambda: _THROTTLE)
    _robots: dict[str, Robots] = field(default_factory=dict)
    _own: bool = False

    async def __aenter__(self) -> Fetcher:
        if self.client is None:
            self.client = httpx2.AsyncClient(
                timeout=TIMEOUT,
                follow_redirects=False,
                headers={
                    "User-Agent": USER_AGENT,
                    # The byte cap counts what is read; compression could hide
                    # a bomb.
                    "Accept-Encoding": "identity",
                },
            )
            self._own = True
        return self

    async def __aexit__(self, *_exc) -> None:
        if self._own and self.client is not None:
            await self.client.aclose()
            self.client = None

    async def _once(self, url: str, accept: str) -> Answer:
        assert self.client is not None
        try:
            async with self.client.stream(
                "GET", url, headers={"Accept": accept}
            ) as response:
                if response.is_redirect:
                    return Answer(
                        response.status_code,
                        response.headers,
                        b"",
                        url,
                        location=response.headers.get("location") or "",
                    )
                encoding = (
                    response.headers.get("content-encoding", "identity").strip().lower()
                )
                if encoding not in ("", "identity"):
                    raise LinkError("unreadable", "The page came compressed")
                declared = response.headers.get("content-length")
                if declared and declared.isdigit() and int(declared) > MAX_BYTES:
                    raise LinkError("too_large", "That page is too large to read")
                data = bytearray()
                async for chunk in response.aiter_bytes():
                    data.extend(chunk)
                    if len(data) > MAX_BYTES:
                        raise LinkError("too_large", "That page is too large to read")
                return Answer(
                    response.status_code,
                    response.headers,
                    bytes(data),
                    url,
                    encoding=response.charset_encoding or "utf-8",
                )
        except (httpx2.HTTPError, httpx2.InvalidURL) as error:
            raise LinkError(
                "unreachable",
                f"The store could not be reached ({type(error).__name__})",
            ) from None

    async def get(self, url: str, accept: str, *, own_site: bool = True) -> Answer:
        """One GET with the guard, the throttle and (unless this is
        robots.txt itself) robots. A redirect off the store's own site is
        refused when `own_site`, since that host's robots were never read.
        Any status comes back as an Answer; only a refusal to ask raises."""
        home = urlsplit(url).hostname or ""
        for _ in range(MAX_REDIRECTS + 1):
            host = await check_url(url, self.resolver)
            if own_site and urlsplit(url).path != "/robots.txt":
                if not allowed(await self._robots_of(host), url):
                    raise LinkError(
                        "robots",
                        f"{host} asks programs not to read that page "
                        "(robots.txt); the link is kept as typed",
                    )
            if self.throttle is not None:
                await self.throttle.wait(host)
            answer = await self._once(url, accept)
            if answer.location is None:
                return answer
            if not answer.location:
                raise LinkError("unreadable", "The link redirects nowhere")
            url = urljoin(url, answer.location)
            if own_site and not _same_site(home, urlsplit(url).hostname):
                raise LinkError(
                    "redirected",
                    f"The link redirects to {urlsplit(url).hostname}, "
                    "which is not read",
                )
        raise LinkError("unreadable", "The link redirects too often")

    async def _robots_of(self, host: str) -> Robots:
        if host not in self._robots:
            self._robots[host] = await robots_for(host, _RobotsClient(self))
        return self._robots[host]


class _RobotsClient:
    """The one method `robots_for` calls; throttled, guarded, and free to
    follow the file's redirects (a store's bare domain moves to www)."""

    def __init__(self, fetcher: Fetcher) -> None:
        self._fetcher = fetcher

    async def get(self, url: str) -> Answer:
        return await self._fetcher.get(url, "text/plain", own_site=False)


def _refusal(host: str, status: int) -> LinkError:
    if status == 404:
        return LinkError("not_found", f"{host} has no page at that link (404)")
    if status == 429:
        return LinkError(
            "refused", f"{host} asked us to slow down (429); try the link later"
        )
    if status in (401, 403):
        return LinkError(
            "refused", f"{host} refused the request ({status}); the link is kept"
        )
    return LinkError("refused", f"{host} answered {status}; the link is kept")


def _kind(answer: Answer) -> str:
    return str(answer.headers.get("content-type", "")).split(";")[0].strip().lower()


async def _shopify(fetcher: Fetcher, url: str) -> Product | None:
    found = shopify_handle(url)
    if found is None:
        return None
    origin, handle = found
    try:
        answer = await fetcher.get(
            f"{origin}/products/{quote(handle, safe='')}.json", "application/json"
        )
    except LinkError as error:
        if error.code == "robots":
            return None  # the page may still be allowed
        raise
    if answer.status_code != 200 or "json" not in _kind(answer):
        return None
    try:
        return parse_shopify_json(json.loads(answer.text), url)
    except (ValueError, RecursionError):
        return None


async def _resolve(url: str, fetcher: Fetcher) -> Resolution:
    product = await _shopify(fetcher, url)
    if product is not None:
        return Resolution(url, product=product)
    host = urlsplit(url).hostname or ""
    answer = await fetcher.get(url, "text/html,application/xhtml+xml")
    if answer.status_code != 200:
        raise _refusal(host, answer.status_code)
    if _kind(answer) not in ("text/html", "application/xhtml+xml"):
        raise LinkError("not_product", "That link is not a web page")
    page = answer.text
    product = parse_jsonld(page, url)
    if product is not None:
        return Resolution(url, product=product)
    return Resolution(
        url,
        code="not_product",
        message="No product details were found on that page; the link is kept as typed",
        title=page_title(page),
    )


def normalise(url: str) -> str:
    """The link as saved: trimmed, no fragment."""
    parts = urlsplit(url.strip())
    return urlunsplit(parts._replace(fragment=""))


async def resolve(url: str, *, fetcher: Fetcher | None = None) -> Resolution:
    """Reads one product link; see the module doc. Never raises for a store's
    behaviour. Pass a `fetcher` to share robots across several links."""
    url = normalise(url)
    try:
        async with asyncio.timeout(DEADLINE_SECONDS):
            if fetcher is not None:
                return await _resolve(url, fetcher)
            async with Fetcher() as own:
                return await _resolve(url, own)
    except LinkError as error:
        return Resolution(url, code=error.code, message=error.message)
    except TimeoutError:
        return Resolution(
            url, code="timeout", message="The store took too long; the link is kept"
        )
    except Exception:  # noqa: BLE001  one odd link must never fail a paste
        return Resolution(
            url,
            code="unreadable",
            message="That link could not be read; it is kept as typed",
        )
