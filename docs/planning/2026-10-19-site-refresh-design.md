---
status: ready-for-plan
mockups: docs/planning/mockups/2026-10-19-site-refresh/
chosen: chosen.html
---

# Site refresh: new visual identity, admin shell, analytics

Design doc (Cowork, 2026-10-19). Baseline is `main` at `dd77ca7` (#69).
Joey's choices are recorded in "Key decisions"; the mockups are linked
under "Design". Code writes the plan against the real codebase; this doc
has no tasks or file lists on purpose.

## Problem

- **Every page is the same narrow column.** `RootLayout` wraps everything in
  `.page` (45rem) with the résumé masthead above; Home, About, Projects and
  Blog differ only in their copy. The site reads as a personal blog rather
  than a senior engineer's site. The Spine pages (72rem, compact masthead)
  are the only ones with a layout of their own.
- **Admin is a list of links.** `/admin` renders six bare `<p><Link>` rows,
  a "Signed in as" line and a Sign out button (`pages/Admin.jsx`). Each tool
  page is an island with its own header pattern: Catalogue has stat tiles
  and a source table, Radar and Discover have a generate toolbar, Import is
  a file input and a button, Play Next has chips, Store list is phone-first.
  There is no shared admin chrome, no grouping, and no way to tell at a
  glance whether the nightly ran or what needs attention.
- **No analytics of any kind.** Nothing in the frontend, the API or the
  Render config counts visitors. Joey's guess is zero; there is no way to
  check.

## Scope

**In**

- A new visual identity for the whole site: tokens, type, masthead, footer,
  page widths, cards and tables, in light and dark. Public pages Home,
  About, Projects, Blog, BlogPost, Now, Colophon, NotFound get new layouts.
- The Spine public pages (`/spine`, `/spine/:id`, `/spine/next`,
  `/spine/year/*`, `/spine/journal/*`) are re-skinned by the new tokens and
  the new masthead. Their structure and components (PosterGrid, PosterCard,
  FilterChips, ShelfToolbar, NextBand, PlayJournal, Year in review) do not
  change in this phase.
- An admin shell: grouped sidebar on desktop, bottom tab bar on a phone, a
  Dashboard landing at `/admin`, and every existing admin page moved inside
  the shell with a consistent page header.
- First-party analytics: a beacon from public pages, storage and daily
  rollups in Postgres, `/admin/analytics`, and a 7-day figure on the
  Dashboard.
- The copy changes in `2026-10-19-copy-review.md`, applied as the pages
  they belong to are rebuilt (see "Copy" under Design).

**Out (explicitly)**

- Redrawing the shelf components or changing any Spine interaction.
- Any third-party analytics script, cookies, or IP geolocation.
- New admin features beyond the Dashboard and Analytics pages (no new
  catalogue or recommendation behaviour).
- Copy edits beyond the review: no new sections, no new posts. Joey
  finesses the proposed lines in the PR; the review gives the intent and
  a draft, not final wording.
- The resume PDF, OG card image, and prerender/snapshot pipeline (they keep
  working; `og-card.png` can be regenerated in a follow-up to match).

## Design

Chosen direction: **A · Ledger**, with B's serif display headline on the
two page-opening titles (Home hero, About). Mockup: `chosen.html` in the
mockups folder. `a-ledger.html`, `b-editorial.html` and `c-console.html`
are the rejected directions, kept for the record; `index.html` links all
four. Each mockup's top bar switches light/dark and 1280/400.

### Identity

- **Palette.** One neutral scale and one cool accent. Light: page
  `#fcfcfb`, surface `#ffffff`, sunken `#f3f3f0`, line `#e4e4df`, text
  `#15171a` / `#4a4f57` / `#7a808a`, accent `#1f5fbf` on white. Dark: page
  `#0f1114`, surface `#15181c`, sunken `#1b1f24`, line `#262b32`, text
  `#eceef1` / `#aeb4bd` / `#7d848e`, accent `#6ea0ef` on `#0f1114`. Status
  colours: ok green, warn amber, one chart blue plus its soft tint. The
  mockup values are a starting point: Code re-measures every text/background
  pair to AA (4.5:1) and every non-text mark to 3:1, the way `index.css`
  documents today, and records the measurements in the same style.
- **Type.** Three faces, all self-hosted via `@fontsource` like today
  (Newsreader and Public Sans are removed). Sans for everything: Inter.
  Mono for labels, dates, counts: JetBrains Mono. Serif display for exactly
  two headlines, the Home hero and the About title: Source Serif 4, with an
  italic cut for the accent phrase. Static cuts, latin only, same reasoning
  as the comment in `main.jsx`. If a package is unavailable, Code picks the
  nearest fontsource face and notes it in the plan.
- **Texture.** Hairline rules and 1px borders, 6–8px radii, no shadows on
  public pages. Mono uppercase "kicker" labels (`SENIOR SOFTWARE ENGINEER ·
  DENVER, CO`, `PROJECT · LIVE`) carry metadata everywhere.
- **Theme.** Dark stays the brand default; the toggle, the pre-paint script
  in `index.html` and the stored preference keep their behaviour. Both
  themes ship for every screen.

### Masthead and footer (all routes)

- 60px bar with a hairline below: a square monogram mark (`JH`, filled
  with `--text`) and the name, the nav as text links with a 2px underline
  on the active item, and on the right "Resume ↓" and the theme toggle.
  On a phone: monogram, name, toggle, and a Menu button that opens the nav
  as a sheet.
- No photo in the masthead. The photo moves to About (optional, as the
  aside's first element) and is dropped from Home.
- `COMPACT_ROUTES` goes away: one masthead everywhere. `WIDE_ROUTES`
  remains the mechanism for page width, with the new limits below.
- Footer: a single rule, then two lines on a phone / two ends on desktop:
  `© 2026 Joey Haas · Source · Now · Colophon` and `email · GitHub ·
  LinkedIn · Sign in/Admin`. Same links and sign-in behaviour as today.

### Page widths

- Prose pages (Blog, BlogPost, Now, Colophon, NotFound): 45rem column as
  today.
- Home, About, Projects: 1040px content width (`.wrap`), 24px gutters,
  16px at phone width.
- Spine public pages: unchanged 72rem.
- Admin: full width inside the shell; the main pane has 32px padding
  (16px on a phone).

### Home

- Hero in two columns on desktop (1.4fr / 0.8fr): kicker, the serif
  headline with the accent phrase in italic, a lede, and three actions —
  primary "About me", secondary "See Spine", ghost "GitHub ↗". To the right
  a **facts table**: Now, Focus, Stack, Last shipped, Playing. Now/Focus/
  Stack come from `profile.js`; "Last shipped" is the newest post or a
  static line in content; "Playing" comes from the build-time snapshot's
  playing item and is omitted when there is none.
- "Work" section: three equal cards — Spine (with the favourite covers
  strip, as today), This site, latest post. Cards are links; card text is
  never accent-coloured.
- "Experience" section: three rows (mono date, title, one line) from
  `experience.js`, grouped as the mockup shows (the three pre-Guild roles
  collapse to one row on Home; About lists all).
- On a phone the hero stacks, the facts table follows the actions, cards
  stack.

### About

- Two columns on desktop (280px / 1fr), a sticky aside: serif "About",
  kicker location, then a key/value list (Role, Company, Engineering,
  Product, Resume PDF). The photo may sit above the title.
- Body: mono-uppercase section labels (Summary, Experience, Areas of
  expertise, Toolbox). Experience is a timeline with a hairline rail and a
  dot per role; the current role's dot is the accent. Toolbox is mono
  chips. Content comes from `profile.js` and `experience.js` unchanged;
  `education.js` renders under Experience as today.
- On a phone the aside is not sticky and precedes the body.

### Projects, Blog, Now, Colophon, NotFound

- Projects: the same card language as Home's Work section, one card per
  project at full width, cover strip and tech chips kept.
- Blog index: list rows (mono date, title, one line). BlogPost: the 45rem
  column with the new type; code blocks keep `--code-bg` re-measured.
- Now, Colophon, NotFound: the prose column with the new type.

### Admin shell

- Desktop: 232px sidebar (surface colour, hairline right) with the
  monogram and "Admin", then four groups with mono-uppercase labels:

  | Group | Items | Route today |
  |---|---|---|
  | Overview | Dashboard, Analytics | `/admin` (new content), `/admin/analytics` (new) |
  | Collection | Shelf, Import photos | `/admin/collection`, `/admin/import` |
  | Recommend | Play Next, Discover, Radar | `/admin/play-next`, `/admin/discover`, `/admin/radar` |
  | Catalogue | Sources, Store list | `/admin/catalogue`, `/admin/store-list` |

  Shelf shows the owned count beside it. The sidebar foot shows the
  signed-in email, "View site ↗" and "Sign out". Existing routes keep their
  URLs; only the labels change ("Collection" → "Shelf", "Catalogue" →
  "Sources" in the nav; page titles follow).
- Phone: no sidebar; a five-item bottom tab bar — Home, Shelf, Picks,
  Stores, More. Picks opens a sheet with Play Next / Discover / Radar;
  Stores with Sources / Store list; More with Analytics, Import, View site,
  Sign out. Store list stays phone-first as designed.
- Every admin page gets the same header: title (24px), optional one-line
  description, and a right-aligned status or control area (the existing
  Generate toolbars, Refresh buttons and the Shelf/List toggle move here).
  Stat tiles (Catalogue's counts, Shelf's owned/finished) use one tile
  component.
- The public masthead and footer do not render on `/admin*`; the shell
  replaces them. The sign-in and error states of `/admin` (checking, waking
  the server, denied, signed out, sign-out failed) render inside a plain
  centred panel without the sidebar, with the same copy as today.

### Dashboard (`/admin`)

- Header status: API awake · nightly ok with the latest time, from the
  same sources `LastNightly` reads (`/api/physical/status` and the store
  list summary).
- Four tiles: Owned (public · hidden), Finished in the current year (all
  time · average), Needs attention (catalogue rows needing a match),
  Views · 7 days (visitors).
- Nightly jobs panel: one row per job — catalogue refresh, Radar, Discover,
  public snapshot — with time, a one-line summary and ok/stale/failed. "Run
  now" links to the existing manual triggers where they exist.
- Quick actions: Import photos, Store list, Add a game (opens the Shelf's
  add form), Rate a few (links to Discover's table with the count).
- Recent changes: the last few item edits and nightly outcomes (see Open
  questions: there is no change log today).

### Analytics (`/admin/analytics`)

- Range control: 7d · 30d · 90d · All (30d default).
- Four tiles: Page views, Visitors, Views per visitor, Best day (date and a
  note if a referrer dominated).
- Views per day bar chart; the highest day in the accent, the rest in the
  soft tint; UTC day boundaries labelled.
- Three lists with proportional bars: Pages (views), Referrers (visitors,
  by hostname, "Direct / none" first), Devices (desktop / phone / tablet
  from a coarse UA class).
- A footnote explaining what is counted and the sleeping-API caveat.
- Empty state (the launch state): the tiles show 0, the chart area reads
  "No views yet. The beacon is live; check back tomorrow." with the time
  the beacon went live.

### Beacon (public pages)

- On every public route change, `navigator.sendBeacon` posts path,
  referrer hostname, a coarse device class and a screen-width bucket to the
  API; the body carries no identifier. Nothing is sent on `/admin*` or
  when a session exists (the `signedIn` outlet context), so Joey's own
  visits are excluded. `Do Not Track`/`Sec-GPC` is honoured by not sending.
- Visitor counting is a daily-salted hash of IP + UA computed on the server
  and never stored raw; the salt rotates at UTC midnight so a visitor is
  unique per day and cannot be joined across days.
- Rows are raw per view; a nightly rollup writes per-day/per-page/per-
  referrer/per-device counts, and raw rows older than 90 days are deleted.

### Copy

`docs/planning/2026-10-19-copy-review.md` is part of this handoff. It
gives, per page, the current line, a proposed line and the reason. Two
site-wide decisions are taken here so every edit is written the same way;
Joey can override either in the PR.

- **Contractions everywhere** ("I'm", "what's", "they're"). The site
  greets people with "I'm Joey"; `spine.js`, the Next page, Now, Colophon,
  NotFound and the post are brought in line.
- **American spelling in user-facing copy**: Favorites, Catalog,
  normalized, colors. Routes (`/admin/catalogue`), module names and API
  fields are not renamed; only labels, titles and prose move. Record the
  decision in a comment in `spine.js`.

What the review changes, by page, and where it lands in the refresh:

- **Shared strings** (review 1.3, 1.4): one "waking the server" line and
  one error line in a content module imported by Collection, Item, Next
  and the admin pages; one page-title pattern, enforced by
  `AdminPageHeader` and `usePageTitle`.
- **Home** (2): the current intro sentence becomes the hero lede; the
  hero headline is the only place "correctness and money are the same
  problem" appears; "Last shipped" in the facts table is derived or
  dropped.
- **About** (3): the bio and the experience summaries are rewritten with
  the Guild jargon key applied (`claude/resume-guild-jargon-key.md` in the
  project; the review quotes the proposals). Toolbox chips trimmed.
- **Projects** (4): "This Website" → "This site"; the Spine card uses
  `spine.projectLine`; the Play Next highlight is split into two sentences.
- **Spine public pages** (5): the Next lede, two empty states, and the
  freshness fragments made parallel.
- **Now, Colophon, NotFound** (6): Colophon rewritten for the new fonts
  and the beacon; NotFound gets two links out; the Shiki sentence untangled.
- **Post** (7): spelling and contractions only, plus an optional
  two-sentence summary under the title.

### Responsive and theme behaviour

- Breakpoint at 700px for the public pages and the shell (the mockups use
  container queries; the real site uses a media query at the same width).
- Dark and light for every screen above; the admin shell's sidebar is the
  surface colour in both.
- Mono labels are 12px uppercase with 0.02em tracking; body 15px; hero
  headline 56px desktop / 38px phone.

### Accessibility

- Every text/background pair clears AA; non-text marks (status dots, chart
  bars against the surface) clear 3:1; measurements recorded in the CSS as
  today.
- The nav keeps the skip link and `useRouteFocus`; the sidebar is a `<nav
  aria-label="Admin">`; the phone tab bar is a `<nav>` with
  `aria-current="page"`; sheets trap focus and close on Escape.
- Status is never colour alone: dots carry a text label (ok / stale /
  failed).
- The chart has a visually hidden table equivalent; bars have
  `aria-label`s with the value.
- The serif headline's italic accent phrase is decorative; screen readers
  read the sentence once.

## Key decisions

1. **New identity rather than a polish** (Joey, 2026-10-19). The warm
   palette and Newsreader read as a blog to him; the point of the exercise
   is to read as a senior engineer's site. Cost accepted: every contrast
   measurement is redone and the shelf is re-skinned.
2. **A · Ledger wins**, with B's headline. Reasons: it makes the admin look
   like real tooling without turning the public site into a SaaS landing
   page, and its rules-and-borders language sits well under the shelf's
   cover grids.
   - *B · Editorial* lost because an all-rules, no-cards system fights the
     shelf (covers already supply the texture), and its section-bar admin
     is the least app-like of the three. Its headline treatment survives.
   - *C · Console* lost because the tinted background, shadows and pill nav
     make the public pages read as a product marketing page; the admin was
     strong but the identity has to serve both sides.
3. **Admin IA held constant** across directions (Overview · Collection ·
   Recommend · Catalogue) and chosen on how the tools are used: Collection
   is what is owned, Recommend is what to play or buy, Catalogue is what
   exists in the world. Analytics sits under Overview because it is about
   the site, not the collection.
4. **First-party, cookie-free analytics** over GoatCounter/Cloudflare.
   Consistent with self-hosting fonts to keep visitor IPs off third
   parties, and a real demo of the stack. Accepted: undercounting while the
   free API sleeps; `sendBeacon` queues past unload but a cold start can
   still drop the first hit of the day.
5. **Admin built to be seen** but not public: no read-only demo mode. A
   screenshot of the Dashboard is the showcase.
6. **Spine components unchanged** this phase. They were polished in
   #33–#69 and carry their own measured status tokens; re-skin via tokens
   only, and open a separate design pass if the new identity exposes
   problems on the shelf.

## Component inventory

**Tokens (replace the current set in `index.css`)**: `--bg`, `--surface`,
`--sunken`, `--line`, `--line-strong`, `--text`, `--text-2`, `--text-3`,
`--accent`, `--accent-ink`, `--accent-soft`, `--ok`, `--warn`, `--chart`,
`--chart-2`, `--code-bg`, `--font-sans`, `--font-mono`, `--font-display`,
`--radius`. The shelf's `--status-*`, `--rating`, `--overlay`, `--skeleton`
and `--grid-gap` stay, re-measured against the new surfaces.

**New components**: `SiteMast` (replaces the `SiteHeader` photo/name
header and `SpineHeader`'s compact variant), `MobileNavSheet`, `Kicker`
(mono uppercase label), `FactsTable` (Home), `AdminShell` (sidebar + tab
bar + page header slot), `AdminPageHeader`, `StatTile`, `Panel`,
`JobStatusRow`, `BarList` (label · bar · number), `DayBars` (the views
chart), `RangeControl`, `AnalyticsBeacon` (a hook mounted in `RootLayout`).

**Existing, re-skinned only**: PosterCard, PosterGrid, FilterChips,
SortControl, ShelfToolbar, Stars, QuickRate, ShelfCardActions, CoverImage,
CoverStrip, ItemForm, MetadataPicker, RecommendationCard, RateAFew,
NextBand, NextRow, PlayJournal, SpineTabs, LastNightly (its data loading
feeds the Dashboard header and jobs panel), RouteErrorBoundary.

**Removed**: `SiteHeader`'s home/compact modes, `COMPACT_ROUTES`, the
Newsreader and Public Sans fontsource imports.

## Acceptance criteria

- Home at 1280px and 400px, light and dark, matches `chosen.html` screens
  1 (hero layout, facts table, three cards, experience rows).
- About at 1280px and 400px matches `chosen.html` screen 2 (sticky aside on
  desktop, timeline, chips).
- `/admin` signed in matches screen 3: sidebar groups and labels as listed,
  four tiles, nightly jobs, quick actions, recent changes; at 400px the
  sidebar is replaced by the five-item tab bar.
- `/admin/analytics` matches screen 4, and renders the empty state with all
  zeros and the launch note when no views exist.
- Every existing admin page renders inside the shell with the shared page
  header and its controls in the header's right slot; no admin page shows
  the public masthead or footer.
- All existing admin and Spine routes keep their URLs; `/collection*`
  redirects still work; prerendered heads for the public routes are
  unchanged.
- Visiting any public page as a signed-out visitor produces exactly one
  beacon request per route change; visiting while signed in, on `/admin*`,
  or with `Sec-GPC: 1` produces none.
- Two page loads from the same client on the same UTC day count as one
  visitor and two views; the same client the next day is a new visitor.
- The beacon body and the stored row contain no raw IP and no UA string.
- Raw rows older than 90 days are gone after the nightly rollup; the
  rollup totals for a day equal the raw counts for that day before
  deletion.
- Every text/background pair in both themes measures ≥ 4.5:1 and every
  status mark and chart bar ≥ 3:1 against its surface; measurements are
  recorded in `index.css` comments.
- Lighthouse accessibility on `/`, `/about`, `/admin` (signed in) and
  `/admin/analytics` shows no contrast or name/label failures.
- Keyboard: Tab reaches the skip link, the nav, the theme toggle, every
  sidebar item and tab-bar item in order; the mobile nav sheet closes on
  Escape and returns focus to the Menu button.
- Copy: no user-facing string contains "learner", "spend-writing",
  "funding context", "squad" or "employer partner"; `grep -ri` over
  `frontend/src` and `frontend/posts` for "favourite", "catalogue",
  "normalis" finds only route paths, module names and API fields; exactly
  one "waking the server" string and one load-error string exist in
  `frontend/src`; "correctness and money are the same problem" appears on
  one page.
- The Colophon names the fonts actually shipped and describes the
  beacon.
- `npm test`, `npm run lint`, `pytest` and `ruff` pass; `scripts/smoke.sh`
  passes after deploy.

## Open questions for Code

- **Beacon endpoint and storage.** Proposed: `POST /api/track` on the
  public router, body `{path, ref, device, width}`, 204 always (never an
  error to the browser). Tables: `page_views(id, day, path, referrer_host,
  device, visitor_hash, created_at)` and `daily_stats(day, path,
  referrer_host, device, views, visitors)`. Additive migration `0008`. Is
  the hash salt stored in the DB (one row per day) or derived from a secret
  plus the date? Derived is simpler and needs no table.
- **Rate limiting and abuse.** A beacon endpoint with no auth can be
  spammed. Is a per-IP token bucket in memory enough on a single free
  dyno, or should the rollup cap any visitor at N views per day?
- **Read endpoint.** `GET /api/analytics?range=30d` under `require_admin`
  returning the tiles, the day series and the three lists in one response,
  so the page is one request after the session check. Cache 60 s.
- **Rollup scheduling.** The existing nightly workflow (job token, "Spine
  Next spec K1") can call a `POST /api/analytics/rollup`; or the rollup
  runs lazily on the first admin read of the day. Preference: the nightly,
  so the 90-day deletion does not depend on Joey opening the page.
- **Recent changes on the Dashboard.** There is no change log. Options:
  derive from `items.updated_at` plus `pick_events` and the nightly status,
  or add a small `events` table written by the admin routes. The first is
  enough for v1 if the row says only what changed and when.
- **"Playing" on Home.** The build-time snapshot includes status; confirm
  it exposes the playing item so Home needs no API call.
- **Fonts.** Confirm `@fontsource/inter`, `@fontsource/jetbrains-mono` and
  `@fontsource/source-serif-4` exist at the versions you install; static
  cuts needed: Inter 400/500/600/700, JetBrains Mono 400/500, Source Serif
  4 500 + 400 italic. Watch the bundle: the current fonts total ~70 kB.
- **Mobile nav sheet.** Native `<dialog>` with `showModal()` is enough and
  gives focus trapping for free; confirm no polyfill is wanted.
- **Performance.** The admin chunk grows with the shell; keep the
  Dashboard's data to the two existing status calls plus the analytics
  read, all behind the single `/api/auth/me` check in `RootLayout`.
- **Prerender.** `prerender.mjs` writes heads for public routes; the new
  masthead changes markup, not heads, but confirm the OG description still
  matches the new Home lede.
- **Copy in the plan.** The About bio and experience rewrites are the
  recruiter path and can ship in the first PR with the public pages; the
  shared waking/error module is a natural first commit. Joey edits the
  proposed lines in the PR rather than before it.
- **`docs/planning/mockups/`** is not in `.gitignore`; add it when picking
  this up, before the folder lands in a commit.
