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
| **List** | Many things of one type: Games, Comics, a Year in review | Area band (`SpineHeader`) · page header (`PageHeader`, no trail) · figures (`StatTile` row) · labelled filters (`FilterChips labelled`) · the grid (`PosterGrid`) · empty or error state | Full |
| **Detail** | One thing: a game, a comic series | Breadcrumb · detail head (cover beside `PageHeader`'s title and facts) · sections as `item-card` panels · source attribution | Full, sections at reading width |
| **Sub-detail** | One part of a detail: a comic issue or edition | Breadcrumb · detail head · description with its source · neighbours (`NeighbourStrip`) | Full, text at reading width |
| **Tool** | Something you use: Daily game, Pick for me, the admin pages | Not yet ruled | — |
| **Prose** | Something you read: posts, TIL, About, Colophon | Not yet ruled | Reading |

A list page has no breadcrumb: the area band's tabs are its way around. A
detail or sub-detail page has no tabs.

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
| Empty state | `EmptyState` (added in item 3) | One sentence saying what is missing, and the next step as a link when there is one. Words from `content/`. |
| Load error | `LoadState` | A failed read says so in the shared words (`content/status.js`) with Try again; a stale but painted page says it quietly. |
| Dialog | `Sheet` | The one modal (CLAUDE.md). |

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
| Games list | Games, `/shelf/games` | Games | Decided 12 Nov. Replaces the Collection tab. |
| Comics list | Comics, `/shelf/comics` | Comics | |
| A comic series | the series title | the series title | |
| A comic book | the series title and `#n` | the same | "issue" in sentences, never "book" in a heading. |
| A collected edition | Trade, Omnibus, … (its kind) | the same | |
| Future types | Film & TV, Board games | the same | A type gets a tab, a chip or an admin page only once it has rows. |

## The twin rule

Each public type page has an admin twin with the same name, and the twin's
path is the public path under `/admin` (`/shelf/games` ↔
`/admin/shelf/games`). The admin twin is the same page with controls, not
a different design: same page type, same parts, same order.

Admin paths that predate the rule (`/admin/collection`,
`/admin/collection/:id`) move when their page is next touched, and the old
path redirects client-side, as `/spine` does.

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
| `/shelf` | Collection (games and comics) | list | live; becomes Games at `/shelf/games` in item 3 |
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
| `/admin/collection` | Collection (Shelf area) | list | live; becomes Games and Comics in item 3 |
| `/admin/collection/:id` | Edit item | detail | live |
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
item that next touches the page.

| Gap | Where | Closed by |
|---|---|---|
| Hand-rolled `h1` under the area band | `Comics.jsx`, `Next.jsx`, `YearInReview.jsx`, `Daily.jsx`, `HowItWorks.jsx` | item 3 (Games, Comics); the rest when touched |
| `SpineHeader` holds the page `h1` | `Collection.jsx` | item 3 |
| Detail heads hand-rolled beside the cover | `Item.jsx`, `ComicIssue.jsx`, `ComicEdition.jsx` | item 5c (comics), next games detail change |
| Figures outside `StatTile` | `HeroNumbers` in `pages/Collection.jsx` | item 3 |
| Unlabelled chip rows | admin shelf (`AdminCollection.jsx`) | item 3 |
| Type chips for types with no rows | `Collection.jsx`, `AdminCollection.jsx` | item 3 (the chip row goes) |
| Item status words outside `StatePill` | `Item.jsx` (`statusInWords`) | next games detail change |
| No `EmptyState` component; empty words inline | `Denver.jsx`, shelf pages | item 3 adds it for Games and Comics |
| Names: "Collection" tab, admin page titled "Shelf" but labelled "Collection" | `content/spine.js`, `adminAreas.js`, `AdminCollection.jsx` | item 3 |
| Admin paths not under `/admin/shelf` | `/admin/collection*` | item 3 (lists); item 5c (comic edit page) |
| Issue and edition descriptions carry no source line beside them | `ComicDescription.jsx` | item 5 |
