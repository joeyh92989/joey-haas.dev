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
pip install -r requirements-dev.txt -c constraints.txt   # first time only
uvicorn main:app --reload

# Terminal 2 — frontend (http://localhost:5173)
cd frontend
npm install                                           # first time only
npm run dev
```

The Vite dev server proxies `/api/*` to the backend. Bio and project content
are static modules in `frontend/src/content/`, so the site renders fully even
when the free-tier backend is asleep. Only `/shelf`, `/shelf/next` and
`/shelf/:id` call the tracker's public API, and they paint the build-time snapshot first
(see [Collection snapshot](#collection-snapshot)); the "waking the server"
state shows only when there is no snapshot. Home and Projects read the static
snapshot files and never call the API.

## Routes

| Route | Page | Notes |
|---|---|---|
| `/` | Home | |
| `/about` | About | |
| `/projects` | Projects | |
| `/now` | Now | What I am doing now |
| `/colophon` | Colophon | How the site is built |
| `/daily` | Shelfle | The daily puzzle: guess the game on the shelf in six, built in the browser from the build-time snapshot with no API call (see [Daily puzzle](#daily-puzzle)) |
| `/stats` | Stats | The site's own visitor figures from `/api/public/site-stats`, how they are counted, and the changelog from `frontend/changelog.md` |
| `/blog` | Blog index | Posts compiled from `frontend/posts/` at build time |
| `/blog/:slug` | Blog post | Slug is the markdown filename |
| `/til` | TIL | Short notes compiled from `frontend/notes/`, each shown in full; linked from the footer and Blog index only while a note is published. Its feed is `/til/feed.xml` |
| `/til/:slug` | TIL note | One note; slug is the markdown filename |
| `/travel` | Travel | Trips compiled from `frontend/trips/`, newest first; in the nav, and linked from the footer, only while a trip is published |
| `/travel/:slug` | Trip | One trip: facts, the drawn route map, place chips, the days with their photos, and a lightbox. Slug is the markdown filename |
| `/shelf` | My Shelf | Public shelf of what I own: hero numbers, favourites, stats, filters and sort, with a band linking to What's next; calls the public API after painting the build-time snapshot. |
| `/shelf/next` | What's next | Public: the game I'm playing (a Continue card, with Wrap up and Log tonight when signed in), tonight's picks and the pinned Up next game, my list, and what to look for in a store (In stores now, Coming soon, Further out, Not on cartridge) with first-person reasons; reads `/api/public/next` after painting `/snapshot/next.json` when the build wrote one |
| `/shelf/comics` | Comics | Public: every public comic series as a run (owned, missing, not out yet), with chip filters, sort, a Covers view and what is out this week; reads `/api/public/comics` after painting `/snapshot/comics.json` |
| `/shelf/how` | How it works | How the shelf is built |
| `/shelf/year`, `/shelf/year/:year` | Year in review | The current year, or a given one, read live from `/api/public/diary` |
| `/shelf/journal/:month` | Month in review | One month of the play journal |
| `/shelf/:id` | Item | One game: cover, copy details, description, rating, time to beat, and similar items from the shelf. A comic series shows what's next, its run as lanes over a box of books, issues and bundles, and its collected editions instead |
| `/spine*`, `/collection*` | Redirect | The pre-rename URLs. Each redirects client-side, in one hop, to its `/shelf` page (`/spine/next` → `/shelf/next`, `/spine/:id` and `/collection/:id` → `/shelf/:id/`, and so on). The build also writes link-preview heads at `/spine`, `/spine/next`, `/spine/how` and `/spine/<id>/` (canonical on `/shelf`), and the finishes feed at both `/shelf/feed.xml` and `/spine/feed.xml`, with item GUIDs kept on `/spine` so readers see nothing new |
| `/admin` | Dashboard | Google sign-in gate, reached from the footer's Sign in link; once signed in, the API and nightly status, headline counts, the nightly jobs, quick actions and recent changes |
| `/admin/analytics` | Analytics | Page views, visitors, views per day, pages, referrers and devices over 7, 30, 90 days or all time, from the first-party beacon (see [Analytics](#analytics)) |
| `/admin/collection` | Shelf | The same shelf with inline rate, favourite, status and publish, a list view, bulk set, and metadata refresh |
| `/admin/collection/:id` | Edit item | Every field, plus re-linking to a different IGDB/TMDB/Comic Vine match |
| `/admin/collection/add`, `/admin/closet/add` | Add | Intake: a tile per kind the API registers for the area, and the area's unfinished sittings (see [Intake](#intake)) |
| `/admin/collection/add/:id`, `/admin/closet/add/:id` | Sitting | One sitting: Shoot, Check, Details (shelf kinds) and Done |
| `/admin/import` | Redirect | Import photos became Add: redirects client-side to `/admin/collection/add` |
| `/admin/play-next` | Play Next | Three picks from the owned backlog |
| `/admin/catalogue` | Sources | What exists physically: registries (Switch 2 and Switch 1), stores, N64 |
| `/admin/radar` | Radar | Upcoming physical releases and open pre-orders, ranked by taste, plus IGDB's upcoming games with no physical edition yet; Want adds the game as a public want, listed on What's next |
| `/admin/discover` | Discover | Released physical games you would love and do not own: eight picks with reasons from one Gemini call, or the taste ranking when it cannot answer |
| `/admin/store-list` | Store list | What to look for in a store, on a phone: the same sections as What's next (In stores now with its top picks, Coming soon, Further out, Not on cartridge), read from `GET /api/recommendations/store-list`, with prices and store lines the public page never gets. Got it marks a game owned, Want adds it to my public list, and Not interested drops it for good; the list is live, so an answered game leaves it at once |
| `/admin/pull-list` | Pull list | Followed series' issues by week (Wednesday to Tuesday, UTC), with Got it and Skip per issue, Refresh followed, and a Comic Vine series search with Follow, Want and Own |
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

An optional `keywords: [...]` line adds search terms that are not in the
title or tags (see Site search).

## Writing a TIL note

Notes are short markdown files in `frontend/notes/`, with the same
frontmatter as posts (`title` and `date` required, `tags` and `draft`
optional) and the same draft rule. `render-rewrites-need-the-slash.md`
becomes `/til/render-rewrites-need-the-slash`. `/til` shows every note in
full, newest first, and `/til/feed.xml` carries them. A note's own headings
start at `###`: on `/til` its title is the `h2`.

Publishing a note, or turning a draft into one, also needs its rewrite in
`render.yaml`, ahead of the `/*` catch-all:

```yaml
- type: rewrite
  source: /til/<slug>
  destination: /til/<slug>/index.html
```

`prerender-lib.test.mjs` fails until the rule is there, and again if a note
is unpublished with its rule left in (a rule for a file the build did not
write serves an empty 200). The first published note also needs the `/til`
rule, which is already in place.

## Travel log

A trip is one markdown file in `frontend/trips/`, compiled by the same
plugin as posts and notes: `ireland-2014.md` becomes `/travel/ireland-2014`.
Getting the photos and the dates together for an old trip is its own job;
`docs/travel-onboarding.md` is the flow, from asking for originals to a
published page, with the list of trips still to recover.

**The grammar** (parsed by `frontend/scripts/trip-markdown.mjs`, pure):

```markdown
---
title: Croatia & Greece
date: 2026-09-12        # first day
end: 2026-09-23         # last day
precision: day          # day | month | year: how well the dates are known
summary: One line for the index card and link previews.
cover: walls-afternoon  # a photo name
places:                 # in route order; numbered on the map
  - { name: Dubrovnik, lat: 42.6507, lon: 18.0944 }
draft: true
---

## Day 2 · The walls · Dubrovnik

Prose. A day with no photos renders as a postcard.

![Alt text, required](walls-afternoon 'An optional caption')
```

A day heading never carries a date: day 1 is `date`, `Day 8–9` spans two,
and a travel day names its legs (`Dubrovnik → Athens → Naxos`). At month or
year precision the page prints *June 2014* and the day kickers drop their
dates rather than inventing them. A published trip may not contain `TODO`,
which is what the ingest scaffold writes.

**Photos.** Originals go in `frontend/trips/<slug>/photos/` and are
gitignored, because git keeps a blob forever, GPS and all. Two commands, run
by hand from `frontend/` (details in `frontend/scripts/README.md`):

- `node scripts/ingest-photos.mjs --from <dump>` reports a dump as
  candidate trips, grouped by date gaps and placed from GPS (`places.json`).
  `--write --slug <slug>` copies one trip's photos in and scaffolds a draft
  with `photos.json`, the committed manifest of names, dates and date
  confidence (no GPS). The dump is never modified.
- `node scripts/build-travel-images.mjs <slug>` writes the 800 and 1600px
  WebPs of the photos the trip shows to `frontend/public/travel/<slug>/`,
  rotated and with all metadata stripped, and removes sizes the trip no
  longer shows. A published trip's `photos.json` is trimmed to the photos
  it shows. A draft's built photos are left out of `dist/` by the
  prerender, but the draft file and manifest are public once pushed: the
  onboarding doc says what to check first. That output **is** committed:
  Render builds no images. When `public/travel/` passes about 50 MB, or at
  the third trip with a full photo set, move it to an object store.

**The map.** A trip with an entry in `frontend/src/content/maps/` gets a
drawn route map (`DrawnMap`, a hand-drawn SVG coastline placed by two
measured points in `lib/mapFit.js`); a trip without one has no map, which
suits a trip known only to the month. Live map tiles were considered and
rejected in the design. Denver spots is to reuse `DrawnMap`, not add a
second map component.

**Publishing** a trip (removing `draft: true`) also needs its rewrite in
`render.yaml`, ahead of the `/*` catch-all, and the first published trip
needs `/travel`'s:

```yaml
- type: rewrite
  source: /travel
  destination: /travel/index.html
- type: rewrite
  source: /travel/<slug>
  destination: /travel/<slug>/index.html
```

`prerender-lib.test.mjs` fails until they are there, and again if a trip is
unpublished with its rule left in. The first published trip also adds the
Travel entry to `frontend/changelog.md`.

## Site search

The masthead's Search button, ⌘K / Ctrl+K anywhere, or `/` outside a text
field opens one dialog over pages, posts, TIL notes, trips, the shelf and comics. The
admin pages have no search.

- **Pages** are bundled: `STATIC_PAGES` in `frontend/src/content/pages.js` is
  the one list of static pages, shared with the prerender step, so a new
  page added there is searchable and previewed at once. An empty query shows
  Pages only.
- **Everything else** comes from `/search-index.json`, written before
  `vite build` by `frontend/scripts/build-search-index.mjs` from the posts,
  the notes, the trips (title, places and day titles) and the build-time
  snapshot. `/blog`, `/til` and `/travel` are listed only while they have a
  published entry. It is a build output: gitignored, never
  committed, and fetched once, on first open. Without a snapshot it is
  written from the posts alone; if the fetch fails, the dialog still
  searches the pages and says search is unavailable.
- **Ranking** (`frontend/src/lib/searchIndex.js`): title prefix 3, word
  prefix 2, substring 1, secondary text 0.5; at most five rows a group.
  Matching folds case and accents (`lib/normalize.js`).
- No match offers "Search the shelf", which opens `/shelf?q=<query>` with
  the shelf's own search filled in.

## Daily puzzle

`/daily` is Shelfle: one game a day, the same for everyone, guessed in six
and graded on platform, year, genre and size. It is built entirely in the
browser from `/snapshot/items.json`. It makes no API call, so it plays while
the free-tier backend sleeps. The rules live in `frontend/src/lib/daily.js`,
which is pure and tested without a DOM.

- **Pool:** public, owned games (no wants) with a platform, a release year,
  at least one genre and a time to beat that falls in a size band
  (`lib/sizeBand.js`, shared with Play Next's pill). A build whose snapshot
  leaves fewer than `MIN_POOL` (30) eligible games fails.
- **Day:** Denver's calendar day (`ownerDay` in `lib/formatDate.js`), so the
  puzzle turns over at midnight there. Day 1 is `DAILY_EPOCH`, and the day
  number is counted in whole UTC days, so daylight saving never shifts it.
- **Pick:** FNV-1a of the salt plus the date, modulo the pool, stepping past
  the previous seven days' answers. A snapshot change can change later
  answers, never past ones already played on that build.
- **Salt:** `VITE_DAILY_SALT`, set on the Render static site and injected at
  build. It only stops an answer being worked out from the snapshot's ids;
  anyone who reads the bundle can still find it. Every answer is already
  public, so nothing more is protected. `vite build` refuses to run without
  it. Dev and tests fall back to a fixed word.
- **Grading:** platform matches exactly or is close within a family (Switch
  and Switch 2, PS4 and PS5, Xbox One and Series X|S). Year is close within
  two years, with an arrow. Genre matches when the sets are equal and is
  close when they share one. Size is close one band away, with an arrow.
- **Storage:** one `localStorage` key, `daily:v1`, holding today's guesses,
  the streak, games played and total guesses. The page renders and plays
  without it; a blocked store just forgets.

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

### Sessions follow the allowlist

The session is a signed cookie that lasts thirty days. Every admin request
re-checks it against today's `ADMIN_EMAIL` and `ADMIN_GOOGLE_SUB`
(`auth.session_admin`), so changing either ends sessions issued under the old
values at their next request; there is no need to rotate `SESSION_SECRET` for
that. Rotating `SESSION_SECRET` still ends every session at once.

### Cross-origin writes are refused

`SameSite=Lax` withholds the cookie from cross-site requests, but every
`*.joey-haas.dev` host is the same site. `origin_check.py` refuses any POST,
PUT, PATCH or DELETE whose `Origin` header is present and not the frontend's
origin (403 `Origin not allowed`). Requests with no `Origin` (curl, the
nightly job) are not from a browser page and pass to the usual auth check.

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
| Photo import | `backend/importer.py`, `matching.py`, `llm.py` | A shelf photo goes to Gemini's model chain (Claude Haiku as the paid fallback when its key is set; see `llm.py`), the titles it reads are matched against a source, and confidence comes from string distance, never the model's say-so |
| Public showcase | `backend/public.py`, `/shelf`, `/shelf/next` | Display fields only, for public rows only — never notes, cart IDs, raw source metadata or the catalogue. `test_public.py` pins the field lists |
| Play Next | `backend/picker.py`, `taste.py`, `facets.py`, `picker_items.py`, `strategies.py`, `public_picks.py`, `continuing.py`, `/admin/play-next` | Three picks from the owned backlog, scored against what was rated, loved and finished, with reasons; pinning one shows it on What's next (`/shelf/next`) as "Up next", and What's next's "Tonight" picks live from the same engine over public rows (games, plus Read next for comics and Watch next for movies), where the owner, signed in, can pin a pick, skip it, or start a comic or movie. While a game is being played, Tonight leads with it instead (a Continue card: playing since, journal hours and sessions, last played, stale after 21 quiet days) and the picks drop to a compact list; Wrap up finishes, pauses or abandons it with a rating, a line and the date |
| Physical catalogue | `backend/physical_sources/`, `/admin/catalogue` | What exists physically and in which format: the r/NSCollectors registry (via the Sheets API), its Switch 1 sheet (about 4,500 titles in about 10,000 editions, bulk-matched to IGDB's Switch list), `switch2-tracker`, eleven boutique stores read from their public JSON endpoints, and IGDB's N64 list; rows are resolved to IGDB and collapsed to one format per game |
| Radar | `backend/radar.py`, `/admin/radar` | Upcoming physical releases and open pre-orders from the catalogue, ranked by taste; Want adds the game as a public want, and registry-dated cartridges appear on What's next |
| Discover | `backend/discover.py`, `/admin/discover` | Released physical games on the owner's platforms, pre-scored by taste and re-ranked by one Gemini call with reasons; falls back to the deterministic ranking when the model cannot answer; its top picks appear on What's next, with reasons that name only public games |
| Comics | `backend/comics.py`, `comics_routes.py`, `public_comics.py`, `/shelf/comics`, `/admin/pull-list` | Series rows with the issues I own as range text and collected editions; Comic Vine's issue list per followed series feeds the pull list and the public "Out this week". Only public series are ever shown publicly; following and skips stay private |
| What's next | `backend/next_list.py`, `next_load.py`, `/shelf/next`, `/admin/store-list` | One pure sectioning authority over pending Discover and Radar rows, used by the public page (registry dates only, reasons rebuilt over public games) and the admin store list (any date, stored reasons) |

Migrations `0001`–`0014` build this up: items, enrichment columns, copy
columns, `pick_events`, the catalogue's five tables, the shared
`recommendations` table, `play_sessions`, analytics, `pick_events.slot`,
the comic columns, `playthroughs`, a playthrough's `note`, the
Denver spots tables, and the Closet tables. They are applied by hand and must be additive — see
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
| `GEMINI_API_KEY` or `ANTHROPIC_API_KEY`, with `LLM_PROVIDER` | Photo import, Discover's ranking, Closet tagging and the other model calls. With `LLM_PROVIDER=gemini` (the default) the chain is free and ends at the last Gemini model. Claude Haiku is added as a paid last link only when `LLM_PAID_FALLBACK=true` **and** `ANTHROPIC_API_KEY` are both set, reached only when every free Gemini model is used up, overloaded or out of time; a key alone bills nothing. `anthropic` sends every call to Haiku |
| `GOOGLE_SHEETS_API_KEY` | The catalogue's registry refresh (the stores run without it) |
| `BGG_TOKEN` | Reserved for board games; not usable yet |

`render.yaml` declares the IGDB, TMDB, Comic Vine, `LLM_PROVIDER` and
`GEMINI_API_KEY` variables; `GOOGLE_SHEETS_API_KEY` and any other is set
directly on the service in the Render dashboard.

## Closet

The Closet (`/admin/closet`, admin only) is the wardrobe behind the outfit
planner. Spec and plan: `docs/planning/2026-11-09-outfit-design.md`.
Routes are `backend/closet_routes.py`; thumbnails `closet_images.py`;
the tagging prompt and its checks `closet_tag.py`. Review's routes are
`closet_review_routes.py`, its flags are the cull in `closet.py`, and the
Sunday opinion's prompt and checks are `closet_opinion.py`.

- **Photos first, details later.** `POST /api/closet/garments/photos`
  takes up to 24 photos (JPEG, PNG, WebP or HEIC, 14 MB each), makes each a
  400px WebP stored in `garment_images`, and creates one `untagged` garment
  per photo. No model is called on upload; one unreadable photo refuses the
  upload whole. The photo is served by `GET
  /api/closet/garments/{id}/image`, private and cached a day.
- **The tag queue** is every garment that is `untagged`, has never been
  saved by hand (`tag_source IS NULL`), has fewer than three failed answers
  (`tag_attempts`) and has a photo, oldest first. One model call tags up
  to ten photos; an answer whose indices are not exactly `0..n-1` is
  rejected whole and counts a strike against each garment in it, so a photo
  the model cannot read drops out after three. A quota or overload error
  counts no strike. A hand save (`PATCH`) sets `tag_source = manual`, which
  takes a garment out of the queue for good, and wins over a tag answer
  that arrives after it.
- **The tag budget** is the Profile's `tag_budget`: the most model calls
  the nightly step (`POST /api/closet/jobs/tag`) spends, default 5, at most
  50, and 0 turns the step off. The free tier's ~20 requests a day per model
  are shared with Discover and the photo importer, so the budget is a
  setting rather than a constant. The step stops early at a model error
  (its note, such as "Gemini's daily quota is used up", is the run's
  summary) or an empty queue, and writes `closet_settings["tag.last_run"]`
  (`{at, state, tagged, calls, remaining, note}`), which `GET
  /api/closet/status` reads. **Tag now** on the Closet page
  (`POST /api/closet/tag`) tags one batch whatever the budget says. While it
  waits the page reads `Tagging N photos — one batch · N s` (N is at most
  `TAG_BATCH_SIZE`, 10, mirroring `closet_tag.BATCH_SIZE`), adds a
  still-working line after 30 s, and gives up with an alert at 195 s (a
  cold wake, the model's 150 s budget and a margin); the tags may still
  land, and the page re-reads the closet either way. Today waits the same
  way on its first load: `Waking the server or planning the day · N s`, a
  still-planning line after 20 s, and a Retry after the same 195 s give-up.
- **The pages.** `/admin/closet` is every garment as 4:5 tiles or a table
  with wear meters (the choice kept under `shelf.admin.closet.view`),
  filtered by status (Active by default), slot, Warm and Smart. Pieces
  come in through intake's add bar (see Intake): ▤ Photos opens a clothes
  sitting at Shoot, each photo an untagged garment at once, and the "N
  photos waiting · Tag now" line runs one batch of the queue. `/admin/closet/:id` edits every field by hand and deletes;
  `/admin/closet/profile` is the Profile, saved whole as one `PATCH`. The
  Closet area's badge counts the pieces Review has flagged (`tiles.flagged`
  from `GET /api/closet/review`), read by `AdminLayout` on sign-in and again
  on the way into the Closet area, and updated by every read on the Review
  page; Home's Closet card shows that
  figure as To review beside Untagged.

### Review

`/admin/closet/review` is the cull: one flagged piece at a time, decided
with Keep, Pack away, Sell or Donate. The flags are data, never the model.

- **The flags** (`closet.flags_for`, pure) are worked out on every read from
  the garments and twelve months of wears, each with the sentence the deck
  shows: *unworn* (no wear in twelve months though in season for at least
  eight weeks of them), *condition* (a word such as "pilled" or "stain" in
  the notes, quoted), *rare* (two wears or fewer while the same category
  averaged at least six and three times as many), *duplicate* (more than
  three alike in category, colour and formality; the most worn one is never
  flagged), and *out of season* (only while a season turn is open). The
  deck orders cards by how many flags, then the strongest
  (`FLAG_ORDER`), then name. `closet.suggest` marks one outcome: Donate for
  condition, Sell for unworn, Donate for rare or duplicate, Pack away for
  out of season alone.
- **The season turn** is the Profile's `spring_turn` and `autumn_turn`. From
  the turn date the banner offers Pack all for the closing season's pieces
  until it is dismissed (`POST /api/closet/review/dismiss`, which closes the
  turn and its out-of-season flags) or nothing is left to pack. One by one
  only hides the banner on the page. A piece kept since the current turn
  stays out of the deck until the next one.
- **Outcomes.** `POST /api/closet/garments/{id}/decision` writes one
  `garment_decisions` row: Keep leaves the garment active, Pack away sets
  `packed` with a `back_on` month (prefilled with when its season comes
  back), Sell sets `listed` after the listing checklist (Copy listing puts
  brand, size from the Profile, condition from the notes and material on
  the clipboard), and Donate sets `gone`. Listed pieces wait under Listed
  for sale for Mark sold (`/sold`). Packed pieces whose month has come show
  as Due back with Unpack all (`/unpack-all`). Skip is the page's alone and
  writes nothing.
- **Undo** is one level: every write returns a token, kept under
  `closet_settings["review.undo"]`, and `POST /api/closet/undo` puts back
  the statuses, months and decision rows that write changed. A garment
  changed since (a hand edit) is left as it is, keeps its decision row, and
  is counted in the answer's `skipped`. Any later write replaces the token
  (a Pack all or Unpack all that touches nothing stores none), and a stale
  token answers 409. Every write locks its rows and checks the status again
  under the lock, so a double tap writes one decision.
- **The opinion** is a second pass over the deck, never a flag. The weekly
  step (`POST /api/closet/jobs/opinion`, Sunday evenings in the nightly
  run, in `JOB_ROUTES`) sends the flagged cards as one numbered prompt; the
  model answers with numbers, so an opinion can only attach to a piece the
  data flagged. `closet_opinion.validate` drops a number out of range, and
  a repeated number keeps its first entry. The batch is stored under
  `opinion.batch` and shown last on the card, labelled "Opinion:", at most
  200 characters; a batch more than three weeks old is not shown. A valid
  answer with no opinions stores an empty batch; a model failure keeps last
  week's. Every run writes `opinion.last_run`, which `GET
  /api/closet/status` reads for the Jobs page's Closet opinions row. To run
  it on another night, start Nightly by hand with "closet_opinion" ticked.

## Intake

One way in for the shelf and the closet (spec and plan:
`docs/planning/2026-11-10-intake-design.md`; the server half is
`backend/intake/README.md`). A *sitting* is a server-side draft: its photos,
the entries read from them, and the step it was left on, so it can start on
the phone and finish at the desk.

- **The pages.** `pages/AdminAdd.jsx` is each area's Add page: kind tiles
  from `GET /api/intake/kinds` (a Mixed shelf tile when the area has more
  than one photo kind) and Unfinished, one row per sitting with a
  three-part meter (ready, to check, still reading) from `GET
  /api/intake/sittings?area=`. `pages/AdminSitting.jsx` is one sitting:
  `SittingStepper` and the step components in `components/intake/`. The
  step is PATCHed onto the sitting on every move.
- **Kind-driven.** `KindFields` renders any kind's `FieldSpec` list (the
  whole list, the shared fields for "Set for all", or the per-item ones for
  a Details row), so a kind or field added on the server needs no change
  here. `lib/intake.js` holds only presentation (option values in words)
  and pure helpers.
- **Shoot** refuses a wrong type or an oversized file by name before
  upload, uploads each photo on its own request, and drives `POST
  /sittings/{id}/read-next` one photo at a time while the page is open;
  the nightly reads the rest. A queued photo says its place
  ("waiting to be read · 2 ahead"), the one being read counts seconds
  ("reading · 12 s", with a still-reading line after 30 s). A read the
  client gives up on at 195 s, or a network error, re-fetches the sitting
  so the tiles show the server's real state, and the error offers Read
  again. Remove is off on the photo being read. A spent budget makes waiting photos say
  "waiting for tomorrow's budget". One polite live region announces reads.
- **Check** asks `check` and `probable` entries, one at a time (a radio
  group, the best candidate preselected; a Probable badge marks a likely
  match you still confirm). The skim grid of checkboxes holds exact,
  searched and typed titles. Unticking stores `ignored` with
  `payload.unticked` and `payload.was`, so a reload shows it unticked rather
  than gone. Search… looks the title up through the add bar's search and
  lists the entry's kind's matches first; a comic result adds its publisher
  and issue count (`lib/intake.js` `comicDetails`) to tell same-titled
  series apart. A clothes sitting's Check is
  `GarmentCheck`: only pieces the tag queue gave up on, one at a time (Save
  and next, Tag again, Skip, Remove this photo), read from the Closet's own
  garments.
- **Removing before the commit.** Remove sits on Shoot's photo tiles and its
  list of searched and typed titles, on the Check skim grid, on Already on
  the shelf rows, on Details rows and on the closet's Other photos. A title
  is removed with `PATCH state: ignored` (no `payload.unticked`); a photo
  with `DELETE /api/intake/sittings/{id}/photos/{photo_id}`, which takes
  every title read from it (a 409 while the photo is being read). A typed
  closet piece is deleted with its garment. All of it goes through
  `lib/intakeRemove.js`; `removeEntry` ignores a second click on the same
  entry while the first is on its way.
- **Shoot's count line** reads `N titles so far · N ready · N to check · N
  reading · N on the shelf · N unticked · N photos waiting to be read`, zero
  parts dropped. The title parts add up to the total; removed titles are in
  neither, and an unticked one stays listed since Check can retick it.
- **Details** is one pass per kind present; a comic on a trades or omnibus
  shelf format also gets the collected-editions editor (kind, label and the
  issues each collects), saved on the entry's payload when focus leaves it
  and checked again when Add is pressed, which will not commit past a
  half-filled edition. **Done** shows the commit's own
  four figures, and Publish these N publishes the commit's `created` ids
  through `POST /api/items/visibility`.
- **The add bar** (`components/intake/AddSection.jsx`, with `AddBar`,
  `AddResults` and `AddDrawer`) sits above the grid on `/admin/collection`
  and `/admin/closet`. On the shelf it searches on submit (`GET
  /api/intake/search`), labels each result with its kind, links one
  already owned (On shelf) and words each source that did not answer; a
  source with no credentials is a disabled Search button with its reason,
  and "Keep as typed" offers every kind that can be typed. In the Closet
  it is type-only. Add opens the drawer (beside the grid, a modal bottom
  sheet below 900px through `useMediaQuery`; focus trapped, Escape closes,
  focus back on the button that opened it), which commits through `POST
  /api/intake/add`. ▤ Photos opens the Add page, or straight to Shoot
  where the area has one photo kind (the Closet). An unfinished sitting is
  one line with Resume; drafts never show in the grid. The Closet's "N
  photos waiting · Tag now" line counts its tag queue; a closet sitting's
  Done sends the Closet straight to its untagged pieces.
- Intake's 409s are its own words: it calls `errorMessage(response, {
  ownConflicts: true })`, which reads the `detail` instead of the catalogue
  lock wording.
- The Add pages' badges are the entries left to check or confirm, `check`
  and `probable` (`GET /api/intake/counts`), loaded by `AdminLayout` and refreshed by a sitting
  through `refreshIntakeCounts`.

## Smoke test

After a deploy:

```sh
./scripts/smoke.sh
```

Defaults to the production URLs; pass `[SITE_URL] [API_URL]` to target
something else. Exits non-zero if any check fails.

## Browser tests

Playwright runs the built site in Chromium, as a desktop and a phone (Pixel 5):

- **Smoke:** every public route returns a non-error status, shows an `h1`, applies
  the chosen theme, logs no uncaught or console errors (failed `/api/` requests
  are ignored: the tests run without a backend), and on the phone does not
  scroll sideways. The unknown-path (NotFound) page is covered too.
- **Accessibility:** axe (WCAG 2 A/AA) must find no new serious or critical
  violations on any route, in both the light and dark theme. Known ones are
  excused in `frontend/e2e/known-a11y.js` (all eight entries are links told
  apart from text by colour only, tracked in #182). The axe pass runs on the
  desktop project only; the phone project runs the smoke checks, including
  the sideways-scroll check.

The route list comes from `STATIC_PAGES` in `frontend/src/content/pages.js`, so
a new static page is covered automatically. `/blog` and `/til` are included
locally only when the build prerendered them.

```sh
cd frontend
npx playwright install chromium        # first time only
VITE_DAILY_SALT=local npm run build
npm run e2e
```

`npm run e2e` serves `dist` with `vite preview`. To test a site that is already
running, set `E2E_BASE_URL` instead of building:
`E2E_BASE_URL=https://joey-haas.dev npm run e2e`. The report is in
`frontend/playwright-report/`. CI runs the same suite in the `e2e` job.

Known problems are tracked, not hidden:

- A genuine site defect is marked `test.fail()` with a `// known: ... backlog
  issue` comment. The one today is `/shelf/comics` losing its `h1` when the
  API is down (#181); it is an expected failure in local runs only, since a
  live site has an API. When the defect is fixed the test starts passing, which
  Playwright reports as a failure, so the marker has to be removed.
- An excused accessibility violation is an entry in
  `frontend/e2e/known-a11y.js` (`{ route, ruleId, issue }`, `issue` being
  `#<number>`). An entry that no longer matches a violation fails the suite
  (one test per entry), so fixed ones get deleted.

### Screenshots

`npm run shots` (in `frontend/`) takes a full-page screenshot of every route in
both themes and both viewports, for design reviews. It serves `dist` like the
tests, or shoots a live site:
`E2E_BASE_URL=https://joey-haas.dev npm run shots`. Against a live site it also
shoots one sample of each dynamic page kind (shelf entries, blog post, TIL,
travel) taken from `sitemap.xml`.

Output is `frontend/e2e-shots/<desktop|phone>/<light|dark>/<route>.png`, plus
`frontend/e2e-shots/errors.json` listing any page that errored, returned an
HTTP error or never went idle. Screenshots never fail the run. The shots
set the analytics opt-out (`navigator.globalPrivacyControl`) and block
`/api/track`, so shooting production does not count as visits.

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
inactivity (first request then takes ~30 s). Only `/shelf`, `/shelf/next`
and `/shelf/:id` call the API. They paint the build-time snapshot first and
show a "waking the server" state only when there is no snapshot; every other
public page never waits on it (see [Collection snapshot](#collection-snapshot)).
Upgrade to Starter ($7/mo) to keep it warm.

### Dependency pins

`backend/requirements*.txt` say what the API needs, as ranges;
`backend/constraints.txt` pins every installed package, transitive ones
included, to one tested set. Render's build, CI and the local install all
pass it with `-c`, so a deploy installs what CI tested rather than whatever
was newest that minute, and `pip-audit` in CI audits those exact pins.

Refresh it on purpose, never as a side effect: from `backend/`, in a fresh
Python 3.12 venv,

```sh
python3.12 -m venv /tmp/pins && /tmp/pins/bin/pip install -r requirements-dev.txt
/tmp/pins/bin/pip freeze > constraints.txt
```

then run the tests and commit the file in its own change. Adding a
dependency to `requirements.txt` means refreshing the pins in the same
change: a constraints file only limits what it names, so a newcomer it
does not list installs unpinned.

## Collection snapshot

`/shelf`, `/shelf/next` and `/stats` first paint a snapshot of the public API, then
refresh it from the live API, so a first-time visitor doesn't wait for the free-tier
backend to wake. Home and Projects read the same file for their cover
strips.

- **Written by** the Render static build: `frontend/scripts/fetch-snapshot.mjs`
  runs first in `npm run build`, and only where `VITE_API_URL` is set. See
  `frontend/scripts/README.md`.
- **Refreshed by** every deploy, plus `.github/workflows/nightly.yml`. It runs
  daily at 00:17 UTC and on demand from the Actions tab, compares the live API
  bodies with the deployed `/snapshot/*.json`, and triggers a static-site
  deploy only when they differ. It never pushes, and the snapshot is never
  committed. Before it compares, it refreshes the data the snapshot is made
  of (see [Nightly job](#nightly-job)).
- **`comics.json` and `spots.json` are optional too**, the same way:
  `/shelf/comics` and `/denver` paint them when the build wrote them, and
  the nightly compares them with a failure there only a warning.
- **`comic-issues.json` is optional too** (`/api/public/comic-issues`): the
  list of public series with the issue and edition pages that exist. Only the
  prerender reads it, to write `dist/shelf/<id>/<n>/index.html` and
  `.../<slug>/index.html` heads; the nightly does not compare it.
- **`status.json` and `site-stats.json` are optional too** (the status
  strip, and `/stats`), and neither is compared by the nightly: `next.json`
  differs every night, so the redeploy that follows carries fresh ones.
- **`next.json` is optional.** `/shelf/next` paints `/snapshot/next.json` when
  the file exists and shows "Waking the server" until the live call answers
  when it does not. `fetch-snapshot.mjs` writes it and leaves it out without failing the build when the API
  cannot serve it yet.
- **Setup (once):** in Render, go to the static site → Settings → Deploy Hook
  and copy the URL. In GitHub, go to Settings → Secrets and variables →
  Actions and add it as `RENDER_DEPLOY_HOOK_URL`. The URL is a secret: anyone
  who has it can trigger deploys.
- **Gotcha:** if the snapshot stops refreshing after a quiet spell, GitHub
  may have switched the schedule off; see the gotcha under
  [Nightly job](#nightly-job).
- **Unpublishing:** to drop an unpublished item from the snapshot at once, run
  the Nightly workflow from the Actions tab, or trigger a manual static-site
  deploy.
- **The API is not redeployed** by any of this. Its `rootDir` is `backend`, so
  Render deploys it only for changes under `backend/`.

### Nightly job

`nightly.yml` does every night what the owner otherwise presses by hand, then
keeps the snapshot within a day of production. It calls admin routes with
`Authorization: Bearer $JOB_TOKEN`, in this order:

1. wake the API (up to six minutes of retries);
2. Play Next picks (`POST /api/picker/next`);
3. the followed comics' issue lists (`POST /api/comics/refresh`), then the
   weekend planner's NWS forecast (`POST /api/spots/weather/refresh`), then
   the Closet's tag queue, up to the Profile's tag budget
   (`POST /api/closet/jobs/tag`; see [Closet](#closet)), then the day's
   outfit plan (`POST /api/closet/jobs/plan`);
4. catalogue registry, then the WooCommerce stores (`refresh-registry`,
   `refresh` with `{"adapter": "woocommerce"}`), then the Shopify stores,
   walked on the runner by `backend/scripts/walk_stores.py`, which posts
   each one to `POST /api/physical/stores/{key}/ingest` (Shopify
   rate-limits Render's IP);
5. Switch 1 registry, on Sunday evenings only (`refresh-switch1`);
6. Resolve, repeated while it makes progress, at most five rounds;
7. Radar generate, then Discover generate on Sunday evenings or when the
   `discover` input is ticked on a manual run;
8. the spot finder (`POST /api/spots/candidates/refresh`: one Overpass
   query around the anchors and one model call), on Sunday evenings only,
   then the Closet's Review opinion (`POST /api/closet/jobs/opinion`, one
   model call over the flagged pieces; see [Review](#review)), also Sunday
   evenings only;
9. the page-view rollup (`POST /api/analytics/rollup`);
10. the snapshot compare and, only if a body differs, the static-site deploy
    hook.

"Sunday evening" is Denver time, which is Monday in UTC; the job tests
`date -u +%u` = `1`. The Shopify walk is the long step (up to 75 minutes, on
the runner; about half a minute when no store answers 429), so the job's
limit is 150 minutes.

- **`JOB_TOKEN`** is set in two places: as an environment variable on the
  Render API service (declared in `render.yaml`, value entered in the
  dashboard) and as a repository secret under Settings → Secrets and variables
  → Actions. The two must match. Without the secret the job says so, refreshes
  nothing and fails its summary step. When they differ, or the Render value
  is not set, every call answers 401 and the run fails, naming both causes.
- **The token opens fifteen routes and nothing else.** The whitelist is
  `items.JOB_ROUTES` and `backend/tests/test_job_token.py` pins it exactly:
  the writes above (the ingest among them) plus `GET /api/physical/status`
  and `GET /api/physical/stores/{key}/html-skip`. The ingest makes the token
  a write credential for store listings, bounded by its validation (that
  store's own rows on its own host, real enums, store tiers only). A signed-in session is
  checked as before; the token never reaches any other admin route.
- **Picks are live.** There is no picks step: `public_picks.py` builds
  What's next's `tonight` picks from the live rows on each request, and
  `POST /api/picker/next` is out of `JOB_ROUTES`.
- **A failed step is a warning**, not a failure. Only a 200 or 201 is a
  success, and a 200 whose body reports `ok: false` (a catalogue source
  failed) is a failure. A 409 (the catalogue was busy), a 5xx, a timeout or
  any other answer is a warning: that call is skipped and the steps after it
  run on yesterday's data. The one exception is a 401, which is
  configuration rather than data and fails the run (see `JOB_TOKEN` above).
  The run summary lists every step as succeeded or failed; the "Last
  nightly" line on `/admin` names only the catalogue sources that failed.
- **The snapshot's `next` output** carries `generated_at` days, so it differs
  every night and the static site redeploys nightly. That is intended.
- **Gotcha:** GitHub switches off scheduled workflows in a public repository
  after 60 days with no repository activity, and this job never commits. To
  re-enable it, open the repository's Actions tab, choose Nightly, and
  enable the workflow. The Dashboard at `/admin` marks the catalog refresh
  stale, with a link here, when the last catalogue run is more than 36 hours
  old.

## Analytics

This site counts its own visits: no cookies, no third-party script, and
nothing leaves the site's own API. Each page view sends the path, the
referring site on a visit's first page, and whether the device is a
desktop, phone or tablet. A visitor is a hash of IP address and browser
that changes every day, so one day cannot be joined to the next, and
neither the address nor the browser is stored. Nothing is sent under
Global Privacy Control or Do Not Track, and the figures undercount: the
API sleeps when idle, and a view sent while it wakes is lost. Obvious bots
are left out: anything that says it is a crawler, a headless browser or a
script is not counted.

The paragraph above is quoted verbatim on `/stats` ("How this is counted",
`frontend/src/content/stats.js`); `stats.test.js` reads both, so edit it
here first. The details:

- **The beacon** (`frontend/src/lib/useAnalyticsBeacon.js`, mounted in
  `RootLayout`) sends `{path, ref, device}` with `navigator.sendBeacon` once
  per public route change: the path, the referring hostname on a visit's
  first view (`''` for direct, `null` on every later view, which the
  referrer counts leave out), and desktop, phone or tablet. It waits for the session check
  and sends nothing while signed in, on `/admin*`, or under Global Privacy
  Control or Do Not Track.
- **`POST /api/track`** (`backend/analytics_routes.py`) is unauthenticated
  and answers 204 to anything `origin_check` lets through (a foreign
  `Origin` is refused with 403 first). It drops anything that is not a
  public route, a hostname and a known device, a body over 1 KB, a
  signed-in admin, `Sec-GPC` or `DNT`, and a user agent that is empty or
  names itself automated (`analytics.AUTOMATED_AGENTS`: crawlers, link
  unfurlers, headless and driven browsers, monitors, HTTP libraries; #126),
  which is checked before the cap. Caps, in memory and reset at UTC
  midnight: one IP (an IPv6 address counts as its /64) stores at most 100
  views a day, the whole site at most 5,000, and past 10,000 distinct IPs
  in a day a new one is not counted. The tracker's pages count under
  `/shelf*`; the pre-rename `/spine*` paths are dropped, since they only
  redirect to a `/shelf` page that is then counted. Views recorded before
  the rename keep their `/spine` path in `page_views` and `daily_stats`.
- **A visitor** is `HMAC(salt, ip + "\n" + user agent)`, where the salt is
  derived from `SESSION_SECRET` and the UTC date, so it changes at midnight
  and the stored hashes do not join one day to the next. The salt is
  derived rather than discarded, so whoever holds `SESSION_SECRET` could
  test a known IP and user agent against a stored day. Neither the IP nor
  the user agent is stored or logged. The IP is `CF-Connecting-IP`, then
  `True-Client-IP`, never `X-Forwarded-For`, whose first entry the caller
  chooses. That Render's edge always sets `CF-Connecting-IP` is assumed,
  not yet confirmed on a live request.
- **Storage** is migration `0008`: `page_views` (raw rows, kept 90 days) and
  `daily_stats` (per day, per page, referrer and device). The nightly
  rollup recomputes every finished day that still has raw rows, then
  deletes raw rows older than 90 days; it is idempotent, so a missed night
  is caught up by the next.
- **`GET /api/analytics?range=7d|30d|90d|all`** is admin only and cached for
  a minute. It reads `daily_stats` for rolled-up days and counts the rest
  (today, or a missed night) from raw rows.
- **Undercounting is accepted:** the free API sleeps, and a beacon sent
  while it wakes can be lost.

## Public API

All read-only, unauthenticated, and allowlisted by hand in `backend/public.py`
and `backend/public_outputs.py`; `backend/tests/test_public*.py` pin the list,
detail and next models' field sets.

| Route | What |
|---|---|
| `GET /api/public/items` | Every public item, most recently finished first |
| `GET /api/public/items/{id}` | One public item with description and similar games; 404 for unknown and private alike |
| `GET /api/public/stats` | Counts over public rows |
| `GET /api/public/diary?year=` | The play journal for a year, public games only and never the note (`PublicDiaryEntry`) |
| `GET /api/public/status` | The shelf's status strip: when the catalogue last refreshed and how big it is; `Cache-Control: max-age=300` |
| `GET /api/public/next` | What's next: `generated_at`, `tonight`, `wanted`, `buy_now`, `preorders`, `later`, `not_on_cartridge`, `comics_this_week` (see below) |
| `GET /api/public/pick-for-me` | Pick for me on What's next: every size and mood combination's top three, precomputed (see below) |
| `GET /api/public/comics` | `/shelf/comics`: public series with their runs, the shelf's figures, and `this_week` (the weeks ahead and the undated series under Later); never `issues_skipped`, a price or a store |
| `GET /api/public/spots` | `/denver`: published spots (`PublicSpot`: `spot_id`, name, slug, neighbourhood, tags, blurb, lat, lng), by neighbourhood then name; never an anchor, a visit or a distance; uncached |
| `GET /api/public/site-stats` | `/stats`: the analytics summary (`backend/analytics_routes.py`) for the last thirty days (`thirty`) and since launch (`all`), reduced for the public: a referrer host is named only when it is on `analytics.PUBLIC_REFERRER_DOMAINS` and has five visitors, every other host folds into `referrers_other`; a private item's page is never listed; no best-day referrer, lists capped at ten; cached for an hour on the cache the admin read shares, `Cache-Control: max-age=300` |

`/api/public/picks` and `/api/public/radar` are retired and answer 404;
`/api/public/next` carries both (Play Next's picks as `tonight`, Radar's
dated cartridges in its sections), and `scripts/smoke.sh` pins the 404.

`/api/public/next` is cached on a data fingerprint
(`backend/public_next_cache.py`) and rebuilt only when its inputs change;
admin routes, the store list included, are not cached.

### `GET /api/public/pick-for-me`

Pick for me, the band on What's next (`frontend/src/components/PickForMe.jsx`;
spec and plan `docs/planning/2026-11-06-pick-for-me-design.md`). The visitor
picks a length (any, short, medium, long) and up to two of Play Next's six
moods; that is 88 combinations, and the API answers all of them in one body,
so a press is a lookup and the band never waits on the free-tier server. The
ranking is `picker.public_pick_table`, pure and deterministic, with no model
call: four of Play Next's terms (`PUBLIC_TERMS`: affinity, similarity,
quality, length fit), weighted by `PICKER_WEIGHTS` and averaged to 0-100.
Moods are hard filters; size is a term. The pool is public, owned, unpinned
backlog, active or paused games, minus any the owner marked "never" before
today's UTC midnight.

- `generated_on`: the UTC day. `weights`: the four terms' weights.
- `games`: cards keyed by `item_id` (`title`, `cover_url`, `platform`,
  `time_to_beat_hours`, `igdb_url`, `reasons`).
- `combos`: every key `<size>|<moods sorted, +-joined>` (`any|` for no
  mood) to up to three `{item_id, score, terms}`, best first. A combination
  nothing fits is an empty list, never a missing key.

Unlike `/next` it publishes `score`: the card shows its working.
`test_public_pick_for_me.py` pins the fields and walks the body for every
other forbidden key, and `scripts/smoke.sh` checks the same live. The band's
keys and the API's are held together by `frontend/src/lib/pick-for-me-keys.json`,
which both test suites read; regenerate it when `combo_keys` changes. The
body is cached like `/next` (`public_next_cache.py`, one `PublicNextCache`
per body), on the same fingerprint, and is an optional snapshot
(`pick-for-me`), so the band paints from the build when the API is asleep.

### `GET /api/public/next`

The body has these keys:

- `generated_at`: UTC days, never times: `catalogue` (the day of the stalest store's last good run), `radar`
  and `discover` (the day of each kind's last generation, whatever the
  status of its rows). Any may be null.
- `tonight`: `continuing` (the public games being played, most recent
  session first), each with `item_id`, `type`, `title`, `cover_url`,
  `platform`, `time_to_beat_hours`, `playthrough` (the open run's
  number), `playing_since`, `last_played_on`, `journal_hours` and
  `sessions` (the play journal inside the open run; hours are null when
  no minutes were logged) and `stale` (no journal day in
  `continuing.STALE_DAYS`, 21, counted from the run's start when there is
  none). A game in hand is never also a pick or Up next: it already leads
  the section. Then `up_next` (the pinned game, when it is public and
  still waiting to be played), `picks` (three games), `read_next` (two
  comics) and `watch_next` (two movies), picked live from public rows by
  `public_picks.py` (no shown or skipped event is read, so they change
  when something is finished, not when Play Next is used), each a card
  with `item_id`, `type`, `title`, `cover_url`, `platform`, `reasons`,
  `slot_label` (Best fit, Change of pace or Overdue classic, else null;
  Change of pace is measured against the last *public* finish, so a later
  private one changes nothing on the page),
  `time_to_beat_hours`, `size` (`{unit, value}`: hours, issues left or
  minutes; null when unknown) and `progress` (`{read, of}`, comics only);
  and `last_finish` (`item_id`,
  `title`, `cover_url`, `finished_at`, `time_to_beat_hours`, `rating`),
  the most recent finish when it is public and at most 60 days old, else
  null.
- `wanted`, `buy_now`, `preorders`, `later`, `not_on_cartridge`: lists of
  rows with `title`, `platform`, `physical_format`, `release_date`,
  `release_precision`, `cover_url`, `igdb_url`, `reasons` (at most two),
  `top_pick`, `new` and `item_id` (set only for wanted games, which link to
  `/shelf/:id`).

The rules, held by `next_list.py` and pinned by `test_public_outputs.py`,
which walks the whole body for banned keys:

- **Public games only in reasons.** Reasons are rebuilt over public games,
  in the first person. Discover's model-written sentence is published only
  when it is the first stored line, cites at least one game, every cited game is
  public, it names no private game title (possessives included), and it is
  in the first person: neither addressing the reader nor speaking of me in
  the third person.
- **Registry dates only.** On a suggestion, a store's or IGDB's date is never
  published; a row with only one counts as undated. A wanted game shows
  its own release date only while it is still to come, with no precision and
  no IGDB link; Want copies a suggestion's date onto the item only when the
  registry gave it to the day.
- **No store data.** No store, price, pre-order window, score, rank or row id
  appears.
- **Frozen to the batch.** The store sections hold the pending rows plus
  the rows I answered (dismissed, skipped, wanted or owned) from the latest
  generation (Discover's as a whole, Radar's per console), shown exactly
  like pending ones, so
  answering a game does not change the public page; it leaves at the next
  generation (nightly), and a skipped game comes back. A generation with
  nothing pending left shows none of its answers, and a game I answered
  Already own stays nameable in a frozen reason only by its IGDB id, never
  by its title (spec S9).
  `/admin/store-list` is live.

