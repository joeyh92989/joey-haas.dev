---
status: issues-opened
issues: 118-129
source: site walk-through, 2026-11-09 (live site, main)
repo: joeyh92989/joey-haas.dev
---

# Site review issues, 2026-11-09

Twelve issues to open on GitHub, one per `##` section. The heading is the
issue title, `Labels:` is the label list, and everything under it up to the
next `##` is the body. Each was seen on the live site on 9 Nov 2026. Causes
marked "likely" were not confirmed by a fix.

All twelve were opened on 10 Nov 2026 as #118-#129; none duplicated an open
issue (only #14, the BGG adapter, was open). Each section's `Issue:` line
names its issue.

## Catalog: one failing store marks the whole catalog stale

Labels: bug
Issue: #118

GameFairy answers HTTP 503 and has failed 11 runs in a row
(`/admin/catalogue`: "failed, short run, nothing retired, 1 error, 11 failed
runs in a row; http_error category 22 page 1: HTTP 503"). Every other source
refreshed on 9 Nov.

Because the catalog date is the stalest store's last good run, this one
store makes:

- the Dashboard read "nightly failed" and "Catalog refresh: Failed: GameFairy"
- Radar read "Catalog refreshed 9 d ago"
- the public What's next read "Releases checked Sun 1 Nov"

Decide one of:

- drop GameFairy from `STORES` in `backend/physical_sources/stores.py`
- stop a store that keeps failing from setting `generated_at.catalogue` and
  the Radar staleness line (for example, ignore a store after N failed runs)

Acceptance: with one store failing, the public "Releases checked" date and
Radar's "Catalog refreshed" reflect the stores that did refresh, and the
failing store is still named on the Dashboard.

## What's next scrolls sideways at phone width (Pick for me chips do not wrap)

Labels: bug
Issue: #119

At a 400px viewport `/shelf/next` lays out 591px wide
(`document.documentElement.scrollWidth` 591 against 400). The overflowing
elements are in Pick for me:

- `fieldset.pick-choices` (How long): 575px wide
- `fieldset.pick-choices` (Mood): 444px wide
- their `div.chip-row` children do not wrap

`/`, `/shelf`, `/shelf/<id>/` and `/denver` all fit at 400px.

Likely cause: a fieldset's default `min-inline-size: min-content`. The
`.pick-choices` rule in `frontend/src/index.css` (near line 6565) sets
border, margin and padding but no `min-width: 0`, and the chip row inside it
needs `flex-wrap`.

Acceptance: `/shelf/next` has no horizontal page scroll at 400px, and the
length and mood chips wrap onto further lines.

## Nightly: five jobs have never recorded a run

Labels: bug
Issue: #120

On `/admin` and `/admin/jobs` these rows read "unknown · No run recorded":
Weekend forecast, Spot finder, Closet tags, Outfit plans, Closet opinions.
Home says "3 of 9 jobs ok".

Knock-on effects seen: `/admin/weekend` says "No forecast yet. It refreshes
every night." and `/admin/closet/today` says "No forecast yet; dressed for a
typical November day."

The steps exist in `.github/workflows/nightly.yml` (`weather`, `closet-tag`,
`closet-plan`, `spots`, `closet-opinion`).

To find out which it is: start the Nightly workflow by hand and read the
step summary.

- 401 or 404 on those calls: the API deploy or `items.JOB_ROUTES` is behind
  the workflow
- success but the rows stay unknown: the status read
  (`GET /api/spots/status`, `GET /api/closet/status`) or
  `frontend/src/lib/nightly.js` is not picking the runs up
- Spot finder and Closet opinions only run on Sunday evening, so those two
  may simply not have had their first Sunday

Acceptance: after one nightly, Weekend forecast, Closet tags and Outfit
plans show a run time and a state; the two Sunday jobs say when they next
run instead of "unknown".

## Discover: last generation got no answer from the model

Labels: bug
Issue: #121

`/admin/discover` shows "Ranked by taste alone: The model did not answer."
for the 9 Nov generation. The picks, and the Top picks on the public What's
next, are the deterministic fallback with template reasons.

Check the Gemini key and the day's quota on the Render API service, then
press Generate once. Closet tagging and the photo importer draw on the same
free-tier quota, so the nightly order may be spending it before Discover
runs.

Acceptance: a Generate returns model-written reasons, or the note names the
actual cause (quota, timeout, no provider) rather than "did not answer".

## Year in review: "rated finishs"

Labels: bug
Issue: #122

`/shelf/year/2026/`, Against the crowd, reads "Of 6 rated finishs with an
IGDB community score".

`frontend/src/pages/YearInReview.jsx` line 217 calls
`plural(versus.compared, 'rated finish')`, which appends "s".

Acceptance: the sentence reads "rated finishes" for any count other than
one, with a test.

## Admin: several forms use unstyled browser-default controls

Labels: bug, design
Issue: #123

These render as light grey native controls on the dark theme:

- every field on `/admin/closet/profile`
- the Journal on `/admin/collection/:id` (Played on, Minutes, Note, and the
  "Log a session" button)
- the playthrough Status select on the same page
- the series search input on `/admin/pull-list`
- the file chooser on `/admin/import`

The main item form beside them is styled. `index.css` has no shared input
rule; styles are scoped per form (`.item-detail-form`, `.metadata-picker`,
`.import-form`).

Acceptance: text inputs, selects, textareas, date inputs and buttons on
those pages use the theme tokens in both themes.

## Daily tab sits in a narrower column than the other shelf tabs

Labels: bug, design
Issue: #124

Daily is a tab under My Shelf, but the page is at `/daily`, which is outside
`WIDE_ROUTES` (`['/shelf', '/denver']` in
`frontend/src/layouts/RootLayout.jsx`). Moving between Daily and any other
shelf tab makes the shelf header and tab strip jump between the 45rem
column and the 72rem one.

Fix by adding `/daily` to `WIDE_ROUTES`, or by keeping the wide frame and
constraining only the puzzle.

Acceptance: the shelf header and tabs do not move when switching to or from
Daily at 1280px.

## Empty public pages are linked from the nav and footer

Labels: enhancement
Issue: #125

- Comics is a shelf tab; `/shelf/comics` says "No comics on the shelf yet."
- Denver is in every footer; `/denver` draws the map with "0 spots · No
  spots yet."
- Travel is correctly unlinked, but `/travel` renders a title and lede with
  no empty state at all.

TIL and Travel already hide their links until they have a published entry
(`hasNotes`, `hasTrips`). Do the same for Comics and Denver, and give
`/travel` an empty state.

Acceptance: a tab or footer link appears only when its page has something
to show, and each of the three pages has a sentence for the empty case.

## Analytics: traffic looks automated; consider filtering bots

Labels: enhancement
Issue: #126

Over the last 30 days: all 136 visitors are "Direct / none", 188 of 196
views are desktop, and two days hold most of the views (92 on 27 Oct, 59 on
29 Oct). That fits automated requests or signed-out testing more than
readers. The public `/stats` page reports the same figures.

Options: drop known bot and headless user agents in `POST /api/track`
(`backend/analytics_routes.py`), or say on `/stats` that automated visits
are not filtered.

Acceptance: a decision recorded here; if filtering, a test with a bot user
agent that stores nothing.

## Catalogue backlog: Needs match and the N64 source

Labels: chore
Issue: #127

On `/admin/catalogue`: Needs match is 225 (the list says "Showing 50 of
242"), No platform is 17, and "N64 (IGDB)" reads "never run".

- Press Refresh N64 once.
- Work Needs match in batches (Link, Look up or Ignore).
- The tile says 225 and the list says 242: check which is right.

## Small layout slips in the shelf and admin

Labels: bug, design
Issue: #128

- `/admin/collection` add row: the rating field is so narrow its
  placeholder reads "Rat".
- `/shelf/next`: the "Just finished" chip drops its rating star onto a
  second line, at 1280px and at 400px.
- Section headings on `/admin/discover` ("Picks"), `/admin/radar` ("Wanted,
  still to come", "Suggested") and the week headings on `/admin/pull-list`
  are much larger than `/admin/store-list`'s section headings and sit tight
  against the text under them.

## Store lines do not say which edition a price is for

Labels: enhancement
Issue: #129

On `/admin/discover`, `/admin/radar` and `/admin/store-list` a game with
several listings at one store repeats the store name with different prices
and nothing to tell them apart: one game shows the same store twice at 84.00
and 34.00 USD, another shows one store three times at 44.95, 69.95 and
119.95 USD.

Show the listing's edition or variant title beside the price.
