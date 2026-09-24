"""Records live physical-catalogue sources as test fixtures for E7c.

Run once, from backend/, by the owner:

    ./.venv/bin/python scripts/record_physical_fixtures.py

It records page 1 of every store handle in the E7c spec's STORES table, the
NSCollectors registry through the Google Sheets API, an excerpt of
switch2-tracker, one Limited Run product page and every host's robots.txt
into tests/fixtures/physical/. With --igdb it also records one page of IGDB's
N64 catalogue. Source names may be given to record only those; --list prints
the plan without fetching.

Why this exists: every physical_sources parser is written against real bytes,
never against a shape remembered from the research. A handle that has gone,
a sheet column that moved or a tag that changed shows up here, loudly, before
any parser is written against the old shape.

The stores, the tracker and robots.txt are keyless. The registry needs
GOOGLE_SHEETS_API_KEY and --igdb needs IGDB_CLIENT_ID and IGDB_CLIENT_SECRET,
all read from backend/.env the way the API reads them. Credentials never
leave this process: the Sheets key travels as a query parameter, so only
response bodies are written and no request URL carrying it is ever printed.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import re
import sys
from pathlib import Path
from urllib.parse import quote, urlsplit
from urllib.robotparser import RobotFileParser

import httpx2

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))

import config  # noqa: E402  (importing it loads backend/.env)

FIXTURES = BACKEND / "tests" / "fixtures" / "physical"

# Held here because the recorder runs before physical_sources exists. Keep in
# step with limits.USER_AGENT and the STORES table in stores.py.
USER_AGENT = "joey-haas.dev tracker (+https://joey-haas.dev; josephthaas@gmail.com)"
REQUEST_INTERVAL = 0.5  # 2 requests per second, across every host
TIMEOUT = 30.0
SHOPIFY_PAGE_SIZE = 250
WOO_PAGE_SIZE = 100

# Store key -> (domain, collection handles), from the spec §2 table.
SHOPIFY_STORES: dict[str, tuple[str, tuple[str, ...]]] = {
    "limited_run": (
        "limitedrungames.com",
        ("coming-soon", "latest-releases", "distro", "the-lr-vault", "in-stock-switch"),
    ),
    "iam8bit": (
        "iam8bit.com",
        ("games", "nintendo", "pre-order", "new", "restock"),
    ),
    "strictly_limited": (
        "strictlylimitedgames.com",
        (
            "nintendo-switch-2",
            "nintendo-switch",
            "pre-order",
            "coming-soon",
            "in-stock",
        ),
    ),
    "premium_edition": (
        "premiumeditiongames.com",
        (
            "pre-order",
            "latest-preorders",
            "coming-soon-2",
            "in-stock",
            "in-stock-partners",
        ),
    ),
    "nicalis": (
        "store.nicalis.com",
        ("nintendo-switch-2", "nintendo-switch", "new"),
    ),
    "aksys_us": (
        "store.aksysgames.com",
        ("preorder-now", "new-releases", "switch"),
    ),
    "aksys_eu": (
        "store.aksyseurope.com",
        (
            "nintendo-switch™-1",
            "nintendo-switch-game",
            "pre-order-now",
            "buy-now",
            "sold-out",
        ),
    ),
    "fangamer": ("fangamer.com", ("physical-games", "video-games")),
    "atari": ("atari.com", ("physical-games", "physical-cartridges")),
    "super_rare": (
        "superraregames.com",
        ("switch-2", "switch", "srg-store-new-web"),
    ),
}

# Store key -> (domain, product category id).
WOO_STORES: dict[str, tuple[str, int]] = {
    "pixelheart": ("pixelheart.eu", 65),
    "gamefairy": ("gamefairy.io", 22),
    "oneprint": ("1printgames.com", 18),
}

SHEET_ID = "1LEIJUOanvkKq9kv1fSOnD40GdE1Jt5LzSYsg8yAPmb8"
SHEETS_API = f"https://sheets.googleapis.com/v4/spreadsheets/{SHEET_ID}"
# Fixture name -> gid. Tab titles change; gids do not.
SHEET_TABS = {"details": 764784245, "summary": 558942722, "upcoming": 887819792}
DETAILS_REQUIRED = ("Game Title", "Region", "Card Type")
DETAILS_OPTIONAL = ("Master Title", "Cart ID", "Publisher", "Editions", "Release Date")

TRACKER_URL = (
    "https://raw.githubusercontent.com/codemaverick-hub/switch2-tracker/main/"
    "data/games.json"
)
# The repo has no licence, so only an excerpt is ever written.
TRACKER_EXCERPT = 30

LIMITED_RUN_HTML_HANDLES = ("coming-soon", "latest-releases")

IGDB_N64_QUERY = (
    "where platforms = (4) & total_rating_count >= 5; "
    "fields id,name,cover.image_id,first_release_date,total_rating_count; "
    "sort id asc; limit 500;"
)


def _safe(handle: str) -> str:
    """An ASCII file name for a handle: nintendo-switch™-1 -> nintendo-switch-tm-1."""
    return re.sub(r"[^a-z0-9-]+", "-", handle.replace("™", "-tm").lower()).strip("-")


def _shopify_sources() -> dict[str, list[tuple[str, str]]]:
    return {
        key: [
            (
                f"https://{domain}/collections/{quote(handle, safe='')}/products.json"
                f"?limit={SHOPIFY_PAGE_SIZE}&page=1",
                f"shopify/{key}/{_safe(handle)}.p1.json",
            )
            for handle in handles
        ]
        for key, (domain, handles) in SHOPIFY_STORES.items()
    }


def _woo_sources() -> dict[str, list[tuple[str, str]]]:
    return {
        key: [
            (
                f"https://{domain}/wp-json/wc/store/v1/products"
                f"?per_page={WOO_PAGE_SIZE}&page=1&category={category}",
                f"woocommerce/{key}/category-{category}.p1.json",
            )
        ]
        for key, (domain, category) in WOO_STORES.items()
    }


# Fixture name -> [(url, out_file)] for every fetch whose URL is known up
# front. The registry's tab URLs, the Limited Run product page and the IGDB
# page are decided during the run and listed by describe_dynamic().
SOURCES: dict[str, list[tuple[str, str]]] = {
    **_shopify_sources(),
    **_woo_sources(),
    "registry": [
        (f"{SHEETS_API}?fields=sheets.properties", "registry/properties.json")
    ],
    "tracker": [(TRACKER_URL, "tracker/games.json")],
}


def _hosts(names: list[str]) -> list[str]:
    hosts: list[str] = []
    for name in names:
        if name == "registry":
            continue  # the Sheets API is not governed by robots.txt
        for url, _ in SOURCES[name]:
            host = urlsplit(url).hostname
            if host and host not in hosts:
                hosts.append(host)
    return hosts


def describe_dynamic(names: list[str], igdb: bool) -> list[str]:
    lines = []
    if "registry" in names:
        for tab, gid in SHEET_TABS.items():
            lines.append(
                f"{SHEETS_API}/values/<title of gid {gid}> -> registry/{tab}.json"
            )
    if "limited_run" in names:
        lines.append(
            "https://limitedrungames.com/products/<first Switch 2 product in "
            "coming-soon> -> shopify/limited_run/product.html"
        )
    if igdb:
        lines.append("IGDB /v4/games, N64 -> igdb/n64_page1.json")
    return lines


def _api_message(response: httpx2.Response) -> str:
    """Google's error message, which says why a sheet refused a key."""
    try:
        error = response.json().get("error", {})
    except (ValueError, AttributeError):
        return ""
    message = error.get("message") if isinstance(error, dict) else None
    return f" ({message})" if message else ""


class Recorder:
    """Fetches, checks and writes; collects failures instead of stopping."""

    def __init__(self, client: httpx2.AsyncClient, secrets: list[str | None]):
        self.client = client
        self.secrets = [secret for secret in secrets if secret]
        self.failures: list[str] = []
        self.written = 0
        self.robots: dict[str, RobotFileParser | None] = {}
        self._first = True

    def redact(self, text: str) -> str:
        for secret in self.secrets:
            text = text.replace(secret, "***")
        return text

    def fail(self, name: str, reason: str) -> None:
        message = self.redact(f"{name}: {reason}")
        self.failures.append(message)
        print(f"FAIL {message}", flush=True)

    async def get(
        self, name: str, url: str, params: dict | None = None
    ) -> httpx2.Response | None:
        """One throttled GET. Errors are reported with any secret masked."""
        if not self._first:
            await asyncio.sleep(REQUEST_INTERVAL)
        self._first = False
        try:
            response = await self.client.get(url, params=params)
        except httpx2.HTTPError as error:
            self.fail(name, f"{type(error).__name__}: {error}")
            return None
        if response.history:
            # Host and path only: a query string can carry the Sheets key.
            final = f"{response.url.host}{response.url.path}"
            print(self.redact(f"note {name}: redirected to {final}"))
        return response

    def allowed(self, name: str, url: str) -> bool:
        robots = self.robots.get(urlsplit(url).hostname or "")
        if robots is None or robots.can_fetch("*", url):
            return True
        self.fail(name, f"robots.txt disallows {urlsplit(url).path}")
        return False

    def write(self, name: str, out: str, body: str) -> bool:
        """Writes a body, refusing one that carries a credential."""
        if any(secret in body for secret in self.secrets):
            self.fail(name, "response body contains a credential; not written")
            return False
        path = FIXTURES / out
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(body)
        self.written += 1
        return True

    def write_json(self, name: str, out: str, payload: object) -> bool:
        body = json.dumps(payload, indent=2, ensure_ascii=False) + "\n"
        return self.write(name, out, body)

    async def get_json(
        self, name: str, url: str, params: dict | None = None
    ) -> object | None:
        response = await self.get(name, url, params)
        if response is None:
            return None
        if response.status_code != 200:
            self.fail(name, f"HTTP {response.status_code}{_api_message(response)}")
            return None
        try:
            return response.json()
        except ValueError:
            kind = response.headers.get("content-type", "unknown")
            self.fail(name, f"200 but not JSON ({kind})")
            return None


async def record_robots(recorder: Recorder, hosts: list[str]) -> None:
    """robots.txt per host. A missing file is allowed, per the courtesy policy."""
    for host in hosts:
        response = await recorder.get(f"robots {host}", f"https://{host}/robots.txt")
        if response is None or response.status_code != 200:
            status = "unreachable" if response is None else response.status_code
            print(f"note robots/{host}.txt: {status}; treated as allowed")
            recorder.robots[host] = None
            continue
        robots = RobotFileParser()
        robots.parse(response.text.splitlines())
        recorder.robots[host] = robots
        recorder.write(f"robots {host}", f"robots/{host}.txt", response.text)
        print(f"ok   robots/{host}.txt  {len(response.content)} bytes")


def _tags(product: dict) -> list[str]:
    tags = product.get("tags") or []
    if isinstance(tags, str):
        tags = [tag.strip() for tag in tags.split(",")]
    return [tag for tag in tags if tag]


async def record_shopify(recorder: Recorder, key: str) -> dict[str, list[dict]]:
    """Page 1 of each handle; returns the products per handle."""
    seen: dict[str, list[dict]] = {}
    for url, out in SOURCES[key]:
        name = out
        if not recorder.allowed(name, url):
            continue
        payload = await recorder.get_json(name, url)
        if payload is None:
            continue
        products = payload.get("products") if isinstance(payload, dict) else None
        if not isinstance(products, list):
            recorder.fail(name, "no products list in the body")
            continue
        recorder.write_json(name, out, payload)
        seen[out] = products
        tags = sorted({tag for product in products for tag in _tags(product)})
        more = "  (full page: more pages exist)" if len(products) >= 250 else ""
        print(f"ok   {out}  {len(products)} products{more}")
        print(f"     tags ({len(tags)}): {', '.join(tags)}")
        if not products:
            print("     EMPTY: first page has no products")
    return seen


async def record_woo(recorder: Recorder, key: str) -> None:
    for url, out in SOURCES[key]:
        if not recorder.allowed(out, url):
            continue
        payload = await recorder.get_json(out, url)
        if payload is None:
            continue
        if not isinstance(payload, list):
            recorder.fail(out, "expected a list of products")
            continue
        recorder.write_json(out, out, payload)
        names = [str(product.get("name", "")) for product in payload]
        print(f"ok   {out}  {len(payload)} products")
        for product_name in names:
            print(f"     - {product_name}")


def _is_switch_2(product: dict) -> bool:
    for variant in product.get("variants") or []:
        text = " ".join(
            str(variant.get(field) or "")
            for field in ("title", "option1", "option2", "option3")
        ).casefold()
        sku = str(variant.get("sku") or "").upper()
        if "switch 2" in text or sku.startswith("NS2-"):
            return True
    return False


async def record_limited_run_html(
    recorder: Recorder, pages: dict[str, list[dict]]
) -> None:
    """One Switch 2 pre-order product page, for the HTML step's parser."""
    name = "shopify/limited_run/product.html"
    product = None
    for handle in LIMITED_RUN_HTML_HANDLES:
        products = pages.get(f"shopify/limited_run/{handle}.p1.json", [])
        product = next((p for p in products if _is_switch_2(p)), None)
        if product is not None:
            break
    if product is None:
        recorder.fail(name, "no Switch 2 product in coming-soon or latest-releases")
        return
    url = f"https://limitedrungames.com/products/{product['handle']}"
    if not recorder.allowed(name, url):
        return
    response = await recorder.get(name, url)
    if response is None:
        return
    if response.status_code != 200:
        recorder.fail(name, f"HTTP {response.status_code}")
        return
    recorder.write(name, name, response.text)
    html = response.text
    print(f"ok   {name}  {len(response.content)} bytes  ({product['handle']})")
    print(
        f"     'Game Key Card' present: {'Game Key Card' in html}; "
        f"'Estimated Ship Date' present: {'Estimated Ship Date' in html}"
    )


def _header_index(rows: list[list[str]], required: tuple[str, ...]) -> int | None:
    for index, row in enumerate(rows):
        cells = {str(cell).strip() for cell in row}
        if all(column in cells for column in required):
            return index
    return None


def _a1_sheet(title: str) -> str:
    """The whole sheet in A1 notation; quotes are required around spaces."""
    return "'" + title.replace("'", "''") + "'"


async def record_registry(recorder: Recorder, key: str | None) -> None:
    if key is None:
        recorder.fail("registry", "GOOGLE_SHEETS_API_KEY is not set; skipped")
        return
    # Every query parameter goes in `params`: httpx2 replaces a URL's own
    # query string with them rather than merging.
    _, out = SOURCES["registry"][0]
    properties = await recorder.get_json(
        out, SHEETS_API, {"fields": "sheets.properties", "key": key}
    )
    if properties is None:
        return
    recorder.write_json(out, out, properties)
    titles = {
        sheet.get("properties", {}).get("sheetId"): sheet.get("properties", {}).get(
            "title"
        )
        for sheet in properties.get("sheets", [])
    }
    print(f"ok   {out}  {len(titles)} tabs")
    for tab, gid in SHEET_TABS.items():
        print(f"     gid {gid} ({tab}) -> {titles.get(gid)!r}")

    for tab, gid in SHEET_TABS.items():
        out = f"registry/{tab}.json"
        title = titles.get(gid)
        if not title:
            recorder.fail(out, f"no tab with gid {gid}")
            continue
        values_url = f"{SHEETS_API}/values/{quote(_a1_sheet(title), safe='')}"
        payload = await recorder.get_json(out, values_url, {"key": key})
        if payload is None:
            continue
        recorder.write_json(out, out, payload)
        rows = payload.get("values", [])
        required = DETAILS_REQUIRED if tab == "details" else ("Game Title",)
        header = _header_index(rows, required)
        print(f"ok   {out}  {len(rows)} rows")
        if header is None:
            print(f"     HEADER NOT FOUND: no row has {', '.join(required)}")
            continue
        columns = [str(cell).strip() for cell in rows[header]]
        print(f"     header at row {header}: {columns}")
        print(f"     data rows after header: {len(rows) - header - 1}")
        if tab == "details":
            missing = [c for c in DETAILS_OPTIONAL if c not in columns]
            ns1 = [c for c in columns if "NS1" in c]
            print(f"     optional columns missing: {missing or 'none'}")
            print(f"     NS1 columns: {ns1 or 'none'}")
            card = columns.index("Card Type")
            kinds = sorted(
                {
                    str(row[card]).strip()
                    for row in rows[header + 1 :]
                    if len(row) > card
                }
            )
            print(f"     distinct Card Type values: {kinds}")


# Cases the tracker parser's tests need, each checked in file order.
_TRACKER_CASES = {
    "per-region, mixed formats": lambda g: (
        len(set((g.get("formats") or {}).values())) > 1
    ),
    "per-region": lambda g: bool(g.get("formats")),
    "fmt c, no formats": lambda g: g.get("fmt") == "c" and not g.get("formats"),
    "fmt k": lambda g: g.get("fmt") == "k",
    "fmt b": lambda g: g.get("fmt") == "b",
    "fmt d": lambda g: g.get("fmt") == "d",
    "fmt ?": lambda g: g.get("fmt") == "?",
    "date Mon D, YYYY": lambda g: bool(
        re.fullmatch(r"[A-Z][a-z]{2} \d{1,2}, \d{4}", str(g.get("date", "")))
    ),
    "date YYYY": lambda g: bool(re.fullmatch(r"\d{4}", str(g.get("date", "")))),
    "date Qn YYYY": lambda g: bool(
        re.fullmatch(r"Q[1-4] \d{4}", str(g.get("date", "")))
    ),
    "date TBA": lambda g: str(g.get("date", "")).strip().upper() == "TBA",
}


def _games_list(payload: object) -> tuple[list[dict], str | None]:
    """The games array and the key holding it (None for a bare list)."""
    if isinstance(payload, list):
        return payload, None
    if isinstance(payload, dict):
        for key, value in payload.items():
            if isinstance(value, list) and value and isinstance(value[0], dict):
                return value, key
    return [], None


def trim_tracker(payload: object) -> tuple[object, dict[str, int | None]]:
    """A deterministic excerpt covering every case, filled in file order."""
    games, key = _games_list(payload)
    chosen: dict[str, int | None] = {}
    picked: set[int] = set()
    for case, test in _TRACKER_CASES.items():
        index = next((i for i, game in enumerate(games) if test(game)), None)
        chosen[case] = index
        if index is not None:
            picked.add(index)
    for index in range(len(games)):
        if len(picked) >= TRACKER_EXCERPT:
            break
        picked.add(index)
    excerpt = [games[index] for index in sorted(picked)]
    if key is None:
        return excerpt, chosen
    return {**payload, key: excerpt}, chosen


async def record_tracker(recorder: Recorder) -> None:
    url, out = SOURCES["tracker"][0]
    if not recorder.allowed(out, url):
        return
    payload = await recorder.get_json(out, url)
    if payload is None:
        return
    games, key = _games_list(payload)
    if not games:
        recorder.fail(out, "no games array found")
        return
    excerpt, chosen = trim_tracker(payload)
    recorder.write_json(out, out, excerpt)
    top = sorted(payload) if isinstance(payload, dict) else "a bare list"
    print(f"ok   {out}  {len(games)} games, excerpt of {len(_games_list(excerpt)[0])}")
    print(f"     top-level keys: {top}; games under {key!r}")
    print(f"     game fields: {sorted(games[0])}")
    for case, index in chosen.items():
        print(f"     {case}: {'MISSING' if index is None else f'game #{index}'}")


async def record_igdb(recorder: Recorder) -> None:
    from sources.igdb import IgdbSource

    out = "igdb/n64_page1.json"
    try:
        loaded = config.load_config()
    except config.ConfigError as error:
        recorder.fail(out, str(error))
        return
    recorder.secrets += [
        secret
        for secret in (loaded.igdb_client_id, loaded.igdb_client_secret)
        if secret
    ]
    try:
        rows = await IgdbSource(loaded)._query(IGDB_N64_QUERY)
    except Exception as error:  # reported, redacted, and the run carries on
        recorder.fail(out, f"{type(error).__name__}: {error}")
        return
    recorder.write_json(out, out, rows)
    covered = sum(1 for row in rows if row.get("cover"))
    print(f"ok   {out}  {len(rows)} games, {covered} with a cover")


async def record(names: list[str] | None, igdb: bool) -> None:
    """Records the named sources (default all); exits 1 if anything failed."""
    names = names or list(SOURCES)
    sheets_key = os.environ.get("GOOGLE_SHEETS_API_KEY", "").strip() or None
    async with httpx2.AsyncClient(
        headers={"User-Agent": USER_AGENT},
        timeout=TIMEOUT,
        follow_redirects=True,
    ) as client:
        recorder = Recorder(client, [sheets_key])
        await record_robots(recorder, _hosts(names))
        for name in names:
            if name in SHOPIFY_STORES:
                pages = await record_shopify(recorder, name)
                if name == "limited_run":
                    await record_limited_run_html(recorder, pages)
            elif name in WOO_STORES:
                await record_woo(recorder, name)
            elif name == "registry":
                await record_registry(recorder, sheets_key)
            elif name == "tracker":
                await record_tracker(recorder)
        if igdb:
            await record_igdb(recorder)

    print(f"\nwrote {recorder.written} files under {FIXTURES.relative_to(BACKEND)}")
    if recorder.failures:
        print(f"{len(recorder.failures)} failure(s):")
        for failure in recorder.failures:
            print(f"  - {failure}")
        raise SystemExit(1)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "names",
        nargs="*",
        metavar="NAME",
        help=f"sources to record (default all): {', '.join(SOURCES)}",
    )
    parser.add_argument(
        "--igdb", action="store_true", help="also record one IGDB N64 page"
    )
    parser.add_argument(
        "--list", action="store_true", help="print the plan and fetch nothing"
    )
    args = parser.parse_args()
    names = args.names or list(SOURCES)
    unknown = [name for name in names if name not in SOURCES]
    if unknown:
        parser.error(f"unknown source(s): {', '.join(unknown)}")

    if args.list:
        for host in _hosts(names):
            print(f"https://{host}/robots.txt -> robots/{host}.txt")
        for name in names:
            for url, out in SOURCES[name]:
                print(f"{url} -> {out}")
        for line in describe_dynamic(names, args.igdb):
            print(line)
        return
    asyncio.run(record(names, args.igdb))


if __name__ == "__main__":
    main()
