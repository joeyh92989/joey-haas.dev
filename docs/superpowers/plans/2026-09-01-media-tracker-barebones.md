# Media Tracker Barebones Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Take the media tracker from admin-gated CRUD on a bare `items` table to a populated, metadata-enriched, publicly viewable collection that can be backfilled by photographing physical shelves.

**Architecture:** A common source-adapter interface (`backend/sources/`) fronts four metadata APIs; a provider-agnostic LLM seam (`backend/llm.py`) reads titles off shelf photographs and the backend resolves each detection against the matching adapter; a read-only public router serves `is_public` rows to a new `/collection` page. Vision extraction returns titles only — never matches — so the entire resolution path is testable with zero model calls.

**Tech Stack:** FastAPI + SQLAlchemy 2 async + Alembic + asyncpg (Python 3.12), `httpx2` for HTTP, `defusedxml` for BGG's XML, Pydantic 2, pytest + pytest-asyncio; React 19 + react-router 8 + Vite 6, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-01-media-tracker-barebones-design.md`

## Global Constraints

- **Python 3.12.** macOS system Python is 3.9 and cannot install this dependency set. Use `backend/.venv`.
- **HTTP client is `httpx2`, imported as `import httpx2`.** The package and module are both named `httpx2`. There is no `httpx` in this environment — `import httpx` raises `ModuleNotFoundError`.
- **`config.py`'s `_REQUIRED` tuple must not grow.** Source and LLM keys are optional `Config` fields, checked lazily at first use. A missing ComicVine key must never stop the service booting.
- **Never name a column or attribute `metadata`** — reserved by SQLAlchemy's declarative base. The snapshot column is `source_metadata`.
- **Style with CSS variables from `frontend/src/index.css` only.** Never a raw hex value: a literal color is wrong in one of the two themes.
- **New font weights require a matching `@fontsource` import in `main.jsx`**, or the browser silently falls back.
- **Every route module is a `create_*_router(...)` factory** returning an `APIRouter`, registered in `main.py`. One module per project concern.
- **Admin routes carry `dependencies=[Depends(require_admin)]` at router level**, not per-route: FastAPI resolves dependencies before validating parameters, so an unauthenticated caller gets 401 and never 422.
- **Run after every file change:** `cd backend && ./.venv/bin/ruff format . && ./.venv/bin/ruff check .` and `cd frontend && npm run format && npm run lint`.
- **Tests run against real Postgres 18**, never SQLite. They skip when no database is reachable, except in CI where that is a hard error.
- **API keys never reach the browser.** Every source call is server-side.
- **Uploaded photos are never written to disk.**
- **Commits:** conventional messages, ≤5 files, each independently valid. Feature branch only — never `main`.

---

## File Structure

**Backend — created**

| File | Responsibility |
|---|---|
| `sources/__init__.py` | Package marker |
| `sources/base.py` | `SourceResult`, `SourceDetail`, `SourceAdapter` protocol, the four typed exceptions, the shared throttle helper |
| `sources/registry.py` | `ItemType` → adapter instance; `adapter_for()`; `configured_sources()` for the startup log |
| `sources/tmdb.py` | Films. v4 Bearer auth |
| `sources/igdb.py` | Games. Twitch client-credentials token, cached |
| `sources/comicvine.py` | Comic volumes. Custom User-Agent, ~1 req/s |
| `sources/bgg.py` | Board games. XML, ≤20 ids per `thing`, 202/429 retry |
| `matching.py` | Pure confidence scoring. No I/O, no imports from `sources/` |
| `llm.py` | `complete_json(prompt, schema, images)`; `GeminiProvider`, `AnthropicProvider` |
| `importer.py` | `POST /api/import/photos` — vision extraction then per-source resolution |
| `public.py` | Unauthenticated `GET /api/public/items`, `GET /api/public/stats` |
| `tests/fixtures/` | Recorded API responses. No live calls in CI |

**Backend — modified:** `models.py` (columns + `OwnedFormat`), `config.py` (optional fields), `items.py` (picker proxy, refresh, bulk), `main.py` (register routers, log configured sources), `requirements.txt`, `env.example`, `tests/test_schema_check.py` (head revision assertion).

**Frontend — created**

| File | Responsibility |
|---|---|
| `components/MetadataPicker.jsx` | Type-ahead search against the proxy; renders candidates; reports a selection |
| `components/ItemForm.jsx` | The add/edit form, extracted from `AdminCollection.jsx` |
| `components/CoverImage.jsx` | `<img>` with `onerror` placeholder and per-type aspect ratio |
| `pages/AdminImport.jsx` | Upload + confirm grid |
| `pages/Collection.jsx` | Public showcase |

`AdminCollection.jsx` is already 250 lines; adding the picker inline would push it past 400. Tasks 5 and 10 extract `ItemForm` and `MetadataPicker` rather than growing it.

**Frontend — modified:** `App.jsx` (two routes), `layouts/RootLayout.jsx` (footer auth), `pages/Projects.jsx` (collection card), `index.css` (grid, tiles, attribution).

---

## Task 0: File the milestone and five issues

**Parallel-safe.** No commit boundary. Must complete before Task 1.

**Files:** none — GitHub only.

**Interfaces:**
- Consumes: nothing
- Produces: five issue numbers, referenced in later commit messages as `refs #N`

- [ ] **Step 1: Confirm with Joey before creating anything**

These are outward-facing writes to a public repository. Show the milestone title and the five issue titles, and wait for an explicit go.

- [ ] **Step 2: Create the milestone**

```bash
gh api repos/:owner/:repo/milestones -f title='Tracker: barebones vertical slice' \
  -f description='Migration, source adapters, photo backfill, public showcase. Spec: docs/superpowers/specs/2026-09-01-media-tracker-barebones-design.md'
```

- [ ] **Step 3: Create the five issues**

Bodies come verbatim from the spec's `## Issues` section — one issue per numbered subsection, acceptance criteria copied as the checklist. All five: `--label enhancement --milestone 'Tracker: barebones vertical slice'`.

```bash
gh issue create --title 'Tracker: schema migration for enrichment columns' \
  --label enhancement --milestone 'Tracker: barebones vertical slice' --body-file -
```

- [ ] **Step 4: Record the issue numbers**

Write them into this plan under each zone heading so commits can reference them.

---

# Zone 1 — Schema migration

Carved out alone because it is a database migration.

## Task 1: Enrichment columns and the `owned_format` enum

**Files:**
- Modify: `backend/models.py`
- Create: `backend/migrations/versions/0002_add_enrichment_columns.py`
- Modify: `backend/tests/test_schema_check.py:44`
- Create: `backend/tests/test_migrations.py`

**Interfaces:**
- Consumes: `Item`, `ItemType`, `ItemStatus`, `Base` from `models.py`
- Produces: `OwnedFormat` enum (`PHYSICAL`/`DIGITAL`/`SUBSCRIPTION`/`BORROWED`/`NONE` → `"physical"`/`"digital"`/`"subscription"`/`"borrowed"`/`"none"`); `Item.year: int | None`, `Item.creator: str | None`, `Item.cover_url: str | None`, `Item.external_source: str | None`, `Item.external_id: str | None`, `Item.favorite: bool`, `Item.started_at: date | None`, `Item.finished_at: date | None`, `Item.times_completed: int`, `Item.owned_format: OwnedFormat | None`, `Item.source_metadata: dict | None`; head revision `"0002"`

- [ ] **Step 1: Write the failing migration test**

Create `backend/tests/test_migrations.py`. It runs the real migration chain against the test database — `conftest.py`'s `engine` fixture builds tables from `Base.metadata` and would therefore never catch migration/model drift.

```python
"""The migration chain must produce exactly what the models describe.

conftest's engine fixture creates tables from Base.metadata, so every other
test passes whether or not a migration exists. This module is the only place
the migrations themselves are exercised.
"""

import os
import subprocess
from pathlib import Path

import pytest
from alembic.autogenerate import compare_metadata
from alembic.runtime.migration import MigrationContext
from sqlalchemy import create_engine, text

from models import Base

BACKEND = Path(__file__).resolve().parent.parent
TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql://postgres:postgres@localhost:5432/postgres",
)
RUNNING_IN_CI = os.environ.get("CI", "").lower() in {"1", "true"}


def _alembic(*args: str) -> subprocess.CompletedProcess:
    """Runs alembic with the test database as the direct URL."""
    env = {**os.environ, "DATABASE_URL_DIRECT": TEST_DATABASE_URL}
    return subprocess.run(
        [str(BACKEND / ".venv" / "bin" / "alembic"), *args],
        cwd=BACKEND,
        env=env,
        capture_output=True,
        text=True,
    )


@pytest.fixture
def clean_database():
    """A database with no tables and no leftover enum types."""
    engine = create_engine(TEST_DATABASE_URL, future=True)
    try:
        with engine.begin() as connection:
            connection.execute(text("DROP SCHEMA public CASCADE"))
            connection.execute(text("CREATE SCHEMA public"))
    except Exception as error:
        engine.dispose()
        if RUNNING_IN_CI:
            raise
        pytest.skip(f"no test Postgres reachable: {error}")
    yield engine
    engine.dispose()


def test_upgrade_produces_the_schema_the_models_describe(clean_database):
    result = _alembic("upgrade", "head")
    assert result.returncode == 0, result.stderr

    with clean_database.connect() as connection:
        context = MigrationContext.configure(connection)
        diff = compare_metadata(context, Base.metadata)

    assert diff == [], f"migrations and models disagree: {diff}"


def test_downgrade_then_upgrade_is_clean(clean_database):
    # Postgres does not drop enum types with their tables. A downgrade that
    # forgets one fails the *next* upgrade with "type already exists", a long
    # way from its cause -- exactly the trap 0001's downgrade documents.
    assert _alembic("upgrade", "head").returncode == 0
    down = _alembic("downgrade", "base")
    assert down.returncode == 0, down.stderr
    up = _alembic("upgrade", "head")
    assert up.returncode == 0, up.stderr
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd backend && ./.venv/bin/pytest tests/test_migrations.py -v`
Expected: `test_upgrade_produces_the_schema_the_models_describe` FAILS — `compare_metadata` reports every new column as missing, because the models have them and migration 0001 does not.

- [ ] **Step 3: Add `OwnedFormat` and the columns to `models.py`**

Extend the existing imports — `Date` and `Index` from `sqlalchemy`, `JSONB` from `sqlalchemy.dialects.postgresql`, `date` from `datetime`, `text` from `sqlalchemy`.

```python
class OwnedFormat(str, enum.Enum):
    """How a copy is held, orthogonal to progress status.

    `NONE` is the want list: a row that is tracked but not owned. Keeping this
    separate from ItemStatus means the status enum continues to mean progress
    and nothing else.
    """

    PHYSICAL = "physical"
    DIGITAL = "digital"
    SUBSCRIPTION = "subscription"
    BORROWED = "borrowed"
    NONE = "none"
```

Inside `Item`, after `notes`:

```python
    year: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    creator: Mapped[str | None] = mapped_column(String(300), nullable=True)
    cover_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    external_source: Mapped[str | None] = mapped_column(String(20), nullable=True)
    external_id: Mapped[str | None] = mapped_column(String(50), nullable=True)
    favorite: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    started_at: Mapped[date | None] = mapped_column(Date, nullable=True)
    finished_at: Mapped[date | None] = mapped_column(Date, nullable=True)
    times_completed: Mapped[int] = mapped_column(
        SmallInteger, nullable=False, default=0, server_default="0"
    )
    # Nullable with no default on purpose. The importer sets `physical` on rows
    # it creates and the form requires a choice, so a want-list row means the
    # owner said so -- it is never an artifact of a column default.
    owned_format: Mapped[OwnedFormat | None] = mapped_column(
        Enum(
            OwnedFormat,
            name="owned_format",
            values_callable=lambda e: [m.value for m in e],
        ),
        nullable=True,
    )
    # Named source_metadata, never metadata: that attribute is reserved by
    # SQLAlchemy's declarative base.
    source_metadata: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
```

Add to `__table_args__`, after the existing indexes:

```python
        # Partial so that manual rows -- which have NULL on both columns --
        # stay out of the constraint entirely. Without the predicate, a second
        # manually-entered item would collide with the first.
        Index(
            "ux_items_external",
            "external_source",
            "external_id",
            unique=True,
            postgresql_where=text(
                "external_source IS NOT NULL AND external_id IS NOT NULL"
            ),
        ),
        Index("ix_items_finished_at", "finished_at"),
```

- [ ] **Step 4: Write migration 0002**

```python
"""add enrichment columns

Revision ID: 0002
Revises: 0001
Create Date: 2026-09-01
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# create_type=False because add_column will not create the type for us and
# op.create_table is not involved here: the type is created explicitly below.
owned_format = postgresql.ENUM(
    "physical",
    "digital",
    "subscription",
    "borrowed",
    "none",
    name="owned_format",
    create_type=False,
)

EXTERNAL_PRESENT = "external_source IS NOT NULL AND external_id IS NOT NULL"


def upgrade() -> None:
    owned_format.create(op.get_bind(), checkfirst=True)

    op.add_column("items", sa.Column("year", sa.SmallInteger(), nullable=True))
    op.add_column("items", sa.Column("creator", sa.String(length=300), nullable=True))
    op.add_column("items", sa.Column("cover_url", sa.Text(), nullable=True))
    op.add_column(
        "items", sa.Column("external_source", sa.String(length=20), nullable=True)
    )
    op.add_column(
        "items", sa.Column("external_id", sa.String(length=50), nullable=True)
    )
    op.add_column(
        "items",
        sa.Column(
            "favorite", sa.Boolean(), nullable=False, server_default=sa.false()
        ),
    )
    op.add_column("items", sa.Column("started_at", sa.Date(), nullable=True))
    op.add_column("items", sa.Column("finished_at", sa.Date(), nullable=True))
    op.add_column(
        "items",
        sa.Column(
            "times_completed", sa.SmallInteger(), nullable=False, server_default="0"
        ),
    )
    op.add_column("items", sa.Column("owned_format", owned_format, nullable=True))
    op.add_column(
        "items", sa.Column("source_metadata", postgresql.JSONB(), nullable=True)
    )

    op.create_index(
        "ux_items_external",
        "items",
        ["external_source", "external_id"],
        unique=True,
        postgresql_where=sa.text(EXTERNAL_PRESENT),
    )
    op.create_index("ix_items_finished_at", "items", ["finished_at"])


def downgrade() -> None:
    op.drop_index("ix_items_finished_at", table_name="items")
    op.drop_index("ux_items_external", table_name="items")

    for column in (
        "source_metadata",
        "owned_format",
        "times_completed",
        "finished_at",
        "started_at",
        "favorite",
        "external_id",
        "external_source",
        "cover_url",
        "creator",
        "year",
    ):
        op.drop_column("items", column)

    # Same trap 0001 documents: Postgres keeps the enum type after its only
    # column is gone, and the next upgrade fails on "type already exists".
    owned_format.drop(op.get_bind(), checkfirst=True)
```

- [ ] **Step 5: Update the head-revision assertion**

`backend/tests/test_schema_check.py:44` asserts `code_head_revision() == "0001"` and will now fail. Change to `"0002"`. Leave `test_mismatch_raises_naming_both_revisions` alone — its `"0002"` is an arbitrary literal, not the head.

- [ ] **Step 6: Run the full backend suite**

Run: `cd backend && ./.venv/bin/pytest -v`
Expected: PASS, including both migration tests. If `compare_metadata` reports a diff, the migration and the models disagree — fix the migration, not the test.

- [ ] **Step 7: Format, lint, and apply the migration locally**

```bash
cd backend && ./.venv/bin/ruff format . && ./.venv/bin/ruff check . && ./.venv/bin/alembic upgrade head
```

- [ ] **Step 8: Commit**

```bash
git add backend/models.py backend/migrations/versions/0002_add_enrichment_columns.py \
        backend/tests/test_migrations.py backend/tests/test_schema_check.py
git commit -m "feat(tracker): add enrichment columns and owned_format enum"
```

**Zone 1 done.** Migration applied locally, not on Neon. Joey runs `alembic upgrade head` against production before deploying.

> **Execution mode for this run:** Joey asked to review the finished product rather than interim steps, so the zone checkpoints below are *not* stops. Boundary commits still happen at every task. The single review gate is the Finish Gate at the end.

---

# Zone 2 — Source interface and TMDB

Proves the interface the other three adapters implement in Zone 4.

## Task 2: Source adapter interface, typed errors, throttle, registry

**Files:**
- Create: `backend/sources/__init__.py`, `backend/sources/base.py`, `backend/sources/registry.py`
- Modify: `backend/config.py`, `backend/env.example`
- Create: `backend/tests/test_sources_base.py`
- Modify: `backend/requirements.txt`

**Interfaces:**
- Consumes: `ItemType` from `models.py`; `Config` from `config.py`
- Produces:
  - `SourceResult(external_id: str, title: str, year: int | None, thumbnail_url: str | None)` — frozen dataclass
  - `SourceDetail(external_id, title, year, creator, cover_url, source_metadata: dict)` — frozen dataclass
  - `SourceAdapter` protocol: attributes `source_name: str`, `item_type: ItemType`; methods `configured() -> bool`, `async search(query: str, year: int | None = None) -> list[SourceResult]`, `async fetch(external_id: str) -> SourceDetail`
  - `SourceError(source: str, message: str)`, and subclasses `SourceNotConfigured`, `SourceRateLimited`
  - `Throttle(min_interval: float)` with `async def wait(self) -> None`
  - `registry.adapter_for(item_type: ItemType) -> SourceAdapter`
  - `registry.configured_sources() -> list[str]`

- [ ] **Step 1: Add dependencies**

Append to `backend/requirements.txt`:

```
python-multipart>=0.0.20
defusedxml>=0.7.1
anthropic>=1.0.0
```

`python-multipart` is required for FastAPI file uploads and is **not currently installed** — `POST /api/import/photos` returns a 500 at import time without it. `defusedxml` parses BGG's XML: stdlib `ElementTree` is still open to entity-expansion denial of service on external input. `anthropic` is imported lazily inside `AnthropicProvider` (Task 6) so a Gemini-only deploy never loads it.

```bash
cd backend && ./.venv/bin/pip install -r requirements-dev.txt
```

- [ ] **Step 2: Write the failing test**

Create `backend/tests/test_sources_base.py`:

```python
import asyncio

import pytest

from models import ItemType
from sources.base import (
    SourceError,
    SourceNotConfigured,
    SourceRateLimited,
    Throttle,
    year_from_date,
)


def test_not_configured_is_a_source_error_naming_its_source():
    error = SourceNotConfigured("tmdb", "TMDB_API_TOKEN is not set")
    assert isinstance(error, SourceError)
    assert error.source == "tmdb"
    assert "TMDB_API_TOKEN" in str(error)


def test_rate_limited_is_a_source_error():
    assert isinstance(SourceRateLimited("bgg", "429"), SourceError)


def test_year_from_date_handles_the_shapes_sources_actually_return():
    assert year_from_date("1999-03-31") == 1999
    assert year_from_date("1999") == 1999
    assert year_from_date("") is None
    assert year_from_date(None) is None
    # A malformed value is missing data, not a crash: one bad row must not
    # fail a 200-item import.
    assert year_from_date("not a date") is None


@pytest.mark.asyncio
async def test_throttle_spaces_calls_by_at_least_the_interval():
    throttle = Throttle(min_interval=0.05)
    loop = asyncio.get_running_loop()

    await throttle.wait()
    first = loop.time()
    await throttle.wait()
    elapsed = loop.time() - first

    assert elapsed >= 0.05


@pytest.mark.asyncio
async def test_throttle_serialises_concurrent_callers():
    # Three callers racing must still be spaced: this is what keeps BGG from
    # seeing a burst when one import resolves several board games.
    throttle = Throttle(min_interval=0.05)
    loop = asyncio.get_running_loop()
    started = loop.time()

    await asyncio.gather(*(throttle.wait() for _ in range(3)))

    assert loop.time() - started >= 0.10
```

- [ ] **Step 3: Run it and watch it fail**

Run: `cd backend && ./.venv/bin/pytest tests/test_sources_base.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'sources'`

- [ ] **Step 4: Write `sources/base.py`**

```python
"""The contract every metadata source implements.

Sources differ in wire format (JSON, XML), auth (bearer, query param, OAuth
token exchange, none), and throttle. They do not differ in what the rest of the
application wants from them: find candidates for a title, then fetch the
details of one. Everything source-specific stays behind this interface so the
picker and the importer never learn which source they are talking to.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from typing import Protocol

from models import ItemType


class SourceError(RuntimeError):
    """A metadata source failed.

    Carries the source name so a partial import can report which one broke
    without the caller having to guess from the message.
    """

    def __init__(self, source: str, message: str) -> None:
        super().__init__(f"{source}: {message}")
        self.source = source


class SourceNotConfigured(SourceError):
    """The source has no credentials.

    Distinct from SourceError because it is not a failure: it means the feature
    was never enabled on this deploy, and the correct response is to disable
    that media type rather than to retry or alert.
    """


class SourceRateLimited(SourceError):
    """The source refused the call for rate reasons, after retries."""


@dataclass(frozen=True)
class SourceResult:
    """One candidate from a search, enough to render a picker row."""

    external_id: str
    title: str
    year: int | None = None
    thumbnail_url: str | None = None


@dataclass(frozen=True)
class SourceDetail:
    """The full record for one external id, mapped onto Item's columns."""

    external_id: str
    title: str
    year: int | None = None
    creator: str | None = None
    cover_url: str | None = None
    source_metadata: dict = field(default_factory=dict)


class SourceAdapter(Protocol):
    """What every source module provides."""

    source_name: str
    item_type: ItemType

    def configured(self) -> bool:
        """Whether this source has the credentials it needs.

        Checked lazily rather than at boot: a missing ComicVine key should make
        comic lookups unavailable, not stop the service starting.
        """
        ...

    async def search(
        self, query: str, year: int | None = None
    ) -> list[SourceResult]: ...

    async def fetch(self, external_id: str) -> SourceDetail: ...


class Throttle:
    """Spaces calls to one source by at least `min_interval` seconds.

    Per-source rather than global. A global limiter set to BGG's pace would
    make a shelf of films resolve at board-game speed; a mixed batch should
    only be as slow as its slowest rows, and only those rows.

    The lock is held across the sleep, so concurrent callers queue rather than
    all waking at once and bursting -- which is the behaviour BGG's velocity
    detection actually penalises.
    """

    def __init__(self, min_interval: float) -> None:
        self._min_interval = min_interval
        self._lock = asyncio.Lock()
        self._next_allowed = 0.0

    async def wait(self) -> None:
        async with self._lock:
            loop = asyncio.get_running_loop()
            delay = self._next_allowed - loop.time()
            if delay > 0:
                await asyncio.sleep(delay)
            self._next_allowed = loop.time() + self._min_interval


def year_from_date(value: str | int | None) -> int | None:
    """The year in a source's date field, or None if there isn't one.

    Sources return `1999-03-31`, `1999`, an empty string, and occasionally
    something unparseable. A malformed value is missing data, not an error:
    raising here would let one bad row fail a 200-item import.
    """
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    try:
        return int(text[:4])
    except ValueError:
        return None
```

- [ ] **Step 5: Run the test**

Run: `cd backend && ./.venv/bin/pytest tests/test_sources_base.py -v`
Expected: PASS (5 tests)

- [ ] **Step 6: Add optional config fields**

In `backend/config.py`, add to `Config` — after `admin_google_sub`, all defaulting to `None`. **Do not add any of these to `_REQUIRED`.**

```python
    tmdb_api_token: str | None = None
    igdb_client_id: str | None = None
    igdb_client_secret: str | None = None
    comicvine_api_key: str | None = None
    llm_provider: str = "gemini"
    gemini_api_key: str | None = None
    anthropic_api_key: str | None = None
```

Add a module-level helper above `load_config`:

```python
def _optional(source: Mapping[str, str], name: str) -> str | None:
    """A configuration value that may legitimately be absent.

    The required set is validated up front because running without those values
    is unsafe. These are different: a missing source key means that media type
    cannot be looked up, which is a reduced feature set, not an insecure one.
    """
    return str(source.get(name, "")).strip() or None
```

And in the returned `Config(...)`:

```python
        tmdb_api_token=_optional(source, "TMDB_API_TOKEN"),
        igdb_client_id=_optional(source, "IGDB_CLIENT_ID"),
        igdb_client_secret=_optional(source, "IGDB_CLIENT_SECRET"),
        comicvine_api_key=_optional(source, "COMICVINE_API_KEY"),
        llm_provider=_optional(source, "LLM_PROVIDER") or "gemini",
        gemini_api_key=_optional(source, "GEMINI_API_KEY"),
        anthropic_api_key=_optional(source, "ANTHROPIC_API_KEY"),
```

- [ ] **Step 7: Add a config test**

Append to `backend/tests/test_config.py`:

```python
def test_source_keys_are_optional(monkeypatch):
    # A deploy of the film feature must not be blocked by a board-game
    # registration. Absent source keys are a smaller feature set, not a
    # refusal to boot.
    env = _valid_env()  # reuse this module's existing helper
    config = load_config(env)
    assert config.tmdb_api_token is None
    assert config.comicvine_api_key is None
    assert config.llm_provider == "gemini"
```

If `test_config.py` has no `_valid_env()` helper, build the dict inline from the seven `_REQUIRED` names.

- [ ] **Step 8: Write `sources/registry.py`**

```python
"""Which adapter handles which media type."""

from __future__ import annotations

from config import Config
from models import ItemType
from sources.base import SourceAdapter, SourceNotConfigured
from sources.tmdb import TmdbSource


def build_registry(config: Config) -> dict[ItemType, SourceAdapter]:
    """Every adapter, configured or not.

    Unconfigured adapters are registered rather than omitted so that asking for
    one raises SourceNotConfigured -- which names the missing variable -- instead
    of a KeyError that says only that the type is unknown.
    """
    return {ItemType.MOVIE: TmdbSource(config)}


def adapter_for(
    registry: dict[ItemType, SourceAdapter], item_type: ItemType
) -> SourceAdapter:
    """The adapter for `item_type`, or SourceNotConfigured."""
    adapter = registry.get(item_type)
    if adapter is None:
        raise SourceNotConfigured(
            item_type.value, f"no metadata source is implemented for {item_type.value}"
        )
    if not adapter.configured():
        raise SourceNotConfigured(
            adapter.source_name, f"{adapter.source_name} has no credentials configured"
        )
    return adapter


def configured_sources(registry: dict[ItemType, SourceAdapter]) -> list[str]:
    """Names of the sources that have credentials, for the startup log."""
    return sorted(a.source_name for a in registry.values() if a.configured())
```

Zone 4 adds three lines to `build_registry` and nothing else.

- [ ] **Step 9: Document the env vars**

`backend/env.example` already lists all seven tracker variables (uncommitted working-tree change). Verify they are present and that the comment says which are optional.

- [ ] **Step 10: Format, lint, test, commit**

```bash
cd backend && ./.venv/bin/ruff format . && ./.venv/bin/ruff check . && ./.venv/bin/pytest -v
```

```bash
git add backend/sources/ backend/config.py backend/requirements.txt backend/env.example \
        backend/tests/test_sources_base.py backend/tests/test_config.py
git commit -m "feat(tracker): add source adapter interface, typed errors, and registry"
```

Note: `sources/registry.py` imports `sources/tmdb.py`, written in Task 3 — this commit does not import cleanly on its own. Write Task 3 before running the suite, or stub `TmdbSource` here and let Task 3 replace it. Prefer stubbing: the commit stays independently valid.

## Task 3: TMDB adapter

**Files:**
- Create: `backend/sources/tmdb.py`
- Create: `backend/tests/fixtures/tmdb_search.json`, `backend/tests/fixtures/tmdb_movie.json`
- Create: `backend/tests/test_sources_tmdb.py`

**Interfaces:**
- Consumes: `SourceResult`, `SourceDetail`, `SourceError`, `SourceNotConfigured`, `SourceRateLimited`, `Throttle`, `year_from_date` from `sources.base`; `Config`
- Produces: `TmdbSource(config: Config)` with `source_name = "tmdb"`, `item_type = ItemType.MOVIE`

**Verified API facts** (research gate, 2026-09-01): v3 `api_key` param and v4 Bearer token grant identical access; Bearer is chosen because it is one credential across v3 and v4. Ceiling is "somewhere in the 40 requests per second range" and "could change at any time" — honor 429 rather than designing to a number.

- [ ] **Step 1: Record the fixtures**

Capture two real responses once, by hand, and commit them. Redact nothing — these are public catalogue data.

```bash
cd backend && source .env && \
curl -s -H "Authorization: Bearer $TMDB_API_TOKEN" \
  "https://api.themoviedb.org/3/search/movie?query=Inscryption&year=" \
  > tests/fixtures/tmdb_search.json
curl -s -H "Authorization: Bearer $TMDB_API_TOKEN" \
  "https://api.themoviedb.org/3/movie/438631?append_to_response=credits" \
  > tests/fixtures/tmdb_movie.json
```

Use a film for the search fixture — `Dune` is a good one, since two releases share the title and it exercises the year filter in Task 7. Record `search?query=Dune` and the detail for id `438631` (Dune, 2021).

- [ ] **Step 2: Write the failing test**

```python
import json
from pathlib import Path

import pytest

from config import Config
from sources.base import SourceNotConfigured
from sources.tmdb import TmdbSource

FIXTURES = Path(__file__).parent / "fixtures"


def _config(token: str | None = "test-token") -> Config:
    return Config(
        google_client_id="x",
        google_client_secret="x",
        session_secret="x",
        admin_email="x@example.com",
        frontend_url="http://localhost:5173",
        database_url="postgresql://x",
        database_url_direct="postgresql://x",
        tmdb_api_token=token,
    )


def test_unconfigured_source_reports_itself_as_such():
    assert TmdbSource(_config(token=None)).configured() is False


@pytest.mark.asyncio
async def test_search_without_a_token_raises_naming_the_variable():
    with pytest.raises(SourceNotConfigured) as excinfo:
        await TmdbSource(_config(token=None)).search("Dune")
    assert "TMDB_API_TOKEN" in str(excinfo.value)


def test_search_payload_maps_onto_source_results():
    payload = json.loads((FIXTURES / "tmdb_search.json").read_text())
    results = TmdbSource(_config())._parse_search(payload)

    assert results, "the recorded fixture should contain candidates"
    first = results[0]
    assert first.external_id.isdigit()
    assert first.title
    assert first.year is None or 1880 < first.year < 2100
    assert first.thumbnail_url is None or first.thumbnail_url.startswith(
        "https://image.tmdb.org/t/p/"
    )


def test_detail_payload_maps_onto_a_source_detail():
    payload = json.loads((FIXTURES / "tmdb_movie.json").read_text())
    detail = TmdbSource(_config())._parse_detail(payload)

    assert detail.title
    assert detail.year == 2021
    # creator is the directing credit, denormalized onto one column.
    assert detail.creator
    assert detail.cover_url.startswith("https://image.tmdb.org/t/p/w342")
    assert "genres" in detail.source_metadata
    assert "community_score" in detail.source_metadata


def test_detail_survives_a_film_with_no_poster_and_no_director():
    # Obscure films really do come back like this. A missing poster is a
    # placeholder in the UI, not a failed import.
    detail = TmdbSource(_config())._parse_detail(
        {"id": 1, "title": "Untitled", "release_date": "", "genres": [], "credits": {}}
    )
    assert detail.cover_url is None
    assert detail.creator is None
    assert detail.year is None
```

- [ ] **Step 3: Run it and watch it fail**

Run: `cd backend && ./.venv/bin/pytest tests/test_sources_tmdb.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'sources.tmdb'`

- [ ] **Step 4: Write `sources/tmdb.py`**

Parsing is split into `_parse_search` and `_parse_detail` so the mapping is testable against recorded fixtures without a network call or an HTTP mock.

```python
"""TMDB — films.

Auth is the v4 Bearer token. TMDB documents the v3 api_key parameter and the
v4 token as granting identical access; the token wins here only because it is
one credential across both API versions.

Images are hotlinked, which is TMDB's documented intent. Nothing is cached
locally: Render's free tier has an ephemeral disk, so a cache would be lost on
every restart while still being a data-retention surface.

Attribution is required wherever this data is shown -- see the collection page
footer.
"""

from __future__ import annotations

import logging

import httpx2

from config import Config
from models import ItemType
from sources.base import (
    SourceDetail,
    SourceError,
    SourceNotConfigured,
    SourceRateLimited,
    SourceResult,
    Throttle,
    year_from_date,
)

logger = logging.getLogger(__name__)

API_ROOT = "https://api.themoviedb.org/3"
IMAGE_ROOT = "https://image.tmdb.org/t/p"
POSTER_SIZE = "w342"
THUMBNAIL_SIZE = "w185"
SEARCH_LIMIT = 10
TIMEOUT = 10.0


class TmdbSource:
    """Film metadata from TMDB."""

    source_name = "tmdb"
    item_type = ItemType.MOVIE

    def __init__(self, config: Config) -> None:
        self._token = config.tmdb_api_token
        # TMDB's ceiling is around 40 req/s and explicitly subject to change.
        # 20/s leaves headroom without making a picker feel slow.
        self._throttle = Throttle(min_interval=0.05)

    def configured(self) -> bool:
        return bool(self._token)

    def _require_token(self) -> str:
        if not self._token:
            raise SourceNotConfigured(
                self.source_name, "TMDB_API_TOKEN is not set"
            )
        return self._token

    async def _get(self, path: str, params: dict) -> dict:
        token = self._require_token()
        await self._throttle.wait()
        headers = {"Authorization": f"Bearer {token}", "accept": "application/json"}
        try:
            async with httpx2.AsyncClient(timeout=TIMEOUT) as client:
                response = await client.get(
                    f"{API_ROOT}{path}", params=params, headers=headers
                )
        except httpx2.HTTPError as error:
            raise SourceError(self.source_name, f"request failed: {error}") from error

        logger.info("tmdb GET %s -> %s", path, response.status_code)

        if response.status_code == 429:
            raise SourceRateLimited(self.source_name, "429 from TMDB")
        if response.status_code >= 400:
            raise SourceError(
                self.source_name, f"HTTP {response.status_code} from TMDB"
            )
        return response.json()

    def _image_url(self, poster_path: str | None, size: str) -> str | None:
        return f"{IMAGE_ROOT}/{size}{poster_path}" if poster_path else None

    def _parse_search(self, payload: dict) -> list[SourceResult]:
        """Maps a /search/movie body onto picker rows."""
        return [
            SourceResult(
                external_id=str(row["id"]),
                title=row.get("title") or row.get("original_title") or "",
                year=year_from_date(row.get("release_date")),
                thumbnail_url=self._image_url(
                    row.get("poster_path"), THUMBNAIL_SIZE
                ),
            )
            for row in payload.get("results", [])[:SEARCH_LIMIT]
        ]

    def _parse_detail(self, payload: dict) -> SourceDetail:
        """Maps a /movie/{id} body onto Item's columns plus the snapshot."""
        crew = (payload.get("credits") or {}).get("crew") or []
        directors = [
            member.get("name")
            for member in crew
            if member.get("job") == "Director" and member.get("name")
        ]
        return SourceDetail(
            external_id=str(payload["id"]),
            title=payload.get("title") or payload.get("original_title") or "",
            year=year_from_date(payload.get("release_date")),
            creator=", ".join(directors) or None,
            cover_url=self._image_url(payload.get("poster_path"), POSTER_SIZE),
            source_metadata={
                "genres": [g["name"] for g in payload.get("genres") or []],
                "description": payload.get("overview") or None,
                "community_score": payload.get("vote_average"),
                "community_votes": payload.get("vote_count"),
                "runtime_minutes": payload.get("runtime"),
                "original_language": payload.get("original_language"),
            },
        )

    async def search(
        self, query: str, year: int | None = None
    ) -> list[SourceResult]:
        """Candidate films for `query`, most relevant first."""
        params = {"query": query, "include_adult": "false"}
        if year is not None:
            params["year"] = str(year)
        return self._parse_search(await self._get("/search/movie", params))

    async def fetch(self, external_id: str) -> SourceDetail:
        """Full detail for one TMDB film id, including the directing credit."""
        payload = await self._get(
            f"/movie/{external_id}", {"append_to_response": "credits"}
        )
        return self._parse_detail(payload)
```

- [ ] **Step 5: Replace the Task 2 stub and run the suite**

Run: `cd backend && ./.venv/bin/pytest -v`
Expected: PASS

- [ ] **Step 6: Verify against the live API once, by hand**

```bash
cd backend && ./.venv/bin/python -c "
import asyncio
from config import load_config
from sources.tmdb import TmdbSource
async def main():
    s = TmdbSource(load_config())
    for r in await s.search('Dune'):
        print(r.external_id, r.year, r.title)
    print(await s.fetch('438631'))
asyncio.run(main())
"
```

Expected: two `Dune` entries with different years, and a detail carrying a director. This is the only live call in the task — everything else runs off fixtures.

- [ ] **Step 7: Format, lint, commit**

```bash
git add backend/sources/tmdb.py backend/sources/registry.py backend/tests/fixtures/ \
        backend/tests/test_sources_tmdb.py
git commit -m "feat(tracker): add TMDB film metadata adapter"
```

## Task 4: Picker proxy and refresh-metadata routes

**Files:**
- Modify: `backend/items.py`, `backend/main.py`
- Modify: `backend/tests/test_items.py`

**Interfaces:**
- Consumes: `build_registry`, `adapter_for`, `configured_sources` from `sources.registry`; `SourceNotConfigured`, `SourceRateLimited`, `SourceError` from `sources.base`
- Produces:
  - `create_items_router(factory, registry)` — **signature change**, now takes the registry
  - `GET /api/items/search-metadata?type=<ItemType>&query=<str>&year=<int|None>` → `list[SourceResult]` as JSON
  - `POST /api/items/{item_id}/refresh-metadata` → `ItemOut`
  - `ItemIn`/`ItemPatch`/`ItemOut` carrying every column from Task 1

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/test_items.py`, following the existing fixtures in that module:

```python
@pytest.mark.asyncio
async def test_search_metadata_returns_candidates(client_with_stub_source):
    response = await client_with_stub_source.get(
        "/api/items/search-metadata", params={"type": "movie", "query": "Dune"}
    )
    assert response.status_code == 200
    assert response.json()[0]["title"] == "Dune"


@pytest.mark.asyncio
async def test_search_metadata_is_503_when_the_source_has_no_key(
    client_with_unconfigured_source,
):
    # Not a 500: the feature was never enabled on this deploy. The message
    # names the variable so the fix is obvious from the response alone.
    response = await client_with_unconfigured_source.get(
        "/api/items/search-metadata", params={"type": "movie", "query": "Dune"}
    )
    assert response.status_code == 503
    assert "TMDB_API_TOKEN" in response.json()["detail"]


@pytest.mark.asyncio
async def test_search_metadata_requires_the_admin_session(anonymous_client):
    # Router-level dependency: 401, never 422, so an anonymous caller cannot
    # probe the query schema.
    response = await anonymous_client.get(
        "/api/items/search-metadata", params={"type": "movie", "query": "Dune"}
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_search_metadata_route_is_not_shadowed_by_the_id_route(
    client_with_stub_source,
):
    # /{item_id} is typed uuid.UUID. If it were declared first, this path
    # would 422 on "search-metadata" instead of reaching the picker.
    response = await client_with_stub_source.get(
        "/api/items/search-metadata", params={"type": "movie", "query": "Dune"}
    )
    assert response.status_code != 422


@pytest.mark.asyncio
async def test_refresh_metadata_overwrites_the_snapshot_but_not_the_title(
    client_with_stub_source, seeded_linked_item
):
    # The title is the owner's, deliberately editable after the picker
    # prefills it. A refresh that reverted a hand-edited title would be a
    # data-loss bug, not a refresh.
    seeded_linked_item.title = "My Own Title"
    response = await client_with_stub_source.post(
        f"/api/items/{seeded_linked_item.id}/refresh-metadata"
    )
    assert response.status_code == 200
    body = response.json()
    assert body["title"] == "My Own Title"
    assert body["cover_url"]
    assert body["source_metadata"]["genres"]


@pytest.mark.asyncio
async def test_refresh_metadata_on_a_manual_item_is_409(
    client_with_stub_source, seeded_manual_item
):
    response = await client_with_stub_source.post(
        f"/api/items/{seeded_manual_item.id}/refresh-metadata"
    )
    assert response.status_code == 409
```

Add three fixtures to the module: `client_with_stub_source` (registry holding a fake adapter returning one `SourceResult`/`SourceDetail`), `client_with_unconfigured_source` (adapter whose `configured()` is `False` and whose `search` raises `SourceNotConfigured("tmdb", "TMDB_API_TOKEN is not set")`), and `seeded_linked_item` / `seeded_manual_item` (rows with and without `external_source`/`external_id`).

- [ ] **Step 2: Run and watch them fail**

Run: `cd backend && ./.venv/bin/pytest tests/test_items.py -v -k "metadata"`
Expected: FAIL — 404, the routes do not exist.

- [ ] **Step 3: Extend the Pydantic models**

In `items.py`, add to `ItemIn` and `ItemPatch` (optional on both; `ItemPatch` keeps everything `| None = None`):

```python
    year: int | None = Field(default=None, ge=1880, le=2100)
    creator: str | None = Field(default=None, max_length=300)
    cover_url: str | None = None
    external_source: str | None = Field(default=None, max_length=20)
    external_id: str | None = Field(default=None, max_length=50)
    favorite: bool = False
    started_at: date | None = None
    finished_at: date | None = None
    times_completed: int = Field(default=0, ge=0)
    owned_format: OwnedFormat | None = None
    source_metadata: dict | None = None
```

`ItemOut` gains the same fields, all non-defaulted, plus `favorite: bool` and `times_completed: int`.

- [ ] **Step 4: Add an exception translator**

```python
def _http_error_for(error: SourceError) -> HTTPException:
    """Maps a source failure onto the status code that describes it.

    503 for an unconfigured source rather than 500: nothing is broken, the
    feature was never enabled here, and the detail names the variable to set.
    """
    if isinstance(error, SourceNotConfigured):
        return HTTPException(status_code=503, detail=str(error))
    if isinstance(error, SourceRateLimited):
        return HTTPException(status_code=429, detail=str(error))
    return HTTPException(status_code=502, detail=str(error))
```

- [ ] **Step 5: Add the routes**

Both go **before** the `@router.get("/{item_id}")` declaration. FastAPI matches in declaration order and `{item_id}` is typed `uuid.UUID`, so a later `/search-metadata` would be swallowed and 422.

```python
    @router.get("/search-metadata")
    async def search_metadata(
        type: ItemType = Query(),
        query: str = Query(min_length=1, max_length=200),
        year: int | None = Query(default=None, ge=1880, le=2100),
    ) -> list[dict]:
        """Candidate external records for a title.

        A proxy rather than a browser-side call: the source credentials are
        server-side and must stay there.
        """
        try:
            adapter = adapter_for(registry, type)
            results = await adapter.search(query, year)
        except SourceError as error:
            raise _http_error_for(error) from error
        return [
            {
                "external_source": adapter.source_name,
                "external_id": r.external_id,
                "title": r.title,
                "year": r.year,
                "thumbnail_url": r.thumbnail_url,
            }
            for r in results
        ]

    @router.post("/{item_id}/refresh-metadata", response_model=ItemOut)
    async def refresh_metadata(
        item_id: uuid.UUID,
        session: AsyncSession = Depends(get_session),
    ) -> Item:
        """Re-fetches the linked source record for one item.

        The title is deliberately left alone: the picker prefills it and the
        owner may have edited it, so overwriting would be data loss.
        """
        item = await _load(session, item_id)
        if not item.external_source or not item.external_id:
            raise HTTPException(
                status_code=409, detail="This item is not linked to a source"
            )
        try:
            adapter = adapter_for(registry, item.type)
            detail = await adapter.fetch(item.external_id)
        except SourceError as error:
            raise _http_error_for(error) from error

        item.year = detail.year
        item.creator = detail.creator
        item.cover_url = detail.cover_url
        item.source_metadata = detail.source_metadata
        await session.commit()
        await session.refresh(item)
        return item
```

- [ ] **Step 6: Wire the registry in `main.py`**

```python
registry = build_registry(config)
logging.getLogger(__name__).info(
    "metadata sources configured: %s",
    ", ".join(configured_sources(registry)) or "none",
)
...
app.include_router(create_items_router(session_factory, registry))
```

The log line is the mitigation for lazy config checking: a typo'd key surfaces at boot as an absence in this list, rather than only at first use.

- [ ] **Step 7: Run the suite**

Run: `cd backend && ./.venv/bin/pytest -v`
Expected: PASS

- [ ] **Step 8: Format, lint, commit**

```bash
git add backend/items.py backend/main.py backend/tests/test_items.py
git commit -m "feat(tracker): add metadata search proxy and refresh route"
```

## Task 5: Metadata picker in the admin form

**Files:**
- Create: `frontend/src/components/MetadataPicker.jsx`, `frontend/src/components/ItemForm.jsx`
- Modify: `frontend/src/pages/AdminCollection.jsx`, `frontend/src/index.css`
- Create: `frontend/src/components/MetadataPicker.test.jsx`

**Interfaces:**
- Consumes: `apiFetch` from `../lib/api.js`; `GET /api/items/search-metadata`
- Produces:
  - `<MetadataPicker type={string} onSelect={(candidate) => void} />` where `candidate` is `{external_source, external_id, title, year, thumbnail_url}`
  - `<ItemForm value={form} onChange={fn} onSubmit={fn} busy={bool} />`

`AdminCollection.jsx` is 250 lines. Adding search state, a debounce, a candidate list, and the selection handler inline would push it past 400 — extract first, then add.

- [ ] **Step 1: Write the failing test**

```jsx
import '@testing-library/jest-dom'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import MetadataPicker from './MetadataPicker.jsx'

const CANDIDATE = {
  external_source: 'tmdb',
  external_id: '438631',
  title: 'Dune',
  year: 2021,
  thumbnail_url: 'https://image.tmdb.org/t/p/w185/x.jpg',
}

afterEach(() => vi.restoreAllMocks())

describe('MetadataPicker', () => {
  it('searches and lists candidates with their year', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => [CANDIDATE] }),
    )
    render(<MetadataPicker type="movie" onSelect={() => {}} />)

    await userEvent.type(screen.getByLabelText(/look up/i), 'Dune')

    expect(await screen.findByText(/Dune/)).toBeInTheDocument()
    expect(await screen.findByText(/2021/)).toBeInTheDocument()
  })

  it('hands the whole candidate to onSelect', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => [CANDIDATE] }),
    )
    const onSelect = vi.fn()
    render(<MetadataPicker type="movie" onSelect={onSelect} />)

    await userEvent.type(screen.getByLabelText(/look up/i), 'Dune')
    await userEvent.click(await screen.findByRole('button', { name: /Dune/ }))

    expect(onSelect).toHaveBeenCalledWith(CANDIDATE)
  })

  it('explains an unconfigured source instead of showing an empty list', async () => {
    // 503 means the key is missing on this deploy. "No results" would send
    // the reader looking for a spelling mistake that isn't there.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({ detail: 'tmdb: TMDB_API_TOKEN is not set' }),
      }),
    )
    render(<MetadataPicker type="movie" onSelect={() => {}} />)

    await userEvent.type(screen.getByLabelText(/look up/i), 'Dune')

    expect(await screen.findByText(/lookup unavailable/i)).toBeInTheDocument()
  })

  it('does not search until the query is worth a request', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => [] })
    vi.stubGlobal('fetch', fetchMock)
    render(<MetadataPicker type="movie" onSelect={() => {}} />)

    await userEvent.type(screen.getByLabelText(/look up/i), 'D')

    await waitFor(() => expect(fetchMock).not.toHaveBeenCalled())
  })
})
```

`@testing-library/user-event` is not yet a dependency: `cd frontend && npm install -D @testing-library/user-event`.

- [ ] **Step 2: Run and watch it fail**

Run: `cd frontend && npm test -- MetadataPicker`
Expected: FAIL — cannot resolve `./MetadataPicker.jsx`

- [ ] **Step 3: Write `MetadataPicker.jsx`**

```jsx
import { useEffect, useRef, useState } from 'react'
import { apiFetch } from '../lib/api.js'

const MIN_QUERY_LENGTH = 2
const DEBOUNCE_MS = 350

/**
 * Type-ahead lookup against the server-side metadata proxy.
 *
 * The proxy exists because source credentials are server-side; this component
 * never sees a key. Selecting a candidate hands the whole record up — the form
 * decides which fields to apply, so adding a field later is a change in one
 * place.
 *
 * @param {{type: string, onSelect: (candidate: object) => void}} props
 */
export default function MetadataPicker({ type, onSelect }) {
  const [query, setQuery] = useState('')
  const [candidates, setCandidates] = useState([])
  const [state, setState] = useState('idle')
  const requestId = useRef(0)

  useEffect(() => {
    if (query.trim().length < MIN_QUERY_LENGTH) {
      setCandidates([])
      setState('idle')
      return undefined
    }

    const id = ++requestId.current
    const timer = setTimeout(async () => {
      setState('searching')
      const params = new URLSearchParams({ type, query: query.trim() })
      try {
        const response = await apiFetch(`/api/items/search-metadata?${params}`)
        // A slower earlier request must not overwrite a newer result.
        if (id !== requestId.current) return
        if (response.status === 503) {
          setState('unavailable')
          setCandidates([])
          return
        }
        if (!response.ok) {
          setState('error')
          setCandidates([])
          return
        }
        setCandidates(await response.json())
        setState('done')
      } catch {
        if (id === requestId.current) setState('error')
      }
    }, DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [query, type])

  return (
    <div className="metadata-picker">
      <label htmlFor="metadata-query">Look up</label>
      <input
        id="metadata-query"
        type="search"
        value={query}
        placeholder="Title…"
        onChange={(event) => setQuery(event.target.value)}
      />

      {state === 'searching' && <p className="muted">Searching…</p>}
      {state === 'unavailable' && (
        <p className="admin-error">
          Lookup unavailable — this source has no API key configured.
        </p>
      )}
      {state === 'error' && (
        <p className="admin-error">Lookup failed. Enter the title manually.</p>
      )}
      {state === 'done' && candidates.length === 0 && (
        <p className="muted">No matches. Enter the title manually.</p>
      )}

      <ul className="candidate-list">
        {candidates.map((candidate) => (
          <li key={`${candidate.external_source}:${candidate.external_id}`}>
            <button type="button" onClick={() => onSelect(candidate)}>
              {candidate.thumbnail_url && (
                <img src={candidate.thumbnail_url} alt="" loading="lazy" />
              )}
              <span>
                {candidate.title}
                {candidate.year ? ` (${candidate.year})` : ''}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 4: Extract `ItemForm.jsx`**

Move the `<form className="item-form">` block out of `AdminCollection.jsx` verbatim, taking `value`, `onChange`, `onSubmit`, and `busy` as props. Add an `owned_format` `<select>` with the five values and a required empty default — the column is nullable but the form requires a choice, which is what keeps a want-list row deliberate. Behaviour must not change in this step; the test suite is the check.

- [ ] **Step 5: Wire the picker into the form**

In `AdminCollection.jsx`, render `<MetadataPicker type={form.type} onSelect={applyCandidate} />` above `<ItemForm>`:

```jsx
  /** Fills the form from a picked candidate, leaving the title editable. */
  function applyCandidate(candidate) {
    setForm((current) => ({
      ...current,
      title: candidate.title,
      year: candidate.year ?? '',
      external_source: candidate.external_source,
      external_id: candidate.external_id,
    }))
  }
```

Only the picker's four fields are set here. `creator`, `cover_url`, and `source_metadata` come from the server's `fetch` on create — the browser never assembles a snapshot it cannot verify.

Submitting with no selection must still work: `external_source` and `external_id` stay empty and the row is manual.

- [ ] **Step 6: Style with tokens only**

Add `.metadata-picker`, `.candidate-list` to `index.css` using existing CSS variables. No raw hex — a literal color is wrong in one of the two themes. Candidate thumbnails get a fixed width and `object-fit: cover`.

- [ ] **Step 7: Run tests, build, lint**

```bash
cd frontend && npm test && npm run build && npm run lint && npm run format:check
```

- [ ] **Step 8: Verify in the browser**

Start the dev server, sign in at `/admin`, open `/admin/collection`, type a film title, confirm candidates appear with posters, select one, confirm the form fills and the title stays editable. Then submit with no selection and confirm a manual row is created.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/components/ frontend/src/pages/AdminCollection.jsx \
        frontend/src/index.css frontend/package.json frontend/package-lock.json
git commit -m "feat(tracker): add metadata picker to the collection form"
```

**Zone 2 done.**

---

# Zone 3 — Vision backfill

## Task 6: Provider-agnostic LLM layer

**Files:**
- Create: `backend/llm.py`, `backend/tests/test_llm.py`

**Interfaces:**
- Produces:
  - `LLMError(RuntimeError)`
  - `Image(media_type: str, data: bytes)` — frozen dataclass
  - `LLMProvider` protocol: `async complete_json(prompt: str, schema: dict, images: list[Image]) -> dict`
  - `GeminiProvider(api_key: str, model: str = "gemini-3.7-flash")`
  - `AnthropicProvider(api_key: str, model: str = "claude-haiku-4-5")`
  - `build_provider(config: Config) -> LLMProvider`

**Verified API facts** (research gate): Gemini inline base64 is capped at 20 MB for the whole request and 3,600 images; PNG/JPEG/WEBP/HEIC/HEIF; `responseSchema` works alongside image input; free-tier limits are **not published**, so treat 429 as expected rather than designing to a number. Anthropic takes `{"type": "image", "source": {"type": "base64", "media_type": …, "data": …}}` blocks and `output_config={"format": {"type": "json_schema", "schema": {…}}}` with `additionalProperties: false` and `required` — the deprecated `output_format` parameter must not be used.

- [ ] **Step 1: Write the failing test**

```python
import base64
import json

import pytest

from llm import GeminiProvider, Image, LLMError, MAX_REQUEST_BYTES, guard_payload_size

SCHEMA = {
    "type": "object",
    "properties": {"titles": {"type": "array", "items": {"type": "string"}}},
    "required": ["titles"],
    "additionalProperties": False,
}


def test_gemini_request_body_carries_the_schema_and_the_image():
    provider = GeminiProvider(api_key="k")
    body = provider._build_body(
        "read the spines", SCHEMA, [Image("image/jpeg", b"\xff\xd8bytes")]
    )
    parts = body["contents"][0]["parts"]
    assert any("inline_data" in part for part in parts)
    inline = next(p["inline_data"] for p in parts if "inline_data" in p)
    assert inline["mime_type"] == "image/jpeg"
    assert base64.b64decode(inline["data"]) == b"\xff\xd8bytes"
    assert body["generationConfig"]["responseSchema"] == SCHEMA
    assert body["generationConfig"]["responseMimeType"] == "application/json"


def test_gemini_parses_the_model_text_as_json():
    provider = GeminiProvider(api_key="k")
    payload = {
        "candidates": [
            {"content": {"parts": [{"text": json.dumps({"titles": ["Dune"]})}]}}
        ]
    }
    assert provider._parse(payload) == {"titles": ["Dune"]}


def test_output_that_is_not_json_raises_llm_error():
    # Schema enforcement makes this rare, not impossible -- a truncated
    # response is still cut-off JSON. It must not surface as a ValueError
    # from deep inside a parser.
    provider = GeminiProvider(api_key="k")
    payload = {"candidates": [{"content": {"parts": [{"text": "sorry, I can't"}]}}]}
    with pytest.raises(LLMError):
        provider._parse(payload)


def test_empty_candidates_raises_llm_error():
    with pytest.raises(LLMError):
        GeminiProvider(api_key="k")._parse({"candidates": []})


def test_oversized_payload_is_refused_before_the_request_is_sent():
    # Gemini caps the whole inline request at 20 MB. Failing here names the
    # cause; letting the API reject it returns an opaque 400.
    images = [Image("image/jpeg", b"x" * (MAX_REQUEST_BYTES // 2)) for _ in range(4)]
    with pytest.raises(LLMError) as excinfo:
        guard_payload_size(images)
    assert "20" in str(excinfo.value)
```

- [ ] **Step 2: Run and watch it fail.** Run: `cd backend && ./.venv/bin/pytest tests/test_llm.py -v`

- [ ] **Step 3: Write `llm.py`**

```python
"""A single seam over the two LLM providers.

One method, deliberately. This is a seam, not a framework: the application
needs JSON that conforms to a schema, optionally derived from images, and
nothing else. Both providers enforce the schema server-side -- Gemini via
responseSchema, Anthropic via output_config.format -- so neither returns prose
that has to be salvaged with a regex.

Images are passed inline as base64 and never written to disk.
"""

from __future__ import annotations

import base64
import json
import logging
from dataclasses import dataclass
from typing import Protocol

import httpx2

from config import Config

logger = logging.getLogger(__name__)

# Gemini caps the whole inline request -- prompt, schema, and image bytes -- at
# 20 MB. Base64 inflates by 4/3, so the guard is applied to the encoded size.
MAX_REQUEST_BYTES = 20 * 1024 * 1024
TIMEOUT = 120.0
GEMINI_ROOT = "https://generativelanguage.googleapis.com/v1beta/models"
DEFAULT_GEMINI_MODEL = "gemini-3.7-flash"
DEFAULT_ANTHROPIC_MODEL = "claude-haiku-4-5"
MAX_TOKENS = 8000


class LLMError(RuntimeError):
    """The provider failed, timed out, or returned something unusable."""


@dataclass(frozen=True)
class Image:
    """One image to reason over. `data` is raw bytes, not base64."""

    media_type: str
    data: bytes


def guard_payload_size(images: list[Image]) -> None:
    """Refuses a request that cannot succeed.

    Checked here rather than left to the API so the error names the cause: the
    provider's own rejection is an opaque 400 a long way from the upload.
    """
    encoded = sum(len(base64.b64encode(image.data)) for image in images)
    if encoded > MAX_REQUEST_BYTES:
        raise LLMError(
            f"images total {encoded // (1024 * 1024)} MB encoded, over the "
            "20 MB inline request limit — upload fewer photos per batch"
        )


class LLMProvider(Protocol):
    """What the importer needs from a model."""

    async def complete_json(
        self, prompt: str, schema: dict, images: list[Image] | None = None
    ) -> dict: ...


class GeminiProvider:
    """Gemini via REST.

    Free-tier request limits are not published -- the docs defer to the AI
    Studio dashboard -- so 429 is treated as an expected outcome rather than an
    exceptional one, and surfaces to the UI as "try again".
    """

    def __init__(self, api_key: str, model: str = DEFAULT_GEMINI_MODEL) -> None:
        self._api_key = api_key
        self._model = model

    def _build_body(self, prompt: str, schema: dict, images: list[Image]) -> dict:
        parts: list[dict] = [{"text": prompt}]
        for image in images:
            parts.append(
                {
                    "inline_data": {
                        "mime_type": image.media_type,
                        "data": base64.b64encode(image.data).decode("ascii"),
                    }
                }
            )
        return {
            "contents": [{"parts": parts}],
            "generationConfig": {
                "responseMimeType": "application/json",
                "responseSchema": schema,
            },
        }

    def _parse(self, payload: dict) -> dict:
        candidates = payload.get("candidates") or []
        if not candidates:
            raise LLMError("Gemini returned no candidates")
        parts = (candidates[0].get("content") or {}).get("parts") or []
        text = "".join(part.get("text", "") for part in parts)
        try:
            return json.loads(text)
        except json.JSONDecodeError as error:
            raise LLMError(f"Gemini returned unparseable JSON: {error}") from error

    async def complete_json(
        self, prompt: str, schema: dict, images: list[Image] | None = None
    ) -> dict:
        images = images or []
        guard_payload_size(images)
        url = f"{GEMINI_ROOT}/{self._model}:generateContent"
        body = self._build_body(prompt, schema, images)
        try:
            async with httpx2.AsyncClient(timeout=TIMEOUT) as client:
                response = await client.post(
                    url,
                    json=body,
                    headers={"x-goog-api-key": self._api_key},
                )
        except httpx2.HTTPError as error:
            raise LLMError(f"Gemini request failed: {error}") from error

        logger.info(
            "gemini %s -> %s (%d images)", self._model, response.status_code, len(images)
        )
        if response.status_code == 429:
            raise LLMError("Gemini rate limit reached — try again shortly")
        if response.status_code >= 400:
            raise LLMError(f"Gemini returned HTTP {response.status_code}")
        return self._parse(response.json())


class AnthropicProvider:
    """Anthropic via the official SDK.

    Imported lazily so a Gemini-only deploy never loads the package.
    """

    def __init__(self, api_key: str, model: str = DEFAULT_ANTHROPIC_MODEL) -> None:
        self._api_key = api_key
        self._model = model

    async def complete_json(
        self, prompt: str, schema: dict, images: list[Image] | None = None
    ) -> dict:
        import anthropic

        images = images or []
        guard_payload_size(images)

        content: list[dict] = [
            {
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": image.media_type,
                    "data": base64.b64encode(image.data).decode("ascii"),
                },
            }
            for image in images
        ]
        content.append({"type": "text", "text": prompt})

        client = anthropic.AsyncAnthropic(api_key=self._api_key, timeout=TIMEOUT)
        try:
            response = await client.messages.create(
                model=self._model,
                max_tokens=MAX_TOKENS,
                messages=[{"role": "user", "content": content}],
                output_config={"format": {"type": "json_schema", "schema": schema}},
            )
        except anthropic.APIError as error:
            raise LLMError(f"Anthropic request failed: {error}") from error

        logger.info("anthropic %s -> %s", self._model, response.stop_reason)
        text = next((b.text for b in response.content if b.type == "text"), "")
        try:
            return json.loads(text)
        except json.JSONDecodeError as error:
            raise LLMError(f"Anthropic returned unparseable JSON: {error}") from error


def build_provider(config: Config) -> LLMProvider:
    """The provider named by LLM_PROVIDER, or an error naming what is missing."""
    provider = (config.llm_provider or "gemini").lower()
    if provider == "gemini":
        if not config.gemini_api_key:
            raise LLMError("LLM_PROVIDER is gemini but GEMINI_API_KEY is not set")
        return GeminiProvider(config.gemini_api_key)
    if provider == "anthropic":
        if not config.anthropic_api_key:
            raise LLMError("LLM_PROVIDER is anthropic but ANTHROPIC_API_KEY is not set")
        return AnthropicProvider(config.anthropic_api_key)
    raise LLMError(f"unknown LLM_PROVIDER {provider!r}: expected gemini or anthropic")
```

- [ ] **Step 4: Run tests, format, lint, commit**

```bash
git add backend/llm.py backend/tests/test_llm.py
git commit -m "feat(tracker): add provider-agnostic LLM layer with image input"
```

## Task 7: Confidence scoring

**Files:**
- Create: `backend/matching.py`, `backend/tests/test_matching.py`

**Interfaces:**
- Consumes: `SourceResult` from `sources.base`
- Produces: `normalize_title(str) -> str`; `Confidence` str-enum (`EXACT`/`PROBABLE`/`UNCERTAIN`); `Match(result: SourceResult | None, confidence: Confidence, score: float)`; `best_match(detected_title: str, detected_year: int | None, candidates: list[SourceResult]) -> Match`

Pure functions, no I/O, no imports from adapters. This is the file that decides whether a shelf photo becomes the right row.

- [ ] **Step 1: Write the failing test**

```python
import pytest

from matching import Confidence, best_match, normalize_title
from sources.base import SourceResult


def r(external_id, title, year=None):
    return SourceResult(external_id=external_id, title=title, year=year)


def test_normalize_strips_case_punctuation_and_articles_of_spacing():
    assert normalize_title("The Lord of the Rings!") == "the lord of the rings"
    assert normalize_title("  Spider-Man:  No Way Home ") == "spider man no way home"
    assert normalize_title("WALL·E") == "wall e"


def test_an_unambiguous_match_is_exact():
    match = best_match("Inscryption", None, [r("1", "Inscryption"), r("2", "Inscryptid")])
    assert match.confidence is Confidence.EXACT
    assert match.result.external_id == "1"


def test_a_close_reading_is_probable_not_exact():
    # OCR off a spine drops characters. Still the right film, still worth
    # showing pre-selected -- but flagged for a look.
    match = best_match("Blade Runer", None, [r("1", "Blade Runner")])
    assert match.confidence is Confidence.PROBABLE


def test_no_candidates_is_uncertain_with_no_result():
    match = best_match("Some Obscure Box", None, [])
    assert match.confidence is Confidence.UNCERTAIN
    assert match.result is None


def test_year_filters_candidates_before_ranking():
    # Two identical titles tie at ratio 1.0 and the margin collapses to zero,
    # which would force UNCERTAIN on a detection the year already settled.
    # Filtering first is what keeps the margin meaningful.
    match = best_match("Dune", 2021, [r("1", "Dune", 1984), r("2", "Dune", 2021)])
    assert match.confidence is Confidence.EXACT
    assert match.result.external_id == "2"


def test_year_tolerance_allows_one_year_of_drift():
    # Release years disagree across sources by a year all the time -- festival
    # versus general release, regional publication dates.
    match = best_match("Dune", 2020, [r("2", "Dune", 2021)])
    assert match.result.external_id == "2"


def test_a_year_that_matches_nothing_falls_back_rather_than_giving_up():
    # Dropping every candidate would report "no match" for a title that was
    # found. Better to rank the unfiltered set and let the margin mark it.
    match = best_match("Dune", 1600, [r("1", "Dune", 1984), r("2", "Dune", 2021)])
    assert match.result is not None
    assert match.confidence is Confidence.UNCERTAIN


def test_two_equally_good_candidates_are_uncertain():
    match = best_match("Dune", None, [r("1", "Dune", 1984), r("2", "Dune", 2021)])
    assert match.confidence is Confidence.UNCERTAIN
```

- [ ] **Step 2: Run and watch it fail.**

- [ ] **Step 3: Write `matching.py`**

```python
"""Deciding which candidate a detected title actually refers to.

Confidence is measured, never asked for. A vision model will report high
confidence on a confidently wrong reading; string distance against real
candidates returned by the source is a measurement of agreement between two
independent things, which is a different and more trustworthy claim.

Thresholds are first guesses, expected to be tuned once against a real shelf.
They live here as named constants so that tuning is one edit.
"""

from __future__ import annotations

import enum
import re
from dataclasses import dataclass
from difflib import SequenceMatcher

from sources.base import SourceResult

EXACT_RATIO = 0.95
EXACT_MARGIN = 0.15
PROBABLE_RATIO = 0.75
# Release years disagree by a year across sources routinely: festival versus
# general release, regional publication dates, a board game's print run.
YEAR_TOLERANCE = 1

_NON_ALPHANUMERIC = re.compile(r"[^a-z0-9]+")


class Confidence(str, enum.Enum):
    """How much a match should be trusted without a human looking."""

    EXACT = "exact"
    PROBABLE = "probable"
    UNCERTAIN = "uncertain"


@dataclass(frozen=True)
class Match:
    """The chosen candidate, or None when nothing was found."""

    result: SourceResult | None
    confidence: Confidence
    score: float


def normalize_title(title: str) -> str:
    """Case-folded, punctuation-free, single-spaced.

    Spines and box art disagree with catalogues on hyphens, colons, and
    typographic characters constantly. Comparing raw strings would mark
    "Spider-Man: No Way Home" and "Spider Man No Way Home" as different films.
    """
    return _NON_ALPHANUMERIC.sub(" ", title.casefold()).strip()


def _ratio(left: str, right: str) -> float:
    return SequenceMatcher(None, left, right).ratio()


def best_match(
    detected_title: str,
    detected_year: int | None,
    candidates: list[SourceResult],
) -> Match:
    """The candidate a detection most likely refers to.

    Year is applied as a filter before ranking, not as a tiebreaker after it.
    Two same-titled releases both score 1.0, so the margin between them is zero
    and the result would be forced to UNCERTAIN -- even though the year already
    settled it. Filtering first keeps the margin meaningful.

    A year that eliminates every candidate is treated as a bad reading rather
    than as evidence of absence: the unfiltered set is ranked instead, and the
    margin marks the ambiguity.
    """
    if not candidates:
        return Match(result=None, confidence=Confidence.UNCERTAIN, score=0.0)

    considered = candidates
    if detected_year is not None:
        in_range = [
            candidate
            for candidate in candidates
            if candidate.year is not None
            and abs(candidate.year - detected_year) <= YEAR_TOLERANCE
        ]
        if in_range:
            considered = in_range

    target = normalize_title(detected_title)
    scored = sorted(
        ((_ratio(target, normalize_title(c.title)), c) for c in considered),
        key=lambda pair: pair[0],
        reverse=True,
    )

    top_score, top = scored[0]
    runner_up = scored[1][0] if len(scored) > 1 else 0.0
    margin = top_score - runner_up

    if top_score >= EXACT_RATIO and margin >= EXACT_MARGIN:
        confidence = Confidence.EXACT
    elif top_score >= PROBABLE_RATIO and margin >= EXACT_MARGIN:
        confidence = Confidence.PROBABLE
    else:
        confidence = Confidence.UNCERTAIN

    return Match(result=top, confidence=confidence, score=top_score)
```

- [ ] **Step 4: Run tests, format, lint, commit**

```bash
git add backend/matching.py backend/tests/test_matching.py
git commit -m "feat(tracker): add measured confidence scoring for detections"
```

## Task 8: Photo import route

**Files:**
- Create: `backend/importer.py`, `backend/tests/test_importer.py`
- Modify: `backend/main.py`

**Interfaces:**
- Consumes: `build_provider`, `Image`, `LLMError` from `llm`; `best_match`, `Confidence` from `matching`; `adapter_for`, registry; `SourceError`
- Produces: `create_import_router(registry, provider_factory)`; `POST /api/import/photos` returning `{"detections": [...]}` where each detection is `{detected_title, media_type, detected_year, status, confidence, match, candidates}` and `status` is `matched` | `unresolved`
- `DETECTION_SCHEMA` — the enforced output schema, `media_type` constrained by enum to the four `ItemType` values

- [ ] **Step 1: Write the failing test**

Tests stub the provider and the adapters; no live calls.

```python
@pytest.mark.asyncio
async def test_detections_are_resolved_against_the_matching_source(import_client):
    response = await import_client.post(
        "/api/import/photos", files={"photos": ("shelf.jpg", b"\xff\xd8x", "image/jpeg")}
    )
    assert response.status_code == 200
    detection = response.json()["detections"][0]
    assert detection["media_type"] == "movie"
    assert detection["match"]["external_id"] == "438631"
    assert detection["confidence"] == "exact"


@pytest.mark.asyncio
async def test_a_dead_source_marks_only_its_own_rows_unresolved(
    import_client_with_one_broken_source,
):
    # A 200-item import must not be lost because one API was down.
    body = (await import_client_with_one_broken_source.post(
        "/api/import/photos", files={"photos": ("s.jpg", b"\xff\xd8x", "image/jpeg")}
    )).json()
    statuses = {d["media_type"]: d["status"] for d in body["detections"]}
    assert statuses["comic"] == "unresolved"
    assert statuses["movie"] == "matched"


@pytest.mark.asyncio
async def test_provider_failure_is_502_not_500(import_client_with_failing_llm):
    response = await import_client_with_failing_llm.post(
        "/api/import/photos", files={"photos": ("s.jpg", b"\xff\xd8x", "image/jpeg")}
    )
    assert response.status_code == 502
    assert "try again" in response.json()["detail"].lower()


@pytest.mark.asyncio
async def test_a_non_image_upload_is_rejected(import_client):
    response = await import_client.post(
        "/api/import/photos", files={"photos": ("notes.txt", b"hello", "text/plain")}
    )
    assert response.status_code == 415


@pytest.mark.asyncio
async def test_import_requires_the_admin_session(anonymous_client):
    response = await anonymous_client.post(
        "/api/import/photos", files={"photos": ("s.jpg", b"\xff\xd8x", "image/jpeg")}
    )
    assert response.status_code == 401


def test_the_detection_schema_constrains_media_type_to_the_item_types():
    from importer import DETECTION_SCHEMA
    from models import ItemType

    node = DETECTION_SCHEMA["properties"]["detections"]["items"]
    assert set(node["properties"]["media_type"]["enum"]) == {
        t.value for t in ItemType
    }
    assert node["additionalProperties"] is False
```

- [ ] **Step 2: Run and watch it fail.**

- [ ] **Step 3: Write `importer.py`**

Key points the implementation must honour:

- `ACCEPTED_MEDIA_TYPES = {"image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"}` — matching what Gemini accepts. Anything else is 415.
- `DETECTION_SCHEMA` is an object with one `detections` array; each item is `{title: string, media_type: enum[four ItemType values], year: integer|null}`, `required: ["title", "media_type"]`, `additionalProperties: false`.
- The prompt instructs: read every distinct title visible on spines, cases, and boxes; return one entry per distinct work; do not guess at titles that are illegible; `year` only when it is printed.
- Photo bytes are read with `await upload.read()` and passed straight into `Image(...)`. **No filesystem write anywhere in this module.**
- Detections are grouped by `media_type`. Each group is resolved by its own adapter, sequentially within the group (that is where the per-source `Throttle` applies), and the groups run concurrently via `asyncio.gather(..., return_exceptions=True)`.
- A group whose adapter raises `SourceError` — including `SourceNotConfigured` — marks every detection in that group `unresolved` with the source name in a `reason` field. It never propagates.
- `LLMError` becomes `HTTPException(502, "Extraction failed, try again.")`.
- One summary log line per batch — `"import: %d photos, %d detections, %d matched, %d unresolved"` — never one line per detection. A 200-item import must not flood the log sink.

- [ ] **Step 4: Register the router in `main.py`**

```python
app.include_router(create_import_router(registry, lambda: build_provider(config)))
```

The provider is built per request through a factory rather than at import, so a missing `GEMINI_API_KEY` is a 502 on the import route instead of a service that will not boot.

- [ ] **Step 5: Run tests, format, lint, commit**

```bash
git add backend/importer.py backend/main.py backend/tests/test_importer.py
git commit -m "feat(tracker): add photo import with vision extraction and resolution"
```

## Task 9: Bulk insert with dedupe

**Files:**
- Modify: `backend/items.py`, `backend/tests/test_items.py`

**Interfaces:**
- Produces: `POST /api/items/bulk` taking `{"items": [ItemIn, ...]}` and returning `{"created": int, "skipped_duplicates": int, "ids": [uuid]}`

- [ ] **Step 1: Write the failing test**

```python
@pytest.mark.asyncio
async def test_bulk_creates_rows_and_defaults_them_to_physical(admin_client):
    response = await admin_client.post("/api/items/bulk", json={"items": [
        {"type": "movie", "title": "Dune", "status": "backlog",
         "external_source": "tmdb", "external_id": "438631",
         "owned_format": "physical"},
    ]})
    assert response.status_code == 201
    assert response.json()["created"] == 1


@pytest.mark.asyncio
async def test_reimporting_the_same_shelf_skips_rather_than_errors(admin_client):
    # Photographing a shelf twice is expected behaviour, not a mistake.
    payload = {"items": [{"type": "movie", "title": "Dune", "status": "backlog",
                          "external_source": "tmdb", "external_id": "438631"}]}
    await admin_client.post("/api/items/bulk", json=payload)
    second = await admin_client.post("/api/items/bulk", json=payload)
    assert second.status_code == 201
    assert second.json() == {"created": 0, "skipped_duplicates": 1, "ids": []}


@pytest.mark.asyncio
async def test_two_manual_rows_both_insert(admin_client):
    # The unique index is partial. Without the predicate these would collide
    # on (NULL, NULL) in a way Postgres would not even report consistently.
    response = await admin_client.post("/api/items/bulk", json={"items": [
        {"type": "comic", "title": "A", "status": "backlog"},
        {"type": "comic", "title": "B", "status": "backlog"},
    ]})
    assert response.json()["created"] == 2


@pytest.mark.asyncio
async def test_a_duplicate_inside_one_batch_is_also_skipped(admin_client):
    response = await admin_client.post("/api/items/bulk", json={"items": [
        {"type": "movie", "title": "Dune", "status": "backlog",
         "external_source": "tmdb", "external_id": "438631"},
        {"type": "movie", "title": "Dune", "status": "backlog",
         "external_source": "tmdb", "external_id": "438631"},
    ]})
    assert response.json() == {"created": 1, "skipped_duplicates": 1,
                               "ids": response.json()["ids"]}


@pytest.mark.asyncio
async def test_bulk_rejects_an_empty_batch(admin_client):
    assert (await admin_client.post("/api/items/bulk", json={"items": []})).status_code == 422
```

- [ ] **Step 2: Run and watch it fail.**

- [ ] **Step 3: Implement**

Use `postgresql.insert(Item).on_conflict_do_nothing(index_elements=[...])` with `.returning(Item.id)`, declared **before** the `/{item_id}` route. Duplicates inside one batch are removed in Python first, keyed on `(external_source, external_id)` with `None` keys never collapsing — `ON CONFLICT` does not deduplicate rows within a single statement. Cap the batch at 500 items with a `Field(max_length=500)` on the list.

- [ ] **Step 4: Run tests, format, lint, commit**

```bash
git add backend/items.py backend/tests/test_items.py
git commit -m "feat(tracker): add bulk item creation with conflict-skip dedupe"
```

## Task 10: Import UI

**Files:**
- Create: `frontend/src/pages/AdminImport.jsx`, `frontend/src/components/CoverImage.jsx`, `frontend/src/pages/AdminImport.test.jsx`
- Modify: `frontend/src/App.jsx`, `frontend/src/pages/AdminCollection.jsx`, `frontend/src/index.css`

**Interfaces:**
- Produces: route `admin/import`; `<CoverImage src type alt />` with `onError` placeholder

- [ ] **Step 1: Write the failing test**

```jsx
it('lists every detection with its match pre-selected', async () => { /* … */ })
it('lets a row be switched to another candidate before import', async () => { /* … */ })
it('lets a row be unchecked so it is not imported', async () => { /* … */ })
it('marks uncertain rows so they are obvious at a glance', async () => { /* … */ })
it('sends only checked rows, with owned_format physical', async () => { /* … */ })
it('reports how many were skipped as duplicates', async () => { /* … */ })
it('shows the extraction error rather than an empty grid on 502', async () => { /* … */ })
```

Each body stubs `fetch` for `/api/import/photos` and `/api/items/bulk` in the style of `Admin.test.jsx`, and drives the grid with `userEvent`.

- [ ] **Step 2: Run and watch it fail.**

- [ ] **Step 3: Build the page**

- File input accepting `image/*` with `multiple` and `capture` absent, so mobile offers camera or library and desktop offers drag-and-drop. One `<input>` serves both.
- Upload posts `FormData` with repeated `photos` entries to `/api/import/photos`.
- Grid rows: cover thumbnail, editable title, type `<select>`, candidate `<select>` (including a "no match — keep as manual" option), confidence badge, checkbox. Uncertain rows are visually distinct **and** carry text — never color alone, which fails for anyone who cannot distinguish it.
- Import posts checked rows to `/api/items/bulk` with `status: 'backlog'` and `owned_format: 'physical'`.
- Extraction is slow; show progress and disable the button while in flight.
- Add the route to `App.jsx` and a link from `AdminCollection.jsx`.

- [ ] **Step 4: Verify in the browser, including a real photograph**

Sign in, open `/admin/import`, upload a genuine shelf photo, confirm detections resolve, fix one row, import, and confirm the rows appear in `/admin/collection`. **This is where the confidence thresholds get tuned** — if the buckets are wrong on real spines, adjust the constants in `matching.py` and re-run its tests.

- [ ] **Step 5: Tests, build, lint, commit**

```bash
git add frontend/src/pages/AdminImport.jsx frontend/src/pages/AdminImport.test.jsx \
        frontend/src/components/CoverImage.jsx frontend/src/App.jsx \
        frontend/src/pages/AdminCollection.jsx frontend/src/index.css
git commit -m "feat(tracker): add photo import confirm grid"
```

---

# Zone 4 — Remaining sources

Three adapters against the interface Zone 2 proved. Each is one module plus fixtures plus tests, registered with one line in `build_registry`. Each follows the Task 3 shape exactly: `_parse_search` and `_parse_detail` are pure and fixture-tested; only `search`/`fetch` touch the network.

## Task 11: IGDB

**⚠️ Step 0, before any code:** `api-docs.igdb.com` returned **HTTP 403** during the research gate. The Twitch client-credentials flow, the ~60-day token life, and the 4 req/s limit are **assumptions carried from the requirements doc, not verified facts.** Confirm each with a live call and write what actually happened into the module docstring:

```bash
cd backend && source .env && curl -s -X POST \
  "https://id.twitch.tv/oauth2/token?client_id=$IGDB_CLIENT_ID&client_secret=$IGDB_CLIENT_SECRET&grant_type=client_credentials"
```

Then a search, using the returned token, noting the response headers for any rate-limit hints. If the flow differs from the assumption, the adapter follows reality and this plan is wrong — say so in the batch review.

**Files:** `backend/sources/igdb.py`, `backend/tests/fixtures/igdb_*.json`, `backend/tests/test_sources_igdb.py`; modify `sources/registry.py`.

Requirements: token cached on the instance and refreshed on 401, never fetched per request; Apicalypse POST bodies; `Client-ID` and `Authorization: Bearer` headers; cover URL `https://images.igdb.com/igdb/image/upload/t_cover_big/{image_id}.jpg`; `creator` from `involved_companies` where `developer` is true; store `similar_games` ids in `source_metadata` for a future recommendation engine. A test must assert the token is fetched once across two searches.

## Task 12: ComicVine

**Files:** `backend/sources/comicvine.py`, fixtures, `backend/tests/test_sources_comicvine.py`; modify `sources/registry.py`.

**Verified:** `/search` requires `api_key`, `query`, `format`; `resources=volume` filters to series; **`limit` on `/search` cannot exceed 10**. **No rate limits are stated anywhere in ComicVine's documentation** — the widely repeated 200/hour figure is not theirs. Throttle at ~1 req/s defensively.

Requirements: volume level only, never issues; a custom `User-Agent` header (ComicVine rejects default agents); `field_list` to keep responses small; `creator` from the publisher; no community rating field exists, so `source_metadata` carries `count_of_issues`, `start_year`, `publisher`, `description` and no score. A test must assert the `User-Agent` is set and that `limit` is never sent above 10.

## Task 13: BGG

**Files:** `backend/sources/bgg.py`, `backend/tests/fixtures/bgg_*.xml`, `backend/tests/test_sources_bgg.py`; modify `sources/registry.py`.

**Verified:** `search?query=&type=boardgame` and `thing?id=&stats=1`; HTTP 202 means queued, retry; `thing` accepts up to 20 comma-separated ids in one request; search results carry no images, so the picker fetches `thing` for the top hits in a single batched call. The requirements doc's "≥5 s between requests" is **not supported by any primary source** — the wiki returned 403 — while client libraries converge on ~2 req/s. Use 1 req/s.

Requirements: parse with `defusedxml.ElementTree`, never stdlib `ElementTree`; no API key; retry 202 with backoff up to a bounded number of attempts, then `SourceRateLimited`; `source_metadata` carries `average_rating`, `rank`, `weight`, `min_players`, `max_players`, `playing_time`. Tests must cover a 202-then-200 sequence and the ≤20-id batching.

**Registry after this zone:**

```python
    return {
        ItemType.MOVIE: TmdbSource(config),
        ItemType.GAME: IgdbSource(config),
        ItemType.COMIC: ComicVineSource(config),
        ItemType.BOARDGAME: BggSource(config),
    }
```

Commit each adapter separately: `feat(tracker): add IGDB game metadata adapter`, etc.

---

# Zone 5 — Public showcase

## Task 14: Public router

**Files:** `backend/public.py`, `backend/tests/test_public.py`; modify `backend/main.py`.

**Interfaces:** `create_public_router(factory)`; `GET /api/public/items` → `list[PublicItemOut]`; `GET /api/public/stats` → `{by_type, by_status, rating_histogram, finishes_by_month}`.

- [ ] **Step 1: Write the failing tests — the leak test first**

```python
@pytest.mark.asyncio
async def test_private_fields_are_absent_from_the_response(public_client, seeded_items):
    body = (await public_client.get("/api/public/items")).json()
    assert body
    for row in body:
        assert "notes" not in row
        assert "owned_format" not in row


@pytest.mark.asyncio
async def test_non_public_rows_are_never_returned(public_client, seeded_items):
    titles = {row["title"] for row in (await public_client.get("/api/public/items")).json()}
    assert "Private Thing" not in titles


@pytest.mark.asyncio
async def test_public_routes_need_no_session(anonymous_client):
    assert (await anonymous_client.get("/api/public/items")).status_code == 200


@pytest.mark.asyncio
async def test_stats_count_only_public_rows(public_client, seeded_items):
    stats = (await public_client.get("/api/public/stats")).json()
    assert sum(stats["by_type"].values()) == 2
```

- [ ] **Step 2–4: Implement, test, commit**

`PublicItemOut` is hand-written and lists exactly: `id`, `type`, `title`, `year`, `creator`, `cover_url`, `status`, `rating`, `favorite`, `finished_at`, `genres`, `community_score`. The last two are lifted out of `source_metadata` in a mapping function — `source_metadata` itself is never serialized, because it is a snapshot whose shape varies by source and may carry fields nobody audited for publication.

The router has **no** `require_admin` dependency. Stats are computed with SQL aggregates over `is_public = true`, not by loading rows into Python.

```bash
git commit -m "feat(tracker): add public read-only collection API"
```

## Task 15: Public collection page

**Files:** `frontend/src/pages/Collection.jsx`, `frontend/src/pages/Collection.test.jsx`; modify `App.jsx`, `Projects.jsx`, `index.css`.

Requirements:

- Poster grid is the default and the priority. Type and status filters. Stats block: status counts, rating histogram, finishes per month. Recently-finished strip.
- **Cold start is explicit.** Reuse the `slow` pattern already in `AdminCollection.jsx:20`: after ~2 seconds show "Waking the server — the free tier sleeps, this takes about 30 seconds." A bare spinner reads as broken.
- **Per-type tile aspect ratio.** TMDB posters are 2:3; IGDB covers are near 3:4; BGG and ComicVine images are arbitrary. A grid assuming 2:3 will look broken on half the shelves. Set the ratio per type on the tile and `object-fit: cover` inside it.
- `CoverImage` handles the missing-cover fallback.
- Tokens only, correct in both themes. Test at 375px and desktop.
- Link from `Projects.jsx` as a project card.

```bash
git commit -m "feat(tracker): add public collection showcase page"
```

## Task 16: Footer sign-in, attribution, smoke, docs

**Files:** modify `frontend/src/layouts/RootLayout.jsx`, `frontend/src/index.css`, `scripts/smoke.sh`, `CLAUDE.md`; create `backend/sources/README.md`.

- [ ] **Footer auth.** `RootLayout.jsx:100` currently renders email · GitHub · LinkedIn. Add a session check via `apiFetch('/api/auth/me')`: no session → a subtle "Sign in" link to `loginUrl`; session → "Admin · Sign out". The check must fail quietly — the footer on a public page must never show an error because the backend is asleep.
- [ ] **Attribution**, rendered on the collection pages: the exact TMDB string "This product uses the TMDB API but is not endorsed or certified by TMDB" plus the logo linking to themoviedb.org; a Comic Vine link; the "Powered by BGG" logo linking to boardgamegeek.com. Logos are local SVG assets, not hotlinked.
- [ ] **`scripts/smoke.sh`**: add `/api/public/items` returns 200 and an array with no `notes` key; `/api/public/stats` returns 200 with the four expected keys; `/collection` returns 200 from the static site.
- [ ] **`backend/sources/README.md`** — required by standards for a new module: what the package does and why the interface exists, how to add a fifth source, each source's auth and throttle, which env var each needs, and the attribution obligations. Record the IGDB findings from Task 11 here.
- [ ] **`CLAUDE.md`**: tick E2–E5, note `/collection` is public and calls the API, note that migrations must be applied to Neon before deploying.

```bash
git commit -m "docs(tracker): add sources README and update project docs"
```

---

## Finish Gate

1. `cd backend && ./.venv/bin/pytest -v && ./.venv/bin/ruff format --check . && ./.venv/bin/ruff check .`
2. `cd frontend && npm test && npm run build && npm run lint && npm run format:check`
3. Review the full branch diff against `main`. 4+ files and a migration in the deploy path → **ultra review**.
4. **Joey applies the migration to Neon** (`alembic upgrade head` against `DATABASE_URL_DIRECT`) **before** deploying, or the API refuses to boot — `schema_check` is doing its job when that happens.
5. After deploy: `./scripts/smoke.sh https://joey-haas.dev https://api.joey-haas.dev`, then confirm Render logs are clean for both services. Green smoke with fresh errors in the logs is not done.
