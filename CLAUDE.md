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
  env var is missing rather than running insecurely. New personal projects
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
- [ ] Tracker E6 — recommendations. `backend/llm.py` already provides the
      provider-agnostic seam it needs
- [ ] Optional: set `ADMIN_GOOGLE_SUB` after the first sign-in to pin the
      allowlist to Google's immutable subject ID rather than the email alone

## Media tracker

- **Migrations must be applied to Neon before deploying.** `schema_check`
  refuses to boot behind the schema, which is it working, not failing.
  Revision `0002` adds the enrichment columns.
- Metadata sources live in `backend/sources/`, one module per API behind a
  common interface — read that package's README before adding one. Their
  credentials are optional config checked lazily, so a missing key disables
  one media type rather than stopping the service; `main.py` logs which
  sources are configured at startup.
- `/collection` is public and **does** call the API, unlike every other public
  page. It handles the free-tier cold start explicitly rather than showing a
  spinner that reads as broken.
- The photo importer sends images to the model and never writes them to disk.
  Confidence is computed from string distance, never self-reported by the
  model — see `backend/matching.py`.
- Source attribution on the collection page is required by TMDB's and Comic
  Vine's terms, not decoration. A test pins the TMDB wording verbatim.
