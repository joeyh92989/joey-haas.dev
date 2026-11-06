---
status: planned
mockups: none
chosen: none
---

# /stats: public site analytics and a changelog — design

Date: 2026-11-06 · Repo: joey-haas.dev · No mockups: the page is built from
the admin analytics page's `StatTile` and the shelf's stats styling, and the
structure is specified below. Parent: `/admin/analytics` and the beacon as
documented in README "Analytics".

## Problem

The site already measures itself with a first-party, cookie-free beacon,
and that is a selling point nobody can see: the numbers sit behind the
admin sign-in. A public page that shows the same figures, says how they are
collected, and lists what changed on the site recently turns a private
dashboard into a credibility signal, and gives the colophon's "no
third-party scripts" claim a page of evidence.

## Scope

**In**

- `/stats`: views and visitors for the last 30 days and all time, views per
  day for 30 days, top pages, top referrer hosts, and the device split.
- A short "How this is counted" section (what the beacon sends, what it
  does not, Global Privacy Control honored).
- A "Changes" section: a hand-maintained changelog, newest first.
- The snapshot-then-live pattern: paint `/snapshot/site-stats.json`, refresh
  from `GET /api/public/site-stats`.
- An "API is awake / sleeping" line, decided by whether the live refresh
  succeeded.

**Out**

- 7d and 90d ranges, per-path drill-down, realtime, anything about signed-in
  visits (never tracked anyway), a public rollup trigger, a changelog
  generated from git.

## Design

### Backend

- `GET /api/public/site-stats` on the public router (no `require_admin`),
  returning `{thirty: Summary, all: Summary}` where `Summary` is the admin
  read's shape for that range, with two reductions: referrer hosts with
  fewer than 5 views in the range are dropped and folded into an "other"
  count, and lists are capped at 10. Served through the existing
  `SummaryCache`; the cache key must include "public" so the admin and
  public shapes never share an entry.
- Rate-limit by the existing origin check; no new auth.
- `fetch-snapshot.mjs` adds `site-stats` to the files it writes, and the
  nightly workflow compares it like the others.

### `/stats` page

- 45rem column, in this order:
  1. Heading "Stats" and one line: "What this site sees, counted by the
     site itself. No cookies, no third-party scripts."
  2. Four `StatTile`s: Views (30d), Visitors (30d), Views (all time),
     Visitors (all time).
  3. Views per day, 30 days: the admin page's day series, as the shelf's
     bar styling (a plain bar per day, `--accent` fill, `--line` baseline),
     with a visually-hidden table for screen readers. No chart library.
  4. Three lists side by side on desktop, stacked on phone: Pages, Referrers
     ("other: N" as the last row when folded), Devices. Each row: label,
     views, a proportional bar in `--skeleton` tone.
  5. "How this is counted": four sentences, drawn from the README's
     Analytics section so the two cannot disagree (quote it, do not
     paraphrase).
  6. "Changes": entries from `frontend/changelog.md`, each a date and one or
     two lines, newest first, with links where a change has a page.
- Status line under the tiles: "Live as of <time>" when the refresh
  succeeded, "From last night's snapshot; the API is asleep" when it did not,
  using `WAKING`/`LOAD_ERROR` from `content/status.js` only for a page with
  no snapshot at all.

### Changelog

- `frontend/changelog.md`: markdown, `## YYYY-MM-DD` headings with bullets
  under each. Imported through the existing markdown plugin so links and
  code render like a post.
- CLAUDE.md gains one convention line: a shipped feature adds an entry.
  The entry is written in the plan that ships it, so it is part of done.

### Theme, responsive, accessibility

- Tokens only. Bars are non-text marks: 3:1 against `--surface` in both
  themes, measured and recorded beside the token as the status colors are.
- Phone: tiles 2×2, lists stacked, the day series scrolls horizontally in
  its own box rather than squeezing 30 bars into 360px.
- Every bar group has a `role="img"` with an `aria-label` summarising it,
  plus the hidden table for the day series.

### Flow

```mermaid
flowchart LR
  BE[beacon → /api/track] --> DB[(page_views / daily_stats)]
  DB --> A[/api/public/site-stats]
  A --> SN[snapshot/site-stats.json]
  SN --> P[/stats]
  A -->|live refresh| P
  CL[changelog.md] --> P
```

## Key decisions

- **A public endpoint with reductions, not the admin shape made public.**
  Referrer hosts with a handful of views can identify a person's own blog
  or a company intranet host; folding under-5 hosts into "other" keeps the
  list honest without naming small sources.
- **Snapshot-then-live** because the site's rule is that public pages paint
  without the API, and a stats page that says "waking the server" for
  thirty seconds undercuts its own point.
- **Hand-maintained changelog** over `git log`: Render's build clone depth
  is not something this repo controls, commit messages are not written for
  visitors, and a merged PR is not the same as a shipped feature. One
  line per feature, written when it ships, is the right grain.
- **Rejected: a `/changelog` route.** With a dozen entries it is a section;
  split it out when it outgrows the page.
- **Rejected: a chart library** for one bar series. The shelf already draws
  bars with CSS.
- **Rejected: showing 7d/90d.** More toggles, same story; 30d and all time
  cover "lately" and "ever".

## Component inventory

- New: `pages/Stats.jsx`, `backend` public site-stats route (in
  `analytics_routes.py` or `public.py`; the plan decides), `frontend/changelog.md`,
  `content/changelog.js`, `components/BarList.jsx` if the admin page's list
  cannot be reused as is.
- Existing: `StatTile`, `SummaryCache`, `summarise`, `range_start`, the
  beacon, `fetch-snapshot.mjs`, `useSnapshotThenLive`, `content/status.js`,
  `prerender` heads, footer (gains a "Stats" link next to "Colophon").

## Acceptance criteria

- `/stats` renders fully from the snapshot with the API stopped, then
  updates its figures and shows "Live as of …" when the API answers.
- `GET /api/public/site-stats` needs no session, never includes a referrer
  host under 5 views, and caps every list at 10; the admin endpoint is
  unchanged.
- The four tiles match `/admin/analytics` for the same range on the same
  data (test against the same fixture).
- Day bars and list bars clear 3:1 in both themes; ratios recorded in
  `index.css`.
- Phone width (400px): no horizontal page scroll; the day series scrolls
  within its box.
- The "How this is counted" text is the README's, verified by a test that
  reads both.
- `changelog.md` has at least the entries for this feature, search and TIL
  (whichever have shipped) when this ships.
- Tests: reduction rules, cache-key separation, snapshot fallback, the
  changelog parser.

## Open questions for Code

- Whether `summarise` can be asked for the public reductions directly or
  whether the route post-processes its output.
- The `SummaryCache` TTL for the public key: the admin's is tuned for one
  reader; the public one can be longer (an hour is fine).
- Does the nightly workflow's snapshot comparison tolerate a file that
  changes every day by design (views count)? If it would trigger a rebuild
  nightly, exclude `site-stats` from the comparison and let the daily build
  schedule carry it.

## Answers to the open questions

| Question | Decision | Why |
|---|---|---|
| Can `summarise` produce the reductions? | No, not as it stands: `_ranked` cuts every list to `LIST_SIZE` (10) before the route sees it, so a post-processing fold would miss the tail. `summarise` gains one keyword, `fold_referrers_below: int = 0`; named hosts under the threshold leave the ranking and their count sums into a new `referrers_other` key (always present, 0 when nothing folded). The cap of 10 is already `LIST_SIZE`. | The fold has to see the totals, and `summarise` is the only place that has them. |
| The threshold's unit | **Visitors**, not views: the referrer list counts visitors (`analytics.py:298`), and the spec's "5 views" was written against the wrong metric. The fold is "fewer than 5 visitors in the range". Direct (`''`) never folds. | A host naming a person is a visitor count problem; the list already speaks in visitors. |
| `SummaryCache` TTL for the public key | `SummaryCache.get(key, build, ttl=60)` gets a `ttl` keyword (bucket `int(clock() // ttl)`); the public route passes `PUBLIC_STATS_TTL = 3600`. The cache instance moves to `main.py` and is handed to both routers, so the nightly rollup's `clear()` drops the public entry too. The route also sets `Cache-Control: public, max-age=300` as `/api/public/status` does. | The cache is private to the admin router today (`analytics_routes.py:175`); a public route in another module could not reach it. |
| Nightly compare tolerance | Leave `site-stats` out of the compare loop, as `status` is. `next.json` carries `generated_at`, so the deploy hook already fires every night (spec K8), and the rollup runs before the compare, so each redeploy's snapshot includes yesterday's rolled-up day. | Adding it would change nothing except the risk of joining the `items | stats` fatal case by mistake. |
| "Rate-limit by the existing origin check" | Dropped: `origin_check.py` guards only unsafe methods and never a GET. The bound on work is the cache (one build per hour per app, whatever the request rate) and the `Cache-Control` header. | No code does what the spec assumed. |
| Where the route lives | `analytics_routes.py`, as `create_site_stats_router(factory, now, cache)`, an `APIRouter(prefix="/api/public")` with one route, mounted in `main.py` beside the other two unauthenticated routers. | The loader and the cache stay in one module; `public.py` does not grow. |

## Deviations from the spec (decided at planning)

| Spec said | Plan does | Why |
|---|---|---|
| `best_day` as the admin shape | Public `best_day` is `{day, views}`; `referrer` is dropped | The best day's referrer can be a host the fold just hid. |
| Changelog imported through the markdown plugin | `changelog.md?raw` plus a pure parser in `content/changelog.js` | The plugin requires post frontmatter (`title`, `date`), returns one HTML blob rather than dated entries, and Vitest does not load it. Entries need links only, which the parser renders as `<Link>` / `<a>`. |
| List bars in `--skeleton` tone | Both bars reuse the admin components unchanged: `--chart` (peak and list fill) and `--chart-2` (day bars), measured 6.73 / 3.15 dark and 6.09 / 3.10 light on `--surface` (`index.css` token comments) | `--skeleton` is a background tone (`--sunken` in dark) and cannot clear 3:1; no new token means no new measurement. |
| "How this is counted" quotes the README | The README's Analytics section gains an opening paragraph of four plain sentences (no paths or code spans), and the page quotes that paragraph verbatim; a test reads both | The README's bullets name source files and config keys, which is not visitor copy. One paragraph owned by the README keeps the rule "quote, do not paraphrase". |
| Changelog entries for search and TIL | Entries for what has shipped on `main` (#86–#90) and this feature; search and TIL add their own when they ship | Neither branch is merged (both hold only their planning docs). |

## Deviations found during the build

| Plan said | Built | Why |
|---|---|---|
| `load_summary(factory, …)` | `load_summary(session, …)`: it takes the request's session, as the admin route's inline build did | Both routes already have a session from `Depends`; a factory would open a second one per read. |
| The public models beside the router in `analytics_routes.py` | In `public_outputs.py`, beside `PublicStatusOut` | `test_public_outputs.py` imports every public model from there, and the module is where the field pins live. |
| List rows as the admin page draws them | Inside the three columns each label sits on its own row above its bar and count (`.site-stats-lists .bar-list li`) | At 45rem the admin's one-line row cut every path and host short ("/shelf/ne…", "big.exa…"); seen in the browser. |
| — | `.site-stats-lists > section { margin-top: 0 }` | The page frame's `section + section` spacing pushed the second and third column headings 36px below the first. |
| Changelog lines may carry code spans | Links only; the seed entry's backticks were removed | `renderLine` renders links, not code; a backtick showed as a literal. |
| "Live as of" after the API stops | Within five minutes of a live answer a reload still says live | The browser serves the read from its own HTTP cache (`Cache-Control: max-age=300`), which is the header working; after that the page says the API is asleep, as verified. |

## Research notes

- `summarise(stats, start, end)` returns `start, end, views, visitors, views_per_visitor, best_day {day, views, referrer}, series [{day, views}] (one per day, uncapped), pages, referrers, devices (each [{value, count}], top 10), live_since` (`analytics.py:326-338`). `range_start("all", today)` is `ANALYTICS_LIVE_SINCE` (2026-10-20).
- `SummaryCache` is in `analytics_routes.py:111-134`: per-minute bucket, one lock, `clear()`; built inside `create_analytics_router` when none is passed (`:175`).
- `useSnapshotThenLive(name)` returns `{data, live, failed}`; `data && !live` is "painted from the snapshot", `data && failed` is "the API did not answer", `!data && failed` is the hard error. The name must be in `lib/snapshot.js` `SHAPES` or the snapshot is never read **and** the live answer is treated as invalid.
- `fetch-snapshot.mjs` `SNAPSHOTS` entries are `{path, valid, required}`; the key is the file name. `next` is the optional precedent, with its predicate duplicated in `snapshot.js` (comments on both say the two must be identical).
- `DayBars({series})` already renders `role="img"` per bar and the visually-hidden table. `BarList({label, rows, name})` renders the track and fill; `StatTiles({label})` / `StatTile({label, value, detail})`. All of their CSS is global and token-only (`index.css:1381-1719`); `.stat-tiles` goes to two columns under 900px.
- `AdminAnalytics.jsx` holds `referrerName` and `DEVICE_NAMES`; both move to `lib/analytics.js` so the public page shares them.
- A public route needs: the page and `App.jsx` route (static import, as `Colophon`), a `page('/stats', …)` row in `prerender-lib.mjs` `publicRoutes` after `/colophon` (the sitemap follows), the path in `prerender-lib.test.mjs`'s list, and a `render.yaml` rewrite before `/*`. The default `.page` class is the 45rem column; `CONTENT_ROUTES` stays as it is.
- `feat/site-search` (moves `publicRoutes`' static rows into `content/pages.js`) and `feat/til-notes` (footer, `publicRoutes`, `render.yaml`) touch the same seams; conflicts on merge will be one-line.

## Public body

`GET /api/public/site-stats` → `{thirty: Summary, all: Summary}`, each

```
start, end, views, visitors, views_per_visitor,
best_day: {day, views} | null,
series: [{day, views}],              # thirty: 30 points; all: one per day since live_since
pages: [{value, count}],             # ≤ 10, views
referrers: [{value, count}],         # ≤ 10, visitors; '' (direct) first; no host under 5 visitors
referrers_other: int,                # visitors of the folded hosts
devices: [{value, count}],           # views
live_since
```

Pinned as `PublicSiteStatsOut` / `PublicSummaryOut` / `PublicBestDayOut` with exact field sets in `test_public_outputs.py`, and walked for `FORBIDDEN` and catalogue keys like every other public body.

## Tasks

Sequential (each builds on the one before). Backend tests run one suite at
a time (repo CLAUDE.md).

1. **Fold and TTL in the analytics core.**
   `summarise(stats, start, end, *, fold_referrers_below: int = 0) -> dict`
   in `backend/analytics.py`: with a threshold, every named host (value
   not `''`) whose visitors are below it leaves the ranking before the cap,
   and their visitors sum into `referrers_other` (present in every summary,
   0 by default). `SummaryCache.get(key, build, ttl: int = 60)` in
   `backend/analytics_routes.py`: bucket `int(clock() // ttl)`; existing
   callers unchanged.
   *Files:* `backend/analytics.py`, `backend/analytics_routes.py`.
   *Tests:* `tests/test_analytics.py`: a host with 4 visitors folds and one
   with 5 stays (boundary); direct with 1 visitor stays first; twelve hosts
   at 5+ and three under: the list is the top ten, `referrers_other` counts
   only the three (hosts cut by the cap are not "other"); no threshold
   gives `referrers_other == 0` and the lists of today. `tests/test_analytics_routes.py`:
   `ttl=3600` with ticks 0 / 1800 / 3601 builds twice; the existing
   per-minute test still passes.

2. **The public route.** In `backend/analytics_routes.py`:
   `async def load_summary(factory, span: str, today: date, *, fold_referrers_below: int = 0) -> dict`
   extracted from the admin route's `build` (the admin route calls it);
   `PUBLIC_REFERRER_MIN = 5`, `PUBLIC_STATS_TTL = 3600`, `SITE_STATS_KEY = "public:site-stats"`;
   `create_site_stats_router(factory, now=_utc_now, cache: SummaryCache | None = None) -> APIRouter`
   (`prefix="/api/public"`, `tags=["public"]`, no dependencies) with
   `GET /site-stats` → `response_model=PublicSiteStatsOut`, header
   `Cache-Control: public, max-age=300`, body built once under
   `SITE_STATS_KEY` as `{"thirty": load_summary("30d", fold=5), "all": load_summary("all", fold=5)}`.
   The three models (the public body above; `best_day` without
   `referrer`) sit beside the router. `main.py` builds one
   `summary_cache = SummaryCache()`, passes it to `create_analytics_router`
   and `create_site_stats_router`, and mounts the latter with the other
   unauthenticated routers.
   *Files:* `backend/analytics_routes.py`, `backend/main.py`.
   *Tests:* `tests/test_analytics_routes.py` (`client_for` mounts the new
   router on the same cache): 200 signed out; `best_day` carries no
   `referrer`; a host with 4 visitors is absent and counted in
   `referrers_other`; every list ≤ 10; `thirty.views/visitors` and
   `all.views/visitors` equal `GET /api/analytics?range=30d|all` on the
   same `_view` fixture (AC: tiles match); a rollup clears the public
   entry; an empty database gives zeros, 30 series points and empty lists;
   the header. `tests/test_public.py`: the route joins the catalogue-key
   walk. `tests/test_public_outputs.py`: `SITE_STATS_FIELDS`,
   `SUMMARY_FIELDS`, `BEST_DAY_FIELDS` pinned exactly and disjoint from
   `FORBIDDEN`. `tests/test_job_token.py` unchanged and green (the route
   is not in `JOB_ROUTES`).

3. **Snapshot plumbing.** `'site-stats': { path: '/api/public/site-stats', valid: isSiteStatsBody, required: false }`
   in `frontend/scripts/fetch-snapshot.mjs`, and the identical predicate
   under `SHAPES['site-stats']` in `frontend/src/lib/snapshot.js`
   (`isSiteStatsBody(body)`: an object whose `thirty` and `all` each have
   numeric `views` and `visitors` and arrays `series`, `pages`,
   `referrers`, `devices`). `frontend/scripts/README.md` lists the file
   (and the two it already omits, `status` and `comics`). The nightly
   compare is untouched (see the answers).
   *Files:* `fetch-snapshot.mjs`, `src/lib/snapshot.js`, `scripts/README.md`.
   *Tests:* `fetch-snapshot.test.mjs`: declares site-stats as optional with
   the predicate on a good and a bad body; writes it verbatim; builds
   without it. `snapshot.test.js`: `readSnapshot('site-stats')` returns the
   file and null for a wrong shape.

4. **Changelog.** `frontend/changelog.md`: `## YYYY-MM-DD` headings,
   bullets under each, newest first, seeded with one line per shipped
   feature since the site refresh (#86 resume, #87 comics, #88 play
   states, #89 Start playing, #90 Now playing band; dates from
   `git log origin/main --format='%ad %s' --date=short`) and this feature.
   `frontend/src/content/changelog.js`: `parseChangelog(raw) -> [{date, lines}]`
   (sorted newest first whatever the file order; throws on a heading that
   is not a date or a date with no bullets, so a bad file fails the build,
   not the visitor), `renderLine(line) -> ReactNode[]` turning
   `[text](href)` into `<Link>` for a path and `<a>` for a URL, and
   `export const CHANGELOG = parseChangelog(raw)` from
   `import raw from '../../changelog.md?raw'`. Repo `CLAUDE.md` gains the
   convention: a shipped feature adds a `changelog.md` entry, written in
   the plan that ships it.
   *Files:* `frontend/changelog.md`, `src/content/changelog.js`, `CLAUDE.md`.
   *Tests:* `content/changelog.test.js`: order, dates, a line with no
   link, one and two links, internal vs external, the two throws; the seed
   file parses and its first entry is this feature's.

5. **The page.** `frontend/src/content/stats.js`: `STATS_TITLE = 'Stats · Joey Haas'`,
   `LEDE`, `COUNTED` (the four sentences, below) and the three status
   lines. `referrerName` and `DEVICE_NAMES` move from `AdminAnalytics.jsx`
   to `lib/analytics.js`. `pages/Stats.jsx` (`usePageTitle(STATS_TITLE)`,
   `useSnapshotThenLive('site-stats')`), in the spec's order: `h1`
   "Stats" and the lede; `StatTiles label="Site figures"` with Views (30
   days), Visitors (30 days), Views (all time), Visitors (all time),
   `toLocaleString('en')`; the status line (`role="status"`): "Live as of
   <h:mm>" (the time the live answer landed, kept in state) when `live`,
   "From last night's snapshot; the API is asleep" when `data && failed`,
   "From last night's snapshot" while `data && !live && !failed`; `h2`
   "Views per day" with `DayBars series={thirty.series}` inside
   `.site-stats-days`; `.site-stats-lists` with three `BarList`s (Pages;
   Referrers via `referrerName`, with `{value: 'other', count: referrers_other}`
   appended and named "Other" when it is above 0; Devices via
   `DEVICE_NAMES`); `h2` "How this is counted" with `COUNTED`; `h2`
   "Changes" as a list of `<time dateTime>` plus `renderLine` per bullet.
   With no data: `WAKING` after three seconds else "Loading…"
   (`role="status"`), or `LOAD_ERROR` (`role="alert"`) when `failed`, the
   `Next.jsx` pattern. `App.jsx` routes `stats` (static import).
   `SiteFooter.jsx` adds `· Stats` after Colophon. `index.css`:
   `.site-stats-lists` three columns, one under 700px;
   `.site-stats-days { overflow-x: auto }` with the chart at
   `min-width: 30rem` under 600px so the page never scrolls sideways;
   `.changelog` as a plain dated list. README "Analytics" opens with the
   `COUNTED` paragraph and "Public API" lists the route.
   *Files:* `content/stats.js`, `lib/analytics.js`, `pages/AdminAnalytics.jsx`,
   `pages/Stats.jsx`, `App.jsx`, `components/SiteFooter.jsx`, `index.css`,
   `README.md`.
   *Tests:* `pages/Stats.test.jsx` (mocking `lib/useSnapshotThenLive.js`):
   snapshot-only shows the four tiles and the snapshot line; live shows
   "Live as of"; failed-with-data keeps the figures and says asleep;
   no data shows "Loading…" then `WAKING` (fake timers) and `LOAD_ERROR`
   on failure; an "Other" row appears only when `referrers_other > 0`;
   empty lists say "None yet."; the hidden table and 30 `img` bars are
   present; `axeViolations` is empty. `content/stats.test.js` reads
   `README.md` from disk and asserts it contains `COUNTED.join(' ')`
   verbatim. `lib/analytics.test.js` for the moved helpers;
   `AdminAnalytics.test.jsx` still green. `SiteFooter.test.jsx`: the
   Stats link.

   The four sentences (`COUNTED`), fixed here so the README and the page
   are written from one source:
   > This site counts its own visits: no cookies, no third-party script,
   > and nothing leaves the site's own API. Each page view sends the path,
   > the referring site on a visit's first page, and whether the device is
   > a desktop, phone or tablet. A visitor is a hash of IP address and
   > browser that changes every day, so one day cannot be joined to the
   > next, and neither the address nor the browser is stored. Nothing is
   > sent under Global Privacy Control or Do Not Track, and the figures
   > undercount: the API sleeps when idle, and a view sent while it wakes
   > is lost.

6. **Heads, rewrite and smoke.** `page('/stats', `Stats · ${profile.name}`, 'What joey-haas.dev sees, counted by the site itself: views, visitors, pages and referrers, with no cookies or third-party scripts, and what changed recently.')`
   after `/colophon` in `prerender-lib.mjs` `publicRoutes`; the path in
   `prerender-lib.test.mjs`'s ordered list; `- type: rewrite` `/stats` →
   `/stats/index.html` in `render.yaml` after `/colophon` and before `/*`;
   `scripts/smoke.sh` checks `GET /api/public/site-stats` is 200 with a
   numeric `thirty.views` and `/stats/` serves the Stats title.
   *Files:* `frontend/scripts/prerender-lib.mjs`, `prerender-lib.test.mjs`,
   `render.yaml`, `scripts/smoke.sh`.
   *Tests:* `prerender-lib.test.mjs` (routes list and the rewrite block
   both pass); `npm run build` writes `dist/stats/index.html` and the
   sitemap entry.

7. **Docs and browser verification.** Repo `CLAUDE.md`: the Architecture
   bullet's "public pages other than `/shelf*` make no API calls" gains
   `/stats` (snapshot first, then `/api/public/site-stats`); "two
   unauthenticated routers" becomes three; a Current state line for this
   feature; the Analytics bullet notes the fold, the shared cache and the
   hour TTL. Module docstrings per `~/.claude/rules/standards.md`.
   Browser: run `fetch-snapshot` against the local API, stop the API, load
   `/stats` (paints, says snapshot), start the API, reload (says "Live as
   of"); 400px and 1280px in both themes; no horizontal page scroll at
   400px, the day series scrolls in its box; the footer link; `/stats/`
   after `npm run build && npm run preview`.
   *Files:* `CLAUDE.md`, this doc (deviations found during the build).

## Review focus

Inputs the spec implies but no acceptance criterion names; each has its
test in the task that owns it.

1. A host with exactly 5 visitors: stays (task 1, boundary test).
2. More than ten hosts above the threshold: the cut hosts are not counted
   as "other" (task 1).
3. No views at all (a fresh database, or the day the beacon is blocked):
   zeros, 30 zero points, empty lists, "None yet." on the page (tasks 2, 5).
4. The API answers with Render's HTML sleep page: the predicate rejects it,
   the snapshot figures stay, the line says asleep (task 5; the hook's own
   test already covers the predicate path).
5. A malformed `changelog.md` (a heading that is not a date, an entry with
   no lines): the build fails, not the page (task 4).

## Milestones

```
Milestone 1 (auto): tasks 1–7
  Task 6's render.yaml rewrite is the one deploy-path change; it is the
  same one-rule pattern as /now and /colophon, and Joey's "go" on this
  plan is its carve-out review.
Finish gate → PR (ready for review)
No migration, no env var: merge order is free. The first nightly after the
merge writes site-stats.json; until then the page paints from the build's
own fetch-snapshot run (the API must be awake during the Render build, as
for next.json, or the page waits for the live answer).
```

## Environment test section

- Backend: `./.venv/bin/pytest` (full suite, single run) green.
- Frontend: `npm test` and `npm run build` green (build includes
  prerender, the sitemap and the feed).
- Snapshot-then-live, locally: `node scripts/fetch-snapshot.mjs` against
  the running API writes `public/snapshot/site-stats.json`; with the API
  stopped `/stats` paints and says snapshot; with it running the figures
  refresh and the line says live.
- Post-deploy: `./scripts/smoke.sh https://joey-haas.dev https://api.joey-haas.dev`
  with the two new checks; `/admin/analytics` unchanged for the same range.
