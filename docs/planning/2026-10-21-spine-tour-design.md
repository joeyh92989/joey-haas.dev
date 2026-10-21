---
status: ready-for-plan
mockups: docs/planning/mockups/2026-10-21-spine-tour/
chosen: chosen.html
---

# Spine tour: make what Spine does visible — design

Date: 2026-10-21 · Repo: joey-haas.dev · Lands after the site refresh
(`2026-10-19-site-refresh-design.md`, Ledger direction); the mockups use its
tokens and its compact tracker masthead. Parent rules that still apply:
`2026-09-28-tracker-showcase-design.md` §D and `2026-10-05-spine-next-design.md`
B5/S9 (what may be public), `2026-10-02-spine-design.md` (the name, the copy
home in `content/spine.js`).

## Problem

Spine is most of the engineering on the site, and a visitor can see almost
none of it. The public surface is three tabs (Shelf, What's next, Year in
review), an item page, a month page, `/now`, a feed, and one long post. What
makes Spine interesting lives behind sign-in or inside that post:

| Mechanism | Where it lives today | What a visitor sees |
| --- | --- | --- |
| Photo import: a vision model reads titles off the spines, matched by string distance | `/admin/import` | Nothing. One line on the Projects card. |
| Metadata resolution against IGDB (and TMDB, ComicVine) with a candidate picker | `/admin/collection/:id` | Cover art and a community score, unexplained |
| Copy fields: a cart ID decides the format; registry values never overwrite the owner's | `/admin/collection`, `backend/formats.py` | "Full game on cartridge" on a row |
| The physical catalogue: r/NSCollectors registry, Switch 1 sheet (~4,500 titles), twelve boutique stores, IGDB N64; one honest format per game | `/admin/catalogue` | "Not on cartridge" list on What's next |
| Play Next: six weighted terms score the backlog and say why; pin as Up next | `/admin/play-next` | "Tonight" block, once a day |
| Radar: taste-ranked upcoming cartridges and pre-orders in lanes | `/admin/radar` | "Coming soon" / "Further out" rows |
| Discover: pre-scored candidates, eight picked by one Gemini call, deterministic fallback | `/admin/discover` | "Top pick" badge |
| Store list: phone-first, same server sectioning as the public page | `/admin/store-list` | Nothing |
| The nightly job: refreshes, regenerates, snapshots, redeploys at 00:17 UTC | `.github/workflows/nightly.yml` | "Picks from <date>" |
| Privacy guardrails: field allowlist tests, reason gates, frozen batch | `backend/tests/test_public_outputs.py` | Nothing |
| Play journal | `/admin` + migration 0007 | "Played" on Year/Month pages |

The post explains all of this in prose, but it is one 150-line page linked
from a footer-sized "How it works" link, with no pictures and no live data.
The tab row says Shelf · What's next · Year in review, which names the
outputs and none of the machinery.

Audience, decided 2026-10-21: hiring managers and engineers first;
collectors still get a usable site. Method: a guided tour page,
frontend-first, with live public widgets beside annotated captures of the
signed-in tools. Scope includes hierarchy fixes to the shelf landing, not
only a new page.

## Scope

**In**

- A fourth Spine tab, **How it works**, at `/spine/how`: the field guide
  (eight stops) described below. Prerendered head, sitemap entry,
  `render.yaml` rewrite, `WIDE_ROUTES` entry like the other tracker routes.
- The shelf landing (`/spine`) gains, between the hero numbers and the
  favourites row: the existing What's next band, a **status strip**, and a
  five-card **"What Spine does"** strip linking into the stops.
- One new public endpoint, `GET /api/public/status`, allowlisted like
  `/api/public/next`, feeding the status strip and the captures' live
  figures (see Open questions 1 for the field list). Snapshot-first like
  every `/spine*` read.
- Captures as **drawn components** fed by public data, not screenshots (Key
  decisions).
- The "How it works" link on the Projects card and in the post's footer
  points at `/spine/how`; the post stays as the long version and is linked
  from the guide's last line.
- Copy for the eight stops and five cards, in `content/spine.js` under
  `spine.how`, drafted by Code from the mockup and the post, edited by Joey
  in the PR (the #39 convention).

**Explicitly out**

- A read-only visitor mode of `/admin`. Considered and rejected (Key
  decisions); each stop's "Behind the sign-in" column is where a deep link
  to one would go later, so the layout does not preclude it.
- Any change to the shelf grid, filters, sort, item page, Year in review,
  Month, `/now`, or the feed.
- Any new private data on the public API. The status endpoint carries
  counts and dates only; `test_public_outputs.py` pins it like the others.
- Screenshots of admin pages, committed or generated.
- Films, comics, board games: the tour is about games, like the tool is
  today.
- Changing the palette, type, or masthead: the site refresh owns those.

## Design

Chosen: **Field guide (A) with the Pipeline status strip (B)** —
`chosen.html` in the mockups folder. Light and dark, 1280 and 400, via the
file's top bar.

### Screens and states

**1. `/spine` — the shelf landing.** Order, top to bottom, inside the
existing `SpineHeader`:

1. Name, tagline, tab row: Shelf · What's next · Year in review · **How it
   works**. The new tab carries a small mono `NEW` marker for the first
   release only (a constant in `spine.js`; remove it in a later copy pass).
2. Hero numbers (unchanged: Owned, Finished, Finished in <year>).
3. The What's next band (unchanged, `NextBand`).
4. **Status strip** (`StatusStrip`, new): one bordered row of five cells,
   each a mono label over a value and an optional mono sub-line:
   *Last rebuilt* (green dot, time in UTC, "run #n"), *Catalogue* (titles,
   platforms), *Stores watched* (count, listings), *Picks* (from <date>),
   *Discover* (<weekday date>). Cells never wrap internally; on a phone the
   row becomes a stacked list with the value right-aligned. The strip
   renders from the snapshot first and swaps in live values; it is hidden
   entirely (no skeleton) when neither has a status, so an empty strip
   never ships.
5. **What Spine does** (`FeatureStrip`, new): a mono section label with a
   "Take the tour →" link on the right, then five cards in one row (two
   columns on a phone, the fifth spanning both). Each card is a link to
   `/spine/how#stop-n`: mono number, bold title, one-line description.
   The five are fixed copy: Reads the shelf · Knows the format · Picks
   tonight · Watches the stores · Rebuilds nightly.
6. Favourites, toolbar, grid, attribution: unchanged.

Net change to the landing: two rows, roughly 190px at desktop width,
above the favourites. The band and hero numbers keep their positions so
the page still opens on the numbers.

**2. `/spine/how` — the field guide.** `SpineHeader` with the name as a
link (as on What's next), then:

1. Title (display serif, "How Spine works, in eight stops") and a
   two-sentence lede saying what the two columns of each stop are.
2. **Table of contents** (`StopIndex`, new): the eight stops as a
   two-column list (one column on a phone), each row a mono number, the
   stop title, and a mono "where" label (`/admin/import`, `nightly.yml`,
   `tests`). Rows are in-page anchors.
3. **Eight stops** (`Stop`, new), separated by hairlines. Each has: a mono
   kicker `STOP n · <where>`, a display-serif h2, a one-paragraph claim,
   then the body, then a "why this way" paragraph with its lead words in
   the text colour, then a row of links: `code-link`s (mono, prefixed
   `</>`) to the module on GitHub and, where useful, a plain link to the
   post section or a public page.

   The body is one of two layouts:
   - **Two columns** (stops 1–4): left, "● LIVE, FROM THE PUBLIC API" over a
     `LiveBox`; right, "BEHIND THE SIGN-IN" over a `Capture`. Columns are
     0.9fr / 1.1fr at desktop and stack on a phone, live first.
   - **One column** (stops 5, 7, 8): a `Capture` alone, max 760px. Stop 6
     has no body (text and links only).

   The stops, their live boxes and captures:

   | # | Title | Where | Live box (public data) | Capture (drawn, public data) |
   | --- | --- | --- | --- | --- |
   | 1 | Reads the shelf from a photo | `/admin/import` | A stylised shelf (coloured spines, no photo) over the covers of the items that came from the most recent photo import, with "N spines read, M matched without a click" | Import table: title as read, matched title, distance, auto/pick pill |
   | 2 | Knows cartridge from Game-Key Card | `/admin/catalogue` | Two What's next rows: one `game_card` Top pick, one `game_key_card` from Not on cartridge | Catalogue totals (`kv` list) and a three-row collapse table with the Store column redacted |
   | 3 | Picks tonight's game | `/admin/play-next` | Tonight's Up next: cover, title, mono meta, reason sentence, then the two other picks' covers | Six `bar-row`s for the pinned pick's terms, the weighted mean, the reasons |
   | 4 | Watches for the next cartridge | `/admin/radar` | Two rows from Coming soon / Further out with the date rule caption | Lane table with Score and Pre-order columns, store redacted |
   | 5 | Suggests what to buy | `/admin/discover` | — | Candidate table: index, title, taste score, "model picked" pill, answer |
   | 6 | Fits in a pocket in a store | `/admin/store-list` | — | — |
   | 7 | Rebuilds itself every night | `nightly.yml` | — | Step table of the last run: time, step, ok/skipped pill, duration |
   | 8 | Keeps the private parts private | tests | — | Code block: `NEXT_ROW_FIELDS`, `FORBIDDEN`, "N passed" |

4. A closing row of links: the long version (the post), source on GitHub,
   back to the shelf.

**States.** Live boxes paint from the snapshot and swap live, like
`/spine/next`; a stop whose live data is empty (no photo import yet, no
pinned pick) shows the box with its empty line from `spine.how.empty.*`
rather than collapsing, so the page keeps its shape. Captures are static
markup with figures interpolated from `/api/public/status` where a figure
exists, and fixed illustrative rows otherwise (Key decisions); they never
show a loading state. The page has no error state of its own: if the API
fails, the snapshot values stand and the status strip's "Last rebuilt"
cell shows the snapshot's date.

### Interactions

- ToC rows and feature cards are plain in-page anchors; the route focuses
  the target stop's h2 (the SPA shell's route-focus behaviour, PR #54).
- Nothing on the guide is interactive beyond links. No disclosure, no
  tabs, no carousel.
- Captures are not links and have no hover state. The `.cap-bar` dots and
  "signed in" tag are decoration with `aria-hidden`.

### Responsive and theme

- Desktop (≥ 72rem `page-wide`): landing strips in one row; stops in two
  columns; ToC in two columns.
- Phone (≤ 500px): status strip stacks; feature strip 2 + 2 + 1; ToC one
  column; stops stack with the live box above the capture; capture tables
  scroll horizontally inside their frame rather than widening the page.
- Both themes from the Ledger token set; the mockup declares the only new
  token: `--redact` (a diagonal hatch built from `--line`/`--sunken`) and
  reuses `--ok`, `--warn`, `--accent`, `--chart`, `--chart-2`. The status
  pills and the redaction hatch are non-text marks and need 3:1 against
  `--surface` in both themes, like the status colours in CLAUDE.md; the
  mockup values are not measured and Code should measure them.

### Accessibility

- One h1 per page (`/spine`: the Spine name; `/spine/how`: the guide
  title, with the name as a link, as What's next does).
- Each stop is a `section` labelled by its h2; the ToC is a `nav` with
  `aria-label="Stops"`.
- Column headers ("Live, from the public API", "Behind the sign-in") are
  h3s so the stop reads as an outline.
- Redacted cells carry visually hidden text "store withheld" so a screen
  reader hears why the column is blank, not an empty cell.
- The green "last rebuilt" dot has `role="img"` and a name ("rebuilt
  today"); colour is never the only signal (the time is beside it).
- Capture tables are real tables with `th` headers; the code block in
  stop 8 is a `pre` with a visually hidden caption.
- Links to code open GitHub in the same tab (no `target=_blank` surprises).

### Mockups

- `docs/planning/mockups/2026-10-21-spine-tour/chosen.html` — the spec's
  reference. Screen 1 is `/spine`, screen 2 is `/spine/how`.
- `a-field-guide.html`, `b-pipeline.html`, `c-annotated-shelf.html` — the
  three directions; `index.html` compares them.
- Fonts in the mockups are system stand-ins for the refresh's self-hosted
  faces; covers are coloured placeholders; capture rows are illustrative.

## Key decisions

| Decision | Why | Cost |
| --- | --- | --- |
| **One tour page, not explain-in-place (C).** | The audience is a hiring manager with one link. A page is sendable and reads as a story; six side sheets are not. A page is also one component set, not a sheet system with focus management. | Collectors reading What's next get no inline "why"; the ToC and the feature strip are the only ways in. |
| **Field guide (A) over the in → does → out ledger (B).** | B is truer to the module structure but densest, and its landing grows by two rows of pure machinery. A keeps a public-result column on every main stop, so the page shows the tool working, not only how it is built. | The build order of the code is implicit in the stop order rather than drawn. The post keeps that role. |
| **Borrow B's status strip onto the landing.** | "Last rebuilt 00:21 UTC today" proves the thing runs before a visitor reads a word, and it is five numbers Spine already knows. | One more public endpoint, and a strip that must hide cleanly when empty. |
| **Captures are drawn components fed by public data, not screenshots.** | Screenshots go stale the day after they are taken, need a redaction step on every retake, and are the only way a store name reaches the public site by accident. A drawn capture is current, redacts by construction (the column is never populated), and renders in both themes. | A drawing of the admin rather than the admin: a reader can tell. The `.cap-bar` chrome is the honest signal that it is an illustration; the copy says "the signed-in tool, drawn". |
| **No read-only visitor mode of `/admin`.** | Every admin page would need a server-side public projection and a cold-start wait on the free tier; the leak surface is the whole admin instead of one allowlisted endpoint. | The most convincing demo is deferred. The capture column is laid out so a stop can later link to such a view. |
| **Rows in captures are fixed illustrative data where no public figure exists** (import distances, picker candidates, Discover's indices). | The alternative is publishing per-row scores, which `test_public_outputs.py` forbids by design (`FORBIDDEN` includes `score`, `rank`, `lane`). | Those rows do not change over time. The caption says so ("illustrative"). |
| **A fourth tab rather than a nav item or a Projects-only link.** | The tour is part of Spine, so it lives under Spine's name; the tab row is already the place a visitor looks for more of it. | The tab row is four wide on a phone and scrolls horizontally, which `SpineTabs` already allows. |
| **The post stays.** | It is the long version and already published; the guide links to it per stop. | Two places to keep in step when a mechanism changes. The guide's copy lives in `spine.js`, so the diff is visible. |

Rejected directions, for the record: **B · Pipeline** lost on density and on
the landing's growth, and because its "Out, publicly" column mostly
repeated What's next; its status strip survives. **C · Annotated shelf**
lost on sendability and on the component cost of a sheet; its "Behind the
shelf" facts table is the same content as the feature strip in another
shape, and the strip's five links into the guide do that job.

## Component inventory

**Existing, reused unchanged:** `SpineHeader`, `SpineTabs` (one more
entry from `spine.tabs`), `NextBand`, `HeroNumbers`, `FavoritesRow`,
`CoverImage`, `NextRow` (in the stop 2 and 4 live boxes), `Stars`,
`useSnapshotThenLive`, `usePageTitle`, `spinePaths`.

**New, in `frontend/src/components/`:**

| Component | Role | Props (shape, not final) |
| --- | --- | --- |
| `StatusStrip` | Five-cell proof row on `/spine` | `status` (from `/api/public/status` or the snapshot); renders null without one |
| `FeatureStrip` | "What Spine does" cards | none; copy from `spine.how.features` |
| `StopIndex` | ToC on the guide | `stops` (from `spine.how.stops`) |
| `Stop` | One stop: kicker, h2, claim, body, why, links | `n`, `where`, `title`, `claim`, `why`, `links`, `live?`, `capture?` |
| `LiveBox` | Bordered box with a caption line, holds any public widget | `caption`, children |
| `Capture` | The drawn signed-in frame: bar with `url` and `tag`, body, note | `url`, `tag` ("signed in" / "GitHub Actions" / "pytest"), `note`, children |
| `Redacted` | The hatched cell with hidden text | `label` (default "store withheld") |
| `BarRow` | Label, bar, value — the Play Next terms | `label`, `value` (0–100) |

**New page:** `pages/HowItWorks.jsx` at `/spine/how`, lazy like the other
tracker pages, in `WIDE_ROUTES` via the `/spine` prefix.

**New copy home:** `content/spine.js` → `spine.how` (title, lede, five
features, eight stops with claim/why/links, empty lines, capture notes)
and `spine.tabs.how`.

**Tokens used:** `--bg --surface --sunken --line --line-strong --text
--text-2 --text-3 --accent --accent-soft --ok --warn --chart --chart-2
--rating --font-display --font-mono --font-sans --radius`; new `--redact`,
declared in both theme blocks like every other token.

## Acceptance criteria

1. `/spine` renders, in order: header with four tabs, hero numbers, the
   What's next band, the status strip, the "What Spine does" strip,
   favourites, toolbar, grid. Matches `chosen.html` screen 1 at 1280px and
   400px in both themes, allowing for real covers and figures.
2. `/spine/how` renders the title, lede, an eight-row ToC and eight stops
   in the order and layouts of the table above; matches `chosen.html`
   screen 2 at 1280px and 400px in both themes.
3. The How it works tab is active on `/spine/how` and the Shelf tab is
   not; the Spine name on the guide links to `/spine`.
4. Every ToC row and feature card lands on its stop with the stop's h2
   focused.
5. With the backend asleep, `/spine` and `/spine/how` paint from the
   snapshot with the status strip and live boxes populated from it;
   `npm run build` writes `dist/spine/how/index.html` with its own title
   and description, `render.yaml` has its rewrite, and the sitemap lists
   it (`prerender-lib.test.mjs` passes).
6. With no snapshot and no API, `/spine` renders without the status strip
   (no empty frame, no skeleton) and `/spine/how` renders every stop with
   its empty line in each live box.
7. `GET /api/public/status` returns exactly the allowlisted keys and
   `test_public_outputs.py` walks its body for `FORBIDDEN` keys; no store
   name, price, stock, score, rank, lane or recommendation id appears in
   `dist/` or in any public response the guide reads (extend `smoke.sh`
   with a grep over `/spine/how/`).
8. Redacted cells expose "store withheld" to assistive tech; the rebuilt
   dot has an accessible name; axe reports no violations on either page.
9. The feature strip is two columns with the fifth card full-width at
   400px; capture tables scroll inside their frame, and neither page has
   horizontal overflow at 400px.
10. Redaction hatch and status pills clear 3:1 against `--surface` in both
    themes, measured and recorded in the commit like the status colours.
11. The Projects card's "How it works" link and the post's "How it works"
    references point at `/spine/how`.
12. Lighthouse performance on `/spine/how` is within 5 points of
    `/spine/next` on the same run (the page adds no images beyond covers
    already in the snapshot).

## Open questions for Code

1. **`/api/public/status` shape.** Proposed, all derived from data already
   on the server: `last_run: {finished_at, run_id}` (from the nightly job's
   last successful call, which may need recording where none exists today —
   or the snapshot's own write time if that is simpler and honest),
   `catalogue: {titles, platforms}`, `stores: {watched, listings}`,
   `generated_at` (reuse `/api/public/next`'s block), `last_import:
   {spines_read, matched_auto, item_ids[]}` for stop 1. Decide whether
   `last_import` is worth a `pick_events`-style record or whether stop 1
   uses the newest `photo`-sourced items by `created_at` and a fixed line.
   Should the strip's values come from a new snapshot file
   (`snapshot/status.json`, written by `fetch-snapshot.mjs`) or be folded
   into `next.json`?
2. **Which figures in captures are live.** Stop 3's six term values for the
   pinned pick would need the per-term breakdown on the public API; the
   forbidden list bans `score` and `rank`, written for Radar and Discover
   rows. Either allowlist a `terms` block on `tonight.up_next` only
   (Play Next's terms are the owner's own taste, not a store's), or keep
   stop 3's bars illustrative. Recommendation: illustrative in this
   release; revisit if the strip and live boxes feel thin.
3. **Code links.** Links to GitHub paths are hard-coded strings in
   `spine.js`; a renamed module leaves a dead link. Is a build-time check
   (the paths exist in the repo at prerender time) worth adding to
   `prerender-lib.test.mjs`, or is `smoke.sh` enough?
4. **The `NEW` marker.** A string constant with a removal date in a
   comment, or a date compare (`shownUntil`)? Recommendation: constant;
   remove it in the next copy pass.
5. **Performance of the landing.** The landing now reads `items`, `next`
   and `status` from the snapshot. Confirm the three reads are one
   round-trip's worth at paint, or fold `status` into `next.json`.
6. **The post.** The guide duplicates the post's structure in eight short
   stops. Should the post's "What the public sees" section shrink to a
   pointer at stop 8, or stay as is until the next copy pass?
