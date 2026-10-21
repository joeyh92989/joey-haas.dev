# Spine Tour Implementation Plan

> **For agentic workers:** execute task by task with `sdlc-execution`. Steps
> use checkbox (`- [ ]`) syntax for tracking.

**Goal:** add a fourth Spine tab, **How it works** at `/spine/how`: a field
guide in eight stops, with live public widgets beside drawn captures of the
signed-in tools. Also add a status strip and a "What Spine does" strip to
the `/spine` landing, both fed by one new allowlisted endpoint,
`GET /api/public/status`.

**Spec:** `docs/planning/2026-10-21-spine-tour-design.md`, with mockup
`mockups/2026-10-21-spine-tour/chosen.html`. Where this plan departs from
the spec it is marked **(refines spec)**, with the evidence for the change.

**Tech stack:** FastAPI + SQLAlchemy async (pytest); React 19 +
react-router v8 + Vitest; plain CSS tokens; Render Blueprint.

**Branch / worktree:** `feat/spine-tour` at
`~/Developer/joey-haas.dev-worktrees/feat-spine-tour`. One PR.

## Research findings that change the spec

Each finding below was checked against the code on `origin/main` (66b549f).

| # | Spec says | Code says | Resolution |
| --- | --- | --- | --- |
| R1 | "Last rebuilt 00:21 UTC, run #n" | No table records nightly runs; `lib/nightly.js:6-8` already reports the latest catalogue run for this reason. `catalogue_runs` has `finished_at`/`ok` per source; there is no run number. | **(refines spec)** The cell becomes **Last refreshed**: the latest `finished_at` of an `ok` catalogue run, shown in UTC to the minute. "run #n" is dropped. The dot means "within 36h", reusing `STALE_HOURS`. No new table. |
| R2 | Stop 1 live box: "the items that came from the most recent photo import, N spines read, M matched" | Nothing persists import provenance or match data (`importer.py:14-16`; `FormatSource.PHOTO` is never written). | **(refines spec)** The stop 1 live box becomes **"Newest on the shelf"**: the four most recently created public games (`created_at` is already public), with no claim that they came from a photo. The import figures stay in the capture, captioned illustrative. Recording imports would need a migration, which is out of scope. |
| R3 | Stop 3 live box shows Up next's "reason sentence" | `tonight.up_next.reasons` is always `[]` publicly (`public_outputs.py:343`); only `picks` carry reasons. | Up next shows cover, title and platform. The reason line comes from the first of the day's picks, labelled as that pick's. |
| R4 | `HowItWorks.jsx` "lazy like the other tracker pages" | Public pages are imported statically; only admin pages are lazy (`App.jsx:4-32`). | **(refines spec)** Import it statically, like `/spine/next`. |
| R5 | In-page anchors focus the stop's h2 "(the SPA shell's route-focus behaviour, PR #54)" | `useRouteFocus` deliberately returns early when there is a hash (`useRouteFocus.js:25-27`). Nothing in `src/` focuses an anchor target. | Add a page-local `useHashFocus` hook (in `lib/`). On a hash, it scrolls to and focuses `#stop-n h2` (with `tabindex=-1`). This covers a cold load, a feature card on `/spine`, and ToC clicks. `useRouteFocus` is left unchanged so other pages keep their behaviour. |
| R6 | "axe reports no violations"; Lighthouse within 5 points | Neither axe nor Lighthouse is installed or used anywhere. | Add **`axe-core` as a devDependency**, plus a Vitest test that runs it on both rendered pages. jsdom cannot compute colour contrast, so contrast is covered by AC10's measurement instead. Lighthouse is a **manual** check for you (Joey) on the deploy; I report the build's JS/CSS size delta instead. |
| R7 | Status fields `catalogue: {...}`, `stores: {...}` | `test_public.py` `CATALOGUE_NAMES` substring-bans `catalogue_`, `price`, `snapshot` in every public field name. `smoke.sh` bans the exact keys `"store"`, `"status"` and `"url"` in public bodies. | Flat keys that pass both checks (below). |

## Answers to the spec's open questions

1. **`/api/public/status` shape:** a flat `PublicStatusOut` with no nested objects.
   - `refreshed_at`: datetime | null. This is R1's value, truncated to the minute.
   - `titles`: int. The count of distinct non-null `igdb_id` across live `physical_editions`. That counts matched games only, so the hidden unmatched Switch 1 rows are not included.
   - `platforms`: int. The count of distinct `platform_id` across live editions.
   - `stores_watched`: int, `len(STORES)` (12).
   - `listings`: int. The count of live `store_listings` (non-archived), using the same predicate as `count_live()`.

   Picks and Discover dates are **not** repeated here, because the strip already reads `next.generated_at`. There is no `last_import` field (R2).

   It gets its own snapshot file, `snapshot/status.json`, rather than being folded into `next.json`. `next.json` mirrors a pinned body, and changing that contract for a strip isn't worth it. The status file is optional, like `next`.
2. **Stop 3's term bars:** these stay illustrative, as the spec recommends.
3. **Code links:** a Vitest test asserts that every `spine.how` GitHub path exists in the repo (`fs.existsSync` from the repo root). It's cheap and catches a renamed module at PR time, before the change deploys.
4. **`NEW` marker:** a constant (`spine.tabs.how.badge = 'NEW'`), with a comment to remove it in the next copy pass.
5. **Landing reads:** `items`, `next` and `status` snapshot reads run in parallel (`readSnapshot` is one `fetch` each), so it's one round-trip's worth at paint time. That's acceptable, and nothing gets folded.
6. **The post:** it stays as it is in this release. Its link is relabelled "The long version" where the guide links to it.

## Global constraints

- **No migration.** No change to `/api/public/next` or its cache fingerprint.
- **Formatting and linting after each change:**
  - Backend: `ruff format` + `ruff check`.
  - Frontend: `npx prettier --write` + `npx eslint` on the touched files.
- **Test suites:**
  - Backend: `./.venv/bin/pytest -q`, one run at a time.
  - Frontend: `npm test && npm run build`.
- **Commits:** conventional, at most 5 files each, and each green on its own. Each message ends with the session trailers.
- **Copy:** all copy lives in `content/spine.js` → `spine.how` / `spine.tabs.how`. I draft it from the mockup and the post; you (Joey) edit it in the PR.
- **Styling:** tokens only. One new token, `--redact`, declared in both theme blocks.

## Milestone 1 (auto): the page and the landing, frontend only

### Task 1: copy and the tab
- **Files:**
  - `content/spine.js`: add `spine.tabs.how`, plus `spine.how` with title, lede, the five features, the eight stops (`n`, `where`, `title`, `claim`, `why`, `links`), `empty.*` and the capture notes.
  - `components/SpineTabs.jsx`: add the fourth NavLink and the `NEW` marker.
  - `content/spine.test.js` (new): every stop has the required fields, the feature anchors map to real stops, and every code-link path exists in the repo.
- **AC:** four tabs, with the How it works tab active only on `/spine/how`.

### Task 2: primitives
- **Files:** `components/LiveBox.jsx`, `Capture.jsx`, `Redacted.jsx` and `BarRow.jsx`, plus CSS in `index.css`, which gains `--redact` in both blocks.
- **Accessibility:**
  - `Redacted` renders visually hidden "store withheld".
  - `Capture`'s bar dots and tag are `aria-hidden`; its note says "drawn".
  - Capture tables sit in an `overflow-x: auto` frame.
- **Tests:** `components/Capture.test.jsx`, covering the hidden redaction text, `aria-hidden` on the chrome, and a real `<table>` with `th`.

### Task 3: measure contrast (AC10)
- A one-off script in the scratchpad, never committed, computes WCAG ratios against `--surface` in both themes. It covers:
  - the `--ok`, `--warn` and `--accent` pill borders;
  - the darker `--redact` stripe;
  - the status dot.
- Any value under 3:1 gets adjusted. The ratios go into `index.css` comments and the commit message, as with the earlier status colours.

### Task 4: `useHashFocus` (R5)
- **Files:** `lib/useHashFocus.js` and `lib/useHashFocus.test.jsx`.
- **AC:**
  - On mount with a hash, or when the hash changes, it focuses `#<id> h2` and scrolls it into view.
  - An unknown hash does nothing.
  - It's safe under jsdom: `scrollIntoView` is optional-chained.

### Task 5: `Stop`, `StopIndex` and the page
- **Files:** `components/Stop.jsx`, `components/StopIndex.jsx`, `pages/HowItWorks.jsx` (with `usePageTitle`, `SpineHeader asLink`), and the static route in `App.jsx`.
- **Live boxes** read `useSnapshotThenLive('next')` and `('items')`:
  - Stop 1: the newest four public games (R2).
  - Stop 2: one `game_card` top pick and one `not_on_cartridge` row, through `NextRow`.
  - Stop 3: Up next, plus the picks' covers and the first pick's reason (R3).
  - Stop 4: one `preorders` row and one `later` row.
  - An empty source shows its `spine.how.empty.*` line inside the box.
- **Captures:**
  - Stops 1–5 and 7 are static illustrative rows. Stop 2's catalogue `kv` list takes figures from `status` once Milestone 2 wires it in; until then the capture shows its illustrative values.
  - Stop 8 is a `pre` listing `NEXT_ROW_FIELDS` and `FORBIDDEN`, as copy.
- **Tests:** `pages/HowItWorks.test.jsx`, which mocks `useSnapshotThenLive` like `Next.test.jsx`. It checks:
  - one h1, eight `section`s labelled by their h2s, and a `nav[aria-label=Stops]` with eight links;
  - each live box filled from fixture data, and each showing its empty line when there is no data (AC6);
  - no store name, price or score text in the render;
  - axe passes (task 8).

### Task 6: the landing strips
- **Files:** `components/FeatureStrip.jsx`, `components/StatusStrip.jsx`, and in `pages/Collection.jsx` the order hero → `NextBand` → `StatusStrip` → `FeatureStrip` → favourites.
- **`StatusStrip`** takes `status` and `next` as props. It renders null when there is no status, with no skeleton (AC6). The cells are:
  - Last refreshed: the dot (`role="img"`, named "refreshed in the last day" or "not refreshed in over a day") and the time in UTC;
  - Catalogue: titles and platforms;
  - Stores watched: count and listings;
  - Picks: date;
  - Discover: date.

  In Milestone 1 the landing passes `status = null`, so the strip stays hidden until Milestone 2.
- **Tests:** `StatusStrip.test.jsx` (null without status, the five cells, and the dot's name both fresh and stale) and `FeatureStrip.test.jsx` (five links to `/spine/how#stop-n`). `Collection.test.jsx` gets an order assertion.

### Task 7: links (AC11)
- `spine.links.post` → `{ to: '/spine/how', label: 'How it works' }`.
- A new `spine.links.longVersion` points to `/blog/how-spine-works`, for the guide's closing row and the per-stop links.
- The Projects card and the `/spine` footer pick the new target up through `spine.links.post`.
- Tests that assert the old href get updated.

### Task 8: axe (R6)
- **Files:** `frontend/package.json` (`axe-core` devDependency, exact version pinned) and `lib/axe.test-util.js`, which runs axe on a container with `color-contrast` disabled (jsdom can't compute it).
- It's used in the `HowItWorks` and `Collection` tests.

Milestone exit: `npm test && npm run build` green; summary posted; continue.

## STOP: carve-out review (public API contract + `render.yaml`)

Milestone 2 adds an unauthenticated endpoint and changes the Blueprint. The plan above describes both, so if you say **"go for both"** at the plan gate I won't stop here.

## Milestone 2 (carve-out): the status endpoint, snapshot, prerender and smoke

### Task 9: `GET /api/public/status`
- **Files:**
  - `backend/public_outputs.py`: `PublicStatusOut`, the five fields from answer 1.
  - `backend/public.py`: the route on the existing public router, declared before `/items/{item_id}`. Counts come from `physical_sources/catalogue.py` helpers; a new `status_counts()` lives there if none fits.
  - Tests: `tests/test_public_outputs.py` (exact `model_fields`; `FORBIDDEN` disjoint from the body keys; an empty catalogue gives zeros and `refreshed_at: null`; a failed (`ok=false`) or still-running run is ignored) and `tests/test_public.py` (`PublicStatusOut` added to `PUBLIC_MODELS`).
- **Caching:** none. These are four count queries over about 10k rows, cheaper than `/next`'s build. A response header `Cache-Control: public, max-age=300` limits repeat hits.

### Task 10: the snapshot
- **Files:**
  - `frontend/scripts/fetch-snapshot.mjs`: optional `status` in `SNAPSHOTS`.
  - `frontend/src/lib/snapshot.js`: a `SHAPES.status` predicate identical to the script's.
  - Their tests.
- `Collection.jsx` and `HowItWorks.jsx` read `useSnapshotThenLive('status')`. Stop 2's capture takes `titles`, `platforms` and `listings` from it.

### Task 11: prerender and routing
- **Files:**
  - `scripts/prerender-lib.mjs`: a `page('/spine/how', title, description)` entry, with copy from `spine.how`.
  - `render.yaml`: a `/spine/how` → `/spine/how/index.html` rewrite ahead of `/*`.
- `prerender-lib.test.mjs` has to pass unchanged. It already enforces that the rewrite and the route match.

### Task 12: `smoke.sh`
- The checks it gains:
  - `GET /spine/how` returns 200 with title `How it works · Spine`;
  - `/api/public/status` returns 200, with jq confirming exactly the five keys;
  - `PRIVATE_KEYS`, `OUTPUT_FORBIDDEN` and `NEXT_FORBIDDEN` all run over the status body and `snapshot/status.json`;
  - a grep of the `/spine/how/` HTML finds no store hostnames from `STORES` (written into the script as a fixed list).

## Finish gate
1. Full backend suite (one run); `npm test`, `npm run build`, ruff, prettier and eslint all clean.
2. Browser check on the dev servers at 1280px and 400px, both themes, against `chosen.html`. Checks:
   - no horizontal overflow at 400px (AC9);
   - feature cards land on a focused h2 (AC4);
   - with the backend stopped and no snapshot, the strip is hidden (AC6).
3. One reviewer subagent on the full diff. The diff runs past 10 files, but the only infra is a single rewrite line and the security surface is one allowlisted endpoint, so I'm proposing a single reviewer with a privacy focus rather than the ultra review. Say "ultra" and I'll run that instead.
4. Push, open the PR ready for review, notify, stop.

## Environment test (definition of done)
- After you merge and Render deploys:
  ```
  ./scripts/smoke.sh https://joey-haas.dev https://api.joey-haas.dev
  ```
  The output gets pasted in full. The new checks are part of it.
- Check Render's logs for fresh errors on `/api/public/status`.
- Open `https://joey-haas.dev/spine/how/` in the browser and check the deep link to `#stop-3`.
- Lighthouse on `/spine/how` against `/spine/next` is your manual check (R6).
