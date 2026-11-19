---
status: issues-opened
issues: 468-505
source: blind walkthrough, 2026-11-19 (five Sonnet agents with no repo access: a recruiter, a curious friend, a phone visitor, and a new admin twice, on a Playwright 1440px desktop and 390px phone; plus a scripted 390px sweep of 17 public routes)
repo: joeyh92989/joey-haas.dev
---

# Blind walkthrough issues, 2026-11-19

Epic: #468. One issue per `##` section: the heading is the title, `Labels:` the label list, the rest the
body. Every issue also gets `backlog` and `walkthrough-2026-11`. Raw logs are in
`docs/planning/walkthrough-2026-11/` (`01` recruiter, `02` friend, `03` phone, `04` admin on a
633px viewport, `05` admin at 1440px then 390px, `06` the 390px sweep). "Seen by" names the
walkers who hit it independently; one walker is a weaker signal than two.

Method limits, so nobody over-reads this: the walkers are a model reading screenshots, not people;
`01`-`03` ran against production and `04`-`05` against a local build on an empty or seeded
database; Chrome would not narrow below 633px (`03`) or widen past it (`04`), so `04` is partly a
phone layout and its "no desktop layout" finding was discarded; delete and Discard flows were not
tried. Prior work was checked first: #288 (a work case study) was closed won't-do at Joey's call,
so no issue here asks for one. Duplicates of closed issues are written as follow-ups and cite them.

## Visitors see owner-only controls

Labels: bug, design
Issue: #469

Seen by: friend, phone. A signed-out visitor sees "Edit" under every game and comic title, the
"Admin" link in the footer, the "Wrap up / Log tonight / Not tonight" buttons on What's next, and
"Dates change on the edit page." on a playthrough table. Both walkers hesitated to click anything
nearby because it looked like it would change real data. The "Edit" link is also a tiny target.

Expected: a stranger sees none of them. The session check (`/api/auth/me`) already runs in
RootLayout, so the controls can appear after it answers; public pages stay prerendered without them.

Acceptance: signed out, none of those controls render on `/shelf/*`, `/shelf/next` or the footer;
signed in, they do. A test covers both states.

## Shelf pages say nothing about whose shelf it is

Labels: enhancement, design
Issue: #470

Seen by: friend, recruiter. A link to `/shelf/games` lands with "My Shelf: a tracker for my..."
and no name beyond the small logo, and no sign the shelf sits inside a portfolio. The friend only
learned it by going Home. The recruiter felt the shelf, Now and blog read as a different site from
the professional one.

Expected: a one-line byline ("Joey Haas's shelf") and a quiet "Part of joey-haas.dev" link on
shelf, item and Daily pages.

Acceptance: a first-time visitor on any `/shelf/*` page or `/daily` can name the owner without
leaving the page.

## The main menu leaves out Stats, Now, TIL, Daily and Denver

Labels: enhancement, design
Issue: #471

Seen by: phone, recruiter. The menu has six entries (Home, About, Projects, My Shelf, Blog,
Resume). Stats, Now, TIL, Daily game and Colophon live only in the footer. The phone walker found
no places page by menu, search ("places" and "outings" return nothing) or footer, though `/denver`
exists, so the page is a discoverability gap, not a missing page. `/places` is a 404.

Expected: a primary menu plus a "More" group that reaches Now, Stats, TIL, Daily and Denver, and
search entries for Denver, places and outings (`STATIC_PAGES`).

Acceptance: every public route is reachable from the menu or its "More" group; search finds
Denver by "places" and "outings".

## /shelf/daily shows "That didn't load" instead of the daily game

Labels: bug
Issue: #472

Seen by: friend. A guessed `/shelf/daily` shows "That didn't load. Try again in a minute." and a
Try again button, with no nav help, while `/daily` works. Likely `shelf/:id` takes `daily` as an
item id and the fetch fails.

Expected: a redirect to `/daily`; more generally a missing item gets a proper not-found with links
home and to the shelf, not a retry prompt.

Acceptance: `/shelf/daily` lands on `/daily`; an unknown `/shelf/<id>` shows the not-found page.

## Shelf search and filters push the games below the fold

Labels: design
Issue: #473

Seen by: phone, friend. On `/shelf/games` about 25 filter pills across five rows sit before any
game. On phone, typing "zelda" and pressing Enter changed nothing near the box; the "2 of 109
games" result was about 13 scroll ticks down, below Now Playing and the chips. "Dim finished" and
"Comfortable/Compact" look like the same kind of control as filters, and "Play style / Setting /
Tone" are unexplained.

Expected: results and the count directly under the search box; filters behind a "Filters" button
(phone at least); display toggles visually apart from filters.

Acceptance: after a search the matching games are visible without scrolling past chips at 390px
and 1440px; the first game is within one screen of the search box with no filter open.

## Comics list: duplicate titles, uneven cards, cramped intro

Labels: design
Issue: #474

Seen by: friend. Four tiles are all titled "Creepshow" with no volume or year; cards have
different heights and progress bars sit at different vertical positions; the intro paragraph butts
against the stat cards; some cards say "Single book" with no explanation of the term. The breadcrumb
reads "My Shelf / Catherine" on a game but "My Shelf / Comics / title" on a comic.

Acceptance: same-title series are told apart on the card; cards in a row share a height and a
progress-bar position; the intro has space below it; breadcrumbs follow one pattern.

## The Tour page is full of jargon and overflows on a phone

Labels: design, bug
Issue: #475

Seen by: friend, sweep. `/shelf/how` uses admin route names, `NIGHTLY.YML`, `TESTS`, "Game-Key
Card" and "cartridge radar" as captions; the non-technical walker skimmed and left. A scripted
390px check measured the page 3px wider than the viewport (`.tour-stop-col`, `.tour-live`,
`.tour-capture`), the only route of 17 that overflows.

Expected: plain captions first, file and route names as small secondary text, a line saying who
the tour is for; no horizontal overflow at 390px.

Acceptance: `scrollWidth` equals the viewport at 390px; a visitor with no tech background can read
every stop caption.

## Daily game: result colours and arrows have no legend

Labels: enhancement
Issue: #476

Seen by: friend. After a guess the row shows orange and yellow boxes with "later" and "longer" and
nothing says what the colours mean. The walker was otherwise delighted by the game.

Acceptance: a visible colour key or a "How to play" toggle on `/daily`, reachable before the first
guess.

## Small tap targets: footer, meta links, Edit, stats page

Labels: accessibility, design
Issue: #477

Seen by: phone, recruiter; measured by the sweep. The footer is a row of inline text links about
12 to 16px high, with Colophon, Stats and RSS almost touching. A 390px touch-emulated sweep of 17
public routes counted 11 to 33 controls under 32px on every route, 71 on `/stats` and 26 text
elements under 12px on `/shelf/intake`. #276 fixed the header and shelf controls and was closed;
this is the part it did not reach. (Inline links inside prose are exempt from WCAG 2.5.8.)

Acceptance: footer and standalone links are at least 24px high with spacing (44px on phone where
practical); a Playwright check at 390px asserts it for the footer and `/stats`.

## Header and content width shift between pages

Labels: design
Issue: #478

Seen by: friend, recruiter. The header contents sit at different x positions on the wide shelf
pages and the narrow blog and prose pages; the recruiter noted the shelf is wider than the rest.
#188 set "at most two widths per page" and was closed; the masthead is the part still moving.

Acceptance: the masthead and footer use one container width on every page.

## Item pages use random UUID URLs

Labels: enhancement
Issue: #479

Seen by: friend. `/shelf/c1fc4f22-...` does not look shareable and gives no hint of the page.

Expected: a slug (`/shelf/catherine-full-body`) with the id as a fallback and a redirect from
the old form, so shared links keep working.

Acceptance: item pages have readable URLs; old URLs redirect; the sitemap uses the new form.

## Stats: figures do not add up and one row has no title

Labels: design
Issue: #480

Seen by: phone. The cards show 263 views for "last 30 days" and for "all time"; the per-page list
shows counts like 21, 20 and 12 that do not sum to 263; one row reads "Creepshow" among raw paths.
#195 fixed the earlier duplicate tiles and was closed; this is what remains.

Acceptance: the page says what the list covers ("top pages only" or totals that match), and every
row shows a title.

## Numbers and "tonight" differ between pages

Labels: bug, design
Issue: #481

Seen by: recruiter, friend. The Projects screenshot says 108 owned and Tonight is Donkey Kong
Bananza; the Shelf page says 109 and Hades II. The shelf header says "Tonight: Hades II" while the
card says "Now playing: Lies of P". The small "Tonight / Today's daily game / Overview" row is
unlabelled.

Expected: one source for each figure, the Projects screenshot dated or regenerated, and "Tonight"
and "Now playing" told apart in words.

Acceptance: no two public pages disagree on owned count or tonight's game on the same day.

## Header controls: theme toggle label and search overlay Escape

Labels: design
Issue: #482

Seen by: phone (one walker, low confidence on the second item). The toggle shows the target mode
("Light" while dark), which reads as the current mode; add an icon or "Switch to light theme".
Separately, after pressing Escape on a no-results search the next tap went to /projects, as if the
overlay was still capturing input. Needs a repro before anything is changed.

Acceptance: the toggle names its action; Escape closes the overlay and the page beneath is
tappable, shown by a test.

## Blog URL still says "spine"

Labels: chore
Issue: #483

Seen by: recruiter. The post titled "How My Shelf works" lives at `/blog/how-spine-works`: a
leftover from the Spine to My Shelf rename.

Acceptance: the post is at `/blog/how-my-shelf-works`; the old URL redirects; the RSS entry and
sitemap follow.

## Resume PDF title reads "JTH Edits"

Labels: chore, needs-joey
Issue: #484

Seen by: recruiter. The browser tab for `/resume.pdf` reads "Joseph Haas Resume 2026(JTH Edits)".
The nav label shows a download arrow but the file opens inline. The PDF in `frontend/public/` is
the scrubbed export and its filename is load-bearing (`CLAUDE.md`), so the fix is a metadata title
on the source file, which only Joey can re-export.

Acceptance: the PDF title is "Joseph Haas - Resume"; the nav label says "Resume (PDF)" and matches
the behaviour.

## Home buries the strongest evidence and the Work cards are all hobby

Labels: enhancement, needs-joey
Issue: #485

Seen by: recruiter. The metrics that carry the About page (3.84M-row backfill, 55-74% latency cut,
$1B annual spend) are not on Home, where each job gets a vague one-liner. The three Work cards and
`/projects` are all the hobby tracker, and "All projects ->" leads to a single project. LinkedIn is
a small text link while GitHub is a hero button.

Needs Joey: #288 asked for a work case study and was closed won't-do (employer-data risk). This is
the narrower ask: lift figures that are already public on `/about` into Home's Experience entry,
reword "All projects ->" while there is one project, and add LinkedIn beside GitHub. No new
disclosure, but it is his call.

Acceptance: Joey decides which figures may move; the chosen ones appear on Home with a link to
About; the hero offers LinkedIn.

## "Shipping software since 2012" against 5 years of engineering

Labels: design, needs-joey
Issue: #486

Seen by: recruiter, who read it as 14 years of engineering against About's 5 engineering and 8
product. #285 raised this and was closed with the headline unchanged, so it may be deliberate.
Logged so the decision is on record, not as a defect.

Acceptance: Joey confirms the line stays or picks a replacement; a comment on this issue records it.

## Admin: "Run now" is a link, not a run

Labels: bug, design
Issue: #487

Seen by: admin (both walks). Most "Run now" buttons on the Home and Jobs rows only navigate:
Sources refresh to `/admin/catalogue`, Radar to `/admin/radar`, Weekend forecast to
`/admin/weekend`, Intake to `/admin/collection/add`, and Closet opinions already says "Open
Review". They sit in the same blue style as real run actions such as Spot finder.

Expected: a link says "Open Radar"; "Run now" always starts a job and shows a result.

Acceptance: no "Run now" navigates; each run shows started, done or failed.

## Admin: Jobs rows do not say what a job does or when it last ran

Labels: design
Issue: #488

Seen by: admin. Thirteen rows, each a dash in a wide empty first column, a one-line status and a
badge (unknown, stale, scheduled). No purpose line, no last or next run, no headers; "Intake",
"Closet opinions" and "Public snapshot" are opaque; "how to re-enable it" leaves the site for a
GitHub readme with no warning. The list also appears on Home and again on Jobs.

Acceptance: each row has a one-line purpose and last-run and next-run columns with headers; the
empty first column collapses; external links are marked; the list lives in one place.

## Admin: adding a game by hand is silent and unlabelled

Labels: bug, design
Issue: #489

Seen by: admin (both walks). The inline form has placeholders and no labels; Format is required
but unmarked and flagged only by a browser tooltip ("Please select an item in the list"); after
Add the form stays open with no message and no link to the new item; the sidebar count stays at 0
until a reload; the page jumps as stats and cards appear. Places and garments confirm well, so the
pattern exists.

Acceptance: persistent labels, required fields marked with inline validation, a confirmation with
a link, the form clears, the count updates.

## Admin: new items are private and nothing shows how visitors will see them

Labels: design, bug
Issue: #490

Seen by: admin (both walks). Games, comics and places are created private, shown only as a small
"Private" chip or "0 of 1 public". There is no per-item "view on the public site" link. After
"Publish all" the public `/shelf/games` first showed "No games on the shelf yet" and showed the
game on a later reload (lag unexplained; needs a repro against the snapshot cache). Defaults also
differ: the first walk's games were public by default and places private.

Acceptance: after adding, the page says the item is private and what publishing does; each item
has a "View public" link; any delay before it appears is stated; defaults are consistent.

## Admin: adding a place by hand asks for coordinates, unmarked

Labels: enhancement
Issue: #491

Seen by: admin (both walks). Name only fails on Coordinates with a browser tooltip; a new admin
does not have latitude and longitude, and the maps-link tip is small grey text. Add shows City as
a dropdown and edit as free text, and the public toggle reads "Show on the public Denver page" on
add and "Show on the public map" on edit.

Acceptance: Coordinates are marked required or looked up from the name and city; the paste tip is
prominent; field types and wording match between add and edit.

## Admin: Jobs lives in two places, the rail highlight flips, section names mislead

Labels: design
Issue: #492

Seen by: admin (both walks). Opening Jobs from Site highlights Home in the rail and shows the Home
sidebar. Rail glyphs are cryptic with tiny labels; "Denver" is not an obvious name for places,
weekend and outings; "Site" hides analytics and jobs. Sidebar counts are inconsistent (Games has
one, Comics and Closet none) and stale after an add.

Acceptance: Jobs has one home and the highlight never changes under the user; section names say
what is inside; counts are shown everywhere or nowhere, and update.

## Admin: Add flow uses "sitting" and creates a record on a card click

Labels: design, bug
Issue: #493

Seen by: admin (both walks). Add says "a sitting: one kind, many at once" and "START A SITTING".
Clicking a type card creates a persisted sitting at once, with no confirm; two clicks made two
"unfinished" sittings that then show as banners on Add and Games, and the Garment Add page asked
for photos though its card said "type". Cards have uneven empty space, and Movie and Board game
are offered but no list for them is in the Shelf nav.

Acceptance: plain wording ("batch"); a sitting is created on the first photo or add, not on a card
click; the card layout is tidy; every kind on Add has a visible home.

## Admin: comic add flow wording and polish

Labels: design
Issue: #494

Seen by: admin. "No match? Keep 'X' as typed:" is followed by a tiny "Comic" chip that does not
look clickable (the first walker never found it and reported no manual entry); a typed-as-is comic
is labelled "MATCHED... untick anything wrong"; "Finish later" is low contrast; the Done title
reads "Comic · Nov 19, 7:14 AM is in" and its primary button is "Shoot the next box", not Publish;
the result dropdown stays open after a choice; "About 1 model call per photo; 108 left today" is
jargon.

Acceptance: the keep-as-typed route is a visible button; labels match what happened; Done offers
Publish first; budget text is plain.

## Admin: list toolbars are crowded, reflow and use mystery glyphs

Labels: design
Issue: #495

Seen by: admin (both walks). The Games header holds the title, "0 of 1 public", a View link, Add
games, Publish all, Hide all, Refresh game metadata and Shelf/List; opening the publish confirm
re-wraps it. The big search box is also the add box, beside an unlabelled square icon button; its
placeholder is cut at 390px. The Closet toolbar mis-wraps ("From links" full width beside a boxed
glyph) and its placeholder is cut. Glyphs (▤ ▥ ▦) carry meaning with no label.

Acceptance: toolbars group primary and bulk actions; every icon button has a visible or accessible
name; placeholders are not clipped at 390px.

## Admin: card controls appear on hover, resize the card and sit close to Delete

Labels: design, accessibility
Issue: #496

Seen by: admin. On Games and Comics, stars (ten 9px-wide buttons), the status select, Public, Up
next, Redo and Delete appear only on hover and grow the card by about 100px, pushing the grid.
Delete is a 54x18 text link next to Redo, which is unexplained. Hover-only controls are a problem
for touch and keyboard users. Delete and Discard confirmations were not tested.

Acceptance: controls do not change the card's height; they are reachable by keyboard and touch;
Delete sits apart from Redo; Redo says what it does.

## Admin: Closet Today shows a made-up temperature and a huge blank photo

Labels: design
Issue: #497

Seen by: admin (both walks). With no forecast it shows "25° → 52°" and "dressed for a typical
November day"; one garment draws a 540px empty photo placeholder; loading says "Waking the server
or planning the day · 3 s" for about 10 s and ends with "Model: The model's outfits did not hold
up" and "picked without the model". The first walk also saw the footer flicker between "0 active"
and "6 active · 3 fit today" while the card said nothing fit.

Acceptance: no figure is shown without a forecast; placeholders are sized to content; copy avoids
"model"; counts agree with the card.

## Admin: Weekend page hides its editor and misaligns cards

Labels: design
Issue: #498

Seen by: admin. "Edit" beside the constraint chips opens a Constraints panel at the bottom,
off screen, and nothing changes at the top. The Sunday card sits 32px lower than Saturday. "Save /
Been / Skip" is ambiguous, and a suggestion says "Last there today".

Acceptance: the editor opens in view; day cards align; the three actions say what they do.

## Admin: Spots page is cramped, logs a visit with no undo, and edits at the top

Labels: design, bug
Issue: #499

Seen by: admin (both walks). The All spots table is squeezed into the right half (name wraps, "Log
visit" clipped, Edit off the edge at 390px) while the left half holds a small Spot finder card.
"Log visit" logs instantly with no undo. The Edit form opens at the top and pushes the page down.
One click on the Public checkbox was ignored and worked on retry (single sighting; needs a repro).
#459 (the table widening the page sideways) is a related cause.

Acceptance: the table uses the width; Log visit can be undone; editing happens in place or in a
sheet; the checkbox click is reproduced or dropped.

## Admin: Pull list puts the first action last

Labels: design
Issue: #500

Seen by: admin. "Following 0 series" and four "Nothing out." week blocks come before "Find a
series", the first thing to do. The blue Refresh does nothing with 0 series ("Refreshed 0 series."
and "last refresh never" stays).

Acceptance: with no series, Find a series leads; Refresh is disabled or hidden until there is one.

## Admin: Sources, Discover and Radar are dense and full of unexplained terms

Labels: design
Issue: #501

Seen by: admin. Sources has seven stat cards, rows with and without actions, and five bulk buttons
(Refresh stores, Refresh registry, Refresh N64, Refresh Switch 1, Resolve) under a jargon intro
(r/NSCollectors, IGDB). Discover and Radar offer platform chips on an empty database; "Needs
match", "Include Game-Key Cards" and a quota-spending Generate button that looks the same as a
harmless one are unexplained.

Acceptance: each page opens with one plain line on what it is for; quota-spending actions look
different and say the cost; bulk and per-row actions are separated.

## Admin: forms leave half a wide screen empty

Labels: design
Issue: #502

Seen by: admin (desktop walk). Closet Profile is about 575px of 1440 with a long column of blank
fields ("Mids" is jargon), garment detail is a single column with a lone "← Closet" link far
top-right, and the place form leaves the right 40 to 50 percent empty, while dashboards use two
columns well.

Acceptance: long forms group into sections or columns at wide widths; the back link sits with the
title.

## Admin: sign-out is hard to find and the signed-out page is a dead end

Labels: design
Issue: #503

Seen by: admin (both walks). Sign out is a 51x21 link in the sidebar footer, and at the very bottom
of long pages on a phone. After it, a bare "Admin / Sign in with Google" card appears with no
"signed out" message and no link back to the public site.

Acceptance: an account menu with email, View site and Sign out is reachable without scrolling;
the signed-out page confirms and links home.

## Admin: a new admin gets no orientation

Labels: enhancement
Issue: #504

Seen by: admin (both walks). Home gives no "start here"; Shelf, Closet, Denver and Site are
unexplained. Empty Comics says only "No comics on the shelf yet." with a small header link; the
Site card repeats "Analytics →" and "Jobs →" twice; cards on Home paint with "Loading..." and then
vanish, shifting the layout; the first walk saw "Owned 7" on Home against 4 on Games (seeded
database, unconfirmed).

Acceptance: an empty install shows a short first-day checklist (add a game, add a place, add a
garment, publish, look at the public page); empty states name their main action; Home cards keep
their space while loading.

## Admin polish: spelling, spacing and small targets

Labels: chore, accessibility
Issue: #505

Seen by: admin. "Colour", "Colouring" and "Store colour" sit beside "Primary color"; the phone chip
reads "Active1" with no space; "Run now" is 53x21, Delete 54x18, header links about 21px high.

Acceptance: one spelling throughout; chip labels spaced; admin tap targets meet the same minimum as
the public site.
