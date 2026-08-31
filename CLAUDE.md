# personal-site

Personal resume/portfolio website for Joey Haas. React frontend + FastAPI
backend, deployed on Render via Blueprint (render.yaml).

## Architecture

- `frontend/` — Vite + React 19 SPA, routed with react-router v8 (declarative
  mode; import from `react-router`, not `react-router-dom`). Deployed as a free
  Render static site. Public pages make no API calls — bio and project content
  are static modules in `frontend/src/content/`, so the site renders fully while
  the free-tier backend is asleep. Vite still proxies `/api` to localhost:8000
  for the authenticated features planned later.
- `backend/` — FastAPI app (`main.py`). Deployed as a Render web service
  (free tier: spins down after ~15 min idle). New personal projects should
  be added as APIRouter modules (one file per project) and included in main.py.
- `render.yaml` — Render Blueprint defining both services. Changing it and
  pushing updates the infrastructure.

## Commands

- Frontend dev: `cd frontend && npm run dev` (http://localhost:5173)
- Backend dev: `cd backend && source .venv/bin/activate && uvicorn main:app --reload` (http://localhost:8000)
- Frontend build check: `cd frontend && npm run build`

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

- [x] Push repo to GitHub (`joeyh92989/personal-site`)
- [x] Connect Render Blueprint; `VITE_API_URL` set on the static site
- [x] Replace placeholder content; add react-router with per-page routes
- [ ] Custom domain — prerequisite for admin auth, since `onrender.com` is on
      the Public Suffix List and blocks cross-subdomain session cookies
- [ ] Blog — markdown files in the repo
- [ ] Google OAuth admin (needs custom domain first)
- [ ] Media collection tracker + Neon Postgres (needs auth first)
