# joey-haas.dev

Personal resume/portfolio website for Joey Haas. React frontend + FastAPI
backend, deployed on Render via Blueprint (render.yaml).

## Architecture

- `frontend/` — Vite + React 19 SPA, routed with react-router v8 (declarative
  mode; import from `react-router`, not `react-router-dom`). Deployed as a free
  Render static site. Public pages other than `/shelf*` and `/stats` make
  no API calls (apart from RootLayout's one `/api/auth/me` session check,
  which fails quietly to signed out, and the analytics beacon, a
  fire-and-forget `sendBeacon` to `/api/track` that nothing waits on) —
  bio and project
  content are static modules in `frontend/src/content/`, so the site
  renders fully while the free-tier backend is asleep. Home and
  Projects may read `/snapshot/items.json`, the build-time snapshot: a
  static file on the site's own origin, not an API call. Vite proxies
  `/api` to localhost:8000 for the tracker and the admin pages.
- `backend/` — FastAPI app (`main.py`), **Python 3.12** to match Render.
  macOS system Python is 3.9 and cannot install this dependency set. Deployed
  as a Render web service (free tier: spins down after ~15 min idle). Config is
  validated at import (`config.py`), so the service refuses to start when an
  env var is missing rather than running insecurely. Logging goes through
  `config.configure_logging()`, which keeps the HTTP client's loggers at
  WARNING: several source keys travel as query parameters, and at INFO the
  client writes every request URL -- key included -- to Render's logs. New personal projects
  should be added as APIRouter modules (one file per project), as `auth.py` is.
- `render.yaml` — Render Blueprint defining both services. Changing it and
  pushing updates the infrastructure.

## Commands

- Frontend dev: `cd frontend && npm run dev` (http://localhost:5173)
- Backend dev: `cd backend && source .venv/bin/activate && uvicorn main:app --reload` (http://localhost:8000)
- Frontend build check: `cd frontend && VITE_DAILY_SALT=local npm run build`
  (`vite.config.js` refuses a build without the daily game's salt)
- Frontend tests: `cd frontend && npm test`
- Browser tests: `cd frontend && VITE_DAILY_SALT=local npm run build && npm run e2e`
- Admin browser tests (local only): `cd frontend && VITE_DAILY_SALT=local npm run build && npm run e2e:admin` (needs local Postgres and ports 8000/4173; README → Browser tests)
- Review screenshots: `cd frontend && npm run shots` (or `E2E_BASE_URL=https://joey-haas.dev npm run shots`)
- Backend tests: `cd backend && ./.venv/bin/pytest`. One run at a time: every
  run drops and recreates the schema in the one local test database, so two
  at once (a second worktree, a review agent) fail each other with "relation
  items does not exist" and deadlocks, not with real bugs
- Post-deploy smoke: `./scripts/smoke.sh https://joey-haas.dev https://api.joey-haas.dev`

## Deploying

Push to `main` on GitHub → Render auto-deploys both services. There is no
staging environment; verify `npm run build` passes and the app works locally
before pushing.

## Conventions

- **Design rules: `docs/design-system.md`.** Page types and their parts,
  the one component for each job (header, breadcrumb, card, figure, chip
  row, state pill, empty and error states), the two shelf widths, names,
  the public/admin twin rule and the feature status list. Any design step
  reads it before drawing; a design that needs a rule it lacks adds the
  rule there in the same PR, and a parked feature gets no design changes.
- Plain CSS in `frontend/src/index.css`. No CSS framework unless deliberately
  added. Design tokens are CSS variables declared twice: dark values on
  `:root` and light overrides under `[data-theme='light']`. Style with the
  tokens, never with raw hex — a literal color will be wrong in one theme.
- Type and spacing are tokens too: `font-size` is `--fs-*` (`--fs-56` for the
  display figure). Padding, margin and gap use a `--space-*` step only where
  the value is exactly one (0.25 to 4rem); off-scale values (0.35rem, 0.6rem,
  1.25rem) stay literal until #213 maps them. Nothing renders under 12px
  except labels inside drawings that carry an accessible name elsewhere
  (intake demo spines, run-cell marks, map labels), listed by selector in
  `typeScale.test.js`. `typeScale.test.js` and `spaceScale.test.js` enforce it.
- `Sheet` is the one modal dialog shell: a native `<dialog>` opened with
  `showModal()`, focus moved in and back out, Escape and a backdrop press
  routed through `onClose`, and `canClose` to refuse a close (sync only). It
  does not lock page scroll. `NavSheet` is the same for nav menus. Don't
  hand-roll a dialog.
- Tile family: `CoverTile` (a comic cover; `tile.kind === 'book'` is a
  collected edition), `PosterCard` (a poster) and `StatTile` (a figure; its
  `children` take a composite value, `StatTiles figures` the item-page look).
  `CoverStrip`, `GarmentTile` and `AreaCard` are different jobs.
- Theming: dark is the brand default and is written into the markup as
  `<html data-theme="dark">`, so it survives a JavaScript failure. A pre-paint
  script in `frontend/index.html` switches to `localStorage('theme')` when one
  is stored; `RootLayout` owns the state after that and persists only what the
  visitor actually chooses. `prefers-color-scheme` is deliberately ignored.
  The accepted-value check exists in both the script and `RootLayout` — keep
  them in step.
- Fonts are self-hosted static `@fontsource` faces imported in
  `frontend/src/main.jsx`, latin only — never a Google Fonts `<link>`. Using a
  new weight in CSS means adding the matching import, or the browser silently
  falls back to a cut that is loaded.
- Blog code blocks are highlighted at build time in both palettes at once
  (`frontend/vite-plugin-markdown.js`): Shiki inlines the default theme's
  colors and emits everything else as `--shiki-light*` / `--shiki-dark*`
  custom properties, which `index.css` promotes. Adding a Shiki line
  transformer needs those overrides narrowed, or a line-level color gets
  overridden.
- The Shiki theme pair and `--code-bg` are chosen together, on measured
  contrast: every color either theme emits has to clear 4.5:1 on the
  background it actually sits on. Changing either means measuring again.
- TIL notes are markdown in `frontend/notes/`, compiled by the same plugin
  as posts and listed in full at `/til`, with `/til/:slug` for each. Posts
  and notes share their published rule (`lib/markdownEntries.js` in the app,
  `scripts/markdown-lib.mjs` in the build: drafts out, newest first), the
  date and tag row (`PostMeta`, `lib/formatDate.js`) and the feed writer.
  A note's headings start at `###`, since its title is the `h2` on `/til`;
  `dist/til/feed.xml` is written even when empty. The footer and Blog index
  link TIL only while a note is published (`hasNotes` is a prop on
  `SiteFooter`, so its tests need no content mock). Any test that imports
  `content/posts.js` or `content/notes.js`, directly or through a component,
  mocks it: Vitest has no markdown plugin.
- Trips are the third markdown collection: `frontend/trips/<slug>.md` in
  the grammar parsed by `scripts/trip-markdown.mjs` (README → Travel log),
  at `/travel` and `/travel/:slug`, under the same published rule. Day
  headings carry no dates (they derive from `date` and `precision`), and a
  published trip may not contain `TODO`. Photo originals stay in the
  gitignored `trips/<slug>/photos/` (GPS never reaches git); the WebPs
  `build-travel-images.mjs` writes to `public/travel/<slug>/` and
  `photos.json` are committed. Nav and footer show Travel only while a trip
  is published (`hasTrips`), and tests mock `content/trips.js` like posts.
  `DrawnMap` (`components/`, placed by `lib/mapFit.js`, drawings in
  `content/maps/`) is the one map component: Denver spots reuses it.
- The Games and Comics tabs and the Denver footer link hide while their page
  is empty (#125), decided at build time like `hasNotes`: `vite.config.js`
  reads `public/snapshot/{items,comics,spots}.json` (Games counts the games
  in the items snapshot) through `scripts/snapshot-presence.mjs` into
  `__SNAPSHOT_PRESENCE__`, which `lib/snapshotPresence.js` turns into
  `hasGames`, `hasComics` and `hasSpots`. Only a
  written, empty snapshot hides a link; dev, tests and a failed optional
  fetch keep both. No runtime request.
- Denver spots: the public `/denver` map and list,
  `/admin/spots` (finder and spot list) and `/admin/weekend` (planner),
  backed by `spots_routes.py`, `spots_candidates_routes.py` and
  `spots_weekend_routes.py`, with the sources in `backend/spot_sources/`
  (read its README first). The map drawing in `content/maps/denver.js` is
  generated from OpenStreetMap by `frontend/scripts/draw-denver-map.mjs`
  and is ODbL: keep its header, and keep the visible attribution `SpotMap`
  draws from it, linking https://www.openstreetmap.org/copyright. Settings, last-run summaries
  (`weather.last_run`, `candidates.last_run`) and each week's plan
  (`plan:<iso-week>`) are rows in `spot_settings` (one JSONB value per
  key), never new columns. The public field for a spot's line is `blurb`,
  because `test_public_outputs.py` forbids `note` at any depth, and
  `PublicSpot` carries `spot_id` and no anchor, visit or distance. The
  Dashboard's Weekend forecast and Spot finder rows read
  `GET /api/spots/status`.
- Keep the site a real multi-section/multi-page website (react-router when
  pages are added), not a rendered resume document. A downloadable PDF resume
  is an optional accessory only.
- API routes live under `/api/`. CORS allows exactly `FRONTEND_URL`
  (`config.allowed_origins`, applied in `backend/main.py`), plus the Vite
  dev origin only when `FRONTEND_URL` is itself localhost; the same list
  gates foreign-origin writes (`origin_check.py`).
- `frontend/changelog.md` is the public changelog, shown on `/stats`:
  `## YYYY-MM-DD` headings, one bullet per shipped change, newest first,
  markdown links where a change has a page. **A shipped feature adds its
  entry**, written in the plan that ships it, so it is part of done.
  `lib/changelog.js` parses it (throwing on a heading that is not a real
  date, a date with no bullets or used twice, a nested bullet), and
  `scripts/prerender.mjs` runs the parser on the file during `npm run
  build`, so a bad file fails the build rather than the page; the browser
  parses it again at module load (`content/changelog.js`).
- Specs and plans live in `docs/planning/`, committed alongside the code they
  describe: `<date>-<topic>-design.md` for the spec, `<date>-<topic>-plan.md`
  for the plan. Mockups and the `.superpowers/` execution scratch stay out of
  git — the first are disposable once the UI exists, the second is process
  telemetry.
- The tracker shelf is one design system for the public Games and Comics
  pages (`/shelf/games`, `/shelf/comics`) and their admin twins
  (`/admin/shelf/games`, `/admin/shelf/comics`). `/shelf` and the old
  `/admin/collection` list path redirect client-side (`ShelfRedirect` keeps
  the query, `AdminListRedirect` the query and the pull list's prefill state);
  a comic is on exactly one list on each side. Its tokens (`--rating`, `--status-*`, `--overlay`,
  `--skeleton`, `--grid-gap`) live in both theme blocks like every other
  token, and the status colors were chosen on measured contrast: each clears
  3:1 against `--surface` in both themes (they are non-text marks, and the
  stacked bar's 2px gaps are `--surface`), and `--status-backlog` also clears
  3:1 against `--line`. Changing one means measuring again; the ratios are
  recorded beside the tokens in `index.css`.
- Tracker pages break out of the 45rem prose column via `page-wide` (72rem),
  which `RootLayout` applies to any path in its `WIDE_ROUTES` list or nested
  under one. Add a new public tracker route there, not in a page's own CSS.
  `/admin*` is not in it: `SHELL_ROUTES` drops the public masthead, footer
  and page frame, and `AdminLayout` (`layouts/`) checks the session once and
  renders every admin page inside `AdminShell` (area rail, the area's page
  list, phone tab bar). A new admin page is a child route of `AdminLayout`
  in `App.jsx`, a page in its area in `ADMIN_AREAS`
  (`components/adminAreas.js`) and in `ADMIN_ROUTES` (`prerender-lib.mjs`),
  and titles itself through `AdminPageHeader`. Admin pages build from
  `StatTile`, `Panel` and `JobStatusRow`; Home is one `AreaCard` per area.
  Home, About and Projects take the 1040px `page-content` measure through
  `CONTENT_ROUTES` (exact paths, a trailing slash ignored); every other page keeps the 45rem
  column unless it is in `WIDE_ROUTES` (72rem).
  `RootLayout` also passes `{ signedIn }` as outlet context, so a routed page
  reads the session instead of calling `/api/auth/me` again.
- Shelf components live in `frontend/src/components/`: `PosterCard`,
  `PosterGrid`, `FilterChips`, `SortControl`, `ShelfToolbar`, `Rating`,
  `QuickRate`, `ShelfCardActions`, and the pieces the public pages share:
  `ResultBar`, `CoverKey`, `ShowMore`, `JumpNav`, `CappedList` and
  `EmptyState` (the one empty state).
  `SortControl` is chips on a wide screen and a select on a phone unless it
  is given `select`, the public shelf's labeled select at every width.
  `FavoritesRow`, `StatusBar`, `RatingHistogram`, `FinishesStrip` and
  `OnCartridge` are exported from `components/ShelfOverview.jsx`; every shelf
  figure is a `StatTile`. A `FilterChips` group takes a `limit` (the rest sit
  behind More…). A card's admin controls are a sibling of its link, never
  nested inside it, and a private admin row always carries a Private tag.
- `FilterChips` hides a group with at most one chip to show and none
  pressed, on both shelves; a pressed chip always keeps its group.
- Nothing on the shelf is hover-only: anything revealed on hover is also
  revealed by `:focus-within`, with `opacity` or `clip-path` rather than
  `display: none` or `visibility: hidden`, which would make it unfocusable.
  Every non-text mark with an accessible name gets `role="img"`; an
  `aria-label` on a bare `span` is ignored by screen readers.
- Shelf preferences go through `readShelfPref` / `writeShelfPref` in
  `lib/shelf.js`, which survive a throwing `localStorage`. Keys are
  namespaced per page (`shelf.public.*`, `shelf.admin.*`) so the two shelves
  keep separate defaults, and page tests clear storage in `afterEach`.
- A wait on the API goes through `withDeadline` and `useElapsed`
  (`lib/waits.js`, `lib/useElapsed.js`); its words live in
  `content/status.js`.
- Anything viewport-dependent reads `useMediaQuery` from
  `lib/useMediaQuery.js`, never `matchMedia` directly: jsdom has no
  `matchMedia`, so the hook returns false there and tests stub it.
- Link previews and search titles come from `frontend/scripts/prerender.mjs`,
  which writes `dist/<route>/index.html` with its own head for every public
  route after `vite build` (copy from `src/content/`, items from the
  snapshot only). A new public page needs its row in `publicRoutes`
  (`prerender-lib.mjs`) or it previews as the site card, **and** a rewrite
  in `render.yaml` ahead of the `/*` catch-all: Render serves
  `dist/about/index.html` at `/about/` but not at `/about`, where the
  catch-all wins. Every published post, TIL note and trip needs its own rule too, and
  unpublishing one means removing it: there are no placeholder rules,
  because a rewrite to a file the build did not write serves an empty 200
  rather than the SPA. `prerender-lib.test.mjs` checks the rules match the
  pages exactly. `/shelf/:id`, `/shelf/year/:year` and
  `/shelf/journal/:month`, and the comic issue and edition pages
  (`/shelf/<id>/<n>`, `/shelf/<id>/<slug>`, from the optional
  `comic-issues.json` snapshot, in the sitemap like items, no `/spine`
  mirror) stay on the catch-all, so their prerendered heads
  are served only at the slash form (`/shelf/<id>/`). Every link, canonical,
  `og:url`, sitemap entry and feed link uses that form, built by
  `src/lib/spinePaths.js`; never hand-write a shelf item, year or month path.
  Don't add a slash with a redirect rule: on Render it loops for any path
  without a file (tried on 2026-10-19).
  The tracker moved from `/spine` to `/shelf` (copy pass, 2026-10-22).
  Every `/spine*` and `/collection*` route redirects client-side to its
  `/shelf` page in `App.jsx` (`/spine` and `/collection` land on
  `/shelf/games`, and `/shelf` itself is a client redirect there that keeps
  `?q=`; its prerendered head is canonical on Games); `legacyRoutes` in `prerender-lib.mjs` writes
  heads at `/spine`, `/spine/next`, `/spine/how` and `/spine/<id>/`
  (canonical on `/shelf`), `render.yaml` keeps the three `/spine` rewrites
  after the `/shelf` ones, and the feed is written to both
  `dist/shelf/feed.xml` and `dist/spine/feed.xml`. Feed GUIDs stay on the
  `/spine` item URL (`LEGACY_PREFIX`): changing them reposts every entry.
  Code names (`spine.js`, `SpineHeader`, `spinePaths.js`) keep `spine`.
- Site search (README → Site search): `STATIC_PAGES` in
  `src/content/pages.js` is the one list of static pages, read by both the
  search dialog and `prerender-lib.mjs`; add a page there, never to a second
  list. `public/search-index.json` is a build output from
  `scripts/build-search-index.mjs`, gitignored like the snapshot, and only
  public data goes in it: it reads the snapshot and published posts, never
  the API.
- The Daily game (code name Shelfle), the daily puzzle at `/daily` (README →
  Daily puzzle), is public as "Daily game"; code names (`ShelfleBoard`, etc.)
  keep Shelfle, as `spine` code names do for /spine. It is
  client-only: `src/lib/daily.js` (pure: pool, Denver day, pick, grade,
  share) over the items snapshot, never the API. The salt reaches it as a
  parameter from `lib/dailyConfig.js`, the one reader of
  `VITE_DAILY_SALT`, so the module stays free of `import.meta`.
  `DAILY_EPOCH` is day 1 and never moves once shipped: moving it renumbers
  every day and changes every past answer. Streak and guesses go through
  `lib/dailyStorage.js` (`daily:v1`), which survives a throwing
  `localStorage`. The match cell (`--accent-ink` on `--status-active`) and
  the close ring (`--warn` on `--surface`) were chosen on measured
  contrast, recorded beside the rules in `index.css`.
- The resume PDF lives at `frontend/public/resume.pdf` and is served unhashed at
  `/resume.pdf`. The filename is load-bearing — it is the URL pasted into job
  applications — so replace the file in place rather than renaming it. Publish
  only the scrubbed export; local working copies are not.
- `POST /api/auth/test-login` (`backend/e2e_login.py`) is mounted only with
  `E2E_TEST_LOGIN=1` on an http://localhost `FRONTEND_URL` (config refuses to
  boot otherwise), is never set on Render, and `smoke.sh` checks it answers
  404. The admin suite runs against its own `joeyhaas_e2e` database, never the
  pytest one. CI covers one page per dynamic shelf route from
  `frontend/e2e/fixtures/` (synthetic; keep in step with `fetch-snapshot.mjs`
  and the issue/edition endpoints).

## Current state / TODO

- [x] Push repo to GitHub (`joeyh92989/joey-haas.dev`)
- [x] Connect Render Blueprint; `VITE_API_URL` set on the static site
- [x] Replace placeholder content; add react-router with per-page routes
- [x] Custom domain — `joey-haas.dev`. Apex uses an A record to Render's load
      balancer (`216.24.57.1`), not an ALIAS: Porkbun's default parking record
      occupies the root and silently wins over one. `www` and `api` are CNAMEs
- [x] Blog — markdown in `frontend/posts/`, compiled at build time
- [x] TIL — short notes in `frontend/notes/` at `/til`, with their own feed
      at `/til/feed.xml`. Spec and plan:
      `docs/planning/2026-11-06-til-notes-design.md`
- [ ] Travel log — built and shipped dark: `/travel`, trip pages, the drawn
      map, lightbox, search and Home's Latest trip, the ingest CLI and
      `docs/travel-onboarding.md`. No trip is published yet (Croatia &
      Greece is a draft with placeholder photos), so `render.yaml` has no
      travel rules and the changelog no entry; both come with the first
      published trip. Spec and plan:
      `docs/planning/2026-11-08-travel-log-design.md`
- [x] Google OAuth admin — **live**. `/admin`, not linked from the nav.
      Verified end to end 2026-08-31: 12/12 smoke checks, CORS restricted to
      `joey-haas.dev`, real sign-in confirmed. See README → Admin authentication
- [x] Media collection tracker — foundation. Neon Postgres 18, `items`
      table, admin-gated CRUD at `/admin/collection`. Migrations are manual
      and the API refuses to boot behind the schema
- Tracker build plan: `docs/media-tracker-requirements.md` covers E2-E6.
      `docs/planning/2026-09-01-media-tracker-barebones-design.md` is the spec
      actually built from, and records where it deviates
- [x] Tracker E2-E5 — enrichment columns, `backend/sources/` adapters, the
      metadata picker, photo backfill, and the public showcase at
      `/collection`. See `backend/sources/README.md`
- [ ] BGG — blocked, not skipped. Its XML API stopped serving anonymous
      requests in late 2025 and now returns 401 for everything; it needs a
      registered app and `BGG_TOKEN`. `sources/bgg.py` reports itself
      unavailable and board games import as manual rows until then
- [x] Tracker E7a — shelf and showcase. `/collection` has hero numbers,
      favourites, stats, chip filters and sort, and an item page at
      `/collection/:id`; `/admin/collection` opens on the same shelf with
      inline rate, favourite, status and publish. No schema change
- [x] Tracker E7b — metadata depth. Migration `0003` (the copy columns), a
      deeper IGDB snapshot with time to beat, bulk refresh, bulk set, and the
      copy on the shelf and item page. Spec and plan:
      `docs/planning/2026-09-23-tracker-e7b-*`
- [x] Tracker E8a — Play Next at `/admin/play-next`: three named picks
      from the owned backlog with reasons, pin as Up next (shown publicly on
      `/collection`, now on What's next), and `schema_check` tolerating a database ahead of the
      code. Spec and plan: `docs/planning/2026-09-23-tracker-e8a-*`
- [x] Tracker E7c — physical catalogue at `/admin/catalogue`: the
      r/NSCollectors registry (Sheets API), `switch2-tracker`, eleven boutique
      stores and IGDB's N64 list in five new tables (migration `0005`),
      resolved to IGDB, collapsed to one format per game, and synced onto
      owned Switch 2 items. Spec and plan: `docs/planning/2026-09-23-tracker-e7c-*`
- [x] Tracker E8c — Radar at `/admin/radar`: upcoming physical releases
      and open pre-orders from the catalogue, plus IGDB's upcoming
      digital-only games, ranked by taste; Want adds the game as a public
      want, shown on What's next (first on `/spine`'s "On the radar" strip).
      Migration `0006`
      (the shared `recommendations` table). Spec and plan:
      `docs/planning/2026-09-27-tracker-e8c-*`
- [x] Tracker E8b — Discover at `/admin/discover`: released physical
      games on the owner's platforms, pre-scored by taste, eight picked with
      reasons by one Gemini call, the template eight when it cannot answer;
      Want, Not interested, Already own, Skip, and a Rate a few panel. No
      migration. E6 is retired in favour of it. Spec and plan:
      `docs/planning/2026-09-27-tracker-e8b-*`
- [x] Tracker Showcase — the site shell, `/collection` polish, the
      build-time snapshot (refreshed by `.github/workflows/nightly.yml`,
      which replaced `snapshot.yml`), and the
      read-only "Recent picks" and "Coming to cartridge" strips, built on
      `/api/public/picks` and `/api/public/radar`, which are retired (#40):
      `/spine/next` and `/api/public/next` carry both. Spec and plan:
      `docs/planning/2026-09-28-tracker-showcase-*`
- [x] Spine — the tracker's public name. `/spine` and `/spine/:id`, with
      client-side redirects from `/collection*` (smoke cannot see them;
      verified in the browser), Spine copy in `content/spine.js`, the
      Projects card's `tagline`/`highlights`/`links`, `usePageTitle` on every
      page, static link-preview meta with `public/og-card.png`, and the
      "How Spine works" post. Spec and plan: `docs/planning/2026-10-02-spine-*`
- [x] Switch 1 catalogue and store list — the Switch 1 registry
      (`refresh-switch1`: about 4,500 titles, about 10,000 editions,
      bulk-matched to IGDB, the unmatched hidden; a run's `rows_seen`
      counts editions), region-free Switch 1 cartridges, and
      `/admin/store-list`. No migration. Spec and plan:
      `docs/planning/2026-10-04-switch1-catalogue-*`
- [x] Spine Next — the nightly job (nightly.yml, JOB_TOKEN, items.JOB_ROUTES), /spine/next (What's next) from /api/public/next, the shelf trimmed to what I own with a band across, the compact masthead on tracker routes, and /admin/store-list on the same server sections. Spec and plan: docs/planning/2026-10-05-spine-next-*
- [x] Review follow-ups (2026-10-18 review), a six-PR stack #53–#58: one
      release-date authority (`physical_sources/release_rules.py`), the SPA
      shell (route focus, error boundary, lazy admin), prerendered heads with
      sitemap and robots, backend hardening, `/now`, `/colophon`, shelf
      search, `/spine/feed.xml`, and Year in review at `/spine/year/:year`.
      Spec and plan: `docs/planning/2026-10-18-review-followups-design.md`.
      Then the carve-outs (#59–#61): sessions re-checked against the
      allowlist and foreign-origin writes refused (`auth.session_admin`,
      `origin_check.py`), `healthCheckPath` in render.yaml, and the play
      journal (migration `0007`)
- [x] Site analytics — first-party, cookie-free: the beacon in
      `RootLayout`, `POST /api/track` and the admin read in
      `analytics_routes.py` (pure core in `analytics.py`), migration `0008`,
      the nightly rollup, and `/admin/analytics`. See README → Analytics.
      `main.py` mounts three unauthenticated routers, the public reads,
      the site-stats read and the beacon; the beacon's own validation is
      its gate. Its daily cap counts
      per IP (an IPv6 /64), not per visitor hash, because the user agent
      half of the hash is the caller's to vary, under a 5,000-a-day ceiling
      for the site. Referrers count only a visit's first view (later views
      send `ref: null`). **Deploy order:** apply `0008` to Neon, then
      merge. Spec and plan: `docs/planning/2026-10-19-site-refresh-design.md`
- [x] Comics — series rows with owned issues as ranges, collected
      editions, the public `/shelf/comics` and the comic series page, Comics
      this week on What's next, and the admin pull list at
      `/admin/pull-list`. Migration `0010`. Spec and plan:
      `docs/planning/2026-11-01-comics-design.md`. Issue pages: a cover
      wall, an issue page and an edition page per series, from
      `comic_issues` (migration `0016`;
      `docs/planning/2026-11-11-comic-issue-pages-design.md`)
- [x] Play states — the `paused` status, replays as playthroughs
      (migration `0011`, `playthroughs`), the status route, the paused mark
      and replay count on the shelf, and the playthrough table on the item
      and edit pages. Spec and plan:
      `docs/planning/2026-11-03-play-states-design.md`
- [x] Public stats — `/stats`: the analytics figures from
      `GET /api/public/site-stats` (`analytics_routes.py`; `summarise`'s
      `fold_referrers_below` folds hosts under five visitors into
      `referrers_other`, the public models drop the best day's referrer,
      lists stay capped at ten), painted from the optional `site-stats`
      snapshot, with the README's counting paragraph quoted verbatim and
      the changelog from `frontend/changelog.md`. One `SummaryCache` in
      `main.py` serves the admin and public reads (an hour's TTL for the
      public key), so the rollup clears both. Spec and plan:
      `docs/planning/2026-11-06-public-stats-design.md`
- [x] Tonight continue — the Continue card leading Tonight on `/shelf/next`
      and `/admin/play-next` while a game is `active` (`continuing.py`:
      one builder for `tonight.continuing` and `GET /api/picker/continuing`,
      journal hours and sessions inside the open run, `last_played_on`,
      `STALE_DAYS = 21` shipped as `stale`), the picks as a compact list,
      Log tonight, and the Wrap up sheet from the card, the Now playing
      band and the card menu. Migration `0012`. Spec and plan:
      `docs/planning/2026-11-08-tonight-continue-design.md`
- [x] Shelfle — the daily puzzle at `/daily`: six guesses graded on
      platform, year, genre and size, one answer per Denver day from the
      public snapshot, streak in `localStorage`, a spoiler-free share grid,
      the Daily tab, stop 9 on How it works. `VITE_DAILY_SALT` must be set
      on the Render static site before merging. Spec and plan:
      `docs/planning/2026-11-08-daily-puzzle-design.md`
- [x] `ADMIN_GOOGLE_SUB` set on the Render API service, pinning the
      allowlist to Google's immutable subject ID as well as the email. A wrong
      value rejects every sign-in; clear it in Render to fall back to email-only
- [x] Denver spots — the public `/denver` drawn map (OSM extract,
      committed), `/admin/spots` (anchors, the Overpass and Gemini finder,
      triage), `/admin/weekend` (NWS forecast, three slots), the nightly
      forecast refresh and the Sunday spot finder, and their Dashboard
      rows. Migration `0013`. Spec and plan:
      `docs/planning/2026-11-08-denver-spots-design.md`
- [x] Outfit planner — the Closet area (admin only): intake and the tag
      queue (#115), Today at `/admin/closet/today` with the nightly plan
      (PR C), and Review at `/admin/closet/review` with the Sunday opinion
      (PR D). Migration `0014` (PR B); Review needs none. Spec and plan:
      `docs/planning/2026-11-09-outfit-design.md`
- Shelf sweep queue (`docs/planning/2026-11-12-shelf-sweep-queue.md`,
  findings in `2026-11-12-shelf-design-sweep.md`), in pickup order:
  - [x] 1. Comic issue sync: find out why it is empty, run it, and show a
        failed sync on `/admin/jobs`
  - [x] 2. Design rules file (`docs/design-system.md`) and feature status
        list
  - [x] 3. Split the shelf by type: Games at `/shelf/games`, Comics, and
        their admin twins
  - [x] 4. Delete, bulk delete, redo, and discard an empty sitting
  - [ ] 5. Comics: the book is what you own (5a intake reads the issue
        number, 5b ownership on the issue row, 5c one place to edit and a
        comic edit page)
  - [ ] 6. Data clean-up of the 11–12 Nov rows and comic backfill (Joey's)
  - [ ] 7. Tags: a curated set per type

## Ship

- Checks: the PR's `backend` and `frontend` GitHub Actions jobs
- Merge: squash
- Migration: rehearse `cd backend && ./.venv/bin/pytest tests/test_migrations.py`
  (upgrade, downgrade, upgrade on Postgres; additive migrations only) ·
  apply from the PR's worktree, **before** merging:
  `cd backend && <main checkout>/backend/.venv/bin/python scripts/migrate_neon.py current`
  then `… upgrade`
- Deploy: merge to `main` → Render auto-deploys both services · live when
  `curl -s https://api.joey-haas.dev/api/public/status` answers and the new
  routes answer (not 404) and `https://joey-haas.dev/` serves the new build
- Smoke: `./scripts/smoke.sh https://joey-haas.dev https://api.joey-haas.dev`
- Logs: Render dashboard → the API service's Logs (no CLI configured)
- Rollback: revert the merge commit with a PR (Render redeploys); migrations
  stay (additive, safe ahead of the code). A schema rollback is a manual
  `alembic downgrade` after a Neon restore point (`backend/migrations/README.md`)

## Closet

- **Review's flags are data; the model only comments.** The cull is
  `closet.flags_for` / `closet.deck` (pure): unworn, condition, rare,
  duplicate, and out of season only while a season turn is open, each
  with the sentence the card shows. `closet_opinion.py` (pure, in
  `test_physical_imports.py`'s purity list) is a second pass over the deck:
  the model answers with card numbers, so an opinion attaches only to a
  piece already flagged and never adds one. It is shown last, labelled
  "Opinion:". A failed Sunday run keeps last week's `opinion.batch` and
  writes the reason to `opinion.last_run` (the Jobs page's Closet opinions
  row reads it through `GET /api/closet/status`).
- **Review writes go through `closet_review_routes.py`**: one
  `garment_decisions` row per outcome, and one level of undo under
  `closet_settings["review.undo"]` that puts back exactly what the last
  write changed. A stale token gets a 409 whose `detail` the page shows
  itself, because `errorMessage` words every 409 as the catalogue lock.
  Dismissing the season-turn banner closes the turn on the server, and with
  it the out-of-season flags; One by one and Skip are client-only.
- **The Closet badge is the review count** (`tiles.flagged`), loaded by
  `AdminLayout` on sign-in and again on the way into `/admin/closet*`
  (a nightly opinion or a season turn changes it), and kept current by the
  Review page through `setClosetReview`; Home's Closet card shows To review
  and Untagged.

## Media tracker

- **Migrations must be applied to Neon before deploying**, from the PR's
  worktree with `backend/scripts/migrate_neon.py current` then `upgrade`
  (worktrees have no `.env`; the script reads the main checkout's). `schema_check`
  refuses to boot behind the schema, which is it working, not failing. A
  database *ahead* of the code boots with a warning, because the deploy order
  is migrate-then-merge; that is only safe because **migrations are
  additive**: add tables and columns, never rename or drop in the same release
  (see `backend/migrations/README.md`). `0004` adds `pick_events`; `0005`
  adds the physical catalogue's five tables and four enum types, reusing
  `physical_format` and `format_source` untouched; `0006` adds
  `recommendations` (Radar and Discover); `0007` adds `play_sessions`
  (the play journal); `0008` adds `page_views` and `daily_stats`
  (analytics); `0009` adds the nullable `pick_events.slot` (Tonight);
  `0010` adds the comic columns on `items` (`issues_owned`,
  `issues_skipped`, `editions`, `read_to`, `shelf_format`, `following`);
  `0011` adds `paused` to `item_status` and the `playthroughs` table,
  backfilled one finished run per completion; `0012` adds the nullable
  `playthroughs.note` (the Wrap up sheet's line); `0013` adds Denver
  spots' `spots`, `candidates`, `dismissals`, `visits`, `weather_hours`
  and `spot_settings`; `0016` adds `comic_issues` and
  `items.issues_synced_on` (additive).
  Revision `0002` adds the enrichment columns; `0003` adds the copy columns
  (platform, physical format, cart ID, region, completeness, release,
  acquired and pinned dates).
- **E7b deploy order:** apply `0003` to Neon, merge, press "Refresh game
  metadata" once on `/admin/shelf/games`, then bulk-set platform and format
  from the List view. The refresh fills release dates and any platform the
  snapshot makes unambiguous; it never touches what the owner recorded.
- **Copy fields are decided in one place: `backend/formats.py`.** Every
  write path (PATCH, create, bulk create, bulk set) passes through
  `apply_copy_fields`. `platform` and `format_source` are derived there and
  never accepted from a request; a cart ID decides the format and refuses a
  contradicting one rather than overriding it. The frontend's platform list
  in `ItemForm.jsx` mirrors `PLATFORM_NAMES` in `sources/igdb.py`, which is
  the authority.
- **The physical catalogue** lives in `backend/physical_sources/` (read its
  README first) with routes in `physical_routes.py`, all admin-only. Its
  parsers are pure and a test holds them to it: no FastAPI or SQLAlchemy in
  their import graph, which is why `formats.py` imports its shared constants
  from `physical_sources/limits.py`. **Fixtures first**: nothing reads a store
  or the sheet until its real response is recorded by
  `backend/scripts/record_physical_fixtures.py` and a test runs on it;
  re-record when a store's handles change, never edit a fixture. `STORES` in
  `stores.py` is data: eleven stores (Atari is behind a bot challenge and
  out; GameFairy was dropped on 2026-11-10 for persistent 503s, and a
  refresh archives a dropped store's listings). robots.txt is honoured per RFC 9309, not `urllib.robotparser`, whose
  first-match rule lets Shopify's leading `Allow: /` allow everything.
- **The collapse rule** (`collapse.py`): any full cartridge in the home region
  makes a game a cartridge, because the registry row and a boutique listing
  usually describe different editions; otherwise the most useful known
  format; tiers only break ties between rows saying the same thing, and the
  sheet always beats `switch2-tracker` for its region. A cartridge elsewhere
  is a note, never a relabel. **Switch 1 is the exception:** it is region-free
  (`REGION_FREE_PLATFORMS` in `limits.py`; no Game-Key Card, no region lock),
  so a full cartridge in any region makes the game a cartridge. Switch 2
  keeps the home-region rule.
- **The registry writes formats in exactly one way:**
  `formats.apply_registry_format`, which raises for a format the owner
  recorded (`manual`, `cart_id`, `photo`). The sync after each registry
  refresh writes only unprotected owned Switch 2 copies; the rest are
  disagreements, shown on `/admin/catalogue` and the edit page, where "Use
  registry value" PATCHes `edition_id`. The registry's cart ID is never
  copied: `items.cart_id` means "printed on my copy".
- **The Switch 1 registry** is the r/NSCollectors "Switch Physical
  Releases" sheet (a different spreadsheet from the Switch 2 one), read by
  `physical_sources/registry_switch1.py` into `nscollectors_ns1` editions on
  platform 130, all regions, and bulk-matched by `switch1_ingest.py` against
  IGDB's Switch list paged by name (`switch1_titles.py`, pure). One exact
  match is AUTO/EXACT; anything else is IGNORED with `match_confidence`
  UNCERTAIN, the automatic-ignore marker (`resolve.ignore` writes a human's
  with NULL; only the matcher and `release_listed_ignores` revisit
  automatic ones), unless a live Switch 1 store listing carries the key,
  which is left to Resolve, also after later store refreshes. Automatic
  ignores never enter Needs match: `/admin/catalogue` shows "N Switch 1
  titles unmatched" (`totals.switch1_unmatched`) and lists none. IGDB is
  still never a physical source for Switch 1 (`refresh-platform` refuses
  130). The sheet's dates are never registry dates
  (`collapse.REGISTRY_SOURCES` leaves it out), so none of them is public: a
  Radar row known only from the sheet is listed on `/api/public/next`
  undated, under Later. Keep it out. Its keys are not in
  `test_physical_keys.py`'s corpus. No migration: after deploy, press
  Refresh Switch 1 once on `/admin/catalogue`; expect `rows_seen` near
  10,000 (editions, not titles), and check the run's errors, since IGDB
  pages beyond the first are first walked there.
- **The store list** (`/admin/store-list`) reads
  `GET /api/recommendations/store-list`: What's next's sections from
  `next_list.sections` in admin mode, over pending rows only, so an answer
  leaves it at once. Got it is Already own
  (`POST /api/recommendations/{id}/own`). **The public What's next is
  frozen to the batch** (Spine Next spec, S9): `load_next(public=True)`
  adds the answered rows of the latest generation (Discover per kind,
  Radar per platform) while it still has a pending row, so an answer
  changes `/api/public/next` only at the next generation. The private-title
  scan is lifted only for an owned frozen row the page renders, selected by
  identity (never by a title alone) and only while the item still carries
  that rendered row's title (`next_load.taste_sparing_owned`).
- **E7c deploy order:** set `GOOGLE_SHEETS_API_KEY` on Render; apply `0005`
  to Neon; merge; **before the first Refresh registry, bulk-set every owned
  Switch 2 copy's format on `/admin/shelf/games`** (the collection is all full
  cartridges, and the registry lists many third-party retail boxes as
  Game-Key Cards, so a blank format would be filled wrongly; a recorded one
  is `manual` and never touched); then on `/admin/catalogue` press Refresh
  registry, Refresh stores, Resolve until nothing remains, work through
  Needs match, and Refresh N64 when wanted. Nothing from the catalogue is
  public except What's next's rows on `/api/public/next` (see Radar);
  `test_public.py` and `test_public_outputs.py` pin that.
- IGDB fixtures for the snapshot are recorded from the live API with
  `backend/scripts/record_igdb_fixtures.py` (see `backend/scripts/README.md`);
  re-record when `FIELDS` changes.
- Metadata sources live in `backend/sources/`, one module per API behind a
  common interface — read that package's README before adding one. Their
  credentials are optional config checked lazily, so a missing key disables
  one media type rather than stopping the service; `main.py` logs which
  sources are configured at startup.
- `/shelf*` and `/stats` are public and **do** call the API, unlike every
  other public page; `/shelf/next` reads `/api/public/next`. `/api/public/picks` and
  `/api/public/radar` are retired (404, pinned by `smoke.sh`). `/shelf*`
  pages paint the build-time snapshot first
  (`frontend/public/snapshot/*.json`, written by
  `frontend/scripts/fetch-snapshot.mjs` on Render and refreshed nightly at
  00:17 UTC by `.github/workflows/nightly.yml` through a deploy hook, after
  its refreshes), then swap in live data; "Waking the server" shows only
  when there is no snapshot. The snapshot is gitignored and never committed.
  See README → Collection snapshot.
- **Items are private when created.** `is_public` defaults to false, including
  for photo imports, so nothing reaches `/shelf` until it is published
  from the admin collection page — per row, or with the bulk publish control.
  This was missing at first: the public API, page and filter all shipped
  without a way to set the flag, so the showcase was unreachable.
- **Playthroughs** (migration `0011`, `note` from `0012`) are one row per
  run of a game, written only by `backend/playthroughs.py`. Every status
  change goes through `POST /api/items/{id}/status` (`apply_status`;
  create, bulk create, the pin route and the comics Got it call it too),
  and every hand edit through the edit page's playthrough table. The
  route's `today` is the owner's local day (tolerance and the misclick
  rule); the optional `on` backdates a Finished, Paused or Abandoned move
  (never after today, never before the run's start) and `note` (≤ 500) is
  the one line written on the run it touches, both refused on other
  moves. On the shelf those three moves open the Wrap up sheet
  (`WrapUpSheet`, `statusMoves.isWrapUp`) instead of writing at once. Each write ends in `sync`,
  which recomputes the cached item columns in the same transaction:
  `started_at` the earliest start, `finished_at` the last finish,
  `times_completed` the finished runs. Readers keep using those columns, so
  PATCH refuses status and the three columns (422). Paused keeps the run
  open with `paused_on`; Replay and Try again open a new run. A **misclick**
  (a run opened today, never paused, no journal day, closed back to its
  previous outcome) is deleted, not recorded. Publicly an item carries
  `paused_on` and `finishes` (dated finishes, ascending); the item page's
  `started_at` is run 1's start, not the column (with run 1 undated the
  column would be a replay's), and `playing_since` is the open run's start
  on an active or paused game only, which before playthroughs was what
  `started_at` said. The admin row names its moves through
  `lib/statusMoves.js`. Status moves and the pin route take the owner's
  local `today`. The backfill counts a finish date as a finish whatever
  `times_completed` says, and gives a backlog or abandoned game with a date
  one abandoned run. **Deploy order:** apply `0011` to Neon, then merge, and
  change no status between the two: the old code's status writes skip
  `playthroughs`. A code rollback needs the schema at `0010` first, since
  the old code does not know the `paused` status. `migrate_neon.py` has no
  downgrade command: run `alembic downgrade 0010` by hand from `backend/`
  with `DATABASE_URL_DIRECT` set from the main checkout's `.env`. It drops
  `playthroughs` (the replay history goes with it) and moves paused games
  back to active, so take a Neon restore point first (see
  `backend/migrations/README.md` → Restore).
- **Favourites are capped at four**, the size of the favourites row. The
  API refuses a fifth with a 409 on PATCH, create and bulk create
  (`FAVORITES_LIMIT` in `items.py`); unfavouriting is never refused. Rows
  favourited before the cap are kept, not trimmed: the admin row lists them
  all with a note until they are, and the public row shows the top four.
- **Radar** (E8c) is `backend/radar.py` (pure: sections, score, reasons,
  caps), `backend/radar_load.py` (the catalogue, items and past answers as
  views) and `backend/recommendations_routes.py` (admin only). It reuses
  Play Next's profile: score = 0.55 affinity + 0.35 similarity + 10 × hype
  (taste-led, the owner's choice) + 15 when a pre-order closes within 30
  days; the tuning points are `TASTE_WEIGHTS`, `URGENCY_BONUS` and
  `URGENCY_DAYS`. Generate **regenerates only** — it
  never walks the stores (that is `/admin/catalogue`) — and shares one
  write lock with the catalogue (`main.py`), so the two never overlap.
  Lane 3 ("Digital so far") reads IGDB `release_dates` per platform, never
  `first_release_date` (the earliest date on any platform), and drops
  cancelled and Switch 2 patch releases; its fixture is recorded with
  `backend/scripts/record_igdb_fixtures.py --upcoming`. A dismissed, wanted or
  owned game is out of Radar and Discover for good; a skipped one returns
  at the next generation, and an answered suggestion takes no second
  answer. Only an **open** pre-order (window not closed, or no window and
  the game not out) counts as one. **Radar and Discover rows reach the
  public only as `PublicNextRow`s on `/api/public/next`** (Spine Next spec,
  B5): title, platform, format, release date and precision, cover, IGDB
  link, reasons, `top_pick`, `new`, and `item_id` on Wanted rows only.
  Never a store, price, stock, pre-order window, score, rank, lane or
  recommendation id. A date shows only when its `release_source` is in
  `next_list.PUBLIC_DATE_SOURCES` (the registry); a store's, IGDB's or the
  Switch 1 sheet's date is withheld and the cartridge goes undated to the
  end of Later (cut first by its cap). Links are igdb.com only
  (`IGDB_URL_PREFIX`). Reasons are rebuilt over public games; Discover's
  model sentence passes only `next_list.public_reasons_for`'s gates (cited,
  all-public, no private title, not second or third person), and the
  stored store lines never do. The rows
  are frozen to the batch (S9, see the store list).
  `tests/test_public_outputs.py` pins the fields (`NEXT_ROW_FIELDS`) and
  walks the body for `FORBIDDEN` keys. Want creates an ordinary item (no
  owned copy, backlog, public), shown in What's next's Wanted list; Already
  own creates a private one with a physical copy. Both record a format only
  when the registry decided it.
- **Discover** (E8b) is `backend/discover.py` (pure: released filter,
  pre-score, seeded shuffle, prompt, schema, validation, fallback) behind
  the same router, loader and lock as Radar; `kind` tells them apart. A
  Radar generate replaces its pending rows on the platforms it covered; a
  Discover generate replaces **all** of Discover's pending picks, so its
  list is always one batch under one ranking note. Pre-score = 0.45 affinity + 0.35 similarity + 0.20 quality
  ± 15 × popularity by mode (safe +, balanced 0, deep −), +10 buyable
  now, −10 unknown format; the tuning points are `DISCOVER_WEIGHTS`,
  `POPULARITY_WEIGHT`, `BUYABLE_BONUS` and `UNKNOWN_FORMAT_PENALTY`. The
  top twenty are shuffled with a seed from the batch id (position bias)
  and sent in **one** `complete_json` call per generate; the model answers
  with **indices** into that list, so it can never introduce a title, and
  `validate` drops bad or repeated indices and foreign `based_on`
  numbers. Any model failure (quota, timeout, unreadable answer, no
  provider) or no valid pick falls back to the deterministic top eight
  with template reasons, and the reason is stored as `model_note`: the
  feature never blocks on Gemini. `_failure_note` words the reason from
  `llm.py`'s own messages ("used up" for Gemini's per-day 429, "rate
  limit" for the rest); change one and the other has to follow — the
  route test builds its errors with `_quota_message` to catch that. Everything dated after today belongs to
  Radar, never Discover; "after today" means the release's whole period
  (a "Q4 2026" game is upcoming until 31 December). For catalogue releases,
  out, upcoming and open pre-order are decided only in
  `physical_sources/release_rules.py` (owner-typed item dates carry no
  precision and compare by day).
- **Play Next** scoring lives in `backend/picker.py`, pure and tested without
  a database; `picker_routes.py` only loads rows and records events. The
  tuning points are `PICKER_WEIGHTS` and `MOOD_BUCKETS`. The buckets hold
  exact IGDB strings taken from the collection's own snapshots (genres and
  themes capitalised, keywords lower-case) — never typed from memory. Shown
  events are written at most once per game per UTC day, with the slot they
  were offered in (`pick_events.slot`, migration `0009`; NULL before it).
  The second pick is "Change of pace", a strong game that contrasts with
  the last finish (size band or genre), and "Short and sweet" only when
  none does; the third is "Overdue classic" until acquired dates span 90
  days, then "Waited longest". Sizes are `SIZE_BANDS` (short up to 6 hours,
  medium up to 15, long beyond) on IGDB's "normally", shared by the Size
  filter and the pill; a finish counts for more while it is recent
  (`RECENCY_BONUS`, halving every `RECENCY_HALF_LIFE` days).
  Pinning is its own route (`POST /api/items/{id}/pin`) because it clears
  the previous pin and records an event in one transaction.
  **The public picks are live** (recommendation engine spec,
  `docs/planning/2026-11-09-recommendation-engine-design.md`):
  `backend/public_picks.py` builds `tonight.picks` (three games),
  `tonight.read_next` (two comics) and `tonight.watch_next` (two movies),
  `LANE_SIZES`, as a pure function of public rows of every type with their
  play records, the "never" events dated before today's UTC midnight, and
  the UTC day. The profile is public rows only, so a reason can name
  nothing private; each type's pool comes from its strategy
  (`strategies.py`, facets from `facets.py`) and is scored on
  `LANE_TERMS` (no waiting, which reads the private `acquired_at`; jitter
  seeded by the day). No shown, skipped or pinned event is read, so using
  Play Next changes nothing public and finishing something does, at the
  next refetch; `generated_at` no longer dates the picks. The pool is
  public, owned, backlog or paused, unpinned and not in hand (a game being
  played leads Tonight as its Continue card); a comic with nothing left
  to read is out. Best fit leads; Change of pace is labelled only when the
  last public finish exists and the contrast reason has something to say
  (that reason leads; a later private finish changes nothing, since
  withholding the label would say one exists); Overdue
  classic is the oldest release at or above the median affinity ("Out
  since 1999" leads). Waited longest and Pick it back up read private data
  and are never public. A card carries `size` {unit, value} and
  `progress` {read, of} (comics). Signed in, Tonight pins with the pin
  route and answers "Not tonight" with `POST /api/picker/events` (Play
  Next's own record); Read and Watch this tonight is a status move to
  Active. `tonight.last_finish` is the "Just finished" chip: the most recent
  *public* finish within `JUST_FINISHED_WINDOW` (60 days), else null --
  never hidden because a later finish is private, which its absence would
  hint at. Both finish queries count a NULL `owned_format` as owned, as
  picker does. Hours go out unrounded, so the page's size band is
  picker's. Reasons are first person everywhere ("which I rated 9").
- **Pick for me** (`/shelf/next#pick-for-me`, README → `GET
  /api/public/pick-for-me`) is `picker.public_pick_table` (pure, no model)
  served by `public_pick_for_me.py` through a second `PublicNextCache` on
  `/next`'s fingerprint, so anything new it reads must join that
  fingerprint too. All 88 size and mood combinations are precomputed; the
  band only looks one up. It publishes `score` and `terms` and nothing else
  `/next` forbids. `frontend/src/lib/pick-for-me-keys.json` is the key
  contract both test suites read: regenerate it when `combo_keys` changes.
- **Comics** are ordinary `items` rows of type `comic`, one per series
  (Comic Vine volume), never one per issue: `items` has no issue rows. Issue
  detail lives in the separate `comic_issues` table (below).
  Migration `0010` adds `issues_owned` and `issues_skipped` (range text,
  "1–54, 60"), `editions` (JSONB, `[{kind, label, from, to}]`), `read_to`,
  `shelf_format` (`comic_shelf_format`) and `following`.
  **`backend/comics.py` is the one range parser** (spec, D7): every write
  path canonicalises through it and answers a bad range with a 422 the
  form shows beside its field; `lib/comics.js` only expands the canonical
  text and checks an edition row's shape. The pull list's short
  Comic Vine snapshot (10 issues) per followed series lives in
  `source_metadata.issues` (`sources/comicvine.py` `fetch_issues`, one call
  per series; an answer naming another volume is refused whole); every
  issue of every series lives in `comic_issues`, not there. The pull list (`comics_routes.py`, admin only) groups
  issues into weeks of Wednesday to Tuesday in UTC days (D4); Got it adds
  the number to `issues_owned`, Skip to `issues_skipped`, and Skip refuses
  an owned issue; every item write path refuses it too
  (`comics.check_skips`, a 422 from `apply_comic_fields`, which reads the
  stored row for whichever field a request leaves out). **Only public
  series are shown publicly** (D5): a series reaches
  `/api/public/comics`, Out this week and `comics_this_week` on
  `/api/public/next` only when its row is public
  (owned and published, or a Want). Following alone is private, and so is
  every skip: `public_comics.py` never emits `issues_skipped`, a price or a
  store. **A run is drawn one way everywhere** (comic series display
  spec, `docs/planning/2026-11-11-comic-series-display-design.md`): the
  pure `lib/comicRun.js` derives per-issue state (held = a single or in an
  edition, counted once; read; missing; skipped in admin only) from the
  ranges, `editions` and `read_to`, and three views draw it: `RunLanes`
  (Run and Read on one axis, a fixed-width hatched tail while ongoing; the
  card and Runs row draw them from `segments`), `RunBox` (a book per
  edition, a cell per issue, a bundle for 12 or more same-state issues
  outside an edition, opening on a tap; no issue cap) and the admin's
  `ComicRunEditor` (tap modes Owned, Read to here, Skip over the box). The
  card's "read next" is the public `read_next`. Missing is hollow (a
  `--run-missing` outline) and the tail `--hatch`, chosen on measured
  contrast (3.30 dark, 3.25 light on `--surface`, 3.50 and 3.17 on `--bg`;
  `--line-strong` measured 1.73 and 1.66 and was refused): changing either
  means measuring again. The public `owned_text` already merges editions,
  so only the admin can tell an issue held twice. Intake draws the same
  cells for a series it adds to: every entry the intake routes answer
  with carries `on_shelf` (the matched series' run now, or null), Check
  lists those under "Already on the shelf · adds issues"
  (`SeriesGrewRow`, `comicRun.seriesGrowth` and `nearCells`), and Done's
  "Series that grew" reads the commit's `series_grew`. **A comic sitting
  (`kind = 'comic'`) reads books, not titles** (comics item 5a,
  `docs/planning/2026-11-13-comics-book-design.md`): `intake/reader.py`
  sends `importer.COMIC_EXTRACTION_PROMPT` and `COMIC_DETECTION_SCHEMA`
  (still one request per photo) and makes one entry per book, never merged
  by series, with `issue_number` (whole numbers 1 to 9999 only; "#4", "No. 4"
  and "4 of 4" read as 4, and #0, ½ and annuals as none: `importer.
  normalise_issue_number`), `number_source` (`read` when the model says it
  saw the number, `typed` once an edit changes it, else `none`), `format`
  (`single`, `collected`, `unknown`) and, for a collected book, its
  `collects_from`/`collects_to` and `edition_kind` (default `trade`). A
  mixed sitting keeps the shelf prompt. A series whose best match is not
  exact and whose title ends ": <story>" is searched again without it
  (`reader._without_story`). The mark under a number is `number_check` on
  the entry (`intake/comic_books.py`, pure): in the run, not in the run,
  read, typed or none, from the match's Comic Vine `issue_count` or the
  highest issue the series on the shelf has (`on_shelf.issue_max`); never
  the model's opinion. `PATCH /api/intake/entries/{id}` validates a comic
  entry's number, format, edition kind and range (422) and a changed number
  becomes `typed`. The commit turns a book into the existing path:
  `issue_number` becomes `issues_owned` (unioned per series, `got_issues`
  for a series on the shelf), a collected book a shelf format and an
  `editions` row when its range is known, and the answer's `series_new`
  lists a created series' issues for Done. The comic `issues_owned` field
  is `in_details: false`, so Details does not ask for it (the add bar still
  does). Check lists the books (`ComicBooks`, `lib/comicBooks.js`, words in
  `content/comicIntake.js`) and holds Next until every kept single book has
  a number. **Deploy order:** apply
  `0010` to Neon, merge, follow series on `/admin/pull-list`, then Refresh
  followed once (or wait for the nightly).
- **The play journal** (migration `0007`, `play_sessions`) is logged on the
  admin item page (`components/PlayJournal.jsx`, `journal_routes.py`): one
  row per day played, optional minutes, a private note. The public diary,
  `GET /api/public/diary?year=`, carries only public games and never the
  note (`PublicDiaryEntry`, pinned in `test_public.py`); Year in review
  reads it live (no snapshot) and reads complete without it. **Deploy
  order:** apply `0007` to Neon, then merge.
- The Games page reads `GET /api/public/stats?type=game` (the `stats`
  snapshot is that same games-only read, `LIVE_PATHS` in
  `lib/useSnapshotThenLive.js`); `test_public_outputs.py` pins the type filter
  (same fields, no comic in `?type=game`, no private row either way).
- Editing lives at `/admin/collection/:id`. A wrong external match is fixed
  there by re-linking through the metadata picker, which re-fetches cover,
  creator and the snapshot server-side. Deleting and re-adding is not
  necessary. **Delete and Redo** are on a card's panel (Games and Comics,
  `CardActionsShell`), on each List row, and on the edit page (Delete);
  the List view's selection bar has Delete N. Every one is a `ShelfConfirm`
  that reads `POST /api/items/delete-preview` when it arms and names the
  row and its playthroughs, journal days and issue records before it will
  go ahead (nothing deletes unconfirmed, and nothing uses a browser
  dialog). `POST /api/items/bulk-delete` is all or nothing (an unknown id
  is a 404 and deletes nothing); both are POST paths because `DELETE
  /{item_id}` would shadow a `/bulk`. `POST /api/items/{id}/redo` deletes
  the row and leaves one intake entry (state `check`, the item's match as
  `chosen`) in the newest shelf sitting of that kind (never a mixed one), or a new one, opened on Check, with the old match listed as a candidate; the
  page then opens that sitting. None of the three is in `JOB_ROUTES`. A
  lone unfinished sitting's line on the shelf has Discard.
- The photo importer sends images to the model and keeps nothing after the
  request (Starlette spools an upload over 1 MB to a temp file until the
  request ends). Each photo is capped at `MAX_PHOTO_BYTES` before it is read.
  Confidence is computed from string distance, never self-reported by the
  model — see `backend/matching.py`.
- **The importer sends one photo per request.** Three in one request took
  seven to eight minutes with no feedback. Nothing was timing out — Render
  allows 100 minutes, and IGDB resolution measured ~25s of it — so this is
  about progress and failure isolation, not a limit. It also keeps each
  payload under Gemini's 20MB inline ceiling.
- Source attribution is required by IGDB's, TMDB's and Comic Vine's terms,
  not decoration: Games credits IGDB and Comics credits Comic Vine, on the page
  that shows their data. The TMDB line (verbatim) comes back with a Film & TV
  page; there is no film on the shelf today, so no page carries it.
- **Comic issue pages** (migration `0016`, additive: the
  `comic_issues` table, keyed `(item_id, number)`, `ON DELETE CASCADE`, and
  `items.issues_synced_on`). `comic_issues.sync_series` pages a linked
  series' every issue from Comic Vine (`sort=id:asc`, one request per 100
  issues, descriptions included) and sets `issues_synced_on` only when the
  last page was reached; a partial run leaves the series stalest and the
  next one restarts at offset 0 (upserts make that idempotent).
  `POST /api/comics/issues/sync?budget=` is in `JOB_ROUTES`: stalest series
  first, budget 1 to 190 requests (default 120). The same sync runs on
  Follow and Want create and on "Refresh from Comic Vine" (budget 1: one page of up to 100 issues, the
  nightly finishes longer runs). Each run of the
  sync is a `catalogue_runs` row (source `comic_issues`), read by `GET
  /api/comics/status` (admin only, not in `JOB_ROUTES`) for the Jobs page's
  Comic issues row. An
  edition links to its Comic Vine issue by `cv_id` (`GET
  /api/comics/issues/search`, `PUT /api/comics/{id}/editions/{slug}/link`);
  an edit that changes the edition's range changes its slug and unlinks it.
  Public reads: `GET /api/public/items/{id}/issues`, `/issues/{n}`,
  `/editions/{slug}`, and `GET /api/public/comic-issues` (the snapshot the
  build prerenders from). Frontend routes `/shelf/<id>/<n>/` and
  `/shelf/<id>/ed-<from>-<to>/`; the cover wall replaces `RunBox` on the
  public series page when issue rows exist (no toggle there; `RunBox` is
  unchanged otherwise); the owner's range edits are shared in
  `lib/comicEdits.js`. **Deploy order:** apply `0016` to Neon, merge, then
  run the sync once by hand (`POST /api/comics/issues/sync` with the job
  token) or wait for the nightly.
- **Job token:** `require_admin` accepts `Bearer JOB_TOKEN` only on
  `items.JOB_ROUTES`, matched on the routed template, and
  `tests/test_job_token.py` is the point of it: it pins the whitelist
  exactly, so a new route cannot become reachable by the token unnoticed.
- **Nightly order:** the followed comics' refresh
  (`POST /api/comics/refresh`, in `JOB_ROUTES`; early because it is cheap
  and the catalogue steps can run the job into its timeout), then the
  comic issue sync (`POST /api/comics/issues/sync?budget=120`, also in
  `JOB_ROUTES`, right after the refresh so a followed series' new issues
  land the same night), then the
  weekend forecast, then the Closet's tag queue
  (`POST /api/closet/jobs/tag`), then tomorrow's outfit plans
  (`POST /api/closet/jobs/plan`), then registry,
  then the WooCommerce stores on Render, then the Shopify stores walked on the runner
  (`backend/scripts/walk_stores.py`, posting each to
  `/api/physical/stores/{key}/ingest`: Shopify rate-limits Render's IP), then Switch 1
  (Sunday evenings in Denver), then resolve (up to 5 rounds), then Radar,
  then Discover (Sunday evenings), then the spot finder (Sunday evenings),
  then the Closet's Review opinion (`POST /api/closet/jobs/opinion`, Sunday
  evenings, or any night started by hand with `closet_opinion`), then the
  page-view rollup, then the snapshot compare and the deploy hook.
  The weekend forecast (`POST /api/spots/weather/refresh`) runs right after
  the comics, every night. There is no picks step: the public picks are
  computed live, and `POST /api/picker/next` is out of `JOB_ROUTES`.
- **`next_list.py`** (pure, with `next_load.py` loading the rows) is the one
  sectioning authority for `/api/public/next` and
  `/api/recommendations/store-list`. In public mode only registry dates
  count. Public reasons are rebuilt over public games, and Discover model
  text must pass both the id check (every cited game public) and the title
  scan (no private game named, numeral and edition variants included).
  `/shelf/next` paints `/snapshot/next.json` when present; `fetch-snapshot`
  writes it as an optional snapshot.
- **`/api/public/next` is cached on a data fingerprint**
  (`backend/public_next_cache.py`, one entry per app); admin routes are not,
  and the store list stays live. The fingerprint is the UTC day, a count and
  an `(id, xmin)` digest of every `items`, `recommendations`,
  `playthroughs` and `play_sessions` row (the Continue card reads the open
  run and its journal, which touch neither the item's xmin nor its
  updated_at), the
  catalogue's finished runs, and the windowed shown and skipped pick events
  dated before midnight, for a Play Next commit that spans it. xmin, not `max(updated_at)`: SQL written by hand
  skips the ORM's `onupdate`, and an earlier transaction can commit after a
  later one. Anything new the body reads must join the fingerprint, or the
  page serves it stale. A restored "never" shows at the next UTC midnight.
