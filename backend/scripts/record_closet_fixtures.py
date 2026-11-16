"""Records two public store product links as test fixtures for the closet's
link way in (`closet_resolver.py`, issue #398).

Run from backend/, by the owner:

    ./.venv/bin/python scripts/record_closet_fixtures.py
    ./.venv/bin/python scripts/record_closet_fixtures.py \\
        --marinelayer https://www.marinelayer.com/products/<handle> \\
        --duer https://www.duer.com/products/<handle>

For each store it writes into tests/fixtures/closet/:

- `<store>_product.json`: the store's per-product JSON, byte for byte;
- `<store>_robots.txt`: the host's robots.txt, byte for byte;
- `<store>_page.html`: the product page's `<title>`, its `og:title` meta tag
  and every `application/ld+json` script, copied out verbatim and put in a
  bare document (the whole page is about 0.5 to 1 MB of scripts and markup
  the parser never reads);
- `manifest.json`: the links, the day they were recorded and what was kept.

Why: the resolver's parsers are written against real answers, never a shape
remembered from a doc. The tests run offline against these files. Re-record
when a store changes its format or a product disappears; never hand-edit a
fixture, run this again (a different product link is fine, then update the
expectations in tests/test_closet_resolver.py).

Everything recorded is public product data: no sign-in, no cookie, no
account. The requests are what the resolver itself makes (the store's own
User-Agent, spaced two a second, https only, robots.txt read first and a
disallowed path never fetched).
"""

from __future__ import annotations

import argparse
import asyncio
import json
import re
import sys
from datetime import date
from pathlib import Path
from urllib.parse import urlsplit

import httpx2

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))

from physical_sources.courtesy import allowed, parse_robots  # noqa: E402
from physical_sources.limits import USER_AGENT  # noqa: E402

FIXTURES = BACKEND / "tests" / "fixtures" / "closet"
INTERVAL = 0.5  # two requests a second
TIMEOUT = 30.0

DEFAULTS = {
    "marinelayer": "https://www.marinelayer.com/products/chalet-lounge-pant",
    "duer": "https://www.duer.com/products/no-sweat-athletic-taper-chestnut",
}

LDJSON = re.compile(
    r"<script\b[^>]*\btype\s*=\s*[\"']application/ld\+json[\"'][^>]*>.*?</script>",
    re.IGNORECASE | re.DOTALL,
)
TITLE = re.compile(r"<title[^>]*>.*?</title>", re.IGNORECASE | re.DOTALL)
META = re.compile(r"<meta\b[^>]*>", re.IGNORECASE)


def excerpt(page: str) -> str:
    """The page's title, og:title meta tag and JSON-LD scripts, verbatim."""
    parts = []
    title = TITLE.search(page)
    if title:
        parts.append(title.group(0))
    parts += [m for m in META.findall(page) if re.search(r"og:title", m, re.I)]
    parts += LDJSON.findall(page)
    return (
        "<!doctype html>\n<html><head>\n"
        + "\n".join(parts)
        + "\n</head><body></body></html>\n"
    )


async def get(client: httpx2.AsyncClient, url: str) -> httpx2.Response:
    await asyncio.sleep(INTERVAL)
    response = await client.get(url)
    if response.status_code != 200:
        raise SystemExit(f"{url}: HTTP {response.status_code}")
    return response


async def record(store: str, link: str, client: httpx2.AsyncClient) -> dict:
    parts = urlsplit(link)
    if parts.scheme != "https":
        raise SystemExit(f"{link}: only https links are recorded")
    handle = parts.path.rstrip("/").rsplit("/", 1)[-1]
    origin = f"https://{parts.netloc}"
    robots = await get(client, f"{origin}/robots.txt")
    rules = parse_robots(robots.text)
    json_url = f"{origin}/products/{handle}.json"
    for url in (json_url, link):
        if not allowed(rules, url):
            raise SystemExit(f"{url}: robots.txt disallows it; not recorded")
    product = await get(client, json_url)
    page = await get(client, link)
    (FIXTURES / f"{store}_robots.txt").write_bytes(robots.content)
    (FIXTURES / f"{store}_product.json").write_bytes(product.content)
    (FIXTURES / f"{store}_page.html").write_text(excerpt(page.text), encoding="utf-8")
    body = json.loads(product.content)["product"]
    return {
        "link": link,
        "json": json_url,
        "title": body.get("title"),
        "variants": len(body.get("variants") or []),
    }


async def main(links: dict[str, str]) -> None:
    FIXTURES.mkdir(parents=True, exist_ok=True)
    manifest = {"recorded_on": date.today().isoformat(), "stores": {}}
    async with httpx2.AsyncClient(
        timeout=TIMEOUT,
        follow_redirects=True,
        headers={"User-Agent": USER_AGENT, "Accept-Encoding": "identity"},
    ) as client:
        for store, link in links.items():
            manifest["stores"][store] = await record(store, link, client)
            print(f"recorded {store}: {link}")
    (FIXTURES / "manifest.json").write_text(
        json.dumps(manifest, indent=2) + "\n", encoding="utf-8"
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--marinelayer", default=DEFAULTS["marinelayer"])
    parser.add_argument("--duer", default=DEFAULTS["duer"])
    args = parser.parse_args()
    asyncio.run(main({"marinelayer": args.marinelayer, "duer": args.duer}))
