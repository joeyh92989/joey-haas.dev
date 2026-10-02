# Brief for Claude Code — Spine: naming, positioning and site polish (paste as the opening prompt)

We're starting a short phase called **Spine**. The tracker is now the bulk of the engineering on this site and sits in the top nav, but it goes by three names (nav "Collection", Projects "Media Collection", Home "What I'm playing"), nothing on its page says it is something I built, and the Projects card is one dense paragraph. This phase gives it one name, says plainly what it is everywhere it appears, publishes the "how it works" post the showcase phase deferred, and tidies the site-wide things a hiring manager notices (page titles, meta, footer).

Follow the house process: read `CLAUDE.md`, then brainstorm with me, then write `docs/planning/2026-10-02-spine-design.md` and `-plan.md` in the house format before any code. **No schema change and no backend change is expected**; this is frontend copy, routing and content.

Inputs: this brief; the post draft at `frontend/posts/how-spine-works.md` (already in the repo, `draft: true`); the showcase review at `docs/planning/2026-09-28-tracker-showcase-review.md` for the findings this closes (1, 7, and Part 2 item 1). Current state is `CLAUDE.md`'s TODO.

## The name

The tracker is **Spine**. Capitalised, never "the Spine", never "Spine tracker" in UI copy. The name comes from what the photo importer actually reads off the shelf.

Every public mention uses the name plus the one tagline below; the code keeps its current file and module names (`Collection.jsx`, `public.py`, `/api/public/*`, the admin routes). This is a presentation rename, not a refactor — add a one-line comment where a file's name no longer matches what it renders, and leave it there.

Tagline, used verbatim wherever a sub-line sits under the name:

> A tracker for my physical game collection: what I own, what I've finished, and what to play next.

## Scope, in order

**A. One name everywhere (frontend only)**

1. Nav in `RootLayout`: Home · About · Projects · **Spine** · Blog. The NavLink stays prefix-active so it highlights on item pages. Extend `RootLayout.test.jsx`.
2. Route: the public shelf moves to `/spine` and items to `/spine/:id`. `/collection` and `/collection/:id` redirect client-side (`Navigate` with `replace`) so nothing I've shared breaks. Add `/spine` to `WIDE_ROUTES`. Update `scripts/smoke.sh` to check the new routes and the redirects. The API paths and `/admin/*` do not move.
3. `/spine` gets a proper header block above the hero numbers:
   - `h1`: **Spine**
   - lede: the tagline.
   - a muted project line: *I built this: React and FastAPI on free tiers, Postgres on Neon, and a camera pointed at the shelf.* followed by two links, **How it works →** (`/blog/how-spine-works`) and **Source →** (the repo).
   The existing sub-line ("What I own, what I have finished, and what is still waiting. Mostly physical media.") is replaced by the lede. Everything below the block is unchanged.
4. Home: the third link card becomes **Spine →** with sub-line *The game tracker I built: what I own, what I've finished, what's next.* and keeps its `CoverStrip`. The second card's sub-line becomes *Spine, and this very site.*
5. Projects: the tracker card is rebuilt (see B). The Spine `NavLink` label and the `/spine` page `h1` are the only two places the bare name appears without the tagline or the project line under it.
6. Item page: the back link and breadcrumb read "Spine", not "Collection". Admin surfaces may keep their current labels; they are private.

**B. Projects card with real detail (frontend only)**

7. `content/projects.js` gains optional fields `tagline`, `highlights` (array of short strings) and `links` (array of `{ to | href, label }`), and `Projects.jsx` renders them: tagline under the name, cover strip, lead paragraph, highlights as a tight list, then the links row, then the tech chips. Keep `strip` and drop `more` (superseded by `links`). Entries without the new fields render exactly as today, so "This Website" needs only `links`.
8. Spine entry copy, verbatim:
   - name: **Spine**
   - tagline: *A tracker for a physical game collection*
   - description: *I collect games on cartridge, and nothing tracked them the way I wanted — least of all whether a box holds the full game or a download code. Spine does. It reads a shelf from a photograph, resolves every title against IGDB, picks tonight's game from the backlog, and watches boutique publishers for the next cartridge worth owning.*
   - highlights:
     - *Photo import: a vision model reads titles off the spines; each match is scored by string distance, never by asking the model how sure it is.*
     - *A physical catalogue: a community registry and twelve boutique stores, collapsed to one honest format per game — full cartridge or Game-Key Card.*
     - *Play Next: a taste profile built from my own ratings, favourites and finishes scores the backlog on six weighted terms and says why.*
     - *Discover and Radar: the model only ever picks indices from a list the server built, with a deterministic fallback when it cannot answer.*
   - links: **Open Spine →** `/spine` · **How it works →** `/blog/how-spine-works` · **Source →** repo URL
   - tech: React, FastAPI, Postgres, Gemini, IGDB, TMDB, GitHub Actions
9. "This Website" entry: description unchanged; links **Source →** (repo) and **CI pipeline →** (the repo's Actions page). Tech chips unchanged.

**C. The how-it-works post (content)**

10. `frontend/posts/how-spine-works.md` is drafted and in the repo. Review it against the code it describes — every number and rule in it was read from the source on 2026-10-02 (`matching.py` thresholds, `PICKER_WEIGHTS`, `DISCOVER_WEIGHTS`, the collapse rule, `load_public_picks`, `schema_check`, the CI and snapshot workflows). Fix anything that drifted, keep the voice, and flip `draft: false` in the same PR as A and B so the "How it works →" links never point at a 404. Publishing it turns the Blog nav on and the Home "Latest" block on; that is intended.
11. Internal links in the post (`/spine`) assume item 2 landed. If the route rename is dropped, change them to `/collection`.

**D. Site-wide polish (frontend only)**

12. Per-page titles. Every route currently renders `<title>Joey Haas</title>`. Add a small `usePageTitle(title)` hook (no new dependency; `document.title` in an effect, restored on unmount is unnecessary since every page sets its own) and use it on every public page:
    - `/` → *Joey Haas — Senior software engineer, Denver*
    - `/about` → *About · Joey Haas*; `/projects` → *Projects · Joey Haas*
    - `/spine` → *Spine · Joey Haas*; `/spine/:id` → *{item title} · Spine*
    - `/blog` → *Blog · Joey Haas*; `/blog/:slug` → *{post title} · Joey Haas*
    - 404 → *Not found · Joey Haas*; admin pages → *{page} · Admin*
    Test one page's title in its existing test file; test the hook once.
13. Meta in `index.html` (static, site-wide; the SPA cannot vary these per route without prerendering and that is out of scope): `description` — *Joey Haas is a senior software engineer in Denver building payments and ledger systems, and Spine, a tracker for a physical game collection.* — plus `og:title`, `og:description`, `og:type=website`, `og:url`, `twitter:card=summary`. `og:image` only if a 1200×630 asset exists under `frontend/public/`; a plain generated card (name and tagline on the site's dark background) is fine, and if making one is a detour, leave the tag out rather than point it at nothing.
14. Footer: add a left-hand line *© 2026 Joey Haas · Source* (year from the build, not hard-coded) and keep the existing contact links and the understated Sign in / Admin link on the right. Nothing louder than that.
15. Project detail page: **no.** The post is the detail page; a `/projects/spine` route would duplicate it. The Projects card's links row is the hub.

**E. Checks, in the plan's last phase**

16. Light theme and a 375px-wide viewport on `/`, `/projects`, `/spine` and one item page: the new header block, the highlights list and the links row must wrap cleanly and the cover strips must not overflow.
17. "Recent picks" on the live `/collection` rendered empty cover boxes beside correct titles and reasons in my review on 2026-10-02, while Favourites and the grid rendered covers fine. Confirm whether `cover_url` is null on those rows or the `CoverImage` inside `.recent-picks-list` is being clipped, and fix whichever it is. Small, but it is on the flagship page.
18. `./scripts/smoke.sh` after deploy, with the `/spine` routes and the `/collection` redirects added.

## Constraints to carry into the spec

- Public pages other than `/spine*` still make no API calls; Home and Projects keep reading the static snapshot.
- Shelf conventions from `CLAUDE.md`: tokens in both theme blocks, `page-wide` via `WIDE_ROUTES`, `role="img"` on non-text marks, nothing hover-only, `useMediaQuery` not `matchMedia`.
- `content/*.js` stays the single source of copy; no strings inline in pages that belong there.
- Commits conventional, ≤5 files, independently valid; Prettier + ESLint after every file change; frontend suite green; the backend suite is untouched and should stay green without edits.
- One PR for A + B + C + D; the post flips to published in that PR. E is verification, not a PR.

Start by proposing the design doc's Key decisions section — in particular whether to do the `/spine` route rename now (my preference: yes, with the redirects) or keep `/collection` and only rename the label, and how `Projects.jsx` should render `highlights` and `links` without a new component — and ask me anything that changes scope before writing the plan.
