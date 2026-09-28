# Site design review and public-exposure recommendations (2026-09-28)

Reviewed the live site at joey-haas.dev on 2026-09-28 (desktop, dark theme,
signed in), with the code at `origin/main` `8733c4e`. Two questions: does the
site's design still fit now that the tracker is most of it, and which of the
tracker's admin and backend workings should the public see.

## Part 1 — design review

### The short version

The typography, palette and restraint are good and consistent from the
resume pages through the admin shelves — the tracker never looks bolted on.
The problem is proportion, not polish: the tracker is now the bulk of the
engineering, and the site still presents it as one card behind Projects.
A visitor landing on Home sees a greeting, two link cards and a footer, and
has no idea the most interesting thing exists.

### Findings, in priority order

1. **The flagship is hidden.** `/collection` is reachable only through
   Projects → the card's title link, or the Home card's sub-line. Put
   "Collection" in the top navigation (Home · About · Projects · Collection
   · Blog), and give it its own link card on Home ("What I'm playing →"),
   ideally with the live hero numbers or four favourite covers pulled in.
   Home stays static-friendly if that card reads a build-time snapshot (see
   item 4).

2. **Blog is a nav item pointing at an empty page.** The production build
   wrote `feed.xml` with 0 items, so "Blog" leads nowhere. Either hide the
   nav item until a post exists, or — better — write the first post about
   the tracker (photographing a shelf → vision model → IGDB resolution → the
   collapse rule). That post is also the "how it works" page Part 2 asks
   for.

3. **Two empty public strips.** "Up next" and "On the radar" are the two
   live, changing elements on `/collection`, and both are empty right now
   (nothing pinned, nothing wanted). Pin a game from Play Next and mark two
   or three Radar releases as Want; the page immediately reads as alive
   rather than archival.

4. **The cold start greets every first-time visitor.** The waking state is
   handled well (honest copy, skeleton grid), but on the free tier it is
   the first thing a recruiter sees on the best page. Two ways out that keep
   the free tier: (a) a scheduled ping of `/api/health` every 10–14 minutes
   during waking hours (GitHub Actions cron, or a Render cron job); (b) a
   build-time snapshot — a scheduled workflow fetches `/api/public/items`
   and `/stats`, commits them under `frontend/public/`, and the page renders
   the snapshot instantly then refreshes from the API when it wakes.
   (b) fits the site's existing "public pages ship their content" principle
   and also powers a Home card. Starter at $7/mo is the no-code option.

5. **`/collection` hierarchy.** Order is hero numbers → favourites → stats →
   a stray "Nintendo Switch 2 · 10 on cartridge, of 10" line → toolbar →
   grid. Specifics:
   - The cartridge line has no heading and reads like debug output. Give it
     a label ("Formats" or "On cartridge") and put it in the stats row, or
     drop it until a second platform makes it interesting.
   - The ratings histogram and finishes strip have no axis labels; they are
     decorative rather than readable. Label the ends (1 … 10; the twelve
     months) or add a hover/title per bar.
   - The "Games 68" chip is a single-option filter — it appears because the
     shelf is games-only. Hide a type group with one member.
   - Empty space to the right of the four favourites: this is where "Up
     next" belongs visually once something is pinned.

6. **Item page voice.** The public item page says "Your rating", but the
   visitor is not the rater. When not signed in it should read "My rating"
   (and any Play Next / Discover reason copy shown publicly needs the same
   first-person flip — "which I rated 10", not "which you rated 10").
   Also: the "Full game on cartridge" chip sits among genre chips; it is a
   different kind of fact (my copy, not the game) and reads better as its
   own line — "My copy: Nintendo Switch · full game on cartridge".

7. **Projects page.** The tracker card now carries a long description with
   nothing to look at. A cover-strip or screenshot thumbnail on the card,
   and a "How it works →" link to the post/page from item 2, would make it
   a portfolio entry rather than a paragraph. "This Website" deserves a link
   to the CI/PR pipeline as well as the repo.

8. **Admin surfaces (for your own use).** Play Next, Catalogue, Radar and
   Discover are consistent and clean; nothing to fix for the public since
   they stay private. Minor: the Admin landing is a bare list of links —
   fine for one person. `/admin` shows the signed-in email; keep it there,
   never on a public page.

9. **Mobile.** Not verified this session (the automation window would not
   shrink below desktop width). The CSS has breakpoints at 40rem and 34rem;
   the things to check on a phone are the hero-number trio, the three stat
   blocks stacking, and the toolbar chips wrapping above a 2–3 column grid.

10. **Light theme.** Not reviewed; the tokens are measured for both, so
    this is low risk, but check the histogram and status bar colours there
    once the labels from item 5 land.

## Part 2 — what to expose publicly, and what to demo

### Principles

- **Show outputs and reasoning; never inputs, operations or state.**
  Picks, reasons, rankings and aggregates are the demo. Notes, cart IDs,
  acquisition dates, run states, error notes, quota state, the signed-in
  email and non-public rows are not.
- **Reasons only cite public facts.** Play Next / Discover reasons name
  games and ratings; a public version must be generated from public rows
  only (rated + published), and in first person.
- **Nothing that costs quota or writes on a visitor's action.** No public
  Generate or Refresh. Public views read stored results.
- **Store data stays private.** The catalogue reads boutique stores' public
  JSON under robots.txt courtesy for your own use; republishing their
  listings and prices on a public page is a different act. Registry data
  (a community sheet) and IGDB dates are fine to show; store names and
  prices are not, beyond an aggregate count.
- **Aggregates are always fine.** "1,299 registry editions, 1,955 store
  listings, 677 games resolved" is an engineering stat, not a dataset.

### Recommended, in order of value for a resume site

1. **A "How this works" page (or first blog post).** The single best demo
   is the engineering story, and it exposes no data: the photo import
   pipeline (one photo per request, confidence from string distance), the
   source adapter interface, the physical catalogue and the collapse rule,
   Play Next's profile and weights, Discover's index-only model contract
   with deterministic fallback, migrations + `schema_check`, the CI gate.
   One architecture diagram, a few code snippets, links to the repo. This
   is what a hiring manager actually evaluates.

2. **Fill the two strips that already exist.** Pin an Up next; Want a few
   Radar games. Zero code, and it demonstrates Play Next and Radar
   publicly through their outputs.

3. **Public "Tonight's picks" (read-only Play Next).** A public endpoint
   returning the most recent shown picks (from `pick_events`) restricted to
   public items, rendered on `/collection` under Up next with the first-
   person reasons and no buttons. This shows the scoring — the most
   "engineering" feature — without any action surface. Small change:
   picker output already exists; it needs a public serializer and a voice
   flip.

4. **Public "Coming to cartridge" (read-only Radar).** The top handful of
   upcoming physical releases on your platforms: title, platform, format,
   release month, an IGDB link. No store names, prices or pre-order
   windows. This changes the current invariant that nothing from
   `recommendations` is public — make it a deliberate spec change with a
   test that pins exactly which fields leak.

5. **Discover as a public curiosity, later.** "Games I'm told I'd like",
   read-only from the last stored batch, reasons in first person. Fun, and
   it demonstrates the LLM seam — but the batch is a shopping list, so
   decide whether you want that public. If yes, same rule: stored rows,
   public-item reasons only, no Generate.

6. **Year in review (E9).** `/collection/2026` is the natural public
   stats showcase and is already in the roadmap.

7. **Document the public API.** `/api/public/items`, `/stats`,
   `/items/{id}` are a small, well-designed read-only API. A short section
   on the how-it-works page with example responses demonstrates API design
   and costs nothing.

### Keep private

`/admin/catalogue` (store listings, prices, run states, disagreements —
operational, and the store-data question above); `/admin/import`; the edit
pages; bulk tools; notes; cart IDs; acquired dates; `format_source`; model
failure notes and the Gemini budget line; the signed-in email; every
non-public row. The existing `test_public.py` leak tests are the right
mechanism — extend them for anything added in items 3–5.
