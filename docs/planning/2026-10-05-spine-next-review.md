# Spine public-surface review — what to expose next, and why it is empty (2026-10-05)

Reviewed `origin/main` at `cf5551d` (Switch 1 catalogue and the store list, #36)
and the live site on 2026-10-05, desktop, signed in. Three questions: what do
the public pages show today, what should they show, and why do the live parts
go stale.

## Part 1 — what the public sees today

`/spine` renders, top to bottom: header block → hero numbers → Up next →
Recent picks → On the radar + Coming to cartridge → favourites → stats →
toolbar → grid (68 posters) → attribution.

| Strip | Backed by | On 2026-10-05 |
|---|---|---|
| Up next | `items.pinned_at` | empty — nothing pinned |
| Recent picks | `/api/public/picks` (yesterday's Play Next shown events) | 3 games, correct, first person |
| On the radar | `items.wanted` | empty — nothing wanted |
| Coming to cartridge | `/api/public/radar` | **empty — the API returns `[]`** |

Meanwhile `/admin/store-list` had 8 Discover top picks, 3 released Switch 2
cartridges, 5 released Switch cartridges, 9 dated Switch 2 pre-orders within 90
days (Ratatan, Silksong, Ocarina of Time, Pikmin 4, Xenoblade 3…) and 10
digital-only rows to skip. The admin side is rich; the public side is a shelf
with three picks on top.

### Findings

1. **`/api/public/radar` is empty while Radar holds nine dated cartridges.**
   `load_public_radar` keeps a row only when `source_metadata.release_source ==
   "registry"` and the precision is day or month. Either the pending rows were
   generated before `release_source` existed (the route "fails closed" on
   purpose) or their dates came from store listings or IGDB's first release
   date. Which one it is needs a Generate and a look at the rows; the brief
   asks for both. If a Generate does not fill the strip, the rule is too
   strict for the data and should also accept IGDB's per-platform release
   date, which is public data, never a store's.

2. **Stored reasons have drifted.** Several Radar rows on the store list read
   "which **you** rated 10" — generated before the first-person flip (#34),
   never regenerated. Anything stored at generate time goes stale the moment
   the code moves; a public serializer should not trust stored text.

3. **Every live strip waits for a button.** Recent picks needs Play Next
   opened; Coming to cartridge needs Generate; Up next needs a pin; On the
   radar needs a Want; the catalogue behind Radar and Discover needs Refresh
   registry, Refresh stores, Refresh Switch 1 and Resolve. The snapshot
   workflow refreshes the static copy daily, but it can only copy what the
   database holds, and nothing writes to the database on a schedule.

4. **The concepts are already mixed on one page.** The shelf (owned, finished,
   favourites, stats, the grid) and the living part (what to play tonight,
   what to buy, what is coming) share `/spine`, and the living part is pinned
   to the top of a page that is 90% shelf. Adding the store list there would
   push the favourites and the grid below thirty rows of games I do not own.

5. **Small ones.** The "Up next" and "On the radar" sections render nothing
   when empty, so the page silently loses its "alive" signal rather than
   saying "nothing pinned". `README.md` still describes `/spine` as carrying
   Recent picks and Coming to cartridge, and the how-it-works post says
   "Discover stays private: its output is a shopping list" — both change if
   Part 2 lands.

## Part 2 — what to expose, feature by feature

Principles from the 2026-09-28 review still hold: outputs and reasoning,
never inputs, operations or state; reasons cite public facts only, in first
person; nothing that costs quota or writes on a visitor's action; store names,
prices, stock and pre-order windows stay private (robots.txt courtesy);
aggregates are always fine.

| Feature (Joey's word) | Public today | Expose | Keep private |
|---|---|---|---|
| **Play Next** (the selector) | Recent picks: 3 public, owned, unpinned backlog/active games shown yesterday; reasons rebuilt from public rows | The same, generated daily by a job so it is "Tonight's picks" every evening; Up next beside it | Slot labels and scores; the moods/time asked for; skip/never events; the "On the shelf since" reason (reads private `acquired_at`) |
| **Discover** (the suggestions) | Nothing | The current batch's pending picks (up to 8) as "Top picks" inside Buy now: title, platform, format, release date, cover, IGDB link, up to two first-person reasons that name only public games | Score, rank, `ranked_by` and `model_note` (the Gemini status line), popularity mode, `based_on` ids that point at private items, `store_lines`, `format_note`, every answered row (dismissed, skipped, owned) |
| **Radar** | Coming to cartridge: top 6 pending full cartridges, registry-dated, day/month precision — empty in practice | Every pending full-cartridge row, sectioned server-side: Buy now (released), Pre-orders (within 90 days), Later (beyond, or quarter/year precision); plus digital-only and Game-Key-Card rows as a collapsed "Not on cartridge" list | Store lines, prices, pre-order windows, the urgency bonus, score, hypes, lane, ids, a store's release date (show the registry or IGDB per-platform date, or no date) |
| **Store list** | Nothing | A public twin of the admin page's sections, without Got it, without store lines; the "New" badge for cartridges released in the last 30 days and a Best match / Newest sort | The buttons, the store evidence, and whether a game is in stock anywhere (decided 2026-10-05: section placement says "out now"; stock stays signed-in) |
| **Wanted** | On the radar: wanted items as posters | The same rows at the top of the shopping sections as "Wanted", with a release date when upcoming | — (already items) |

### Two rules that make the above safe

- **A public reason names only public games.** Discover stores `based_on`
  item ids per pick; keep a reason only when every id it rests on is a public
  item, else drop it, and fall back to a genre line ("Shares Mystery and story
  rich with games on my shelf") when nothing survives. Radar reasons need the
  same: record the reference ids beside the text at generate time, or rebuild
  the reasons at read time from public rows the way `picker.public_reasons`
  does. The leak test pins it either way.
- **A public date is a registry or IGDB date.** The collapse already records
  `release_source`. Released rows need no date at all on the public page
  ("Out now" is the fact); upcoming rows show the registry date, or IGDB's
  per-platform date once the collapse carries it, and a row with only a
  store's date goes in Later with the precision it has from IGDB, or stays
  out.

## Part 3 — page organisation

Decided 2026-10-05: two pages under Spine, one sub-page only.

- **`/spine` — the shelf.** What I own: header, hero numbers, favourites,
  stats, toolbar, grid. The living strips leave it. One compact band under the
  hero numbers links across: "What's next → Tonight: Hades II · 11 to buy ·
  9 pre-orders", read from the same snapshot, so the shelf still says the
  site is alive.
- **`/spine/next` — What's next.** What to play tonight and what to look for
  in a store: Tonight (Up next + three picks) · Wanted · Buy now (Switch 2,
  Switch; New badge; Best match / Newest) · Pre-orders (within 90 days,
  soonest first) · Later (capped) · Not on cartridge (collapsed). A freshness
  line says when the catalogue and the picks last changed.
- A **Shelf · What's next** tab row sits under the Spine header on both pages;
  the top nav keeps one "Spine" item, prefix-active.
- `/admin/store-list` stays as the signed-in version, rendering the same
  sectioned data through the same components plus Got it / Want / Not
  interested and the store lines. It should drop its own `buildList` and read
  the server's sections, so the two pages can never disagree.

## Part 4 — why it goes stale, and the fix

Nothing writes on a schedule. The snapshot workflow is a copier. The fix is
one nightly GitHub Actions workflow that does what Joey does by hand, in
order, against the existing admin routes, with a job token the backend
accepts only for a pinned whitelist of job routes:

1. wake `/api/health` (the existing loop);
2. `POST /api/picker/next` with the default request — three picks recorded as
   shown, which `/api/public/picks` publishes after the next UTC midnight;
3. `POST /api/physical/refresh-registry`, `POST /api/physical/refresh`
   (all stores), `POST /api/physical/refresh-switch1` on Sundays,
   `POST /api/physical/resolve` until `unresolved_remaining` stops falling;
4. `POST /api/recommendations/generate` for Radar nightly and for Discover on
   Sundays (one Gemini call a week; decided 2026-10-05);
5. the snapshot compare and deploy-hook steps that `snapshot.yml` runs today.

What stays manual, by design: pin, want, got it, not interested, ratings,
publishing, photo import, and the Needs match queue. Those are opinions; the
job feeds candidates.

Cadence: 00:17 UTC (18:17 Denver in summer, 17:17 in winter). Picks recorded
then become public at the following UTC midnight, so each run publishes
yesterday's picks and records today's — a one-day lag the existing "never
watch the owner live" rule imposes, accepted rather than adding a pick action
(an enum change is a migration).

Cost: GitHub Actions is free on a public repository; the run should take
10–20 minutes, almost all of it the store walk. Gemini: one call a week.
Render: none; the job also keeps the free tier awake only while it runs.

## Part 5 — ordered recommendations

1. The nightly job (Part 4). Without it every public strip is a demo that
   happens to be empty; with it, items 2–4 have something to show.
2. `/api/public/next` and the `/spine/next` page (Parts 2–3).
3. The `/spine` shelf trims to what it owns, plus the band.
4. Fix or relax `/api/public/radar`'s date rule against real rows, and retire
   that route once `/api/public/next` carries its data (keep it until the
   snapshot and post are updated).
5. Admin landing: a "Last nightly run" line (time, ok/failed, counts), so a
   failed run is noticed at a glance rather than by an empty page.
6. README and the how-it-works post catch up; the post's "What the public
   sees" section gets the new endpoint with an example response.
