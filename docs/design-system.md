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

Tokens (colour, type, spacing, status marks) are in `frontend/src/styles/tokens.css`
(base rules in `base.css`, print in `print.css`) and their rules in CLAUDE.md → Conventions. Words are in `docs/voice.md`.

The Tailwind v4 and shadcn/ui build setup (layers, adding a component) is in
`frontend/CLAUDE.md` → "Design system setup".

## Page types

| Type | What it is | Parts, top to bottom | Width |
|---|---|---|---|
| **List** | Many things of one type: Games, Comics, a Year in review | Area band (`SpineHeader`) · page header (`PageHeader`, no trail) · figures (`StatTile` row) · search and links · labelled filters (`FilterChips labelled`) and sort · result bar (`ResultBar`) · the grid (`PosterGrid`) · overview · empty or error state | Full |
| **Detail** | One thing: a game, a comic series | Breadcrumb · detail head (cover beside `PageHeader`'s title and facts) · sections as `item-card` panels · source attribution | Full, sections at reading width |
| **Sub-detail** | One part of a detail: a comic issue or edition | Breadcrumb · detail head · description with its source · neighbours (`NeighbourStrip`) | Full, text at reading width |
| **Tool** | Something you use: Daily game, Pick for me, Denver, the admin pages | Area band where the page has one · page header (`PageHeader`; a kicker may carry the day) · for a game, one `Card` holding its controls and its result; Pick for me and Denver keep chips over their results (cards, or a map beside a list) · the result's buttons (`Button`, one primary) · a muted status line. See [Charts and tools](#charts-and-tools) | Reading for a game, full for a map |
| **Prose** | Something you read: posts, TIL, About, Colophon | The page's own `h1` (title, optional lede), then the text. See [Prose pages](#prose-pages) | Reading |

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
| Page header | `PageHeader` | Every list, detail and tool page's `h1` comes from it: optional trail, optional kicker, the title, optional lede. On list pages it sits under the area band with no trail. Prose pages and the gaps in the table below are the only other files with an `h1`, and `designConsistency.test.js` fails a new one. |
| Area band | `SpineHeader` | The shelf's name, tagline and tabs, on shelf list pages only. It is not a page header and never holds the page's `h1`. |
| Breadcrumb | `Breadcrumb` | The one way back on detail and sub-detail pages, at the top. The trail is area › type page › parent › this page, every crumb but the last a link. No second "back" link anywhere on the page. |
| Card (a thing) | `PosterCard` in `PosterGrid` | One card per item on every list page, games and comic series alike. A card's owner controls are a sibling of its link (CLAUDE.md). |
| Cover (a book) | `CoverTile` | A comic issue or collected book inside a title: the cover wall (`CoverWall`), the Books wall (`BookWall`, owned books and hollow "not owned" places), the neighbour strip and the book page. Never on a list page. |
| Figure | `StatTile` (`StatTiles` for a row) | Every number shown as a figure, public and admin. |
| Filter row | `FilterChips` with `labelled` | Every chip row has a visible label naming what it filters, on both sides. A row whose chips would match nothing is not drawn (`FilterChips` hides a group of one; a type with no rows gets no chip). |
| State pill | `StatePill` | A thing's state in words and colour: owned, read, missing, not out, skipped, and the play statuses. One pill per state, the same words everywhere (`content/spine.js`). |
| Empty state | `EmptyState` | One sentence saying what is missing, an optional line, and the next step as a link or button when there is one. Words from `content/`. No page writes its own empty box or `*-empty` class (`designConsistency.test.js`). |
| Load error | `LoadState` | A failed read says so in the shared words (`content/status.js`) with Try again; a stale but painted page says it quietly. A bare `{LOAD_ERROR}` paragraph is refused, and every `admin-error` is a `role="alert"` (`designConsistency.test.js`). |
| Button | `Button` (`components/ui/button.jsx`) | Every button and every link that looks like one. Flat, a 1px outline, no shadow; the primary variant fills with `--accent`. **One primary button per view.** A link-button is `render={<Link />}` with `nativeButton={false}` (it keeps `role="link"`), or `buttonVariants` on a plain `Link`. A filter chip is `Button variant="chip"` (`FilterChips`). New code does not write `className="btn"`; the legacy `.btn` stays on pages not yet migrated (#536). |
| Label | `Badge` (`components/ui/badge.jsx`) | A small mono label with an outline: a tag, a count, a version. `accent` is the one filled variant. A badge names a thing; it is not a status (see Status mark) and not a match confidence (see below). |
| Text field | `Input` (`components/ui/input.jsx`) | A one-line field: 1px ink outline on the card colour. Always with a visible or `aria-label`led label. |
| Tabs | `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` | **Sections of one page** that swap in place: a rule under the list and a 3px accent bar under the active tab; arrow keys move focus, Enter or Space selects. Where the choices are other pages, they are links (`SpineHeader`), not tabs. |
| Rule | `Separator` | A divider between two groups inside one block: 1px `--line`, `role="separator"`. A section's own heading rule and a card's inner rules are CSS, not a `Separator`. |
| Card | `Card` (`components/ui/card.jsx`) | A box on the card colour: 1px `--line` outline, 6px radius, no shadow. Rules inside it use `--line-card`. |
| Panel | `Panel` | A titled section on an admin page: Card's surface (1px outline, 6px radius, the card colour) with a serif 18px title over a hairline and an optional header link (24px tall, 44px on a phone, the 2px ring). `AdminPageHeader` keeps its markup, ids, aria and heading level: only its look changed (serif title, hairline under it). Strings in `components/adminHomeClasses.js`. |
| Record card | `RecordCard` | One record in a **numbered collection**: a mono label strip (catalogue number left, type or status right), a 3px accent left edge, the body below. A card that is not part of a collection is a `Card`. It takes Card's shell from `ui/card-classes.js` (the same string `Card` uses), with no padding of its own, and joins classes with `lib/cx.js`, so it is safe in the entry chunk. |
| Catalogue number | `CatalogueNumber` | "No. 007": decorative (`aria-hidden`), mono, on a record card's strip, **collections only**. It never stands in for a title or an id, and no page draws one by hand. |
| Status mark | `StatusMark` | A small outlined square, filled `--highlight` only when `live` or `finished`, **always with its word beside it**: colour never carries the meaning alone. The word's text colour is `--text-2`, never `--accent`. It is for a record card's status; the words and colours of a thing's state on the shelf (owned, read, missing) stay with `StatePill` on the detail pages; the public Games and Comics cards are `RecordCard`s whose strip holds the number and a `StatusMark` (`active` draws as `live`). |
| Account menu | `AccountMenu` | The admin's one place for who is signed in, View site and Sign out (#503). The `jh` mark at the head of the rail is its button (labelled Account) on a desktop; on a phone it is a 44px rounded-square quiet button, the mark and a caret, at the left of the segment row, with the panel below. A real `button` with `aria-expanded`, `aria-controls` and the name "Account, <email>"; the panel is a plain list, never `role="menu"`. Escape, a press outside and tabbing out close it; Sign out has no confirm, reads "Signing out…" and ignores a second press, and a failure is a `role="alert"` line in the open panel. No page adds its own sign-out or View site link, and the sidebar and phone foot are gone. Words in `adminCopy.shell`. |
| Dialog | `Sheet` | The one modal (CLAUDE.md), and the only `role="dialog"`: the card action sheet on touch renders through it. A non-modal panel, such as the inline add drawer, is a labelled `aside`, not a dialog. |
| Destructive confirm | `ConfirmDelete` (`ShelfConfirm` for rows) | Asks in place, never in a browser dialog, and names the row and what goes with it, with the real counts (`lib/deleteDetail.js`, words in `content/shelfDelete.js`). A delete that cannot read the counts does not go ahead. |

## Shelf lists

(#532, slice a.) The public Games and Comics lists draw each title as a
numbered `RecordCard` (`PosterCard` with a `number`). The number ("No. 007")
is a position label: the title's place on the whole shelf, oldest first
(`lib/catalogue.js`), stable across filtering, sorting and search, but it
shifts when a title is deleted or made private, so it is never an id. The
status is a `StatusMark` with its word on the strip beside the number; the
strip's word is hidden from assistive tech and the card's link carries the
status as a visually hidden word after the title, so it is read once. The
card's one link covers it, with an inset keyboard ring (`CARD_LINK`); the
title is underlined in the accent, unclipped.

**Deviation from the mockup (3b1):** the mockup keeps only the number on the
strip and puts status and year at the foot. Here the status sits on the strip
with the number and the card keeps its cover, year and rating; at 320px the
grid is one column because a strip's number and word do not fit two across.

**Pressed state.** A filter row that picks one value is underline tabs
(`FilterChips labelled`: a 3px accent bar and weight). Anything that toggles
or sits beside the rows (a `FilterChips` toggle, Comfortable, Dim finished,
Cards and Spines) is a chip button whose pressed state is the ink as a fill
with the page colour on it and weight (`PRESSED_FILL`, measured in
`contrast.test.js`), never a thin rule or colour alone. Search is `Input`, and
the Overview figures on the public Games and Comics pages are boxed
(`STAT_CARD`).

**Spines** is an alternative layout, never the default, kept only in the URL
(`?view=spines`, set with `replace: true`, so toggling adds no history
entry): upright labels on a rail (`SpineCard`), each a link named by its
title with the status as a visually hidden word, a key to the mark over them
(`SpineKey`), and a title that wraps rather than clips (a spine stays under
about 24rem tall; the rail is three columns on a small phone, then 4, 6 and
12).

**Admin twins (#532, slice b).** `/admin/shelf/games` and `/admin/shelf/comics`
draw the same numbered record cards (`PosterCard` with a `number`, in a
`PosterGrid layout="records"`) with the owner's controls as a sibling of the
card's link, in a box above its cover-wide `::after` so they take clicks
(`PosterCard`'s `actions` prop). A private row carries its Private tag. The
admin number counts every row, private included, so a title can be a
different number here than on the public list: it is a position label, never
an id. The page header's actions, the nudge, the bulk bar and the card panel
are the Button look (`components/adminShelfClasses.js`): outline buttons,
toggles with the filled pressed state (`TOGGLE`), `SELECT` and `CHECKBOX`
with the same ring, and the armed Delete/Redo buttons through
`ConfirmDelete`'s `armedClassName`. Each carries `max-[700px]:min-h-11`,
since the Button look has no phone target of its own. Finished and abandoned
titles fade only their cover on the admin lists (`.collection-list`), so the
replay and heart marks keep their contrast. The List view's table keeps the
shared `.item-table` look (Spots and Catalogue read it) until a later slice.

**What the shared pieces reach.** `STAT_CARD` is used by the public Games and
Comics pages only; `/shelf/next` does not draw it. `ResultBar`'s count line,
`FilterChips labelled` and the `ShelfToolbar` chip buttons are shared by the
public and admin lists.

## Shelf details

(#533.) The item page, the comic title page, an issue, a book and the Year and
Month in review take their look from utility strings in
`components/detail-classes.js`, not from the legacy sheet. The detail head is
the cover beside a `PageHeader` (kicker, title, one muted line), under the
`Breadcrumb`; a long word in the title breaks inside its box rather than push
the page sideways (`PAGE_WRAP` on each page's root). A game's and a comic
title's status line is a `StatusMark` with its word (filled for finished and
playing); an issue's and a book's state stays a `StatePill`. Sections are
panels (`PANEL`: Card's shell, 6px radius, 1px outline, no shadow, body text
at 16px) with a serif 18px heading over a hairline, never upper-case: the
wall, books and single-book panels take the same heading (`PANEL_HEAD`), so
the comic title page reads as one set of panels (the admin comic page shares
those three components and so takes it too). What's next is three `RecordCard`s with no number (a catalogue
number is for collections, and a detail page has no whole shelf to place the
title in without a new read), and tags and platforms are badge-look chips that
may wrap. A control that was a legacy `.btn.sm` is a `buttonVariants` button
and keeps its 44px phone target (`PHONE_TARGET`). A pressed toggle is built
with `cn`, which merges, since `cx` would leave two `aria-pressed` fills in the
sheet (`classCollisions.test.js` fails any such join). Whole-link rings on the
neighbour strip are drawn inside the tile (`NEIGHBOUR_RING`), because the strip
scrolls and would clip an outward outline.

`Breadcrumb` is restyled in utilities, and it is shared: blog posts, TIL notes,
trips and the admin comic and book pages draw it too, so they have the same
trail (13px, the current crumb in ink and medium weight, the trail wraps and
breaks a long word, the owner's Edit link sits to the right and drops under
the trail when it does not fit). `Breadcrumb` and `PageHeader` are eager files.

Still legacy, shared with the admin twins until #536: `CoverWall`, `BookWall`,
`SingleBookCard` (their panel box, `.item-card`, now 6px like `PANEL`),
`StatTile`, `PlaythroughTable`, `StatePill`, `MonthIndex`, `.edition-neighbour`
(the admin book page) and the chips' CSS (`PlayNext`).

## Prose pages

A prose page (Home, About, Projects, Now, Colophon, Blog, TIL and their
posts, Not found) keeps its own `h1` in its article: the title, then an
optional lede, then reading-width text. It does not use `PageHeader`, which
is for pages with a trail, a kicker or a list under them. Only a prose page
may hand-write an `h1`, and the list is in `designConsistency.test.js`.

Parts of a prose page (#531). A collection on one (Projects, the Blog
index, the TIL notes) is one numbered `RecordCard` per entry, with the type
or date on the strip. A card holding a single link (a Blog post) makes its
title link cover the card, and that link's keyboard ring is inset
(`WHOLE_CARD_LINK` in `components/prose-classes.js`), since the card clips an
outward ring; a card holding several links (a project, a note) links only
its title. Facts and the contents list are record cards with no number. Tags,
tech, toolbox and certification chips are `TagList` and the draft mark is
`DraftBadge`, both on the badge's look from `ui/badge-variants.js`, which an
eager page takes instead of `Badge` (Base UI and `cn` stay out of the entry
chunk). A section's `h2` is the serif with a 1px rule (`SECTION_HEAD`).

A drawn diagram on a prose page is a `<figure>` like `ArchitectureFigure`
(Colophon): an inline SVG drawn with tokens, `role="img"` with an
`aria-label`, and a `<figcaption>` that carries the same facts as a list,
since the SVG's children are presentational. Its text and lines are measured
on contrast (4.5:1 and 3:1) and the ratios recorded beside its CSS. A project
card's hero is a pair of WebP files, dark and light, from
`scripts/project-heroes.mjs`.

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

## Charts and tools

(#534, 20 Nov 2026.) The site's charts are hand-built bars, not the shadcn
Chart: Chart is recharts, a new runtime dependency and a bundle cost for four
bar rows, with no behaviour the bars lack. The rules below keep them measured.

- **A bar is a track and a fill.** The track (`.bar-list-track`, `.tour-bar`,
  `.pick-term-bar`) is `--sunken` with a 1px `--line-card` outline, which is a
  3:1 mark on the card; the fill is `--chart` (3:1 or better on the track in
  both themes), or `--accent` for a score meter. The day chart's bars are
  `--chart` on the card. `contrast.test.js` holds every pair.
- **A chart's words are text tokens**: labels and numbers in `--text` or
  `--text-2`, never `--chart` as text, and never faded with `opacity`. A bar is
  `aria-hidden` and the number beside it carries the value; a chart with no
  numbers on it says its peak in words (`DayBars`).
- **A chart sits in a `Card`**; ranked lists share one card each, with
  `--line-card` rules between rows. A changelog day is a `Card` too, its date
  the mono label.
- **The Daily game's cells** keep their three states: match is
  `--accent-ink` on `--status-active` (text, 4.5:1), close is a `--warn` ring on
  the card (a 3:1 mark), no is the plain cell in `--text-2`; the hidden state
  word in each cell carries the same for a screen reader. `contrast.test.js`
  measures all three in both themes.
- **A choice is a chip**: a toggle is `Button variant="chip"` with
  `aria-pressed`; a radio drawn as a chip keeps its native input, visually
  hidden, and its label carries the chip look, the checked bar (`data-checked`)
  and the focus ring (`has-focus-visible`). A chip row has a visible label,
  Denver's phone List / Map toggle included.
- **A Card sets 14px** (`text-sm` in its shell). Where the content is body
  text, the Card says `text-[1rem]` so it stays 16px (Stats' changelog days,
  Daily's card). A Card that holds a combobox is `overflow-visible`, so the
  list is not clipped.
- **A narrow table header** too wide for its column gets a short, visible
  form with the full word visually hidden for a screen reader (Daily's
  "Plat." below 24rem).

## Experience timeline

About's Experience is the page's one rail (`.timeline`). A dot on the rail is a role and a ring is an employer holding several roles.

- An employer with several roles is one `h3` at `--fs-18` with its ring, its dates and a blurb, then the roles as an `ol` of steps. Each role is an `h4` at `--fs-16`, a dates kicker and its bullets. Heading order is h2, h3, h4.
- An employer with one role keeps the `h3` (company and role), the dates kicker and its bullets, with a dot.
- Exactly one dot is the accent, on the present role. A ring is never the accent.
- Bullets are a real `ul` (discs kept, no `role`) at `--fs-14`. Guidance, not a test: at most six bullets per role and three per one-role employer.
- Roles sit on the same rail, with no second indent.
- Print may break between roles, but a role keeps its heading with its bullets, and About's aside stacks above the body.
- Home's shorter list is `homeExperience` and shows neither roles nor bullets.

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

- **Full**: 75rem, 1200px, the masthead's own measure (`page-wide`, `WIDE_ROUTES`). Every shelf route.
- **Reading**: 45rem. Long text inside a full-width page (descriptions,
  the About panel, notes) is capped at the reading measure; prose pages
  are reading width throughout.

Home, About and Projects take the same 75rem through `page-content`
(`CONTENT_ROUTES`) until a landing-page rule is written; no new page uses it.
The masthead and footer rows (`.wrap`) are 75rem on every route, so the
bars line up with a full page and a prose page keeps its 45rem column under
them. Gutters are 2rem, 1rem on a phone; a prose page keeps 1.5rem so its
line length is unchanged.

## Masthead

One masthead on every public route: Home, About, Projects, My Shelf, then
Travel and Blog while they exist, then **More**, a disclosure button that
opens a panel of Now, Stats, TIL, Daily game, Denver and Colophon. TIL and
Denver show only while a note or a spot exists. The list lives in one place,
`lib/navMore.js` (`moreItems`), and feeds both the desktop panel and the
phone sheet's More group, so a new public page is added there. More is
underlined when the route is one of its pages, except Daily game, a My Shelf
tab: on `/daily` My Shelf keeps the underline and the Daily row is marked
current. Below 960px the bar hands over to Menu (the bar needs about 930px
with Travel and Blog both showing). The panel is a disclosure, not a dialog:
no focus trap, Escape returns focus to the button.

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

**Add and recommend pages** (#535, slice c): `/admin/collection/add`,
`/admin/closet/add` and the sitting pages, Discover, Radar and the Pull list
draw their controls and boxes from the Button, Card and Input looks through
`components/addClasses.js` (on `closetClasses.js`): `ibtn` for the intake
rows (44px up to 900px, the shell's phone layout), `bigBtn` and `BIG_PRESSED`
for the Pull list (read in a store, 44px at every width), `TILE` for the
Add page's kind tiles (a disabled tile keeps its ink and is drawn with a
dashed border, so it is never told apart by fading alone), `BOX` for cards
(the unfinished list, a suggestion, Rate a few, the resume line) and
`INTAKE_FIELD` for the add bar, drawer and Details fields. The armed
Discard is the destructive button. Discover's platform chips are the filter
chip, pressed by weight, border and the accent bar. The legacy `.btn` and
`.chip` classes stay for the areas not yet migrated (#536). The ten
half-star targets of Quick rate keep their drawn width (ten 44px targets do
not fit a phone); they are 44px tall on a phone.

**The admin twin of a detail page** (comics 5c): the area rail, a
breadcrumb (Shelf › Comics › the series), `AdminPageHeader` with the page's
actions (a link to the public page when there is one), then `Panel`s in the
public page's order: Series, Issues (the same wall, with taps), Books (each
book has its own admin page, below), the source match, Delete. It carries
every field the public page shows and the private ones besides.

**The admin twin of a Book page** (#334): breadcrumb Shelf › Comics › the
title › the book; the cover and `AdminPageHeader` (the name, with the Comic
Vine link under it); then `Panel`s in the public page's order: On the shelf
(Owned and Read), Facts, Collects, the neighbouring books (owned or not),
then the owner's tools Move to another title and Delete, and a View public
page link when the book is owned and its title public. The admin sees what
the public page shows plus the private rows: a collects entry linked to a
title that is not public carries a **Private** tag, and each entry shows
where it came from. Owned and Read save at once with a status line and Undo;
Delete is `ShelfConfirm` reading the book's own preview.

**The title page by kind** (#330): a comic title's page follows its `kind`
(derived by the backend, never stored): a **run** is the run card and the issue
wall, as ever; a **line of books** replaces them with a Books section, one
`CoverTile` per place in the line (an owned book links to its page with its
number and Owned or Read; a place nothing owned fills is a dashed, hollow
"not owned" tile, a word and never hover-only), then the unnumbered books; a
**single book** leads with that one book (cover, name, format, state, a link
to its page) and draws no wall and no run bar; **books and issues** shows
Books, then Issues (the run card and wall). The line's size is never stated
beyond the highest number owned. The admin twin shows the same kind word in
its header ("Run of issues", "Line of books", "Single book", "Books and
issues"), and keeps the Books panel.

**How a book joins a title** (#330): a collected book is on a series' title
only when `comics.shares_title` (backend) says so: its title, with volume and
format words dropped, equals the series' name, and when its contents are known
at least 60% of their issues (`SHARE_MIN_FRACTION = 0.6`) are that series';
empty contents leave the name match to decide. Otherwise the book is its own
title. A page never needs to repeat the rule: it draws what the API says.

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
| `/admin/shelf/comics/:id/:slug` | Edit book (the twin of `/shelf/:id/:part` for a book) | sub-detail | live |
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

## Palette and headings

Paper and graphite, one accent. Headings (h1 to h3) are Source Serif 4 at weight 500; body is Inter; labels and numbers are JetBrains Mono. Coloured text uses `--accent-text`, `--ok-text` or `--warn-text`; `--accent` itself is for fills, edges and underlines. Text never sits on `--line`, and text is never faded with `opacity`. The token table and the reasons are in `frontend/CLAUDE.md`, "Tokens and theme".

## Not yet migrated

Gaps between the rules and the code on 13 Nov 2026, each closed by the
item that next touches the page. Item 3 (the shelf split) closed: the
hand-rolled `h1` on Games and Comics, `SpineHeader` holding the page `h1`,
`HeroNumbers` (deleted), unlabelled admin chip rows, type chips for types
with no rows, the missing `EmptyState` for Games and Comics, the "Collection"
names and the admin list paths.

| Gap | Where | Closed by |
|---|---|---|
| Hand-rolled `h1` under the area band | `Next.jsx`, `HowItWorks.jsx` | when touched |
| Hand-rolled `h1` on a shell or error page | `AdminLayout.jsx` (the signed-out gate), `RouteErrorBoundary.jsx` | when touched |
| Empty words inline, not `EmptyState` | the Closet and intake lists | when touched |
| Admin game edit and add paths not under `/admin/shelf` | `/admin/collection/:id`, `/admin/collection/add*` | next games detail change |
| The admin comic card shows no sync state: `ItemOut` carries no `issues_synced_on` | `AdminComics.jsx` | item 5 |
