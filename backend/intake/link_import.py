"""Product links to draft garments: the database half (issue #398, D11).

`closet_resolver.py` reads a link; this module decides what each link
becomes in a sitting and what choosing a colour does.

- A link the store let us read becomes one `typed` garment entry whose
  payload holds the fields Check edits (name, brand, store colour, size,
  colour family) and two server-only keys: `seed`, the same record a seed
  file row leaves (so the held photo, the commit and "already imported" all
  work as for a file), and `link` (`{url, state, via, code, message}`). The
  product's colours are the entry's `candidates`, each with its sizes.
- A link that could not be read (robots, a refusal, a timeout, a private
  address, a page with no product) becomes the same kind of entry, kept as
  typed with the link saved: `link.state` is `kept` and `link.message` says
  why. It is never an error of the sitting.
- One colour is chosen at once (a single colour, or a `?variant=` the link
  names); with several the owner chooses in Check (`choose_colour`), which
  swaps the photo for that colour's. Size is a plain field edit.

Nothing reaches `garments` until the sitting is committed.
"""

from __future__ import annotations

import asyncio
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from closet_colors import colour_family
from closet_resolver import (
    MAX_URL_CHARS,
    Fetcher,
    Product,
    Resolution,
    item_ref,
    link_variant,
    name_from_link,
    normalise,
    resolve,
    source_for,
)
from intake.seed_file import dup_key
from intake.seed_import import SERVER_KEYS
from models import (
    IntakeEntry,
    IntakeEntryState,
    IntakePhoto,
)

# Links read in one request: they are read together, so the page waits for
# the slowest; more than this is a second paste.
MAX_LINKS = 10
# At most this many stores are asked at once.
CONCURRENCY = 4
# All the links of one paste, together: a link still unanswered then is kept
# as typed (each link has its own 20 s deadline inside this).
TOTAL_SECONDS = 45.0
# Link pieces one sitting holds.
MAX_ENTRIES = 100


class TooManyLinks(Exception):
    """The sitting would hold more link pieces than MAX_ENTRIES."""


@dataclass
class LinkImport:
    """What a paste did: entries written and links not taken."""

    entries: list[IntakeEntry] = field(default_factory=list)
    read: int = 0
    kept: int = 0
    not_links: int = 0
    duplicates: int = 0

    def counts(self) -> dict[str, int]:
        return {
            "read": self.read,
            "kept": self.kept,
            "not_links": self.not_links,
            "duplicates": self.duplicates,
        }


def is_link(entry: IntakeEntry) -> bool:
    """A draft made from a pasted link: the server's `link` record."""
    return bool((entry.payload or {}).get("link"))


def _usd(currency: str | None, price: str | None) -> str | None:
    """The price when it is in dollars (or no currency was said); the
    closet's price column is dollars."""
    return price if currency in (None, "USD") else None


def entry_key(payload: dict[str, Any]) -> str:
    """When two link pieces are one piece: the store, the colour of the
    product (host, path and colour id) and the size, so another size of one
    colour is another piece. Rebuilt at commit from the payload as Check left
    it; `intake.seed_import.imported_keys` rebuilds the same string from the
    stored row (`store_item_no`, snapshot `size`)."""
    seed = payload.get("seed") or {}
    return dup_key(
        seed.get("source") or "link",
        None,
        seed.get("store_item_no"),
        None,
        None,
        payload.get("size"),
    )


def apply_colour(
    payload: dict[str, Any],
    product: dict[str, Any],
    candidate: dict[str, Any],
    size: str | None = None,
) -> dict[str, Any]:
    """`payload` with the colour `candidate` chosen: its store colour (verbatim,
    `color_source` vendor at commit), the family it falls in (blank when it
    names none, so Check asks), its size when the colour has one size or the
    link named one, its price and its photo, which is fetched again. A size
    the owner typed stays unless the colour lists sizes without it."""
    seed = dict(payload["seed"])
    name = candidate.get("color_name")
    out = {k: v for k, v in payload.items() if k not in ("color_name", "primary_color")}
    if name:
        out["color_name"] = name[:80]
        if family := colour_family(name):
            out["primary_color"] = family
    sizes = [s["size"] for s in candidate.get("sizes") or [] if s.get("size")]
    if size and size in sizes:
        out["size"] = size
    elif len(sizes) == 1:
        out["size"] = sizes[0]
    elif sizes and out.get("size") not in sizes:
        out.pop("size", None)
    seed.update(
        store_item_no=item_ref(payload["link"]["url"], candidate["external_id"]),
        price_usd=_usd(product.get("currency"), candidate.get("price")),
        image_url=candidate.get("image_url"),
        row={**product, "chosen": candidate["external_id"]},
    )
    out["seed"] = seed
    seed["key"] = entry_key(out)
    out["image"] = "pending" if seed["image_url"] else "none"
    out.pop("image_error", None)
    return out


def _chosen_colour(
    product: Product, link: str
) -> tuple[dict[str, Any], str | None] | None:
    """The colour to take without asking, and the size the link names: the
    only colour, or the colour the link's `?variant=` is a variant of."""
    shown = [colour.as_json() for colour in product.colours]
    wanted = link_variant(link)
    for colour in shown:
        for size in colour["sizes"]:
            if wanted and wanted == size["variant_id"]:
                return colour, size["size"]
        if wanted and wanted == colour["external_id"]:
            return colour, None
    return (shown[0], None) if len(shown) == 1 else None


def draft(resolution: Resolution, now: datetime) -> tuple[dict, list[dict]]:
    """(payload, candidates) for one resolved link."""
    url = resolution.url
    source = source_for(url)
    product = resolution.product
    if product is None:
        title = resolution.title or name_from_link(url)
        payload = {
            "name": title[:120],
            "link": {
                "url": url,
                "state": "kept",
                "via": None,
                "code": resolution.code,
                "message": resolution.message,
            },
            "seed": {
                "source": source,
                "order_id": None,
                # A kept link is one piece by its address.
                "store_item_no": item_ref(url, ""),
                "price_usd": None,
                "image_url": None,
                "key": None,
                "not_owned_key": None,
                "url": url,
                "fetched_at": now.isoformat(),
                "row": {"url": url, "code": resolution.code},
            },
            "image": "none",
        }
        payload["seed"]["key"] = entry_key(payload)
        return payload, []
    shown = product.as_json()
    first = shown["colours"][0]
    payload: dict[str, Any] = {
        "name": product.title[:120],
        "link": {
            "url": url,
            "state": "resolved",
            "via": product.via,
            "code": None,
            "message": None,
        },
        "seed": {
            "source": source,
            "order_id": None,
            "store_item_no": None,
            "price_usd": _usd(product.currency, first.get("price")),
            "image_url": first.get("image_url"),
            "key": None,
            "not_owned_key": None,
            "url": url,
            "fetched_at": now.isoformat(),
            "row": shown,
        },
    }
    if product.brand:
        payload["brand"] = product.brand[:80]
    payload["image"] = "pending" if payload["seed"]["image_url"] else "none"
    # With several colours none is chosen yet: the commit asks first.
    payload["seed"]["key"] = entry_key(payload)
    chosen = _chosen_colour(product, url)
    if chosen is not None:
        payload = apply_colour(payload, shown, *chosen)
    return payload, shown["colours"]


async def import_links(
    session: AsyncSession, sitting_id: uuid.UUID, urls: list[str]
) -> LinkImport:
    """Resolves the links and writes one `typed` garment entry for each one
    not already in the sitting. Does not commit. The stores are asked at the
    same time (a host's requests stay spaced), robots read once per host."""
    result = LinkImport()
    held = await session.scalars(
        select(IntakeEntry).where(
            IntakeEntry.sitting_id == sitting_id,
            IntakeEntry.state != IntakeEntryState.IGNORED,
        )
    )
    held = list(held)
    seen = {((e.payload or {}).get("link") or {}).get("url") for e in held} - {None}
    held_links = len(seen)
    wanted: list[str] = []
    for text in urls:
        link = normalise(text)
        if (
            not link.lower().startswith(("http://", "https://"))
            or " " in link
            or len(link) > MAX_URL_CHARS
        ):
            result.not_links += 1
        elif link in seen:
            result.duplicates += 1
        else:
            seen.add(link)
            wanted.append(link)
    if not wanted:
        return result
    if held_links + len(wanted) > MAX_ENTRIES:
        raise TooManyLinks(
            f"A sitting holds at most {MAX_ENTRIES} links; commit it or start another"
        )
    gate = asyncio.Semaphore(CONCURRENCY)
    async with Fetcher() as fetcher:

        async def one(link: str) -> Resolution:
            async with gate:
                return await resolve(link, fetcher=fetcher)

        tasks = [asyncio.create_task(one(link)) for link in wanted]
        await asyncio.wait(tasks, timeout=TOTAL_SECONDS)
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
    answers = [
        task.result()
        if task.done() and not task.cancelled() and task.exception() is None
        else Resolution(
            link,
            code="timeout",
            message="The store took too long; the link is kept as typed",
        )
        for link, task in zip(wanted, tasks, strict=True)
    ]
    now = datetime.now(UTC)
    for index, resolution in enumerate(answers):
        payload, candidates = draft(resolution, now)
        entry = IntakeEntry(
            sitting_id=sitting_id,
            kind="garment",
            state=IntakeEntryState.TYPED,
            payload=payload,
            candidates=candidates,
            # One transaction gives every row the same now(); keep the paste's
            # order.
            created_at=now + timedelta(microseconds=index),
        )
        session.add(entry)
        result.entries.append(entry)
        if resolution.product is None:
            result.kept += 1
        else:
            result.read += 1
    return result


class ChoiceRefused(Exception):
    """The choice is not one this entry offers; the message is the owner's."""


class EntryGone(Exception):
    """The entry was removed or already written; nothing can change it."""


def merge_edit(old: dict[str, Any], edit: dict[str, Any]) -> dict[str, Any]:
    """A Check edit of a link piece: only the keys sent change (a blank
    removes one) and the server's own keys stay. A save sent before a colour
    choice therefore cannot put the old colour's fields back."""
    merged = dict(old)
    for key, value in edit.items():
        if key in SERVER_KEYS:
            continue
        if value is None or (isinstance(value, str) and not value.strip()):
            merged.pop(key, None)
        else:
            merged[key] = value
    return merged


async def choose_colour(
    session: AsyncSession, entry: IntakeEntry, external_id: str
) -> IntakeEntry:
    """Chooses one of the entry's colours. The photo held for the old choice
    is dropped (the new colour's is fetched next); the entry's candidates are
    the server's, so the page can only pick among them. Does not commit."""
    if entry.state is IntakeEntryState.IGNORED or entry.garment_id is not None:
        raise EntryGone("That piece was removed from the sitting")
    payload = entry.payload or {}
    link = payload.get("link") or {}
    if link.get("state") != "resolved" or not isinstance(payload.get("seed"), dict):
        raise ChoiceRefused("This piece has no colours to choose from")
    candidate = next(
        (c for c in entry.candidates or [] if c.get("external_id") == external_id),
        None,
    )
    if candidate is None:
        raise ChoiceRefused("That colour is not one this link offered")
    product = payload["seed"].get("row")
    if not isinstance(product, dict):
        raise ChoiceRefused("This piece's link record is damaged; remove it")
    changed = candidate.get("image_url") != payload["seed"].get("image_url")
    chosen = apply_colour(payload, product, candidate)
    if not changed:
        # The same photo: whatever happened to it (held, failed) stands.
        chosen["image"] = payload.get("image", chosen["image"])
        if "image_error" in payload:
            chosen["image_error"] = payload["image_error"]
    entry.payload = chosen
    if changed and entry.photo_id is not None:
        photo = await session.get(IntakePhoto, entry.photo_id)
        entry.photo_id = None
        if photo is not None:
            await session.delete(photo)
    return entry
