---
status: ready-for-plan
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
