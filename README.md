# joey-haas.dev

Resume/portfolio website and the home of a media collection tracker. React
(Vite) frontend + FastAPI backend + Postgres, deployed on Render and Neon.

## Structure

```
frontend/   React app (Vite) — routed static site; bio, projects and blog ship in the bundle
backend/    FastAPI app — Google sign-in, the media tracker's API, Alembic migrations
docs/       Specs and plans, one design + plan pair per feature, under docs/planning/
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

The Vite dev server proxies `/api/*` to the backend. Bio and project content
are static modules in `frontend/src/content/`, so the site renders fully even
when the free-tier backend is asleep. Only `/spine` and `/spine/:id`
call the tracker's public API, and they paint the build-time snapshot first
(see [Collection snapshot](#collection-snapshot)); the "waking the server"
state shows only when there is no snapshot. Home and Projects read the static
snapshot files and never call the API.

## Routes

| Route | Page | Notes |
|---|---|---|
| `/` | Home | |
| `/about` | About | |
| `/projects` | Projects | |
| `/blog` | Blog index | Posts compiled from `frontend/posts/` at build time |
| `/blog/:slug` | Blog post | Slug is the markdown filename |
| `/spine` | Spine | Public shelf: hero numbers, favourites, "Recent picks" from Play Next, "Coming to cartridge" from Radar, stats, filters and sort; calls the public API after painting the build-time snapshot |
| `/spine/:id` | Item | One game: cover, copy details, description, rating, time to beat, and similar items from the shelf |
| `/collection` | Redirect | Redirects to `/spine`; `/collection/:id` redirects to `/spine/:id`, both client-side |
| `/admin` | Admin | Google sign-in gate, reached from the footer's Sign in link |
| `/admin/collection` | Collection (admin) | The same shelf with inline rate, favourite, status and publish, a list view, bulk set, and metadata refresh |
| `/admin/collection/:id` | Edit item | Every field, plus re-linking to a different IGDB/TMDB/Comic Vine match |
| `/admin/import` | Import | Photograph a shelf; a vision model reads the titles and each is resolved against its source |
| `/admin/play-next` | Play Next | Three picks from the owned backlog |
| `/admin/catalogue` | Catalogue | What exists physically: registry, stores, N64 |
| `/admin/radar` | Radar | Upcoming physical releases and open pre-orders, ranked by taste, plus IGDB's upcoming games with no physical edition yet; Want puts a game on `/spine`'s "On the radar" strip |
| `/admin/discover` | Discover | Released physical games you would love and do not own: eight picks with reasons from one Gemini call, or the taste ranking when it cannot answer |
| anything else | NotFound (client-side 404) | |

The `/admin*` routes are absent from the site navigation deliberately. The
footer carries an understated "Sign in" link (which reads "Admin" once a session
exists) — a door for one person, not a call to action. That is not a security
control — the server-side session check is. It keeps a personal site from
looking like an app with a login wall.

Routing is `react-router` v8 in declarative mode. Note that all router imports
come from `react-router` — the `react-router-dom` package does not exist for
v8. Deep links work in production because `render.yaml` rewrites all paths to
`index.html`.

## Editing site content

Content lives in `frontend/src/content/`:

- `profile.js` — name, tagline, bio, contact links, areas of expertise,
  toolbox chips
- `education.js` — degrees, bootcamp, and certifications
- `projects.js` — the project list
- `experience.js` — work history for the About page timeline
- `posts.js` — blog post metadata

The Home page intro is inline JSX in `frontend/src/pages/Home.jsx` rather than
a content module, because it carries markup — the file's own doc comment
explains why.

The resume PDF is not content in this sense — it is a static asset at
`frontend/public/resume.pdf`, which Vite copies unhashed to `dist/` and Render
serves at `/resume.pdf`. Replace the file at that exact path when the resume
changes; renaming it breaks every link already sent out.

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

`/admin` is gated by Google sign-in restricted to one account. The footer's
"Sign in" link starts the Google flow; once signed in, the same link reads
"Admin" and each public item page grows an Edit link.

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

## Media tracker

The tracker is the site's main personal project: a record of a physical game
collection, a public showcase of it, and — behind the sign-in — tools for
deciding what to play and what to buy next. `CLAUDE.md` holds the operating
rules (deploy order, invariants, tuning points); this is the map.

| Area | Where | What it does |
|---|---|---|
| Items | `backend/items.py`, `models.py`, `formats.py` | The `items` table and its admin CRUD. Copy fields (platform, physical format, cart ID, region, completeness) are decided in one place, `formats.py`, on every write path |
| Metadata sources | `backend/sources/` | One adapter per API behind a common interface: IGDB (games), TMDB (films), Comic Vine (comics); BGG is stubbed until its API is usable again. Each keeps a snapshot on the item for the shelf and the pickers |
| Photo import | `backend/importer.py`, `matching.py`, `llm.py` | A shelf photo goes to Gemini (or Claude, by `LLM_PROVIDER`), the titles it reads are matched against a source, and confidence comes from string distance, never the model's say-so |
| Public showcase | `backend/public.py`, `/spine` | Display fields only, for public rows only — never notes, cart IDs, raw source metadata or the catalogue. `test_public.py` pins the field lists |
| Play Next | `backend/picker.py`, `/admin/play-next` | Three picks from the owned backlog, scored against what was rated, loved and finished, with reasons; pinning one puts it on the public shelf as "Up next", and recent picks appear there as "Recent picks" |
| Physical catalogue | `backend/physical_sources/`, `/admin/catalogue` | What exists physically and in which format: the r/NSCollectors registry (via the Sheets API), `switch2-tracker`, twelve boutique stores read from their public JSON endpoints, and IGDB's N64 list; rows are resolved to IGDB and collapsed to one format per game |
| Radar | `backend/radar.py`, `/admin/radar` | Upcoming physical releases and open pre-orders from the catalogue, ranked by taste; Want puts a game on the public shelf's "On the radar" strip, and registry-dated cartridges appear there as "Coming to cartridge" |
| Discover | `backend/discover.py`, `/admin/discover` | Released physical games on the owner's platforms, pre-scored by taste and re-ranked by one Gemini call with reasons; falls back to the deterministic ranking when the model cannot answer |

Migrations `0001`–`0006` build this up: items, enrichment columns, copy
columns, `pick_events`, the catalogue's five tables, and the shared
`recommendations` table. They are applied by hand and must be additive — see
[Database](#database).

### Tracker environment variables

Every variable here is optional and checked lazily. A missing one disables one
media type or feature rather than stopping the service; `main.py` logs which
sources are configured at startup. Set them on the API service in Render and in
`backend/.env` locally (`backend/env.example` documents each).

| Variable | Enables |
|---|---|
| `IGDB_CLIENT_ID`, `IGDB_CLIENT_SECRET` | Games (Twitch developer app) |
| `TMDB_API_TOKEN` | Films |
| `COMICVINE_API_KEY` | Comics |
| `GEMINI_API_KEY` or `ANTHROPIC_API_KEY`, with `LLM_PROVIDER` | Photo import and Discover's ranking |
| `GOOGLE_SHEETS_API_KEY` | The catalogue's registry refresh (the stores run without it) |
| `BGG_TOKEN` | Reserved for board games; not usable yet |

`render.yaml` declares the IGDB, TMDB, Comic Vine, `LLM_PROVIDER` and
`GEMINI_API_KEY` variables; `GOOGLE_SHEETS_API_KEY` and any other is set
directly on the service in the Render dashboard.

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
inactivity (first request then takes ~30 s). Only `/spine` and
`/spine/:id` call the API. They paint the build-time snapshot first and
show a "waking the server" state only when there is no snapshot; every other
public page never waits on it (see [Collection snapshot](#collection-snapshot)).
Upgrade to Starter ($7/mo) to keep it warm.

## Collection snapshot

`/spine` first paints a snapshot of the public API, then refreshes it
from the live API, so a first-time visitor doesn't wait for the free-tier
backend to wake. Home and Projects read the same file for their cover
strips.

- **Written by** the Render static build: `frontend/scripts/fetch-snapshot.mjs`
  runs first in `npm run build`, and only where `VITE_API_URL` is set. See
  `frontend/scripts/README.md`.
- **Refreshed by** every deploy, plus `.github/workflows/snapshot.yml`. It runs
  daily at 09:23 UTC and on demand from the Actions tab, compares the live API
  bodies with the deployed `/snapshot/*.json`, and triggers a static-site
  deploy only when they differ. It never pushes, and the snapshot is never
  committed.
- **Setup (once):** in Render, go to the static site → Settings → Deploy Hook
  and copy the URL. In GitHub, go to Settings → Secrets and variables →
  Actions and add it as `RENDER_DEPLOY_HOOK_URL`. The URL is a secret: anyone
  who has it can trigger deploys.
- **Gotcha:** GitHub switches off scheduled workflows in a public repository
  after 60 days with no repository activity. If the snapshot stops refreshing
  after a quiet spell, re-enable the workflow from the Actions tab.
- **Unpublishing:** to drop an unpublished item from the snapshot at once, run
  the Snapshot workflow from the Actions tab, or trigger a manual static-site
  deploy.
- **The API is not redeployed** by any of this. Its `rootDir` is `backend`, so
  Render deploys it only for changes under `backend/`.

## Public API

All read-only, unauthenticated, and allowlisted by hand in `backend/public.py`
and `backend/public_outputs.py`; `backend/tests/test_public*.py` pin the list,
detail, picks and radar models' field sets.

| Route | What |
|---|---|
| `GET /api/public/items` | Every public item, most recently finished first |
| `GET /api/public/items/{id}` | One public item with description and similar games; 404 for unknown and private alike |
| `GET /api/public/stats` | Counts over public rows |
| `GET /api/public/picks` | Play Next's most recent picks among public games, with first-person reasons; changes at most once a day |
| `GET /api/public/radar` | Up to six upcoming full-cartridge releases, registry-dated only: title, platform, date, IGDB link, cover |
