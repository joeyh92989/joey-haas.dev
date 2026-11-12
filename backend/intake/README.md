# intake

Server half of intake (`docs/planning/2026-11-10-intake-design.md`): one way
in for the shelf and the closet. A *sitting* holds the photos taken in one go
and the entries read from them or typed in.

## Modules

- `budget.py` — the free-tier allowance (spec D3). `UsageRecorder` counts
  every model call per model and **Pacific** day (Google resets the free tier
  at midnight Pacific, not UTC) in `llm_usage`, and marks a model exhausted
  on a per-day 429. `remaining()` is the calls left across models that are
  not exhausted, minus a reserve of `RESERVE` (12) kept for the rest of the
  site; `budget_state()` is what the intake page shows.
- `kinds.py` — the kind registry (spec D11). A `Kind` is data: its area,
  ways in (photo, search, type), metadata source, `FieldSpec`s and a
  `to_row` that turns an entry into the row to write. `register()` adds or
  replaces one; `describe()` is what `GET /api/intake/kinds` serves,
  including `source_state` ("ready", or why the source is not).
- `shelf_kinds.py` — game, movie, comic and board game. `to_row` keeps the
  chosen match's metadata plus the payload's `ItemIn` fields, and records a
  physical copy. Board games are typed only while BGG needs a token.
- `garment_kind.py` — the closet's garment: no source, no details step;
  `to_row` keeps only `GarmentFields` keys.
- `routes.py` — `create_intake_router()`, admin only, under `/api/intake`.
- `reader.py` — `read_next()`, behind `POST /api/intake/sittings/{id}/read-next`.
  One call claims the sitting's oldest `uploaded` shelf photo in one
  statement (`state='reading'` on `FOR UPDATE SKIP LOCKED`, committed
  before the model call, so two readers never take the same photo) and
  reads it with the photo importer's prompt, `parse_detections` and
  `resolve_detections`; each title becomes an entry in its `matching.py` confidence (`exact`, `probable`,
  `check`), `owned` when a trusted match is already an item, or `reading`
  when its source was busy. `retry_reading()` matches `reading` entries
  again from their `payload.detected_*` fields with the same mapping and
  no model call; `read_next` runs it for its sitting first, the nightly
  for every shelf sitting. The reading copy is dropped once read. A budget
  of zero or less returns `waiting` and changes nothing; a model error
  marks only that photo `failed` (Retry requeues it). A photo removed while it was being read is dropped with its read (`idle`, no error). Closet sittings read
  nothing here: their garments are tagged by the Closet's tag queue.
- `commit.py` — `commit_sitting()`, behind `POST /api/intake/sittings/{id}/commit`
  (spec D8). Shelf entries become items through `items.commit_items`, the
  same create path as `/bulk`, so the rows are the photo importer's: write
  rules, duplicates skipped, playthroughs seeded, private, in INSERTs of at
  most `items.BULK_CHUNK` (500). Answers `{added, already_owned,
  issues_added, series_grew, skipped_kept, photos_empty, photos_waiting, refused}`, and the route adds
  `created` (the new items' ids, which Done publishes). By entry state:
  exact, ready and typed are written; owned is counted once per
  title; ignored is cleared; check, probable (unconfirmed) and reading stay in the sitting. A photo
  not yet read (uploaded, reading or failed) is kept too and counted as
  `photos_waiting`. **Comics merge, never drop:** a comic is one row per
  series, so every comic entry (written or owned) resolving to one
  `(external_source, external_id)` joins its `issues_owned` through
  `comics.union`, the one range parser; other fields follow the first
  written entry. A series not yet an item is one new row (`added` 1). A
  series already in `items` gains the sitting's issues through
  `comics_routes.got_issues`, Got it's own rule (union, never lowered; a
  newly owned number leaves `issues_skipped`; a followed or wanted row
  becomes owned, To read), and `issues_added` counts the issues it gained; a
  shelf format set in Details (the first entry that has one) is saved on that
  existing row too, and not counted as an issue gained;
  collected `editions` set in Details (for a trades or omnibus row) go onto a
  new series' row from the first entry that has them, as the shelf format
  does; a series already on the shelf keeps its own editions untouched (edit
  them on its item page), and an edition the write rules refuse is a
  refusal on field `editions`;
  a series that gains nothing is `already_owned`. Each such series is also
  reported on its own in `series_grew` (`SeriesGrew`): `{item_id, title,
  is_public, cover_url, before: {owned, released}, ongoing, added, already, after_owned_text}`,
  where `added` and `already` split the sitting's issues of it against
  what it held before (loose or in an edition), for Done's "Series that
  grew". An issue already inside an edition is held, so it is neither
  gained nor written again as a loose single; a refused commit reports
  `series_grew: []`. Games, movies and board
  games keep the old rule: one row per key, later photos dropped. The
  reader does not read an issue number off a photo (the importer's schema
  has no such field), so issues come from Details' Issues owned.
  The sitting is deleted (photos and all) only once
  nothing is kept. A commit that would change nothing is a 409 in intake's
  words: `NOTHING_TO_ADD` when only entries to check remain,
  `PHOTOS_STILL_WAITING` when no entry is left but photos still wait.
  `commit_one()`, behind `POST /api/intake/add`, is the add bar's single
  add: a transient entry (a chosen result, or none when kept as typed)
  through the same row builders and `commit_items`, so it writes the row a
  sitting would; a typed piece becomes a manual garment as `POST
  /api/closet/garments` makes one. 201 with `created` (or `garment_id`),
  200 with `already_owned: 1` for a title already on the shelf, 422 with
  `refused` and the first message as `detail`, writing nothing. A comic
  series already on the shelf follows the sitting's rule: the typed issues
  go through `got_issues`, and the answer is 200 with `issues_added: N`
  (the add bar says "Added N issues to <title>"); a series gaining nothing
  is `already_owned: 1`, `issues_added: 0`. Every answer carries
  `issues_added` and `series_grew` (that series' report, as a sitting's).
  Before any commit, `series_on_shelf_for()` marks each comic entry whose
  series is already an item (by the commit's own key) with that series'
  run as it stands: every route that answers with entries (the sitting,
  read-next, add entry, PATCH entry) carries it as `on_shelf: {item_id,
  title, cover_url, owned, owned_text, released, ongoing}`, else null, so
  Check can say what an entry adds before it is written.

- `search.py` — `search_area()`, behind `GET /api/intake/search?area=&query=`
  (spec D5), the add bar's search. One query goes to the source of every
  kind in the area at once (`asyncio.gather`), each under its own
  `SEARCH_TIMEOUT` (8 s), so a slow Comic Vine never holds up IGDB. Answers
  `{results, sources}`: each result carries its `kind` and, when its
  `(external_source, external_id)` is already an item, `owned_item_id`;
  each source is `ok`, `not_configured` (with `describe()`'s reason),
  `busy` (rate-limited, down or past the timeout: not a miss) or `failed`.
  The Closet has no source, so its answer is empty both ways.

- `nightly.py` — `run_nightly()`, behind `POST /api/intake/jobs/nightly`
  (spec D4, job token). First `expire_sittings()` deletes sittings nobody
  has touched for `EXPIRE_AFTER` (30 days), photos and entries with them;
  "touched" is the newest `updated_at` of the sitting, its photos or its
  entries. `reset_stale_reading()` puts photos claimed `reading`
  more than `STALE_READING` (10 minutes, by `updated_at`) ago back to
  `uploaded`, so a crashed reader never strands one. Then it retries `reading` entries (`retry_reading()`, no model
  call), then reads waiting shelf photos, oldest first across
  sittings, one `read_next` at a time, re-reading the budget before each,
  until nothing waits, the budget is down to the reserve or 480 seconds
  (`DEADLINE_SECONDS`, inside the workflow's `curl -m 600`) have passed
  with no new photo started (`waiting`), a
  read fails (`stopped`) or no model is configured (`failed`). The summary
  `{at, state, ok, expired, photos_expired, read, waiting, note}` is
  answered and stored as `intake_settings["nightly.last_run"]`, which
  `GET /api/intake/status` serves to the Jobs page's Intake row
  (`frontend/src/lib/nightly.js`).

## Routes

All under `/api/intake`, admin only (`items.require_admin`).

| Route | What it does |
|---|---|
| `GET /kinds` | The kind registry, with each source's state |
| `POST /sittings`, `GET /sittings?area=`, `GET/PATCH/DELETE /sittings/{id}` | Sittings; the list carries `photos`, `photos_waiting` (uploaded or reading) and `entries` (a count per state) for the Add page's meter |
| `POST /sittings/{id}/photos`, `DELETE /sittings/{id}/photos/{photo_id}`, `POST /photos/{id}/retry`, `GET /photos/{id}/image` | Photos. The delete drops the photo and every entry read from it (a closet photo takes its piece too, tagged or not); 409 `SITTING_GONE` on an added or discarded sitting, 409 "This photo is being read; try again in a moment." while the photo is `reading` in the database (the row is locked for the check), 404 for a photo of another sitting; it also touches the sitting's `updated_at`. A single entry is removed by `PATCH` `state: ignored` with no `payload.unticked` (an ignored entry with `unticked` is the skim grid's untick and stays visible) |
| `POST /sittings/{id}/read-next` | Read one waiting photo (the page drives it) |
| `POST /sittings/{id}/entries`, `PATCH /entries/{id}` | Typed and chosen entries |
| `GET /search?area=&query=` | The add bar's search across the area's sources (`search.py`) |
| `POST /add` | One thing from the add bar, through the commit service |
| `POST /entries/{id}/tag-again` | Clothes · Check's Tag again: a piece the tag queue gave up on goes back in it (attempts reset); 409 for a piece tagged or saved by hand |
| `POST /sittings/{id}/commit` | Write the sitting to the collection |
| `GET /counts`, `GET /budget` | Entries to check or confirm (`check` and `probable`) per area; today's free reads |
| `POST /jobs/nightly` | The nightly step; the **only** intake route the job token opens (`items.JOB_ROUTES`) |
| `GET /status` | The nightly's last run, null before the first |

## Who reads

While Shoot is open the browser drives `read-next` one photo at a time:
a request per photo fits the free tier's slow reads and isolates a
failure. The nightly is the only reader after the tab closes. Its
workflow step (`.github/workflows/nightly.yml`, `call intake 600`) runs
after the Closet's outfit plans and before the registry, so it comes
before Discover, the spot finder and the Closet opinion, which the reserve
of 12 calls is kept for. A spent budget is an ok night, not a failure:
the photos wait for tomorrow.

## Why the recorder has its own sessions

A call is recorded before its request is sent, in a session the recorder
opens and commits itself. A request whose own transaction rolls back (a
reader failure, a 422) still spent the call, so the count must survive it.
Recording never raises: a failed write is logged as a warning and the call
goes ahead, because the budget is advice, not a lock.

## Usage

```python
from intake.budget import UsageRecorder, budget_state

recorder = UsageRecorder(session_factory)  # one per process (main.py)
provider = build_provider(config, recorder)  # Gemini records each attempt
state = await budget_state(session, config)  # {"remaining", "enforced", "resets_at"}
outcome = await read_next(
    session, sitting_id, provider, state["remaining"], registry=registry
)  # status: read/empty/failed/waiting/idle
done = await commit_sitting(session, sitting_id, today=today)  # caller commits
summary = await run_nightly(session, config, provider_factory, registry)
```

```bash
# The nightly step by hand (JOB_TOKEN from the environment):
curl -sS -X POST -H "Authorization: Bearer $JOB_TOKEN" \
  https://api.joey-haas.dev/api/intake/jobs/nightly
```

## Configuration

Nothing of its own. The reader needs a model (`LLM_PROVIDER`, default
`gemini`, and its key, e.g. `GEMINI_API_KEY`); without one a read answers
502 and the nightly records `failed`. The budget is enforced only on
Gemini, and counts `FREE_TIER_DAILY_REQUESTS` for each model in
`llm.GEMINI_MODELS` (six since the fallback chain); a read that Gemini
cannot answer goes to Claude Haiku only when the paid fallback is switched
on (`LLM_PAID_FALLBACK=true` with `ANTHROPIC_API_KEY`; off by default). The nightly needs `JOB_TOKEN` on the API and in the workflow's
secrets, as every nightly step does. Tables: `intake_sittings`,
`intake_photos`, `intake_entries`, `llm_usage` and `intake_settings`
(migration 0015).

## Committing

All or nothing: every row is validated (`ItemIn`, then `items._write_fields`)
before anything is written, so a refusal names its entry and, when one field
alone is at fault, that field. A refused commit answers 422 with the usual
shape plus `detail`, and writes nothing. The sitting row is locked
(`FOR UPDATE`), so a second device committing at the same moment waits and
then gets a 409 in intake's own words (`SITTING_GONE`); a commit that would
change nothing, every entry left still to check, is a 409 too
(`NOTHING_TO_ADD`). The reader's `chosen` is the importer's candidate, whose
cover is `thumbnail_url`: `shelf_kinds.to_row` maps it to `cover_url`.
Garments from photos are already real and are only counted; a typed garment
is created as `POST /api/closet/garments` creates one. After the commit,
covers and creators are filled in as `/bulk` does (`items._enrich`, best
effort).

## Adding a kind

Write a `Kind`, `register()` it in a module `routes.py` imports, and it is
served. `kind` is text in the database, so no migration is needed. Field
keys must be the row's own column names (`platform_id`, not `platform`),
because `to_row` filters the payload by them.

## Gotchas

- Only Gemini is enforced (`enforced` is false for any other provider);
  other providers are built without a recorder.
- The nightly and an open Shoot page can read at the same moment; each
  takes the oldest waiting photo, so the two may read the same one twice.
  At night nobody is shooting, so this is accepted rather than locked.
- Closet sittings are never read here: their garments are real on upload
  and tagged by the Closet's tag queue. They do expire.
- The free-tier ceiling is `llm.FREE_TIER_DAILY_REQUESTS` per model. If
  Google changes it, change it there.
