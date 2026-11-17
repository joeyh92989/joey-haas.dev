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

from typing import NotRequired, TypedDict

from pydantic import BaseModel, ConfigDict, Field

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
