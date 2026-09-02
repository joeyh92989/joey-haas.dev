# Media Tracker — Requirements & Build Recommendations

Requirements for evolving the media collection tracker from its current
foundation (admin-gated CRUD on a bare `items` table) into an enriched,
public-facing portfolio feature with recommendations. Written for the Claude
Code agent implementing it; decisions below were made by Joey and should not
be re-litigated without asking.

## Current state (as of 2026-09-01)

- `backend/models.py` — `items` table: id, type (game|movie|comic|boardgame),
  title, status (backlog|active|finished|abandoned), rating 1–10, notes,
  is_public, timestamps. Neon Postgres 18, Alembic migrations (manual),
  schema check at boot.
- `backend/items.py` — admin-gated CRUD under `/api/items` (router-level
  `require_admin` dependency).
- `backend/auth.py` — Google OIDC, single-admin allowlist by email
  (optionally pinned to `sub`). Session cookie.
- Frontend: `/admin` (unlinked route), `/admin/collection` CRUD UI. Public
  pages make no API calls so the site works while the free-tier Render
  backend sleeps.

## Decisions (settled)

1. **Recommendations are hybrid.** Metadata APIs build the candidate pool for
   films and games; an LLM ranks candidates against the taste profile and
   writes short "why" explanations. Comics and board games have no candidate
   API, so they use pure-LLM suggestions validated against the metadata
   search APIs before display. No unvalidated LLM title ever reaches the UI.
2. **The LLM layer is provider-agnostic.** A thin internal interface with
   Gemini and Anthropic implementations, selected by env var. Default
   provider: Gemini Flash (free tier suffices for single-admin use — note
   Joey's Google AI Pro subscription does NOT add API quota; the free-tier
   API key is what's used).
3. **Demo mode = public read-only showcase.** Visitors see a poster-grid of
   items flagged `is_public`, plus a stats view. No sandbox/editable demo in
   scope. The existing `is_public` column is the switch.
4. **Login flow: footer "Sign in" link.** Replace know-the-URL access with a
   small footer link to the sign-in flow. Admin controls appear inline once
   authenticated. The `/admin` route may remain but must no longer be the
   only entry point.

## 1. Data model changes

Keep the single `items` table (types differ in metadata, not in what is done
with them). One Alembic migration adds:

| Column | Type | Notes |
|---|---|---|
| `year` | smallint, nullable | Release/publication year |
| `creator` | varchar(300), nullable | Denormalized: director / developer / writer / designer |
| `cover_url` | text, nullable | Full image URL (see image policy below) |
| `external_source` | varchar(20), nullable | `tmdb` \| `igdb` \| `comicvine` \| `bgg` |
| `external_id` | varchar(50), nullable | ID at that source; unique together with `external_source` (partial unique index where not null) |
| `favorite` | boolean, not null, default false | Heart, independent of rating (Letterboxd pattern) |
| `started_at` | date, nullable | |
| `finished_at` | date, nullable | Drives the timeline/stats views |
| `times_completed` | smallint, not null, default 0 | Rewatches / replays / rereads |
| `owned_format` | enum: `physical` \| `digital` \| `subscription` \| `borrowed` \| `none` | `none` = wishlist (not owned). This is the "explicit owned column" the model docstring planned — ownership stays orthogonal to progress status. Default `physical` is wrong for most rows; make it nullable with UI required on create, or default `digital`. Agent's choice, document it. |
| `source_metadata` | JSONB, nullable | Snapshot of fetched source metadata: genres, description, community score(s), runtime/playtime, plus per-type extras (platform, seasons, issue counts, player counts, weight). NOT named `metadata` — that attribute is reserved by SQLAlchemy's declarative base. |

- **Want list** = `owned_format = 'none'`. No wishlist status value; the
  status enum keeps meaning progress only. The UI renders a "Want" tab from
  this filter, and recommendations are accepted into it.
- **Status enum**: keep the four values. Optionally add `shelved` (paused,
  distinct from abandoned — a genuinely useful Backloggd distinction) in the
  same migration if cheap; otherwise skip.
- **Rating**: keep 1–10 integer storage. Render as 5 stars with halves in
  the UI (the Letterboxd/Backloggd display standard; 1–10 maps losslessly).
- Do NOT add per-type child tables or a diary/plays table yet. If a diary
  view is wanted later, a `logs` table (item_id, date, note) is the clean
  E-next; `times_completed` + dates cover v1.

## 2. Metadata enrichment (Tracker E2–E4)

### Flow (same for every source)

Admin flow only. On the add/edit form: pick type → type a title → frontend
calls a backend search proxy → backend queries the source API → picker shows
title/year/thumbnail → selection fills `external_source`, `external_id`,
`year`, `creator`, `cover_url`, and the `source_metadata` snapshot; title becomes
editable prefill. Manual entry (no external link) must remain possible.
Add one `POST /api/items/{id}/refresh-metadata` route that re-fetches from
the linked source.

All source API calls happen server-side (keys/secrets never reach the
browser). Add a `backend/sources/` package: one module per source behind a
common interface (`search(query) -> list[SourceResult]`,
`fetch(id) -> SourceDetail`), mirroring the one-router-per-project
convention.

### Per-source specifics

**TMDB — films (E2, proves the pattern)**
- Signup: themoviedb.org account → Settings → API → request developer key
  (instant, free for non-commercial; a personal portfolio qualifies).
- Auth: v4 Bearer token header (preferred) or v3 `api_key` param.
- Search `GET /3/search/movie?query=&year=`; detail
  `GET /3/movie/{id}?append_to_response=credits` (director from credits).
- Images: hotlinking is the intended usage —
  `https://image.tmdb.org/t/p/w342{poster_path}` (fetch `/configuration`
  once and cache, or hardcode base + document it).
- Community score: `vote_average` (0–10) + `vote_count` → store in `source_metadata`.
- Rate limit: ~40–50 req/s soft; handle 429 with backoff. Not a real
  constraint here.
- REQUIRED attribution: "This product uses the TMDB API but is not endorsed
  or certified by TMDB" + TMDB logo linking to themoviedb.org, on pages
  showing TMDB data (site footer of the tracker pages is fine).

**IGDB — video games (E3)**
- Signup: Twitch account with 2FA → dev.twitch.tv/console → register app →
  Client ID + Client Secret.
- Auth: OAuth client-credentials against `id.twitch.tv/oauth2/token`
  (~60-day app token). Cache the token in memory and refresh on 401 —
  do not fetch a token per request.
- Query: Apicalypse POST bodies, e.g.
  `search "outer wilds"; fields name,first_release_date,cover.image_id,genres.name,summary,rating,aggregated_rating,total_rating,involved_companies.company.name,involved_companies.developer,similar_games; limit 10;`
- Images: `https://images.igdb.com/igdb/image/upload/t_cover_big/{image_id}.jpg`
  (hotlinking is the documented pattern).
- Rate limit: 4 req/s per Client ID. Store `similar_games` IDs in `source_metadata` —
  the recommendation engine uses them.
- Free, commercial use permitted; no mandatory attribution (credit anyway).

**ComicVine — comics (E4)**
- Signup: free Comic Vine account → comicvine.gamespot.com/api → key.
- Auth: `api_key` query param, `format=json`.
- Track at the **volume** (series) level by default: name, start_year,
  publisher, count_of_issues, image, description. Issue-level is out of
  scope.
- Rate limit: 200 requests/resource/hour + burst velocity detection —
  space calls (~1/s) and never fan out. No community rating field exists.
- Strictly non-commercial (portfolio OK). REQUIRED: link back to Comic Vine
  where its data is shown.

**BoardGameGeek XML API2 — board games (E4)**
- No key. XML only — parse server-side (`xml.etree` is fine).
- Search `…/xmlapi2/search?query=&type=boardgame`; detail
  `…/xmlapi2/thing?id={id}&stats=1` → year, image, description, player
  counts, playingtime, average rating, Board Game Rank, averageweight.
  Search results carry no images, so the picker fetches `thing` for the top
  few hits (batch: comma-separated ids, one request).
- Throttle hard: ≥5 s between requests, honor 202-queued responses with
  retry. Cache aggressively.
- REQUIRED for public-facing use: "Powered by BGG" logo linking to
  boardgamegeek.com. Register the app via the form linked from
  boardgamegeek.com/using_the_xml_api.

### Image policy

Hotlink everything (store the full URL in `cover_url`), with an
`onerror` placeholder fallback in the UI. TMDB and IGDB document hotlinking;
BGG/ComicVine URLs are stable in practice but less guaranteed — the
placeholder fallback is the mitigation. Do NOT build local image caching:
Render free-tier disks are ephemeral and object storage is out of budget
scope. Revisit only if covers actually break.

### Env vars (extend `config.py`, validated at import like the rest)

```
TMDB_API_TOKEN          # E2
IGDB_CLIENT_ID          # E3
IGDB_CLIENT_SECRET      # E3
COMICVINE_API_KEY       # E4
LLM_PROVIDER            # E6: "gemini" | "anthropic"
GEMINI_API_KEY          # E6 (when provider=gemini)
ANTHROPIC_API_KEY       # E6 (when provider=anthropic)
```

Keys arrive per-epic; config validation must only require the vars for
features that are enabled/shipped (e.g. each source module checks its own
config lazily, or use feature flags — do not make E2 deploy demand E4 keys).

## 3. Recommendations (Tracker E6)

Goal: suggest things to add to the want list (`owned_format='none'`).

### Architecture (hybrid, per decision 1)

`POST /api/recommendations/generate?type=` (admin-only), pipeline:

1. **Taste profile**: from the DB — top-rated items (rating ≥ 7), favorites,
   recent finishes, and genres from `source_metadata` snapshots. Compact text block.
2. **Candidate pool** (films/games only):
   - Films: TMDB `GET /movie/{id}/recommendations` for the top ~5 rated
     films (use `/recommendations`, not `/similar` — materially better).
   - Games: IGDB `similar_games` from stored `source_metadata` (or fetched live).
   - Dedupe; drop anything already in the collection (match on
     external_source+external_id, fall back to title+year).
3. **LLM call** (via the provider layer):
   - Films/games: "here is the taste profile and 30–50 real candidates
     (title, year, genres, score) — pick the best 5–8 and explain each in
     one sentence." Output constrained to the candidate list.
   - Comics/board games: "suggest 5–8 real titles for this profile" →
     validate every suggestion via ComicVine/BGG search; discard misses
     (mind the throttles: validate serially for BGG).
   - Both providers must use enforced JSON schema output (Gemini
     `responseSchema`; Anthropic structured outputs). Schema:
     `[{title, year, media_type, reason, external_source, external_id}]`.
4. **Persist** results in a `recommendations` table: id, type, title, year,
   external_source/id, cover_url, reason, status
   (`pending`|`accepted`|`dismissed`), created_at. Generating is explicit
   (a button), never automatic — free tiers and the BGG throttle make
   background generation a liability.
5. **UI**: a "Discover" tab in the admin collection page listing pending
   recommendations as cards (cover, reason, source score) with Accept →
   creates an item with `owned_format='none'`, status backlog, metadata
   prefilled — and Dismiss. Dismissed titles are excluded from future
   prompts (pass them in the prompt as "do not suggest").

### Provider layer (decision 2)

`backend/llm.py`: `complete_json(prompt, schema) -> dict`, implementations
`GeminiProvider` (REST, `gemini-flash` latest; free tier ~250 req/day is
ample) and `AnthropicProvider` (`claude-haiku` latest; ~$0.003–0.01/call).
Picked by `LLM_PROVIDER`. Keep it to one method — this is a seam, not a
framework. Timeouts + one retry; surface provider errors to the UI as
"generation failed, try again" (free-tier 429s will happen).

## 4. Public showcase & login flow (Tracker E5 — can ship before E6)

### Public showcase (decision 3)

- New unauthenticated router `GET /api/public/items`: only `is_public=true`
  rows, only display fields (id, type, title, year, creator, cover_url,
  status, rating, favorite, finished_at, and genres/score from `source_metadata`).
  Never expose notes, owned_format, or non-public rows. Add
  `GET /api/public/stats` (counts by type/status, rating histogram,
  finishes per month) computed server-side.
- New public page (e.g. `/collection`), linked from Projects as a project
  card: poster-grid default view with type/status filters, a stats block
  (status funnel counts, rating histogram, finishes-per-month), and a
  recently-finished timeline strip. These four views are the demo value —
  prioritize the poster grid.
- The public page DOES call the API, unlike the rest of the public site.
  Handle the Render free-tier cold start explicitly: a friendly loading
  state ("waking the backend, ~30s") rather than a spinner that looks
  broken. Consider a `render.yaml` cron or external ping only if Joey asks.
- Attribution footer on the collection pages: TMDB text+logo, ComicVine
  link, "Powered by BGG" logo (per source terms above), shown once any of
  that source's data is public.

### Login flow (decision 4)

- Add a subtle "Sign in" link in the site footer → sends the visitor into
  the existing Google OAuth flow (`/api/auth/login`). Remove the need to
  know `/admin`.
- When a session exists: footer shows "Admin · Sign out", and the public
  collection page gains inline admin affordances (an "Manage" button
  leading to `/admin/collection`, or inline edit controls — agent's choice,
  keep it simple).
- `/admin` route can remain as the post-login landing. Auth failure UX
  (`?error=access_denied`) unchanged.
- No new auth mechanisms: same single-admin Google allowlist.

## 5. Phasing

| Epic | Scope | Human (Joey) prerequisite |
|---|---|---|
| E2 | Schema migration (all §1 columns), `sources/` package, TMDB search/enrich for films, picker UI, refresh route | TMDB API token |
| E3 | IGDB for games (Twitch token flow) | Twitch dev app (2FA, Client ID/Secret) |
| E4 | ComicVine (volumes) + BGG (XML, throttled) | ComicVine key; BGG app registration |
| E5 | Public showcase page + stats + footer sign-in + attribution | none |
| E6 | Provider-agnostic LLM layer, hybrid recommendation pipeline, Discover tab, `recommendations` table | Gemini API key (free tier) and/or Anthropic key |

E5 has no external dependencies and the most portfolio value — it may be
pulled forward ahead of E3/E4 if desired. Each epic ends with tests
(existing pytest/vitest patterns), a passing `npm run build`, and a
`CLAUDE.md` TODO update.

## 6. Non-goals

- No multi-user accounts, no public write access of any kind.
- No editable sandbox/demo mode.
- No diary/plays table, lists, or social features in this phase.
- No local image caching / object storage.
- No background jobs or scheduled recommendation generation.
- No books type yet (OpenLibrary is keyless and easy if added later).

## Source references

- TMDB: developer.themoviedb.org (getting-started, rate-limiting, FAQ)
- IGDB: api-docs.igdb.com; dev.twitch.tv/console
- ComicVine: comicvine.gamespot.com/api
- BGG: boardgamegeek.com/wiki/page/BGG_XML_API2; /using_the_xml_api
- Gemini structured output & free-tier limits: ai.google.dev
- Anthropic structured outputs & pricing: platform.claude.com/docs
