"""The catalogue's persistence: runs, editions and listings (migration 0005).

The database layer; nothing here parses a source. Nothing commits either:
the route owns the transaction, so one refresh either lands or does not.

Rows are never deleted. An edition absent from a successful, non-short run
of its source is retired, and a listing unseen by one is archived; either
comes back when it reappears. A short run -- fewer rows than half the last
successful one -- upserts what it saw and retires nothing, because a
half-loaded sheet or a store's broken collection is not evidence that half
the catalogue vanished.
"""

from __future__ import annotations

import dataclasses
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm.attributes import flag_modified

from models import CatalogueRun, PhysicalEdition, StoreListing
from physical_sources.base import EditionRow, StoreProduct
from physical_sources.limits import (
    HTML_RECHECK_DAYS,
    SHORT_RUN_RATIO,
    STALE_RUN_MINUTES,
)
from sources.igdb import PLATFORM_NAMES

EDITION_FIELDS = (
    "title",
    "title_normalized",
    "platform_id",
    "region",
    "is_physical",
    "physical_format",
    "format_source",
    "cart_id",
    "publisher",
    "editions",
    "ns1_compatible",
    "release_date",
    "release_precision",
)
LISTING_FIELDS = (
    "store_product_id",
    "handle",
    "url",
    "region",
    "title",
    "title_normalized",
    "edition_label",
    "platform_id",
    "is_game",
    "price",
    "currency",
    "availability",
    "preorder_closes_at",
    "release_date",
    "release_precision",
    "release_text",
    "format_hint",
    "format_tier",
    "format_evidence",
    "image_url",
)
# Written by the Limited Run HTML step; kept when a run skips the page.
PAGE_EVIDENCE = "Game Key Card"


def _now() -> datetime:
    return datetime.now(UTC)


def _value(value: object) -> object:
    return getattr(value, "value", value)


def _platform_name(platform_id: int | None, label: str | None = None) -> str | None:
    return PLATFORM_NAMES.get(platform_id, label) if platform_id else label


# --- Runs -------------------------------------------------------------------


async def start_run(session, source: str) -> CatalogueRun:
    """A run row, flushed so its id exists; ok stays NULL until it finishes."""
    run = CatalogueRun(source=source, started_at=_now())
    session.add(run)
    await session.flush()
    return run


async def finish_run(
    session,
    run: CatalogueRun,
    *,
    ok: bool,
    rows_seen: int = 0,
    rows_changed: int = 0,
    rows_retired: int = 0,
    items_synced: int = 0,
    unresolved_remaining: int = 0,
    short_run: bool = False,
    errors=(),
) -> None:
    run.finished_at = _now()
    run.ok = ok
    run.rows_seen = rows_seen
    run.rows_changed = rows_changed
    run.rows_retired = rows_retired
    run.items_synced = items_synced
    run.unresolved_remaining = unresolved_remaining
    run.short_run = short_run
    run.errors = [dict(error) for error in errors]
    await session.flush()


async def previous_rows_seen(session, source: str) -> int | None:
    """rows_seen of the source's last successful run, or None."""
    return await session.scalar(
        select(CatalogueRun.rows_seen)
        .where(CatalogueRun.source == source, CatalogueRun.ok.is_(True))
        .order_by(CatalogueRun.started_at.desc())
        .limit(1)
    )


def is_short(seen: int, previous: int | None) -> bool:
    """Fewer rows than SHORT_RUN_RATIO of the last successful run."""
    return previous is not None and previous > 0 and seen < previous * SHORT_RUN_RATIO


async def latest_runs(session) -> dict[str, CatalogueRun]:
    """The most recent run of every source."""
    latest = (
        select(
            CatalogueRun.source,
            func.max(CatalogueRun.started_at).label("started_at"),
        )
        .group_by(CatalogueRun.source)
        .subquery()
    )
    rows = await session.scalars(
        select(CatalogueRun).join(
            latest,
            (CatalogueRun.source == latest.c.source)
            & (CatalogueRun.started_at == latest.c.started_at),
        )
    )
    return {run.source: run for run in rows}


def run_failed(run: CatalogueRun, now: datetime | None = None) -> bool:
    """Finished badly, or never finished: a run still open after
    STALE_RUN_MINUTES was interrupted (a restart mid-refresh)."""
    if run.ok is None:
        now = now or _now()
        return now - run.started_at > timedelta(minutes=STALE_RUN_MINUTES)
    return run.ok is False


async def consecutive_failures(
    session, source: str, now: datetime | None = None
) -> int:
    """Failed runs of `source` since its last successful one."""
    runs = await session.scalars(
        select(CatalogueRun)
        .where(CatalogueRun.source == source)
        .order_by(CatalogueRun.started_at.desc())
        .limit(50)
    )
    count = 0
    for run in runs:
        if run.ok is True:
            break
        if run_failed(run, now):
            count += 1
    return count


# --- Editions ---------------------------------------------------------------


def _edition_values(row: EditionRow) -> dict:
    values = {field: getattr(row, field) for field in EDITION_FIELDS}
    values["platform"] = _platform_name(row.platform_id) or ""
    return values


async def upsert_editions(
    session, rows: list[EditionRow], source: str, *, retire: bool
) -> tuple[int, int]:
    """(changed, retired) for one source's rows.

    Upserts on (source, source_ref); an edition that reappears is un-retired
    and counted as changed. With `retire`, live rows of this source absent
    from `rows` get retired_at. igdb_id is never written here: resolution
    owns it, and it survives a re-upsert.
    """
    now = _now()
    existing = {
        edition.source_ref: edition
        for edition in await session.scalars(
            select(PhysicalEdition).where(PhysicalEdition.source == source)
        )
    }
    changed = 0
    for row in rows:
        values = _edition_values(row)
        current = existing.get(row.source_ref)
        if current is None:
            session.add(
                PhysicalEdition(
                    source=source,
                    source_ref=row.source_ref,
                    first_seen_at=now,
                    last_seen_at=now,
                    igdb_id=row.igdb_id,
                    **values,
                )
            )
            changed += 1
            continue
        differs = current.retired_at is not None or any(
            _value(getattr(current, field)) != _value(value)
            for field, value in values.items()
        )
        for field, value in values.items():
            setattr(current, field, value)
        if row.igdb_id is not None and current.igdb_id is None:
            current.igdb_id = row.igdb_id
            differs = True
        current.last_seen_at = now
        current.retired_at = None
        changed += differs

    retired = 0
    if retire:
        seen = {row.source_ref for row in rows}
        for ref, edition in existing.items():
            if ref not in seen and edition.retired_at is None:
                edition.retired_at = now
                retired += 1
    await session.flush()
    return changed, retired


# --- Listings ---------------------------------------------------------------


def _carry_page(current: StoreListing, product: StoreProduct) -> StoreProduct:
    """What a skipped HTML step would have said, carried from the last read.

    A run skips a product page read within HTML_RECHECK_DAYS, so its fresh
    listing lacks the page's findings; the stored ones stand until the page
    is read again.
    """
    checked = (current.raw or {}).get("html_checked_at")
    if not checked or "html_checked_at" in product.raw:
        return product
    changes: dict = {"raw": {**product.raw, "html_checked_at": checked}}
    if current.format_evidence == PAGE_EVIDENCE:
        changes.update(
            format_hint=_value(current.format_hint),
            format_tier=_value(current.format_tier),
            format_evidence=current.format_evidence,
        )
    if product.release_date is None and current.release_date is not None:
        changes.update(
            release_date=current.release_date,
            release_precision=_value(current.release_precision),
            release_text=current.release_text,
        )
    return dataclasses.replace(product, **changes)


def _listing_values(product: StoreProduct) -> dict:
    values = {field: getattr(product, field) for field in LISTING_FIELDS}
    values["platform"] = _platform_name(product.platform_id, product.platform_label)
    values["collections_seen"] = list(product.collections_seen)
    values["raw"] = product.raw
    return values


async def upsert_listings(
    session, products: list[StoreProduct], store: str, *, archive: bool
) -> tuple[int, int]:
    """(changed, archived) for one store's listings.

    Upserts on (store, variant_id). With `archive`, this store's listings
    absent from `products` become archived; their raw, igdb_id and format
    are kept, so a re-listed product keeps its match.
    """
    now = _now()
    existing = {
        listing.variant_id: listing
        for listing in await session.scalars(
            select(StoreListing).where(StoreListing.store == store)
        )
    }
    changed = 0
    for product in products:
        current = existing.get(product.variant_id)
        if current is None:
            session.add(
                StoreListing(
                    store=store,
                    variant_id=product.variant_id,
                    first_seen_at=now,
                    last_seen_at=now,
                    updated_at=now,
                    **_listing_values(product),
                )
            )
            changed += 1
            continue
        values = _listing_values(_carry_page(current, product))
        compared = {k: v for k, v in values.items() if k != "raw"}
        differs = any(
            _value(getattr(current, field)) != _value(value)
            for field, value in compared.items()
        )
        for field, value in values.items():
            setattr(current, field, value)
        current.last_seen_at = now
        if differs:
            current.updated_at = now
        else:
            # last_seen_at always changes, so an UPDATE is issued, and the
            # model's onupdate would stamp updated_at on it. Writing the
            # stored value back keeps "updated" meaning "something changed".
            flag_modified(current, "updated_at")
        changed += differs

    archived = 0
    if archive:
        seen = {product.variant_id for product in products}
        for variant_id, listing in existing.items():
            if variant_id not in seen and _value(listing.availability) != "archived":
                listing.availability = "archived"
                listing.updated_at = now
                archived += 1
    await session.flush()
    return changed, archived


async def recently_checked_handles(
    session, store: str, days: int = HTML_RECHECK_DAYS
) -> frozenset[str]:
    """Product handles whose page the HTML step read within `days`."""
    cutoff = (_now() - timedelta(days=days)).date().isoformat()
    rows = await session.scalars(
        select(StoreListing.handle).where(
            StoreListing.store == store,
            StoreListing.raw["html_checked_at"].astext >= cutoff,
        )
    )
    return frozenset(rows)


async def count_live(session) -> dict[str, int]:
    """Totals for the status page."""
    editions = await session.scalar(
        select(func.count())
        .select_from(PhysicalEdition)
        .where(PhysicalEdition.retired_at.is_(None))
    )
    listings = await session.scalar(
        select(func.count())
        .select_from(StoreListing)
        .where(StoreListing.availability != "archived")
    )
    return {"live_editions": editions or 0, "live_listings": listings or 0}
