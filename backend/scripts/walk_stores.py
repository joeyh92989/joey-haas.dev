"""Walks the Shopify stores here and posts each one's rows to the API.

Run by the nightly workflow on its GitHub runner, from backend/:

    API_URL=https://api.joey-haas.dev JOB_TOKEN=... python scripts/walk_stores.py

Why this exists: Shopify rate-limits Render's shared outbound IP, so the
API's own walk of the nine Shopify stores is answered 429 almost throughout,
also after waiting out Retry-After. The runner's IP is answered 200
(docs/planning/2026-10-22-shopify-walk-on-runner-design.md). The walk is the
API's own code (physical_sources.shopify, pure); only the reading moved. The
API records each store's run from what is posted (POST
/api/physical/stores/{key}/ingest), with the same archive rule as a walk
there.

Store keys may be given to walk only those. Needs only httpx2 beside the
standard library: nothing here imports config, FastAPI or SQLAlchemy.

Exit status: 0 when every store's run is ok, 1 when any failed or was not
recorded, 3 when the API refused JOB_TOKEN (configuration, not data). Not
2: argparse exits 2 on a usage error.
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import os
import sys
from pathlib import Path

import httpx2

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))

from physical_sources import shopify, wire  # noqa: E402
from physical_sources.base import HostThrottle, PhysicalSourceError  # noqa: E402
from physical_sources.courtesy import robots_for  # noqa: E402
from physical_sources.limits import (  # noqa: E402
    REQUEST_TIMEOUT_SECONDS,
    USER_AGENT,
)
from physical_sources.stores import STORES  # noqa: E402

logger = logging.getLogger("walk_stores")

SHOPIFY = [key for key, config in STORES.items() if config.adapter == "shopify"]
# An ingest writes a few hundred rows to Neon; the API may also be waking.
API_TIMEOUT_SECONDS = 300.0
UNAUTHORIZED = 3
# A 409 means another call's refresh or resolve still runs on the API; each
# of those is capped at 15 minutes, so 6 waits of a minute and a half cover
# most of one without stretching a bad night far.
BUSY_RETRIES = 6
BUSY_WAIT_SECONDS = 90.0


class Unauthorized(Exception):
    """The API answered 401: JOB_TOKEN differs between Render and GitHub."""


async def html_skip(api, key: str) -> frozenset[str]:
    """The handles the API says were read within the week; none when it
    cannot say, which only costs the Limited Run walk some page reads."""
    try:
        response = await api.get(f"/api/physical/stores/{key}/html-skip")
    except httpx2.HTTPError as error:
        logger.warning("%s: html-skip failed: %s", key, type(error).__name__)
        return frozenset()
    if response.status_code == 401:
        raise Unauthorized
    if response.status_code != 200:
        logger.warning("%s: html-skip answered %s", key, response.status_code)
        return frozenset()
    try:
        return frozenset(response.json()["handles"])
    except (ValueError, KeyError, TypeError):
        logger.warning("%s: html-skip answered 200 without its handles", key)
        return frozenset()


async def walk(key: str, client, throttle, skip: frozenset[str]) -> tuple:
    """One store's rows and errors. Anything the walk raises becomes one
    `internal` error, so the API still records the run, as failed."""
    config = STORES[key]
    try:
        robots = await robots_for(config.domain, client, throttle)
        return await shopify.list_products(
            config, client, robots, throttle, html_skip=skip
        )
    except Exception as error:
        logger.exception("%s: the walk raised", key)
        return [], [PhysicalSourceError(type(error).__name__, "internal")]


async def ingest(api, key: str, products, errors) -> bool:
    """Posts one store's walk; whether the API recorded an ok run."""
    body = {
        "products": [wire.product_to_wire(p) for p in products],
        "errors": [wire.error_to_wire(e) for e in errors],
    }
    for attempt in range(BUSY_RETRIES + 1):
        try:
            response = await api.post(f"/api/physical/stores/{key}/ingest", json=body)
        except httpx2.HTTPError as error:
            logger.warning("%s: ingest failed: %s", key, type(error).__name__)
            return False
        # 409: an earlier call's refresh still holds the catalogue lock (its
        # curl may have given up first). The rows are in hand; wait and post
        # them again rather than lose the walk.
        if response.status_code != 409 or attempt == BUSY_RETRIES:
            break
        logger.info("%s: catalogue busy (409), posting again shortly", key)
        await asyncio.sleep(BUSY_WAIT_SECONDS)
    if response.status_code == 401:
        raise Unauthorized
    if response.status_code != 200:
        # A 422 names the row and the problem (the API records it as a
        # failed run); a 409 here outlasted every retry.
        logger.warning(
            "%s: ingest answered %s: %s",
            key,
            response.status_code,
            response.text[:500],
        )
        return False
    try:
        run = response.json()
        return _logged(key, run)
    except (ValueError, KeyError, TypeError):
        logger.warning("%s: ingest answered 200 without a run", key)
        return False


def _logged(key: str, run: dict) -> bool:
    logger.info(
        "%s: ok=%s seen=%s changed=%s archived=%s short=%s",
        key,
        run["ok"],
        run["rows_seen"],
        run["rows_changed"],
        run["rows_retired"],
        run["short_run"],
    )
    for entry in run["errors"]:
        logger.info("%s: %s: %s", key, entry["code"], entry["detail"])
    return run["ok"] is True


async def run(keys, client, api) -> int:
    """Walks and posts each store in turn; the exit status."""
    throttle = HostThrottle()
    failed = []
    try:
        for key in keys:
            skip = await html_skip(api, key)
            products, errors = await walk(key, client, throttle, skip)
            logger.info(
                "%s: walked %d rows, %d errors", key, len(products), len(errors)
            )
            if not await ingest(api, key, products, errors):
                failed.append(key)
    except Unauthorized:
        logger.error("the API refused JOB_TOKEN (401)")
        return UNAUTHORIZED
    if failed:
        logger.warning("failed: %s", " ".join(failed))
        return 1
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "stores", nargs="*", help="store keys (default: every Shopify store)"
    )
    args = parser.parse_args(argv)
    unknown = [key for key in args.stores if key not in SHOPIFY]
    if unknown:
        parser.error(f"not a Shopify store: {', '.join(unknown)}")
    api_url, token = os.environ.get("API_URL"), os.environ.get("JOB_TOKEN")
    if not api_url or not token:
        parser.error("API_URL and JOB_TOKEN must be set")
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    # Hundreds of product requests per night; the per-store lines are enough.
    for name in ("httpx2", "httpcore"):
        logging.getLogger(name).setLevel(logging.WARNING)

    async def go() -> int:
        async with (
            httpx2.AsyncClient(
                headers={"User-Agent": USER_AGENT},
                timeout=REQUEST_TIMEOUT_SECONDS,
                follow_redirects=True,
            ) as client,
            httpx2.AsyncClient(
                base_url=api_url,
                headers={"Authorization": f"Bearer {token}"},
                timeout=API_TIMEOUT_SECONDS,
            ) as api,
        ):
            return await run(args.stores or SHOPIFY, client, api)

    return asyncio.run(go())


if __name__ == "__main__":
    sys.exit(main())
