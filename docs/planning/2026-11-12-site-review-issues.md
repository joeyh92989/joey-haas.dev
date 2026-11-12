---
status: issues-opened
issues: 179-205
source: site review, 2026-11-12 (production screenshots from `npm run shots`, the e2e and axe suites, a code sweep of frontend/src)
repo: joeyh92989/joey-haas.dev
---

# Site review issues, 2026-11-12

One issue per `##` section: the heading is the title, `Labels:` the label list, the rest the
body. Evidence is from production on 12 Nov 2026 (`E2E_BASE_URL=https://joey-haas.dev npm run
shots`: desktop 1280 and Pixel 5, both themes) unless it says "code". Causes marked "likely"
were not confirmed by a fix. Open issues checked for duplicates: only #14 and #162 were open.
All 27 were opened on 12 Nov 2026 as #179-#205; each section's `Issue:` line names its
issue. Admin pages were not walked (they need a session); admin items below come from the code.

## Year in review: replay rows break the Finishes table

Labels: bug, design
Issue: #179

On `/shelf/year/2026` (desktop and phone), both Dredge rows in Finishes put the `again` tag in
the rating column and push `10/10` onto its own left-aligned line under the date. Every other
row keeps three cells on one line, so the best-rated game on the page is the one that looks
broken.

Likely fix: put `AgainTag` inside the title cell after the link, or give the row grid a fourth
column.

Acceptance: a replayed finish renders on one line with the tag beside the title and the rating
right-aligned, at 393px and 1280px.

## Stats: views-per-day chart is cut off on phone

Labels: bug, design
Issue: #180

On `/stats` at 393px the chart's axis ends at a clipped "5 No"; the 11-12 Nov bars and the
"12 Nov" label are off-screen with no scroll cue. Desktop shows all 30 days. The newest week is
the part a visitor wants.

Fix direction: bars that share the container width (`flex: 1; min-width: 0`) instead of a fixed
per-day width, or fewer days on narrow screens.

Acceptance: at 393px the last day's bar and label are visible without scrolling, and the page
does not scroll sideways (the e2e phone overflow check covers the page, not the chart's own box).

## Load failures read as empty pages or lose their header

Labels: bug
Issue: #181

When the API is down or asleep:

- `/shelf/comics` renders no `h1` and no shelf header, only an error alert (the e2e smoke marks
  this case `test.fail()` in `frontend/e2e/smoke.spec.js`). Every other shelf page keeps its
  header on error.
- How it works shows the empty copy ("Nothing on the shelf yet.") when the live call fails and
  there is no snapshot (code: `pages/HowItWorks.jsx:79-84`), so a failure reads as "you have
  nothing".
- Collection, Comics, Denver, Stats, ComicIssue, ComicEdition, MonthInReview and YearInReview
  show `LOAD_ERROR` ("Try again in a minute") with no retry button; Item and PlayNext have one.

Acceptance: each of those pages keeps its header on failure, says it failed (not empty), and
offers a retry; remove the `test.fail()` for `/shelf/comics` in `smoke.spec.js`.

## Links inside text are told apart by colour only

Labels: accessibility
Issue: #182

axe (`link-in-text-block`, serious, WCAG 1.4.1) flags inline links on `/shelf/next`,
`/shelf/intake`, `/now`, `/colophon`, `/stats` (26 links in the changelog), `/blog`, `/til` and
the 404 page, in both themes. A link in running text needs a cue other than colour (an
underline, or 3:1 contrast against the surrounding text plus a focus/hover cue).

Likely one rule in `index.css`: prose links are not underlined.

Acceptance: `link-in-text-block` passes on every route; delete the eight entries in
`frontend/e2e/known-a11y.js` (the suite fails on a stale entry, so it will say when).

## Denver is public with no spots

Labels: bug
Issue: #183

`/denver` is live with a drawn map, "0 SPOTS" and "No spots yet." The footer link is correctly
hidden while empty (#125), but the page is still in the sitemap and search, the changelog links
to it ("Denver, the short list"), and `/stats` shows it has had visits.

Decide one of: publish some spots; or treat an empty spots snapshot like the footer does (out of
the sitemap, search and prerender, `noindex`) and say "coming soon" on the page.

Acceptance: a visitor cannot reach an empty Denver page from any link the site writes.

## Item page: empty hero slab, no way back, muddled chips

Labels: design, enhancement
Issue: #184

On an item page (e.g. `/shelf/4377c871-…/`, desktop and phone, both themes):

- A full-width blank block about 208px tall sits above the cover and the title straddles its
  edge; it reads as a banner that failed to load. Cause confirmed: `Item.jsx` renders an empty
  `<div className="item-hero" />` with only a surface background.
- No breadcrumb, shelf tabs or back link; the only way back is the masthead. The comic issue
  page already has a breadcrumb.
- The chip row mixes genres and platforms ("Platform · Action · Xbox Series X|S · …"), where the
  genre "Platform" reads as a label; the owned platform is not among them. "≈ 50 h · 88 h to
  complete" does not say what the first number is.

Acceptance: no empty hero (fill it or remove it with its negative margin); a breadcrumb back to
the shelf; genres and "also on" platforms as two labelled groups; time-to-beat figures labelled.

## Comics: missing issues are invisible

Labels: design
Issue: #185

On `/shelf/comics` and the comic issue pages:

- The run key's "Missing" swatch renders as nothing (an outline-only `box-shadow` in
  `--run-missing` that does not show at key size).
- Eleven of twelve series ("0 / 5 · 5 missing") draw no run track at all; only a series with
  owned issues does. The page promises "what I own, the gaps", and the gaps are invisible.
- An issue page for an unowned issue (`/shelf/<id>/1/`) is all placeholders: five dashed
  thumbnails, a blank cover panel, "Read: —" and "Comic Vine has no description".
- Headline stats lead with "55 missing · 0% read"; four rows are titled just "Creepshow", told
  apart only by the grey year.

Acceptance: missing cells and the key swatch are visible in both themes (measure contrast, as
the run tokens require); a zero-owned series draws its track; an unowned issue page shows the
cover dimmed or a labelled placeholder; series titles carry their volume year.

## Now page: copy promises what the page does not show

Labels: design
Issue: #186

`/now` says "What I'm playing, what's next, and what I just finished." The sections are
"Paused" and "Recently finished": no Playing, no Next, and the first heading on the page is
"Paused". The "Also as an RSS feed" line sits against the last list item with no gap.

Acceptance: when nothing is active, the page says so in one line and shows Tonight's pick as up
next; the copy matches the sections; the RSS line has normal spacing.

## One page-header and detail-page pattern

Labels: design
Issue: #187

Headers are built three ways (code: `SpineHeader`; bare `h1` with `Kicker` on Home, Blog,
Projects, About; bare `h1` alone on Now, Travel, Denver, Stats, Colophon), and on screen the H1
is serif on Home, About, How it works and Try the intake but sans everywhere else, including
siblings of those pages (Projects; Comics, What's next).

Detail pages disagree on the way back: the item page has none, the comic issue page has a
breadcrumb, TIL notes put "← All notes" above the title, blog posts put "← All posts" only at the
very bottom, the month journal has tabs with none active.

Acceptance: one header component with one H1 face rule; one breadcrumb pattern at the top of
every detail page (item, comic issue/edition, post, note, trip, month).

## Content widths jump within a page

Labels: design
Issue: #188

Desktop, inside the 1104px tracker container: What's next runs 832px (Tonight), 1104px (Pick for
me) and 720px (In stores now and below); Year in review sits in ~576px with the right half
empty; Daily's board is 720px with 400px empty; the item page's description is 720px under
1104px stat cards. Prose pages wrap at ~545px (Now, Colophon) and ~672px (TIL, blog).

Acceptance: at most two widths per page (full and reading), the same reading width on every
prose page.

## Shelf controls: unlabelled pill rows and no result count

Labels: design, enhancement
Issue: #189

`/shelf` shows four unlabelled rows of identical pills (type, status, platform, then sort with
an unexplained "↓" and the view toggles); `/shelf/comics` three. Phone uses a labelled Sort
select instead, so the two widths differ. Nothing says how many titles a filter shows or how to
clear filters, and the cover status marks (squares, green outline, "×4") are explained only by
the Status chart legend far above the grid (and nowhere on the month journal).

Acceptance: each row labelled (Show / Status / Platform / Sort), one sort control on both widths,
a result count with "Clear filters", and a one-line key next to the grid and on the journal.

## Collection grid starts far below the fold

Labels: design, enhancement
Issue: #190

On `/shelf` the first cover row starts at ~1,425px on desktop and about five screens down on a
phone, after totals, Today's Shelfle, the What's next band, a status strip, five "What it does"
cards (numbered 1, 2, 3, 4, 7), Favorites, four charts (two on a lower baseline), search and the
chip rows. The page is about 13,000 CSS px tall on a phone with no paging.

Fix direction: move the pipeline strip and "What it does" cards to How it works or below the
grid, put the charts behind a disclosure on phone, and page the grid ("show more").

Acceptance: covers start within the first two screens on a phone and the first screen on desktop.

## What's next is one long undivided page

Labels: design, enhancement
Issue: #191

`/shelf/next` is 6,535px on desktop (~9,200 CSS px on a phone) across eight sections. Every one
of the first six "In stores now" rows says "Top pick", so the badge distinguishes nothing; the
Tonight pick appears again as Pick for me's first result; "On my list" renders only "The list is
empty, for now."; the "Just finished" chip wraps into a two-line lozenge on phone and touches the
card below.

Acceptance: jump links or sub-sections near the top, long lists capped with "show more", "Top
pick" on at most three rows, no duplicate between Tonight and Pick for me, empty sections hidden.

## Shelf navigation on phone, and My Shelf unmarked on Daily

Labels: bug, design
Issue: #192

- At 393px the shelf tabs wrap to two rows ("Collection · Comics · What's next" / "Year in
  review · How it works · Daily"), so the active underline floats between them; chip rows scroll
  sideways with only a half-cut chip as the cue.
- On `/daily` the masthead does not mark My Shelf, although the page carries the shelf header
  and the Daily tab. Cause confirmed: the mast's `NavLink` for My Shelf matches `/shelf*` only,
  while `RootLayout` treats `/daily` as a shelf route (`WIDE_ROUTES`).

Acceptance: one scrolling tab row on phone with an edge fade (or shorter labels); My Shelf is
marked on `/daily`.

## Shelfle: the answer box is below the empty grid on phone

Labels: design
Issue: #193

On `/daily` at 393px the "Type a game" input sits under the header, tabs, intro and a 6×5 grid
of empty cells, about two screens down; on desktop it starts at ~860px, below a 720px fold. It
is the only action on the page.

Acceptance: the input is visible on first load at 393×851 and 1280×720.

## Pages that are hard to find; Home's "Last shipped" is the last post

Labels: design, enhancement
Issue: #194

- Now, Daily, TIL, Colophon and Stats are linked only from the footer line. The changelog is the
  lower two-thirds of `/stats` with no route or link of its own. `/shelf/intake` is linked from
  no page (code: only `content/pages.js`, so search and the sitemap).
- Home's facts card says "Last shipped · How My Shelf works · Oct 2", which is the newest blog
  post (code: `Home.jsx` `lastShipped(post)`), while the changelog shows changes almost every day
  since.

Acceptance: TIL reachable from the Blog page; the changelog has its own anchor or route linked
from Home; "Last shipped" reads from the changelog (or is relabelled "Latest post"); the intake
demo is linked from How it works or Projects.

## Stats page: duplicate tiles and raw paths

Labels: design
Issue: #195

`/stats` shows Views 214 / Visitors 137 twice (last 30 days and all time are identical while
counting is under 30 days old); the Pages list shows a raw item path
("/shelf/ef6a73b0-a3d2-41e1-8…", full UUID on phone); the bar chart has no values or scale.

Acceptance: "all time" hidden until it differs; item, year and month paths shown by title; the
peak value labelled.

## Home and About: no contact call to action

Labels: enhancement
Issue: #196

The email address appears only in the small footer line. Home and About, the pages a recruiter
reads, end without a contact line (About ends on the Toolbox chips); the Home hero's actions are
About me / See My Shelf / GitHub. On desktop the hero's facts card leaves the right column empty
below it, and two of the three Work cards are half blank beside the My Shelf card's covers.

Acceptance: a contact line (email, LinkedIn, resume) at the end of Home and About; the Work cards
size to content or carry an image.

## Ratings and chart colours, one system each

Labels: design
Issue: #197

My rating is written five ways: stars on the grid and journal, "2 / 10" plus a star on the item
page, "rated 2" on Now, "2/10" in Year in review, and "42 / 100" for the community score beside
it. Single-series charts use amber, white, blue or grey depending on the chart.

Acceptance: one format for my rating everywhere (and the community score visibly different);
single-series charts in the accent colour, amber kept for stars.

## Year in review and the month journal: covers and navigation

Labels: enhancement
Issue: #198

Year in review's Finishes list is text only, though the month journal shows the same games with
covers, and comics read are not counted. The month journal offers "← October 2026" and "2026 in
review" only: no month index, no next month, one section ("Finished").

Acceptance: covers on Year in review's finishes; a month index (or previous/next) on the journal.

## Long posts: contents and a top back link

Labels: enhancement
Issue: #199

"How My Shelf works" is 6,872px on desktop with seven or more H2s and no table of contents,
reading time or previous/next; "← All posts" is only at the bottom. How it works, by contrast,
opens with a numbered index.

Acceptance: posts with more than four H2s get a contents list and the back link at the top.

## Layout slips

Labels: design
Issue: #200

Small, independent fixes seen on production:

- Intake demo: spine titles clipped at the shelf line ("THE LEGEND OF ZELDA: BREATH O", more on
  phone).
- Comics stats: "0% READ" wraps alone on phone.
- How it works index: stop 09 alone in a third column, its rule 1px lower, under the "/DAILY"
  label.
- Shelf page: "How it works → Source →" run together (Projects spaces the same links).
- Projects: the "My Shelf" card title touches the cover strip.
- Short pages (`/blog`, `/denver`): the footer floats mid-screen; the shell needs a full-height
  column.

Acceptance: each item fixed and checked with `npm run shots` at both widths.

## Copy: one name for each thing

Labels: design
Issue: #201

- Blog / Writing (nav vs page title vs Home kicker); Daily / Shelfle / Today's Shelfle; How it
  works / Take the tour / guided tour; "joey-haas.dev" vs "This site".
- Admin: the page titled Sources at `/admin/catalogue` says "catalog" in its body
  (`AdminCatalogue.jsx:526, 596, 600`, `AdminRadar.jsx:260`, `AdminDiscover.jsx:239`); "Play Next"
  is title case beside "Pull list" and "Store list" (`adminAreas.js`).
- British spellings against the American copy policy (`content/spine.js:12-14`): "favourites"
  (`spine.js:451`), "Neighbouring" (`:741`, `:783`), "neighbourhood" (`denver.js:44`, on the live
  Denver page).
- Loading words vary ("Loading…", "Loading Discover…", "Loading the radar…", "Reading the nightly
  status…"); WAKING says "about thirty seconds" while a cold start can take a minute (not
  measured).

Acceptance: one name per thing across nav, titles and kickers; American spelling; one loading
phrase pattern from `content/status.js`.

## Admin: failed reads show a dash or load forever

Labels: bug
Issue: #202

Code, not walked: `Admin.jsx:31` returns null on any failed read, so figures render "—" with no
message, and the outfit lead shows "Loading…" forever on failure (`Admin.jsx:151`). Most admin
pages show a bare "Loading…" instead of the shared wait words (`AdminAnalytics.jsx:70`,
`AdminWeekend.jsx:320`, `AdminCatalogue.jsx:295`, `AdminRadar.jsx:297`, `AdminDiscover.jsx:311`).

Acceptance: a failed read on admin Home says so and offers a retry; admin waits use `withDeadline`
and `content/status.js` like the public pages.

## Design tokens for type and spacing

Labels: design, chore
Issue: #203

Code: 396 `font-size` declarations with 36 distinct values and no type-scale token; about 136
padding/margin/gap values in px across ~20 values, with only `--grid-gap` and `--radius` as
tokens. Some text is 9-10px (`index.css:1539`, `:3312`, `:3999`, `:7574`). Colours are clean
(tokens everywhere, both themes complete).

Acceptance: a type scale and spacing scale as tokens, the existing values mapped onto them, no
text under 12px.

## One component per job: dialogs, cover cards, stat tiles

Labels: chore
Issue: #204

Code: `Sheet.jsx` is documented as the shared shell, yet WrapUpSheet, SearchDialog, Lightbox,
MobileNavSheet and AdminShell's nav sheet each own their `<dialog>` logic (AdminShell's duplicates
MobileNavSheet), and intake's AddDrawer hand-rolls a focus trap. Four cover tiles do overlapping
jobs with separate CSS (PosterCard, CoverTile, BookTile, CoverStrip). Stat figures come in three
forms (StatTile, Item's `item-tile` `<dl>`, AreaCard). Sheets also start at `h3` under the page
`h1` (ShareSheet, WrapUpSheet).

Acceptance: dialogs on `Sheet`; one cover tile with variants; one stat tile; headings in sheets
follow the page outline. Behaviour unchanged, checked by the unit and e2e suites.

## Browser tests: admin pages and visual baselines

Labels: chore
Issue: #205

Follow-up to the Playwright suite (`docs/planning/2026-11-12-playwright-e2e-design.md`), which
covers public static routes only. Add: admin pages signed in against a local backend with a test
account from the project's fixtures; dynamic public routes from a fixture snapshot in CI; and,
once layouts settle, `toHaveScreenshot` baselines generated on the CI runner.

Acceptance: `npm run e2e` covers every admin area's main page locally; CI covers one page of each
dynamic kind.
