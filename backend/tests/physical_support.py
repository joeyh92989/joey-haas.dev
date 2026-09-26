"""Shared helpers for the physical catalogue's tests.

A fake IGDB adapter, row builders, and an HTTP handler that serves the
recorded fixtures by URL -- kept here so no test module imports another.
"""

import json
import re
from contextlib import asynccontextmanager
from datetime import date
from decimal import Decimal
from pathlib import Path
from urllib.parse import unquote

import httpx2
from fastapi import FastAPI
from httpx2 import ASGITransport, AsyncClient
from starlette.middleware.sessions import SessionMiddleware

from matching import normalize_title
from models import ItemType
from physical_routes import create_physical_router
from physical_sources.base import EditionRow, StoreProduct
from physical_sources.stores import STORES
from sources.base import SourceDetail, SourceRateLimited, SourceResult

N64_PAGE = Path(__file__).parent / "fixtures" / "physical" / "igdb" / "n64_page1.json"


class FakeIgdb:
    """Stands in for IgdbSource: search, fetch_many and the one raw query."""

    def __init__(
        self,
        results=None,
        configured=True,
        limit_after=None,
        titles=None,
        search_error=None,
        fetch_error=None,
        missing=(),
    ):
        self.results = results or {}
        self._configured = configured
        self.limit_after = limit_after
        self.titles = titles or {}
        self.search_error = search_error
        self.fetch_error = fetch_error
        self.missing = set(missing)
        self.searches: list[tuple[str, int | None, str | None]] = []
        self.fetched: list[list[str]] = []
        self.fetch_limited = False

    def configured(self):
        return self._configured

    async def search(self, query, year=None, platform=None):
        if self.search_error is not None:
            raise self.search_error
        if self.limit_after is not None and len(self.searches) >= self.limit_after:
            raise SourceRateLimited("igdb", "rate limited by IGDB")
        self.searches.append((query, year, platform))
        return self.results.get(query, [])

    async def fetch_many(self, ids):
        if self.fetch_limited:
            raise SourceRateLimited("igdb", "rate limited by IGDB")
        if self.fetch_error is not None:
            raise self.fetch_error
        self.fetched.append(list(ids))
        return [
            SourceDetail(
                external_id=i,
                title=self.titles.get(i, f"Game {i}"),
                cover_url=f"https://images.igdb.com/{i}.jpg" if int(i) % 2 else None,
                source_metadata={"first_release_date": "1999-05-18", "genres": []},
            )
            for i in ids
            if i not in self.missing
        ]

    async def _query(self, body, endpoint="games"):
        rows = json.loads(N64_PAGE.read_text())
        return [{"id": row["id"]} for row in rows]


def result(igdb_id, title, year=2026):
    return SourceResult(external_id=str(igdb_id), title=title, year=year)


def edition(title, ref=None, platform_id=508, **extra):
    return EditionRow(
        source="nscollectors",
        source_ref=ref or f"{normalize_title(title)}|USA|pub|game card",
        title=title,
        platform_id=platform_id,
        region="USA",
        is_physical=True,
        physical_format="game_card",
        format_source="registry",
        **{
            "title_normalized": normalize_title(title),
            "release_date": date(2026, 11, 19),
            "release_precision": "day",
            **extra,
        },
    )


def listing(title_normalized, variant="1", platform_id=508, label="Nintendo Switch 2"):
    return StoreProduct(
        store="super_rare",
        store_product_id=variant,
        variant_id=variant,
        handle=title_normalized.replace(" ", "-"),
        url="https://example.test/x",
        region="EUR",
        title=title_normalized,
        title_normalized=title_normalized,
        edition_label=None,
        platform_id=platform_id,
        platform_label=label,
        is_game=True,
        collections_seen=("switch-2",),
        price=Decimal("40"),
        currency="GBP",
        availability="preorder",
    )


PHYSICAL = Path(__file__).parent / "fixtures" / "physical"
DOMAINS = {config.domain: key for key, config in STORES.items()}


def fixture_name(handle: str) -> str:
    return re.sub(r"[^a-z0-9-]+", "-", handle.replace("™", "-tm").lower()).strip("-")


def serve_fixtures(
    robots: dict[str, str] | None = None,
    empty: set[str] = frozenset(),
    gate=None,
    entered=None,
    fail_paths: tuple[str, ...] = (),
):
    """A handler answering every catalogue URL from the recorded fixtures.

    `entered` is set when the first request arrives; `gate` holds requests
    until it is set; a path starting with one of `fail_paths` fails as a
    dropped connection.
    """
    robots = robots or {}

    async def handler(request):
        if entered is not None:
            entered.set()
        if gate is not None:
            await gate.wait()
        if request.url.path.startswith(fail_paths or ("\0",)):
            raise httpx2.ConnectError("dropped", request=request)
        url, host, path = request.url, request.url.host, request.url.path
        if path == "/robots.txt":
            if host in robots:
                return httpx2.Response(200, text=robots[host])
            recorded = PHYSICAL / "robots" / f"{host}.txt"
            return (
                httpx2.Response(200, text=recorded.read_text())
                if recorded.exists()
                else httpx2.Response(404)
            )
        if host == "sheets.googleapis.com":
            assert url.params["key"] == "sheets-key"
            if url.params.get("fields") == "sheets.properties":
                name = "properties"
            elif "Upcoming" in unquote(path):
                name = "upcoming_details"
            else:
                name = "details"
            return httpx2.Response(
                200, text=(PHYSICAL / "registry" / f"{name}.json").read_text()
            )
        if host == "raw.githubusercontent.com":
            return httpx2.Response(
                200, text=(PHYSICAL / "tracker" / "games.json").read_text()
            )
        store = DOMAINS[host]
        if path.startswith("/collections/"):
            handle = unquote(path.split("/")[2])
            if url.params.get("page") != "1" or handle in empty:
                return httpx2.Response(200, json={"products": []})
            page = PHYSICAL / "shopify" / store / f"{fixture_name(handle)}.p1.json"
            return httpx2.Response(200, text=page.read_text())
        if path.startswith("/wp-json/"):
            (page,) = (PHYSICAL / "woocommerce" / store).glob("*.json")
            return httpx2.Response(200, text=page.read_text())
        if path.startswith("/products/"):
            return httpx2.Response(
                200,
                text=(
                    PHYSICAL / "shopify" / "limited_run" / "product.html"
                ).read_text(),
            )
        return httpx2.Response(404)

    return handler


@asynccontextmanager
async def client_for(
    factory, *, signed_in=True, handler=None, igdb=None, sheets_key="sheets-key"
):
    handler = handler or serve_fixtures()
    registry = {ItemType.GAME: igdb or FakeIgdb()}
    app = FastAPI()
    app.include_router(
        create_physical_router(
            factory,
            registry,
            lambda: httpx2.AsyncClient(transport=httpx2.MockTransport(handler)),
            sheets_key,
        )
    )
    if signed_in:

        @app.middleware("http")
        async def _sign_in(request, call_next):
            request.session["user"] = {"sub": "1", "email": "admin@example.com"}
            return await call_next(request)

    app.add_middleware(SessionMiddleware, secret_key="test-secret", https_only=False)
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://testserver", timeout=120
    ) as client:
        yield client
