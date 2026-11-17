"""Response bodies of the comics admin routes (`comics_routes.py`).

Each model describes the JSON its route already answers with, key for key.
Where today's body leaves a key out (rather than sending null) the model is
a TypedDict with that key `NotRequired`, so the key stays absent. Open-ended
content stays `dict[str, Any]`.

The wall and the comic block reuse the public models the public routes
already answer with (`public_issues.PublicWall`, `public_comics.
PublicComicDetail`), so a private field cannot join either body here.
"""

from __future__ import annotations

import uuid
from typing import Annotated, Literal, NotRequired, TypedDict

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    field_validator,
    model_validator,
)

from comics import MAX_ISSUE
from public_comics import PublicComicDetail
from public_issues import PublicWall


class RunSegmentOut(BaseModel):
    kind: str
    length: int


class ComicRunOut(BaseModel):
    """`comics.row_run`: one row's run summary."""

    owned: int
    released: int
    missing: int
    state: str
    ongoing: bool
    segments: list[RunSegmentOut]
    owned_text: str
    read: int
    unread: int
    read_next: int | None


class ComicStateOut(BaseModel):
    """A row's comic state after a write (`comics_routes._state`): follow,
    unfollow (when the row stays), want, got, skip and refresh answer it."""

    item_id: str
    title: str
    owned_format: str | None
    status: str
    is_public: bool
    following: bool
    issues_owned: str | None
    issues_skipped: str | None
    comic_run: ComicRunOut


class UnfollowRemovedOut(BaseModel):
    """Unfollow of a row Follow made and nothing else holds: it is deleted."""

    model_config = ConfigDict(extra="forbid")

    item_id: None
    following: bool


class MarkOut(ComicStateOut):
    """The state plus what the tap did; `previous` names what a first tap
    moved on a Want (owned format, status) so Undo can restore it."""

    number: int
    state: str
    previous: dict[str, str | None] | None


class VolumeMarkIn(BaseModel):
    """`PATCH /volumes/{id}`: at least one of the two."""

    model_config = ConfigDict(extra="forbid")

    owned: bool | None = None
    read: bool | None = None


class VolumeStateOut(BaseModel):
    """`PATCH /volumes/{id}`: the volume after the write, the run of its own
    title, and the ids of every row whose marks were re-synced."""

    id: str
    item_id: str
    slug: str
    label: str
    kind: str
    owned: bool
    read: bool
    comic_run: ComicRunOut | None
    touched: list[str]


class VolumeHitOut(BaseModel):
    """`GET /search`: a Comic Vine volume marked with what the shelf holds."""

    external_id: str
    title: str
    year: int | None
    publisher: str | None
    issue_count: int | None
    thumbnail_url: str | None
    item_id: str | None
    in_shelf: bool
    wanted: bool
    following: bool


class IssueHitOut(BaseModel):
    """`GET /issues/search`: one `CvIssueHit`."""

    cv_id: int
    volume_name: str
    number: str
    name: str | None
    thumb_url: str | None
    year: int | None


class PullRowOut(BaseModel):
    item_id: str
    title: str
    publisher: str | None
    number: int | None
    name: str | None
    store_date: str
    cover_url: str | None
    owned_text: str
    released: int | None
    on_shelf: bool


class PullWeekOut(BaseModel):
    start: str
    this_week: bool
    rows: list[PullRowOut]


class PullUndatedOut(BaseModel):
    item_id: str
    title: str


class PullListOut(BaseModel):
    following: int
    last_refresh: str | None
    weeks: list[PullWeekOut]
    undated: list[PullUndatedOut]


class WallOut(BaseModel):
    """`GET /{id}/wall`: the public builders' bodies, private series too."""

    wall: PublicWall | None
    comic: PublicComicDetail


class BackfillMismatchOut(BaseModel):
    id: str
    title: str
    numbers: list[int]


class BackfillErrorOut(BaseModel):
    id: str
    title: str
    error: str


class BackfillOut(BaseModel):
    """`POST /marks/backfill`."""

    series: int
    rows_marked: int
    stubs_added: int
    rows_changed: int
    mismatches: list[BackfillMismatchOut]
    errors: list[BackfillErrorOut]


class RefreshErrorOut(BaseModel):
    item_id: str
    title: str
    error: str


class RefreshAllOut(BaseModel):
    """`POST /refresh`."""

    ok: bool
    refreshed: int
    errors: list[RefreshErrorOut]


class TagOut(BaseModel):
    group: str
    tag: str


class TaggedSeriesOut(BaseModel):
    id: str
    title: str
    tags: list[TagOut]


class GaveUpOut(BaseModel):
    id: str
    title: str


class TagErrorOut(BaseModel):
    id: str | None
    title: str | None
    error: str


class TagsGenerateOut(BaseModel):
    """`POST /tags/generate`."""

    tagged: int
    failed: int
    ok: bool
    calls: int
    budget: int
    waiting: int
    gave_up: list[GaveUpOut]
    stopped: str | None
    series: list[TaggedSeriesOut]
    errors: list[TagErrorOut]


class SyncSeriesOut(TypedDict):
    """One series' entry of the issue sync; `error` is there only on a failure."""

    id: str
    requests: int
    written: int
    complete: bool
    error: NotRequired[str]


class IssuesSyncOut(BaseModel):
    """`POST /issues/sync`."""

    ok: bool
    series: list[SyncSeriesOut]
    requests: int


class RunSummaryOut(TypedDict):
    """The Jobs page's view of a run (`issues_run_summary`, `tags_run_summary`);
    `note` is absent on a clean run."""

    at: str
    state: str
    ok: bool
    note: NotRequired[str]


class ComicsStatusOut(BaseModel):
    """`GET /status`. The keys carry dots, so the fields are aliased
    (FastAPI serialises by alias)."""

    issues_last_run: RunSummaryOut | None = Field(alias="issues.last_run")
    refresh_last_run: RunSummaryOut | None = Field(alias="refresh.last_run")
    tags_last_run: RunSummaryOut | None = Field(alias="tags.last_run")


class EditionLinkOut(BaseModel):
    """`PUT /{id}/editions/{slug}/link`. Editions are open JSONB dicts."""

    item_id: str
    editions: list[dict]


# --- The admin volume editor (#334) --------------------------------------------

VolumeKind = Literal["trade", "hardcover", "omnibus", "compendium", "ogn"]
Trimmed = Annotated[str, StringConstraints(strip_whitespace=True)]


def _blank_to_none(value: object) -> object:
    if isinstance(value, str):
        value = value.strip()
        return value or None
    return value


class VolumeFieldsIn(BaseModel):
    """The fields a person types on a volume (create and replace)."""

    model_config = ConfigDict(extra="forbid")

    label: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)
    ]
    kind: VolumeKind
    line_number: Annotated[int, Field(ge=1, le=9999)] | None = None
    isbn: Annotated[str, Field(max_length=40)] | None = None
    pages: Annotated[int, Field(ge=1, le=20000)] | None = None
    description: Annotated[str, Field(max_length=20000)] | None = None

    @field_validator("isbn", "description", mode="before")
    @classmethod
    def _empty_is_none(cls, value: object) -> object:
        return _blank_to_none(value)


class VolumeCreateIn(VolumeFieldsIn):
    """`POST /{item_id}/volumes`."""

    owned: bool = True
    read: bool = False


class CollectLinkIn(BaseModel):
    """A collects entry's link to a synced run: both bounds, 1 <= from <= to."""

    model_config = ConfigDict(extra="forbid")

    item_id: uuid.UUID
    from_number: Annotated[int, Field(ge=1, le=MAX_ISSUE)]
    to_number: Annotated[int, Field(ge=1, le=MAX_ISSUE)]

    @model_validator(mode="after")
    def _ordered(self) -> "CollectLinkIn":
        if self.from_number > self.to_number:
            raise ValueError("from_number must not be above to_number")
        return self


class CollectIn(BaseModel):
    """One contents entry of `PUT /volumes/{id}`. `id` is sent back for an
    entry the client keeps; `source` may only be 'typed' for a new or changed
    entry (an unchanged one keeps the stored source)."""

    model_config = ConfigDict(extra="forbid")

    id: uuid.UUID | None = None
    series_name: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)
    ]
    issue_text: Annotated[
        str, StringConstraints(strip_whitespace=True, max_length=200)
    ] = ""
    source: Literal["migrated", "typed", "parsed", "photo"] | None = None
    link: CollectLinkIn | None = None


class VolumeReplaceIn(VolumeFieldsIn):
    """`PUT /volumes/{id}`: the editable fields and the whole contents list."""

    owned: bool
    read: bool
    collects: Annotated[list[CollectIn], Field(max_length=200)]


class VolumeMoveIn(BaseModel):
    """`POST /volumes/{id}/move`."""

    model_config = ConfigDict(extra="forbid")

    item_id: uuid.UUID


class VolumeLinkIn(BaseModel):
    """`PUT /volumes/{id}/link`: cv_id null unlinks. Cover and description are
    fetched server-side, never taken from the client."""

    model_config = ConfigDict(extra="forbid")

    cv_id: int | None = Field(default=None, ge=1, le=2147483647)


class VolumeTitleOut(BaseModel):
    id: str
    title: str
    is_public: bool


class CollectLinkOut(BaseModel):
    item_id: str
    title: str
    from_number: int | None
    to_number: int | None
    is_public: bool


class CollectOut(BaseModel):
    id: str
    position: int
    series_name: str
    issue_text: str
    source: str
    link: CollectLinkOut | None


class VolumeNeighbourOut(BaseModel):
    id: str
    slug: str
    label: str
    line_number: int | None
    owned: bool


class VolumeAdminOut(BaseModel):
    """`GET /volumes/{id}` and what the writes answer: the whole admin view,
    private data included. `held_issues` is the canonical range text of the
    title's own issues this volume's linked collects cover (null when none)."""

    id: str
    item_id: str
    slug: str
    position: int
    label: str
    kind: str
    kind_raw: str | None
    line_number: int | None
    isbn: str | None
    pages: int | None
    description: str | None
    cover_url: str | None
    large_url: str | None
    cv_id: int | None
    owned: bool
    read: bool
    edited: bool
    created_at: str
    title: VolumeTitleOut
    collects: list[CollectOut]
    prev: VolumeNeighbourOut | None
    next: VolumeNeighbourOut | None
    held_issues: str | None
    held_count: int


class VolumeMoveOut(BaseModel):
    """`POST /volumes/{id}/move`: `slug_kept` says whether the old slug
    survived (no collision on the new title); `previous_slug` is the old one."""

    volume: VolumeAdminOut
    previous_slug: str
    slug_kept: bool
    touched: list[str]


class UnheldOut(BaseModel):
    item_id: str
    title: str
    numbers: str
    count: int


class VolumeDeletePreviewOut(BaseModel):
    """`GET /volumes/{id}/delete-preview`: what deleting the volume takes
    with it. `issues_unheld` lists, per title, the issues nothing else holds
    once the volume is gone (a loose single or another owned volume still
    holds an issue, so it is not listed)."""

    label: str
    title: str
    collects_count: int
    issues_unheld: list[UnheldOut]
    read_marks_lost: int


class VolumeDeletedOut(BaseModel):
    """`DELETE /volumes/{id}`."""

    id: str
    item_id: str
    touched: list[str]


class VolumeLinkOut(BaseModel):
    """`PUT /volumes/{id}/link`."""

    id: str
    cv_id: int | None
    cover_url: str | None
    large_url: str | None
    description: str | None
    edited: bool
