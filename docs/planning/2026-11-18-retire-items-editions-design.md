---
status: planned
kind: architectural
mode: auto
---

# Retire `items.editions`

## Problem

The book-first epic (#323) moved every book into `comic_volumes`. `items.editions` (JSONB) is
now a frozen mirror kept alive by a compat shim, and some readers and writers still use it. Two
sources of truth is a bug waiting to happen, and the column is dead weight. Goal: nothing reads
or writes it, then drop it.

## Scope

In: comic `items.editions` only. Out: game physical editions (`physical_routes.py`,
`radar_load.py`, `physical_sources/`, `spine.js`, `AdminCatalogue.jsx`), which only share the word.

## Solution: five PRs, each deployable alone

1. **Readers off the column (backend).** `row_run`, `series_from_row`, `owned_set` and
   `mark_plan` callers move to `held_ranges` / `load_holds`: intake `commit.py` (`_run_of`,
   `SeriesGrew`), `picker_routes.py`, `public_comics.py` (series run), `public_issues.py`,
   `comics_routes.py` (`followed_only`, `_state` fallback), the two scripts. Public JSON shapes
   do not change. Tests pin the outputs.
2. **Public API off `editions`.** `public_comics.py` and `public_issues.py` build the public
   `editions` fields from owned volumes (same names, so the frontend keeps working), then the
   frontend (`Item.jsx`, `CoverWall`, `coverWall.js`, `comicRun.js`) moves to `volumes` if
   cheap, or keeps the fields.
3. **Retire the writers.** Intake's Details `editions` path becomes volume creation through
   `volume_plan`, not just a deletion. Remove `PUT /{id}/editions/{slug}/link`, `editions` on
   `ItemIn`/`ItemPatch`/`ItemOut`, `ItemForm` `EditionRows`, `comicPayload`'s key. A non-empty
   `editions` in a body is a 422 first, to catch any writer left.
4. **Retire the shim.** Delete `sync_volumes_from_editions` and its calls,
   `_drop_edition_entry`, `editions_added`, `series_new.editions`, and their tests.
5. **Drop the column. Destructive, always-stop.** New migration after 0024 drops
   `items.editions`; touches `models.py`, `schema_check`, `test_migrations.py` head pin, the
   audit script and `backend/CLAUDE.md`. Needs Joey's OK, a restore point and the Neon
   rehearsal.

## Decisions and tradeoffs (my call)

- Keep public JSON field names through PRs 1 to 4 so no PR needs a coordinated frontend
  change. Cost: a rename later if wanted.
- Readers move before writers, so at every step the shim still holds the mirror and a rollback
  is a plain revert.
- The 422 in PR 3 trades a possible visible error for finding hidden writers while the column
  still exists and nothing is lost.

## Smoke check

Deploy API smoke (130 checks) after each merge; the comic public pages and `/api/public/stats`
unchanged (`books_owned` 7, `issues_owned` 31, `issues_read` 20 at the time of writing).

## Open questions

None blocking. Whether ItemOut's `editions` has an admin consumer other than `ItemForm` is
unverified; PR 3 checks.
