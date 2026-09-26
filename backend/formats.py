"""The copy fields: platform, physical format, cart ID, region, completeness.

Every write path -- PATCH, create, bulk create, bulk set -- sends its changes
through apply_copy_fields before they reach a row, so these rules hold however
an item is written. The function is pure: it neither reads the database nor
mutates its arguments, which is what lets every rule be tested without one.

Two fields are never accepted from a request and are derived here instead:
`platform`, the display name of `platform_id`, and `format_source`, which
records how `physical_format` was decided. A cart ID is the strongest evidence
of a Switch 2 copy's format, because it is printed on the cartridge itself; a
format the owner enters by hand is recorded as `manual`.

The physical catalogue (E7c) adds one automated writer, apply_registry_format,
and one request key, `edition_id`: both write the registry's format and
neither may touch a format the owner recorded (`manual`, `cart_id`, `photo`).
The constants shared with the catalogue's pure parsers live in
physical_sources/limits.py, because this module imports models (SQLAlchemy)
and those parsers must not.
"""

from __future__ import annotations

import enum
import re

from models import FormatSource, Item, PhysicalFormat
from physical_sources.limits import (  # noqa: F401  (re-exported)
    CART_ID_PATTERN,
    CARTRIDGE_ONLY_PLATFORMS,
    FORMAT_WORDS,
    HOME_REGION,
)
from sources.igdb import PLATFORM_NAMES

# Platforms where a physical copy may not hold the game: a Switch 2 box can be
# a Game-Key Card. An unrecorded format there is shown as unknown, never as a
# cartridge.
SWITCH_2 = 508
KEY_CARD_PLATFORMS = frozenset({SWITCH_2})

# Platforms whose copies are collected by completeness (loose, boxed, CIB).
CARTRIDGE_ERA_PLATFORMS = frozenset({4})

CART_ID_FORMATS = {
    "LP": PhysicalFormat.GAME_KEY_CARD,
    "LB": PhysicalFormat.GAME_CARD,
    "LN": PhysicalFormat.GAME_CARD,
    # A Switch 1 cartridge: a full game, but on a Switch 2 copy it means the
    # platform was recorded wrongly.
    "LA": PhysicalFormat.GAME_CARD,
}
REGION_PATTERN = re.compile(r"^[A-Z]{2,4}$")

FORMAT_LABELS = {PhysicalFormat(value): words for value, words in FORMAT_WORDS.items()}

# Derived on the server and never taken from a request body.
DERIVED_FIELDS = ("platform", "format_source")

# Formats the owner recorded: nothing automated may overwrite them.
PROTECTED_SOURCES = frozenset({"manual", "cart_id", "photo"})


class CopyFieldError(ValueError):
    """A copy-field change the rules refuse; the message is shown as is."""


def _value(value: object) -> object:
    return value.value if isinstance(value, enum.Enum) else value


def _normalise_cart_id(raw: str) -> str:
    cart_id = raw.strip().upper()
    if not CART_ID_PATTERN.match(cart_id):
        raise CopyFieldError("That cart ID does not look like LX-XXXXX-XXX-X.")
    return cart_id


def _normalise_region(raw: str) -> str:
    region = raw.strip().upper()
    if not REGION_PATTERN.match(region):
        raise CopyFieldError("Region must be 2 to 4 letters, like USA.")
    return region


def apply_registry_format(row: Item, edition_format: str | None) -> dict:
    """The change that records a registry edition's format on an owned row.

    {} when the edition states no format. Raises CopyFieldError when the row's
    format came from its owner -- by hand, from its cart ID, or from a photo
    -- so no caller can relabel a copy the owner has spoken for; the registry
    sync reports those as disagreements instead.
    """
    source = _value(row.format_source)
    if source in PROTECTED_SOURCES:
        raise CopyFieldError(
            f"This copy's format was recorded from {source}; the registry "
            "does not overwrite it."
        )
    if edition_format is None:
        return {}
    return {
        "physical_format": PhysicalFormat(edition_format),
        "format_source": FormatSource.REGISTRY,
    }


def _adopt_registry_edition(changes: dict, row: Item | None) -> dict:
    """A request's edition_id turned into the format it names ("Use registry
    value"). The caller resolved the edition and put its format in
    edition_format; the edition's cart ID is never copied -- items.cart_id
    means "printed on my copy". The request's other fields go through the
    usual rules first.
    """
    rest = {
        k: v for k, v in changes.items() if k not in ("edition_id", "edition_format")
    }
    edition_format = changes.get("edition_format")
    if {"physical_format", "cart_id"} & rest.keys():
        raise CopyFieldError("Send a format or a registry edition, not both.")
    result = apply_copy_fields(rest, row)
    cart_id = _value(getattr(row, "cart_id", None)) if row is not None else None
    if cart_id:
        raise CopyFieldError(
            f"This copy's cart ID {cart_id} decides its format; clear it to "
            "use the registry's."
        )
    if edition_format is None:
        raise CopyFieldError("That registry edition has no card type yet.")
    result["physical_format"] = PhysicalFormat(edition_format)
    result["format_source"] = FormatSource.REGISTRY
    return result


def apply_copy_fields(changes: dict, row: Item | None) -> dict:
    """Returns `changes` with the derived copy fields added.

    `changes` holds only the keys the request actually set. `row` is the
    current row for a PATCH or a bulk set, and None for a create. Keys this
    module does not govern pass through untouched.

    Raises CopyFieldError, whose message is safe to show, when a change breaks
    a rule.
    """
    if "edition_id" in changes:
        return _adopt_registry_edition(changes, row)
    result = {
        key: value
        for key, value in changes.items()
        if key not in DERIVED_FIELDS and key != "edition_format"
    }

    def current(field: str) -> object:
        return _value(getattr(row, field, None)) if row is not None else None

    # 1. Platform: a known id, and its name resolved here.
    if "platform_id" in result:
        wanted = result["platform_id"]
        if wanted is None:
            result["platform"] = None
        elif wanted in PLATFORM_NAMES:
            result["platform"] = PLATFORM_NAMES[wanted]
        else:
            raise CopyFieldError(f"Unknown platform id {wanted}.")
    platform = (
        result["platform_id"] if "platform_id" in result else current("platform_id")
    )

    # 6. Region, checked before the cart ID so a body region can win.
    if result.get("region") is not None:
        result["region"] = _normalise_region(result["region"])

    # 2. A cart ID in the body decides the format and, unless given, the region.
    if result.get("cart_id") is not None:
        cart_id = _normalise_cart_id(result["cart_id"])
        prefix, _, region, _ = cart_id.split("-")
        if prefix == "LA" and platform == SWITCH_2:
            raise CopyFieldError(
                "LA is a Switch 1 cartridge, so the platform looks wrong."
            )
        result["cart_id"] = cart_id
        if "region" not in result:
            result["region"] = region

    # The cart ID in force after this change: the body's, else the row's,
    # unless the body clears it or clears the format (which clears it too).
    clearing = result.get("physical_format", ...) is None
    if "cart_id" in result:
        effective_cart = result["cart_id"]
    else:
        effective_cart = None if clearing else current("cart_id")
    implied = CART_ID_FORMATS[effective_cart[:2]] if effective_cart else None

    # 3. A stated format must agree with the cart ID.
    stated = result.get("physical_format")
    if implied is not None and stated is not None and _value(stated) != implied.value:
        raise CopyFieldError(
            f"The cart ID says {FORMAT_LABELS[implied]}; clear the cart ID to "
            "record a different format."
        )

    # 2, 4 and 5: the format and how it was decided.
    if clearing:
        result["format_source"] = None
        result["cart_id"] = None
    elif implied is not None and "cart_id" in result:
        result["physical_format"] = implied
        result["format_source"] = FormatSource.CART_ID
    elif stated is not None:
        result["physical_format"] = PhysicalFormat(_value(stated))
        result["format_source"] = (
            FormatSource.CART_ID if implied is not None else FormatSource.MANUAL
        )
    elif "cart_id" in result:
        # The cart ID was cleared and the format left alone.
        result["format_source"] = (
            FormatSource.MANUAL if current("physical_format") else None
        )

    return result
