"""Response bodies of the intake routes (`intake/routes.py`).

These pin the JSON the routes already answer with: every model here
describes today's body, key for key. Open-ended content (an entry's
payload, a candidate, a search row) stays `dict[str, Any]`.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, NotRequired, TypedDict

from pydantic import BaseModel


class FieldSpecOut(BaseModel):
    key: str
    label: str
    control: str
    options: list[str]
    per_item: bool
    required: bool
    in_details: bool


class KindOut(BaseModel):
    """`GET /kinds`: one registered kind (`intake.kinds.describe`)."""

    key: str
    area: str
    label: str
    ways_in: list[str]
    has_details: bool
    fields: list[FieldSpecOut]
    source_state: str | None


class SearchSourceOut(BaseModel):
    kind: str
    state: str
    reason: str | None


class SearchOut(BaseModel):
    """`GET /search`. A result row carries `publisher` and `issue_count`
    only for Comic Vine, so rows stay open dicts."""

    results: list[dict[str, Any]]
    sources: list[SearchSourceOut]


class PhotoOut(BaseModel):
    id: str
    state: str
    filename: str | None
    error: str | None


class NumberCheckOut(BaseModel):
    state: str
    run: int | None


class EntryOut(TypedDict):
    """An entry as the page sees it. `number_check` is a comic's alone, so
    the key is left out of every other entry (a TypedDict keeps it out)."""

    id: str
    photo_id: str | None
    kind: str
    state: str
    payload: dict[str, Any]
    candidates: list[Any]
    chosen: dict[str, Any] | None
    garment_id: str | None
    on_shelf: dict[str, Any] | None
    number_check: NotRequired[NumberCheckOut]
    # A past outing's alone (story #350): date words, label, flags.
    outing: NotRequired[dict[str, Any]]
    # A comic's alone (`intake.commit.comic_adds_for`): what the entry adds
    # (a volume or an issue), and for a collected book its contents.
    adds: NotRequired[dict[str, Any]]
    contents_preview: NotRequired[list[dict[str, Any]]]
    title_will_be_created: NotRequired[bool]
    already_held: NotRequired[dict[str, Any] | None]
    books_preview: NotRequired[list[dict[str, Any]]]


class ResolveOut(EntryOut):
    """`POST /entries/{id}/resolve`: the entry and how many places in its
    sitting are still waiting to be looked up."""

    remaining: int


class PasteOut(BaseModel):
    """`POST /sittings/{id}/paste`: the entries made and what was left out."""

    entries: list[EntryOut]
    added: int
    blank: int
    duplicates: int
    over_limit: int


class SittingOut(BaseModel):
    """A sitting with its photos and entries."""

    id: str
    area: str
    kind: str | None
    label: str | None
    step: str
    photos: list[PhotoOut]
    entries: list[EntryOut]


class SittingSummaryOut(BaseModel):
    """One row of `GET /sittings`: counts only."""

    id: str
    area: str
    kind: str | None
    label: str | None
    step: str
    photos: int
    photos_waiting: int
    entries: dict[str, int]
    created_at: datetime
    updated_at: datetime


class ReadNextOut(BaseModel):
    status: str
    photo: PhotoOut | None
    entries: list[EntryOut]


class BeforeOut(BaseModel):
    owned: int
    released: int | None


class SeriesGrewOut(BaseModel):
    item_id: str
    title: str
    is_public: bool
    cover_url: str | None
    before: BeforeOut
    ongoing: bool
    added: list[int]
    already: list[int]
    books_added: list[dict[str, Any]]
    after_owned_text: str


class RefusalOut(BaseModel):
    entry_id: str
    field: str | None
    message: str


class VolumeNewOut(BaseModel):
    """A volume a commit wrote (a collected book)."""

    id: str
    slug: str
    label: str
    kind: str
    line_number: int | None
    title: str
    title_id: str
    title_created: bool


class TitleCreatedOut(BaseModel):
    id: str
    title: str


class SpotRefOut(BaseModel):
    """A spot a place commit made, or found already owned."""

    id: str
    name: str


class AddOut(BaseModel):
    """`POST /add`, 200 or 201."""

    added: int
    already_owned: int
    issues_added: int
    series_grew: list[SeriesGrewOut]
    created: list[str]
    garment_id: str | None
    volumes_new: list[VolumeNewOut] = []
    titles_created: list[TitleCreatedOut] = []
    spots_new: list[SpotRefOut] = []
    spots_owned: list[SpotRefOut] = []


class RefusedOut(BaseModel):
    """`POST /add` 422: the first message as `detail`, every refusal listed."""

    detail: str
    refused: list[RefusalOut]


class FileCountsOut(BaseModel):
    """What a seed file did to a sitting, as Done reports it."""

    added: int
    skipped_not_owned: int
    skipped_known_not_owned: int
    already_imported: int
    duplicates: int
    unreadable: int


class FileImportOut(FileCountsOut):
    """`POST /sittings/{id}/file`: this file's counts and the first lines
    that could not be read, in words."""

    problems: list[str]


class LinksOut(BaseModel):
    """`POST /sittings/{id}/links`: the entries made, and how the pasted
    links went: `read` came from the store, `kept` stayed as typed with a
    reason on the entry, `not_links` were not addresses, `duplicates` were
    already in the sitting."""

    entries: list[EntryOut]
    read: int
    kept: int
    not_links: int
    duplicates: int


class SeedImagesOut(BaseModel):
    """`POST /sittings/{id}/seed-images`: the entries whose photo was just
    fetched (or failed), and how many still wait."""

    entries: list[EntryOut]
    pending: int


class CommitOut(BaseModel):
    """`POST /sittings/{id}/commit`."""

    series_new: list[dict[str, Any]]
    added: int
    already_owned: int
    issues_added: int
    series_grew: list[SeriesGrewOut]
    skipped_kept: int
    photos_empty: int
    photos_waiting: int
    images_missing: int
    file_import: FileCountsOut | None
    refused: list[RefusalOut]
    created: list[str]
    volumes_new: list[VolumeNewOut] = []
    titles_created: list[TitleCreatedOut] = []
    spots_new: list[SpotRefOut] = []
    spots_owned: list[SpotRefOut] = []
    outings_new: int = 0


class CommitRefusedOut(CommitOut):
    """`POST /sittings/{id}/commit` 422: the same shape plus `detail`,
    and no `created`."""

    detail: str
    created: list[str] = []


class BudgetOut(BaseModel):
    remaining: int
    enforced: bool
    resets_at: datetime


class NightlySummaryOut(BaseModel):
    """The nightly's summary, as `POST /jobs/nightly` answers and
    `nightly.last_run` stores it."""

    at: str
    state: str
    ok: bool
    expired: int
    photos_expired: int
    read: int
    waiting: int
    note: str | None


# `GET /status`: the key has a dot (`nightly.last_run`), so it is a dict.
StatusBody = dict[str, dict[str, Any] | None]
