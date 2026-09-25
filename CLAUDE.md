# joey-haas.dev

Personal resume/portfolio website for Joey Haas. React frontend + FastAPI
backend, deployed on Render via Blueprint (render.yaml).

## Architecture

- `frontend/` — Vite + React 19 SPA, routed with react-router v8 (declarative
  mode; import from `react-router`, not `react-router-dom`). Deployed as a free
  Render static site. Public pages make no API calls — bio and project content
  are static modules in `frontend/src/content/`, so the site renders fully while
  the free-tier backend is asleep. Vite still proxies `/api` to localhost:8000
  for the authenticated features planned later.
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
- Frontend build check: `cd frontend && npm run build`
- Frontend tests: `cd frontend && npm test`
- Backend tests: `cd backend && ./.venv/bin/pytest`
- Post-deploy smoke: `./scripts/smoke.sh https://joey-haas.dev https://api.joey-haas.dev`

## Deploying

Push to `main` on GitHub → Render auto-deploys both services. There is no
staging environment; verify `npm run build` passes and the app works locally
before pushing.

## Conventions

- Plain CSS in `frontend/src/index.css`. No CSS framework unless deliberately
  added. Design tokens are CSS variables declared twice: warm-dark values on
  `:root` and warm-light overrides under `[data-theme='light']`. Style with the
  tokens, never with raw hex — a literal color will be wrong in one theme.
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
- Keep the site a real multi-section/multi-page website (react-router when
  pages are added), not a rendered resume document. A downloadable PDF resume
  is an optional accessory only.
- API routes live under `/api/`. CORS is configured for localhost and
  *.onrender.com in `backend/main.py` — update if a custom domain is added.
- Specs and plans live in `docs/planning/`, committed alongside the code they
  describe: `<date>-<topic>-design.md` for the spec, `<date>-<topic>-plan.md`
  for the plan. Mockups and the `.superpowers/` execution scratch stay out of
  git — the first are disposable once the UI exists, the second is process
  telemetry.
- The tracker shelf is one design system for `/collection` and
  `/admin/collection`. Its tokens (`--rating`, `--status-*`, `--overlay`,
  `--skeleton`, `--grid-gap`) live in both theme blocks like every other
  token, and the status colors were chosen on measured contrast: each clears
  3:1 against `--surface` in both themes (they are non-text marks, and the
  stacked bar's 2px gaps are `--surface`), and `--status-backlog` also clears
  3:1 against `--border`. Changing one means measuring again; the ratios are
  in the commit that added them.
- Tracker pages break out of the 45rem prose column via `page-wide` (72rem),
  which `RootLayout` applies to any path in its `WIDE_ROUTES` list or nested
  under one. Add a new tracker route there, not in a page's own CSS.
  `RootLayout` also passes `{ signedIn }` as outlet context, so a routed page
  reads the session instead of calling `/api/auth/me` again.
- Shelf components live in `frontend/src/components/`: `PosterCard`,
  `PosterGrid`, `FilterChips`, `SortControl`, `ShelfToolbar`, `Stars`,
  `QuickRate`, `ShelfCardActions`. `HeroNumbers` and `FavoritesRow` are
  exported from `pages/Collection.jsx` and reused by the admin shelf. A
  card's admin controls are a sibling of its link, never nested inside it.
- Nothing on the shelf is hover-only: anything revealed on hover is also
  revealed by `:focus-within`, with `opacity` or `clip-path` rather than
  `display: none` or `visibility: hidden`, which would make it unfocusable.
  Every non-text mark with an accessible name gets `role="img"`; an
  `aria-label` on a bare `span` is ignored by screen readers.
- Shelf preferences go through `readShelfPref` / `writeShelfPref` in
  `lib/shelf.js`, which survive a throwing `localStorage`. Keys are
  namespaced per page (`shelf.public.*`, `shelf.admin.*`) so the two shelves
  keep separate defaults, and page tests clear storage in `afterEach`.
- Anything viewport-dependent reads `useMediaQuery` from
  `lib/useMediaQuery.js`, never `matchMedia` directly: jsdom has no
  `matchMedia`, so the hook returns false there and tests stub it.
- The resume PDF lives at `frontend/public/resume.pdf` and is served unhashed at
  `/resume.pdf`. The filename is load-bearing — it is the URL pasted into job
  applications — so replace the file in place rather than renaming it. Publish
  only the scrubbed export; local working copies are not.

## Current state / TODO

- [x] Push repo to GitHub (`joeyh92989/joey-haas.dev`)
- [x] Connect Render Blueprint; `VITE_API_URL` set on the static site
- [x] Replace placeholder content; add react-router with per-page routes
- [x] Custom domain — `joey-haas.dev`. Apex uses an A record to Render's load
      balancer (`216.24.57.1`), not an ALIAS: Porkbun's default parking record
      occupies the root and silently wins over one. `www` and `api` are CNAMEs
- [x] Blog — markdown in `frontend/posts/`, compiled at build time
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
      `/collection`), and `schema_check` tolerating a database ahead of the
      code. Spec and plan: `docs/planning/2026-09-23-tracker-e8a-*`
- [x] Tracker E7c — physical catalogue at `/admin/catalogue`: the
      r/NSCollectors registry (Sheets API), `switch2-tracker`, twelve boutique
      stores and IGDB's N64 list in five new tables (migration `0005`),
      resolved to IGDB, collapsed to one format per game, and synced onto
      owned Switch 2 items. Spec and plan: `docs/planning/2026-09-23-tracker-e7c-*`
- [ ] Tracker E8b (Discover), then E8c (Radar). Spec:
      `docs/planning/2026-09-22-tracker-enhancement-design.md`, with the
      E8b/E8c decisions settled at the end of the E7c spec; each gets its own
      plan. E6 (recommendations) is retired in favour of E8b, which uses the
      provider-agnostic seam in `backend/llm.py`
- [ ] Optional: set `ADMIN_GOOGLE_SUB` after the first sign-in to pin the
      allowlist to Google's immutable subject ID rather than the email alone

## Media tracker

- **Migrations must be applied to Neon before deploying.** `schema_check`
  refuses to boot behind the schema, which is it working, not failing. A
  database *ahead* of the code boots with a warning, because the deploy order
  is migrate-then-merge; that is only safe because **migrations are
  additive**: add tables and columns, never rename or drop in the same release
  (see `backend/migrations/README.md`). `0004` adds `pick_events`; `0005`
  adds the physical catalogue's five tables and four enum types, reusing
  `physical_format` and `format_source` untouched.
  Revision `0002` adds the enrichment columns; `0003` adds the copy columns
  (platform, physical format, cart ID, region, completeness, release,
  acquired and pinned dates).
- **E7b deploy order:** apply `0003` to Neon, merge, press "Refresh game
  metadata" once on `/admin/collection`, then bulk-set platform and format
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
  `stores.py` is data: twelve stores (Atari is behind a bot challenge and
  out). robots.txt is honoured per RFC 9309, not `urllib.robotparser`, whose
  first-match rule lets Shopify's leading `Allow: /` allow everything.
- **The collapse rule** (`collapse.py`): any full cartridge in the home region
  makes a game a cartridge, because the registry row and a boutique listing
  usually describe different editions; otherwise the most useful known
  format; tiers only break ties between rows saying the same thing, and the
  sheet always beats `switch2-tracker` for its region. A cartridge elsewhere
  is a note, never a relabel.
- **The registry writes formats in exactly one way:**
  `formats.apply_registry_format`, which raises for a format the owner
  recorded (`manual`, `cart_id`, `photo`). The sync after each registry
  refresh writes only unprotected owned Switch 2 copies; the rest are
  disagreements, shown on `/admin/catalogue` and the edit page, where "Use
  registry value" PATCHes `edition_id`. The registry's cart ID is never
  copied: `items.cart_id` means "printed on my copy".
- **E7c deploy order:** set `GOOGLE_SHEETS_API_KEY` on Render; apply `0005`
  to Neon; merge; then on `/admin/catalogue` press Refresh registry, Refresh
  stores, Resolve until nothing remains, work through Needs match, and
  Refresh N64 when wanted. Nothing from the catalogue is public;
  `test_public.py` pins that.
- IGDB fixtures for the snapshot are recorded from the live API with
  `backend/scripts/record_igdb_fixtures.py` (see `backend/scripts/README.md`);
  re-record when `FIELDS` changes.
- Metadata sources live in `backend/sources/`, one module per API behind a
  common interface — read that package's README before adding one. Their
  credentials are optional config checked lazily, so a missing key disables
  one media type rather than stopping the service; `main.py` logs which
  sources are configured at startup.
- `/collection` is public and **does** call the API, unlike every other public
  page. It handles the free-tier cold start explicitly rather than showing a
  spinner that reads as broken.
- **Items are private when created.** `is_public` defaults to false, including
  for photo imports, so nothing reaches `/collection` until it is published
  from the admin collection page — per row, or with the bulk publish control.
  This was missing at first: the public API, page and filter all shipped
  without a way to set the flag, so the showcase was unreachable.
- Status changes to finished go through `statusTransition`
  (`lib/statusTransition.js`) in both admin views, the shelf card and the
  list table: a first finish sets `times_completed` to 1 and dates it today,
  a replay (any earlier `finished_at` or completion) adds one and keeps the
  date. The edit page exposes both fields directly and does not apply it.
- **Favourites are capped at four**, the size of the favourites row. The
  API refuses a fifth with a 409 on PATCH, create and bulk create
  (`FAVORITES_LIMIT` in `items.py`); unfavouriting is never refused. Rows
  favourited before the cap are kept, not trimmed: the admin row lists them
  all with a note until they are, and the public row shows the top four.
- **Play Next** scoring lives in `backend/picker.py`, pure and tested without
  a database; `picker_routes.py` only loads rows and records events. The
  tuning points are `PICKER_WEIGHTS` and `MOOD_BUCKETS`. The buckets hold
  exact IGDB strings taken from the collection's own snapshots (genres and
  themes capitalised, keywords lower-case) — never typed from memory. Shown
  events are written at most once per game per UTC day; the third pick is
  "Overdue classic" until acquired dates span 90 days, then "Waited longest".
  Pinning is its own route (`POST /api/items/{id}/pin`) because it clears
  the previous pin and records an event in one transaction.
- Editing lives at `/admin/collection/:id`. A wrong external match is fixed
  there by re-linking through the metadata picker, which re-fetches cover,
  creator and the snapshot server-side. Deleting and re-adding is not
  necessary.
- The photo importer sends images to the model and never writes them to disk.
  Confidence is computed from string distance, never self-reported by the
  model — see `backend/matching.py`.
- **The importer sends one photo per request.** Three in one request took
  seven to eight minutes with no feedback. Nothing was timing out — Render
  allows 100 minutes, and IGDB resolution measured ~25s of it — so this is
  about progress and failure isolation, not a limit. It also keeps each
  payload under Gemini's 20MB inline ceiling.
- Source attribution on the collection page is required by TMDB's and Comic
  Vine's terms, not decoration. A test pins the TMDB wording verbatim.
