---
status: planned
kind: ui + feature
mode: auto
---

# Backfill past outings by paste (#350)

Story 11 of epic #339. Brief: `docs/planning/2026-11-15-places-outings-brief.md`, section 2. Builds on #342 (paste way, `backend/intake/place_paste.py`) and #344 (`visits` grown into outings: `precision`, `title`, `verdict`).

## Problem

Past outings live in memory; entering them one at a time through Log an outing will not happen. Paste lines of `place, date` and turn each into an outing through the same Check step the place paste uses.

## Scope

In: a second reading of the places paste ("Past outings") that splits each line into a place and a date, reads the date as a day, month or year, flags unreadable dates and already-logged outings, and writes outings (plus any new private places) in one all-or-nothing commit.

Out: Takeout import, photos, any model call, verdict/note/kid-along at paste time (edit later in History), editing existing outings.

## Mockup

`docs/planning/mockups/2026-11-19-backfill-outings/` (gitignored). **Chosen: `a-mode-switch.html`** (a "The lines are: Places / Past outings" switch inside Paste a list, same panel, same grouped Check list, a date chip on each row, Fix date opens an in-row form with a live "Read as" line). Rejected: `b-backfill-table.html` (a third way in with an edit-everything table: a second review pattern on the page, Check rows scattered among ready ones, about 230px per phone row). Acceptance: matches `a-mode-switch.html` at 400px and 1280px, light and dark.

Groups in the list: To check, Ready, Not looked up yet, Already logged, Left out. The Add outings button is disabled while any line is in Check or being looked up, and the words beside it say what holds it. Already logged defaults to skipped; "Add anyway" moves it to Ready, "Skip" puts it back. Copy: success line "Added N outings, M new places."; a refused commit says how many rows need fixing and that nothing was written.

## Solution

```mermaid
flowchart LR
  A[paste text + mode outings + city] --> B[split each line: place, date]
  B --> C[entry per line: place state + outing{date_text, visited_on, precision, skip}]
  C --> D[resolve one entry at a time: Nominatim, 1 req/s, as #342]
  C --> E[Check: unread date, fix via entry PATCH]
  D --> F[owned? flag already logged]
  E --> G[commit_sitting, all or nothing]
  F --> G
  G --> H[write_places then one Visit per outing entry; any refusal: 422, rollback]
```

No new route: the paste route takes two optional body fields and the entry `PATCH` takes the outing fields, so the `/api/spots` route-count pin (35) is untouched.

### Backend

- `backend/intake/outing_dates.py` (new, pure, no I/O): `read_date(text, today) -> DateRead | None` where `DateRead` carries `visited_on` (period start), `precision` (`day|month|year`) and a `label` ("June 2024"). Accepts ISO `YYYY-MM-DD`, `YYYY-MM`, `YYYY`, and English month names (full or three-letter, optional trailing dot): "June 14, 2024", "14 June 2024", "Jun 14 2024", "June 2024", "2023". Everything else is unread, including `6/7/24` and "last summer". Rejects a day more than one day after `today` (same bound as `build_visit` in `spots_routes.py`) and a year before 1950. A month reads as its first day, a year as Jan 1, matching `_period_start` in `spots_routes.py`.
- `split_outing_line(line, today) -> (place_text, date_text | None, DateRead | None)`: the date is what follows the **leftmost** comma whose remainder reads as a date ("Coors Field, June 14, 2024" and "Smith, Jones Park, 2023" both split right). No such comma: place is the text before the last comma (or the whole line) and the date is unread. Pure; tested with a frozen `today`.
- `place_paste.py`: `PasteIn` gains `outings: bool = False` and `city: str | None`. In outings mode each line is split first, the place text goes through the existing `entry_for_line`/`read_line`, and the payload gets `outing = {"date_text", "visited_on" (ISO or null), "precision" or null, "skip": false}` and the chosen `city` (validated by `clean_fields`, private, never public). Duplicate keys in a sitting are place plus date text, so the same place on two dates makes two entries. Everything else (caps, 300 entries, locking, no network on paste) is unchanged.
- Duplicates: a helper flags an entry that has an `owned_spot_id` and a stored outing with the same `visited_on` and `precision` on that spot: `outing.duplicate_of = <visit id>` and `outing.skip = true`. It runs on paste (after `flag_owned`) and wherever an entry becomes owned (resolve, pick, date fix). One query per call, not one per entry. A same-period match is an exact period match (same start and precision); a day inside a logged month is not a duplicate.
- Entry `PATCH` (`routes.py`): accept `outing_date_text` (re-read server side with `read_date`, storing `visited_on`/`precision` or nulls) and `outing_skip` (bool). Nothing else from the client is trusted; the entry kind must be a place entry in a sitting that has outings.
- Commit (`commit.py`): `write_places` also returns a map of entry id to spot id (new or owned). After it, in the same transaction, each READY/OWNED entry carrying `outing` with `skip` false writes one `Visit` through `build_visit` (title none, verdict null, kid_along null, note none, precision from the payload). An entry with an outing but no readable date is a `Refusal(entry_id, "date", ...)`; any refusal rolls back everything and answers 422 with the existing `refused` shape. Entries in CHECK/PROBABLE/READING stay "kept" and are skipped as today.
- Responses carry `outing` (date label, precision, skip, duplicate flag) on entries and `outings_new` (a count) on the commit answer. Admin only; no public body changes.

### Geocoding

The issue says "geocoded and created on commit". The place paste already geocodes **per entry at resolve** (one search per request, one at a time, 1 s throttle, the Nominatim `USER_AGENT`), and the commit writes only from a stored hit. Adding a network call to the commit path would break the rule that no external call is added to a request path and would make an all-or-nothing commit slow and flaky. **Ruling:** backfill resolves exactly as #342 does; the new place is **created on commit**, private, in the chosen city. "Rate limit and chunking follow P1.3" is satisfied by reusing that resolve loop unchanged. Cost if wrong: Joey wanted lookups inside commit; that is a larger story.

### Frontend

- `PastePlaces.jsx`: a two-option switch, "Places" / "Past outings", and in outings mode a city select (default Denver, the cities `PlaceFields` already offers). The mode and city travel in the paste request; changing the mode with entries on the page is disabled (finish or clear first).
- `pasteModel.js`: the group order and the Add button's held state (any To check or Not looked up yet entry holds it), the date chip text (label over "day|month|year", dashed "Date not read"), and the cap constants unchanged.
- A Fix date form in the row: a text field, a live "Read as: June 2024, month" line (a client-side mirror of the server rule is **not** written: the line shows what the server last read, and Save sends `outing_date_text` through the entry PATCH; the preview before save is omitted if it needs a mirror, see Open questions).
- Commit calls the existing commit with the outings flag; success line "Added N outings, M new places."; a 422 shows how many rows need fixing and that nothing was written.
- Styles use `--space-*` tokens (or a `/* space-exception: reason */`), 44px targets, shape plus word for state, no overflow at 400px (`min-width:0; max-width:100%; overflow-wrap`), light and dark.

## Decisions (my call, auto mode)

1. Plug into the place entry (option a), not a new kind or area: the paste route, Check step, resolve loop and commit already exist for place entries; one kind keeps `kinds_for(PLACES)` as it is.
2. Geocode at resolve, create on commit (see Geocoding).
3. Date rule: leftmost comma whose remainder reads as a date; numeric `6/7/24` and free text are unread rather than guessed (US/EU ambiguity).
4. Duplicate = same spot, same period start and same precision; already logged defaults to skipped and never blocks commit.
5. No verdict, note or kid-along at paste time; History edits come later.
6. Mode switch and city are client choices sent with the paste; the server stores the outing on each entry, so a reload keeps them.
7. No dependency added; date reading is stdlib (`calendar`, `datetime`, `re`).
8. No changelog entry (admin only).

## Tasks

### Task 1: Date reading, outings paste, duplicates and commit (backend)

Model: sonnet. Files: `backend/intake/outing_dates.py` (new), `backend/intake/place_paste.py`, `backend/intake/routes.py`, `backend/intake/commit.py`, `backend/intake/schemas.py`, `backend/intake/README.md`, `backend/CLAUDE.md`, tests `backend/tests/test_outing_dates.py` (new), `test_place_paste.py`, `test_place_paste_commit.py`, `test_public_outputs.py`.

Acceptance:
- `read_date` reads day, month and year forms listed above and returns None for `6/7/24`, "last summer", a future day, a year before 1950, a month 13, 31 April; a leap day reads on a leap year only. Tests freeze `today`.
- `split_outing_line` handles "Coors Field, June 14, 2024", "Smith, Jones Park, 2023", "Union Station" (no date), "Red Rocks, last summer" (unread), and a trailing comma.
- Paste with `outings: true` makes one entry per line with `outing` in the payload, the chosen city, private; an unread date stays an entry with `visited_on` null; the same place on two dates makes two entries; paste with the default makes entries exactly as before (existing tests unchanged).
- A line for an owned place with an existing outing of the same period is flagged `duplicate_of` and `skip` true; a day inside a logged month is not; the flag is set in one query.
- Entry PATCH `outing_date_text` re-reads server side; `outing_skip` toggles; a client cannot set `visited_on` or `precision` directly (test that such keys are ignored or 422).
- Commit writes one Visit per non-skipped READY/OWNED outing entry with the right `visited_on` and `precision` and a new private spot in the chosen city for an unsaved place, all in one transaction; one refused row (unread date, bad city, any `write_places` refusal) answers 422 and **nothing** is written (test that spots and visits counts are unchanged; show it failing without the rollback guard); skipped entries write nothing; CHECK entries are left out as today.
- No new route is added: `test_recs_response_models.py` `seen == 35` still holds. `test_public_outputs.py` gains a case: after a backfill commit, public spot and visit-adjacent bodies carry no outing field and no private place.
- Full backend `pytest`, `ruff check`, `ruff format --check` pass. No migration.

### Task 2: Past outings mode on the Add a place page (frontend)

Model: sonnet. Files: `frontend/src/components/places/PastePlaces.jsx`, `pasteModel.js`, `PlaceResultRow.jsx` (or a new `OutingRow.jsx` if the row logic would sprawl), `frontend/src/lib/intake.js`, `frontend/src/pages/PlacesAdd.jsx`, `frontend/src/index.css`, tests next to each, `docs/design-system.md` (only if a new pattern appears), `frontend/CLAUDE.md`, root `CLAUDE.md` (epic line).

Acceptance:
- Matches `a-mode-switch.html` at 400px and 1280px, light and dark: the switch, city select, groups (To check, Ready, Not looked up yet, Already logged, Left out), date chips, Fix date form.
- Pasting in outings mode sends `outings: true` and the city; entries render a date chip with label and precision, or a dashed "Date not read" and sit under To check.
- Fix date saves through the entry PATCH and the row updates from the server's reply; Add anyway / Skip toggle `outing_skip`.
- Add outings is disabled while any line is in To check or Not looked up yet, with the words beside it naming what holds it; a 422 shows the count and "nothing was written"; success shows "Added N outings, M new places."
- Resolve runs one entry at a time exactly as the place paste does; changing mode with entries on the page is disabled.
- Test fakes mirror the server (UUID ids, real reply shapes); a test that cannot fail does not count; frozen clocks.
- Full `npm test`, `npm run format:check`, lint, build pass; `frontend/src/spaceScale.test.js` passes (literal px padding/margin/gap needs a `/* space-exception: reason */` or a `--space-*` token).

## Open questions

- A live "Read as" preview in the Fix date form would need a client mirror of the date rule; skipped unless it can reuse server output (the form shows the server's last read and Save returns the new one). If the mockup's live line is judged essential at review, a small mirror with the same test table as Task 1 is the follow-up.

## Ship notes

No migration. No new env var, key or outbound call beyond the existing Nominatim resolve. Deploy: the usual API deploy then the site. Smoke: `./scripts/smoke.sh https://joey-haas.dev https://api.joey-haas.dev`, plus logged-out `POST /api/intake/sittings/<uuid>/paste` answers 401.
