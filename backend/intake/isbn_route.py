"""`GET /api/intake/isbn/{isbn}`: what Open Library says about an ISBN, and
whether a volume with it is already on the shelf (story #336).

Admin only, through the intake router. A lookup is a convenience and never a
gate: a miss, a timeout or a throttled answer is a 200 with `found: false` and
a `reason`, and only a malformed ISBN is a 422 (nothing is requested then).
No model call, so no intake budget.
"""

from __future__ import annotations

import logging
import uuid
from collections.abc import Callable
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from models import ComicVolume, Item
from sources import openlibrary
from sources.base import SourceError, SourceRateLimited, SourceUnavailable

logger = logging.getLogger(__name__)

Reason = Literal["not_found", "rate_limited", "unavailable", "error"]


class OnShelf(BaseModel):
    item_id: uuid.UUID
    title: str
    volume_slug: str


class IsbnLookupOut(BaseModel):
    isbn: str
    found: bool
    reason: Reason | None = None
    title: str | None = None
    subtitle: str | None = None
    volume_number: int | None = None
    publisher: str | None = None
    year: int | None = None
    pages: int | None = None
    cover_url: str | None = None
    on_shelf: list[OnShelf] = []


async def volumes_with_isbn(session: AsyncSession, isbn13: str) -> list[OnShelf]:
    """Volumes whose stored ISBN is this book, in either form and with or
    without hyphens or spaces (`comic_volumes.isbn` is free text from the
    volume editor). Newest title first, then line order."""
    wanted = [isbn13]
    if (ten := openlibrary.isbn10_of(isbn13)) is not None:
        wanted.append(ten)
    bare = func.upper(func.replace(func.replace(ComicVolume.isbn, "-", ""), " ", ""))
    rows = await session.execute(
        select(ComicVolume.item_id, Item.title, ComicVolume.slug)
        .join(Item, Item.id == ComicVolume.item_id)
        .where(ComicVolume.isbn.is_not(None), bare.in_(wanted))
        .order_by(Item.title, ComicVolume.position)
    )
    return [OnShelf(item_id=i, title=t, volume_slug=s) for i, t, s in rows]


def register_isbn_route(router: APIRouter, get_session: Callable[..., Any]) -> None:
    """Adds the route to the intake router (admin only through it)."""

    @router.get("/isbn/{isbn}", response_model=IsbnLookupOut)
    async def lookup_isbn(
        isbn: str, session: AsyncSession = Depends(get_session)
    ) -> IsbnLookupOut:
        """Validates the ISBN (422 on a bad one, before any request), then
        asks Open Library and the shelf. A failed lookup still answers with
        the shelf's matches."""
        try:
            isbn13 = openlibrary.normalize_isbn(isbn)
        except openlibrary.InvalidIsbn as error:
            raise HTTPException(422, str(error)) from error
        on_shelf = await volumes_with_isbn(session, isbn13)
        reason: Reason | None = None
        book = None
        try:
            book = await openlibrary.lookup(isbn13)
            if book is None:
                reason = "not_found"
        except SourceRateLimited:
            reason = "rate_limited"
        except SourceUnavailable:
            reason = "unavailable"
        except SourceError:
            logger.exception("openlibrary lookup failed")
            reason = "error"
        if book is None:
            return IsbnLookupOut(
                isbn=isbn13, found=False, reason=reason, on_shelf=on_shelf
            )
        return IsbnLookupOut(
            isbn=isbn13,
            found=True,
            title=book.title,
            subtitle=book.subtitle,
            volume_number=book.volume_number,
            publisher=book.publisher,
            year=book.year,
            pages=book.pages,
            cover_url=book.cover_url,
            on_shelf=on_shelf,
        )
