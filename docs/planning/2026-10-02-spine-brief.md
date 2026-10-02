# Brief for Claude Code — Spine: naming, positioning and site polish (paste as the opening prompt)

We're starting a short phase called **Spine**. The tracker is now the bulk of the engineering on this site and sits in the top nav, but it goes by three names (nav "Collection", Projects "Media Collection", Home "What I'm playing"), nothing on its page says it is something I built, and the Projects card is one dense paragraph. This phase gives it one name, says plainly what it is everywhere it appears, publishes the "how it works" post the showcase phase deferred, and tidies the site-wide things a hiring manager notices (page titles, meta, footer).

Follow the house process: read `CLAUDE.md`, then brainstorm with me, then write `docs/planning/2026-10-02-spine-design.md` and `-plan.md` in the house format before any code. **No schema change and no backend change is expected**; this is frontend copy, routing and content.

Inputs: this brief; the post draft at `frontend/posts/how-spine-works.md` (already in the repo, `draft: true`); the showcase review at `docs/planning/2026-09-28-tracker-showcase-review.md` for the findings this closes (1, 7, and Part 2 item 1). Current state is `CLAUDE.md`'s TODO.

## The name

The tracker is **Spine**. Capitalised, never "the Spine", never "Spine tracker" in UI copy. The name comes from what the photo importer actually reads off the shelf.

The code keeps its current file and module names (`Collection.jsx`, `public.py`, `/api/public/*`, the admin routes). This is a presentation rename, not a refactor — add a one-line comment where a file's name no longer matches what it renders, and leave it there. Comments that name the old route (`lib/snapshot.js`, `scripts/fetch-snapshot.mjs`, the `/collection` section comments in `index.css`, `Item.jsx`'s doc comment) are updated to `/spine`.

The canonical tagline is the lede on `/spine`, verbatim:

> A tracker for my physical game collection: what I own, what I've finished, and what to play next.

Two other sub-lines are deliberate variants, not drift, because each sits in a context that already says whose it is or needs to say it differently: the Projects card tagline (item 8) and the Home card sub-line (item 4). Nowhere else carries a tagline.

The bare name, with no tagline or project line under it, is allowed in exactly these places: the nav label, the `/spine` `h1`, the Home card title, the Projects card `h2`, the "Open Spine →" link, and the page titles in item 12. Anywhere else, a public mention of the tracker is written as a sentence that says what it is.

## Scope, in order

**A. One name everywhere (frontend only)**

1. Nav in `RootLayout`: Home · About · Projects · **Spine** · Blog. The NavLink stays prefix-active so it highlights on item pages. Extend `RootLayout.test.jsx`, and update every existing test that asserts "Collection" or a `/collection` href (about sixteen assertions across `Home.test.jsx`, `Collection.test.jsx` and `Projects.test.jsx` today).
2. Route: the public shelf moves to `/spine` and items to `/spine/:id`. `/collection` redirects client-side with `<Navigate to="/spine" replace />`; `/collection/:id` needs a small wrapper that reads `useParams` and navigates to `/spine/:id`, since a bare `Navigate` cannot carry the id. Add `/spine` to `WIDE_ROUTES`, replacing `/collection`. Every internal `/collection` link moves too: today that is `Collection.jsx` (five), `Item.jsx` (one), `Home.jsx`, `content/projects.js`, and the nav. The API paths and `/admin/*` do not move.
   - **Smoke cannot see these redirects.** The static host's SPA rewrite answers 200 for every path, and a `Navigate` only runs in the browser, so curl reports `/spine` and `/collection` as 200 whether or not either route exists (`scripts/smoke.sh` already says this about `/blog`). The redirects and the new routes are verified in the browser (E), not by smoke. `smoke.sh` gains no route checks; at most a comment naming `/spine` alongside `/blog`.
   - Server-side redirects in `render.yaml` (real 301s that curl could check) were considered and are out of scope: they put a change in the deploy path, which needs its own zone, for links that the client-side redirect already keeps working.
3. `/spine` gets a proper header block above the hero numbers:
   - `h1`: **Spine**
   - lede: the tagline.
   - a muted project line: *I built this: React and FastAPI on free tiers, Postgres on Neon, and a camera pointed at the shelf.* followed by two links, **How it works →** (`/blog/how-spine-works`) and **Source →** (the repo).
   The existing sub-line ("What I own, what I have finished, and what is still waiting. Mostly physical media.") is replaced by the lede. Everything below the block is unchanged.
4. Home: the third link card becomes **Spine →** with sub-line *The game tracker I built: what I own, what I've finished, what's next.* and keeps its `CoverStrip`. The second card's sub-line becomes *Spine, and this very site.* Home's link-card copy stays inline in `Home.jsx`, as it is today; moving it into `content/` is out of scope (see Constraints).
5. Projects: the tracker card is rebuilt (see B). Where the bare name may appear is listed under "The name".
6. Item page: it has no back link or breadcrumb today, and this phase adds none; the prefix-active Spine nav item already marks where the visitor is. The `/spine` `h1` and loading/error `h1`s in `Collection.jsx` (three today) read "Spine". Admin surfaces keep their current labels; they are private.

**B. Projects card with real detail (frontend only)**

7. `content/projects.js` gains optional fields `tagline`, `highlights` (array of short strings) and `links` (array of `{ to | href, label }`), and `Projects.jsx` renders them: tagline under the name, cover strip, lead paragraph, highlights as a tight list, then the links row, then the tech chips. Keep `strip` and drop `more` (superseded by `links`). Entries without the new fields render exactly as today, so "This Website" needs only `links`. The name stays linked (`to` or `url`) as today, even though the links row repeats the destination: the heading is where a visitor clicks first.
8. Spine entry copy, verbatim:
   - name: **Spine**
   - tagline: *A tracker for a physical game collection*
   - description: *I collect games on cartridge, and nothing tracked them the way I wanted — least of all whether a box holds the full game or a download code. Spine does. It reads a shelf from a photograph, resolves every title against IGDB, picks tonight's game from the backlog, and watches boutique publishers for the next cartridge worth owning.*
   - highlights:
     - *Photo import: a vision model reads titles off the spines; each match is scored by string distance, never by asking the model how sure it is.*
     - *A physical catalogue: a community registry and twelve boutique stores, collapsed to one honest format per game — full cartridge or Game-Key Card.*
     - *Play Next: six weighted terms score the backlog — mostly a taste profile built from my own ratings, favourites and finishes, plus fit and time waiting — and it says why.*
     - *Discover and Radar: the model only ever picks indices from a list the server built, with a deterministic fallback when it cannot answer.*
   - links: **Open Spine →** `/spine` · **How it works →** `/blog/how-spine-works` · **Source →** repo URL
   - tech: React, FastAPI, Postgres, Gemini, IGDB, TMDB, GitHub Actions
9. "This Website" entry: description unchanged; links **Source →** (repo) and **CI pipeline →** (the repo's Actions page). Tech chips unchanged.

**C. The how-it-works post (content)**

10. `frontend/posts/how-spine-works.md` is drafted and in the repo. Review it against the code it describes — every number and rule in it was read from the source on 2026-10-02 (`matching.py` thresholds, `PICKER_WEIGHTS`, `DISCOVER_WEIGHTS`, the collapse rule, `load_public_picks`, `schema_check`, the CI and snapshot workflows). Fix anything that drifted, keep the voice, and flip `draft: false` in the same PR as A and B so the "How it works →" links never point at a 404. It is the first published post (`example.md` is also a draft), so publishing it turns the Blog nav on and the Home "Latest" block on; that is intended, and it also closes the review's finding 2 (Blog in the nav pointing at an empty page).
11. Internal links in the post (`/spine`) assume item 2 landed. If the route rename is dropped, change them to `/collection`.

**D. Site-wide polish (frontend only)**

12. Per-page titles. Every route currently renders `<title>Joey Haas</title>`. Add a small `usePageTitle(title)` hook (no new dependency; `document.title` in an effect) and use it on every page, public and admin. There is no restore on unmount, so a page that forgets to call it keeps the previous page's title; the plan has to cover every route in `App.jsx`, and a test that walks the route table is welcome. `/spine/:id` shows *Spine · Joey Haas* until the item's title is known (snapshot or API), then switches.
    - `/` → *Joey Haas — Senior software engineer, Denver*
    - `/about` → *About · Joey Haas*; `/projects` → *Projects · Joey Haas*
    - `/spine` → *Spine · Joey Haas*; `/spine/:id` → *{item title} · Spine*
    - `/blog` → *Blog · Joey Haas*; `/blog/:slug` → *{post title} · Joey Haas*
    - 404 → *Not found · Joey Haas*; admin pages → *{page} · Admin*
    Test one page's title in its existing test file; test the hook once.
13. Meta in `index.html` (static, site-wide; the SPA cannot vary these per route without prerendering and that is out of scope): `description` — *Joey Haas is a senior software engineer in Denver building payments and ledger systems, and Spine, a tracker for a physical game collection.* — plus `og:title`, `og:description`, `og:type=website`, `og:url`, `twitter:card=summary`. `og:image` only if a 1200×630 asset exists under `frontend/public/`; a plain generated card (name and tagline on the site's dark background) is fine, and if making one is a detour, leave the tag out rather than point it at nothing.
14. Footer: add a left-hand line *© 2026 Joey Haas · Source* (year from `new Date().getFullYear()` at render, not hard-coded and not a build-time constant, which would go stale until the next deploy) and keep the existing contact links and the understated Sign in / Admin link on the right. Nothing louder than that.
15. Project detail page: **no.** The post is the detail page; a `/projects/spine` route would duplicate it. The Projects card's links row is the hub.

**E. Checks, in the plan's last phase**

16. Light theme and a 375px-wide viewport on `/`, `/projects`, `/spine` and one item page: the new header block, the highlights list and the links row must wrap cleanly and the cover strips must not overflow.
17. "Recent picks" on the live `/collection` rendered empty cover boxes beside correct titles and reasons in my review on 2026-10-02, while Favourites and the grid rendered covers fine. Confirm whether `cover_url` is null on those rows or the `CoverImage` inside `.recent-picks-list` is being clipped, and fix whichever it is. Small, but it is on the flagship page. Lead: `/api/public/picks` does send `cover_url` (`public_outputs.py`), and `.recent-pick-cover` shares its CSS with `.coming-cover`, so if "Coming to cartridge" renders its covers, null data on those items is likelier than clipping. Check that first.
18. In the browser, on the local build and again after deploy: `/collection` lands on `/spine`, `/collection/<id>` lands on `/spine/<id>`, both replace history (Back does not bounce), the Spine nav item is active on both, and every page title from item 12 is set.
19. `./scripts/smoke.sh` after deploy, unchanged in what it checks (see item 2 for why routes are verified in item 18 instead).

## Constraints to carry into the spec

- Public pages other than `/spine*` still make no API calls; Home and Projects keep reading the static snapshot.
- Shelf conventions from `CLAUDE.md`: tokens in both theme blocks, `page-wide` via `WIDE_ROUTES`, `role="img"` on non-text marks, nothing hover-only, `useMediaQuery` not `matchMedia`.
- `content/*.js` stays the single source of copy; no strings inline in pages that belong there. Home's link cards are the one existing exception and stay inline (item 4); new copy this phase adds — the `/spine` header block and the footer line included — goes in `content/`.
- Docs follow the rename: `CLAUDE.md` (the architecture note's "Public pages other than `/collection*`", the `WIDE_ROUTES` convention, the Media tracker section and the TODO) and the README's collection-snapshot section say `/spine`, and the TODO gains a Spine entry when the PR is ready.
- Commits conventional, ≤5 files, independently valid; Prettier + ESLint after every file change; frontend suite green; the backend suite is untouched and should stay green without edits.
- One PR for A + B + C + D; the post flips to published in that PR. E is verification, not a PR.

Start by proposing the design doc's Key decisions section — in particular whether to do the `/spine` route rename now (my preference: yes, with the client-side redirects in item 2) or keep `/collection` and only rename the label, and how `Projects.jsx` should render `highlights` and `links` without a new component (the expected shape: conditional `<ul className="project-highlights">` and `<p className="project-links">` blocks inline, as `more` is rendered today) — and ask me anything that changes scope before writing the plan.
