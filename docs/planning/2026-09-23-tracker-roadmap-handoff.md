# Tracker — Roadmap Handoff (after E8a)

Date: 2026-09-23. For a design and planning session, before any more code.

This document says what is built, what is left, and — the main point — what
still has to be decided for each remaining phase. The authoritative design
for everything not yet built is the parent spec,
`docs/planning/2026-09-22-tracker-enhancement-design.md` (referred to below
as **the parent spec**); the research behind it is
`docs/planning/2026-09-22-tracker-design-research.md` and
`docs/planning/2026-09-22-physical-sources-research.md`. Each phase gets its
own spec and plan in `docs/planning/` (`<date>-<topic>-design.md`,
`<date>-<topic>-plan.md`) before implementation, per `CLAUDE.md`.

## 1. Where things stand

| Phase | State | Spec / plan | Merged |
|---|---|---|---|
| E7a — shelf and showcase | Live | `2026-09-22-tracker-enhancement-plan.md` | #20 |
| Favourites cap (four) | Live | — (small fix) | #21 |
| E7b — metadata depth, copy fields | Live, migration `0003` | `2026-09-23-tracker-e7b-*` | #22 |
| E8a — Play Next, relaxed `schema_check` | Live, migration `0004` | `2026-09-23-tracker-e8a-*` | #23 |
| Relink keeps in-flight edits | In progress in a separate session | — | — |

**Production facts a designer needs:**

- 74 games (68 public), all owned (`wanted` 0). Public: 32 backlog,
  3 playing, 31 finished, 2 abandoned. 9 rated, 4 favourites. Play Next is in
  use: High on Life is pinned as Up next.
- Platforms, all set: 58 Nintendo Switch, 10 Nintendo Switch 2. **Every
  Switch 2 copy the owner has is a full cartridge**; there are no Game-Key
  Cards on the shelf.
- Every item has a release date; 40 have a time to beat.
- `acquired_at` was backfilled from the import date, so it carries no
  information yet (Play Next falls back to release age until the dates span
  90 days).
- Neon is at migration `0004`. The API now boots against a database *ahead*
  of the code (warning logged) — **migrations must be additive** (see
  `backend/migrations/README.md`). Deploy order: apply the migration, then
  merge.
- Free tiers throughout: Render (sleeps after ~15 min), Neon, Gemini (the LLM
  seam in `backend/llm.py`; the free tier is roughly 20 requests a day).

## 2. What is left

| Phase | What it is | Rough size | Blocks |
|---|---|---|---|
| **E7c** — physical catalogue | Know which games exist physically, and as what (full cartridge / Game-Key Card / code in a box), for games the owner does **not** own: a registry reader (r/NSCollectors Switch 2 sheet, `switch2-tracker` cross-check), 13 boutique-store adapters (10 Shopify, 3 WooCommerce), a format classifier, IGDB resolution of catalogue rows, N64 by platform policy, a registry one-click fill on the edit page, and registry sync onto owned items. Parent spec §5.4–§5.8. | **Large** | E8b, E8c |
| **E8b** — Discover | Games not in the collection, available physically on the owner's platforms, pre-scored with the Play Next profile, re-ranked by one model call, each with a reason naming the owned games behind it; Want / Not interested / Already own / Skip. Parent spec §7. | Large | — |
| **E8c** — Radar | Upcoming releases with a physical edition announced (pre-orders), scored the same way, no model call; a public strip. Parent spec §8. | Medium | — |
| E9 (optional) | Year in review at `/collection/2026`. Parent spec §11. | Small–medium | — |
| E10 (optional) | Red Art and Pix'n Love stores (PrestaShop, HTML). | Medium | — |
| Blocked | BGG import — its XML API requires a registered app and `BGG_TOKEN`. | Small once unblocked | Owner registers an app |

**`CLAUDE.md` still lists "Tracker E6 — recommendations".** E8b is the
research-backed successor to E6. The session should decide whether E6 is
retired (superseded by E8b) and update the TODO accordingly.

**Migration numbering has shifted.** The parent spec put the catalogue
tables in `0004`; `0004` is now `pick_events`. E7c's tables become `0005`,
and E8b's `recommendations` table the one after. Both must be additive.

## 3. What still needs to be brainstormed

Grouped by phase. Each item names the question, why it matters now, and the
parent spec's recommendation where one exists. Items marked **decide first**
change the size of the work.

### E7c — physical catalogue

1. **Scope — decide first.** The parent spec builds registry *and* 13 store
   adapters. The owner's Switch 2 shelf is all full cartridges, and the
   catalogue's real job is Discover and Radar's "does a physical edition
   exist, and is it a real cartridge?" for games **not** owned. Options to
   weigh:
   - **Registry-only first** (NSCollectors sheet + `switch2-tracker`,
     N64 by platform policy): covers Switch 2 nearly completely, is keyless
     and small; loses pre-order prices, ship windows and store links, and has
     **no Switch 1 signal at all**.
   - **Registry + a few stores** (e.g. Limited Run, Super Rare, iam8bit):
     adds Switch 1 coverage and pre-orders for Radar at a fraction of the
     cost.
   - **All 13, as specified.**
   The choice decides whether Discover can recommend Switch 1 games at all —
   which matters, because 58 of 68 owned games are Switch 1.
2. **Switch 1 in Discover and Radar.** No registry exists for Switch 1; stores
   are the only physical signal. Is Switch 1 in scope for "physical first"
   (D4), or do Discover/Radar start Switch 2 + N64 only?
3. **Open decisions D7–D9** (parent spec §10) were recommended, not
   approved:
   - D7 — Game-Key Card releases behind a toggle, off by default.
   - D8 — which stores in the first cut (depends on item 1).
   - D9 — precedence when sources disagree: home region (USA) first, then
     tier; registry beats store text; a cart ID, photo or manual value beats
     both; cross-region full-cart editions kept as a note only.
4. **Source fragility and courtesy.** The registry is a community Google
   Sheet exported as CSV — its columns can change without notice. Stores are
   read through public JSON endpoints (Shopify `products.json`, WooCommerce
   Store API) at 2 req/s, manual refresh only. Decide: a schema check on the
   sheet with a loud failure; whether to honour `robots.txt`; how to treat a
   store that starts returning nothing.
5. **IGDB resolution cost.** Each catalogue row needs a title match (up to two
   IGDB searches) and a snapshot cache. The spec bounds it (`resolve_limit`,
   a loop button). Confirm that shape, and how the **Needs match** queue
   (rows with no IGDB id or no platform) is worked.
6. **Registry sync onto owned items** (parent spec §5.8): it writes only rows
   whose `format_source` is NULL / `registry` / store tiers, never `manual`,
   `cart_id` or `photo`. The owner's existing formats were bulk-set by hand,
   so they are `manual` and the sync would never touch them — confirm that is
   wanted, and how a disagreement is shown.
7. **The importer's deferred parts** (E7b left them out): reading cart IDs and
   the white "GAME-KEY CARD" banner off Switch 2 box photos. Decide whether
   they join E7c or wait until Switch 2 games are imported again.

### E8b — Discover

1. **Model and budget.** One Gemini call per Generate on a ~20/day free tier,
   with a deterministic fallback when it fails. Is the free tier acceptable,
   should an Anthropic key be added (`backend/llm.py` supports both), and
   which model? The Generate button's label states the budget.
2. **The `recommendations` table** (parent spec §7.2) is shared with Radar.
   Confirm its shape once E7c's final tables are known; it must be additive.
3. **Defaults.** Popularity (`safe` / `balanced` / `deep`), window (`recent` =
   last 3 years / `any`), and platforms (the collection's platforms, or
   `{508, 130}` when none are set).
4. **Want is public.** Per D1, Want creates an item with `owned_format = none`
   and `is_public = true` — the want list shows on `/collection`. Confirm this
   is still wanted now that the public shelf exists.
5. **Films** (parent spec §7.4): TMDB recommendations for rated films. The
   collection has almost no films — in or out of E8b?
6. **Judging quality.** How will the owner decide Discover works — a handful
   of known-good titles it should surface, or a feel after a few batches?
   Worth writing down before building.

### E8c — Radar

1. **Pool and horizon.** Future `release_date` in the catalogue, ranked with
   IGDB `hypes`; how far ahead (6 / 12 months / any)?
2. **Public strip.** D1 approved a public radar strip. Confirm placement on
   `/collection` and whether it shows only games the owner marked Want.
3. **Depends on E7c's store adapters** for pre-order windows and prices; a
   registry-only E7c gives dates but no "pre-orders close" line.

### Play Next — feedback before building on it

Discover reuses Play Next's profile and scoring, so it is worth tuning Play
Next against real evenings first:

- Do the picks feel right? `PICKER_WEIGHTS` and `MOOD_BUCKETS` in
  `backend/picker.py` are the tuning points.
- Is "Overdue classic" useful as the third slot until acquired dates mean
  something — and should the owner correct acquired dates at all?
- Ratings: 31 games are finished but only 9 are rated, so most of the
  profile rests on "finished" (weight 0.3) rather than on how much each was
  liked. Rating the finished games from the admin shelf is the single
  biggest improvement to Play Next and, later, Discover.

### Cross-cutting

- **Order.** Suggested: a week of Play Next use and tuning → E7c (scoped per
  item 1) → E8b and E8c (independent of each other once E7c exists) → E9 as
  a small visible win whenever.
- **Tech debt worth a slot:**
  - `HeroNumbers` and `FavoritesRow` are exported from `pages/Collection.jsx`
    and imported by the admin page; move them to `components/`.
  - `ItemForm.jsx`'s `PLATFORM_OPTIONS` mirrors `PLATFORM_NAMES` in
    `backend/sources/igdb.py` by hand; the API rejects anything else.
  - A long-open admin tab keeps the old bundle after a deploy; a small "a new
    version is available — reload" prompt would stop "I don't see the button"
    reports.
- **Tooling.** Commands run from the Claude app's terminal pane execute late
  and show no output; use Terminal.app for anything that has to run now.

## 4. What the planning session should produce

For the next phase chosen (E7c by default):

1. A spec at `docs/planning/<date>-tracker-e7c-design.md` in the house format
   (Problem, Scope in/out, Proposed solution, Key decisions with tradeoffs,
   Prior art and docs consulted, Open questions, Smoke test strategy), with
   the item-1 scope decision and D7–D9 settled.
2. A plan at `docs/planning/<date>-tracker-e7c-plan.md`: ordered tasks with
   acceptance criteria, files per task, tests, commit boundaries (≤5 files),
   zones (the migration in its own zone), and the automated environment
   tests section.
3. The answers to the E8b / E8c questions above that affect E7c's tables
   (so the catalogue is shaped for what reads it).

## 5. Where to look

| For | Read |
|---|---|
| Everything unbuilt, in detail | Parent spec §5.4–§5.8 (catalogue), §7 (Discover), §8 (Radar), §9 (public API), §10 (decisions), §11 (phasing), §12 (non-goals) |
| How it was researched | `2026-09-22-tracker-design-research.md`, `2026-09-22-physical-sources-research.md` |
| What was actually built, and where it deviated | `2026-09-23-tracker-e7b-design.md`, `2026-09-23-tracker-e8a-design.md` |
| House rules for the code | `CLAUDE.md` (conventions, media tracker notes), `backend/migrations/README.md`, `backend/sources/README.md` |
| The Play Next scoring the catalogue will feed | `backend/picker.py` |
