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
  skipped_kept, photos_empty, refused}`. By entry state: exact, probable,
  ready and typed are written; owned is counted once per title; ignored is
  cleared; check and reading stay in the sitting. The sitting is deleted
  (photos and all) once nothing is kept.

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
```

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
- The free-tier ceiling is `llm.FREE_TIER_DAILY_REQUESTS` per model. If
  Google changes it, change it there.
