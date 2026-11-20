---
status: done
kind: retrospective
---

# Places and outings: retrospective (epic #339)

Written 2026-11-20, the day the epic was parked. Restore point: the git tag `places-outings-2026-11-20` (main at `f0f23ace`). Every path below is readable with `git show places-outings-2026-11-20:<path>`. Sources are the brief (`2026-11-15-places-outings-brief.md`), the plan doc for each story in this folder, the PR bodies, `docs/learnings.md` and issues #339 and #352 to #363. Where a claim has no source it says "unverified".

## 1. What it was and why it is parked

The epic had two goals from the brief: build a history of the fun things we have done, and help find new things to do, with the second learning from the first. A place was a `spots` row with a real city. An outing was a `visits` row grown with a title, a verdict (loved, fine, not again), a kid-along flag and a date that could be a day, a month or a year. "Want" and "been" were derived, not stored. History was private. Stories #340 to #351 (twelve) shipped to production between 2026-11-18 06:14 UTC (#443) and 2026-11-20 16:28 UTC (#522). Stories #352 to #363 (twelve) were not built. Production held 0 spots and 0 visits throughout, so the shipped code was never used in anger.

It is parked because Joey is restarting around international trips, and the shape of the shipped code would steer that design. The code is Denver-shaped in specific places: the city defaults to Denver, a public spot has to be in Denver (#343), the History and outing model hangs off the `spots` table, and the Nominatim client sends `countrycodes=us` with a Denver viewbox (`backend/spot_sources/nominatim.py`). The code is removed from main by a separate PR; the plan docs, the brief and this file stay.

## 2. What shipped, story by story

| Story | PR | The fact worth keeping |
|---|---|---|
| #340 Place kind, search by name | #443 | Needed a new intake area `places` (migration 0024), a `Kind.search` hook and a new page, so the issue's "appears on /admin/add with no new page" was wrong and the plan was rewritten mid-flight. 50 files, +6,281 lines. |
| #341 Add bar on /admin/spots | #445 | Saves with one call, `POST /api/intake/add`, with no sitting, which removed the stale-sitting-id bugs of #340. |
| #342 Paste a list | #449 | Paste makes one entry per line with no network call; the page resolves one entry per request. The server never fetches a pasted URL. +8,417 lines, the largest PR of the epic. |
| #343 City-aware spots | #452 | `/denver` loads only spots whose trimmed, lower-cased city is `denver`; a public spot has to be in Denver on every write path. |
| #344 Grow `visits` into outings | #455 | Migration 0025 adds `title`, `verdict`, `kid_along` and `precision` to `visits`. A month or year outing is stored as the first day of its period. |
| #345 Want and been states | #458 | Derived from `visit_count` on read. No column, no route, frontend only. |
| #346 Log an outing | #460 | `POST /api/spots/outings` creates a new place and its visit in one transaction, or neither. |
| #347 History page | #465 | `GET /api/spots/outings` and `/admin/history`, grouped by month; a loose date reads "Some time in 2024", never a made-up day. |
| #348 History filters | #467 | Filters (city, tag, verdict, kid-along) live in the URL and AND together; header counts are recomputed on the client when a filter is on. |
| #349 Did you go? | #507 | The rule lives on the backend and rides on the plan read as `asks`. "Didn't" is stored in the week's plan row, not as an outing. |
| #350 Backfill by paste | #513 | "Past outings" mode of the paste: `place, date` lines, a date read as day, month or year, one all-or-nothing commit. |
| #351 Tag vocabulary | #522 | `spots.TAGS` grew from 6 to 20. At 400 px the 20 chips would have been a sideways-scrolling strip, so two rows now wrap. |

## 3. Decisions worth keeping

**Mockups.** Each UI story drew three or two directions. The plans record the pick and the reason.

| Story | Chosen | Rejected, and why |
|---|---|---|
| #340 | C, inline add | A stepper (four steps for every place, results out of sight while the fields are filled); B split view (a second pane that falls under the list on a phone). C was already the list of rows that #341 and #342 would produce. |
| #341 | A, panel above the table | B, bar in the table toolbar (two search boxes that behave differently; on a phone it sits under the finder queue). |
| #342 | A, steps in one column | B, review table (60 rem wide, long URLs wrap to 4 or 5 lines, an open paste box implies appending mid-run). |
| #346 | A, one form | B, a place view (extra view and tabs); C, taps first (needs a rule for which six spots to chip, hides title and kid-along). |
| #347 | A, dated list | B, table (second layout on a phone); C, year and months (most build, overlaps the filters). |
| #348 | B, Filters button and sheet | A, chip rows (about 440 px of chips before the first outing on a phone); C, selects row (hides choices, departs from the `FilterChips` rule). |
| #349 | A, rows in one panel | B, banner opening a sheet (a modal and a third tap in front of a two-tap job). |
| #350 | A, mode switch inside Paste a list | B, a separate edit-everything table (a second review pattern; about 230 px per phone row). |

**Nominatim policy and client name (#340).** Search runs on submit only, never per keystroke (the policy forbids autocomplete). The client waits 1.1 s between requests, has a 7 s total deadline inside intake's 8 s per-source limit, and the page shows OpenStreetMap attribution. Nominatim gets its own client name, `NOMINATIM_USER_AGENT` (app name and site URL, in `backend/spot_sources/limits.py`), with no email address, because the catalogue's `USER_AGENT` carries the owner's email. Joey chose this; a test asserts the header has no `@`. There is no cache beyond the request: the policy asks for caching, and the README records the omission as a judgment (one user, every request is a submit), not an exemption. Overpass was rejected for name search (area queries, a 90 s timeout against an 8 s limit). A paid geocoder was rejected because a new account and secret is an always-stop in this repo.

**Intake kinds and commit (#340, #350).** `place` is its own intake area, so shelf search does not run Nominatim and places are not counted as shelf work. The mark comes from the result count: one result is ready, none or several is Check. No model is involved. The commit takes an advisory lock and re-validates, because `spots` has no unique constraint on `source_id`; an owned place is found by the same `source_id`, else the same name within 75 m. The #350 commit is all or nothing: one refused row answers 422, rolls back, and writes nothing.

**Outings with precision (#344).** `visited_on` stays the one date column. A month outing stores the 1st, a year outing Jan 1, and `precision` (day, month, year; default day) says which. Sorting and "last visit" keep working on one column. The future-date check applies to the period's start, so the current month and year are allowed and next month is not.

**The date-reading rule (#350).** `backend/intake/outing_dates.py` reads ISO forms and English month names. It does not read `6/7/24` or free text such as "last summer", because day and month order is ambiguous; those lines go to Check. It refuses a day more than one day ahead and a year before 1950. A line splits at the leftmost comma whose remainder reads as a date. The server re-reads the date text; the client never sends `visited_on` or `precision`.

**Duplicate rule (#350).** An owned place with an outing of the same period start and the same precision is a duplicate. A day inside a logged month is not. Duplicates default to skipped with "Add anyway", never block the commit, and are checked again at commit under the place-commit lock.

**Geocode at resolve, create on commit (#350).** The issue said "geocoded and created on commit". A network call inside an all-or-nothing commit would add an external call to a request path and make the commit slow and flaky. Backfill reuses the #342 resolve loop (one lookup per request, 1 request a second), and the spot is created on commit. Cost: 100 name lines take about two minutes with the tab open.

**Did you go? (#349).** A slot is due once its day has passed, or on Sunday from 18:00 Denver time. A slot with no day is asked as that weekend's Sunday. The rule reads the last four plan rows, so an unanswered slot stops asking after four weeks. It lives on the backend because the frontend cannot read the raw week row and the clock is server-side. There is no Undo: Been is a two-step with a verdict, "Didn't" only stops the asking, and an Undo needs a delete route. The exception is recorded in `docs/design-system.md`.

**Tags are a flat list (#351).** The brief and the issue mentioned "the agreed grouping", but no grouping is defined anywhere. The 14 new tags are appended and the order never changes. Tags are JSONB with no enum, so there is no migration.

**Epic decisions (issue #339).** Every outing has a place (`visits.spot_id` stays NOT NULL). No history is public. One kid-along toggle, no per-person record. "Didn't" is not an outing.

## 4. What worked and what did not in the building

**Review waves found real bugs.** Every shipped PR had a whole-branch review (Opus) and a `/code-review high` pass, and most had a scoped re-review of the fix wave. The Opus review reported at least one Important finding on #443, #445, #449, #452, #460, #467, #507 and #513 (8 of 12); #455 and #522 reported none. The bugs fall in four groups.

- Untrusted text. A NUL in a pasted line was a 500 (#449). A 300-character line cap made real Google Maps links unreadable and was found in the final review (#449); real place URLs run 200 to 900 characters. Newlines glued words together. Map links and coordinate pairs were split at their last comma, a comma inside a day date read as a year, "Route 66, 2019" and street numbers read as dates (#513).
- State and races. A stale re-read overwrote a newer toggle (#445). Stale search answers (#460). A same-tick overwrite of the URL params (#467). A "Didn't" that was never cleared when a different spot took the slot (#507).
- Rules on the data. Retyping "Denver" unpublished a public spot (#452). A retired tag caused a 500 (#467). `precision: null` and control characters in a title (#455).
- What the page told Joey. A timed-out save said nothing was written when it might have been (#460). An expired session said "check your connection" (#507). Show in table left no visible target (#445).

**Fix waves introduced bugs too.** The scoped re-review of the #507 fixes found a regression: re-saving the same spot wiped its answer. The re-reviews on #513 found four more after the first fixes. On #449 the re-review found an unrequested edit to a #341 e2e case and reverted it.

**Pins and tests that bit.**

- The migration head pin in `test_schema_check.py` failed CI on #443 because the plan's migration task never named the file.
- `test_recs_response_models.py` pins the count of `/api/spots*` routes. #346 went red on it and on `prettier --check` for `index.css`; the pin then went 33 to 34 (#347) and 34 to 35 (#349).
- A fixture test (`test_refresh_upserts_the_hours_and_records_the_run`) read forecast hours recorded 9 to 15 November while the job drops hours older than two days. It went red on every PR at about 06:00 UTC on 18 November, so it was fixed inside #443.
- Guard tests that could not fail. The double-Save test in #341 used `fireEvent`, so the second click never reached the handler and the test passed with the guard deleted. In #522 the CSS tests could not fail and the expected labels were computed from the code under test. In #455 the `Visit.id` tiebreak test passes without the tiebreak. Review caught these; the check that works is removing the guard and watching the test fail (11 of 36 new tests in #445 failed against the old files).
- Browser tests stub the backend's search answer, not Nominatim, because stubbing Nominatim needs a base-URL setting in production config (#445). #342 has no stubbed-resolve case because a stub cannot make the database agree.

**Bigger than planned.** #340 (new area, migration, new page, a re-plan and three mockups; +6,281 lines). #342 (+8,417 lines in 29 files, the 300-character cap raised to 2,000 for known map hosts, a 400,000-character paste cap). #350 (+3,960 lines, and the "geocoded on commit" reading above). In total the twelve PRs add 31,688 lines and remove 610, tests and docs included (sum of the PR figures). The full suites at the end counted 4,551 backend and 3,528 frontend tests (#522).

**Design picks.** In the plans for #341, #342, #346, #347, #348 and #349 the designer's pick is recorded as binding in auto mode; Joey chose C for #340. The plan for #350 does not say who chose. Plans left several questions for Joey unanswered (#340 decisions 13 to 15 were proposals).

**No use before more building.** All twelve stories merged within two days and ten hours, with no spots or visits entered in production. The review waves tested behaviour against fakes and fixtures, not against Joey's own data.

## 5. What to reuse for a trip-centred rebuild

| Piece | Path at the tag | Why it is reusable |
|---|---|---|
| Nominatim client | `backend/spot_sources/nominatim.py` | Throttled, total deadline, parses hits into `PlaceHit`; policy table in `backend/spot_sources/README.md`. Drop `countrycodes=us` and the Denver viewbox first. |
| Client name | `backend/spot_sources/limits.py` | `NOMINATIM_USER_AGENT`: the policy-compliant name with no email. |
| Recorded fixtures | `backend/tests/fixtures/nominatim_one.json`, `nominatim_several.json`, `nominatim_none.json`, `backend/scripts/record_spot_fixtures.py` | Real answers recorded with `--nominatim`; never edited by hand. |
| Intake kind registry | `backend/intake/kinds.py` | A kind is data; the optional `Kind.search` hook lets a kind with no metadata source search. |
| Place kind | `backend/intake/place_kind.py` | Mark from result count, owned-place detection, field cleaning. |
| Place commit | `backend/intake/commit.py` | Advisory lock, re-validation, the all-or-nothing outing commit. |
| Map-link reader | `backend/spot_sources/map_links.py` | Pure; Google and OSM link shapes, short links detected and never fetched, hosts as data. |
| Paste, resolve, pick | `backend/intake/place_paste.py` | One entry per line with no network call, one lookup per request, pick takes an index into stored candidates. |
| Date reading | `backend/intake/outing_dates.py` | Pure `read_date` and `split_outing_line` with a table of accepted and refused forms. |
| Outing routes | `backend/spots_routes.py` | `POST /api/spots/outings` (create and log in one transaction), `GET /api/spots/outings`. |
| Did-you-go rule | `backend/planner.py` (`did_you_go`) | Pure function with an injected clock. |
| City rules | `backend/spots.py` (`normalize_city`, `check_public_city`) | One spelling per city. `check_public_city` is Denver-only and has to change. |
| History page | `frontend/src/pages/AdminHistory.jsx`, `frontend/src/lib/outingGroups.js` | Month grouping with loose dates; states for loading, failed, empty, session ended. |
| Filter model | `frontend/src/lib/historyFilters.js` | Pure parse, apply, options with counts, URL state; unknown values ignored. |
| Log an outing sheet | `frontend/src/components/LogOutingSheet.jsx` | One-gesture sheet that can create the place in the same save. |
| Paste UI | `frontend/src/components/places/PastePlaces.jsx`, `pasteModel.js` | Grouped Check list, progress with Stop and resume, mode switch. |
| Add bar | `frontend/src/components/places/SpotsAddBar.jsx`, `PlaceFields.jsx` | Single-call add; shared field rows. |
| Cities helper | `frontend/src/lib/cities.js` | Fallback list and derivation from spots; Denver-first ordering needs a rethink. |

All paths were checked with `git ls-tree` at the tag. Pieces tied to Denver: the city default, the public rule, the viewbox, `lib/cities.js` ordering.

## 6. What was parked

The issues stay open with their acceptance criteria. Checked 2026-11-20: they carry the labels `enhancement` and `places-outings`; no `parked` label exists yet (gap: it needs creating). Dependencies are from each issue's "Depends on" line.

| Story | Depends on | One line |
|---|---|---|
| #352 Wider finder pool | #351 (built) | Verify OSM key=value pairs for the 14 new tags, extend `TAG_SET`, re-record the Overpass fixture. |
| #353 Taste profile from outings | #344 (built) | Weight the model's profile by verdict and recency; with no outings the prompt equals today's. |
| #354 Hold the weekly finder | #353 | Skip the weekly run below 20 places and 10 outings; record why on the Jobs row. |
| #355 Candidates remember origin | none | Additive migration adds weekly or ask to `candidates`; the weekly run never deletes ask rows. |
| #356 Ask the finder, backend | #355, #353, #340 | One Nominatim geocode, one Overpass query, one model call by index; queue still fills unscored with no model. |
| #357 Ask the finder, the box | #356 | Ask box in `SpotFinder` on `/admin/spots`; results join the same Accept and Dismiss queue. |
| #358 Try somewhere new from wants | #345 (built) | The `new` planner slot prefers spots with no outing, deterministic for a seed. |
| #359 Gaps, by rules | #344, #351 (built) | Pure rules such as no outing with a tag for N months; no model. |
| #360 Trip planning list | #343, #345 (built) | Database-stored planning trip with cities and dates, listing wants; never public. Open call: which admin area holds it. |
| #361 Fill a trip's list | #360, #341, #342, #357 | Add bar, paste and ask create wants in the trip's city. |
| #362 Outings read for the photo CLI | #360, #344 | Read-only admin-gated route returning spot, city, date, precision, title; credential to be decided (may touch secrets, an always-stop). |
| #363 Scaffold trip days | #362 | `ingest-photos.mjs --write` fills day titles and places from outings; falls back to today's output when the API is unreachable. |

Roots with every dependency built at the tag: #352, #353, #355, #358, #359, #360. The brief's order was phase 3 (finder), then phase 4 (trips). Several of these assume the Denver city model and the `spots` table, so a trip-centred rebuild should re-read each before reuse.

**Finder-sources research** (done 2026-11-18, from the sources' own pages, some via summaries; items marked unverified were not confirmed on the official page). Joey's rule: free-with-a-key sources are fine, but setting a key on Render is a production-settings change that only Joey makes, and the code must skip a source cleanly when its key is absent.
- Overpass stays the finder's source (`backend/candidates.py`); OSM data is under the ODbL (`backend/spot_sources/README.md`).
- Free and keyless: Wikidata and Wikipedia enrichment (CC0 and CC BY-SA); Denver open data for parks, recreation centres and libraries (CC BY 3.0 per a summary, unverified on the page; no public-art dataset found); Colorado state, CPW and COTREX trails (public domain per a summary, unverified).
- Ticketmaster Discovery: free key, 5,000 calls a day, 5 requests a second; its terms allow caching only "for reasonable periods", so keep events a few days and refresh. It covers ticketed shows and sports, not markets, festivals or library events.
- Geoapify: free key, no card, 3,000 credits a day; Places on the free plan unverified; OSM and Geoapify attribution required.
- NPS: free key by email, 1,000 requests an hour, endpoints unverified. RIDB: nothing verified.
- Google Places: no storing names or addresses (place IDs yes, coordinates for 30 days) and a billing account is needed, so live lookup only, never a candidate store.
- Dead: Eventbrite public event search (removed in 2019) and Songkick (no hobby use). Unverified: Foursquare, Yelp, HERE, TomTom, Bandsintown. iOS Safari has no Web Share Target, so the add bar is the phone path (the brief).

## 7. Open follow-ups

**Die with the code** (the PR that removes the code closes them):
- Planner tag sets: `planner.py`'s outdoor, indoor and rainy sets and `candidates.py`'s `CATEGORY_TAGS` do not know the 14 new tags (#522). The tags go with the revert.
- Retry after a timeout can create a duplicate outing; the "Didn't" route accepts a slot that is not yet due (#507).
- The Fix date form shows what the server read after Save, not a live preview (#513); a misspelled month reads as a year (#513).
- `call()` and `keyOf` duplicated between #340's page and `SpotsAddBar.jsx` (#445); full-table spot scans per resolve (#449).
- A legacy public non-Denver spot saves as unpublished when opened in the form (#452).
- react-router 8.3.1 does not queue the functional `setSearchParams`, so `AdminHistory` keeps a ref of the last written params (#467).
- The changelog call for admin-only features: the plans and PR bodies record no changelog entry for the epic, and the call stays open.

**Stay on main:**
- Issue #459: the page scrolls sideways on `/admin/spots` because a visually-hidden span in a header cell escapes `.item-table-wrap`. Found in the #345 review, present on main before the epic; open.
- The public spot body passes stored tags through unfiltered, so a tag retired later would publish (#522; plan decision 3 calls it existing behaviour). With 0 spots in production nothing is exposed today.
- The finder's tag buttons are 25 px tall (#522, unchanged by that PR).

## 8. How to restore

Tag: `places-outings-2026-11-20` at `f0f23ace`. To read the code, `git show places-outings-2026-11-20:<path>`. To work on it, `git switch -c restore-places places-outings-2026-11-20`, then replay the later unrelated commits on main as needed.

The twelve squash commits (`git log --oneline f0b37195^..f0f23ace`, epic ones only):

| Commit | PR | Story |
|---|---|---|
| `f0b37195` | #443 | #340 search by name |
| `36a116bf` | #445 | #341 add bar |
| `1865dd94` | #449 | #342 paste a list |
| `5e118fcb` | #452 | #343 city-aware spots |
| `55eb5c61` | #455 | #344 outings columns |
| `f27fae72` | #458 | #345 want and been |
| `2207d515` | #460 | #346 Log an outing |
| `188c77e0` | #465 | #347 History page |
| `2cccd342` | #467 | #348 History filters |
| `49fe1855` | #507 | #349 Did you go? |
| `b6d404c3` | #513 | #350 backfill by paste |
| `f0f23ace` | #522 | #351 tag vocabulary |

**Migrations.** `0024` adds the value `places` to the Postgres enum `intake_area` (additive; Postgres cannot drop an enum value, so its downgrade deletes `places` sittings, their entries and photos). `0025` adds `title` (varchar 80), `verdict` (enum `outing_verdict`), `kid_along` (boolean) and `precision` (enum `outing_precision`, not null, default `day`) to `visits`; its downgrade drops the four columns and the two types.

**What the removal drops.** The removal plan (`docs/planning/2026-11-20-remove-places-outings-design.md`) is two PRs. The first reverts the code and leaves the files `0024` and `0025`; production is at 0027 and held 0 spots, 0 visits and 0 places sittings. The second adds a forward migration `0028` that drops the outing columns and types and rebuilds `intake_area` without `places`. After 0028 runs, a restore of the code needs a new forward migration that re-adds them, because 0024 and 0025 are already in the migration history: that is an inference from the plan, not tested. The rollback for the data is a Neon restore point (history retention 6 h); the rollback for the code is the tag.
