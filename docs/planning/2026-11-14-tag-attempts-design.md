---
status: done
kind: architectural-lite (additive column)
mode: auto
---

# Cap retries for comics the tag job can't tag

Issue #232.

## Problem

The nightly comic tag job (`POST /api/comics/tags/generate`) leaves a series untagged when the model's answer is unusable, so it is picked up again every night, costing one free-tier call each time, forever.

## Solution

A strike count per series: `items.tag_attempts`, integer NOT NULL DEFAULT 0 (migration `0019`, additive). Each answer that arrives but is unusable adds one. A series at 3 is left out of the queue and reported as given up on.

## Decisions (my calls)

1. **A column, not a settings table.** One integer on the row it describes; additive; the downgrade drops only that column.
2. **Only an unusable answer is a strike.** A model or quota error stops the run (existing behaviour) and never counts, nor does a skipped series (budget, time, no model).
3. **The strike is written under the row lock**, in the same re-read that checks `tags_edited`, so an edit made during the call wins and its count is not bumped.
4. **Cleared** when the owner saves tags (PATCH tags), and when a Comic Vine refresh (`_apply_detail`) changes the description. The comics-only snapshot refresh keeps the description, so it leaves the count alone.
5. **Summary:** existing keys unchanged. New `gave_up` (list of `{id, title}` given up on in this run's queue) and `gave_up_total` is not needed; the queue excludes given-up rows, so `gave_up` is the series that *reached* 3 this run. The Jobs row reads a live count of all given-up series (public, untagged, unedited, `tag_attempts >= 3`) from `GET /api/comics/status`, so the owner still sees it on later nights. The note is "N series given up on after 3 unusable answers"; the state stays `ok`.
6. `tag_attempts` is never public: not on `PublicItemOut` or `PublicComicRow`, pinned in `NEVER_PUBLIC`. It is not read by the public body, so the `/api/public/next` fingerprint is unaffected by design (the fingerprint digests row xmin, and a strike is a row update on a private column only for series with no tags; accepted, a stale-cache refresh at worst).
7. No frontend change; no changelog entry (job only).

## Tasks

1. Migration `0019`, model column, schema-check head bump.
2. Job: skip at 3, count strikes, `gave_up` in the summary.
3. Clear on PATCH tags and on a changed description.
4. Jobs row note from the status route.
5. Forbidden-key pin, CLAUDE.md.

## Ship notes

Migration `0019` is additive (one column with a default). Apply it to Neon from the PR's worktree **before** merging; older code ignores the column.
