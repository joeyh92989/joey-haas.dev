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
  One call reads the sitting's oldest `uploaded` shelf photo with the photo
  importer's prompt, `parse_detections` and `resolve_detections`; each title
  becomes an entry in its `matching.py` confidence (`exact`, `probable`,
  `check`), `owned` when a trusted match is already an item, or `reading`
  when its source was busy. The reading copy is dropped once read. A budget
  of zero or less returns `waiting` and changes nothing; a model error
  marks only that photo `failed` (Retry requeues it). Closet sittings read
  nothing here: their garments are tagged by the Closet's tag queue.
- `commit.py` — `commit_sitting()`, behind `POST /api/intake/sittings/{id}/commit`
  (spec D8). Shelf entries become items through `items.commit_items`, the
  same create path as `/bulk`, so the rows are the photo importer's: write
  rules, duplicates skipped, playthroughs seeded, private, in INSERTs of at
  most `items.BULK_CHUNK` (500). Answers `{added, already_owned,
  skipped_kept, photos_empty, photos_waiting, refused}`. By entry state:
  exact, probable, ready and typed are written; owned is counted once per
  title; ignored is cleared; check and reading stay in the sitting. A photo
  not yet read (uploaded, reading or failed) is kept too and counted as
  `photos_waiting`. The sitting is deleted (photos and all) only once
  nothing is kept. A commit that would change nothing is a 409 in intake's
  words: `NOTHING_TO_ADD` when only entries to check remain,
  `PHOTOS_STILL_WAITING` when no entry is left but photos still wait.

- `nightly.py` — `run_nightly()`, behind `POST /api/intake/jobs/nightly`
  (spec D4, job token). First `expire_sittings()` deletes sittings nobody
  has touched for `EXPIRE_AFTER` (30 days), photos and entries with them;
  "touched" is the newest `updated_at` of the sitting, its photos or its
  entries. Then it reads waiting shelf photos, oldest first across
  sittings, one `read_next` at a time, re-reading the budget before each,
  until nothing waits, the budget is down to the reserve (`waiting`), a
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
| `POST /sittings`, `GET /sittings?area=`, `GET/PATCH/DELETE /sittings/{id}` | Sittings |
| `POST /sittings/{id}/photos`, `POST /photos/{id}/retry`, `GET /photos/{id}/image` | Photos |
| `POST /sittings/{id}/read-next` | Read one waiting photo (the page drives it) |
| `POST /sittings/{id}/entries`, `PATCH /entries/{id}` | Typed and chosen entries |
| `POST /sittings/{id}/commit` | Write the sitting to the collection |
| `GET /counts`, `GET /budget` | Entries to check per area; today's free reads |
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
Gemini. The nightly needs `JOB_TOKEN` on the API and in the workflow's
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
