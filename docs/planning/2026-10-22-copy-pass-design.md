---
status: planned
mockups: none
chosen: none
---

# Copy pass and the My Shelf rename — design

Date: 2026-10-22 · Repo: joey-haas.dev · Read against `main` at `de4002e`.
Follows `2026-10-19-copy-review.md` (most of which has shipped) and
`2026-10-02-spine-design.md` (the name this doc replaces). No mockups: every
change here is a string, and the layouts do not move.

## Problem

The site is written for two audiences at once and still says so in places.
A recruiter reads Home, About and Projects; an engineer reads the tracker
pages and the post. Both now meet a product called Spine, a name that needs
the photo-import story to make sense and reads as a code name on a resume
site. The copy itself is in good shape after the October review, but a line
by line read against the live source still finds: the tracker name on
eleven surfaces (nav, tabs, titles, meta, feed, post, status strip), two
serial-comma styles on one page, a few sentences built around em-dash
clauses that a skimming reader has to re-parse, a "New" badge the tour spec
said to drop in the next copy pass, and a post whose closing section
promises a page that has since shipped.

## Scope

In:

- Rename Spine to **My Shelf** everywhere a visitor or the owner reads it:
  nav, tracker header and tabs, page titles, static meta, RSS feed title,
  status strip, feature strip, the How-it-works page, Projects, Home,
  Colophon, Now, the post, and the admin where it names the public page.
- A copy pass over every user-facing string on the public pages, the post,
  and the admin, listed below as old → new. Strings not listed stay as they
  are.
- One punctuation decision applied site-wide: the serial comma.
- Drop the "New" badge from the How it works tab.

Out, explicitly:

- Module, file, component, route-param, API field and database names
  (`spine.js`, `SpineHeader`, `spinePaths`, `catalogue`, `favourites`).
  Renaming code is not a copy change; the 2026-10-02 decision stands.
- The admin's second-person voice. It stays "your shelf", "you rated".
- The resume PDF. Its copy was synced in September and is not touched here.
- Any layout, token or component change.
- Nothing else. The OG card is in (below): it says Spine and still wears
  the pre-refresh warm palette.

## Design

### The name

**My Shelf.** Two plain words that say what the thing is, in the owner's
voice the whole site already uses ("what I own", "my list", "my platforms").
It needs no explanation on a Projects card and reads naturally as a nav
label beside Home, About and Projects.

Rules for using it:

- Title case, both words, every time: My Shelf. Never "my shelf" as the
  product, never "MyShelf".
- Lowercase "the shelf" keeps meaning the physical shelf and the page that
  shows it ("Back to the shelf", "the newest games on the shelf"). That
  reads fine beside the product name and avoids "My Shelf's shelf".
- The first tab is renamed **Collection** so the header does not read
  "My Shelf › Shelf". The page's h1 stays the product name.
- Avoid the name as a sentence subject where the sentence sounds odd
  ("written by My Shelf each night"); rewrite around it, as the strings
  below do.
- Possessive is fine when needed: "My Shelf's status strip".

### Voice, confirmed

Unchanged from the October review and the header comment in
`content/spine.js`: first person on public pages, second person in the
admin, contractions, American spelling. Two additions this pass makes
explicit so they stop drifting:

- **Serial comma everywhere** ("ratings, favorites, and finishes"). The
  site currently has both styles within one paragraph; Grammarly flags the
  missing ones, and US readers expect it.
- **Em dashes only for a true aside.** Where a dash was doing the work of a
  colon or a full stop, the strings below use the colon or the full stop.
  Dashes that remain are deliberate.

### Routes

*Superseded by the plan's "Route rename: decisions": the routes moved to
`/shelf` in this PR, with every `/spine*` URL still working.*

Keep `/spine`, `/spine/next`, `/spine/year`, `/spine/how`, `/spine/feed.xml`
and the item paths in this pass. The URL is read far less than the label,
the feed URL is in subscribers' readers, and a route rename is code work
that belongs in its own PR. Open question 1 asks Code whether `/shelf` with
redirects is cheap enough to ride along; the copy below works either way.

### Strings, old → new

Paths are where the string lives today. "Keep" means the line was read and
stands.

#### Site chrome

| Where | Old | New |
| --- | --- | --- |
| `RootLayout.jsx` nav | `Spine` | `My Shelf` |
| `SiteMast.jsx` | `Resume ↓` | Keep |
| `SiteFooter.jsx` | `Source · Now · Colophon` / `Sign in` / `Admin` | Keep |
| `index.html` description (both) | `…and Spine, a tracker for a physical game collection.` | `…and My Shelf, a tracker for his physical game collection.` |
| `index.html` og:image:alt | `Joey Haas, senior software engineer, and Spine, a tracker for my physical game collection.` | `Joey Haas, senior software engineer, and My Shelf, a tracker for his physical game collection.` (third person, like the description beside it) |
| `prerender-lib.mjs` feed title | `` `${spine.name}: finished games` `` | Keep the template; it becomes `My Shelf: finished games`. |
| `RootLayout.jsx`, several pages | `Loading…` | Keep |

#### Link-preview card (`public/og-card.png`)

The current card (1200×630) reads "Joey Haas / Senior software engineer ·
Denver, Colorado / Spine — a tracker for my physical game collection" on
the old warm brown background. Regenerate it with the same recipe as
`2026-10-02-spine-plan.md` step 4 (a scratch HTML file screenshotted by
headless Chrome at 1200×630), with:

- the Ledger palette and faces from the site refresh (dark background
  token, Source Serif 4 for the name, Inter for the rest, the blue accent
  for the rule), so a shared link matches the site it opens;
- line 3: `My Shelf · a tracker for my physical game collection`.

`meta.test.js` checks the PNG's dimensions and nothing else, so it needs no
change.

#### Home (`Home.jsx`, `profile.js`)

| Old | New |
| --- | --- |
| Page title `Joey Haas — Senior software engineer, Denver` | `Joey Haas · Senior software engineer, Denver` (the site's title separator is the middle dot everywhere else) |
| Headline `Backend systems where correctness and money are the same problem.` | Keep |
| Lede `I'm a senior software engineer at Guild, building the payments and ledger systems behind employer-funded education. Eight years as a product manager before that, so I care as much about why we build things as how.` | `I'm a senior software engineer at Guild, building the payments and ledger systems behind employer-funded education. I spent eight years as a product manager before that, so I care as much about why we build things as how.` (the second sentence was a fragment; it is the first line a recruiter reads) |
| Facts: `Now`, `Focus`, `Stack`, `Last shipped`, `Playing` | Keep |
| Button `See Spine` | `See My Shelf` |
| Card kicker `Project · live` | Keep |
| `spine.homeLine`: `A tracker for a physical game collection: photo import, a physical catalog, and picks that say why.` | `A tracker for my physical game collection: it reads the shelf from a photo, knows which boxes hold a real cartridge, and picks what to play next.` |
| `thisSite.summary`: `React and Vite, FastAPI behind Google sign-in, Postgres on Neon, and a pull-request pipeline to Render.` | Keep |
| Section link `Full resume (PDF) →` | Keep |

#### About (`About.jsx`, `profile.js`, `experience.js`, `education.js`)

| Old | New |
| --- | --- |
| Bio ¶1 `I'm a senior software engineer at Guild, on the payments team. For five years I've built the backend that funds, tracks and reconciles education benefits for enterprise employers: the APIs that record spending, the ledger behind them, the tax rules on top, and one service's side of a company-wide migration to a new eligibility platform.` | `I'm a senior software engineer at Guild, on the payments team. For five years I've built the backend that funds, tracks, and reconciles education benefits for enterprise employers: the APIs that record spending, the ledger behind them, the tax rules on top, and one service's side of a company-wide migration to a new eligibility platform.` |
| Bio ¶2 `Before the code, eight years as a product manager across enterprise SaaS, payments and video. I still work like one: architecture doc, then team alignment, then the endpoint — and the data forensics when something goes wrong.` | `Before the code, I spent eight years as a product manager across enterprise SaaS, payments, and video. I still work like one: architecture doc first, then team alignment, then the endpoint, and the data forensics when something goes wrong.` |
| Guild (engineer) summary `Owned the APIs that record benefit spending, and the funding side of the company-wide eligibility migration — contract, rollout, alerting, and the incident forensics after.` | `Owned the APIs that record benefit spending and the funding side of a company-wide eligibility migration: the API contract, the rollout, the alerting, and the incident forensics afterward.` |
| Guild (engineer) short `Owned the APIs that record benefit spending, and the funding side of a company-wide eligibility migration.` | `Owned the APIs that record benefit spending and the funding side of a company-wide eligibility migration.` |
| Guild (PM) `Balance tracking and external-benefits administration for Fortune 1000 customers.` | Keep |
| MJ Freeway `Product owner for the core suite of cannabis seed-to-sale software — cultivation, processing, and point of sale — on a two-to-three-week release cadence.` | `Product owner for the core suite of cannabis seed-to-sale software (cultivation, processing, and point of sale), shipping every two to three weeks.` |
| Charter `Roadmap and backlog for three set-top video guide products and their cross-platform features, including accessibility compliance.` | Keep |
| iBAHN `In-room hospitality video platform for Marriott, Hilton, and Four Seasons properties.` | Keep |
| Home's folded row title `MJ Freeway · Charter · iBAHN — Product` | `MJ Freeway · Charter · iBAHN — Product management` |
| Expertise list | Keep |
| Toolbox chips | Keep |
| Education, certifications | Keep |
| `Download the full resume (PDF)` | Keep |

#### Projects (`projects.js`, `spine.js`)

| Old | New |
| --- | --- |
| `spine.projectsTagline`: `A tracker for a physical game collection` | `A tracker for my physical game collection` |
| Description `I collect games on cartridge, and nothing tracked them the way I wanted — least of all whether a box holds the full game or a download code. Spine does. It reads a shelf from a photograph, resolves every title against IGDB, picks tonight's game from the backlog, and watches boutique publishers for the next cartridge worth owning.` | `I collect games on cartridge, and nothing tracked them the way I wanted, least of all whether a box holds the full game or a download code. My Shelf does. It reads a shelf from a photograph, resolves every title against IGDB, picks tonight's game from the backlog, and watches boutique publishers for the next cartridge worth owning.` |
| Highlight 1 `Photo import: a vision model reads titles off the spines; each match is scored by string distance, never by asking the model how sure it is.` | Keep |
| Highlight 2 `A physical catalog: a community registry and twelve boutique stores, collapsed to one honest format per game — full cartridge or Game-Key Card.` | `A physical catalog: a community registry and twelve boutique stores, collapsed to one honest format per game, full cartridge or Game-Key Card.` |
| Highlight 3 `Play Next scores the backlog on six weighted terms, mostly a taste profile from my own ratings, favorites and finishes, plus fit and time waiting. It says why.` | `Play Next scores the backlog on six weighted terms, mostly a taste profile built from my own ratings, favorites, and finishes, plus fit and time waiting. Every pick says why.` |
| Highlight 4 `Discover and Radar: the model only ever picks indices from a list the server built, with a deterministic fallback when it can't answer.` | `Discover and Radar: the model only ever picks positions in a list the server built, with a deterministic fallback when it can't answer.` ("positions" matches the How page; "indices" is the code word) |
| Link `Open Spine` | `Open My Shelf` |
| `spine.projectLine`: `I built this: React and FastAPI on free tiers, Postgres on Neon, and a camera pointed at the shelf.` | Keep |
| This site, description `A React and Vite frontend with a markdown blog compiled at build time, a FastAPI backend behind Google sign-in, Postgres on Neon, and a pull-request pipeline that deploys to Render on merge. Built to be read, and to be read by a recruiter who clicks View source.` | `A React and Vite frontend with a Markdown blog compiled at build time, a FastAPI backend behind Google sign-in, Postgres on Neon, and a pull-request pipeline that deploys to Render on merge. Built to be read, including by the recruiter who clicks View source.` |

#### Tracker header and tabs (`spine.js`, `SpineHeader.jsx`, `SpineTabs.jsx`)

| Old | New |
| --- | --- |
| `spine.name`: `Spine` | `My Shelf` |
| `spine.tagline`: `A tracker for my physical game collection: what I own, what I've finished, and what to play next.` | Keep |
| Tab `Shelf` | `Collection` |
| Tab `What's next` | Keep |
| Tab `Year in review` | Keep |
| Tab `How it works` + badge `New` | `How it works`, no badge |
| `SpineTabs.jsx` aria-label `Spine sections` | `My Shelf sections` |
| Page titles `` `${x} · ${spine.name}` `` | Keep the template (`What's next · My Shelf`). |

#### Collection page (`Collection.jsx`)

| Old | New |
| --- | --- |
| `Search the shelf` / placeholder `Search titles` | Keep |
| `Nothing matches those filters.` / `Nothing on the shelf matches "…".` | Keep |
| `Nothing here yet.` | `Nothing on the shelf yet.` |
| Favorites hint `Pick your favorites — the heart on any card.` | `Pick your favorites with the heart on any card.` |
| Stats headings `On cartridge`, `Status`, `Ratings`, `Finishes`, `Favorites` | Keep |
| Attribution `This product uses the TMDB API but is not endorsed or certified by TMDB.` | Keep (TMDB's required wording) |
| `Game data from IGDB. Comic data from Comic Vine.` | Keep |

#### Status strip and feature strip (`spine.status`, `spine.how.featuresLabel`)

| Old | New |
| --- | --- |
| `Spine status` | `Status` |
| `Last refreshed`, `refreshed in the last 36 hours`, `not refreshed in over 36 hours`, `Catalog`, `Stores watched`, `Picks`, `Discover` | Keep |
| `What Spine does` | `What it does` |
| Feature 1 `Reads the shelf` / `A photo in, titles out, matched to IGDB.` | Keep |
| Feature 2 `Knows the format` / `Cartridge or Game-Key Card, from a registry and twelve stores.` | Keep |
| Feature 3 `Picks tonight` / `Six weighted terms score the backlog and say why.` | Keep |
| Feature 4 `Watches the stores` / `What's out, what's coming, what to skip.` | Keep |
| Feature 7 `Rebuilds nightly` / `Nothing here waits for me to press a button.` | Keep |
| `Take the tour` | Keep |

#### What's next (`spine.next`)

| Old | New |
| --- | --- |
| Lede `What I could play tonight, and what I'm looking for in stores. Full cartridges only, ranked by what I've liked, rebuilt nightly.` | Keep |
| Freshness `Picks`, `Releases checked`, `Suggestions` | Keep |
| Section names | Keep |
| Empty states | Keep |
| `Digital only, or a Game-Key Card in a box. I skip these.` | Keep |
| Band `What's next → Tonight: … · 9 in stores · 13 coming soon` | Keep |

#### How it works (`spine.how`)

| Old | New |
| --- | --- |
| Title `How Spine works, in eight stops` | `How My Shelf works, in eight stops` |
| Meta description `A guided tour of Spine: photo import, the physical catalog, Play Next, Radar, Discover and the nightly job, each public result beside the signed-in tool that made it.` | `A guided tour of My Shelf: photo import, the physical catalog, Play Next, Radar, Discover, and the nightly job, with each public result beside the signed-in tool that made it.` |
| Lede `Everything on the Shelf and What's next comes out of a pipeline I run for myself. Each stop shows the public result beside the signed-in tool that made it, drawn, with the code it runs.` | `Everything on the Collection and What's next pages comes out of a pipeline I run for myself. Each stop pairs the public result with a drawing of the signed-in tool that made it and links to the code it runs.` |
| `Live, from the public API` / `Behind the sign-in` / `Stop` / `Stops` / `store withheld` | Keep |
| Stop 1 title `Reads the shelf from a photo` | Keep |
| Stop 1 claim | Keep |
| Stop 1 why `a model's confidence can't be tested, and a similarity score can. The model returns titles only, so the whole matching path runs in tests without a model call.` | Keep |
| Stop 1 live caption `The newest games on the shelf. The import itself isn't public: nothing about a photo is kept after the request.` | Keep |
| Stop 2 claim `A Switch 2 box can hold the full game or only a key to download it. Spine reads the r/NSCollectors registry, the Switch 1 release sheet and twelve boutique stores, and collapses them to one honest format per game.` | `A Switch 2 box can hold the full game or only a key to download it. My Shelf reads the r/NSCollectors registry, the Switch 1 release sheet, and twelve boutique stores, and collapses them to one honest format per game.` |
| Stop 2 why `any full cartridge in the home region makes a game a cartridge, because a registry row and a store listing usually describe different editions. Switch 1 is region-free, so any region counts there. A format I recorded from my own copy is never overwritten.` | Keep |
| Stop 3 claim `Six weighted terms score the backlog: how much I've liked games like it, how close it is to my favorites, how well it's rated, whether it fits the evening, how long it's waited, and a little random jitter. Each pick says why.` | Keep |
| Stop 3 why lead `No model here.` / text `The scoring is pure Python, tested without a database, and the public reasons are rebuilt from public games only.` | Keep |
| Stop 3 live caption `Up next, which I pin, and the day's picks. The picks change at most once a day.` | `Up next, which I pin by hand, and the day's picks, which change at most once a day.` |
| Stop 4 claim, why, caption | Keep |
| Stop 5 claim `Discover pre-scores released physical games on my platforms, then one Gemini call picks eight of the top twenty and writes the reasons. When the model can't answer, the top eight by score stand in.` | Keep |
| Stop 5 why | Keep |
| Stop 6 title `Fits in a pocket in a store` | `Comes along to the store` |
| Stop 6 claim `The signed-in store list has What's next's sections, built by the same server function, with Got it, Want and Not interested on every row for the shop floor.` | `The signed-in store list uses the same sections as What's next, built by the same server function, with Got it, Want, and Not interested on every row so I can answer from the shop floor.` |
| Stop 7 claim `At 00:17 UTC a GitHub Actions job takes the day's picks, refreshes the registry and the stores, regenerates Radar (and Discover once a week), and redeploys the static site only when the snapshot changed.` | `At 00:17 UTC, a GitHub Actions job records the day's picks, refreshes the registry and the stores, regenerates Radar (and Discover once a week), and redeploys the static site only when the snapshot has changed.` |
| Stop 7 capture note `Some of one run, drawn, in the job's order. Timings are illustrative.` | `Part of one run, in the job's order. Timings are illustrative.` |
| Stop 8 title `Keeps the private parts private` | Keep |
| Stop 8 claim `A test pins exactly which keys a public row may carry and walks every body for forbidden ones. Reasons are rebuilt over public games only, and a model's sentence is published only when every game it cites is public.` | `A test pins exactly which keys a public row may carry and walks every response body for forbidden ones. Reasons are rebuilt from public games only, and a model's sentence is published only when every game it cites is public.` |
| Closing links `The long version` / `Source on GitHub` / `Back to the shelf` | Keep |

#### Now (`Now.jsx`)

| Old | New |
| --- | --- |
| `What I'm playing, what's next and what I just finished, written by Spine each night rather than by hand.` | `What I'm playing, what's next, and what I just finished. My Shelf writes this page every night, so it's never more than a day old.` |
| `Nothing to show from this build. The shelf is on Spine.` | `Nothing to show from this build. The collection is on My Shelf.` |
| `Playing`, `Up next`, `Recently finished` | Keep |
| `Also as an RSS feed of finished games.` | Keep |

#### Colophon (`Colophon.jsx`)

| Old | New |
| --- | --- |
| Intro `How this site is built, for anyone who wants to know. The whole thing is open: the source is on GitHub.` | Keep |
| `React 19 and Vite, routed with React Router. Plain CSS with design tokens; no CSS framework.` | Keep |
| `Set in Inter, JetBrains Mono and Source Serif 4, self-hosted rather than loaded from a font service.` | `Set in Inter, JetBrains Mono, and Source Serif 4, self-hosted rather than loaded from a font service.` |
| Dark/light and Shiki line | Keep |
| Blog line | Keep |
| `FastAPI on Python 3.12, with Postgres 18 on Neon. Migrations are additive and applied by hand; the API refuses to boot behind them.` | Keep |
| `Spine reads game metadata from IGDB, and films and comics from TMDB and Comic Vine. Gemini reads titles off shelf photos and writes Discover's picks, answering only with games from a list it's given.` | `My Shelf reads game metadata from IGDB, and film and comic metadata from TMDB and Comic Vine. Gemini reads titles from shelf photos and writes Discover's picks, answering only with games from a list it's given.` |
| `A nightly GitHub Actions job refreshes the picks and the physical release catalog, then redeploys the site when the shelf has changed, so its snapshot stays current.` | `A nightly GitHub Actions job refreshes the picks and the physical release catalog, then redeploys the site when the collection has changed, so its snapshot stays current.` |
| Hosting lines | Keep |

#### Not found, Blog, Year and Month in review

| Where | Old | New |
| --- | --- | --- |
| `NotFound.jsx` | `That page doesn't exist. Try the shelf, or go home.` | Keep |
| `Blog.jsx` | `Writing` / `No posts yet.` / `Draft` | Keep |
| `YearInReview.jsx` | `No finishes recorded in {year} yet.` | Keep |
| `YearInReview.jsx` | `Of {n} rated finishes with an IGDB community score, I rated {x} higher and {y} lower than the crowd. Furthest apart: {title}, which I rated 9/10 against the community's 83/100.` | Keep |
| `MonthInReview.jsx` | `Nothing finished in {month}.` / `Nothing finished or played in {month}.` | Keep |

#### The post (`frontend/posts/how-spine-works.md`)

Keep the slug `how-spine-works` (open question 2). Changes:

| Old | New |
| --- | --- |
| Frontmatter `title: How Spine works` | `title: How My Shelf works` |
| Frontmatter summary `The engineering behind Spine, the tracker for my game shelf: photo import, a physical catalog and picks that say why. One rule runs through it, which is that the model never grades its own work.` | `The engineering behind My Shelf, the tracker for my game collection: photo import, a physical catalog, and picks that say why. One rule runs through it: the model never grades its own work.` |
| ¶1 `Spine is the tracker behind the [shelf on this site](/spine). It knows what I own on cartridge, what I've finished, what I should play next, and what's about to be released that I'd want. This post is the engineering behind it: what each part does, which decisions were deliberate, and where the boring parts are deliberately boring.` | `My Shelf tracks the [game collection on this site](/spine). It knows what I own on cartridge, what I've finished, what I should play next, and what's about to be released that I'd want. This post is the engineering behind it: what each part does, which decisions were deliberate, and where the boring parts are deliberately boring.` |
| "The physical catalog" ¶1 `To know what exists on cartridge, Spine keeps its own catalog.` | `To know what exists on cartridge, My Shelf keeps its own catalog.` |
| "What's next" section (whole) `A year-in-review page for the shelf, the N64 collection on its own platform, and board games once BoardGameGeek issues API tokens again. Beyond that, the thing most likely to improve Play Next isn't code but data: every finish, rating and abandonment sharpens the profile it scores against.` | `Since this was written, the shelf has gained a [year in review](/spine/year) and a [guided tour](/spine/how) of the pipeline above. Still to come: the N64 collection on its own platform, and board games once BoardGameGeek issues API tokens again. Beyond that, the thing most likely to improve Play Next isn't code but data: every finish, rating, and abandonment sharpens the profile it scores against.` |
| Serial commas | Add throughout the post where a list of three or more lacks one (e.g. "genres, themes, keywords, time to beat, similar games, platform list" is fine; "finished, favorited, abandoned or rated" → "finished, favorited, abandoned, or rated"; "fails, times out, or exhausts" already has it). Code blocks and JSON untouched. |

Everything else in the post stands: the numbers were read from the code on
2026-10-02 and nothing in this pass re-checks them.

#### Admin

The admin reads well and stays second person. Changes are the rename where
it names the public page, and a handful of lines.

| Where | Old | New |
| --- | --- | --- |
| `AdminShell.jsx` | group `Collection` › item `Shelf` | Keep (the owner's shelf, with its count) |
| `Admin.jsx`, `AdminAnalytics.jsx` | `Session ended — reload to sign in` | `Your session ended. Reload to sign in.` |
| `AdminCollection.jsx` | `Publish all {n} items to the public collection page?` | `Publish all {n} items to My Shelf?` |
| `AdminCollection.jsx`, `ShelfCardActions.jsx` | `You already have {n} favorites. Unfavorite one first.` | `You already have {n} favorites. Remove one first.` |
| `AdminDiscover.jsx` description | `Physical games already out on your platforms that you would love and do not own, picked from the catalog.` | `Released physical games on your platforms that fit your taste and aren't on your shelf, picked from the catalog.` |
| `AdminDiscover.jsx` | `None chosen: your collection's.` | `No platforms chosen. Candidates come from every platform in your collection.` |
| `AdminRadar.jsx` description | `Upcoming physical releases and open pre-orders from the catalog, ranked by your taste.` | Keep |
| `AdminCatalogue.jsx` description | `What exists physically, and as what: the r/NSCollectors registries for Switch 2 and Switch 1, the boutique stores and IGDB's N64 list.` | `What exists physically, and in which format: the r/NSCollectors registries for Switch 2 and Switch 1, the boutique stores, and IGDB's N64 list.` |
| `PlayNext.jsx` description | `Three picks from the backlog, scored against what you rated, loved and finished.` | `Three picks from the backlog, scored against what you've rated, loved, and finished.` |
| `PlayNext.jsx` | `These picks have little to go on yet. Rate a few finished games and they get sharper.` | `These picks have little to go on yet. Rate a few finished games, and they'll get sharper.` |
| `AdminImport.jsx` | `No titles could be read from those photos. Try a closer or better-lit shot.` | Keep |
| `AdminImport.jsx` | `Reading photo {i} of {n}. Each one takes a minute or two.` | Keep |
| `AdminItem.jsx` | `Delete "{title}"? This cannot be undone.` | `Delete "{title}"? This can't be undone.` |
| `AdminItem.jsx` | `Linked, but the metadata could not be fetched. Try saving again.` | `Linked, but the metadata couldn't be fetched. Try saving again.` |
| `AdminAnalytics.jsx` | `No views yet. The beacon is live; check back tomorrow.` | Keep (Grammarly pass later changed it; see the PR's change table) |
| `nightly.js` | `Sunday evenings only`, `No catalog run yet`, `Rebuilt nightly` | Keep |
| `status.js` | `WAKING`, `LOAD_ERROR`, `ACTION_ERROR` | Keep |
| `Could not …` action errors (`Could not save that.`, `Could not pin that game.`, etc.: 18 strings in `Admin.jsx`, `AdminCollection.jsx`, `AdminImport.jsx`, `AdminItem.jsx`, `PlayNext.jsx`) | `Couldn't …` for each, matching `ACTION_ERROR`'s contraction. Mechanical; one sweep. |

Quoting note: the Old column uses straight apostrophes; the source uses
the typographic ’ (and `&rsquo;` in JSX). Match on the words, and keep the
typographic form in the New strings.

### Accessibility and behavior

Nothing structural changes. Three things to carry:

- The How it works tab loses its `badge`; whatever rendered the badge
  (`SpineTabs.jsx`) should render nothing rather than an empty pill.
- Page `<title>` and prerendered meta for every tracker route pick up the
  new `spine.name` automatically through the templates; `index.html` is the
  one static file edited by hand.
- The RSS `<title>` changes to `My Shelf: finished games`. Feed readers
  tolerate a title change; the `atom:link` self URL does not change.

## Key decisions

- **My Shelf over Game Shelf, Shelf, Backlog, and keeping Spine with a
  descriptor.** Game Shelf was the recommendation for being the most literal;
  Joey chose My Shelf for the owner's voice, which the rest of the site
  already speaks in. Shelf alone was too thin on a Projects card; Backlog
  names only the play-next half; Spine needed a sentence to explain on
  every page it appeared.
- **Collection, not Shelf, for the first tab.** Avoids "My Shelf › Shelf".
  The admin's own "Shelf" link stays, because there the word is not next to
  the product name.
- **Presentation rename only, again.** Code names stay `spine*`; the
  2026-10-02 decision made the same call for `collection` → `spine` and it
  has cost nothing since.
- **Serial comma, site-wide.** One of the two styles had to win; this one
  is the US default and what the resume already uses.
- **Fewer em dashes, not none.** The ones that remain mark a real aside.
  Where a dash separated a list from its lead-in, a colon says it more
  plainly.
- **Post slug unchanged by default.** The post has been shared; a redirect
  is cheap, but it is Code's call (open question 2).

## Component inventory

No new components. Touched content lives in `content/profile.js`,
`content/experience.js`, `content/projects.js`, `content/spine.js`,
`content/status.js` (read only), `posts/how-spine-works.md`, `index.html`,
`RootLayout.jsx` (nav label), `Now.jsx`, `Colophon.jsx`, `Collection.jsx`,
`SpineTabs.jsx` (aria-label and badge), the admin pages named above, and the
tests that assert on exact text (`spine.test.js`, page tests, `meta.test.js`,
`prerender-lib.test.mjs`).

## Acceptance criteria

- `grep -rn "Spine" frontend/src frontend/index.html frontend/posts`
  returns only code comments, identifiers, and spec citations; no string a
  visitor or the owner can read.
- The nav reads Home · About · Projects · My Shelf (· Blog).
- `/spine` renders the h1 `My Shelf`, the unchanged tagline, and the tabs
  Collection · What's next · Year in review · How it works, with no badge.
- `document.title` on `/spine/next` is `What's next · My Shelf`; on
  `/spine/how` it is `How it works · My Shelf`; on Home it is `Joey Haas ·
  Senior software engineer, Denver`.
- `/spine/feed.xml` has `<title>My Shelf: finished games</title>`.
- `index.html` meta description and `og:image:alt` contain "My Shelf" and
  not "Spine".
- `public/og-card.png` is 1200×630, reads "My Shelf" on its third line, and
  uses the refresh palette; `meta.test.js` passes.
- Every "New" string in the table above renders verbatim at its location,
  checked on Home, About, Projects, the four tracker tabs, Now, Colophon,
  and `/blog/how-spine-works`.
- The post's final section links to `/spine/year` and `/spine/how`.
- No user-facing string on the public pages or in the post has a list of
  three or more items without a serial comma.
- Existing tests updated to the new strings pass; no test asserts on
  "Spine" as visible text.

## Review record

Every new string above ran through Grammarly Pro on 2026-10-22 in two
batches (public pages; tracker, Now, Colophon, post, admin). Scores 98 and
96 before fixes. Applied: the Home lede fragment, a comma splicing two
verbs in the tour lede, `changed` → `has changed` in stop 7, `off` →
`from` in the Colophon, `is the tracker behind` → `tracks` in the post, and
one admin empty state Grammarly could not parse. Left alone on purpose:
"least of all" (flagged as wordy; it is the line's point), the deliberate
fragment "Nothing to show from this build.", and a suggestion to drop
"it's given" from the Gemini line, which would have removed the fact.

## Open questions for Code

1. **Routes.** Is `/shelf` (with `/spine/*` → `/shelf/*` redirects, the
   same pattern as `/collection` → `/spine`) cheap enough to ride along, or
   should it wait for its own PR? Recommendation: own PR, after this one.
2. **Post slug.** Keep `how-spine-works` or move to `how-my-shelf-works`
   with a redirect? Recommendation: keep; the title changes, the URL does
   not have to.
3. **`Could not` → `Couldn't` sweep.** Eighteen strings across the admin
   plus their tests. Fine to do in the same PR, or split if the diff
   gets noisy.
4. **Tests that assert on text.** `spine.test.js` checks stop code paths
   and may check copy; `meta.test.js` and `prerender-lib.test.mjs` assert
   titles. Expect to update fixtures rather than logic.

## Answers to the open questions (2026-10-22, Joey)

1. **Routes: in this PR.** `/shelf*` becomes the public path, every
   `/spine*` URL keeps working. It touches `render.yaml`, so it is its own
   milestone behind a carve-out stop.
2. **Post slug: keep** `how-spine-works`.
3. **`Could not` → `Couldn't`: in this PR**, one commit.
4. **Text-asserting tests:** update fixtures to the new strings.

Added scope: every **Keep** string (146 items, 18,152 characters, built
and verified against source; groups and skipped categories recorded in
the PR) and the untouched post paragraphs go through Grammarly via the
Copy Desk round-trip (`~/.claude/skills/copy-polish`). Fixes Joey accepts
there join this PR. A Keep line Grammarly changes is a new decision, so
each accepted change is listed in the PR body as old → new.

# Plan

## Route rename: decisions

Research map (file:line) in the PR's first comment; the load-bearing
points:

- **Source of truth is `content/spine.js`** (`path`, `how.path`,
  `next.path`, tab and link `to:`). `spinePaths.js`, `prerender-lib.mjs`
  (publicRoutes, item/year/month pages, canonical, `og:url`, sitemap, feed
  links) and `projects.js` derive from it. Hardcoded and edited by hand:
  `App.jsx:67-75`, `RootLayout.jsx:18,69`, `Now.jsx:115`, the post's two
  links, `prerender.mjs:108` (writes `spine/feed.xml` from a literal),
  `render.yaml:27-35`, `smoke.sh`, `backend/analytics.py:55-72`.
- **Old URLs redirect client-side**, the `/collection` → `/spine` pattern
  (`App.jsx:39-42,75`): `spine`, `spine/next`, `spine/how`, `spine/year`,
  `spine/year/:year`, `spine/journal/:month`, `spine/:id`, each with
  `replace`. `/collection*` points straight at `/shelf*` (no double hop).
  No Render redirect rules: `:param` matched a trailing slash and looped
  on 2026-10-19, and redirect ordering against `/*` is undocumented.
- **Old shared links keep their previews.** The build also writes legacy
  heads at `dist/spine/index.html`, `spine/next/`, `spine/how/` and
  `spine/<id>/` (canonical and `og:url` → `/shelf…`), and `render.yaml`
  keeps the three `/spine` rewrites. `prerender-lib.test.mjs`'s
  exact-match test covers them via `legacyRoutes()` (routes flagged
  `legacy: true`) instead of being
  loosened. Tradeoff: a few extra files per build vs. every link already
  shared to a recruiter falling back to the generic site card.
- **The feed is written twice**, `dist/shelf/feed.xml` and
  `dist/spine/feed.xml`, same body, `atom:link` → `/shelf`. Existing
  subscribers keep working with no rule. **Item GUIDs stay on the
  `/spine` prefix** (fixed string, not `itemPath`), or all 20 items repost
  as new.
- **Analytics allowlist moves to `/shelf*`.** `/spine*` is dropped: after
  this PR it is only ever a redirect hop, and counting it would double
  count. Historical rows keep their `/spine` path; noted in README.
- **Code names stay `spine*`** (design decision stands).

## Tasks

| # | Task | Files | Tests / AC |
|---|---|---|---|
| **M1** | | | |
| 1 | Push the Keep baseline to Copy Desk as two pages (`joey-haas.dev · keeps: public · 2026-10-22`; `… keeps: tracker, post, admin …`), one `### key` block each | Copy Desk only; no repo change | Both pages read back with 146 keys intact |
| | **STOP: Joey's Grammarly pass, then "pull"** | | |
| 2 | Pull, normalize quotes against source, show change table; Joey confirms which to apply | — | Integrity checks pass; Joey's yes/no per change |
| **M2** | | | |
| 3 | Rename: `spine.name` → My Shelf, tab `Collection`, no badge (renders nothing), aria-label, `index.html` meta, OG alt | `spine.js`, `SpineTabs.jsx`, `index.html`, `RootLayout.jsx` (label) | `grep` AC from the design; tabs/title tests |
| 4 | Public-page strings, old → new: Home, About, Projects, Collection, status/feature strip, How it works, Now, Colophon | `profile.js`, `experience.js`, `projects.js`, `spine.js`, `Home.jsx`, `Collection.jsx`, `Now.jsx`, `Colophon.jsx` | Every New string renders verbatim (page tests); typographic ’ kept |
| 5 | Post: title, summary, ¶1, catalog line, new "What's next" section, serial commas | `posts/how-spine-works.md` | Post test; links point at `/shelf/year`, `/shelf/how` after M3 (written as `/spine/*` here, flipped in task 9) |
| 6 | Admin strings + the 18-string `Couldn't` sweep (own commit) | admin pages listed in the design, `ShelfCardActions.jsx` | Admin page tests updated |
| 7 | Accepted Grammarly fixes from task 2 | wherever the baseline points | Change table matches the diff |
| 8 | Regenerate `public/og-card.png` (Ledger palette, line 3 `My Shelf · …`) | `public/og-card.png` (+ scratch HTML, not committed) | `meta.test.js`; visual check |
| | **STOP: carve-out review (`render.yaml`, analytics allowlist)** | | |
| **M3** | | | |
| 9 | `/shelf` paths in `spine.js`; client redirects for every `/spine*` and `/collection*` route; `WIDE_ROUTES`; `Now.jsx` feed link; post links | `spine.js`, `App.jsx`, `RootLayout.jsx`, `Now.jsx`, post | `App.test.jsx` redirect cases for all seven; ~20 `*.test.jsx` path fixtures |
| 10 | Prerender: `/shelf` heads; legacy heads; feed written twice; GUIDs fixed to `/spine` | `prerender.mjs`, `prerender-lib.mjs` | `prerender-lib.test.mjs` (legacy list, GUID stability, both feeds) |
| 11 | `render.yaml`: `/shelf` rewrites + legacy `/spine` rewrites, `/*` last | `render.yaml` | Exact-match test green |
| 12 | Analytics allowlist → `/shelf*` | `backend/analytics.py` | `test_analytics.py`, `test_analytics_routes.py` |
| 13 | `smoke.sh` → `/shelf`, plus legacy feed content-type check; docs | `scripts/smoke.sh`, `README.md`, `CLAUDE.md`, comments in `spinePaths.js` | `bash -n`; README/CLAUDE.md describe `/shelf` and the legacy files |

Parallel-safe: none. Every task touches `spine.js` or tests that read it.

## Milestones

```
Milestone 1 (auto): task 1
STOP: Joey's Grammarly pass → "pull" → task 2 (confirm changes)
Milestone 2 (auto): tasks 3–8
STOP: carve-out review (render.yaml, analytics allowlist)
Milestone 3 (auto): tasks 9–13
Finish gate → PR
```

## Environment tests

- `cd frontend && npm test && npm run build` after every task's commit.
- `cd backend && ./.venv/bin/pytest tests/test_analytics.py
  tests/test_analytics_routes.py` (one run at a time; shared test DB).
- After the build: `dist/shelf/index.html`, `dist/spine/index.html`,
  `dist/shelf/feed.xml`, `dist/spine/feed.xml` exist; both feeds are
  byte-identical; GUIDs unchanged against `main`'s build.
- Browser, on `vite preview`: `/spine`, `/spine/next`, `/spine/how`,
  `/spine/year/2026`, an item `/spine/<id>/`, `/collection` all land on
  the `/shelf` equivalent; nav reads Home · About · Projects · My Shelf;
  `document.title` per the design's AC.
- Post-deploy: `./scripts/smoke.sh https://joey-haas.dev
  https://api.joey-haas.dev`, then the redirect list above in the browser
  (smoke cannot see client redirects).
