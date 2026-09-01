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

- Plain CSS in `frontend/src/index.css` (design tokens as CSS variables in
  `:root`). No CSS framework unless deliberately added.
- Keep the site a real multi-section/multi-page website (react-router when
  pages are added), not a rendered resume document. A downloadable PDF resume
  is an optional accessory only.
- API routes live under `/api/`. CORS is configured for localhost and
  *.onrender.com in `backend/main.py` — update if a custom domain is added.

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
- [ ] Tracker E2 — TMDB lookup for films, proving the enrichment pattern
- [ ] Tracker E3+ — IGDB, ComicVine, BoardGameGeek
- [ ] Optional: set `ADMIN_GOOGLE_SUB` after the first sign-in to pin the
      allowlist to Google's immutable subject ID rather than the email alone
