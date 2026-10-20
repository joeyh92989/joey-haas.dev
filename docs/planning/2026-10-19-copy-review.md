# Copy review — joey-haas.dev (2026-10-19)

Read against `main` at `dd77ca7`, alongside the site-refresh design doc.
Copy lives in `frontend/src/content/*.js`, the page components, and
`frontend/posts/`. Each item gives the current line, a proposed line, and
why. Proposals are drafts for Joey to finesse; nothing here is applied.

## What already works

The Spine copy is the strongest writing on the site: first person,
specific, no filler ("Nothing I tried tracked that", "Full cartridges
only, ranked by what I have liked, rebuilt nightly"). The "How Spine works"
post is a real engineering essay, and the Projects card for Spine opens
with a sentence most portfolio sites never manage ("nothing tracked them
the way I wanted — least of all whether a box holds the full game or a
download code"). The problem is not the tracker; it is that the pages a
recruiter reads first — Home, About, Experience — are written in Guild's
internal vocabulary, and the site's voice and spelling drift between
files.

## 1. Site-wide

### 1.1 One voice: contractions or not

Home and the profile bio say "I'm"; `spine.js`, the Next page and the post
avoid contractions ("They are rebuilt every night", "Sort what is in
stores now", "what I have finished"). Both are fine; mixing them reads as
two authors.

Recommendation: contractions everywhere. It matches the greeting voice the
site opens with and the Store list's "Got it". The change is a pass over
`spine.js`, `Now.jsx`, `Colophon.jsx`, `NotFound.jsx` and the post.
If Joey prefers the formal register, flip the three contractions in
`profile.js` and `Home.jsx` instead — a smaller edit, but the site then
greets people with "I am a senior software engineer."

### 1.2 One spelling

The UI mixes British and American: "Favourites" (shelf), "Catalogue"
(admin nav, page title), "normalised" (post) against "status colors"
(Colophon) and "Areas of expertise"/"Program" elsewhere. Joey is in
Denver; the audience is US recruiters.

Recommendation: American in all user-facing copy — "Favorites",
"Catalog", "normalized". Keep the route `/admin/catalogue` and the backend
module names as they are (renaming code is not a copy change); only the
labels and titles move. Note the decision in `spine.js` so it is not
re-litigated.

### 1.3 One "waking" line and one error line

Three versions of the sleeping-server message:

- `Collection.jsx`, `Item.jsx`: "Waking the server — it sleeps when idle,
  so this takes about thirty seconds."
- `spine.js` (Next): "Waking the server. It sleeps when nobody is using
  it, so this takes about thirty seconds."
- `Admin.jsx`: "Waking the server…"

And three error lines: "What's next did not load. Try again in a minute."
/ "More detail could not be loaded. Try again shortly." / "Could not reach
the API. Try again shortly."

Proposed, in one content module both sides import:

- Waking: "Waking the server — it sleeps when idle, so this takes about
  thirty seconds."
- Error: "That didn't load. Try again in a minute."

### 1.4 Page titles

`Admin · Joey Haas` but `Store list · Admin` (no site name). Pick one
pattern: `<Page> · Joey Haas` for public pages, `<Page> · Admin · Joey
Haas` for admin. The refresh spec's `AdminPageHeader` is the natural place
to enforce it.

## 2. Home (`Home.jsx`, `profile.js`)

The refresh replaces the greeting and link cards with a hero and cards, so
most of this page's copy is new. What carries over:

**Intro** — current: "I'm a senior software engineer at Guild, building
the payments and ledger systems behind employer-funded education. Eight
years as a product manager first — so I care as much about *why* we build
things as how."

This is the best plain-language sentence about the job on the site;
"payments and ledger systems behind employer-funded education" says in
nine words what About takes a paragraph to say. Keep it as the hero lede.
Drop the second sentence's em-dash clause or tighten: "Eight years as a
product manager before that, so I care as much about why we build things
as how." (The italic *why* reads as emphasis for its own sake; the
sentence carries it without.)

**Hero headline** (new in the mockup): "Backend systems where correctness
and money are the same problem." It is lifted from the last sentence of
the About bio. Use it in exactly one place — the hero — and cut it from
About (see 3.1), or the two pages open with the same line.

**Link-card subtitles** — "Spine, and this very site." and "The
PM-to-engineer story, plus the resume." are good and go away with the
cards; the "PM-to-engineer story" phrase is worth keeping as the About
kicker or the first section label.

**Facts table** (new): "Last shipped" needs a source or it goes stale in a
week. Either derive it from the newest post/PR or drop the row. "Playing"
comes from the snapshot and is honest by construction.

## 3. About (`profile.js`, `experience.js`, `education.js`)

This is the page that needs the jargon key applied. The resume was already
de-jargoned in September; the site bio was not, so the two now disagree.

### 3.1 Bio

Current, paragraph 1: "I'm a senior software engineer at Guild, where
five years of engineering on the payments team have gone into the backend
systems that fund, track, and reconcile every learner benefit dollar —
spend-writing APIs, funding context, tax classification, and the
eligibility migration underneath them."

Problems: "learner" and "spend-writing APIs" and "funding context" are
Guild words (the jargon key maps them to "student/employee", "the API that
records money applied to a benefit", "a service that records why each
spend decision was made"). "Five years of engineering … have gone into" is
passive and buries the subject. A recruiter outside Guild cannot picture
the system.

Proposed: "I'm a senior software engineer at Guild, on the payments team.
For five years I've built the backend that funds, tracks and reconciles
education benefits for enterprise employers: the APIs that record spending,
the ledger behind them, the tax rules on top, and one service's side of a
company-wide migration to a new eligibility platform."

Current, paragraph 2: "Before the code, eight years as a product manager
across enterprise SaaS, payments, and video. I still work like one:
architecture doc, then squad alignment, then the endpoint — and the data
forensics when something goes wrong. Most useful on systems where
correctness and money are the same problem."

Mostly good. "squad" → "team" (jargon key). The last sentence moves to the
Home hero (2). Proposed: "Before the code, eight years as a product
manager across enterprise SaaS, payments and video. I still work like
one: architecture doc, then team alignment, then the endpoint — and the
data forensics when something goes wrong."

### 3.2 Experience summaries

- **Guild, Senior** — current: "Owned the spend-writing APIs and the
  eligibility-platform migration end to end — API contract, rollout,
  alerting, and the incident forensics after." Proposed: "Owned the APIs
  that record benefit spending, and the funding side of the company-wide
  eligibility migration — contract, rollout, alerting, and the incident
  forensics after."
- **Guild, PM** — "Balance tracking and external benefits administration
  for Fortune 1000 employer partners." → "employer partners" is Guild for
  "enterprise customers" (jargon key). Proposed: "Balance tracking and
  external-benefits administration for Fortune 1000 customers."
- **MJ Freeway** — "Product owner for the core suite — cultivation,
  processing, and point of sale — on a two-to-three-week release cadence."
  Fine. Consider naming the domain once ("cannabis seed-to-sale software")
  because "cultivation, processing" without it is a riddle.
- **Charter** — fine.
- **iBAHN** — fine; real hotel brands help, as the key says.

Role string "Software Engineer I → II → Senior" is readable and honest
about the promotions. Keep.

### 3.3 Expertise and toolbox

Expertise list is good; "System architecture & ADRs" is fine for an
engineering reader.

Toolbox reads as resume keyword stuffing on a web page: "Mocha · Chai ·
Sinon", "Integration testing · BDD", "Snyk". On a site these chips are
skimmed, not matched by an ATS. Proposed: keep Node.js, TypeScript,
Python · FastAPI, React, SQL · PostgreSQL, Snowflake, GraphQL, AWS, REST
API design, GitHub Actions, Salesforce · NetSuite (real vendors, per the
key); drop "Mocha · Chai · Sinon", "Integration testing · BDD" and
"Snyk", or fold them into one chip, "Testing · Mocha, Chai, BDD".

Education: "Back-End Engineering Program" — fine. Certifications: fine.

### 3.4 Resume link

"Download the full resume (PDF)" — good. The refresh puts "Resume ↓" in
the masthead; keep the long form on About.

## 4. Projects (`projects.js`, `spine.js`)

- Spine card: strong. One edit — "picks tonight's game from the backlog"
  then the highlights say "Play Next: six weighted terms score the
  backlog — mostly a taste profile built from my own ratings, favourites
  and finishes, plus fit and time waiting — and it says why." Two em-dash
  clauses in one bullet; split: "Play Next scores the backlog on six
  weighted terms, mostly a taste profile from my own ratings, favorites and
  finishes, plus fit and time waiting. It says why."
- "This Website" → "This site" (the Colophon and Now already say "this
  site"). Description is a stack list and fine for what it is; add one
  line of why: "Built to be read, and to be read by a recruiter who
  clicks View source."
- `projectLine` in `spine.js` ("I built this: React and FastAPI on free
  tiers, Postgres on Neon, and a camera pointed at the shelf.") is the
  best one-liner on the site. Use it on the Projects card instead of the
  tech chips doing all the work.

## 5. Spine public pages (`spine.js`)

- Shelf lede — "A tracker for my physical game collection: what I own,
  what I've finished, and what to play next." Keep.
- Next lede — "What I could play tonight from my shelf, and what I am
  looking for in a store. Full cartridges only, ranked by what I have
  liked, rebuilt nightly." → "What I could play tonight, and what I'm
  looking for in stores. Full cartridges only, ranked by what I've liked,
  rebuilt nightly." ("from my shelf" is implied; "in a store" → "in
  stores".)
- Section names — "Tonight", "On my list", "In stores now", "Coming
  soon", "Further out", "Not on cartridge": clear, parallel. Keep.
- Empty states — "Nothing worth buying today." is a judgement the page
  cannot really make (it means nothing matched). → "Nothing in stores
  right now." "The list is empty, for now." and "Nothing to skip." are
  good. "No picks yet. They are rebuilt every night." → "No picks yet —
  they're rebuilt every night."
- `sortLabel` "Sort what is in stores now" is an aria label; fine, but
  contract it with the rest.
- `notOnCartridge` — "Digital only, or a Game-Key Card in a box. I skip
  these." Good; the clearest explanation of the site's whole premise.
- Band — "What's next → Tonight: Dredge · 9 in stores · 13 coming soon".
  Good.
- Attribution "Game data from IGDB." — terms requirement; keep.
- Freshness fragments ("Picks from", "release list checked",
  "suggestions from") read oddly as three different grammatical shapes
  when they line up. Check the rendered line; if it reads "Picks from Oct
  18 · release list checked Oct 18 · suggestions from Oct 18", make them
  parallel: "Picks Oct 18 · Releases checked Oct 18 · Suggestions Oct 18".

## 6. Now, Colophon, NotFound, Blog

- **Now** lede — "What I'm playing, what's next and what I just finished,
  written by Spine each night rather than by hand." Good. "Also as a
  feed: finished games (RSS)." → "Also as an RSS feed of finished games."
- **Colophon** — will be wrong the day the refresh ships: "Set in
  Newsreader and Public Sans" becomes the new faces; add the analytics
  paragraph ("A cookie-free beacon counts page views; nothing is sent to
  a third party, and signed-in visits are excluded"). The tangled sentence
  "The code highlighting, which Shiki renders at build time in both
  themes, and the shelf's status colors were chosen by measured contrast."
  → "Shiki renders code highlighting at build time in both themes. Its
  colors, and the shelf's status colors, were chosen by measured
  contrast." Also "Migrations are additive and applied by hand; the API
  refuses to boot behind them." — good, keep; it is the most
  engineer-to-engineer line on the site.
- **NotFound** — "That page does not exist." gives no way out. → "That
  page doesn't exist. Try the shelf, or go home." with both as links.
- **Blog** empty — "No posts yet." fine (and currently unreachable since
  the nav hides Blog without posts).

## 7. The post ("How Spine works")

2,400 words, well structured, no changes needed to argument or order.
Line-level: "normalised" → "normalized" (1.2); the first paragraph
promises "where the boring parts are deliberately boring", which is a
good hook only if a later section pays it off — check that one does, or
cut the clause. Contractions per 1.1 if adopted. Consider a two-sentence
summary under the title for people who arrive from LinkedIn and will not
read 2,400 words: what it is, and the one design rule (the model never
grades its own work).

## 8. Admin copy

Deliberately second person ("ranked by your taste", "You finished these
but never rated them") while public pages are first person — a known,
sensible split. Two things:

- "Generate — uses one of today's Gemini requests" is the kind of honest
  label the refresh's `AdminPageHeader` should keep room for.
- `nightly.js`: "Nightly may have stopped: no catalogue run yet" → with
  the Dashboard's jobs panel this becomes a status row; the words can
  shorten to "No catalog run yet".

## Suggested order

1. 1.1 and 1.2 decisions (voice, spelling) — ten minutes, and they
   change how every other edit is written.
2. About bio and experience summaries (3.1, 3.2) — the recruiter path.
3. Shared waking/error strings (1.3) — a content module Code can create
   while building the refresh.
4. Everything else rides along with the refresh pages they belong to.
