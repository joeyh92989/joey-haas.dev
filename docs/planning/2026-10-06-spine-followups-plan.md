# Spine Follow-ups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close follow-up issues #40–#46 (everything except the copy pass, #39) as four PRs: retire and tidy, the cache, the colours, and the backfill script.

**Architecture:** This is mostly removal and hardening on top of Spine Next.
- PR 1 deletes `/api/public/picks` and `/api/public/radar` everywhere. It re-pins their guarantees through `/api/public/next`, and lands the review tidy-up, the flaky-test hunt and the #43 title check.
- PR 2 adds a fingerprint-keyed, single-entry cache in front of `/api/public/next`.
- PR 3 changes two status tokens per theme and drops the item-page backdrop.
- PR 4 adds a dry-run-first backfill script.

**Tech Stack:** FastAPI + SQLAlchemy async + Postgres (pytest); React 19 + Vitest; plain CSS tokens; GitHub Actions.

**Spec:** `docs/planning/2026-10-06-spine-followups-design.md` (D1–D8). Where this plan refines the spec, it says **(refines spec)**.

## Global Constraints

- **No migration.**
- **Branches.** PR 1 is `spine-followups-retire` (it exists, and holds the spec and this plan). PR 2 is `spine-followups-cache`, PR 3 is `spine-followups-colours`, PR 4 is `spine-followups-backfill`. Each branches from `origin/main` after the previous PR merges.
- **Never** commit on `main`. Never use `git stash`, `git reset` or rebase.
- **Merging (spec D8).** Claude merges each PR (squash) once its review is clean and CI is green, then verifies the deploy with `./scripts/smoke.sh https://joey-haas.dev https://api.joey-haas.dev`.
- **Commits.** Conventional, ≤5 files, each independently green. Every message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Each PR body ends with `Closes #N` for its issues, and the attribution line `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- **After every file change.**
  - Backend: `cd backend && ./.venv/bin/ruff format . && ./.venv/bin/ruff check .`
  - Frontend: `cd frontend && npx prettier --write <file> && npx eslint <file>`
- **Suites.**
  - Backend: `cd backend && ./.venv/bin/pytest -q`
  - Frontend: `cd frontend && npm test && npm run build`
  - Never run two DB-backed pytest runs at once.
- **Public outputs.** Every privacy rule from the Spine Next spec stays in force. The leak-walk test in `tests/test_public_outputs.py` must stay green and must not be weakened.
- **CSS.** Tokens only, defined in both theme blocks. Status colours clear 3:1 against `--surface` in both themes, and `--status-backlog` also clears 3:1 against `--border`. Record the measured ratios in the commit message.
- **Copy.** `content/*.js` holds the copy. #39, the copy pass, is out of scope; don't reword existing strings.

---

# PR 1 — Retire, tidy, harden (#40, #45, #46, #43) — branch `spine-followups-retire`

### Task 1: Re-pin the picks guarantees through `/api/public/next`

**Files:**
- Modify: `backend/tests/test_public_outputs.py`

**Interfaces:**
- Consumes: `GET /api/public/next` → `tonight.picks[]`, each `{item_id, type, title, cover_url, platform, reasons}`.

- [ ] **Step 1.** List every test that requests `/api/public/picks`:
  `grep -n "api/public/picks" backend/tests/test_public_outputs.py`. There are 12.
- [ ] **Step 2.** Rewrite each to call `/api/public/next` and read `body["tonight"]["picks"]`. Where a test compares `row["id"]`, compare `row["item_id"]`.
  - Keep each test's name, setup and intent. Rename only where the name says "picks route".
  - Where a test asserted an empty picks list, assert `body["tonight"]["picks"] == []`.
  - Where it asserted `PublicPickOut`'s exact fields, assert the tonight card's fields instead: `{"item_id","type","title","cover_url","platform","reasons"}`.
- [ ] **Step 3.** Run `./.venv/bin/pytest tests/test_public_outputs.py -q`. All tests pass, and the picks route still exists at this point.
- [ ] **Step 4.** Commit `test(public): pin the picks rules through /api/public/next`.

### Task 2: Port any radar-only guarantee, then delete both routes

**Files:**
- Modify: `backend/public.py`, `backend/public_outputs.py`, `backend/tests/test_public_outputs.py`, `backend/tests/test_public.py`

- [ ] **Step 1.** For each `/api/public/radar` test in `test_public_outputs.py` (lines ~428–660), find its `/api/public/next` twin and write the mapping into the PR description. The rules are:
  - only registry dates, with a store date leaving the row undated;
  - IGDB-only links (`igdb_url` must start with `https://www.igdb.com/`);
  - no store, price, currency, availability or window;
  - never the Switch 1 sheet's date;
  - precision filtering.

  Where a rule has no `/next` twin, add one before deleting. The Switch 1 sheet date rule probably needs one: a pending Radar row whose `release_source` is `nscollectors_ns1` publishes `release_date: null` in `/next`.
- [ ] **Step 2.** Delete the radar tests and the `RADAR_FIELDS`, `PICK_FIELDS` and `_radar`-only helpers they leave unused. Keep `_radar`: the `/next` tests use it.
- [ ] **Step 3.** In `backend/public.py`, delete the `/picks` and `/radar` routes and their imports (`PublicPickOut`, `PublicRadarOut`, `load_public_picks`, `load_public_radar`).
- [ ] **Step 4.** In `backend/public_outputs.py`:
  - delete `load_public_picks`, `RADAR_LIMIT`, `PublicRadarOut` and `load_public_radar`;
  - keep `PublicPickOut` (rename it `_PickRow` only if nothing outside the module imports it; check with grep);
  - keep `public_picks_with_day`;
  - update the module docstring and the `PICKS_WINDOW` comment ("see load_public_picks" becomes "see public_picks_with_day").
- [ ] **Step 5.** `backend/tests/test_public.py`, around lines 663, 779, 867 and 917: remove the picks/radar requests and imports. Where a test checked "every public route hides X", keep it for the routes that remain.
- [ ] **Step 6.** Run the full backend suite and ruff. Then `grep -rn "public/picks\|public/radar\|load_public_radar\|PublicRadarOut" backend --include='*.py'` must print nothing.
- [ ] **Step 7.** Commit `refactor(public): retire /api/public/picks and /api/public/radar` (4 files).

### Task 3: Snapshot, nightly compare and smoke (Zone 2: CI and deploy path)

**Files:**
- Modify: `frontend/scripts/fetch-snapshot.mjs`, `frontend/scripts/fetch-snapshot.test.mjs`, `frontend/src/lib/snapshot.js`, `frontend/src/lib/snapshot.test.js`, `.github/workflows/nightly.yml`

- [ ] **Step 1.** Remove the `picks` and `radar` entries from `SNAPSHOTS` in `fetch-snapshot.mjs` and `SHAPES` in `snapshot.js`, and their test cases. `items`, `stats` and `next` remain.
- [ ] **Step 2.** In `nightly.yml`'s compare step:
  - the loop becomes `for name in items stats next; do`;
  - the comment says "next is optional";
  - `fail()` is unchanged.

  Then run `ruby -ryaml -e 'YAML.load_file(".github/workflows/nightly.yml")'` and `bash -n` on the extracted run block (scratchpad, as in Spine Next).
- [ ] **Step 3.** Run `cd frontend && npm test && npm run build`.
- [ ] **Step 4.** Commit `build(snapshot): stop copying picks and radar` (5 files).

### Task 4: Smoke and docs for the retirement

**Files:**
- Modify: `scripts/smoke.sh`, `README.md`, `CLAUDE.md`, `frontend/scripts/README.md`, `frontend/posts/how-spine-works.md`

- [ ] **Step 1.** `smoke.sh`:
  - remove the `for name in picks radar` key-set block and the `PICKS_KEYS` / `RADAR_KEYS` variables;
  - drop `picks` and `radar` from the `snapshot_check` loop;
  - keep `OUTPUT_FORBIDDEN`, which the next checks use.

  Run `bash -n`.
- [ ] **Step 2.** Update the docs:
  - README: Public API, Collection snapshot, and every mention;
  - `frontend/scripts/README.md`;
  - CLAUDE.md: the Architecture paragraph, the Media tracker notes that name the two routes, and the Showcase TODO entry (now "retired by #40");
  - the post: describe `/api/public/next` only.

  Remove every claim that the two routes exist. Check with `grep -rn "public/picks\|public/radar" README.md CLAUDE.md frontend/scripts/README.md frontend/posts scripts` and confirm only historical mentions remain, worded as retired.
- [ ] **Step 3.** Commit `docs: picks and radar are retired` (5 files).

### Task 5: Physical-sources docs pointer

**Files:**
- Modify: `backend/physical_sources/README.md`, `backend/physical_sources/collapse.py`, `backend/tests/test_physical_collapse.py`

- [ ] **Step 1.** Repoint every mention of "`/api/public/radar` publishes only registry dates" to `/api/public/next`'s public date rule (`next_list.PUBLIC_DATE_SOURCES`). This covers the README (~167–172), the comment above `REGISTRY_SOURCES` in `collapse.py` (~53), and the test docstring (~353). Docs and comments only; no behaviour change.
- [ ] **Step 2.** Run the backend suite and ruff. Commit `docs(physical): the public date rule lives in next_list` (3 files).

### Task 6: #43 — the spared item must still carry the row's title

**Files:**
- Modify: `backend/next_load.py`, `backend/tests/test_next_load.py` (or wherever the `taste_sparing_owned` tests live; check with grep), `docs/planning/2026-10-05-spine-next-design.md`

**Interfaces:**
- `taste_sparing_owned(data, shown)` keeps its signature.

- [ ] **Step 1: Failing test.** Build an owned frozen row "Hades II" (IGDB 1, platform 508), rendered, plus the private Already-own item with the same identity but title "Secret Rename". The public taste's `private_titles` must include "Secret Rename". Today it is spared.
- [ ] **Step 2: Implement.** In `taste_sparing_owned`, map each spared identity to its row's normalised title:

```python
def _title_key(title: str | None) -> str:
    return (title or "").strip().casefold()

owned = {
    _identity(c.payload): _title_key(c.payload.title)
    for c in data.candidates
    if c.payload.status == RecommendationStatus.OWNED
}
shown_ids = {_identity(row) for row in shown}
spared = {key: title for key, title in owned.items() if key in shown_ids}

def is_spared(item: Item) -> bool:
    if item.external_source is None or item.external_id is None:
        return False
    return any(
        (source, external_id) == (item.external_source, item.external_id)
        and item.platform_id in (None, platform_id)
        and _title_key(item.title) == title
        for (source, external_id, platform_id), title in spared.items()
    )
```

  Extend the docstring with one sentence: "…and the item still carries the row's title, so a renamed or re-linked item is scanned like any other private game (#43)."
- [ ] **Step 3.** Run the focused `next_load` and `public_outputs` tests, then the full backend suite. The F1 byte-identical freeze tests must stay green.
- [ ] **Step 4: Spec.** In S9 of `2026-10-05-spine-next-design.md`, record the title condition, and record residuals (a) and (c) as accepted 2026-10-06 (#43).
- [ ] **Step 5.** Commit `fix(next): a spared owned item must still carry the row's title (#43)` (3 files).

### Task 7: #45 backend tidy-up

**Files:**
- Modify: `backend/items.py`, `backend/tests/test_job_token.py`, `backend/recommendations_routes.py`, `backend/tests/test_recommendations_routes.py`, `backend/tests/test_next_list.py`

- [ ] **Step 1: `items.py`.** Make `_job_token_ok` return the matched route template, or `None`, so `require_admin` logs it without computing `_job_route` twice:

```python
def _job_token_route(request: Request) -> str | None:
    """The matched job route when the bearer token is valid for it, else None."""
    expected = getattr(request.app.state, "job_token", None)
    route = _job_route(request)
    if not expected or route is None:
        return None
    scheme, _, presented = request.headers.get("authorization", "").partition(" ")
    if scheme.lower() != "bearer" or not presented:
        return None
    return route if secrets.compare_digest(presented.encode(), expected.encode()) else None
```

  `require_admin` then does `if (route := _job_token_route(request)) is not None: logger.info("job token accepted: %s %s", request.method, route); return`. Keep the existing tests green.
- [ ] **Step 2: `test_job_token.py`.** Replace the stub-app trailing-slash test with a comment noting that FastAPI's `redirect_slashes` answers 307 before routing. That 307 is already asserted by the real-router test.
- [ ] **Step 3: Store-list titles become links.** `recommendations_routes._row_out` adds `"igdb_url": _igdb_url(row.source_metadata or {})`, imported from `public_outputs`; it is the same igdb.com-only check. Test: a store-list row carries `igdb_url` for an IGDB snapshot, and `None` for a non-IGDB URL.
- [ ] **Step 4: `next_list` test gaps.** Add these cases:
  - the cap hides undated rows first (12 dated plus 3 undated far rows leaves no undated row in `later`);
  - ties on the same date keep best-first order;
  - the exact 90-day boundary (day 90 is a pre-order, day 91 is later);
  - a month dated today-month whose last day is today counts as released;
  - leap-year February (`period_end(date(2028,2,1),"month") == date(2028,2,29)`).
- [ ] **Step 5.** Run the suite and ruff. Commit `chore(api): tidy the job-token path, link store-list titles, widen next_list tests (#45)` (5 files).

### Task 8: #45 frontend tidy-up

**Files:**
- Create: `frontend/src/lib/releaseWords.js`
- Modify: `frontend/src/pages/AdminRadar.jsx`, `frontend/src/components/NextRow.jsx`, `frontend/src/pages/AdminStoreList.jsx`, `frontend/src/pages/AdminStoreList.test.jsx`

- [ ] **Step 1: Move `releaseWords`.**
  - Move `releaseWords` and its private helpers (`utc`, `MONTH`, `dayWords`) from `AdminRadar.jsx` into `lib/releaseWords.js`, exported with JSDoc.
  - `AdminRadar.jsx` imports it and re-exports it (`export { releaseWords } from '../lib/releaseWords.js'`), so existing imports keep working.
  - `NextRow.jsx` imports it from `lib`.
- [ ] **Step 2: Store-list focus.** In `AdminStoreList.jsx`, after `answer()` hides a row, move focus to the next visible row's first action button. When none remains, focus the `role="status"` line, which gets `tabIndex={-1}`. Use refs or a query on the list; never `setTimeout`.
  - Test: answer the first row, and `document.activeElement` is the second row's "Got it".
  - Test: answer the last remaining row, and focus is on the status line.
- [ ] **Step 3.** Run `npx vitest run src/pages/AdminStoreList.test.jsx src/components/NextRow.test.jsx src/pages/AdminRadar.test.jsx`, then `npm test` and `npm run build`. Commit `refactor(frontend): releaseWords to lib; store list keeps focus after an answer (#45)` (5 files).

### Task 9: #45 frontend polish

**Files:**
- Modify: `frontend/src/index.css`, `frontend/src/components/SiteHeader.jsx`, `frontend/src/components/LastNightly.jsx`, `frontend/src/pages/Admin.test.jsx`, `frontend/src/pages/Next.jsx`

- [ ] **Step 1: The first nav item's focus ring.** In the 34rem block, `.nav-row nav` gets `padding-inline: 0.25rem 2rem` and `margin-inline-start: -0.25rem`, keeping the existing right padding for the fade. Verify in a browser at 375px by tabbing to "Home": the ring is fully visible.
- [ ] **Step 2: `FADE_PX`.** In `SiteHeader.jsx`, add a comment that it mirrors the CSS `2rem` fade width in `.nav-row nav`'s mask, and that the two change together.
- [ ] **Step 3: The stale "Last nightly" line.** In `LastNightly.jsx`, when `summary.stale`, render the line with `className="admin-error last-nightly"` instead of `muted`. Test in `Admin.test.jsx`: the "may have stopped" line has the `admin-error` class.
- [ ] **Step 4: Not on cartridge count.** In `Next.jsx`, the `<summary>` shows "(N)" only when N > 0. Test it in `Next.test.jsx`, which is a 6th file. If you add that test, split the commit: the CSS and SiteHeader in one, LastNightly, Admin.test, Next and Next.test in another.
- [ ] **Step 5.** Run `npm test` and `npm run build`. Commit each part with `style(site): …` / `fix(admin): …` (#45).

### Task 10: #46 — the flaky-test hunt (time-boxed)

**Files:** depends on the culprit; at most 3.

- [ ] **Step 1: Hunt.**
  - In the scratchpad, start CPU load on every core: `for i in $(seq $(sysctl -n hw.ncpu)); do yes > /dev/null & done`.
  - Run `cd frontend && for i in $(seq 20); do npx vitest run 2>&1 | grep -E "FAIL|×" ; done` and record each failing test's name.
  - Always stop the load afterwards: `pkill yes`.
- [ ] **Step 2: If it reproduces.** Fix that test deterministically, with fake timers or a held, resolved promise, never by lengthening timeouts. Prove it with 20 clean runs under load.
- [ ] **Step 3: If it never reproduces.** Harden the known suspects:
  - `AdminItem.test.jsx`'s in-flight re-link test must wait for the held promise to exist before calling `answer()`, e.g. `await waitFor(() => expect(answer).toBeDefined())`;
  - `Next.test.jsx`'s "Waking the server" test must wrap the timer advance in `act`;
  - check `Collection.test.jsx`'s waking test the same way.
- [ ] **Step 4.** Run `npm test` 3 times. Commit `test: make the timing-sensitive tests deterministic (#46)`. Record in the PR body whether the failure reproduced, and which test it was.

**PR 1 finish:**
- Run the full suites.
- Ultra review: 4+ files plus a CI-workflow change.
- Open the PR "Spine follow-ups 1: retire picks/radar, tidy-up, #43 hardening" with `Closes #40, Closes #43, Closes #45, Closes #46`.
- When CI is green, merge.
- Run `./scripts/smoke.sh` against production. It must pass with no picks/radar lines.
- `GET https://api.joey-haas.dev/api/public/picks` should now return 404 (FastAPI answers 404 for a route that no longer exists).

---

# PR 2 — Cache `/api/public/next` (#44) — branch `spine-followups-cache`

### Task 11: Bound the pick-event query

**Files:**
- Modify: `backend/public_outputs.py`, `backend/tests/test_public_outputs.py`

- [ ] **Step 1: Failing test.** A NEVER event from 30 days ago still keeps that game out of `tonight.picks`, even when it is shown yesterday. Today that passes; it must keep passing after the bound. Also add a timing-independent test: a SHOWN event 10 days ago does not count. That is existing behaviour, re-asserted.
- [ ] **Step 2: Implement.** In `public_picks_with_day`'s event query, add:

```python
or_(
    PickEvent.action == PickAction.NEVER,
    PickEvent.created_at >= window_start,
),
```

  Import `or_` from sqlalchemy. Add a comment: a never is permanent, while shown and skipped events matter only inside the window (skips count only at or after a windowed shown event).
- [ ] **Step 3.** Run the focused tests, then the full suite. Commit `perf(public): bound shown and skipped pick events to the window (#44)` (2 files).

### Task 12: The fingerprint cache

**Files:**
- Create: `backend/public_next_cache.py`, `backend/tests/test_public_next_cache.py`
- Modify: `backend/public.py`

**Interfaces:**
- Produces:
  - `async def next_fingerprint(session, now) -> tuple`;
  - `class PublicNextCache` with `async def get(self, session, now, build) -> PublicNextOut`.

- [ ] **Step 1: Failing tests** (DB):
  - two calls in a row build once (`build` is a counting wrapper around `load_public_next`);
  - each of these makes the next call rebuild:
    - a new Radar generation (insert a pending row with a later `generated_at`);
    - answering a row (status change);
    - an item update (title edit);
    - an item delete;
    - a new `CatalogueRun`;
    - moving the `clock` fixture to the next UTC day;
  - two concurrent `get` calls on a cold cache build once (`asyncio.gather`).
- [ ] **Step 2: Implement** `backend/public_next_cache.py`:

```python
"""A single-entry cache in front of GET /api/public/next (spec, PR 2, D3).

The body is rebuilt only when something it is built from changes: the UTC
day (picks roll over at midnight), either kind's latest generation or the
count of its rows in each status (an answer), the items (any edit or
delete), or the catalogue's latest run. Checking that fingerprint is one
small aggregate query; building the body is the expensive part on Render's
free tier. Admin routes never use this: the store list stays live.

Deliberately stricter than the uncached route: a "never" event the admin
restore route deletes leaves the fingerprint unchanged, so a restored game
reappears at the next UTC midnight rather than at once.
"""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from models import CatalogueRun, Item, Recommendation

Build = Callable[[AsyncSession, datetime], Awaitable[object]]


async def next_fingerprint(session: AsyncSession, now: datetime) -> tuple:
    """Everything /api/public/next's body depends on, as one comparable tuple."""
    recs = (
        await session.execute(
            select(
                Recommendation.kind,
                Recommendation.status,
                func.count(),
                func.max(Recommendation.generated_at),
            ).group_by(Recommendation.kind, Recommendation.status)
        )
    ).all()
    items = (
        await session.execute(select(func.count(), func.max(Item.updated_at)))
    ).one()
    catalogue = await session.scalar(select(func.max(CatalogueRun.finished_at)))
    return (
        now.astimezone(UTC).date(),
        tuple(sorted((k.value, s.value, n, g) for k, s, n, g in recs)),
        tuple(items),
        catalogue,
    )


class PublicNextCache:
    """Holds one built body and the fingerprint it was built at."""

    def __init__(self) -> None:
        self._key: tuple | None = None
        self._body: object | None = None
        self._lock = asyncio.Lock()

    async def get(self, session: AsyncSession, now: datetime, build: Build):
        """The cached body when the fingerprint is unchanged, else a fresh
        build. Concurrent misses build once."""
        key = await next_fingerprint(session, now)
        if key == self._key:
            return self._body
        async with self._lock:
            if key != self._key:
                self._body = await build(session, now)
                self._key = key
        return self._body
```

  If `Item.updated_at` is not set on insert (check `models.py` around line 238 for `server_default`), `count` still changes on insert, so the tuple stays correct.
- [ ] **Step 3: Wire it.** In `public.py`'s `create_public_router`, create `next_cache = PublicNextCache()` once per router (that is, per app), and make the `/next` route `return await next_cache.get(session, datetime.now(UTC), load_public_next)`. The existing `/next` tests must stay green. They build a fresh app per client, so each test starts with an empty cache.
- [ ] **Step 4: Measure.** Locally, with a realistic fixture (50 pending rows and 70 public games), time 5 calls to the endpoint, before and after the change. Record the numbers for the PR body.
- [ ] **Step 5.** Run the full suite and ruff. Commit `perf(public): cache /api/public/next on a data fingerprint (#44)` (3 files).
- [ ] **Step 6: Docs.** Add one line to CLAUDE.md's Media tracker notes and README's Public API: `/api/public/next` is cached on a data fingerprint (`public_next_cache.py`), and admin routes are not. Commit `docs: /api/public/next is cached (#44)` (2 files).

**PR 2 finish:**
- Single reviewer: 3 code files and no infra.
- Open the PR with `Closes #44`, then merge when green.
- After deploy, run smoke and time two calls with `curl -s -o /dev/null -w '%{time_total}\n' https://api.joey-haas.dev/api/public/next`. Record both in the PR comment.

---

# PR 3 — Status colours and the item backdrop (#42) — branch `spine-followups-colours`

### Task 13: Status colours

**Files:**
- Modify: `frontend/src/index.css`

The target values were measured 2026-10-06 with the WCAG relative-luminance formula. Re-measure them before committing.

| Token | Dark (was → now) | vs `--surface` / `--border` | Light (was → now) | vs `--surface` / `--border` |
|---|---|---|---|---|
| `--status-backlog` | `#a38f72` → `#9c8158` | 4.25 / 3.06 | `#836f55` → `#8f6c45` | 3.99 / 3.39 |
| `--status-abandoned` | `#7a7874` → `#6f7a86` | 3.58 / — | `#817e7a` → `#5f6a75` | 4.62 / — |

`--status-finished` and `--status-active` are unchanged.

> **Superseded in review:** these values separate by hue only. The shipped values step in lightness too; see the spec's PR 3 "As built" note and commit c4facbb.

**(Refines spec):** the second look suggested a dark-theme backlog around lightness 45. At that level it falls below 3:1 against `--border` (about 2.8). So backlog keeps lightness 48 and separates by warmth and saturation, and abandoned separates by hue: a cool blue-grey reads as "set aside".

- [ ] **Step 1.** Write `measure.py` in the scratchpad. It reads the tokens from `index.css` and prints each status colour's ratio against `--surface` (and backlog's against `--border`) for both themes. Run it before and after, and require every value ≥ 3.0.
- [ ] **Step 2.** Change the four values, and update the tokens' comment if it lists the ratios.
- [ ] **Step 3: Visual check.**
  - Run `npx vite --port 5199 --strictPort` with the gitignored `/snapshot/{items,stats}.json` fixtures. Prefer the live API snapshot: `curl` the public items and stats into them, then delete them afterwards.
  - Check the `/spine` stacked bar, its legend and the status chips, at desktop and at 390px, in both themes.
  - Save screenshots to the scratchpad.
- [ ] **Step 4.** Run `npm test` and `npm run build`. Commit `style(spine): status colours separate by hue and lightness (#42)`. Put every measured ratio in the message body.

### Task 14: Drop the item-page backdrop

**Files:**
- Modify: `frontend/src/pages/Item.jsx`, `frontend/src/pages/Item.test.jsx`, `frontend/src/index.css`

- [ ] **Step 1: Failing test.** Update `Item.test.jsx`:
  - the hero test asserts no `.item-hero-backdrop` exists, with or without a cover;
  - `.item-hero` has no `data-empty` attribute;
  - the cover image still renders in `.item-cover`;
  - the no-cover test keeps its placeholder assertion.
- [ ] **Step 2: Implement.**
  - In `Item.jsx`, render `<div className="item-hero" />`: no image and no `data-empty`. The band is a plain `--surface` panel, which the cover overlaps exactly as now.
  - In `index.css`, delete `.item-hero-backdrop`, `.item-hero::after` and `.item-hero[data-empty]::after`.
  - Update the comment above `.item-hero`: "The hero band is a plain --surface panel; the cover overlaps its bottom edge."
- [ ] **Step 3: Visual check.** An item page at 390px and at desktop, in both themes, with a cover and without one. Screenshots go to the scratchpad.
- [ ] **Step 4.** Run `npm test` and `npm run build`. Commit `style(item): drop the blurred backdrop; the cover sits on --surface (#42)` (3 files).

**PR 3 finish:**
- Single reviewer.
- Open the PR with `Closes #42`, attaching the before and after screenshots.
- Merge when green, run smoke, then do a quick visual check on production.

---

# PR 4 — The store-date backfill script (#41) — branch `spine-followups-backfill`

### Task 15: `clear_store_release_dates.py`

**Files:**
- Create: `backend/scripts/clear_store_release_dates.py`, `backend/tests/test_clear_store_release_dates.py`
- Modify: `backend/scripts/README.md`

**Interfaces:**
- Produces:
  - `async def find_store_dated(session) -> list[Row]`, where a `Row` holds `item_id`, `title`, `platform`, `release_date`, `release_source` and `release_precision`;
  - `async def clear(session, rows) -> int`;
  - a `main()` CLI with `--apply`.

- [ ] **Step 1: Failing tests** (DB). Each case gets an item plus its recommendation row:
  - (a) a WANTED row with `release_source="store"` and day precision, plus its item with the same `release_date`: selected;
  - (b) an OWNED Discover row with no `release_source`, same date: selected;
  - (c) a WANTED row with `registry` and day precision, same date: not selected;
  - (d) a WANTED store row whose item's `release_date` differs (edited since): not selected;
  - (e) a PENDING store row: not selected.

  Then `clear()` sets (a) and (b) to `NULL`, leaves the others, and returns 2.
- [ ] **Step 2: Implement.**

```python
"""Clear release dates that Want / Already own copied from a store (#41).

Before #38, answering a Radar or Discover row copied the row's release_date
onto the new item whatever its source, so a store's date could reach
/api/public/items and What's next's Wanted list. #38 copies only a
registry, day-precise date (recommendations_routes._item_release_date).
This finds items still holding a copied date that would not pass that rule
today and, with --apply, sets their release_date to NULL. A later "Refresh
game metadata" on /admin/collection can refill dates from IGDB.

Dry run by default. Reads DATABASE_URL through load_config(), as the API does.
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from dataclasses import dataclass
from datetime import date
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))

from sqlalchemy import select, update  # noqa: E402
from sqlalchemy.ext.asyncio import AsyncSession  # noqa: E402

from config import load_config  # noqa: E402
from db import create_engine_and_sessionmaker  # noqa: E402
from models import Item, Recommendation, RecommendationStatus  # noqa: E402

ANSWERED = (RecommendationStatus.WANTED, RecommendationStatus.OWNED)


@dataclass(frozen=True)
class Row:
    item_id: object
    title: str
    platform: str | None
    release_date: date
    release_source: str | None
    release_precision: str | None


def _public_day(meta: dict) -> bool:
    return meta.get("release_source") == "registry" and meta.get("release_precision") == "day"


async def find_store_dated(session: AsyncSession) -> list[Row]:
    """Items whose release_date is still the one copied from an answered
    recommendation that was not a registry, day-precise date."""
    pairs = (
        await session.execute(
            select(Item, Recommendation).join(
                Recommendation,
                (Recommendation.external_source == Item.external_source)
                & (Recommendation.external_id == Item.external_id),
            ).where(
                Recommendation.status.in_(ANSWERED),
                Item.release_date.is_not(None),
                Item.release_date == Recommendation.release_date,
            )
        )
    ).all()
    seen: dict[object, Row] = {}
    for item, rec in pairs:
        meta = rec.source_metadata or {}
        if _public_day(meta) or item.id in seen:
            continue
        seen[item.id] = Row(
            item.id, item.title, item.platform, item.release_date,
            meta.get("release_source"), meta.get("release_precision"),
        )
    return sorted(seen.values(), key=lambda r: (r.title, str(r.item_id)))


async def clear(session: AsyncSession, rows: list[Row]) -> int:
    """Sets release_date to NULL on those items, in one transaction."""
    if not rows:
        return 0
    await session.execute(
        update(Item).where(Item.id.in_([r.item_id for r in rows])).values(release_date=None)
    )
    await session.commit()
    return len(rows)


async def run(apply: bool) -> None:
    config = load_config()
    engine, factory = create_engine_and_sessionmaker(config.database_url)
    try:
        async with factory() as session:
            rows = await find_store_dated(session)
            for r in rows:
                print(f"{r.title} · {r.platform or '?'} · {r.release_date} "
                      f"(source {r.release_source or 'none'}, {r.release_precision or 'no precision'})")
            print(f"{len(rows)} item(s) hold a copied non-registry date.")
            if apply and rows:
                print(f"Cleared {await clear(session, rows)} release date(s).")
            elif rows:
                print("Dry run: nothing changed. Re-run with --apply to clear them.")
    finally:
        await engine.dispose()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--apply", action="store_true", help="clear the dates (default: dry run)")
    asyncio.run(run(parser.parse_args().apply))


if __name__ == "__main__":
    main()
```

  Before relying on these, check the real signatures of `create_engine_and_sessionmaker` and `engine.dispose` in `db.py`, and the import pattern in `record_igdb_fixtures.py`, and match them. The tests call `find_store_dated` and `clear` with the `sessionmaker_for_test` fixture. They import the module from the `scripts` path; follow how `test_record_physical_fixtures.py` imports its script.
- [ ] **Step 3: README.** Add a `clear_store_release_dates.py` section to `backend/scripts/README.md` covering: what it does and why (#41); `cd backend && ./.venv/bin/python scripts/clear_store_release_dates.py` (dry run); the same command with `--apply`; that it reads `backend/.env`; and that it's safe to re-run (a second run finds nothing).
- [ ] **Step 4.** Run the suite and ruff. Commit `feat(scripts): clear store-sourced release dates copied by Want/Own (#41)` (3 files).

**PR 4 finish:**
- Single reviewer.
- Open the PR with `Closes #41`, and put the two commands in the body for Joey.
- Merge when green. No deploy-visible change. **Joey runs the script** (spec D7).

---

## Zones

```
Zone 1 (auto): tasks 1–2, 5–10      PR 1 code and tests
Zone 2 (auto): tasks 3–4            CI/deploy path: snapshot, nightly.yml, smoke, docs
CHECKPOINT: batch review + PR 1 finish gate (ultra review), merge, smoke
Zone 3 (auto): tasks 11–12          PR 2 cache
CHECKPOINT: review, merge, smoke + timing
Zone 4 (auto): tasks 13–14          PR 3 colours and backdrop
CHECKPOINT: review, merge, smoke + visual
Zone 5 (auto): task 15              PR 4 script (data tooling; the run is Joey's)
CHECKPOINT: review, merge → hand the commands to Joey
```

Joey asked to be stopped only when needed. Checkpoints are review gates, not pauses for him: execution continues through them, and stops only for a blocker or a privacy decision.

**Parallel-safe:** none. Implementers run strictly in sequence, sharing one working tree and one test database. Read-only reviewers may overlap with an implementer.

## Automated environment tests

- **The existing util:** `./scripts/smoke.sh https://joey-haas.dev https://api.joey-haas.dev`, after each merge and deploy. Passing means every line passes and it exits 0.
- **PR 1:** smoke no longer prints picks/radar lines, and `curl -s -o /dev/null -w '%{http_code}' https://api.joey-haas.dev/api/public/picks` returns `404`.
- **PR 2:** two timed `curl` calls to `/api/public/next`; the second (a cache hit) should be well under the first. Render's logs are clean.
- **PR 3:** a visual check on the production `/spine` and one item page, in both themes.
- **PR 4:** no production check. Joey's dry run is the check.
- **Every PR:** the backend suite, the frontend suite with the build, ruff, Prettier and ESLint, all green before merge.
