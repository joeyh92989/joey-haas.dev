# personal-site

Resume/portfolio website. React (Vite) frontend + FastAPI backend, deployed on Render.

## Structure

```
frontend/   React app (Vite) — routed static site; all public content ships in the bundle
backend/    FastAPI app — /api/health; add authenticated project APIs here
scripts/    smoke.sh — post-deploy verification
render.yaml Render Blueprint — defines both services for auto-deploy
```

## Local development

Two terminals:

```sh
# Terminal 1 — backend (http://localhost:8000)
cd backend
python3 -m venv .venv && source .venv/bin/activate   # first time only
pip install -r requirements.txt                       # first time only
uvicorn main:app --reload

# Terminal 2 — frontend (http://localhost:5173)
cd frontend
npm install                                           # first time only
npm run dev
```

The Vite dev server proxies `/api/*` to the backend, which matters for the
authenticated features planned later. The public pages deliberately make no API
calls: bio and project content are static modules in `frontend/src/content/`,
so the site renders fully even when the free-tier backend is asleep.

## Routes

| Route | Page |
|---|---|
| `/` | Home |
| `/about` | About |
| `/projects` | Projects |
| anything else | NotFound (client-side 404) |

Routing is `react-router` v8 in declarative mode. Note that all router imports
come from `react-router` — the `react-router-dom` package does not exist for
v8. Deep links work in production because `render.yaml` rewrites all paths to
`index.html`.

## Editing site content

Content lives in `frontend/src/content/`:

- `profile.js` — name, tagline, bio, contact links
- `projects.js` — the project list

Edit, commit, push. Render redeploys automatically.

## Writing a blog post

Posts are markdown files in `frontend/posts/`. The filename is the URL slug —
`dependency-injection.md` becomes `/blog/dependency-injection`.

```markdown
---
title: Why FastAPI's dependency injection clicked for me
date: 2026-09-14
tags: [python, fastapi]
draft: false
---

Post body here.
```

`title` and `date` are required; a missing or malformed one **fails the build**
rather than rendering as `undefined`. `tags` and `draft` are optional.

Set `draft: true` to keep a post out of production entirely. Drafts are stripped
during the production build, so the text never reaches the shipped bundle — they
are not merely hidden at render time. They still render locally with
`npm run dev`, marked with a Draft badge.

Code blocks are syntax-highlighted at build time by Shiki, so no highlighting
JavaScript is sent to the browser. `frontend/posts/example.md` is a working
template.

Publishing is `git push` — Render rebuilds and redeploys, regenerating
`/feed.xml` along the way.

## Smoke test

After a deploy:

```sh
./scripts/smoke.sh
```

Defaults to the production URLs; pass `[SITE_URL] [API_URL]` to target
something else. Exits non-zero if any check fails.

## Deploying to Render

Both services are already deployed from `render.yaml` via a Render Blueprint.
Every push to `main` deploys both automatically.

- Frontend: https://personal-site-zas6.onrender.com
- API: https://personal-site-api-spey.onrender.com

Note: the API runs on Render's free tier, which spins down after ~15 min of
inactivity (first request then takes ~30 s). Because no public page calls the
API, visitors never wait on this. Upgrade to Starter ($7/mo) to keep it warm.
