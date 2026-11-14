# Design rules

The layer above the tokens: what each kind of page is made of, which
component does each job, and what things are called. The design step reads
this file before it draws anything (`sdlc-design`), and a design that needs
a rule this file lacks adds the rule here in the same PR.

Decisions only. Each rule names the component that implements it. Where
the code does not follow a rule yet, the gap is listed under
[Not yet migrated](#not-yet-migrated) and is closed when that page is next
touched, not in a sweep.

Scope of this version: the shelf's list, detail and sub-detail pages
(shelf sweep, 12 Nov 2026). Tool and prose pages are named so the feature
list can use them; their rules are added when one of them is next designed.

Tokens (colour, type, spacing, status marks) are in `frontend/src/index.css`
and their rules in CLAUDE.md → Conventions. Words are in `docs/voice.md`.

## Page types

| Type | What it is | Parts, top to bottom | Width |
|---|---|---|---|
| **List** | Many things of one type: Games, Comics, a Year in review | Area band (`SpineHeader`) · page header (`PageHeader`, no trail) · figures (`StatTile` row) · search and links · labelled filters (`FilterChips labelled`) and sort · result bar (`ResultBar`) · the grid (`PosterGrid`) · overview · empty or error state | Full |
| **Detail** | One thing: a game, a comic series | Breadcrumb · detail head (cover beside `PageHeader`'s title and facts) · sections as `item-card` panels · source attribution | Full, sections at reading width |
| **Sub-detail** | One part of a detail: a comic issue or edition | Breadcrumb · detail head · description with its source · neighbours (`NeighbourStrip`) | Full, text at reading width |
| **Tool** | Something you use: Daily game, Pick for me, the admin pages | Not yet ruled | — |
| **Prose** | Something you read: posts, TIL, About, Colophon | Not yet ruled | Reading |

A list page has no breadcrumb: the area band's tabs are its way around. A
detail or sub-detail page has no tabs.

**The order of a list page's parts** (13 Nov 2026), top to bottom: area band,
page header, figures, the search field (with the page's own links, such as
Tonight), the labelled filters and the sort, the result bar (count, Clear
filters and the key to the marks), the grid, then an optional **Overview**
section of charts and favourites. A part a page has no use for is left out,
never moved. The empty state replaces the grid and what is under it.

**The area band** is the one `SpineHeader`: the area's name as a link at
`--fs-28`, the tagline and the tab row. It is never the page's `h1`, so a
list page has exactly one `h1`, in its `PageHeader` under the band. A type's
tab shows only while the build's snapshot holds a public row of that type.

## One of each

| Job | Component | Rule |
|---|---|---|
| Page header | `PageHeader` | Every page's `h1` comes from it: optional trail, optional kicker, the title, optional lede. On list pages it sits under the area band with no trail. |
| Area band | `SpineHeader` | The shelf's name, tagline and tabs, on shelf list pages only. It is not a page header and never holds the page's `h1`. |
| Breadcrumb | `Breadcrumb` | The one way back on detail and sub-detail pages, at the top. The trail is area › type page › parent › this page, every crumb but the last a link. No second "back" link anywhere on the page. |
| Card (a thing) | `PosterCard` in `PosterGrid` | One card per item on every list page, games and comic series alike. A card's owner controls are a sibling of its link (CLAUDE.md). |
| Cover (a book) | `CoverTile` | A comic issue or collected edition inside a series: the cover wall (`CoverWall`), the neighbour strip and the edition page. Never on a list page. |
| Figure | `StatTile` (`StatTiles` for a row) | Every number shown as a figure, public and admin. |
| Filter row | `FilterChips` with `labelled` | Every chip row has a visible label naming what it filters, on both sides. A row whose chips would match nothing is not drawn (`FilterChips` hides a group of one; a type with no rows gets no chip). |
| State pill | `StatePill` | A thing's state in words and colour: owned, read, missing, not out, skipped, and the play statuses. One pill per state, the same words everywhere (`content/spine.js`). |
| Empty state | `EmptyState` | One sentence saying what is missing, an optional line, and the next step as a link or button when there is one. Words from `content/`. |
| Load error | `LoadState` | A failed read says so in the shared words (`content/status.js`) with Try again; a stale but painted page says it quietly. |
| Dialog | `Sheet` | The one modal (CLAUDE.md). |
| Destructive confirm | `ConfirmDelete` (`ShelfConfirm` for rows) | Asks in place, never in a browser dialog, and names the row and what goes with it, with the real counts (`lib/deleteDetail.js`, words in `content/shelfDelete.js`). A delete that cannot read the counts does not go ahead. |

## A mark that is not match confidence

Intake's `ConfidenceBadge` (Exact, Probable, Check, On shelf) says how far a
*title match* is trusted, and only `matching.py`'s string distance decides
it. Any other mark on an intake row is a different thing and does not reuse
that badge, its words or its pill. The first is a comic book's issue number
(comics item, 5a): a line of words under the number field, Read from the
cover (in the run, not in this series' run), Typed, or Couldn't read the
number. Rules for a mark like it:

- The words carry it, colour only repeats them (`--ok`, `--text-3`,
  `--badge`), and it is plain text under its field, not a pill.
- A check decides it, from data the server holds (the series' run); the
  model's own opinion never does. The model only says whether it saw a
  number at all.
- A number typed by hand reads Typed and stands, whatever the check says.
- It never holds back a write by itself: the thing that holds Next is a
  missing value, named in the words beside the button.

## A cover that is a control

(Comics 5c, 13 Nov 2026.) On the series page and the admin comic page the
signed-in owner's cover is a button, and the issue link is its sibling (the
number under it), never nested inside it. Rules:

- The button's name says where the book is and what a tap does: "Saga #5,
  Missing. Mark owned". A tap moves a book one step (missing, owned, read,
  missing); the visitor's cover stays a link.
- A hover label is a convenience: the same words are in the name, and focus
  draws what hover draws.
- Signed in, the wall is open (no fold), because the owner is working on it.
  A long missing stretch folds for a visitor.

## An instantly saved change

A change that writes at once (a cover tap, an issue page's Owned and Read)
says so in a status line under the thing changed (`role="status"`, the same
line each time, not a toast), with Undo beside it, which posts the previous
state back. A refusal replaces the line with the server's own words and
leaves the control as it was. Nothing asks first: Undo is the safety.

## Chips inside a section

A detail page's section may carry its own labelled chip row (the wall's
Show: All, Missing), written the page-level way: a visible label naming
what it filters, `aria-pressed` on the chips, counts in each. It filters the
section only and is not saved.

## Tags

A tag is a curated word from its type's vocabulary (`backend/tags.py`,
`content/tags.js`), never a raw source genre. Tags are drawn in labelled
groups (Play style, Setting and Tone for a game; Genre, Based on and Form for
a comic) and are never mixed with platforms, which are their own labelled
row ("Platforms") on the item page. A list filters by tags with labelled chip
rows (`FilterChips labelled`, counted from the unfiltered list). A chip that
would match more than half of the Games shelf is left out, because it narrows
nothing, and a test holds the page to it. The owner edits tags with the
`TagPicker` on the edit page, and saving them keeps them.

## The source line

Text that comes from Comic Vine says so under it, in the smallest type:
"From Comic Vine" under a description. A description that is empty shows
nothing, no placeholder on a series page; an issue with a cover and no
description still credits it ("Cover from Comic Vine"). The page-end credit
("Comic data from Comic Vine.") stays on every page that shows its data.

## Widths

Two widths on shelf pages, set by `RootLayout`, never by a page's own CSS:

- **Full**: 72rem (`page-wide`, `WIDE_ROUTES`). Every shelf route.
- **Reading**: 45rem. Long text inside a full-width page (descriptions,
  the About panel, notes) is capped at the reading measure; prose pages
  are reading width throughout.

Home, About and Projects keep the 1040px `page-content` measure until a
landing-page rule is written; no new page uses it.

## Names

One name per thing, on the public site and in the admin. Routes and code
names keep theirs (`spine`, `collection`, `catalogue`); only words a
visitor or the owner reads follow this table. `docs/voice.md` holds the
rest of the naming rules.

| Thing | Public | Admin | Notes |
|---|---|---|---|
| The area | My Shelf (masthead, page titles) | Shelf (area rail) | The one sanctioned difference: admin areas are bare nouns (Closet, Denver, Site). |
| All types together | Shelf, at `/shelf`, when built | Shelf | Decided 12 Nov; not built yet. |
| Games list | Games, `/shelf/games` | Games, `/admin/shelf/games` | Built 13 Nov. Replaced the Collection tab. |
| Comics list | Comics, `/shelf/comics` | Comics, `/admin/shelf/comics` | Built 13 Nov. |
| A comic series | the series title | the series title | |
| A comic book | the series title and `#n` | the same | "issue" in sentences, never "book" in a heading. |
| A collected edition | Trade, Omnibus, … (its kind) | the same | |
| Future types | Film & TV, Board games | the same | A type gets a tab, a chip or an admin page only once it has rows. |

## The twin rule

Each public type page has an admin twin with the same name, and the twin's
path is the public path under `/admin` (`/shelf/games` ↔
`/admin/shelf/games`). The admin twin is the same page with controls, not
a different design: same page type, same parts, same order.

**The admin twin's chrome** (13 Nov 2026): the area rail and page list in
place of the public masthead and area band, then `AdminPageHeader` in place
of `PageHeader` (the title, the count public, and the page's actions: a link
to the public twin, Add, Publish all and Hide all, Refresh), then the same
parts in the same order. The card is the same card; the owner's controls are
a sibling of its link, revealed on hover or focus (a "…" sheet on a phone),
except what is a state rather than a control: **Private** always shows.
Bulk publish and hide act on the rows of their own page, by id.

Admin paths that predate the rule (`/admin/collection/:id`, the item edit
pages) move when their page is next touched, and the old path redirects
client-side, as `/spine` does: `/admin/collection`, the old list, redirects
to `/admin/shelf/games`, and a comic opened at `/admin/collection/:id` goes
to `/admin/shelf/comics/:id` (item 5c; a game keeps its path).

**The admin twin of a detail page** (comics 5c): the area rail, a
breadcrumb (Shelf › Comics › the series), `AdminPageHeader` with the page's
actions (a link to the public page when there is one), then `Panel`s in the
public page's order: Series, Issues (the same wall, with taps), Editions,
the source match, Delete. It carries every field the public page shows and
the private ones besides.

**The public mirror**: a public detail page shows what its admin twin shows,
minus the edit controls and the private fields (notes, skips, prices,
following). A fact added to one is added to the other.

Signed-in controls sit in the same places for every type:

- **On a public detail or sub-detail page**, signed in: an Edit link at
  the end of the breadcrumb row, to the admin twin; and only the quick
  actions about the page's own subject (an issue's owned and read, a game's
  status move). Nothing private shows (skips, notes, prices).
- **On a public list page**: nothing. Owner controls live on the admin
  twin's cards.
- **Signed out**, no owner control, skip or private field appears anywhere;
  `test_public_outputs.py` pins the public bodies.

## Feature status

Every route in `frontend/src/App.jsx`. **Live**: public and maintained.
**Dark**: built and deployed, hidden until it has content. **Parked**: no
design changes until it is picked back up (say so in the design that picks
it up).

| Route | Page | Type | Status |
|---|---|---|---|
| `/` | Home | prose | live |
| `/about`, `/projects`, `/now`, `/colophon` | About, Projects, Now, Colophon | prose | live |
| `/stats` | Stats | list | live |
| `/blog`, `/blog/:slug` | Blog, post | list, prose | live |
| `/til`, `/til/:slug` | TIL, note | list, prose | live |
| `/travel`, `/travel/:slug` | Travel, trip | list, detail | dark (no trip published) |
| `/denver` | Denver spots | tool | dark (no spot published; footer link hidden) |
| `/daily` | Daily game | tool | live |
| `/shelf` | redirect to `/shelf/games` until the grouped Shelf page exists | — | live |
| `/shelf/games` | Games | list | live |
| `/shelf/comics` | Comics | list | live |
| `/shelf/next` | What's next | list | live |
| `/shelf/how` | Tour | prose | live |
| `/shelf/intake` | Intake demo | tool | live |
| `/shelf/year`, `/shelf/year/:year` | Year in review | list | live |
| `/shelf/journal/:month` | Month journal | list | live |
| `/shelf/:id` | Game or comic series | detail | live |
| `/shelf/:id/:part` | Comic issue or edition | sub-detail | live |
| `/spine*`, `/collection*` | redirects to `/shelf*` | — | live (legacy links) |
| `/admin` | Home | tool | live |
| `/admin/jobs` | Jobs | tool | live |
| `/admin/shelf/games`, `/admin/shelf/comics` | Games, Comics (Shelf area) | list | live |
| `/admin/collection` | redirect to `/admin/shelf/games` | — | live (legacy path) |
| `/admin/collection/:id` | Edit game (a comic redirects) | detail | live |
| `/admin/shelf/comics/:id` | Edit comic (the twin of `/shelf/:id`) | detail | live |
| `/admin/collection/add`, `…/add/:sittingId`, `/admin/import` | Add, sitting (redirect from import) | tool | live |
| `/admin/play-next` | Play Next | tool | live |
| `/admin/discover`, `/admin/radar` | Discover, Radar | tool | live |
| `/admin/pull-list` | Pull list | tool | live |
| `/admin/catalogue` | Sources | tool | live |
| `/admin/store-list` | Store list | tool | live |
| `/admin/closet`, `/today`, `/review`, `/profile`, `/add`, `/:id` | Closet | tool, detail | live (admin only) |
| `/admin/weekend`, `/admin/spots` | Weekend, Spots | tool | live (admin only) |
| `/admin/analytics` | Analytics | tool | live |
| `*`, `/admin/*` | Not found | prose | live |
| — | Board games (BGG source) | — | parked: BGG needs a registered app (#14) |
| — | Film & TV source in production | — | parked: TMDB not configured (#162) |

## Not yet migrated

Gaps between the rules and the code on 13 Nov 2026, each closed by the
item that next touches the page. Item 3 (the shelf split) closed: the
hand-rolled `h1` on Games and Comics, `SpineHeader` holding the page `h1`,
`HeroNumbers` (deleted), unlabelled admin chip rows, type chips for types
with no rows, the missing `EmptyState` for Games and Comics, the "Collection"
names and the admin list paths.

| Gap | Where | Closed by |
|---|---|---|
| Hand-rolled `h1` under the area band | `Next.jsx`, `YearInReview.jsx`, `Daily.jsx`, `HowItWorks.jsx` | when touched |
| Detail heads hand-rolled beside the cover | `Item.jsx`, `ComicIssue.jsx`, `ComicEdition.jsx` | next games detail change |
| Item status words outside `StatePill` | `Item.jsx` (`statusInWords`) | next games detail change |
| Empty words inline, not `EmptyState` | `Denver.jsx`, other shelf pages | when touched |
| Admin game edit and add paths not under `/admin/shelf` | `/admin/collection/:id`, `/admin/collection/add*` | next games detail change |
| The admin comic card shows no sync state: `ItemOut` carries no `issues_synced_on` | `AdminComics.jsx` | item 5 |
