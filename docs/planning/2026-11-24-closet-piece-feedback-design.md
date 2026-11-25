---
status: planned
kind: architectural (new table) + feature
mode: auto
---

# Closet picker: per-piece feedback, storage, exclusions and a re-plan that changes the piece (#551)

Story S7 of epic #539. Parent plan: `2026-11-20-closet-picker-week-design.md`
("Garment-level feedback storage"). The tile UI is S8 (#552); this story is the
API, the exclusion, the prompt and the Closet page's suggestion. The repo is
public: no garment names here, in tests or in issues.

## Problem

Not this is per outfit: it stores an `outfits` row with `not_this` and its
`outfit_garments`, and `declined_today` (`closet_today_routes.py:252-272`) blocks
that top + bottom + shoes key for the day. The same top came back with different
trousers. The prompt gets "Turned down lately: too casual (2)" from
`summarise_not_this` (`closet_rank.py:108-118`) with no garment named, from the
five newest reasons on any day.

## Scope

In: table `garment_feedback` (migration 0033, additive); kinds `not_today`,
`never_for_occasion`, `too_cold`, `too_warm`; add, remove and list endpoints; a
hard exclusion in `closet.candidates` (and `slot_fallback`, so the Swap sheet
agrees); `/plan` re-plans and the nightly plan job respect it; the ranking prompt
names the turned-down piece and the reason; the Closet page counts pieces turned
down as too cold or too warm, as a filter beside "needs details".

Out: the Today tile buttons (S8), outfit-level Not this (unchanged), any edit to a
piece's tags from feedback.

## Architecture decision

Options:
- **A. A new table `garment_feedback`** (garment, kind, occasion nullable, day
  nullable). One row per piece and scope.
- **B. Columns on `garments`** (`not_today_on`, `never_for` array). Cannot hold a
  piece turned down for several occasions plus a day without arrays and rewrites,
  and loses the history the Closet suggestion needs.
- **C. Reuse `outfits`/`outfit_garments`** with a one-piece outfit row and
  `not_this`. `declined_today` keys on whole garment sets, so a one-piece key would
  not exclude the piece from other combinations without changing what an outfit
  row means.

Chosen: **A**, because it holds every scope the issue names, keeps outfit rows
meaning outfits, and reads cheaply (a handful of rows per day).
Gives up: one more table and migration; a second place that says "turned down"
beside `outfits.not_this`.
Hard to undo: the table's shape once rows exist (additive now; a later drop would
be destructive and an always-stop).
Sources: `backend/closet_today_routes.py` (`replan` :714-776, `declined_today`,
`recent_not_this`, `make_plan`), `backend/closet.py` (`Request` :262-272,
`slot_pool` :370-405, `candidates` :450-521, `slot_fallback` :524-534),
`backend/closet_rank.py` (`build_prompt` :168-232, `summarise_not_this`),
`backend/models.py` (`Outfit`, `OutfitPlan`), parent plan's answer on feedback
storage. No platform or library question: a plain Postgres table through the
repo's SQLAlchemy models and Alembic, as every closet table.

## Solution

```mermaid
flowchart LR
  UI[S8 tiles / API client] -->|POST /api/closet/feedback| F[(garment_feedback)]
  F --> X[excluded ids for day + occasion]
  X --> C[closet.candidates / slot_fallback<br/>pool drops excluded, never relaxed]
  F --> P[rank prompt: Turned down: name (reason)]
  F --> S[GET /api/closet/garments: temperature counts]
  C --> R[POST /plan re-plan · nightly plan job]
```

1. **Table** `garment_feedback`: `id uuid pk`, `garment_id` FK `garments.id ON
   DELETE CASCADE`, `kind` enum (`not_today`, `never_for_occasion`, `too_cold`,
   `too_warm`), `occasion varchar(20) NULL`, `day date NULL`, `created_at`.
   Checks: `never_for_occasion` has an occasion and no day; the other kinds have a
   day. A unique index on `(garment_id, kind, coalesce(occasion,''),
   coalesce(day,'0001-01-01'))` makes a repeat add a no-op. Index on `day`.
2. **Scope.** `not_today`, `too_cold`, `too_warm`: that day, every occasion.
   `never_for_occasion`: that occasion, every day, until removed. The day is the
   owner's day (`owner_today()`, `OWNER_TZ`) unless the body names one (the nightly
   plans tomorrow; S13 will plan ahead).
3. **Endpoints** (admin router, `closet_today_routes.py`):
   - `POST /api/closet/feedback` `{garment_id, kind, occasion?, day?}` → the row
     (201; 200 for a repeat). 404 for an unknown or non-active garment; 422 for a
     bad kind or scope.
   - `DELETE /api/closet/feedback/{id}` → 204.
   - `GET /api/closet/feedback?day=` → the rows in force that day (day-scoped rows
     for it plus every `never_for_occasion`).
4. **Exclusion.** `Request` gains `excluded: frozenset[UUID]`. `slot_pool`'s
   `pool()` drops excluded ids outside the relaxation loop (like the repeat rule:
   never relaxed). A slot left with nothing says so through the existing empty
   path. **A lock wins** (my call): the owner's lock is the newer, more explicit
   choice; a lock on an excluded piece keeps it, and the plan notes nothing new.
   The transient `extra` piece (Match this) is not a garment and is unaffected.
5. **Re-plan.** `make_plan` loads the exclusions for its day and occasion and
   passes them in, so `POST /plan` (with or without Not this), `/candidates` and
   the nightly plan job all agree. The stored plan for that day and occasion is
   not rewritten by adding feedback; the client re-plans (S8 calls `POST /plan`).
   A re-plan after feedback on a piece never returns it.
6. **Prompt.** `build_prompt` gains a line before "Slots to fill":
   "Turned down for this day: <name> (too warm); never for <occasion>: <name>."
   Names come from the garment's `name` (falling back to subtype and colour, as
   `_describe` does). At most 8 entries, newest first. Excluded pieces are not
   in the candidate list anyway; the line tells the model why, so "too warm"
   steers the rest of the outfit cooler.
7. **Closet suggestion.** `GET /api/closet/garments` adds `temperature_flags:
   [{garment_id, too_cold, too_warm, last_day}]` over the last 60 days. The Closet
   page shows a filter button beside "needs details", "Check warmth: N", in the
   same markup, that filters the grid to those pieces; each card shows nothing new.
   No tag is ever edited by feedback.

## Decisions and tradeoffs

- **Lock wins over feedback** (above). Alternative: feedback drops the lock. That
  would make one tap undo another without saying so.
- **Day-scoped kinds cover every occasion** that day, as the issue says ("apply
  to that day"). An office-only "not today" is `never_for_occasion` or a second tap.
- **Too cold / too warm also exclude for the day**, as the issue says, and never
  edit warmth: the owner decides from the Closet suggestion.
- **Outfit-level Not this stays** as it is; `recent_not_this` is unchanged.
- **Closet button, no mockup** (my call): it copies the existing needs-details
  button and filter exactly. The Today tiles, which are new UI, get their design
  step in S8.

## Smoke check

None changes: admin only, no public route or header.

## Plan

Model: Sonnet.

### Task 1: table and model
- `backend/migrations/versions/0033_garment_feedback.py` (style of
  `0016_add_comic_issues.py`), `backend/models.py` (`GarmentFeedback`,
  `GarmentFeedbackKind`), `tests/test_migrations.py`, `tests/test_schema_check.py`.
- Tests: the cycle; the checks reject a day-less `not_today` and an
  occasion-less `never_for_occasion`; cascade on garment delete.

### Task 2: endpoints
- `closet_today_routes.py`, `closet_schemas.py`, `tests/test_closet_feedback.py`.
- Tests per kind: add (201), repeat (200, one row), remove (204), list for a
  day; 404 unknown or non-active garment; 422 bad kind, `never_for_occasion`
  without an occasion, unknown occasion. Admin only (401 signed out).

### Task 3: exclusion and re-plan
- `closet.py` (`Request.excluded`, `slot_pool`), `closet_today_routes.py`
  (`make_plan`, `/candidates`, the nightly plan job), tests in `test_closet.py`
  and `test_closet_today.py`.
- Tests: an excluded top never appears in candidates or the Swap fallback, even
  when the slot relaxes; `never_for_occasion` applies to that occasion only;
  `not_today` to that day only; `POST /plan` after feedback returns a plan without
  the piece (each kind); the nightly job plans tomorrow without a piece turned
  down for tomorrow; a lock on an excluded piece keeps it.

### Task 4: prompt
- `closet_rank.py` (`build_prompt`), `tests/test_closet_rank.py`.
- Tests: the line names the piece and reason; capped at 8; absent when there is
  no feedback; the answer format is unchanged.

### Task 5: Closet suggestion
- `closet_routes.py` (garment list), `closet_schemas.py`,
  `frontend/src/pages/AdminCloset.jsx`, `frontend/src/lib/closet.js`,
  `frontend/src/content/adminCopy.js`, tests (`AdminCloset.test.jsx`,
  `closet.test.js`, backend list test).
- Tests: counts over 60 days; the button shows with N > 0 and filters the grid;
  hidden at 0.

### Task 6: docs
- `backend/CLAUDE.md` Closet section; a changelog "Behind the scenes" bullet
  under `## 2026-11-24`; a `decision` entry in `docs/learnings.md`.

### Ship notes
Migration 0033 additive (a new table). `/security-review` runs (new endpoints and
data access).
