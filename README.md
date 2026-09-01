# joey-haas.dev

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
/usr/local/opt/python@3.12/bin/python3.12 -m venv .venv   # first time only
source .venv/bin/activate
pip install -r requirements-dev.txt                       # first time only
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

| Route | Page | Notes |
|---|---|---|
| `/` | Home | |
| `/about` | About | |
| `/projects` | Projects | |
| `/blog` | Blog index | Posts compiled from `frontend/posts/` at build time |
| `/blog/:slug` | Blog post | Slug is the markdown filename |
| `/admin` | Admin | Google sign-in gate; not in the navigation |
| `/admin/collection` | Collection | Media tracker; requires the admin session |
| anything else | NotFound (client-side 404) | |

The `/admin*` routes are absent from the site navigation deliberately. That is
not a security control — the server-side session check is. It keeps a personal
site from looking like an app with a login wall.

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

## Admin authentication

`/admin` is gated by Google sign-in restricted to one account. It is not linked
from the navigation — reach it by typing the URL.

### One-time Google Cloud setup

1. Create a project at https://console.cloud.google.com
2. OAuth consent screen: **External**, in **Testing**, with your Google account
   added as a test user. Testing mode is correct here — it restricts sign-in to
   listed users, which is exactly what a single-user admin gate wants.
   Publishing the app would require verification for no benefit.
3. Credentials → **OAuth client ID** → **Web application**
4. Authorized redirect URIs, both exactly:
   - `https://api.joey-haas.dev/api/auth/callback`
   - `http://localhost:8000/api/auth/callback`

### Environment variables

Set these on the `joey-haas-dev-api` service in the Render dashboard. They are
declared in `render.yaml` with `sync: false`, so values never enter the repo.

| Variable | Notes |
|---|---|
| `GOOGLE_CLIENT_ID` | From the OAuth client |
| `GOOGLE_CLIENT_SECRET` | From the OAuth client — secret |
| `SESSION_SECRET` | See below — secret |
| `ADMIN_EMAIL` | The single allowed Google account |
| `FRONTEND_URL` | `https://joey-haas.dev` |
| `ADMIN_GOOGLE_SUB` | Optional. See hardening below |

Generate the session secret locally:

```sh
python3 -c "import secrets; print(secrets.token_urlsafe(64))"
```

The service **refuses to start** if any required variable is missing or blank.
That is deliberate: a server running with a default session secret would look
healthy while issuing forgeable sessions.

For local development, copy `backend/env.example` to `backend/.env` and fill it
in. `.env` is gitignored.

### Hardening with `ADMIN_GOOGLE_SUB`

Google's `sub` is the immutable identifier for an account; an email address is
not. After your first successful sign-in the server logs `Admin signed in.
sub=...`. Copy that value into `ADMIN_GOOGLE_SUB` and from then on both the
email and the subject must match.

It cannot be required from the start, because the value is unknowable until the
first login.

### Running the tests and checks

```sh
cd backend && ./.venv/bin/pytest
cd backend && ./.venv/bin/ruff format --check . && ./.venv/bin/ruff check .

cd frontend && npm test
cd frontend && npm run format:check && npm run lint
```

To fix formatting rather than just check it:

```sh
cd backend && ./.venv/bin/ruff format . && ./.venv/bin/ruff check --fix .
cd frontend && npm run format
```

The backend venv must be **Python 3.12** to match Render. macOS system Python is
3.9, which cannot install this dependency set at all — current `cryptography`
ships no 3.9 wheels, so pip falls back to a source build requiring Rust.

## Database

Neon Postgres 18, free plan, AWS US West 2 (Oregon) — the same region as the
Render services.

Two connection strings are required, and they are **not** interchangeable:

| Variable | Hostname | Used by |
| --- | --- | --- |
| `DATABASE_URL` | contains `-pooler` | The application |
| `DATABASE_URL_DIRECT` | no `-pooler` | Alembic migrations |

Neon's pooler runs PgBouncer in transaction mode, which does not support the
`SET` statements Alembic relies on. Migrations run through the pooler fail in
ways that read as unrelated bugs.

Paste both strings from the Neon console exactly as given. `db.py` rewrites the
scheme to `postgresql+asyncpg` and strips the libpq-only `sslmode` and
`channel_binding` parameters, which asyncpg does not accept — so no hand-editing
is needed, and re-pasting a fresh string later stays correct.

### Running a migration

Schema changes are applied deliberately, not on deploy:

```sh
cd backend
./.venv/bin/alembic upgrade head --sql   # review the SQL first
./.venv/bin/alembic upgrade head         # apply
./.venv/bin/alembic current              # confirm
```

**The API refuses to start if the database is behind the code.** That is what
makes manual migration safe — a forgotten one fails immediately and legibly
instead of surfacing later as a confusing query error. If the service will not
boot and the log says `SchemaMismatchError`, run the upgrade above.

To create a new migration after changing `models.py`:

```sh
cd backend && ./.venv/bin/alembic revision -m "describe the change"
```

Write the `upgrade` and `downgrade` bodies by hand. If a migration creates a
Postgres enum type, its `downgrade` must drop that type explicitly — Postgres
does not remove it with the table, and the next `upgrade` would fail on "type
already exists", a long way from its cause.

### Tests

Backend tests run against a real Postgres, never SQLite: enums, `timestamptz`,
and the `CHECK` constraint all behave differently otherwise.

CI provides a `postgres:18` service container. For the same thing locally:

```sh
brew install postgresql@18
brew services start postgresql@18
# Homebrew's initdb creates a superuser named after your macOS account, not
# `postgres`. These two make the local instance match CI, so pytest needs no
# configuration.
/usr/local/opt/postgresql@18/bin/createuser -s -h localhost postgres
/usr/local/opt/postgresql@18/bin/psql -h localhost -d postgres \
  -c "alter role postgres password 'postgres'"
```

`conftest.py` defaults to `postgresql://postgres:postgres@localhost:5432/postgres`;
override with `TEST_DATABASE_URL` to point elsewhere.

With no database reachable the collection tests **skip**, so the rest of the
suite still runs. In CI they cannot skip — an unreachable database is a hard
error there, or "green" would come to mean "did not run".

### Checking a migration against the models

A hand-written migration can drift from `models.py`. To prove it has not, apply
the migrations to a scratch database and ask Alembic to diff the result:

```sh
createdb -h localhost -U postgres scratch
DATABASE_URL_DIRECT="postgresql://postgres:postgres@localhost:5432/scratch" \
  ./.venv/bin/alembic upgrade head
```

Then compare with `alembic.autogenerate.compare_metadata` against
`models.Base.metadata`; an empty diff (ignoring `alembic_version`) means the
migration reproduces the models exactly. Round-tripping
`alembic downgrade base` followed by `upgrade head` on that scratch database
also proves the enum drops in `downgrade` are correct.

## Smoke test

After a deploy:

```sh
./scripts/smoke.sh
```

Defaults to the production URLs; pass `[SITE_URL] [API_URL]` to target
something else. Exits non-zero if any check fails.

## Contributing

`main` is protected: it accepts merges from pull requests with passing checks,
and rejects direct pushes.

```sh
git checkout -b my-change
# ... work, commit ...
git push -u origin my-change
gh pr create
```

Every pull request runs two jobs, which must both pass before it can merge:

| Job | Runs |
|---|---|
| `backend` | `pytest`, then `pip-audit` |
| `frontend` | `npm test`, `npm run build`, then `npm audit --audit-level=high` |

Audits fail on high and critical advisories only. Moderate and low are reported
without blocking, so an unpatched transitive advisory cannot hold up unrelated
work.

Note that CI proves the code is correct, not that the deploy succeeded. After
merging, `./scripts/smoke.sh` against production is still a manual step.

## Deploying to Render

Both services are already deployed from `render.yaml` via a Render Blueprint.
Every push to `main` deploys both automatically.

- Frontend: https://personal-site-zas6.onrender.com
- API: https://personal-site-api-spey.onrender.com

These `onrender.com` hostnames still carry the repository's former name. Render
assigns a hostname when a service is created and keeps it across renames, so
they are correct as written — which is also why renaming the services required
no DNS change. Visitors never see them; the custom domains sit in front.

Note: the API runs on Render's free tier, which spins down after ~15 min of
inactivity (first request then takes ~30 s). Because no public page calls the
API, visitors never wait on this. Upgrade to Starter ($7/mo) to keep it warm.
