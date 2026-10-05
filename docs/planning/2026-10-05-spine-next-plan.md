# Spine Next Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A nightly GitHub Actions job keeps Spine's live data fresh, using a
job token that works only on a pinned whitelist of routes. A public `/spine/next`
("What's next") page shows tonight's picks and what to buy, built by the same
server-side sectioning as `/admin/store-list`. The tracker routes get a
compact masthead and a shared Spine header.

**Architecture:** `require_admin` also accepts a bearer token read from
`app.state`, but only on `JOB_ROUTES`. `nightly.yml` calls those routes in
order, then runs the existing snapshot compare and deploy hook. A pure
`next_list.py` turns pending Discover and Radar rows into sections and
rebuilds public reasons over public games only. `next_load.py` reads the
database for it, and both `GET /api/public/next` and
`GET /api/recommendations/store-list` serve its output. The frontend adds
`SiteHeader` (compact on tracker routes), `SpineHeader`, `SpineTabs`,
`NextRow`, `NextBand` and `pages/Next.jsx`, and paints the `next` snapshot
before the live API answers.

**Tech Stack:** FastAPI + SQLAlchemy (async) + Postgres 18 (pytest), React 19
+ react-router v8 + Vitest, plain CSS tokens, GitHub Actions (bash, curl,
jq), Render Blueprint.

**Spec:** `docs/planning/2026-10-05-spine-next-design.md` (sections A–E,
K1–K9, S1–S8). This plan follows it, and where it refines it, the change is
marked **(refines spec)**.

## Global Constraints

- **No migration.** No new table, column or enum value.
- **Branches:** PR A is `spine-next-nightly` (exists, holds the spec). PR B
  is `spine-next-page`, branched from `main` once PR A has merged (or from
  `spine-next-nightly` if PR A is still in review). Never commit on `main`;
  never push, merge or rebase (Joey's).
- **Commits:** conventional; ≤5 files; each independently valid (tests
  green). End every message with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **After every file change:**
  - backend: `cd backend && ./.venv/bin/ruff format . && ./.venv/bin/ruff check .`
  - frontend: `cd frontend && npx prettier --write <file> && npx eslint <file>`
- **Suites:** backend `cd backend && ./.venv/bin/pytest`; frontend
  `cd frontend && npm test`; build `cd frontend && npm run build`.
- **Pure modules** (`next_list.py`) import no FastAPI or SQLAlchemy, and
  `tests/test_physical_imports.py` pins that.
- **Public outputs never contain** these keys at any depth: `id`, `score`,
  `rank`, `hypes`, `lane`, `store_lines`, `format_note`, `model_note`,
  `ranked_by`, `based_on`, `based_on_titles`, `listing_ids`,
  `preorder_closes_at`, `price`, `store`, `url`, `status`, `batch_id`.
- **Public reasons** name only public games, are first person (no `you` or
  `your`), and number at most two per row.
- **Public dates:** `release_source == "registry"` only
  (`PUBLIC_DATE_SOURCES`).
- **Job token:** `JOB_ROUTES` is exactly these seven `(method, route
  template)` pairs:
  - `POST /api/picker/next`
  - `POST /api/physical/refresh-registry`
  - `POST /api/physical/refresh`
  - `POST /api/physical/refresh-switch1`
  - `POST /api/physical/resolve`
  - `POST /api/recommendations/generate`
  - `GET /api/physical/status`
- **Frontend conventions** (CLAUDE.md):
  - style with tokens only, never a literal colour;
  - `role="img"` on any non-text mark with an accessible name;
  - nothing hover-only;
  - `useMediaQuery`, never `matchMedia`;
  - prefs through `readShelfPref` / `writeShelfPref` under `shelf.next.*`;
  - copy lives in `content/spine.js`;
  - admin controls are siblings of a row's link, never nested inside it.
- **Weekly** means `date -u +%u` = `1` (Sunday evening in Denver).
- **Copy, verbatim from the spec:**
  - lede: *What to play tonight from the shelf, and what to look for in a
    store: full cartridges only, ranked by the same taste profile, refreshed
    nightly.*
  - Not on cartridge line: *Digital only or a Game-Key Card, so not for the
    shelf.*
  - page title: *What's next · Spine*
  - tab labels: **Shelf**, **What's next**

---

## File structure

| File | Responsibility | Task |
|---|---|---|
| `backend/config.py` | `job_token` optional config | 1 |
| `backend/main.py` | `app.state.job_token` | 1 |
| `backend/items.py` | `JOB_ROUTES`, `require_admin` bearer path | 2 |
| `backend/tests/test_job_token.py` | whitelist pinned | 2 |
| `frontend/src/lib/nightly.js` | "Last nightly" from status + generated times (pure) | 3 |
| `frontend/src/components/LastNightly.jsx` | fetch + render the line | 3 |
| `render.yaml`, `backend/env.example` | declare `JOB_TOKEN` | 4 |
| `.github/workflows/nightly.yml` | the job (replaces `snapshot.yml`) | 5 |
| `backend/next_list.py` | sections, dates, `new`, public reasons (pure) | 6, 7 |
| `backend/next_load.py` | DB → `NextCandidate`s, public taste, generated/catalogue times | 8 |
| `backend/public_outputs.py`, `backend/public.py` | `GET /api/public/next` | 9 |
| `backend/recommendations_routes.py` | `GET /api/recommendations/store-list` | 10 |
| `frontend/src/components/SiteHeader.jsx` | the one masthead, two densities | 11 |
| `frontend/src/components/SpineTabs.jsx`, `SpineHeader.jsx` | the shared Spine block | 12 |
| `frontend/src/lib/useSnapshotThenLive.js`, `lib/snapshot.js` | snapshot-then-API hook, `next` shape | 13 |
| `frontend/src/lib/next.js`, `components/NextRow.jsx`, `components/SortControl.jsx` | shared row, grouping, sorting | 14 |
| `frontend/src/pages/Next.jsx`, `App.jsx` | `/spine/next` | 15 |
| `frontend/src/pages/Collection.jsx`, `components/NextBand.jsx` | shelf trims, band, colophon | 16 |
| `frontend/src/pages/AdminStoreList.jsx` | reads store-list route through `NextRow` | 17 |
| `frontend/scripts/fetch-snapshot.mjs` | `next` snapshot (deploy path) | 20 |
| `scripts/smoke.sh`, README, post, `CLAUDE.md` | checks and docs | 18, 19 |

---

# PR A — the nightly job (branch `spine-next-nightly`)

Record the zone-start SHA before Task 1: `git rev-parse HEAD`.

### Task 1: `JOB_TOKEN` config and `app.state`

**Files:**
- Modify: `backend/config.py` (the `Config` dataclass and `load_config`)
- Modify: `backend/main.py` (right after `app = FastAPI(...)`)
- Test: `backend/tests/test_config.py`

**Interfaces:**
- Produces: `Config.job_token: str | None`; `app.state.job_token` (`str | None`), which Task 2 reads.

- [ ] **Step 1: Write the failing tests** (append to `tests/test_config.py`)

```python
def test_job_token_is_optional():
    assert load_config(COMPLETE).job_token is None


def test_job_token_is_read_and_blank_means_unset():
    assert load_config({**COMPLETE, "JOB_TOKEN": " s3cret "}).job_token == "s3cret"
    assert load_config({**COMPLETE, "JOB_TOKEN": "   "}).job_token is None
```

- [ ] **Step 2: Run them, expect failure**

Run: `cd backend && ./.venv/bin/pytest tests/test_config.py -k job_token -v`
Expected: FAIL (`AttributeError: 'Config' object has no attribute 'job_token'`).

- [ ] **Step 3: Implement**

In `Config`, after `anthropic_api_key`:

```python
    # The nightly workflow's bearer token (Spine Next spec, A1). Unset means
    # every bearer request is a 401 and only a session is admin, as before.
    # It opens only items.JOB_ROUTES, never the rest of the admin API.
    job_token: str | None = None
```

In `load_config`, after `anthropic_api_key=...`:

```python
        job_token=_optional(source, "JOB_TOKEN"),
```

In `main.py`, directly after `app = FastAPI(...)`:

```python
# require_admin reads the job token from here (Spine Next spec, K1), so the
# five routers keep their signatures. An app that never sets it -- every test
# app -- has no token and accepts sessions only.
app.state.job_token = config.job_token
```

- [ ] **Step 4: Run, expect pass**

Run: `cd backend && ./.venv/bin/pytest tests/test_config.py -v`
Expected: all PASS. Then run `ruff format . && ruff check .`.

- [ ] **Step 5: Commit**

```bash
git add backend/config.py backend/main.py backend/tests/test_config.py
git commit -m "feat(api): optional JOB_TOKEN config on app state

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 2: `require_admin` accepts the job token on `JOB_ROUTES` only

**Files:**
- Modify: `backend/items.py:277-287` (`require_admin`), plus module-level `JOB_ROUTES` and the `import secrets`
- Create: `backend/tests/test_job_token.py`

**Interfaces:**
- Consumes: `request.app.state.job_token` (Task 1).
- Produces: `items.JOB_ROUTES: frozenset[tuple[str, str]]`; `require_admin(request) -> None` (signature unchanged).

- [ ] **Step 1: Write the failing tests** — `backend/tests/test_job_token.py`

```python
"""The job token opens exactly JOB_ROUTES (Spine Next spec, A2).

This file is the point of the token: a bearer token that opened any admin
route would be a second admin password kept in GitHub. Behaviour is tested
on stub routes at the real templates (no database); a second test proves
every whitelisted pair exists on the real routers, so a renamed route cannot
leave a dead entry behind.
"""

import asyncio
from contextlib import asynccontextmanager

import pytest
from fastapi import APIRouter, Depends, FastAPI
from httpx2 import ASGITransport, AsyncClient
from starlette.middleware.sessions import SessionMiddleware

from items import JOB_ROUTES, create_items_router, require_admin
from physical_routes import create_physical_router
from picker_routes import create_picker_router
from recommendations_routes import create_recommendations_router

pytestmark = pytest.mark.asyncio

TOKEN = "test-job-token"
EXPECTED = {
    ("POST", "/api/picker/next"),
    ("POST", "/api/physical/refresh-registry"),
    ("POST", "/api/physical/refresh"),
    ("POST", "/api/physical/refresh-switch1"),
    ("POST", "/api/physical/resolve"),
    ("POST", "/api/recommendations/generate"),
    ("GET", "/api/physical/status"),
}


def _stub_app(token: str | None, signed_in: bool = False) -> FastAPI:
    """Routes at the real templates, gated like the real routers."""
    app = FastAPI()
    app.state.job_token = token
    gated = APIRouter(dependencies=[Depends(require_admin)])

    async def ok() -> dict:
        return {"ok": True}

    for method, path in EXPECTED:
        gated.add_api_route(path, ok, methods=[method])
    gated.add_api_route("/api/items/{item_id}", ok, methods=["PATCH"])
    gated.add_api_route("/api/items", ok, methods=["POST"])
    app.include_router(gated)
    if signed_in:

        @app.middleware("http")
        async def _sign_in(request, call_next):
            request.session["user"] = {"sub": "1", "email": "admin@example.com"}
            return await call_next(request)

    app.add_middleware(SessionMiddleware, secret_key="test", https_only=False)
    return app


@asynccontextmanager
async def client(token: str | None = TOKEN, signed_in: bool = False):
    async with AsyncClient(
        transport=ASGITransport(app=_stub_app(token, signed_in)),
        base_url="http://testserver",
    ) as http:
        yield http


def bearer(value: str = TOKEN) -> dict:
    return {"Authorization": f"Bearer {value}"}


async def test_the_whitelist_is_exactly_the_nightly_routes():
    assert JOB_ROUTES == frozenset(EXPECTED)


async def test_every_whitelisted_route_exists_on_the_real_routers():
    app = FastAPI()
    lock = asyncio.Lock()
    app.include_router(create_items_router(None, {}))
    app.include_router(create_picker_router(None))
    app.include_router(create_physical_router(None, {}, lambda: None, None, lock=lock))
    app.include_router(create_recommendations_router(None, {}, lock))
    real = {
        (method, route.path)
        for route in app.routes
        for method in getattr(route, "methods", ())
    }
    assert JOB_ROUTES <= real


@pytest.mark.parametrize(("method", "path"), sorted(EXPECTED))
async def test_the_token_opens_each_whitelisted_route(method, path):
    async with client() as http:
        response = await http.request(method, path, headers=bearer(), json={})
    assert response.status_code == 200


@pytest.mark.parametrize(
    ("method", "path"),
    [("PATCH", "/api/items/0b7c6f3e-1111-4c1c-9a50-000000000001"), ("POST", "/api/items")],
)
async def test_the_token_opens_nothing_else(method, path):
    async with client() as http:
        response = await http.request(method, path, headers=bearer(), json={})
    assert response.status_code == 401


async def test_a_wrong_token_is_refused():
    async with client() as http:
        response = await http.post("/api/picker/next", headers=bearer("nope"), json={})
    assert response.status_code == 401


async def test_another_scheme_is_refused():
    async with client() as http:
        response = await http.post(
            "/api/picker/next", headers={"Authorization": f"Basic {TOKEN}"}, json={}
        )
    assert response.status_code == 401


async def test_no_configured_token_refuses_every_bearer():
    async with client(token=None) as http:
        response = await http.post("/api/picker/next", headers=bearer(), json={})
    assert response.status_code == 401


async def test_a_trailing_slash_does_not_widen_the_match():
    async with client() as http:
        response = await http.post(
            "/api/items/", headers=bearer(), json={}, follow_redirects=False
        )
    assert response.status_code in (307, 401, 404)
    assert response.status_code != 200


async def test_a_session_is_unchanged_with_or_without_a_header():
    async with client(signed_in=True) as http:
        plain = await http.patch("/api/items/0b7c6f3e-1111-4c1c-9a50-000000000001", json={})
        odd = await http.post("/api/items", headers=bearer("nope"), json={})
    assert plain.status_code == 200
    assert odd.status_code == 200
```

If a router factory's real signature differs from the call in
`test_every_whitelisted_route_exists_on_the_real_routers`, read it in the
module and match it. The factories do not touch the database while they are
being built.

- [ ] **Step 2: Run, expect failure**

Run: `cd backend && ./.venv/bin/pytest tests/test_job_token.py -v`
Expected: FAIL (`ImportError: cannot import name 'JOB_ROUTES'`).

- [ ] **Step 3: Implement** in `items.py`

Add `import secrets` to the standard-library imports. Above `require_admin`:

```python
# The only routes the nightly workflow's bearer token opens (Spine Next
# spec, A2): (method, route template), templates including the router
# prefix. Matching on the template FastAPI routed to, not the raw URL, so a
# trailing slash or root_path cannot widen it. tests/test_job_token.py pins
# this set; changing it means changing that test.
JOB_ROUTES: frozenset[tuple[str, str]] = frozenset(
    {
        ("POST", "/api/picker/next"),
        ("POST", "/api/physical/refresh-registry"),
        ("POST", "/api/physical/refresh"),
        ("POST", "/api/physical/refresh-switch1"),
        ("POST", "/api/physical/resolve"),
        ("POST", "/api/recommendations/generate"),
        ("GET", "/api/physical/status"),
    }
)


def _job_route(request: Request) -> str | None:
    """The routed template when it is a job route, else None."""
    path = getattr(request.scope.get("route"), "path", None)
    return path if (request.method, path) in JOB_ROUTES else None


def _job_token_ok(request: Request) -> bool:
    """A configured token, a job route, and a matching bearer header."""
    expected = getattr(request.app.state, "job_token", None)
    if not expected or _job_route(request) is None:
        return False
    scheme, _, presented = request.headers.get("authorization", "").partition(" ")
    if scheme.lower() != "bearer" or not presented:
        return False
    return secrets.compare_digest(presented.encode(), expected.encode())
```

Replace the body of `require_admin` (and keep its docstring, adding one
paragraph):

```python
    """...existing paragraph...

    The nightly workflow is the one other caller: a bearer token equal to
    JOB_TOKEN passes on JOB_ROUTES and nowhere else. A session is checked
    first, so nothing changes for the owner.
    """
    if request.session.get("user"):
        return
    if _job_token_ok(request):
        # Never the token: the method and route only.
        logger.info("job token accepted: %s %s", request.method, _job_route(request))
        return
    raise HTTPException(status_code=401, detail="Not authenticated")
```

(`logger` already exists in `items.py:40`.)

- [ ] **Step 4: Run, expect pass, then the full suite**

Run: `cd backend && ./.venv/bin/pytest tests/test_job_token.py -v && ./.venv/bin/pytest`
Expected: all PASS. Run ruff.

- [ ] **Step 5: Commit**

```bash
git add backend/items.py backend/tests/test_job_token.py
git commit -m "feat(api): job token opens the nightly whitelist only

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 3: "Last nightly" on `/admin`

**Files:**
- Create: `frontend/src/lib/nightly.js`, `frontend/src/lib/nightly.test.js`
- Create: `frontend/src/components/LastNightly.jsx`
- Modify: `frontend/src/pages/Admin.jsx` (render `<LastNightly />` first in the signed-in block)
- Modify: `frontend/src/pages/Admin.test.jsx`

**Interfaces:**
- Consumes: `GET /api/physical/status` → `{sources: [{source, name, kind, last_run: {finished_at, ok} | null}], totals}`. In PR A, `GET /api/recommendations?kind=radar|discover` → `{generated_at}`. Task 17 switches this to `GET /api/recommendations/store-list` → `{generated_at: {radar, discover}}`.
- Produces: `lastNightly(status, generated, now) -> {catalogueAt: number|null, failed: string[], stale: boolean, radarAt: string|null, discoverAt: string|null}`; `nightlyWords(summary) -> string`; `STALE_HOURS = 36`.

- [ ] **Step 1: Write the failing pure tests** — `lib/nightly.test.js`

```js
import { describe, expect, it } from 'vitest'
import { lastNightly, nightlyWords, STALE_HOURS } from './nightly.js'

const NOW = Date.parse('2026-10-05T12:00:00Z')
const run = (source, kind, finished_at, ok = true, name = source) => ({
  source,
  name,
  kind,
  last_run: finished_at ? { finished_at, ok } : null,
})

describe('lastNightly', () => {
  it('takes the newest nightly run and ignores Refresh N64', () => {
    const summary = lastNightly(
      {
        sources: [
          run('lrg', 'store', '2026-10-05T00:40:00Z'),
          run('nscollectors', 'registry', '2026-10-05T00:20:00Z'),
          run('igdb_platform', 'platform', '2026-10-05T09:00:00Z'),
        ],
      },
      { radar: '2026-10-05T00:44:00Z', discover: null },
      NOW,
    )
    expect(summary.catalogueAt).toBe(Date.parse('2026-10-05T00:40:00Z'))
    expect(summary.failed).toEqual([])
    expect(summary.stale).toBe(false)
    expect(summary.radarAt).toBe('2026-10-05T00:44:00Z')
  })

  it('names the sources that failed on that night only', () => {
    const summary = lastNightly(
      {
        sources: [
          run('lrg', 'store', '2026-10-05T00:40:00Z', false, 'Limited Run'),
          run('old', 'store', '2026-10-01T00:40:00Z', false, 'Old store'),
          run('resolve', 'resolve', '2026-10-05T00:42:00Z'),
        ],
      },
      {},
      NOW,
    )
    expect(summary.failed).toEqual(['Limited Run'])
  })

  it(`is stale after ${STALE_HOURS} hours, and with no runs at all`, () => {
    const old = lastNightly(
      { sources: [run('lrg', 'store', '2026-10-03T23:00:00Z')] },
      {},
      NOW,
    )
    expect(old.stale).toBe(true)
    expect(lastNightly({ sources: [] }, {}, NOW).stale).toBe(true)
  })
})

describe('nightlyWords', () => {
  it('says ok, failed or may have stopped', () => {
    const base = {
      catalogueAt: Date.parse('2026-10-05T00:40:00Z'),
      failed: [],
      stale: false,
      radarAt: null,
      discoverAt: null,
    }
    expect(nightlyWords(base)).toMatch(/^Last nightly: catalogue .+ · ok$/)
    expect(nightlyWords({ ...base, failed: ['Limited Run'] })).toMatch(
      /failed: Limited Run/,
    )
    expect(nightlyWords({ ...base, stale: true })).toMatch(
      /^Nightly may have stopped/,
    )
    expect(nightlyWords({ ...base, catalogueAt: null, stale: true })).toBe(
      'Nightly may have stopped: no catalogue run yet',
    )
  })
})
```

- [ ] **Step 2: Run, expect failure**

Run: `cd frontend && npx vitest run src/lib/nightly.test.js`
Expected: FAIL (cannot resolve `./nightly.js`).

- [ ] **Step 3: Implement** `lib/nightly.js`

```js
/**
 * The admin landing's "Last nightly" line (Spine Next spec, A4).
 *
 * Read from the catalogue's run status and the two generate times; there is
 * no table of nightly runs, so this reports the latest catalogue run,
 * whoever started it (K6). The stale warning also catches GitHub switching
 * the schedule off after 60 days without repository activity.
 */

/** Source kinds the nightly job refreshes; Refresh N64 is manual. */
const NIGHTLY_KINDS = new Set(['store', 'registry', 'resolve'])

/** Hours after which the line says the job may have stopped. */
export const STALE_HOURS = 36

/** Runs this close to the newest one belong to the same night. */
const SAME_NIGHT_MS = 6 * 3600 * 1000

const WHEN = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

/**
 * Summarises the latest night.
 *
 * @param {{sources?: Array<{name: string, kind: string, last_run: {finished_at: string, ok: boolean|null}|null}>}} status
 *   `GET /api/physical/status`.
 * @param {{radar?: string|null, discover?: string|null}} generated The two
 *   kinds' last generate times.
 * @param {number} [now] Milliseconds since the epoch.
 * @returns {{catalogueAt: number|null, failed: string[], stale: boolean, radarAt: string|null, discoverAt: string|null}}
 */
export function lastNightly(status, generated, now = Date.now()) {
  const runs = (status?.sources ?? []).filter(
    (source) => NIGHTLY_KINDS.has(source.kind) && source.last_run?.finished_at,
  )
  const times = runs.map((source) => Date.parse(source.last_run.finished_at))
  const catalogueAt = times.length ? Math.max(...times) : null
  const failed = runs
    .filter(
      (source, index) =>
        catalogueAt - times[index] <= SAME_NIGHT_MS &&
        source.last_run.ok === false,
    )
    .map((source) => source.name)
  return {
    catalogueAt,
    failed,
    stale: catalogueAt === null || now - catalogueAt > STALE_HOURS * 3600 * 1000,
    radarAt: generated?.radar ?? null,
    discoverAt: generated?.discover ?? null,
  }
}

/**
 * The line as the admin landing shows it.
 *
 * @param {ReturnType<typeof lastNightly>} summary
 * @returns {string}
 */
export function nightlyWords(summary) {
  if (summary.catalogueAt === null)
    return 'Nightly may have stopped: no catalogue run yet'
  const parts = [
    `catalogue ${WHEN.format(summary.catalogueAt)}`,
    summary.failed.length ? `failed: ${summary.failed.join(', ')}` : 'ok',
  ]
  if (summary.radarAt) parts.push(`Radar ${WHEN.format(Date.parse(summary.radarAt))}`)
  if (summary.discoverAt)
    parts.push(`Discover ${WHEN.format(Date.parse(summary.discoverAt))}`)
  const lead = summary.stale ? 'Nightly may have stopped' : 'Last nightly'
  return `${lead}: ${parts.join(' · ')}`
}
```

- [ ] **Step 4: Run, expect pass**

Run: `cd frontend && npx vitest run src/lib/nightly.test.js` → PASS.

- [ ] **Step 5: Write the failing component test** (append to `Admin.test.jsx`)

```js
describe('Admin last nightly line', () => {
  function stubApi(statusBody) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url) => {
        const path = String(url)
        if (path.endsWith('/api/auth/me'))
          return { ok: true, status: 200, json: async () => ({ email: 'a@b.c' }) }
        if (path.endsWith('/api/physical/status'))
          return { ok: true, status: 200, json: async () => statusBody }
        return { ok: true, status: 200, json: async () => ({ generated_at: null }) }
      }),
    )
  }

  it('shows the latest run once signed in', async () => {
    stubApi({
      sources: [
        {
          source: 'lrg',
          name: 'Limited Run',
          kind: 'store',
          last_run: { finished_at: new Date().toISOString(), ok: false },
        },
      ],
    })
    renderAt()
    expect(await screen.findByText(/failed: Limited Run/)).toBeInTheDocument()
  })

  it('says the job may have stopped when nothing has run', async () => {
    stubApi({ sources: [] })
    renderAt()
    expect(
      await screen.findByText(/Nightly may have stopped/),
    ).toBeInTheDocument()
  })
})
```

- [ ] **Step 6: Implement** `components/LastNightly.jsx`

```jsx
import { useEffect, useState } from 'react'
import { apiFetch } from '../lib/api.js'
import { lastNightly, nightlyWords } from '../lib/nightly.js'

/**
 * One muted line on the admin landing: when the nightly job last refreshed
 * the catalogue, and whether it failed. Silent when the status cannot be
 * read; the page's other links still work.
 */
export default function LastNightly() {
  const [words, setWords] = useState(null)

  useEffect(() => {
    let live = true
    async function load() {
      try {
        const [status, radar, discover] = await Promise.all([
          apiFetch('/api/physical/status'),
          apiFetch('/api/recommendations?kind=radar'),
          apiFetch('/api/recommendations?kind=discover'),
        ])
        if (!status.ok) return
        const generated = {
          radar: radar.ok ? (await radar.json()).generated_at : null,
          discover: discover.ok ? (await discover.json()).generated_at : null,
        }
        const summary = lastNightly(await status.json(), generated)
        if (live) setWords(nightlyWords(summary))
      } catch {
        // Unreachable API: the landing's other links still work.
      }
    }
    load()
    return () => {
      live = false
    }
  }, [])

  if (!words) return null
  return <p className="muted last-nightly">{words}</p>
}
```

In `Admin.jsx`, import it and render `<LastNightly />` as the first child of
the `status === 'signed-in'` fragment, before the "Signed in as" paragraph.

- [ ] **Step 7: Run, expect pass; then the suite and the build**

Run: `cd frontend && npx vitest run src/pages/Admin.test.jsx src/lib/nightly.test.js && npm test && npm run build`
Expected: PASS. Run Prettier and ESLint on all four files.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/lib/nightly.js frontend/src/lib/nightly.test.js frontend/src/components/LastNightly.jsx frontend/src/pages/Admin.jsx frontend/src/pages/Admin.test.jsx
git commit -m "feat(admin): last nightly line on the admin landing

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 4: Declare `JOB_TOKEN` (Zone 2, infra)

**Files:**
- Modify: `render.yaml` (the API service's `envVars`, beside `LLM_PROVIDER`)
- Modify: `backend/env.example`

- [ ] **Step 1: Edit `render.yaml`**

```yaml
      # The nightly workflow's bearer token (.github/workflows/nightly.yml).
      # Opens only items.JOB_ROUTES. Unset: the job's calls are 401s.
      - key: JOB_TOKEN
        sync: false
```

- [ ] **Step 2: Edit `backend/env.example`** (at the end)

```sh
# Bearer token for the nightly GitHub Actions job; the same value is the
# repository secret JOB_TOKEN. Opens only items.JOB_ROUTES. Generate with:
#   python3 -c "import secrets; print(secrets.token_urlsafe(32))"
# JOB_TOKEN=
```

- [ ] **Step 3: Verify** that the YAML parses: `ruby -ryaml -e 'YAML.load_file("render.yaml"); puts "ok"'` → `ok`.

- [ ] **Step 4: Commit**

```bash
git add render.yaml backend/env.example
git commit -m "chore(render): declare JOB_TOKEN

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 5: `nightly.yml` replaces `snapshot.yml` (Zone 2, infra)

**Files:**
- Create: `.github/workflows/nightly.yml`
- Delete: `.github/workflows/snapshot.yml`
- Modify: `README.md` (`## Collection snapshot`: the workflow paragraph; add a `### Nightly job` subsection)

- [ ] **Step 1: Write `nightly.yml`**

```yaml
name: Nightly

# Does every night what the owner otherwise presses by hand, then keeps the
# build-time snapshot within a day of production (Spine Next spec, A3).
# Replaces snapshot.yml, whose compare and deploy steps are kept verbatim.
#
# It writes: Play Next picks, the catalogue refreshes, Resolve and the Radar
# and Discover generates, through the admin API with the JOB_TOKEN bearer
# token, which the backend accepts only on items.JOB_ROUTES. A failed write
# step is a warning: the steps after it run on yesterday's data, and the
# summary and the /admin "Last nightly" line say which one failed.
#
# GitHub disables scheduled workflows in a public repository after 60 days
# with no repository activity, and this job never commits. Re-enable it
# under Actions -> Nightly; /admin says "Nightly may have stopped" after 36h.
on:
  schedule:
    # 00:17 UTC: 18:17 in Denver in summer, 17:17 in winter. Off the hour:
    # GitHub delays scheduled runs at the top of the hour.
    - cron: '17 0 * * *'
  workflow_dispatch:
    inputs:
      discover:
        description: Generate a Discover batch even if it is not Sunday night
        type: boolean
        default: false

permissions:
  contents: read

concurrency:
  group: nightly
  cancel-in-progress: false

env:
  SITE_URL: https://joey-haas.dev
  API_URL: https://api.joey-haas.dev

jobs:
  nightly:
    runs-on: ubuntu-latest
    # The store walk is the long step (up to an hour); Render allows a
    # request 100 minutes.
    timeout-minutes: 150
    steps:
      - name: Wake the API
        run: |
          # Each attempt is at most 10 s of curl plus 5 s of sleep, so 24
          # attempts stay inside six minutes.
          for attempt in $(seq 1 24); do
            if curl -fsS -m 10 "$API_URL/api/health" > /dev/null; then
              echo "API awake after $attempt attempt(s)"
              exit 0
            fi
            sleep 5
          done
          echo "::error::The API did not wake within six minutes"
          exit 1

      - name: Refresh the picks, the catalogue and the suggestions
        id: refresh
        env:
          JOB_TOKEN: ${{ secrets.JOB_TOKEN }}
          # The inputs context keeps a boolean a boolean; on a schedule it is
          # empty, which is not "true".
          FORCE_DISCOVER: ${{ inputs.discover }}
        run: |
          if [ -z "$JOB_TOKEN" ]; then
            echo "::error::The JOB_TOKEN secret is not set; nothing was refreshed"
            echo "token=missing" >> "$GITHUB_OUTPUT"
            exit 0
          fi
          echo "token=present" >> "$GITHUB_OUTPUT"
          failed=""
          # call NAME TIMEOUT PATH [BODY]: POSTs BODY (default {}), keeps the
          # response in NAME.json, and records anything but a 2xx as a
          # warning. It always returns 0, so one failed step never stops the
          # ones after it (the shell is bash -e).
          call() {
            local name="$1" timeout="$2" path="$3" body="${4:-{\}}" status
            status=$(curl -sS -m "$timeout" -o "$name.json" -w '%{http_code}' \
              -X POST -H "Authorization: Bearer $JOB_TOKEN" \
              -H 'Content-Type: application/json' -d "$body" \
              "$API_URL$path") || status=000
            case "$status" in
              200 | 201) echo "$name: ok" ;;
              409)
                echo "::warning::$name: the catalogue was busy (409), skipped"
                failed="$failed $name"
                ;;
              *)
                echo "::warning::$name: HTTP $status"
                failed="$failed $name"
                ;;
            esac
            return 0
          }
          if [ "$(date -u +%u)" = 1 ]; then weekly=true; else weekly=false; fi

          # Three picks recorded as shown today (UTC). /api/public/picks and
          # /api/public/next publish them after the next UTC midnight, so
          # each run publishes yesterday's picks and records today's.
          call picks 120 /api/picker/next
          call registry 900 /api/physical/refresh-registry
          call stores 3600 /api/physical/refresh
          # Weekly: Sunday evening in Denver is Monday in UTC.
          if [ "$weekly" = true ]; then
            call switch1 1800 /api/physical/refresh-switch1
          fi
          # Resolve while it is making progress, at most five rounds.
          previous=""
          for round in 1 2 3 4 5; do
            call "resolve-$round" 600 /api/physical/resolve
            remaining=$(jq -r '.unresolved_remaining // empty' "resolve-$round.json" 2> /dev/null || true)
            if [ -z "$remaining" ] || [ "$remaining" = 0 ]; then break; fi
            if [ -n "$previous" ] && [ "$remaining" -ge "$previous" ]; then break; fi
            previous="$remaining"
          done
          call radar 900 /api/recommendations/generate '{"kind":"radar"}'
          if [ "$weekly" = true ] || [ "$FORCE_DISCOVER" = true ]; then
            call discover 300 /api/recommendations/generate '{"kind":"discover"}'
          fi
          echo "failed=${failed# }" >> "$GITHUB_OUTPUT"

      # COPY the "Compare the API with the deployed snapshot" step from
      # snapshot.yml exactly, with two edits:
      #   1. the loop reads: for name in items stats picks radar next; do
      #   2. the comment's "picks and radar are optional" becomes
      #      "picks, radar and next are optional", plus one added line:
      #      "next carries generated_at times, so it differs every night and
      #      the static site redeploys nightly; that is intended (spec K8)."
      # The fail() case already treats every name but items and stats as
      # optional, so it needs no change.

      # COPY "Trigger a static-site deploy" and "Report no change" from
      # snapshot.yml exactly.

      - name: Summarise
        if: always()
        env:
          TOKEN: ${{ steps.refresh.outputs.token }}
          FAILED: ${{ steps.refresh.outputs.failed }}
        run: |
          if [ "$TOKEN" = missing ]; then
            echo "Nightly: the JOB_TOKEN secret is missing; nothing was refreshed" >> "$GITHUB_STEP_SUMMARY"
            exit 1
          fi
          if [ -n "$FAILED" ]; then
            echo "Nightly: these steps failed and later steps used yesterday's data: $FAILED" >> "$GITHUB_STEP_SUMMARY"
          else
            echo "Nightly: every refresh and generate step succeeded" >> "$GITHUB_STEP_SUMMARY"
          fi
```

When you write the file, replace the two `# COPY` comment blocks with the
steps themselves, copied from `snapshot.yml` with the edits listed. The final
file contains no `# COPY` comments.

Note `body="${4:-{\}}"`: inside `${…:-…}` an unescaped `}` ends the
expansion. Verify it in Step 2. If it is awkward, use
`body="$4"; [ -n "$body" ] || body='{}'`.

- [ ] **Step 2: Verify the syntax**

```bash
ruby -ryaml -e 'YAML.load_file(".github/workflows/nightly.yml"); puts "yaml ok"'
ruby -ryaml -e 'w = YAML.load_file(".github/workflows/nightly.yml"); w["jobs"]["nightly"]["steps"].each_with_index { |s, i| File.write("/tmp/claude-step-#{i}.sh", s["run"]) if s["run"] }'
for f in /tmp/claude-step-*.sh; do bash -n "$f" && echo "$f ok"; done
rm -f /tmp/claude-step-*.sh
```

Expected: `yaml ok` and every step `ok`. Write those temporary files to the
session scratchpad directory, not `/tmp`. Then check the helper in isolation:

```bash
bash -c 'body="${4:-{\}}"; echo "$body"' _ a b c
```

Expected: `{}`.

- [ ] **Step 3: Delete `snapshot.yml`** with `git rm .github/workflows/snapshot.yml`.

- [ ] **Step 4: README.** In `## Collection snapshot`, replace the sentence
that names `snapshot.yml` with `nightly.yml`. Add a `### Nightly job`
subsection after it covering:
  - the order of calls (picks → registry → stores → Switch 1 on Sunday
    evenings → resolve × ≤5 → Radar → Discover on Sunday evenings or with
    the `discover` input → compare → deploy hook);
  - `JOB_TOKEN` on Render and as the repository secret;
  - the whitelist (`items.JOB_ROUTES`, pinned by `tests/test_job_token.py`);
  - the pick lag;
  - that a failed step is a warning;
  - the 60-day switch-off and how to re-enable it;
  - the "Last nightly" line.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/nightly.yml .github/workflows/snapshot.yml README.md
git commit -m "ci: nightly job replaces the snapshot workflow

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

# PR B — What's next (branch `spine-next-page`)

Before Task 6: `git switch -c spine-next-page main` (or branch from
`spine-next-nightly` if PR A hasn't merged), then record the zone-start SHA.

### Task 6: `next_list.py` — sections and dates (pure)

**Files:**
- Create: `backend/next_list.py`
- Create: `backend/tests/test_next_list.py`
- Modify: `backend/tests/test_physical_imports.py:24-25` (add `"next_list"` to `PURE_MODULES` and `TOP_LEVEL`)

**Interfaces:**
- Produces:
  - `NextCandidate(kind: str, igdb_id: str, platform_id: int, platform: str | None, title: str, physical_format: str | None, lane: str | None, release_date: date | None, release_precision: str | None, release_source: str | None, score: int, rank: int | None = None, payload: object = None)`. **(Refines spec:** `igdb_id` is the row's `external_id` string, and the display fields (cover, URL, genres, `based_on`) travel in `payload`, the caller's `Recommendation`, rather than on the dataclass.)
  - `NextEntry(candidate: NextCandidate, top_pick: bool, new: bool, date_shown: date | None)`.
  - `sections(candidates: list[NextCandidate], today: date, *, public: bool) -> dict[str, list[NextEntry]]` with keys `SECTIONS = ("buy_now", "preorders", "later", "not_on_cartridge")`.
  - `period_end(released: date, precision: str | None) -> date`.
  - Constants `PREORDER_DAYS = 90`, `NEW_DAYS = 30`, `LATER_CAP = 12`, `NOT_ON_CARTRIDGE_CAP = 12`, `PUBLIC_DATE_SOURCES = frozenset({"registry"})`.

- [ ] **Step 1: Write the failing tests** — `tests/test_next_list.py`

```python
"""What's next sectioning (Spine Next spec, B6). Pure: no database.

The rules were AdminStoreList.jsx's radarSection/buildList/periodEnd; their
cases moved here when the page started reading the server's sections.
"""

from datetime import date, timedelta

from next_list import (
    LATER_CAP,
    NOT_ON_CARTRIDGE_CAP,
    NextCandidate,
    period_end,
    sections,
)

TODAY = date(2026, 10, 4)


def cand(n, **fields) -> NextCandidate:
    base = dict(
        kind="radar",
        igdb_id=str(n),
        platform_id=508,
        platform="Nintendo Switch 2",
        title=f"Game {n}",
        physical_format="game_card",
        lane="dated",
        release_date=date(2026, 9, 1),
        release_precision="day",
        release_source="registry",
        score=50,
    )
    return NextCandidate(**{**base, **fields})


def titles(entries):
    return [entry.candidate.title for entry in entries]


def test_period_end_covers_month_quarter_year_and_day():
    assert period_end(date(2026, 2, 1), "month") == date(2026, 2, 28)
    assert period_end(date(2026, 4, 1), "quarter") == date(2026, 6, 30)
    assert period_end(date(2026, 1, 1), "year") == date(2026, 12, 31)
    assert period_end(date(2026, 3, 9), None) == date(2026, 3, 9)


def test_a_released_cartridge_is_buy_now_and_a_discover_pick_is_a_top_pick():
    out = sections(
        [cand(1), cand(2, kind="discover", lane=None, rank=0)], TODAY, public=False
    )
    assert titles(out["buy_now"]) == ["Game 2", "Game 1"]
    assert [entry.top_pick for entry in out["buy_now"]] == [True, False]


def test_a_month_dated_cartridge_is_not_out_until_the_month_ends():
    month = cand(1, release_date=date(2026, 10, 1), release_precision="month")
    out = sections([month], TODAY, public=False)
    assert titles(out["preorders"]) == ["Game 1"]


def test_preorders_are_within_ninety_days_soonest_first():
    near = cand(1, release_date=TODAY + timedelta(days=60))
    nearer = cand(2, release_date=TODAY + timedelta(days=10))
    far = cand(3, release_date=TODAY + timedelta(days=120))
    quarter = cand(4, release_date=date(2026, 10, 1), release_precision="quarter")
    out = sections([near, nearer, far, quarter], TODAY, public=False)
    assert titles(out["preorders"]) == ["Game 2", "Game 1"]
    assert titles(out["later"]) == ["Game 4", "Game 3"]


def test_digital_and_key_cards_are_not_on_cartridge():
    out = sections(
        [
            cand(1, lane="digital", physical_format=None),
            cand(2, physical_format="game_key_card"),
            cand(3, physical_format="code_in_box"),
        ],
        TODAY,
        public=False,
    )
    assert sorted(titles(out["not_on_cartridge"])) == ["Game 1", "Game 2", "Game 3"]


def test_later_and_not_on_cartridge_are_capped():
    far = [cand(n, release_date=TODAY + timedelta(days=200 + n)) for n in range(20)]
    digital = [cand(100 + n, lane="digital", physical_format=None) for n in range(20)]
    out = sections(far + digital, TODAY, public=False)
    assert len(out["later"]) == LATER_CAP
    assert len(out["not_on_cartridge"]) == NOT_ON_CARTRIDGE_CAP


def test_dedupe_is_by_game_and_platform_not_title():
    same_title = [cand(1, title="Twin"), cand(2, title="Twin")]
    both_lists = [cand(3, kind="discover", lane=None), cand(3)]
    other_platform = [cand(4), cand(4, platform_id=130, platform="Nintendo Switch")]
    out = sections(same_title + both_lists + other_platform, TODAY, public=False)
    keys = [(e.candidate.igdb_id, e.candidate.platform_id) for e in out["buy_now"]]
    assert sorted(keys) == sorted(
        [("1", 508), ("2", 508), ("3", 508), ("4", 508), ("4", 130)]
    )
    assert next(e for e in out["buy_now"] if e.candidate.igdb_id == "3").top_pick


def test_an_unreleased_discover_pick_is_dropped():
    out = sections(
        [cand(1, kind="discover", lane=None, release_date=TODAY + timedelta(days=5))],
        TODAY,
        public=False,
    )
    assert all(not entries for entries in out.values())


def test_new_is_a_cartridge_released_in_the_last_thirty_days():
    fresh = cand(1, release_date=TODAY - timedelta(days=30))
    old = cand(2, release_date=TODAY - timedelta(days=31))
    out = sections([fresh, old], TODAY, public=False)
    assert {e.candidate.title: e.new for e in out["buy_now"]} == {
        "Game 1": True,
        "Game 2": False,
    }


def test_public_mode_uses_registry_dates_only():
    store_soon = cand(1, release_source="store", release_date=TODAY + timedelta(days=20))
    store_out = cand(2, release_source="store")
    registry_soon = cand(3, release_date=TODAY + timedelta(days=30))
    far = cand(4, release_date=TODAY + timedelta(days=200))
    admin = sections([store_soon, store_out, registry_soon, far], TODAY, public=False)
    public = sections([store_soon, store_out, registry_soon, far], TODAY, public=True)
    assert titles(admin["preorders"]) == ["Game 1", "Game 3"]
    assert titles(public["preorders"]) == ["Game 3"]
    # Store-only dates count as undated: last in Later, no date shown.
    assert titles(public["later"]) == ["Game 4", "Game 1", "Game 2"]
    assert [e.date_shown for e in public["later"]][1:] == [None, None]


def test_public_buy_now_shows_registry_dates_and_never_a_discover_date():
    out = sections(
        [cand(1), cand(2, kind="discover", lane=None)], TODAY, public=True
    )
    shown = {e.candidate.title: e.date_shown for e in out["buy_now"]}
    assert shown == {"Game 1": date(2026, 9, 1), "Game 2": None}


def test_a_cartridge_with_no_date_goes_last_in_later():
    out = sections(
        [cand(1, release_date=None), cand(2, release_date=TODAY + timedelta(days=200))],
        TODAY,
        public=False,
    )
    assert titles(out["later"]) == ["Game 2", "Game 1"]


def test_an_unknown_format_is_left_out():
    out = sections([cand(1, physical_format=None, lane="dated")], TODAY, public=False)
    assert all(not entries for entries in out.values())
```

- [ ] **Step 2: Run, expect failure** — `cd backend && ./.venv/bin/pytest tests/test_next_list.py -v` → `ModuleNotFoundError: next_list`.

- [ ] **Step 3: Implement** `backend/next_list.py`

```python
"""What's next: pending Discover picks and Radar rows, sectioned as a store
visit reads them. Pure: no FastAPI, no SQLAlchemy (tests/test_physical_imports.py).

One sectioning authority for `/spine/next` (public=True) and
`/admin/store-list` (public=False), so the two pages cannot disagree about
a section except by one rule: in public mode only a registry date counts,
because a store's date is store data (Spine Next spec, K5, S4). The rules
were AdminStoreList.jsx's radarSection, buildList and periodEnd.
"""

from __future__ import annotations

import calendar
from dataclasses import dataclass
from datetime import date, timedelta

from radar import KEY_CARD_FORMATS, NEAR_PRECISIONS

PREORDER_DAYS = 90
NEW_DAYS = 30
LATER_CAP = 12
NOT_ON_CARTRIDGE_CAP = 12
FULL_CARTRIDGE = "game_card"
# Release sources whose date may be shown publicly. A store's date is store
# data; IGDB's first date is for any platform. "igdb_platform" joins this
# set only if E21 shows the registry leaves most rows undated (spec, B9).
PUBLIC_DATE_SOURCES = frozenset({"registry"})
SECTIONS = ("buy_now", "preorders", "later", "not_on_cartridge")


@dataclass(frozen=True)
class NextCandidate:
    """A pending suggestion, as sectioning reads it. `payload` is the
    caller's row, carried through untouched."""

    kind: str  # "discover" | "radar"
    igdb_id: str
    platform_id: int
    platform: str | None
    title: str
    physical_format: str | None
    lane: str | None  # Radar's "preorder" | "dated" | "digital"; None for Discover
    release_date: date | None
    release_precision: str | None
    release_source: str | None
    score: int
    rank: int | None = None  # Discover's batch order
    payload: object = None


@dataclass(frozen=True)
class NextEntry:
    candidate: NextCandidate
    top_pick: bool
    new: bool
    date_shown: date | None


def period_end(released: date, precision: str | None) -> date:
    """The last day of a release's period. A month, quarter or year is stored
    as the period's first day, so a game dated that way is not out until the
    whole period has ended. No precision means a day."""
    if precision == "month":
        return released.replace(day=calendar.monthrange(released.year, released.month)[1])
    if precision == "quarter":
        month = ((released.month - 1) // 3 + 1) * 3
        return date(released.year, month, calendar.monthrange(released.year, month)[1])
    if precision == "year":
        return date(released.year, 12, 31)
    return released


def _usable_date(candidate: NextCandidate, public: bool) -> date | None:
    """The date sectioning may use: any in admin mode, a public one in public."""
    if public and candidate.release_source not in PUBLIC_DATE_SOURCES:
        return None
    return candidate.release_date


def _released(when: date | None, precision: str | None, today: date) -> bool:
    return when is not None and period_end(when, precision) <= today


def _is_new(candidate: NextCandidate, today: date) -> bool:
    """A full cartridge out within the last NEW_DAYS, from any known date:
    a boolean leaks nothing a date would."""
    when = candidate.release_date
    return (
        candidate.physical_format == FULL_CARTRIDGE
        and _released(when, candidate.release_precision, today)
        and (today - when).days <= NEW_DAYS
    )


def _best_first(candidate: NextCandidate) -> tuple:
    return (
        candidate.rank if candidate.rank is not None else 99,
        -candidate.score,
        candidate.title,
        candidate.platform_id,
        candidate.igdb_id,
    )


def sections(
    candidates: list[NextCandidate], today: date, *, public: bool
) -> dict[str, list[NextEntry]]:
    """Discover picks and Radar rows as What's next's sections.

    Buy now: released Discover picks (top picks, batch order), then released
    full cartridges, best first. Pre-orders: day- or month-dated cartridges
    within PREORDER_DAYS, soonest first. Later: the rest of the dated
    cartridges, soonest first, then undated ones, capped. Not on cartridge:
    digital-only, Game-Key Card and code-in-a-box rows, best first, capped.
    One row per (game, platform), Discover first; an unreleased Discover
    pick and a row of unknown format are left out.
    """
    out: dict[str, list[NextEntry]] = {key: [] for key in SECTIONS}
    seen: set[tuple[str, int]] = set()
    dated_later: list[tuple[date, NextEntry]] = []
    undated: list[NextEntry] = []
    preorders: list[tuple[date, NextEntry]] = []

    for candidate in sorted(
        (c for c in candidates if c.kind == "discover"), key=_best_first
    ):
        key = (candidate.igdb_id, candidate.platform_id)
        if key in seen or not _released(
            candidate.release_date, candidate.release_precision, today
        ):
            continue
        seen.add(key)
        out["buy_now"].append(
            NextEntry(
                candidate,
                top_pick=True,
                new=_is_new(candidate, today),
                date_shown=None if public else candidate.release_date,
            )
        )

    for candidate in sorted(
        (c for c in candidates if c.kind == "radar"), key=_best_first
    ):
        key = (candidate.igdb_id, candidate.platform_id)
        if key in seen:
            continue
        if candidate.lane == "digital" or candidate.physical_format in KEY_CARD_FORMATS:
            seen.add(key)
            out["not_on_cartridge"].append(NextEntry(candidate, False, False, None))
            continue
        if candidate.physical_format != FULL_CARTRIDGE:
            continue
        seen.add(key)
        when = _usable_date(candidate, public)
        precision = candidate.release_precision
        if when is None:
            undated.append(NextEntry(candidate, False, False, None))
        elif _released(when, precision, today):
            out["buy_now"].append(
                NextEntry(candidate, False, _is_new(candidate, today), when)
            )
        elif (precision in NEAR_PRECISIONS or precision is None) and when <= today + timedelta(
            days=PREORDER_DAYS
        ):
            preorders.append((when, NextEntry(candidate, False, False, when)))
        else:
            dated_later.append((when, NextEntry(candidate, False, False, when)))

    out["preorders"] = [entry for _, entry in sorted(preorders, key=lambda p: p[0])]
    later = [entry for _, entry in sorted(dated_later, key=lambda p: p[0])] + undated
    out["later"] = later[:LATER_CAP]
    out["not_on_cartridge"] = out["not_on_cartridge"][:NOT_ON_CARTRIDGE_CAP]
    return out
```

`sorted` is stable, so ties on a date keep best-first order. In
`tests/test_physical_imports.py`, add `"next_list"` to the extra list on line
24 and to `TOP_LEVEL` on line 25.

- [ ] **Step 4: Run, expect pass** —
  `./.venv/bin/pytest tests/test_next_list.py tests/test_physical_imports.py -v` →
  PASS, then ruff.

- [ ] **Step 5: Commit**

```bash
git add backend/next_list.py backend/tests/test_next_list.py backend/tests/test_physical_imports.py
git commit -m "feat(tracker): pure What's next sectioning

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 7: `next_list.py` — public reasons (pure)

**Files:**
- Modify: `backend/next_list.py` (append)
- Modify: `backend/tests/test_next_list.py` (append)

**Interfaces:**
- Consumes: `picker.reference_weights`, `picker.attribute_table`, `picker.similarity`, `picker.PickerItem`, `radar._taste_reasons`, `radar._picker_item`.
- Produces:
  - `PublicTaste(weights, references, table, public_ids: frozenset[str], private_titles: tuple[str, ...], shelf_genres: frozenset[str])`.
  - `public_taste(public_profile: list[PickerItem], private_titles: list[str]) -> PublicTaste`.
  - `catalogue_item(igdb_id: str, title: str, snapshot: dict, platform_id: int, released: date | None) -> PickerItem`.
  - `public_reasons_for(kind: str, stored: list[str], model_written: bool, based_on: list[str], item: PickerItem, taste: PublicTaste) -> list[str]`.
  - `MAX_PUBLIC_REASONS = 2`.

- [ ] **Step 1: Write the failing tests** (append)

```python
from picker import PickerItem
from next_list import (
    MAX_PUBLIC_REASONS,
    catalogue_item,
    public_reasons_for,
    public_taste,
)


def owned(item_id, title, **fields) -> PickerItem:
    base = dict(
        id=item_id, title=title, type="game", status="finished", owned=True,
        rating=9, favorite=False, pinned=False, external_id=None, year=2020,
        cover_url=None, platform_id=130, platform="Nintendo Switch", creator=None,
        genres=("Adventure",), themes=("Mystery",), keywords=("detective",),
        game_modes=(), player_perspectives=(), similar_games=(),
        community_score=None, time_to_beat_hours=None,
        release_date=None, acquired_at=None, started_at=None,
    )
    return PickerItem(**{**base, **fields})


SNAPSHOT = {"genres": ["Adventure"], "themes": ["Mystery"], "keywords": ["detective"]}


def test_model_text_survives_only_when_it_cites_public_games():
    taste = public_taste([owned("pub", "Public Game")], ["Secret Game"])
    item = catalogue_item("9", "New", SNAPSHOT, 508, None)
    kept = public_reasons_for(
        "discover", ["Like Public Game, I'd enjoy this"], True, ["pub"], item, taste
    )
    assert kept == ["Like Public Game, I'd enjoy this"]
    dropped = public_reasons_for(
        "discover", ["Like Secret Game"], True, ["priv"], item, taste
    )
    assert dropped != ["Like Secret Game"]


def test_model_text_naming_an_uncited_private_game_is_replaced():
    taste = public_taste([owned("pub", "Public Game")], ["Secret Game"])
    item = catalogue_item("9", "New", SNAPSHOT, 508, None)
    reasons = public_reasons_for(
        "discover", ["Pairs with Secret Game nicely"], True, ["pub"], item, taste
    )
    assert all("Secret Game" not in reason for reason in reasons)


def test_radar_text_is_never_read_and_never_leaks_a_store():
    taste = public_taste([owned("pub", "Public Game")], [])
    item = catalogue_item("9", "New", SNAPSHOT, 508, None)
    stored = ["Pre-orders close Nov 8 at Limited Run Games · $59.99", "which you rated 10"]
    reasons = public_reasons_for("radar", stored, False, ["pub"], item, taste)
    joined = " ".join(reasons)
    assert "Pre-orders close" not in joined and "$" not in joined
    assert "you" not in joined.lower().split()


def test_no_surviving_reason_falls_back_to_a_genre_line_from_the_shelf():
    taste = public_taste([owned("pub", "Public Game", rating=None, status="backlog")], [])
    item = catalogue_item("9", "New", {"genres": ["Adventure", "Puzzle"]}, 508, None)
    assert public_reasons_for("radar", [], False, [], item, taste) == [
        "Shares Adventure with games on my shelf"
    ]


def test_no_genre_on_the_shelf_means_no_reason():
    taste = public_taste([], [])
    item = catalogue_item("9", "New", {"genres": ["Racing"]}, 508, None)
    assert public_reasons_for("radar", [], False, [], item, taste) == []


def test_public_reasons_are_capped_and_first_person():
    taste = public_taste([owned("pub", "Public Game")], [])
    item = catalogue_item("9", "New", SNAPSHOT, 508, None)
    reasons = public_reasons_for(
        "discover", ["Your kind of game", "x"], True, ["pub"], item, taste
    )
    assert len(reasons) <= MAX_PUBLIC_REASONS
    assert all("your" not in reason.lower().split() for reason in reasons)
```

- [ ] **Step 2: Run, expect failure** (ImportError).

- [ ] **Step 3: Implement** (append to `next_list.py`, and add to the imports
at the top: `import re`, `from picker import PickerItem, attribute_table,
reference_weights, similarity`, `from radar import _picker_item,
_taste_reasons`)

```python
MAX_PUBLIC_REASONS = 2
_SECOND_PERSON = re.compile(r"\b(you|your|yours)\b", re.IGNORECASE)


@dataclass(frozen=True)
class PublicTaste:
    """Play Next's profile built from public games only, plus what a public
    reason must not name. Every game a rebuilt reason can name is drawn from
    `references`, so a private game is never named (as picker.public_reasons)."""

    weights: dict[str, float]
    references: list[PickerItem]
    table: dict[tuple[str, str], float]
    public_ids: frozenset[str]
    private_titles: tuple[str, ...]
    shelf_genres: frozenset[str]


def public_taste(public_profile: list[PickerItem], private_titles: list[str]) -> PublicTaste:
    weights = reference_weights(public_profile)
    references = [item for item in public_profile if item.id in weights]
    return PublicTaste(
        weights=weights,
        references=references,
        table=attribute_table(public_profile, weights) if references else {},
        public_ids=frozenset(item.id for item in public_profile),
        private_titles=tuple(title for title in private_titles if title.strip()),
        shelf_genres=frozenset(g for item in public_profile for g in item.genres),
    )


def catalogue_item(
    igdb_id: str, title: str, snapshot: dict, platform_id: int, released: date | None
) -> PickerItem:
    """A pending suggestion as the scorer reads it, from its stored snapshot."""
    return _picker_item(igdb_id, title, snapshot or {}, platform_id, released)


def _names_private_game(text: str, taste: PublicTaste) -> bool:
    return any(
        re.search(rf"(?<!\w){re.escape(title)}(?!\w)", text, re.IGNORECASE)
        for title in taste.private_titles
    )


def _model_text_allowed(stored: list[str], based_on: list[str], taste: PublicTaste) -> bool:
    """Discover's model text may be public when every game it cites is
    public, it names no private game it did not cite, and it is first person."""
    text = "\n".join(stored)
    return (
        bool(stored)
        and all(ref in taste.public_ids for ref in based_on)
        and not _names_private_game(text, taste)
        and not _SECOND_PERSON.search(text)
    )


def _rebuilt(item: PickerItem, taste: PublicTaste) -> list[str]:
    """Radar's similarity and shared-traits reasons over public games only:
    never the stored text, which holds store windows and prices."""
    if not taste.references:
        return []
    _score, similar_to = similarity(item, taste.references, taste.weights)
    reasons, _based_on = _taste_reasons(
        item, similar_to, taste.references, taste.weights, taste.table
    )
    return [reason for reason in reasons if not _SECOND_PERSON.search(reason)]


def _genre_line(item: PickerItem, taste: PublicTaste) -> str | None:
    shared = [genre for genre in item.genres if genre in taste.shelf_genres][:2]
    if not shared:
        return None
    return f"Shares {' and '.join(shared)} with games on my shelf"


def public_reasons_for(
    kind: str,
    stored: list[str],
    model_written: bool,
    based_on: list[str],
    item: PickerItem,
    taste: PublicTaste,
) -> list[str]:
    """At most two first-person reasons naming public games only (spec, B8):
    Discover's model text when it passes the gate, else reasons rebuilt over
    public games, else one genre line, else none."""
    if kind == "discover" and model_written and _model_text_allowed(stored, based_on, taste):
        reasons = list(stored)
    else:
        reasons = _rebuilt(item, taste)
    if not reasons:
        line = _genre_line(item, taste)
        reasons = [line] if line else []
    return reasons[:MAX_PUBLIC_REASONS]
```

**(Refines spec:)** the genre line names only genres that a public shelf game
also has, so the sentence is true. When none is shared, there is no reason.

If `_picker_item`'s `igdb_id: int` annotation makes ruff complain about
passing a `str`, leave it. Python does not enforce annotations, and the
value only becomes `id=f"igdb:{igdb_id}"` and `external_id=str(igdb_id)`.
Do not change `radar.py`.

- [ ] **Step 4: Run, expect pass**:
  `./.venv/bin/pytest tests/test_next_list.py tests/test_physical_imports.py -v`,
  then ruff.

- [ ] **Step 5: Commit**

```bash
git add backend/next_list.py backend/tests/test_next_list.py
git commit -m "feat(tracker): public reasons rebuilt over public games

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 8: `next_load.py` — the database side

**Files:**
- Create: `backend/next_load.py`
- Create: `backend/tests/test_next_load.py`

**Interfaces:**
- Consumes: `models.Recommendation`, `Item`, `CatalogueRun`; `picker_routes.to_picker_item`; `physical_sources.stores.STORES` (whichever import `recommendations_routes.py` uses for `STORES`; copy it); `next_list.NextCandidate`, `public_taste`.
- Produces:
  - `NextData(candidates: list[NextCandidate], taste: PublicTaste, public_games: list[Item], generated_at: dict[str, datetime | None])`.
  - `load_next(session) -> NextData`.
  - `catalogue_times(session) -> dict[str, datetime | None]` (`stores_at`, `registry_at`).
  - Note: an item is *wanted* when `owned_format == OwnedFormat.NONE`
    (`public.py:212`). There is no `wanted` column.

- [ ] **Step 1: Write the failing tests** — `tests/test_next_load.py`

Copy `_game` from `tests/test_public_outputs.py` (lines ~75-85) and `_radar`
(lines ~380-425) into this file, with imports to match. Then:

```python
async def test_candidates_are_pending_rows_of_both_kinds(sessionmaker_for_test):
    discover = _radar("Pick", kind=RecommendationKind.DISCOVER, source_metadata={"rank": 2})
    answered = _radar("Gone", status=RecommendationStatus.DISMISSED)
    await _add(sessionmaker_for_test, _radar("Coming"), discover, answered)
    async with sessionmaker_for_test() as session:
        data = await load_next(session)
    by_title = {c.title: c for c in data.candidates}
    assert set(by_title) == {"Coming", "Pick"}
    assert by_title["Pick"].kind == "discover" and by_title["Pick"].rank == 2
    assert by_title["Coming"].release_source == "registry"
    assert by_title["Coming"].payload.title == "Coming"


async def test_taste_holds_public_games_and_private_titles(sessionmaker_for_test):
    await _add(
        sessionmaker_for_test,
        _game("Shown", rating=9),
        _game("Hidden", is_public=False),
    )
    async with sessionmaker_for_test() as session:
        data = await load_next(session)
    assert [item.title for item in data.public_games] == ["Shown"]
    assert data.taste.private_titles == ("Hidden",)
    assert len(data.taste.public_ids) == 1


async def test_generated_at_is_each_kinds_last_generation(sessionmaker_for_test):
    await _add(sessionmaker_for_test, _radar("Coming"))
    async with sessionmaker_for_test() as session:
        data = await load_next(session)
    assert data.generated_at["radar"] is not None
    assert data.generated_at["discover"] is None
```

(`generated_at` has a now-default on `Recommendation`, `models.py:621`.)

- [ ] **Step 2: Run, expect failure**.

- [ ] **Step 3: Implement** `backend/next_load.py`

```python
"""What's next's database side: pending suggestions as NextCandidates, and
Play Next's profile split into public and private (Spine Next spec, K9).

Shared by GET /api/public/next and GET /api/recommendations/store-list, so
the two read the same rows the same way. next_list.py decides everything.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from models import (
    CatalogueRun,
    Item,
    ItemType,
    Recommendation,
    RecommendationKind,
    RecommendationStatus,
)
from next_list import NextCandidate, PublicTaste, public_taste
from picker_routes import to_picker_item
from physical_sources.catalogue import latest_runs
from physical_sources.stores import STORES


@dataclass(frozen=True)
class NextData:
    candidates: list[NextCandidate]
    taste: PublicTaste
    public_games: list[Item]
    generated_at: dict[str, datetime | None]


def _candidate(row: Recommendation) -> NextCandidate:
    meta = row.source_metadata or {}
    return NextCandidate(
        kind=row.kind.value,
        igdb_id=row.external_id,
        platform_id=row.platform_id,
        platform=row.platform,
        title=row.title,
        physical_format=row.physical_format.value if row.physical_format else None,
        lane=meta.get("lane"),
        release_date=row.release_date,
        release_precision=meta.get("release_precision"),
        release_source=meta.get("release_source"),
        score=row.score,
        rank=meta.get("rank"),
        payload=row,
    )


async def load_next(session: AsyncSession) -> NextData:
    """Pending Radar and Discover rows, and the games a reason may name."""
    rows = list(
        await session.scalars(
            select(Recommendation)
            .where(Recommendation.status == RecommendationStatus.PENDING)
            .order_by(Recommendation.score.desc(), Recommendation.title)
        )
    )
    games = list(await session.scalars(select(Item).where(Item.type == ItemType.GAME)))
    public_games = [item for item in games if item.is_public]
    taste = public_taste(
        [to_picker_item(item) for item in public_games],
        [item.title for item in games if not item.is_public],
    )
    generated_at = {}
    for kind in RecommendationKind:
        generated_at[kind.value] = await session.scalar(
            select(func.max(Recommendation.generated_at)).where(
                Recommendation.kind == kind
            )
        )
    return NextData(
        candidates=[_candidate(row) for row in rows],
        taste=taste,
        public_games=public_games,
        generated_at=generated_at,
    )


async def catalogue_times(session: AsyncSession) -> dict:
    """Each store's last good run, whatever its latest run did; the stalest
    of those is how old the store data may be (moved from the admin Radar
    list, which now calls this)."""
    registry_run = (await latest_runs(session)).get("nscollectors")
    store_times = list(
        await session.scalars(
            select(func.max(CatalogueRun.finished_at))
            .where(CatalogueRun.source.in_(tuple(STORES)), CatalogueRun.ok.is_(True))
            .group_by(CatalogueRun.source)
        )
    )
    return {
        "stores_at": min(store_times, default=None),
        "registry_at": registry_run.finished_at if registry_run else None,
    }
```

(`latest_runs` and `STORES` are the same imports `recommendations_routes.py`
uses, from lines 43–44.) Then add one test,
`test_catalogue_times_is_the_stalest_good_store_run`:
insert two `CatalogueRun`s for two store keys with `ok=True` and different
`finished_at`, plus a newer failed one, and assert `stores_at` is the older
good time.

- [ ] **Step 4: Run, expect pass**. Then the full backend suite and ruff.

- [ ] **Step 5: Commit**

```bash
git add backend/next_load.py backend/tests/test_next_load.py
git commit -m "feat(tracker): load pending suggestions for What's next

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 9: `GET /api/public/next`

**Files:**
- Modify: `backend/public_outputs.py` (models, `public_picks_with_day`, `load_public_next`)
- Modify: `backend/public.py` (import, plus the route after `/radar`)
- Modify: `backend/tests/test_public_outputs.py` (append)

**Interfaces:**
- Consumes: `next_load.load_next`, `catalogue_times`; `next_list.sections`, `catalogue_item`, `public_reasons_for`.
- Produces: the models `PublicTonightCard`, `PublicTonight`, `PublicNextRow`, `PublicNextGenerated`, `PublicNextOut`; `load_public_next(session, now) -> PublicNextOut`; route `GET /api/public/next`.

- [ ] **Step 1: Write the failing tests** (append to `test_public_outputs.py`;
reuse its `client_for`, `_game`, `_radar`, `_add`, `_shown`, `SHOWN_DAY`,
`TODAY` and `clock`)

```python
from public_outputs import PublicNextOut, PublicNextRow

FORBIDDEN = {
    "id", "score", "rank", "hypes", "lane", "store_lines", "format_note",
    "model_note", "ranked_by", "based_on", "based_on_titles", "listing_ids",
    "preorder_closes_at", "price", "store", "url", "status", "batch_id",
}
NEXT_ROW_FIELDS = {
    "title", "platform", "physical_format", "release_date", "release_precision",
    "cover_url", "igdb_url", "reasons", "top_pick", "new", "item_id",
}


def _keys(value):
    if isinstance(value, dict):
        for key, inner in value.items():
            yield key
            yield from _keys(inner)
    elif isinstance(value, list):
        for inner in value:
            yield from _keys(inner)


async def _next(factory) -> dict:
    async with client_for(factory) as client:
        response = await client.get("/api/public/next")
    assert response.status_code == 200
    return response.json()


async def test_the_next_row_model_publishes_exactly_these_fields():
    assert set(PublicNextRow.model_fields) == NEXT_ROW_FIELDS
    assert set(PublicNextOut.model_fields) == {
        "generated_at", "tonight", "wanted", "buy_now", "preorders", "later",
        "not_on_cartridge",
    }


async def test_no_private_key_appears_anywhere(sessionmaker_for_test):
    pinned = _game("Pinned", pinned_at=datetime.now(UTC))
    picked = _game("Picked")
    wanted = _game("Wanted", owned_format=OwnedFormat.NONE,
                   release_date=TODAY + timedelta(days=40))
    _with_ids(pinned, picked, wanted)
    await _add(
        sessionmaker_for_test, pinned, picked, wanted, _shown(picked, SHOWN_DAY),
        _radar("Soon"),
        _radar("Out", release_date=TODAY - timedelta(days=3)),
        _radar("Digital", physical_format=None, source_metadata={"lane": "digital"}),
        _radar("Pick", kind=RecommendationKind.DISCOVER,
               release_date=TODAY - timedelta(days=100)),
    )
    body = await _next(sessionmaker_for_test)
    assert FORBIDDEN.isdisjoint(set(_keys(body)))
    assert body["tonight"]["up_next"]["title"] == "Pinned"
    assert [p["title"] for p in body["tonight"]["picks"]] == ["Picked"]
    assert [w["title"] for w in body["wanted"]] == ["Wanted"]
    assert body["wanted"][0]["item_id"] == str(wanted.id)
    assert {r["title"] for r in body["buy_now"]} == {"Out", "Pick"}
    assert [r["title"] for r in body["preorders"]] == ["Soon"]
    assert [r["title"] for r in body["not_on_cartridge"]] == ["Digital"]


async def test_answered_rows_are_never_published(sessionmaker_for_test):
    await _add(
        sessionmaker_for_test,
        *[_radar(f"Gone {s.value}", status=s) for s in RecommendationStatus
          if s != RecommendationStatus.PENDING],
    )
    body = await _next(sessionmaker_for_test)
    for section in ("buy_now", "preorders", "later", "not_on_cartridge"):
        assert body[section] == []


async def test_stored_radar_reasons_never_reach_the_public(sessionmaker_for_test):
    await _add(
        sessionmaker_for_test,
        _game("Liked", rating=9),
        _radar("Soon", reason="Pre-orders close Nov 8 at Limited Run Games · $59.99\nwhich you rated 10"),
    )
    body = await _next(sessionmaker_for_test)
    text = " ".join(r for row in body["preorders"] for r in row["reasons"])
    assert "Pre-orders" not in text and "$" not in text and " you " not in f" {text} "


async def test_a_discover_reason_citing_a_private_game_is_replaced(sessionmaker_for_test):
    hidden = _game("Hidden Gem", is_public=False, rating=10)
    _with_ids(hidden)
    await _add(
        sessionmaker_for_test, hidden,
        _radar("Pick", kind=RecommendationKind.DISCOVER,
               release_date=TODAY - timedelta(days=100),
               reason="Because I loved Hidden Gem",
               reason_source=ReasonSource.MODEL, based_on=[str(hidden.id)]),
    )
    body = await _next(sessionmaker_for_test)
    assert all("Hidden Gem" not in r for row in body["buy_now"] for r in row["reasons"])


async def test_store_dated_rows_are_undated_and_later(sessionmaker_for_test):
    await _add(
        sessionmaker_for_test,
        _radar("Store", source_metadata={"release_source": "store"}),
    )
    body = await _next(sessionmaker_for_test)
    assert body["preorders"] == []
    assert body["later"][0]["title"] == "Store"
    assert body["later"][0]["release_date"] is None
    assert body["later"][0]["release_precision"] is None


async def test_generated_at_names_the_pick_day(sessionmaker_for_test):
    picked = _game("Picked")
    _with_ids(picked)
    await _add(sessionmaker_for_test, picked, _shown(picked, SHOWN_DAY))
    body = await _next(sessionmaker_for_test)
    assert body["generated_at"]["picks"] == SHOWN_DAY.date().isoformat()
    assert body["tonight"]["up_next"] is None
```

Add `ReasonSource` to the file's `models` import (`OwnedFormat` is already
there).

- [ ] **Step 2: Run, expect failure** (ImportError on `PublicNextOut`).

- [ ] **Step 3: Implement** in `public_outputs.py`

First split `load_public_picks` so the day is available. Rename its body to
`public_picks_with_day(session, now) -> tuple[date | None, list[PublicPickOut]]`:
every `return []` becomes `return None, []`, and the final return becomes
`return day, [...]`. Then:

```python
async def load_public_picks(session: AsyncSession, now: datetime) -> list[PublicPickOut]:
    """(Docstring kept.)"""
    _day, picks = await public_picks_with_day(session, now)
    return picks
```

Then append:

```python
class PublicTonightCard(BaseModel):
    """A public game for tonight: Up next or a recent pick. `item_id`, not
    `id`, so the What's next body carries no key named id (spec, S1)."""

    item_id: uuid.UUID
    type: ItemType
    title: str
    cover_url: str | None
    platform: str | None
    reasons: list[str]


class PublicTonight(BaseModel):
    up_next: PublicTonightCard | None
    picks: list[PublicTonightCard]


class PublicNextRow(BaseModel):
    """A game on What's next. Never a store, price, stock, pre-order window,
    score, rank, lane or recommendation id (spec, B5)."""

    title: str
    platform: str | None
    physical_format: PhysicalFormat | None
    release_date: date | None
    release_precision: str | None
    cover_url: str | None
    igdb_url: str | None
    reasons: list[str]
    top_pick: bool
    new: bool
    item_id: uuid.UUID | None = None


class PublicNextGenerated(BaseModel):
    picks: date | None
    catalogue: datetime | None
    radar: datetime | None
    discover: datetime | None


class PublicNextOut(BaseModel):
    generated_at: PublicNextGenerated
    tonight: PublicTonight
    wanted: list[PublicNextRow]
    buy_now: list[PublicNextRow]
    preorders: list[PublicNextRow]
    later: list[PublicNextRow]
    not_on_cartridge: list[PublicNextRow]


def _next_row(entry: NextEntry, taste: PublicTaste) -> PublicNextRow:
    row = entry.candidate.payload
    meta = row.source_metadata or {}
    snapshot = meta.get("snapshot") if isinstance(meta.get("snapshot"), dict) else {}
    item = catalogue_item(
        row.external_id, row.title, snapshot, row.platform_id, row.release_date
    )
    return PublicNextRow(
        title=row.title,
        platform=row.platform,
        physical_format=row.physical_format,
        release_date=entry.date_shown,
        release_precision=meta.get("release_precision") if entry.date_shown else None,
        cover_url=row.cover_url,
        igdb_url=_igdb_url(meta),
        reasons=public_reasons_for(
            entry.candidate.kind,
            [line for line in (row.reason or "").split("\n") if line],
            row.reason_source == ReasonSource.MODEL,
            [str(ref) for ref in (row.based_on or [])],
            item,
            taste,
        ),
        top_pick=entry.top_pick,
        new=entry.new,
    )


def _tonight_card(row: Item, reasons: list[str]) -> PublicTonightCard:
    return PublicTonightCard(
        item_id=row.id, type=row.type, title=row.title,
        cover_url=row.cover_url, platform=row.platform, reasons=reasons,
    )


async def load_public_next(session: AsyncSession, now: datetime) -> PublicNextOut:
    """What's next for the public (spec, B5): tonight's games, the wanted
    list, and the store sections, built by next_list in public mode."""
    today = now.astimezone(UTC).date()
    day, picks = await public_picks_with_day(session, now)
    data = await load_next(session)
    built = sections(data.candidates, today, public=True)
    pinned = [item for item in data.public_games if item.pinned_at is not None]
    up_next = max(pinned, key=lambda item: item.pinned_at, default=None)
    wanted = sorted(
        # Wanted is "no copy owned", as public.py derives it (line 212).
        (item for item in data.public_games if item.owned_format == OwnedFormat.NONE),
        key=lambda item: (
            item.release_date is None or item.release_date <= today,
            item.release_date or date.max,
            item.title,
        ),
    )
    catalogue = await catalogue_times(session)
    return PublicNextOut(
        generated_at=PublicNextGenerated(
            picks=day,
            catalogue=catalogue["stores_at"],
            radar=data.generated_at.get("radar"),
            discover=data.generated_at.get("discover"),
        ),
        tonight=PublicTonight(
            up_next=_tonight_card(up_next, []) if up_next else None,
            picks=[
                PublicTonightCard(
                    item_id=pick.id, type=pick.type, title=pick.title,
                    cover_url=pick.cover_url, platform=pick.platform,
                    reasons=pick.reasons,
                )
                for pick in picks
            ],
        ),
        wanted=[
            PublicNextRow(
                title=item.title,
                platform=item.platform,
                physical_format=item.physical_format,
                release_date=item.release_date
                if item.release_date and item.release_date > today
                else None,
                release_precision=None,
                cover_url=item.cover_url,
                igdb_url=None,
                reasons=[],
                top_pick=False,
                new=False,
                item_id=item.id,
            )
            for item in wanted
        ],
        **{
            key: [_next_row(entry, data.taste) for entry in entries]
            for key, entries in built.items()
        },
    )
```

Imports to add to `public_outputs.py`: `ReasonSource` from `models`
(`OwnedFormat` is already imported);
`from next_list import NextEntry, PublicTaste, catalogue_item,
public_reasons_for, sections`; `from next_load import catalogue_times,
load_next`. `Item.physical_format` is the copy column (`models.py:220`).

In `public.py`, import `PublicNextOut, load_public_next` and add after the
`/radar` route:

```python
    @router.get("/next", response_model=PublicNextOut)
    async def public_next(session: AsyncSession = Depends(get_session)) -> PublicNextOut:
        """What's next: tonight's games, the wanted list, and what to look
        for in a store. Read-only; names only public games; no store data."""
        return await load_public_next(session, datetime.now(UTC))
```

- [ ] **Step 4: Run, expect pass**:
  `./.venv/bin/pytest tests/test_public_outputs.py -v && ./.venv/bin/pytest`, then ruff.

- [ ] **Step 5: Commit**

```bash
git add backend/public_outputs.py backend/public.py backend/tests/test_public_outputs.py
git commit -m "feat(api): GET /api/public/next

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 10: `GET /api/recommendations/store-list` (admin)

**Files:**
- Modify: `backend/recommendations_routes.py` (new route; the list route uses `catalogue_times`)
- Modify: `backend/tests/test_recommendations_routes.py` (append)

**Interfaces:**
- Produces: `GET /api/recommendations/store-list` →
  `{generated_at: {radar, discover}, catalogue: {stores_at, registry_at}, sections: {buy_now|preorders|later|not_on_cartridge: [admin row + top_pick + new + kind]}}`.
  Each admin row is `_row_out(row)`, so `id`, `score`, `store_lines`,
  `format_note`, `reasons` (stored) and `release_date` (any source) are all
  present.

- [ ] **Step 1: Write the failing tests** (append; use the file's existing
signed-in `client_for` and row builders, or copy `_radar` from
`test_public_outputs.py`)

```python
async def test_store_list_sections_with_private_fields(sessionmaker_for_test):
    await _add(
        sessionmaker_for_test,
        _radar("Store", source_metadata={"release_source": "store"}),
        _radar("Out", release_date=TODAY - timedelta(days=3)),
    )
    async with client_for(sessionmaker_for_test) as client:
        response = await client.get("/api/recommendations/store-list")
    assert response.status_code == 200
    body = response.json()
    assert set(body["sections"]) == {"buy_now", "preorders", "later", "not_on_cartridge"}
    # Admin mode: a store date sections like any date.
    assert [r["title"] for r in body["sections"]["preorders"]] == ["Store"]
    out = body["sections"]["buy_now"][0]
    assert {"id", "score", "store_lines", "top_pick", "new", "kind"} <= set(out)
    assert "radar" in body["generated_at"] and "stores_at" in body["catalogue"]


async def test_store_list_is_admin_only(sessionmaker_for_test):
    async with client_for(sessionmaker_for_test, signed_in=False) as client:
        response = await client.get("/api/recommendations/store-list")
    assert response.status_code == 401
```

(Use the file's own `client_for` signature. If it has no `signed_in` flag,
build an unsigned app inline, the way `test_picker_routes.py` does.)

- [ ] **Step 2: Run, expect failure** (404).

- [ ] **Step 3: Implement** — add the route after `list_recommendations`:

```python
    @router.get("/store-list")
    async def store_list(session: AsyncSession = Depends(get_session)) -> dict:
        """The signed-in What's next: the same sections as /api/public/next
        (next_list in admin mode, where any date counts), with the admin
        fields and the stored reasons."""
        today = _today()
        data = await load_next(session)
        built = sections(data.candidates, today, public=False)
        return {
            "generated_at": data.generated_at,
            "catalogue": await catalogue_times(session),
            "sections": {
                key: [
                    {
                        **_row_out(entry.candidate.payload),
                        "release_date": entry.date_shown.isoformat()
                        if entry.date_shown
                        else None,
                        "top_pick": entry.top_pick,
                        "new": entry.new,
                        "kind": entry.candidate.kind,
                    }
                    for entry in entries
                ]
                for key, entries in built.items()
            },
        }
```

Then replace the inline `runs`/`store_times`/`registry_run` block in
`list_recommendations` (lines ~478-497) with
`"catalogue": await catalogue_times(session)`. The keys are the same, so
the admin Radar list and this route share one definition. Drop
`latest_runs`/`STORES`/`CatalogueRun` imports there only if nothing else in
the file uses them. Add the imports: `from next_list import sections` and
`from next_load import catalogue_times, load_next`.

- [ ] **Step 4: Run, expect pass**:
  `./.venv/bin/pytest tests/test_recommendations_routes.py -v && ./.venv/bin/pytest`, then ruff.

- [ ] **Step 5: Commit**

```bash
git add backend/recommendations_routes.py backend/tests/test_recommendations_routes.py
git commit -m "feat(api): admin store-list route from the shared sections

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 11: Compact masthead, one-row phone nav, chip-row fade

**Files:**
- Create: `frontend/src/components/SiteHeader.jsx`
- Modify: `frontend/src/layouts/RootLayout.jsx` (use it; add `COMPACT_ROUTES`)
- Modify: `frontend/src/index.css` (site header and nav block, lines ~127-135 and ~164-290; narrow-screen block ~2504)
- Modify: `frontend/src/layouts/RootLayout.test.jsx`

**Interfaces:**
- Produces: `SiteHeader({ compact, isHome, theme, onToggleTheme, hasPosts })`; `RootLayout` exports nothing new; `.masthead` wrapper class.

- [ ] **Step 1: Write the failing tests** (append to `RootLayout.test.jsx`)

```js
describe('RootLayout masthead density', () => {
  function masthead(path) {
    const { container } = renderAt(path)
    return container.querySelector('.masthead')
  }

  it.each(['/spine', '/spine/next', '/spine/abc', '/admin', '/admin/store-list'])(
    'is compact on %s, with no tagline',
    (path) => {
      const node = masthead(path)
      expect(node.className).toContain('compact')
      expect(node.querySelector('.tagline')).toBeNull()
    },
  )

  it.each(['/', '/about', '/projects', '/blog/x'])('is full on %s', (path) => {
    const node = masthead(path)
    expect(node.className).not.toContain('compact')
    expect(node.querySelector('.tagline')).not.toBeNull()
  })

  it('keeps Spine current on What’s next', () => {
    renderAt('/spine/next')
    expect(screen.getByRole('link', { name: 'Spine' })).toHaveClass('active')
  })

  it('keeps the toggle outside the nav landmark', () => {
    renderAt('/spine')
    const nav = screen.getByRole('navigation', { name: /site/i })
    expect(within(nav).queryByRole('button')).toBeNull()
  })
})
```

- [ ] **Step 2: Run, expect failure**:
  `cd frontend && npx vitest run src/layouts/RootLayout.test.jsx`.

- [ ] **Step 3: Implement** `components/SiteHeader.jsx` by moving the
`<header>` and `.nav-row` JSX out of `RootLayout` unchanged, inside one
wrapper:

```jsx
import { NavLink } from 'react-router'
import joeyPhoto from '../assets/joey.jpg' // the import RootLayout uses today; move it
import { profile } from '../content/profile.js'

/**
 * The site's one masthead in two densities (Spine Next spec, K4): the full
 * résumé header on the person's pages, and a compact wordmark on the
 * tracker's, where the shelf is the point. On a narrow screen the nav is one
 * sideways-scrolling row with the theme toggle at its end, never a second
 * line.
 *
 * @param {object} props
 * @param {boolean} props.compact - Tracker routes: 24px avatar, no tagline.
 * @param {boolean} props.isHome - Home's larger header.
 * @param {'dark'|'light'} props.theme
 * @param {() => void} props.onToggleTheme
 * @param {{to: string, label: string, end?: boolean}[]} props.items - The nav.
 */
export default function SiteHeader({ compact, isHome, theme, onToggleTheme, items }) {
  const density = [compact && 'compact', isHome && 'home'].filter(Boolean).join(' ')
  return (
    <div className={`masthead ${density}`.trim()}>
      <header className={`site-header ${density}`.trim()}>
        <img className="avatar" src={joeyPhoto} alt="" />
        <div>
          <div className="site-name">{profile.name}</div>
          {!compact && <div className="tagline">{profile.tagline}</div>}
        </div>
      </header>

      {/* The toggle sits on the nav row visually but outside <nav>: it is not a
          navigation control, and the landmark should not advertise it as one. */}
      <div className={isHome ? 'nav-row home' : 'nav-row'}>
        <nav aria-label="Site">
          {items.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end}>
              {item.label}
            </NavLink>
          ))}
        </nav>
        {/* The visible label names the destination theme; the accessible name
            has to also say what the control does. */}
        <button
          type="button"
          className="theme-toggle"
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
          onClick={onToggleTheme}
        >
          {theme === 'dark' ? 'Light' : 'Dark'}
        </button>
      </div>
    </div>
  )
}
```

**(Refines spec:)** the props are `items` (the nav list `RootLayout` already
builds) rather than `hasPosts`, which keeps `navItems` in one place.
`aria-label="Site"` names the landmark now that the page has a second `nav`
(SpineTabs). Use the avatar import that `RootLayout.jsx` actually has.

In `RootLayout.jsx`: add

```js
/**
 * Routes that are the tracker rather than the person: the masthead shrinks
 * to a wordmark so the shelf starts in the first screen (Spine Next spec,
 * K4). A different question from WIDE_ROUTES (is this a grid?), so its own
 * list; same prefix rule.
 */
const COMPACT_ROUTES = ['/spine', '/admin']

function isUnder(routes, pathname) {
  return routes.some((route) => pathname === route || pathname.startsWith(`${route}/`))
}
```

Then rewrite `isWideRoute(pathname)` as `isUnder(WIDE_ROUTES, pathname)`
(keep its JSDoc), and replace the header and nav-row JSX with:

```jsx
<SiteHeader
  compact={isUnder(COMPACT_ROUTES, pathname)}
  isHome={isHome}
  theme={theme}
  onToggleTheme={toggleTheme}
  items={navItems(posts.length > 0)}
/>
```

Remove the now-unused `NavLink`, `profile` and avatar imports from
`RootLayout` only if nothing else in it uses them (the footer uses
`profile`).

CSS in `index.css`:
- Change `.nav-row + main` to `.masthead + main`, and `.nav-row + main.home`
  to `.masthead + main.home`.
- Add after `.site-header.home .tagline`:

```css
/* Tracker pages: a wordmark, not a résumé header, and the nav beside it. */
.masthead.compact {
  align-items: center;
  column-gap: 1.25rem;
  display: flex;
  flex-wrap: wrap;
}

.site-header.compact {
  gap: 0.5rem;
}

.site-header.compact .avatar {
  height: 1.5rem;
  width: 1.5rem;
}

.site-header.compact .site-name {
  font-size: 1.0625rem;
}

.masthead.compact .nav-row {
  flex: 1;
  margin-top: 0;
}
```

- In the narrow-screen block (`@media (max-width: 34rem)` under
  `/* ---------- Narrow screens ---------- */`), add:

```css
  /* One nav row on a phone, never two or three: it scrolls sideways, with
     the theme toggle at its end and a fade saying the row continues. */
  .nav-row {
    flex-wrap: nowrap;
  }

  .masthead.compact .nav-row {
    flex-basis: 100%;
    margin-top: 0.75rem;
  }

  nav {
    flex: 1;
    flex-wrap: nowrap;
    min-width: 0;
    overflow-x: auto;
    padding-right: 2rem;
    scrollbar-width: none;
  }

  nav a,
  .theme-toggle {
    flex: none;
  }

  /* A cut-off chip reads as "more", not "clipped". A mask needs no colour,
     so it is right in both themes. Padding lets the last item clear it. */
  nav,
  .chip-row {
    mask-image: linear-gradient(to right, #000 calc(100% - 2rem), transparent);
  }

  .chip-row {
    padding-right: 2rem;
  }
```

The literal `#000` in a mask is an alpha mask, not a colour that is
displayed, so the no-raw-hex rule doesn't apply. Say so in the comment, as
above.

- [ ] **Step 4: Run, expect pass; full suite; build** — `npm test && npm run build`. Run Prettier and ESLint on the touched files.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/SiteHeader.jsx frontend/src/layouts/RootLayout.jsx frontend/src/layouts/RootLayout.test.jsx frontend/src/index.css
git commit -m "feat(site): compact masthead on tracker routes, one-row phone nav

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 12: Copy, `SpineTabs`, `SpineHeader`

**Files:**
- Modify: `frontend/src/content/spine.js`
- Create: `frontend/src/components/SpineTabs.jsx`, `frontend/src/components/SpineHeader.jsx`, `frontend/src/components/SpineHeader.test.jsx`
- Modify: `frontend/src/index.css` (spine header block, beside `.spine-lede` ~1247)

**Interfaces:**
- Produces: `spine.tabs`, `spine.next` (the copy object below); `SpineTabs()`; `SpineHeader({ asLink = false })`.

- [ ] **Step 1: Add the copy** to `content/spine.js` (inside `spine`, after `links`):

```js
  tabs: {
    shelf: { to: '/spine', label: 'Shelf' },
    next: { to: '/spine/next', label: 'What’s next' },
  },
  next: {
    path: '/spine/next',
    title: 'What’s next',
    lede: 'What to play tonight from the shelf, and what to look for in a store: full cartridges only, ranked by the same taste profile, refreshed nightly.',
    fresh: {
      picks: 'Picks from',
      catalogue: 'catalogue refreshed',
      discover: 'Discover batch',
    },
    sections: {
      tonight: 'Tonight',
      wanted: 'Wanted',
      buy_now: 'Buy now',
      preorders: 'Pre-orders',
      later: 'Later',
      not_on_cartridge: 'Not on cartridge',
    },
    empty: {
      upNext: 'Nothing pinned tonight.',
      picks: 'No picks yet: Play Next runs every night.',
      wanted: 'Nothing on the want list.',
      buy_now: 'Nothing to buy right now.',
      preorders: 'No cartridges due in the next 90 days.',
      later: 'Nothing further out yet.',
      not_on_cartridge: 'Nothing to skip.',
    },
    notOnCartridge: 'Digital only or a Game-Key Card, so not for the shelf.',
    upNext: 'Up next',
    badges: { new: 'New', topPick: 'Top pick' },
    sorts: [
      { value: 'best', label: 'Best match' },
      { value: 'newest', label: 'Newest' },
    ],
    outOn: 'Out',
    band: {
      lead: 'What’s next',
      tonight: 'Tonight:',
      toBuy: 'to buy',
      preorders: 'pre-orders',
    },
    waking: 'Waking the server — it sleeps when idle, so this takes about thirty seconds.',
    error: 'What’s next could not be loaded. Try again shortly.',
  },
```

- [ ] **Step 2: Write the failing tests** — `components/SpineHeader.test.jsx`

```jsx
import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import SpineHeader from './SpineHeader.jsx'

function renderAt(path, props) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SpineHeader {...props} />
    </MemoryRouter>,
  )
}

describe('SpineHeader', () => {
  it('is the page h1 on the shelf, with the tab row', () => {
    renderAt('/spine')
    expect(screen.getByRole('heading', { level: 1, name: 'Spine' })).toBeInTheDocument()
    const tabs = screen.getByRole('navigation', { name: 'Spine sections' })
    expect(tabs).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Shelf' })).toHaveClass('active')
    expect(screen.getByRole('link', { name: 'What’s next' })).not.toHaveClass('active')
  })

  it('links back to the shelf, not an h1, on a sub-page', () => {
    renderAt('/spine/next', { asLink: true })
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull()
    expect(screen.getByRole('link', { name: 'Spine' })).toHaveAttribute('href', '/spine')
    expect(screen.getByRole('link', { name: 'What’s next' })).toHaveClass('active')
  })
})
```

- [ ] **Step 3: Run, expect failure**.

- [ ] **Step 4: Implement**

`components/SpineTabs.jsx`:

```jsx
import { NavLink } from 'react-router'
import { spine } from '../content/spine.js'

/**
 * Shelf · What's next, under the Spine name on both pages (Spine Next spec,
 * C13). Links, not ARIA tabs: each is its own page with its own URL.
 */
export default function SpineTabs() {
  return (
    <nav className="spine-tabs" aria-label="Spine sections">
      <NavLink to={spine.tabs.shelf.to} end>
        {spine.tabs.shelf.label}
      </NavLink>
      <NavLink to={spine.tabs.next.to}>{spine.tabs.next.label}</NavLink>
    </nav>
  )
}
```

`components/SpineHeader.jsx`:

```jsx
import { Link } from 'react-router'
import { spine } from '../content/spine.js'
import SpineTabs from './SpineTabs.jsx'

/**
 * Spine's one header block, shared by /spine and /spine/next so the
 * sub-page is recognisably the same thing (Spine Next spec, C17): the name
 * at display size, the tagline, the tab row and a hairline rule. The name is
 * the page's h1 on the shelf; elsewhere it links back, and the page supplies
 * its own h1 below, so each page has exactly one.
 *
 * @param {object} props
 * @param {boolean} [props.asLink] - Render the name as a link to /spine.
 */
export default function SpineHeader({ asLink = false }) {
  return (
    <div className="spine-header">
      {asLink ? (
        <p className="spine-name">
          <Link to={spine.path}>{spine.name}</Link>
        </p>
      ) : (
        <h1 className="spine-name">{spine.name}</h1>
      )}
      <p className="spine-lede">{spine.tagline}</p>
      <SpineTabs />
    </div>
  )
}
```

CSS (beside `.spine-lede`; tokens only):

```css
/* Spine's header block: the same on the shelf and on What's next. */
.spine-header {
  border-bottom: 1px solid var(--border);
  margin-bottom: 1.75rem;
  padding-bottom: 0.25rem;
}

.spine-name {
  font-family: var(--font-display);
  font-size: 2.5rem;
  font-weight: 600;
  line-height: 1.1;
  margin: 0;
}

.spine-name a {
  color: inherit;
}

.spine-tabs {
  display: flex;
  gap: 1.25rem;
  margin-top: 0.75rem;
}

.spine-tabs a {
  border-bottom: 2px solid transparent;
  color: var(--text-muted);
  font-weight: 500;
  padding: 0.375rem 0;
}

.spine-tabs a.active {
  border-bottom-color: var(--accent);
  color: var(--text);
}

.spine-tabs a:focus-visible,
.spine-name a:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
```

The narrow-screen rule `nav { overflow-x: auto … }` from Task 11 also
matches `.spine-tabs`. Two tabs fit, so add `.spine-tabs { mask-image: none;
padding-right: 0; }` inside that media block. Check the display size against
the existing `h1` rule in `index.css` (~line 146) and use the same value if
one is already defined there.

- [ ] **Step 5: Run, expect pass; then the suite.**

- [ ] **Step 6: Commit**

```bash
git add frontend/src/content/spine.js frontend/src/components/SpineTabs.jsx frontend/src/components/SpineHeader.jsx frontend/src/components/SpineHeader.test.jsx frontend/src/index.css
git commit -m "feat(spine): shared Spine header block and section tabs

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 13: `useSnapshotThenLive` and the `next` snapshot shape

**Files:**
- Modify: `frontend/src/lib/snapshot.js` (add `next` to `SHAPES`; export `isValidSnapshot`)
- Modify: `frontend/src/lib/snapshot.test.js`
- Create: `frontend/src/lib/useSnapshotThenLive.js`, `frontend/src/lib/useSnapshotThenLive.test.jsx`

**Interfaces:**
- Produces: `isValidSnapshot(name, body) -> boolean`; `useSnapshotThenLive(name) -> {data, live, failed}`, which reads `/snapshot/{name}.json` and then `/api/public/{name}`.

- [ ] **Step 1: Write the failing tests**

In `snapshot.test.js`:

```js
it('accepts a next body only with its sections', () => {
  expect(isValidSnapshot('next', { tonight: {}, buy_now: [] })).toBe(true)
  expect(isValidSnapshot('next', [])).toBe(false)
  expect(isValidSnapshot('nope', {})).toBe(false)
})
```

`useSnapshotThenLive.test.jsx`:

```jsx
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readSnapshot } from './snapshot.js'
import { useSnapshotThenLive } from './useSnapshotThenLive.js'

vi.mock('./snapshot.js', async (importOriginal) => ({
  ...(await importOriginal()),
  readSnapshot: vi.fn(),
}))

const BODY = { tonight: { up_next: null, picks: [] }, buy_now: [] }

afterEach(() => vi.restoreAllMocks())

describe('useSnapshotThenLive', () => {
  it('paints the snapshot, then live data replaces it', async () => {
    vi.mocked(readSnapshot).mockResolvedValue({ ...BODY, buy_now: [{ title: 'Old' }] })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => BODY }))
    const { result } = renderHook(() => useSnapshotThenLive('next'))
    await waitFor(() => expect(result.current.live).toBe(true))
    expect(result.current.data.buy_now).toEqual([])
  })

  it('keeps a painted snapshot when the API fails', async () => {
    vi.mocked(readSnapshot).mockResolvedValue(BODY)
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')))
    const { result } = renderHook(() => useSnapshotThenLive('next'))
    await waitFor(() => expect(result.current.failed).toBe(true))
    expect(result.current.data).toEqual(BODY)
  })

  it('ignores a live body of the wrong shape', async () => {
    vi.mocked(readSnapshot).mockResolvedValue(null)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }))
    const { result } = renderHook(() => useSnapshotThenLive('next'))
    await waitFor(() => expect(result.current.failed).toBe(true))
    expect(result.current.data).toBeNull()
  })
})
```

- [ ] **Step 2: Run, expect failure**.

- [ ] **Step 3: Implement**

`snapshot.js`: add to `SHAPES`
`next: (body) => isObject(body) && 'tonight' in body && 'buy_now' in body,`
and export:

```js
/**
 * Whether a body has the shape a snapshot of `name` must have; the live
 * API's answer is held to the same rule.
 *
 * @param {string} name
 * @param {unknown} body
 * @returns {boolean}
 */
export function isValidSnapshot(name, body) {
  return Object.hasOwn(SHAPES, name) && SHAPES[name](body)
}
```

`useSnapshotThenLive.js`:

```js
import { useEffect, useState } from 'react'
import { apiFetch } from './api.js'
import { isValidSnapshot, readSnapshot } from './snapshot.js'

/**
 * Paints the build-time snapshot, then swaps in the live API's answer
 * (Spine Next spec, C12). Live data wins whenever it arrives; a painted
 * snapshot outranks an error, since stale beats nothing.
 *
 * @param {string} name A snapshot name; the live path is /api/public/{name}.
 * @returns {{data: any|null, live: boolean, failed: boolean}}
 */
export function useSnapshotThenLive(name) {
  const [state, setState] = useState({ data: null, live: false, failed: false })

  useEffect(() => {
    let cancelled = false
    let live = false
    readSnapshot(name).then((body) => {
      if (!cancelled && !live && body) setState((s) => ({ ...s, data: body }))
    })
    apiFetch(`/api/public/${name}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => {
        if (cancelled) return
        if (isValidSnapshot(name, body)) {
          live = true
          setState({ data: body, live: true, failed: false })
        } else {
          setState((s) => ({ ...s, failed: true }))
        }
      })
      .catch(() => {
        if (!cancelled) setState((s) => ({ ...s, failed: true }))
      })
    return () => {
      cancelled = true
    }
  }, [name])

  return state
}
```

- [ ] **Step 4: Run, expect pass; then the suite.**

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/snapshot.js frontend/src/lib/snapshot.test.js frontend/src/lib/useSnapshotThenLive.js frontend/src/lib/useSnapshotThenLive.test.jsx
git commit -m "feat(spine): snapshot-then-live hook and the next snapshot shape

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 14: `NextRow`, grouping and sorting, and `SortControl` options

**Files:**
- Create: `frontend/src/lib/next.js`, `frontend/src/lib/next.test.js`
- Create: `frontend/src/components/NextRow.jsx`, `frontend/src/components/NextRow.test.jsx`
- Modify: `frontend/src/components/SortControl.jsx` (optional `sorts` and `directional` props)

**Interfaces:**
- Produces:
  - `NEXT_PLATFORMS = ['Nintendo Switch 2', 'Nintendo Switch', 'Nintendo 64']`.
  - `groupByPlatform(rows) -> [{platform, rows}]`, in `NEXT_PLATFORMS` order, then any other platform alphabetically. Empty groups are dropped.
  - `sortBuyNow(rows, sort: 'best'|'newest') -> rows`. `best` keeps server order. `newest` sorts by `release_date` descending, undated last, stable.
  - `bandCounts(next) -> {tonight: string|null, toBuy: number, preorders: number}`.
  - `FORMAT_WORDS`.
  - `NextRow({ row, section, actions, extra })`.
  - `SortControl({ ..., sorts = SORTS, directional = true })`.

- [ ] **Step 1: Write the failing tests**

`lib/next.test.js`:

```js
import { describe, expect, it } from 'vitest'
import { bandCounts, groupByPlatform, sortBuyNow } from './next.js'

const row = (title, platform, release_date = null) => ({ title, platform, release_date })

describe('groupByPlatform', () => {
  it('orders Switch 2, Switch, N64, then others, and drops empty groups', () => {
    const groups = groupByPlatform([
      row('a', 'Nintendo 64'),
      row('b', 'Nintendo Switch 2'),
      row('c', 'PC'),
      row('d', 'Nintendo Switch 2'),
    ])
    expect(groups.map((g) => g.platform)).toEqual(['Nintendo Switch 2', 'Nintendo 64', 'PC'])
    expect(groups[0].rows.map((r) => r.title)).toEqual(['b', 'd'])
  })
})

describe('sortBuyNow', () => {
  const rows = [row('old', 'x', '2026-01-01'), row('none', 'x'), row('new', 'x', '2026-09-01')]
  it('keeps the server order for best match', () => {
    expect(sortBuyNow(rows, 'best').map((r) => r.title)).toEqual(['old', 'none', 'new'])
  })
  it('puts the newest first and undated last', () => {
    expect(sortBuyNow(rows, 'newest').map((r) => r.title)).toEqual(['new', 'old', 'none'])
  })
})

describe('bandCounts', () => {
  it('names Up next, else the first pick', () => {
    const next = {
      tonight: { up_next: null, picks: [{ title: 'Hades II' }] },
      buy_now: [{}, {}],
      preorders: [{}],
    }
    expect(bandCounts(next)).toEqual({ tonight: 'Hades II', toBuy: 2, preorders: 1 })
    expect(bandCounts({ ...next, tonight: { up_next: { title: 'Pinned' }, picks: [] } }).tonight)
      .toBe('Pinned')
  })
})
```

`components/NextRow.test.jsx`:

```jsx
import '@testing-library/jest-dom'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import NextRow from './NextRow.jsx'

const BASE = {
  title: 'Ratatan',
  platform: 'Nintendo Switch 2',
  physical_format: 'game_card',
  release_date: '2026-10-15',
  release_precision: 'day',
  cover_url: null,
  igdb_url: 'https://www.igdb.com/games/ratatan',
  reasons: ['IGDB lists it beside Hades ♥', 'second', 'third'],
  top_pick: true,
  new: true,
  item_id: null,
}

function renderRow(props) {
  return render(
    <MemoryRouter>
      <ul>
        <NextRow row={BASE} section="preorders" {...props} />
      </ul>
    </MemoryRouter>,
  )
}

describe('NextRow', () => {
  it('shows meta, two reasons and the badges', () => {
    renderRow()
    expect(screen.getByText(/Nintendo Switch 2 · Full game on cartridge · Out Oct 15, 2026/))
      .toBeInTheDocument()
    expect(screen.getAllByRole('listitem').length).toBeGreaterThan(0)
    expect(screen.queryByText('third')).toBeNull()
    expect(screen.getByText('New')).toBeInTheDocument()
    expect(screen.getByText('Top pick')).toBeInTheDocument()
  })

  it('links a wanted row to its item page and others to IGDB', () => {
    renderRow({ row: { ...BASE, item_id: 'abc' } })
    expect(screen.getByRole('link', { name: /Ratatan/ })).toHaveAttribute('href', '/spine/abc')
  })

  it('keeps admin actions outside the link', () => {
    renderRow({ actions: <button type="button">Got it</button> })
    const link = screen.getByRole('link', { name: /Ratatan/ })
    expect(within(link).queryByRole('button')).toBeNull()
    expect(screen.getByRole('button', { name: 'Got it' })).toBeInTheDocument()
  })
})
```

(`releaseWords` formats a day as AdminRadar does. If its output differs from
"Oct 15, 2026", assert on what `releaseWords(BASE)` returns, imported in the
test.)

- [ ] **Step 2: Run, expect failure**.

- [ ] **Step 3: Implement**

`lib/next.js`:

```js
/**
 * What's next's page-side helpers. The sections themselves come from the
 * server (backend/next_list.py); grouping by console and sorting are the
 * page's job (Spine Next spec, B6).
 */

/** Buy now's console groups, in a store visit's order. */
export const NEXT_PLATFORMS = ['Nintendo Switch 2', 'Nintendo Switch', 'Nintendo 64']

/**
 * Rows grouped by platform: the known consoles first, in order, then any
 * other platform by name. Empty groups are dropped.
 *
 * @param {Array<{platform: string|null}>} rows
 * @returns {Array<{platform: string, rows: object[]}>}
 */
export function groupByPlatform(rows) {
  const groups = new Map()
  for (const row of rows) {
    const key = row.platform ?? 'Other'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(row)
  }
  const rank = (name) => {
    const index = NEXT_PLATFORMS.indexOf(name)
    return index === -1 ? NEXT_PLATFORMS.length : index
  }
  return [...groups.keys()]
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
    .map((platform) => ({ platform, rows: groups.get(platform) }))
}

/**
 * Buy now in the visitor's chosen order: the server's best match, or the
 * newest public date first with undated rows last.
 *
 * @param {Array<{release_date: string|null}>} rows
 * @param {'best'|'newest'} sort
 */
export function sortBuyNow(rows, sort) {
  if (sort !== 'newest') return rows
  return [...rows].sort((a, b) => {
    if (!a.release_date) return b.release_date ? 1 : 0
    if (!b.release_date) return -1
    return b.release_date.localeCompare(a.release_date)
  })
}

/**
 * The shelf band's numbers.
 *
 * @param {{tonight: {up_next: {title: string}|null, picks: {title: string}[]}, buy_now: unknown[], preorders: unknown[]}} next
 */
export function bandCounts(next) {
  return {
    tonight: next.tonight?.up_next?.title ?? next.tonight?.picks?.[0]?.title ?? null,
    toBuy: next.buy_now?.length ?? 0,
    preorders: next.preorders?.length ?? 0,
  }
}
```

`components/NextRow.jsx` (moves `FORMAT_WORDS` and `meta` out of
`AdminStoreList.jsx`):

```jsx
import { Link } from 'react-router'
import { spine } from '../content/spine.js'
import { releaseWords } from '../pages/AdminRadar.jsx'
import CoverImage from './CoverImage.jsx'

/** As a meta line starts; mirrors FORMAT_WORDS in physical_sources/limits.py. */
export const FORMAT_WORDS = {
  game_card: 'Full game on cartridge',
  game_key_card: 'Game-Key Card',
  code_in_box: 'Code in a box',
  disc: 'Disc',
}

const MAX_REASONS = 2

function metaLine(row, section) {
  const format =
    row.lane === 'digital' || (section === 'not_on_cartridge' && !row.physical_format)
      ? 'Digital only'
      : (FORMAT_WORDS[row.physical_format] ?? 'Format unknown')
  const parts = [row.platform, format]
  if (row.release_date) {
    const when = releaseWords(row)
    parts.push(section === 'preorders' ? `${spine.next.outOn} ${when}` : when)
  }
  return parts.filter(Boolean).join(' · ')
}

/**
 * One game on What's next or the store list: cover, title, platform ·
 * format · date, up to two reasons, and the New and Top pick badges. The
 * title links to the item page for a wanted game, else to IGDB.
 *
 * `actions` and `extra` (the admin's buttons and store lines) render as
 * siblings of the link, never inside it.
 *
 * @param {object} props
 * @param {object} props.row - A PublicNextRow or an admin store-list row.
 * @param {string} props.section - The server section key.
 * @param {import('react').ReactNode} [props.actions]
 * @param {import('react').ReactNode} [props.extra]
 */
export default function NextRow({ row, section, actions, extra }) {
  const body = (
    <>
      <span className="next-row-cover">
        <CoverImage src={row.cover_url} type="game" alt="" />
      </span>
      <span className="next-row-title">{row.title}</span>
    </>
  )
  const link = row.item_id ? (
    <Link to={`/spine/${row.item_id}`} className="next-row-link">
      {body}
    </Link>
  ) : row.igdb_url ? (
    <a href={row.igdb_url} className="next-row-link" rel="noreferrer noopener">
      {body}
    </a>
  ) : (
    <span className="next-row-link">{body}</span>
  )
  const reasons = (row.reasons ?? []).slice(0, MAX_REASONS)
  return (
    <li className="next-row">
      {link}
      <div className="next-row-text">
        <span className="muted">{metaLine(row, section)}</span>
        {(row.new || row.top_pick) && (
          <span className="next-badges">
            {row.new && <span className="next-badge">{spine.next.badges.new}</span>}
            {row.top_pick && (
              <span className="next-badge next-badge-pick">{spine.next.badges.topPick}</span>
            )}
          </span>
        )}
        {reasons.length > 0 && (
          <ul className="next-row-reasons">
            {reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        )}
        {extra}
      </div>
      {actions && <div className="next-row-actions">{actions}</div>}
    </li>
  )
}
```

`SortControl.jsx`: add the props `sorts = SORTS` and `directional = true` to
the destructured props and the JSDoc. Replace the three uses of `SORTS` with
`sorts`. Change the trailing ternary so the direction button renders only
when `directional` is true:

```jsx
      {isRandom ? (
        <button type="button" className="chip" onClick={onShuffle}>
          Shuffle
        </button>
      ) : (
        directional && (
          <button ...unchanged... />
        )
      )}
```

Add one `SortControl.test.jsx` case: with `sorts={[{value:'best',label:'Best
match',direction:'desc'},{value:'newest',label:'Newest',direction:'desc'}]}`
and `directional={false}`, the two buttons render and no "Direction" button
does.

CSS (in `index.css`, replacing nothing yet): `.next-row` as a grid (cover
3rem | text | actions), `.next-badge` (a pill: `background:
var(--surface)`, `border: 1px solid var(--border)`, `color: var(--text)`,
`font-size: 0.75rem`, radius 999px), `.next-badge-pick` (`border-color:
var(--accent)`), `.next-row-link:focus-visible` (outline `--accent`), and,
under 34rem, the actions wrapping below the text. Tokens only.

- [ ] **Step 4: Run, expect pass; then the suite.**

- [ ] **Step 5: Commit** (5 code files; the CSS goes with Task 15's commit)

```bash
git add frontend/src/lib/next.js frontend/src/lib/next.test.js frontend/src/components/NextRow.jsx frontend/src/components/NextRow.test.jsx frontend/src/components/SortControl.jsx
git commit -m "feat(spine): shared What's next row, grouping and sort options

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

`SortControl.test.jsx` and the `.next-row` CSS commit with Task 15, to keep
this commit at five files.

### Task 15: `/spine/next` page

**Files:**
- Create: `frontend/src/pages/Next.jsx`, `frontend/src/pages/Next.test.jsx`
- Modify: `frontend/src/App.jsx` (route `spine/next` before `spine/:id`)
- Modify: `frontend/src/index.css` (the `.next-*` rules from Task 14, plus page rules)
- Modify: `frontend/src/components/SortControl.test.jsx` (the case from Task 14)

**Interfaces:**
- Consumes: `useSnapshotThenLive('next')`, `SpineHeader({asLink})`, `NextRow`, `groupByPlatform`, `sortBuyNow`, `SortControl`, `readShelfPref`/`writeShelfPref`, `usePageTitle`, `spine.next`.

- [ ] **Step 1: Write the failing tests** — `pages/Next.test.jsx`

```jsx
import '@testing-library/jest-dom'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useSnapshotThenLive } from '../lib/useSnapshotThenLive.js'
import Next from './Next.jsx'

vi.mock('../lib/useMediaQuery.js', () => ({ useMediaQuery: () => false }))
vi.mock('../lib/useSnapshotThenLive.js', () => ({ useSnapshotThenLive: vi.fn() }))

const row = (title, fields = {}) => ({
  title, platform: 'Nintendo Switch 2', physical_format: 'game_card',
  release_date: null, release_precision: null, cover_url: null,
  igdb_url: null, reasons: [], top_pick: false, new: false, item_id: null,
  ...fields,
})

const NEXT = {
  generated_at: { picks: '2026-10-04', catalogue: '2026-10-04T00:40:00Z',
                  radar: null, discover: '2026-10-04T00:45:00Z' },
  tonight: { up_next: null, picks: [{ item_id: 'p1', type: 'game', title: 'Hades II',
             cover_url: null, platform: 'Nintendo Switch', reasons: ['A reason'] }] },
  wanted: [],
  buy_now: [
    row('Old', { release_date: '2026-01-01' }),
    row('Fresh', { release_date: '2026-09-20', new: true, top_pick: true }),
    row('Cart', { platform: 'Nintendo Switch' }),
  ],
  preorders: [row('Soon', { release_date: '2026-10-15', release_precision: 'day' })],
  later: [],
  not_on_cartridge: [row('Digital', { physical_format: null })],
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/spine/next']}>
      <Next />
    </MemoryRouter>,
  )
}

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('Next', () => {
  it('has one h1, the freshness line and every section in order', () => {
    vi.mocked(useSnapshotThenLive).mockReturnValue({ data: NEXT, live: true, failed: false })
    renderPage()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('What’s next')
    expect(screen.getByText(/Picks from/)).toBeInTheDocument()
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    expect(headings).toEqual(['Tonight', 'Wanted', 'Buy now', 'Pre-orders', 'Later'])
    expect(screen.getByText('Nothing pinned tonight.')).toBeInTheDocument()
    expect(screen.getByText('Nothing on the want list.')).toBeInTheDocument()
    expect(screen.getByText('Nothing further out yet.')).toBeInTheDocument()
  })

  it('groups Buy now by console and sorts by newest on request', async () => {
    vi.mocked(useSnapshotThenLive).mockReturnValue({ data: NEXT, live: true, failed: false })
    renderPage()
    const buy = screen.getByRole('region', { name: 'Buy now' })
    expect(within(buy).getAllByRole('heading', { level: 3 }).map((h) => h.textContent))
      .toEqual(['Nintendo Switch 2', 'Nintendo Switch'])
    await userEvent.click(within(buy).getByRole('button', { name: 'Newest' }))
    const titles = within(buy).getAllByText(/^(Old|Fresh)$/).map((n) => n.textContent)
    expect(titles).toEqual(['Fresh', 'Old'])
    expect(localStorage.getItem('shelf.next.sort')).toBe('"newest"')
  })

  it('keeps Not on cartridge in a details element', () => {
    vi.mocked(useSnapshotThenLive).mockReturnValue({ data: NEXT, live: true, failed: false })
    const { container } = renderPage()
    const details = container.querySelector('details')
    expect(within(details).getByText(/Not on cartridge/)).toBeInTheDocument()
    expect(within(details).getByText(/not for the shelf/)).toBeInTheDocument()
  })

  it('says it is waking the server only without a snapshot', () => {
    vi.useFakeTimers()
    vi.mocked(useSnapshotThenLive).mockReturnValue({ data: null, live: false, failed: false })
    renderPage()
    vi.advanceTimersByTime(3500)
    expect(screen.getByText(/Waking the server/)).toBeInTheDocument()
    vi.useRealTimers()
  })
})
```

(If the timer test fights React's scheduling, wrap the `advanceTimersByTime`
in `act`, as `Collection.test.jsx` does for its slow state. Look up its
pattern with `grep -n "Waking" -n src/pages/Collection.test.jsx`.)

- [ ] **Step 2: Run, expect failure**.

- [ ] **Step 3: Implement** `pages/Next.jsx`

```jsx
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import CoverImage from '../components/CoverImage.jsx'
import NextRow from '../components/NextRow.jsx'
import SortControl from '../components/SortControl.jsx'
import SpineHeader from '../components/SpineHeader.jsx'
import { spine } from '../content/spine.js'
import { groupByPlatform, sortBuyNow } from '../lib/next.js'
import { readShelfPref, writeShelfPref } from '../lib/shelf.js'
import { usePageTitle } from '../lib/usePageTitle.js'
import { useSnapshotThenLive } from '../lib/useSnapshotThenLive.js'

const copy = spine.next
const SORTS = copy.sorts.map((sort) => ({ ...sort, direction: 'desc' }))
const DAY = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })

function dayWords(value) {
  if (!value) return null
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00Z`) : new Date(value)
  return DAY.format(date)
}

function Freshness({ generated }) {
  const parts = [
    [copy.fresh.picks, generated?.picks],
    [copy.fresh.catalogue, generated?.catalogue],
    [copy.fresh.discover, generated?.discover],
  ]
    .filter(([, value]) => value)
    .map(([label, value]) => `${label} ${dayWords(value)}`)
  if (!parts.length) return null
  return <p className="muted next-fresh">{parts.join(' · ')}</p>
}

function Section({ id, children, empty, count }) {
  return (
    <section className="next-section" aria-labelledby={`next-${id}`}>
      <h2 id={`next-${id}`}>{copy.sections[id]}</h2>
      {count === 0 ? <p className="muted">{empty}</p> : children}
    </section>
  )
}

function Rows({ rows, section }) {
  return (
    <ul className="next-rows">
      {rows.map((row) => (
        <NextRow key={`${row.title}-${row.platform}-${row.item_id ?? ''}`} row={row} section={section} />
      ))}
    </ul>
  )
}

function Tonight({ tonight }) {
  const card = (pick, label) => (
    <li key={pick.item_id} className="next-tonight-card">
      <Link to={`/spine/${pick.item_id}`} className="next-row-link">
        <span className="next-row-cover">
          <CoverImage src={pick.cover_url} type={pick.type} alt="" />
        </span>
        <span>
          {label && <span className="pick-slot">{label}</span>}
          <span className="next-row-title">{pick.title}</span>
        </span>
      </Link>
      {pick.reasons.length > 0 && (
        <ul className="next-row-reasons">
          {pick.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      )}
    </li>
  )
  return (
    <section className="next-section" aria-labelledby="next-tonight">
      <h2 id="next-tonight">{copy.sections.tonight}</h2>
      {!tonight.up_next && <p className="muted">{copy.empty.upNext}</p>}
      <ul className="next-tonight">
        {tonight.up_next && card(tonight.up_next, copy.upNext)}
        {tonight.picks.map((pick) => card(pick, null))}
      </ul>
      {tonight.picks.length === 0 && <p className="muted">{copy.empty.picks}</p>}
    </section>
  )
}

/**
 * What's next (Spine Next spec, C11): tonight's games from the shelf, the
 * want list, and what to look for in a store, from GET /api/public/next.
 * Paints the build-time snapshot first; "Waking the server" only without
 * one. Read-only: no buttons that write, and no store, price or stock.
 */
export default function Next() {
  usePageTitle(`${copy.title} · ${spine.name}`)
  const { data, failed } = useSnapshotThenLive('next')
  const [sort, setSort] = useState(() => readShelfPref('shelf.next.sort', 'best'))
  const [slow, setSlow] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), 3000)
    return () => clearTimeout(timer)
  }, [])

  function changeSort({ value }) {
    setSort(value)
    writeShelfPref('shelf.next.sort', value)
  }

  return (
    <section className="next-page">
      <SpineHeader asLink />
      <h1 className="next-title">{copy.title}</h1>
      <p className="spine-lede">{copy.lede}</p>
      {data && <Freshness generated={data.generated_at} />}

      {!data && !failed && (
        <p className="muted" role="status">
          {slow ? copy.waking : 'Loading…'}
        </p>
      )}
      {!data && failed && <p className="admin-error">{copy.error}</p>}

      {data && (
        <>
          <Tonight tonight={data.tonight} />
          <Section id="wanted" count={data.wanted.length} empty={copy.empty.wanted}>
            <Rows rows={data.wanted} section="wanted" />
          </Section>
          <Section id="buy_now" count={data.buy_now.length} empty={copy.empty.buy_now}>
            <SortControl value={sort} direction="desc" sorts={SORTS} directional={false} onChange={changeSort} />
            {groupByPlatform(sortBuyNow(data.buy_now, sort)).map((group) => (
              <div key={group.platform} className="next-group">
                <h3>{group.platform}</h3>
                <Rows rows={group.rows} section="buy_now" />
              </div>
            ))}
          </Section>
          <Section id="preorders" count={data.preorders.length} empty={copy.empty.preorders}>
            <Rows rows={data.preorders} section="preorders" />
          </Section>
          <Section id="later" count={data.later.length} empty={copy.empty.later}>
            <Rows rows={data.later} section="later" />
          </Section>
          <details className="next-skip">
            <summary>
              {copy.sections.not_on_cartridge} ({data.not_on_cartridge.length})
            </summary>
            <p className="muted">{copy.notOnCartridge}</p>
            {data.not_on_cartridge.length === 0 ? (
              <p className="muted">{copy.empty.not_on_cartridge}</p>
            ) : (
              <Rows rows={data.not_on_cartridge} section="not_on_cartridge" />
            )}
          </details>
        </>
      )}

      <footer className="attribution">
        <p>
          Game data from{' '}
          <a href="https://www.igdb.com/" rel="noreferrer noopener">
            IGDB
          </a>
          .
        </p>
      </footer>
    </section>
  )
}
```

**(Refines spec:)** a section is a `<section aria-labelledby>`, which gives
it the `region` role the test queries. Move `'Loading…'` into
`spine.next.loading` so all copy lives in the content module.

In `App.jsx`, import `Next` and add
`<Route path="spine/next" element={<Next />} />` directly above
`spine/:id`.

CSS: the `.next-*` rules from Task 14, plus `.next-title` (section size: use
the existing `h2` size, since this `h1` sits below the display-size name),
`.next-section { margin-top: 2rem }`, `.next-group h3`, `.next-tonight`
(a column of cards), and `.next-skip summary` (cursor pointer,
`:focus-visible` outline with `--accent`). Tokens only.

- [ ] **Step 4: Run, expect pass; the suite; build.**

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Next.jsx frontend/src/pages/Next.test.jsx frontend/src/App.jsx frontend/src/index.css frontend/src/components/SortControl.test.jsx
git commit -m "feat(spine): What's next page at /spine/next

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 16: `/spine` back to the shelf: `NextBand`, shared header, colophon

**Files:**
- Create: `frontend/src/components/NextBand.jsx`, `frontend/src/components/NextBand.test.jsx`
- Modify: `frontend/src/pages/Collection.jsx`
- Modify: `frontend/src/pages/Collection.test.jsx`
- Modify: `frontend/src/index.css` (remove the strip rules)

**Interfaces:**
- Consumes: `useSnapshotThenLive('next')`, `bandCounts`, `SpineHeader`.
- Produces: `NextBand()`. `HeroNumbers` and `FavoritesRow` exports are unchanged.

- [ ] **Step 1: Write the failing tests**

`NextBand.test.jsx`:

```jsx
import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { useSnapshotThenLive } from '../lib/useSnapshotThenLive.js'
import NextBand from './NextBand.jsx'

vi.mock('../lib/useSnapshotThenLive.js', () => ({ useSnapshotThenLive: vi.fn() }))

const renderBand = () => render(<MemoryRouter><NextBand /></MemoryRouter>)

describe('NextBand', () => {
  it('links to What’s next with tonight and the counts', () => {
    vi.mocked(useSnapshotThenLive).mockReturnValue({
      data: { tonight: { up_next: null, picks: [{ title: 'Hades II' }] },
              buy_now: Array(11).fill({}), preorders: Array(9).fill({}) },
    })
    renderBand()
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', '/spine/next')
    expect(link).toHaveTextContent('What’s next')
    expect(link).toHaveTextContent('Tonight: Hades II · 11 to buy · 9 pre-orders')
  })

  it('is hidden without data', () => {
    vi.mocked(useSnapshotThenLive).mockReturnValue({ data: null })
    const { container } = renderBand()
    expect(container).toBeEmptyDOMElement()
  })
})
```

In `Collection.test.jsx`:
1. Find the strip tests:
   `grep -n "Recent picks\|Coming to cartridge\|Up next\|On the radar\|picks\b\|radar" src/pages/Collection.test.jsx`.
   Delete the tests that assert those strips render, and the
   `readSnapshot` branches that feed `picks`/`radar`.
2. Add `vi.mock('../components/NextBand.jsx', () => ({ default: () => null }))`
   so the shelf tests don't depend on the band's fetch.
3. Add these tests:

```jsx
it('leaves the living strips to What’s next', async () => {
  stubSnapshot()
  render(<MemoryRouter><Collection /></MemoryRouter>)
  await screen.findByText(ITEMS[0].title)
  for (const name of ['Recent picks', 'Coming to cartridge', 'On the radar'])
    expect(screen.queryByRole('heading', { name })).toBeNull()
  expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  expect(screen.getByRole('navigation', { name: 'Spine sections' })).toBeInTheDocument()
})

it('puts the project line at the foot of the page', async () => {
  stubSnapshot()
  const { container } = render(<MemoryRouter><Collection /></MemoryRouter>)
  await screen.findByText(ITEMS[0].title)
  expect(container.querySelector('.attribution .spine-project')).not.toBeNull()
})
```

(Use the file's existing render helper if it has one in place of the inline
`render`.)

- [ ] **Step 2: Run, expect failure**.

- [ ] **Step 3: Implement**

`NextBand.jsx`:

```jsx
import { Link } from 'react-router'
import { spine } from '../content/spine.js'
import { bandCounts } from '../lib/next.js'
import { useSnapshotThenLive } from '../lib/useSnapshotThenLive.js'

/**
 * One line under the shelf's hero numbers linking across to What's next,
 * so the shelf still says the site is alive (Spine Next spec, C14). Hidden
 * when neither the snapshot nor the API has an answer.
 */
export default function NextBand() {
  const { data } = useSnapshotThenLive('next')
  if (!data) return null
  const { tonight, toBuy, preorders } = bandCounts(data)
  const band = spine.next.band
  const parts = [
    tonight && `${band.tonight} ${tonight}`,
    `${toBuy} ${band.toBuy}`,
    `${preorders} ${band.preorders}`,
  ].filter(Boolean)
  return (
    <p className="next-band">
      <Link to={spine.next.path}>
        <strong>{band.lead}</strong> <span aria-hidden="true">&rarr;</span>{' '}
        {parts.join(' · ')}
      </Link>
    </p>
  )
}
```

`Collection.jsx`:
- Delete `UpNext`, `OnTheRadar`, `RELEASE_DAY`, `releaseText`, `RecentPicks`,
  `ComingToCartridge`, the `picks` and `releases` state, and the "two
  read-only outputs" effect.
- Delete `CoverImage`, `PosterCard`, `PosterGrid` and `localToday` imports
  only where nothing else in the file still uses them. `PosterGrid` and
  `PosterCard` still render the grid; check `CoverImage` with grep.
- In all three render paths (loading, error, ready), replace
  `<h1>{spine.name}</h1>` with `<SpineHeader />`. In the ready path, also
  remove the `<p className="spine-lede">` and the `spine-project` paragraph
  under it.
- Replace the `<UpNext …/> <RecentPicks …/> <div className="radar-row">…</div>`
  block with `<NextBand />`.
- Inside `<footer className="attribution">`, add the moved colophon as its
  first child:

```jsx
        <p className="spine-project">
          {spine.projectLine}{' '}
          <Link to={spine.links.post.to}>
            {spine.links.post.label} <span aria-hidden="true">&rarr;</span>
          </Link>{' '}
          <a href={spine.links.source.href}>
            {spine.links.source.label} <span aria-hidden="true">&rarr;</span>
          </a>
        </p>
```

CSS:
- Delete the rules for `.on-the-radar*`, `.recent-picks`, `.recent-pick*`,
  `.coming-*`, `.coming-to-cartridge*` and `.radar-row`, and the
  `.up-next-public` rule if one exists. Keep the `.up-next*` rules, which
  admin Play Next uses. Check each with
  `grep -rn "<class>" src --include=*.jsx` before deleting.
- Add `.next-band` (`border: 1px solid var(--border)`, `background:
  var(--surface)`, radius, padding `0.75rem 1rem`, `margin: 1.5rem 0`).
- Add `.next-band a:focus-visible` (outline `--accent`).

- [ ] **Step 4: Run, expect pass; the suite; build.**

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/NextBand.jsx frontend/src/components/NextBand.test.jsx frontend/src/pages/Collection.jsx frontend/src/pages/Collection.test.jsx frontend/src/index.css
git commit -m "feat(spine): shelf keeps what I own; band links to What's next

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 17: `/admin/store-list` on the server's sections

**Files:**
- Modify: `frontend/src/pages/AdminStoreList.jsx`
- Modify: `frontend/src/pages/AdminStoreList.test.jsx`
- Modify: `frontend/src/components/LastNightly.jsx` (one call to the store-list route for `generated_at`)
- Modify: `frontend/src/pages/Admin.test.jsx` (stub the new path)

**Interfaces:**
- Consumes: `GET /api/recommendations/store-list` (Task 10); `NextRow`, `groupByPlatform`; `POST /api/recommendations/{id}/own|want|dismiss`.

- [ ] **Step 1: Rewrite the tests.**
  - Delete the `radarSection`, `buildList`, `periodEnd`, `isoDay` and
    `addDays` test blocks. Their cases now live in `test_next_list.py`.
  - Keep the page tests and stub `fetch` for `/api/recommendations/store-list`
    with this body:

```js
const LIST = {
  generated_at: { radar: '2026-10-04T00:44:00Z', discover: null },
  catalogue: { stores_at: null, registry_at: null },
  sections: {
    buy_now: [row('a', { top_pick: true, kind: 'discover' }), row('b', { platform: 'Nintendo Switch' })],
    preorders: [row('c', { release_date: '2026-10-15' })],
    later: [],
    not_on_cartridge: [row('d', { physical_format: 'game_key_card' })],
  },
}
```

  Use these test cases:
  1. The headings are Buy now (with console sub-headings), Pre-orders and
     Not on cartridge. Later is absent from the headings because it is
     empty: the admin page hides empty sections, as it does today.
  2. Got it POSTs `/own`, hides the row at once, and restores it on a 500.
     Move the existing Got it tests here.
  3. Want POSTs `/want` and Not interested POSTs `/dismiss`, and each hides
     the row.
  4. Each row's buttons are outside its link
     (`within(link).queryByRole('button')` is null).
  5. Store lines render as `"<store> · $59.99"` when present.
  6. A 401 shows the sign-in line.

- [ ] **Step 2: Run, expect failure**.

- [ ] **Step 3: Implement.** In `AdminStoreList.jsx`:
- Delete `PREORDER_DAYS`, `SECTIONS`, `CONSOLES`, `SKIP_FORMATS`,
  `FORMAT_WORDS`, `isoDay`, `addDays`, `periodEnd`, `radarSection`,
  `buildList` and `meta`.
- `fetchLists()` becomes one `apiFetch('/api/recommendations/store-list')`
  with the same 401/error handling, returning `{state: 'ready', list}`.
- `apply` sets `sections = result.list.sections`.
- Generalise `gotIt(entry)` to `answer(entry, action)`, where `action` is
  `'own' | 'want' | 'dismiss'`. It keeps the optimistic hide and the 409
  wording, and builds the message from a map:
  `{own: 'Added X to the collection', want: 'Added X to the want list', dismiss: 'Dropped X'}`.
- Render, in this order, `buy_now` (grouped with `groupByPlatform`, an `h3`
  per console), `preorders`, `later` and `not_on_cartridge`. Each section is
  `<section aria-labelledby>` with an `h2` from `spine.next.sections`, and
  is hidden when it has no visible rows. Each row is
  `<NextRow row={entry} section={key} actions={…} extra={<StoreLines lines={entry.store_lines} />} />`.
- The actions are Got it, Want and Not interested in buy_now, preorders and
  later, and only Not interested in `not_on_cartridge`. Each button's
  `aria-label` is `` `${label}: ${entry.title}` ``.
- `StoreLines` is a local component: a `ul.store-lines` of
  `` `${line.store}${line.price ? ` · ${MONEY(line)}` : ''}${line.availability === 'preorder' ? ' · pre-order' : ''}` ``.
  `MONEY` uses the currency sign map, `{USD: '$', EUR: '€', GBP: '£'}`,
  falling back to `"59.99 CAD"`.
- Keep the page's existing notes ("On Switch 2 boxes, put back Game-Key
  Cards.") and the empty-state copy.

`LastNightly.jsx`: replace the two `?kind=` calls with one
`apiFetch('/api/recommendations/store-list')`, and read
`generated = body.generated_at`. Update `Admin.test.jsx`'s stub: the
fallback branch returns `{ generated_at: { radar: null, discover: null } }`.

- [ ] **Step 4: Run, expect pass; the suite; build.**

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/AdminStoreList.jsx frontend/src/pages/AdminStoreList.test.jsx frontend/src/components/LastNightly.jsx frontend/src/pages/Admin.test.jsx
git commit -m "feat(admin): store list reads the shared server sections

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 18: `smoke.sh` checks

**Files:**
- Modify: `scripts/smoke.sh`

- [ ] **Step 1: Add, after the `for name in picks radar` block:**

```bash
# Spine Next: What's next is a page and a public object with its sections.
check_equals "GET /spine/next (deep link)" "$(http_status "$SITE_URL/spine/next")" "200"
next_body="$(curl -s -m 90 "$API_URL/api/public/next")"
if printf '%s' "$next_body" | jq -e \
  'type == "object" and (["tonight","wanted","buy_now","preorders","later","not_on_cartridge","generated_at"] - keys == [])' \
  > /dev/null 2>&1; then
  report_pass "public next has its sections" "object, all keys"
else
  report_fail "public next has its sections" "got '${next_body:0:80}'"
fi
if printf '%s' "$next_body" | grep -qE "$OUTPUT_FORBIDDEN"; then
  report_fail "public next exposes no private fields" "found a forbidden key"
else
  report_pass "public next exposes no private fields" "no forbidden key"
fi

# The nightly job's token: no token and a wrong one are both refused.
check_equals "POST /api/picker/next with a wrong job token" \
  "$(curl -s -o /dev/null -m 90 -w '%{http_code}' -X POST \
    -H 'Authorization: Bearer wrong' -H 'Content-Type: application/json' \
    -d '{}' "$API_URL/api/picker/next")" \
  "401"
```

The no-token case already exists ("POST /api/picker/next unauthenticated").
Leave it. Also change `for name in items stats picks radar; do snapshot_check`
to include `next`.

`OUTPUT_FORBIDDEN` matches `"(…|reason|…)"` with quotes, so `"reasons"` does
not match it. It contains `"status"`, which `next` never carries.

- [ ] **Step 2: Verify:** `bash -n scripts/smoke.sh` → no output.

- [ ] **Step 3: Commit**

```bash
git add scripts/smoke.sh
git commit -m "test(smoke): What's next page, endpoint and job token checks

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 19: Docs: README, the how-it-works post, `CLAUDE.md`

**Files:**
- Modify: `README.md` (`## Routes` table; `## Collection snapshot` gains `next`; `## Public API` gains `/api/public/next`)
- Modify: `frontend/posts/how-spine-works.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: README.**
  - Routes: add `/spine/next` (What's next, public, reads
    `/api/public/next`).
  - Public API: add `GET /api/public/next`, its keys, and the rules: public
    games only in reasons, registry dates only, no store data.
  - Collection snapshot: `next.json` (optional).
  - Note that `/spine` no longer calls `/api/public/picks` or
    `/api/public/radar`; both stay until the follow-up retires them
    (spec, item 10).

- [ ] **Step 2: Post.** In "What the public sees":
  - remove "Discover stays private: its output is a shopping list" and say
    that Discover's top picks appear on What's next, with reasons that name
    only public games;
  - replace "the two live strips" with the page;
  - add a short example response (trimmed by hand from a real
    `/api/public/next` body, or from the Task 9 test fixture), with one row
    in `buy_now` and one in `preorders`.

  Keep the post's first-person voice.

- [ ] **Step 3: `CLAUDE.md`.**
  - Add to the TODO list:

    `- [x] Spine Next — the nightly job (nightly.yml, JOB_TOKEN, items.JOB_ROUTES), /spine/next (What's next) from /api/public/next, the shelf trimmed to what I own with a band across, the compact masthead on tracker routes, and /admin/store-list on the same server sections. Spec and plan: docs/planning/2026-10-05-spine-next-*`

  - Add to Media tracker:
    - **Job token:** `require_admin` accepts `Bearer JOB_TOKEN` only on
      `items.JOB_ROUTES`, matched on the routed template, and
      `tests/test_job_token.py` is the point of it.
    - **Nightly order:** picks, then registry, then stores, then Switch 1
      (Sunday evenings in Denver), then resolve (up to 5 rounds), then
      Radar, then Discover (Sunday evenings), then the snapshot compare and
      the deploy hook. The pick lag is accepted.
    - **`next_list.py`** is the one sectioning authority. In public mode only
      registry dates count. Public reasons are rebuilt over public games,
      and Discover model text must pass both the id check and the title
      scan.
    - In the Architecture paragraph, "`/spine*` call the API" now includes
      `/spine/next`.

- [ ] **Step 4: Commit**

```bash
git add README.md frontend/posts/how-spine-works.md CLAUDE.md
git commit -m "docs: What's next, the nightly job and the public next endpoint

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 20: `next` in the build-time snapshot (Zone 4, deploy path)

**Files:**
- Modify: `frontend/scripts/fetch-snapshot.mjs` (`SNAPSHOTS`)
- Modify: `frontend/scripts/fetch-snapshot.test.mjs`

- [ ] **Step 1: Write the failing test:** `SNAPSHOTS.next` exists, is not
  required, and its `valid` accepts `{tonight: {}, buy_now: []}` and rejects
  `[]`.

- [ ] **Step 2: Implement:**

```js
  // Optional, like picks and radar: What's next (Spine Next spec, C12).
  next: {
    path: '/api/public/next',
    valid: (body) => isObject(body) && 'tonight' in body && 'buy_now' in body,
    required: false,
  },
```

- [ ] **Step 3: Run the script's tests and `npm run build`.** The build runs
  the fetch, and with no API reachable locally the optional snapshot is only
  left out.

- [ ] **Step 4: Commit**

```bash
git add frontend/scripts/fetch-snapshot.mjs frontend/scripts/fetch-snapshot.test.mjs
git commit -m "build(snapshot): fetch the next snapshot

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Zones

```
Zone 1 (auto): tasks 1–3            PR A code: config, whitelist, admin line
CHECKPOINT — batch review
Zone 2 (auto): tasks 4–5            infra: render.yaml, env.example, nightly.yml (CI)
CHECKPOINT — batch review + PR A finish gate (ultra review: CI and IaC
             surface, per execution.md)
  → Joey: push, set JOB_TOKEN on Render + repo secret, merge, dispatch Nightly once
  → Joey: owned N64 carts into the collection (IGDB-matched), then dispatch
          Nightly with discover = true
Zone 3 (auto): tasks 6–19           PR B: backend, frontend, smoke, docs
CHECKPOINT — batch review
Zone 4 (auto): task 20              deploy path: fetch-snapshot.mjs
CHECKPOINT — batch review + PR B finish gate (ultra review: 4+ files)
```

**Parallel-safe flags** (only when dispatching parallel agents; the default
is sequential):

| Tasks | Parallel-safe? | Why |
|---|---|---|
| 1 → 2 | no | 2 reads `app.state.job_token` |
| 3 | yes, with 1–2 | frontend only |
| 4, 5 | yes, with each other | separate files |
| 6 → 7 → 8 → 9 → 10 | no | same module chain |
| 11, 13 | yes, with 6–10 and with each other | separate frontend files |
| 12 | after 11 | both touch `index.css` |
| 14 → 15 → 16 → 17 | no | shared components and `index.css` |
| 18 | yes, any time after 9 | `scripts/smoke.sh` only |
| 19 | last in Zone 3 | describes the finished state |

## Automated environment tests

- **The smoke util exists:** `scripts/smoke.sh`, invoked as
  `./scripts/smoke.sh https://joey-haas.dev https://api.joey-haas.dev`.
  Task 18 adds `/spine/next` (200), the `/api/public/next` key set and
  forbidden-key scan, the `next` snapshot scan, and the wrong-token 401.
  Passing means every line is a pass and the script exits 0. A warning
  for a snapshot that isn't deployed yet is acceptable on the first deploy
  only.
- **PR A, after deploy:**
  1. smoke is green;
  2. Joey runs Actions → Nightly → Run workflow;
  3. its summary reads "every refresh and generate step succeeded", or names
     the failed steps;
  4. `/admin` shows "Last nightly: catalogue <today> · ok";
  5. Render's logs for the run window show `job token accepted: POST
     /api/picker/next` and the other job routes only, and no 5xx.
- **PR B, after deploy:**
  1. smoke is green;
  2. `curl -s https://api.joey-haas.dev/api/public/next | jq '.buy_now | length, (.preorders | length)'`
     returns non-zero counts;
  3. `curl -s https://joey-haas.dev/snapshot/next.json | jq 'keys'` lists the
     sections;
  4. E21 count: the number of pending cartridges per `release_source`, from
     `GET /api/recommendations/store-list` while signed in (the admin rows
     carry `release_date` and a store-only row sits in Pre-orders there but
     in Later on the public page), or a read-only SQL query on Neon:
     `select source_metadata->>'release_source', count(*) from recommendations where status = 'pending' and physical_format = 'game_card' group by 1;`.
     If most are `store` or `igdb_first`, item 9's `igdb_platform`
     extension is the next follow-up;
  5. E22 visual pass with screenshots: light theme and 390px on `/`,
     `/spine`, `/spine/next`, one item page and `/admin/store-list`;
  6. Render logs clean.

  Green smoke with fresh errors in the logs does not count as done.

## Follow-ups (not in this plan)

- Retire `/api/public/picks` and `/api/public/radar` once `fetch-snapshot`,
  smoke and the post no longer name them.
- `igdb_platform` as a public date source, if E21's count calls for it.
- The status-colour retune and the item-page backdrop (second look, findings
  3 and 4).
