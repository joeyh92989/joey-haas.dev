"""The closet seed file: a CSV of purchased pieces (issue #396).

Pure: no database, no network. `parse_seed` turns the file's text into rows
and the sentences for the lines it cannot read; the keys below decide when
two rows are the same piece. `intake/seed_import.py` does the writing.

Columns (a header row, UTF-8): `n, source, order_id, date, date_basis,
brand, name, color_name, size, price_usd, category_hint, store_item_no,
still_owned, image_url`. Only `source`, `name` and `still_owned` must be
filled; any other column may be missing or empty, and an extra one is kept
in the row's snapshot but otherwise ignored.
"""

from __future__ import annotations

import csv
import io
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal, InvalidOperation
from typing import Any

from closet_colors import colour_family
from models import GarmentCategory, GarmentProductSource

# What the file's `source` may say: the stores, never `link` or `manual`.
FILE_SOURCES = frozenset(
    source.value
    for source in GarmentProductSource
    if source not in (GarmentProductSource.LINK, GarmentProductSource.MANUAL)
)
CATEGORIES = frozenset(category.value for category in GarmentCategory)
MAX_ROWS = 500
MAX_FILE_BYTES = 1024 * 1024
MAX_PROBLEMS = 5
_YES = frozenset({"yes", "y", "true", "1"})
_NO = frozenset({"no", "n", "false", "0"})
REQUIRED_COLUMNS = ("source", "name", "still_owned")


class SeedFileError(ValueError):
    """A file that cannot be read at all; its message is for the owner."""


@dataclass(frozen=True)
class SeedRow:
    """One purchased piece. `raw` is the line as the file gave it: it is the
    product's snapshot, so a later re-read sees what the store said."""

    line: int
    source: str
    order_id: str | None
    bought_on: date | None
    brand: str | None
    name: str
    color_name: str | None
    size: str | None
    price: Decimal | None
    category: str | None
    store_item_no: str | None
    still_owned: bool
    image_url: str | None
    raw: dict[str, str]


@dataclass
class ParsedSeed:
    rows: list[SeedRow] = field(default_factory=list)
    # One sentence per line that could not be read, at most MAX_PROBLEMS.
    problems: list[str] = field(default_factory=list)
    unreadable: int = 0


def _clean(value: str | None) -> str | None:
    return (value or "").strip() or None


def _norm(value: str | None) -> str:
    return " ".join((value or "").lower().split())


def _date(text: str | None) -> date | None:
    try:
        return date.fromisoformat(text) if text else None
    except ValueError:
        return None


# garment_products.price is numeric(8,2).
MAX_PRICE = Decimal("999999.99")
# garment_products.order_ref and store_item_no are String(80).
MAX_REF = 80


class PriceTooLarge(ValueError):
    pass


def _price(text: str | None) -> Decimal | None:
    """The price to the cent; None for text that is no price. Raises
    PriceTooLarge for one the column cannot hold."""
    if not text:
        return None
    try:
        price = Decimal(text.replace("$", "").replace(",", "").strip())
    except InvalidOperation:
        return None
    if not price.is_finite() or price < 0:
        return None
    price = price.quantize(Decimal("0.01"))
    if price > MAX_PRICE:
        raise PriceTooLarge
    return price


def dup_key(
    source: str,
    order_id: str | None,
    store_item_no: str | None,
    name: str | None,
    color_name: str | None,
    size: str | None,
) -> str:
    """When two rows are one piece: the store's item number and the size
    when it gave a number (the same item in another size is another piece),
    else the order line (order, name, colour, size). The order and item
    number are cut to what `garment_products` stores (80 characters), so a
    stored row and the file's row agree."""
    order_id = (order_id or "")[:MAX_REF]
    if store_item_no:
        return f"{source}|item|{_norm(store_item_no[:MAX_REF])}|{_norm(size)}"
    return "|".join(
        [source, _norm(order_id), _norm(name), _norm(color_name), _norm(size)]
    )


def not_owned_key(
    source: str,
    order_id: str | None,
    store_item_no: str | None,
    name: str | None,
    color_name: str | None,
    size: str | None,
) -> str:
    """The durable "Don't own this" key (design D7):
    `source|order_id|store_item_no`, or `source|order_id|name+colour+size`
    when the store gave no item number (two colours of one name in an order
    are two pieces)."""
    ident = _norm(store_item_no) or f"{_norm(name)}+{_norm(color_name)}+{_norm(size)}"
    return f"{source}|{_norm(order_id)}|{ident}"


def row_dup_key(row: SeedRow) -> str:
    return dup_key(
        row.source,
        row.order_id,
        row.store_item_no,
        row.name,
        row.color_name,
        row.size,
    )


def row_not_owned_key(row: SeedRow) -> str:
    return not_owned_key(
        row.source,
        row.order_id,
        row.store_item_no,
        row.name,
        row.color_name,
        row.size,
    )


def _row(line: int, record: dict[str, str]) -> SeedRow | str:
    """The row, or the sentence for why it is unreadable."""
    get = lambda key: _clean(record.get(key))  # noqa: E731
    source = _norm(get("source"))
    if source not in FILE_SOURCES:
        allowed = ", ".join(sorted(FILE_SOURCES))
        return f"Line {line}: source “{get('source') or ''}” is not one of {allowed}"
    name = get("name")
    if not name:
        return f"Line {line}: the piece has no name"
    owned = _norm(get("still_owned"))
    if owned not in _YES | _NO:
        return f"Line {line}: still_owned must be yes or no"
    try:
        price = _price(get("price_usd"))
    except PriceTooLarge:
        return f"Line {line}: the price is too large"
    hint = _norm(get("category_hint"))
    return SeedRow(
        line=line,
        source=source,
        order_id=get("order_id"),
        bought_on=_date(get("date")),
        brand=get("brand"),
        name=name,
        color_name=get("color_name"),
        size=get("size"),
        price=price,
        category=hint if hint in CATEGORIES else None,
        store_item_no=get("store_item_no"),
        still_owned=owned in _YES,
        image_url=get("image_url"),
        raw={key: (value or "").strip() for key, value in record.items() if key},
    )


def parse_seed(data: bytes | str) -> ParsedSeed:
    """Reads the file's rows. Raises SeedFileError for a file that is not a
    CSV with the needed columns, or has more than MAX_ROWS lines; a single
    line that cannot be read is counted and worded, never fatal."""
    if isinstance(data, bytes):
        if len(data) > MAX_FILE_BYTES:
            raise SeedFileError(
                f"That file is too large: at most {MAX_FILE_BYTES // 1024} KB"
            )
        try:
            text = data.decode("utf-8-sig")
        except UnicodeDecodeError:
            raise SeedFileError("That file is not UTF-8 text") from None
    else:
        text = data
    reader = csv.DictReader(io.StringIO(text, newline=""))
    header = [_norm(column) for column in (reader.fieldnames or [])]
    missing = [column for column in REQUIRED_COLUMNS if column not in header]
    if missing:
        raise SeedFileError("That file has no header row naming " + ", ".join(missing))
    reader.fieldnames = header
    parsed = ParsedSeed()
    try:
        for index, record in enumerate(reader, start=2):
            if index - 1 > MAX_ROWS:
                raise SeedFileError(f"That file has more than {MAX_ROWS} lines")
            if not any(
                (value or "").strip()
                for value in record.values()
                if isinstance(value, str)
            ):
                continue  # a blank line
            made = _row(index, record)
            if isinstance(made, str):
                parsed.unreadable += 1
                if len(parsed.problems) < MAX_PROBLEMS:
                    parsed.problems.append(made)
            else:
                parsed.rows.append(made)
    except csv.Error as error:
        raise SeedFileError(f"That file is not a readable CSV: {error}") from None
    return parsed


def entry_payload(row: SeedRow) -> dict[str, Any]:
    """The draft garment's payload: the fields Check shows, plus `seed`, the
    server's own record of the line (never taken from a request) and `image`,
    where the photo stands (`pending`, `held` or `failed`)."""
    payload: dict[str, Any] = {
        "name": row.name,
        "brand": row.brand,
        "color_name": row.color_name,
        "size": row.size,
        "category": row.category,
        "primary_color": colour_family(row.color_name),
        "acquired_on": row.bought_on.isoformat() if row.bought_on else None,
    }
    payload = {key: value for key, value in payload.items() if value is not None}
    payload["seed"] = {
        "source": row.source,
        "order_id": row.order_id,
        "store_item_no": row.store_item_no,
        "price_usd": str(row.price) if row.price is not None else None,
        "image_url": row.image_url,
        "key": row_dup_key(row),
        "not_owned_key": row_not_owned_key(row),
        "row": row.raw,
    }
    payload["image"] = "pending" if row.image_url else "none"
    return payload
