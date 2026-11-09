---
status: planned
date: 2026-11-09
topic: recommendation-engine
mockups: docs/planning/mockups/2026-11-09-recommendation-engine/
chosen: chosen.html
supersedes: docs/planning/2026-11-09-live-tonight-picks-design.md
---

# A recommendation engine for the whole shelf (design)

Date: 2026-11-09 · Repo: joey-haas.dev · Mockups under
`docs/planning/mockups/2026-11-09-recommendation-engine/` (`index.html`
links them; `chosen.html` is the direction below). Absorbs
`2026-11-09-live-tonight-picks-design.md`, whose problem is one symptom of
this one. Builds on `2026-10-30-tonight-picks-design.md` (lead pick, Or
instead, the slots), `2026-11-06-pick-for-me-design.md` (the public, live,
event-free pick path), `2026-11-08-tonight-continue-design.md` (Continue
card, Wrap up) and `2026-11-01-comics-design.md` (comics as one row per
series with `issues_owned` / `read_to`).

## Problem

Play Next's picks are not picks I would make, and the engine cannot grow
with the shelf.

**What happened.** On 2026-11-09 the owner finished Balan Wonderworld, a 3D
platformer, from the Wrap up sheet. Tonight's chip said so at once; the
three picks under it stayed three platformer-ish games chosen the night
before, one still labelled "Change of pace" with no reason under it. The
narrow reading is "the picks are frozen until the nightly run". The review
of `backend/picker.py` against the real collection says the freeze is the
smallest of the problems:

1. **Recency is a momentum engine.** A game finished today weighs 0.3
   (finished) + 0.3 (recency bonus) = 0.6, against 1.0 for a favorite and
   0.3 for a finish from last year. Every attribute of the game just
   finished gets a strong push, and two of the three slots follow the
   profile. The one counterweight, Change of pace, is one slot, and it was
   frozen on yesterday's premise. "Three platformers after a platformer" is
   the design working as written, not a bug in it.
2. **Affinity rewards generic tags.** `affinity = 50 + 50 × mean(weight of
   each attribute)`, with an attribute the profile has never seen counting
   0. A game with two broad, well-liked tags scores higher than a game with
   nineteen specific ones, because every niche keyword dilutes the mean.
   Measured on the owner's 107 games (admin API, 2026-11-09): the top
   backlog game by today's affinity is *Jerry Anker and the Quest to get
   Love* — two tags (Puzzle, Adventure), no keywords, affinity 94. Persona 5
   Tactica, Hades II and Indiana Jones follow at 85–92 with 11–19 tags
   each. The most-tagged backlog games (Jet Force Gemini, Rainbow Six,
   Splatoon 2, ~20 tags) sit at the bottom at 64.
3. **Variety comes from penalties and dice, not from the picks differing.**
   Rotation is staleness (−15 per day shown in the last 14 days) plus 5%
   jitter. The nightly job itself "shows" three games a day, so the engine
   penalises its own picks into a rota through the top ten. Nothing asks
   whether the three picks differ from each other.
4. **The public engine has forked three ways.** Admin Play Next is live
   with six terms; Tonight publishes yesterday's full-engine picks through
   `pick_events`; Pick for me ranks live on four terms with no events. One
   `picker.py`, three different answers for the same question.
5. **The engine knows only games, and only one kind of fact about them.**
   `candidates()` filters `type == "game"`. Comics are about to arrive in
   bulk (the owner is photographing the whole collection), movies will
   follow, board games later. Comic Vine rows carry **no tags at all**
   (`genres: []`); TMDB rows carry genres only. The owner's taste crosses
   media — the Waterworld comics, Dredge, Mad Max — and the data as stored
   cannot see that.
6. **What the owner actually plays is unused.** `play_sessions` and
   `playthroughs` record what was sat down with, how long, how often, and
   whether it ended in a finish or a drop. None of it reaches a pick.

### The tagging audit (2026-11-09, 107 games)

| Signal | Count | Finding |
|---|---|---|
| Reference games | 62 | 59 finished, 2 abandoned, 4 favorites, 60 rated. |
| Ratings | 60 | 21 tens, 18 eights, 13 sixes; mean 8.0. A finished 10 weighs 1.3, *more than a favorite*. The profile reads "everything I finished was great". |
| Genres | 20 distinct, 2.5 per game | Coarse buckets. "Adventure" is on 66 of 107. |
| Themes | 20 distinct, 2.5 per game | The best cross-type bridge: Science fiction 29, Comedy 29, Fantasy 25, Open world 21, Horror 15. "Action" is on 84 of 107 and says nothing. |
| Keywords | 372 distinct, 6.6 per game | Where specific taste lives (post-apocalyptic 6, robots 9, dinosaurs 6, aliens 5, spaceship 5, dystopian 5, animal protagonist 7, multiple endings 7). But 225 of 372 appear on exactly one game, only 78 on three or more, 10 games have none, 15 share no keyword with any other game, and `KEYWORD_LIMIT = 10` trims the tail at the source. |
| Modes, perspectives | — | Already excluded from reasons; single player on nearly everything. |
| Time to beat | 49 of 107 | Missing on 24 of the 43 backlog games, so Size and Change of pace's band test are blind for more than half the pool. |
| Comics (Comic Vine) | 0 tags | `genres: []`; publisher stands in as creator. Comic Vine's volume record does carry `concepts`, `characters`, `teams`, `locations`, `people`; the adapter does not take them. |
| Movies (TMDB) | genres only | TMDB `keywords` are one `append_to_response` away; the adapter fetches `credits` only. |

**Verdict:** genres and themes are enough for coarse mood and for bridging
media, too coarse to prefer *this* sci-fi game over *that* one. Keywords
are the only fine signal and are sparse, capped and treated as noise by the
formula. Sufficient for real suggestions only with a data layer under the
scorer: fetch more, normalise onto a shared vocabulary, weight by how
distinctive a tag is, and bring the play record in.

## Scope

**In**

- A shared facet vocabulary (`backend/facets.py`) mapping each source's
  tags onto one space, curated from the collection's own snapshots as
  `MOOD_BUCKETS` already is; unmapped tags still count inside their own
  type.
- One scorer over facets, specificity-weighted, with recency capped, the
  play record as a signal, and a diversity rule across a set of picks.
- Per-type **strategies** (game, comic, movie; board game as a stub) that
  own the pool rule, what "size" means, type-specific terms and reasons,
  and the slot names, so a new medium is a new strategy, not a new engine.
- The public picks computed **live** from public rows, deterministic for a
  given UTC day, with no pick events, serving Tonight, Pick for me and the
  build snapshot from one function; admin Play Next is the same function
  plus the private terms. This retires the nightly `picks` step.
- Richer adapter snapshots: TMDB keywords, Comic Vine concepts / characters
  / teams / locations, the IGDB keyword cap lifted to what the API returns.
- Tonight on `/shelf/next` grows lanes by verb: **Read next** when a comic
  is unread, later **Watch next**; the game picks stay the headline.
- The two narrow defects from the live-picks doc: a slot label is withheld
  when its reason is None, and copy stops promising a nightly rebuild.

**Explicitly out**

- Embeddings or any model call on the recommendation path. A later phase
  may replace the IGDB `similar_games` term with a description embedding;
  the facet layer is designed so that slots in beside it, not instead of it.
- Changing Radar and Discover's scoring (they share `reference_weights`
  and `attribute_table`; this design keeps those functions' plain mode
  working and adds facet-aware equivalents beside them — see Open
  questions).
- Issue-level comic tracking, comic pull-list changes, or any new write UI
  beyond "Read this tonight" / "Watch this tonight" doing what Play does.
- Social or collaborative signals; there is one user.
- Admin Play Next's layout. It gets the new engine and the new reasons;
  its controls are unchanged.

## Design

### The engine in one picture

```mermaid
flowchart TB
  subgraph adapters[Adapters · richer snapshots]
    IG[IGDB: genres, themes, keywords uncapped, similar_games]
    TM[TMDB: genres + keywords]
    CV[Comic Vine: concepts, characters, teams, locations, publisher]
  end
  IG & TM & CV --> FAC[facets.py · source tag → shared facet]
  subgraph you[Owner signals · all media]
    S1[favorite · rating vs mean · finished / abandoned / dropped]
    S2[play record: sessions per hour of game, finish rate, bounce]
    S3[recency · capped, fast decay]
  end
  FAC & S1 & S2 & S3 --> PROF[Profile: facet → weight × specificity]
  PROF --> SCORE[score · one function]
  subgraph strat[Strategy per type]
    G[Game: pool, hours, slots Best fit / Change of pace / Overdue classic]
    C[Comic: pool = owned runs with issues left, size = issues left]
    V[Movie: pool = owned unwatched, size = runtime]
  end
  SCORE --> G & C & V
  G & C & V --> DIV[Diversity: distinct leading facets; at most one pick leans on the last finish]
  DIV --> PUB[Public set · public rows · day-seeded · no events]
  DIV --> ADM[Admin set · + waiting, staleness, skips, jitter]
  PUB --> T[Tonight lanes · Pick for me · snapshot]
  ADM --> PN[/admin/play-next]
```

### Facets: one vocabulary

A facet is a short, owner-readable word for a thing taste attaches to,
shared across media: `post-apocalyptic`, `ocean`, `space`, `horror`,
`comedy`, `heist`, `dinosaurs`, `robots`, `fantasy`, `noir`, `pulp
adventure`, `cozy`, `tactics`, `roguelike`, `platformer`, `licensed`,
`anime`. Three kinds:

- **theme** facets: what it is about (post-apocalyptic, ocean, space,
  horror, fantasy, war, crime, dinosaurs, robots, aliens, animals). These
  bridge media.
- **tone** facets: how it feels (comedy, grim, cozy, pulp, melancholy).
  These bridge media.
- **form** facets: what kind of thing it is (platformer, shooter, tactics,
  RPG, visual novel; superhero, anthology; action film, documentary). These
  are type-scoped: a comic's "superhero" and a game's "platformer" never
  meet, and a form facet never counts toward cross-type taste.

`facets.py` holds one table: `(source, kind, exact source string) →
facet`, plus which facets are form facets. Strings are exact and copied
from snapshots (the `MOOD_BUCKETS` rule), never typed from memory: IGDB
themes and keywords, TMDB genres and keywords, Comic Vine concept /
character / team / location names. A tag with no mapping becomes a
type-scoped facet of its own (`game:keyword:luigi`), so nothing the engine
matches on today is lost, and the map can grow from what the collection
actually carries. A `scripts/facet_coverage` style report (how many tags
per source are unmapped, by frequency) is how the map is tended; it is a
test-time helper, not a route.

A "Why these facets" rule for curation: a facet earns a row when at least
two items across the collection would share it. Singletons stay type-scoped
automatically.

### The profile: weight × specificity

Reference weights keep their shape (favorite 1.0, finished 0.3, abandoned
−0.5, rating relative to the mean, finished floor 0.1) with three changes:

1. **Recency capped.** The bonus is at most `0.15` and halves every 14
   days, so a game finished today weighs 0.45 at most — below a favorite,
   and below a finished 9. Momentum is still real; it no longer out-votes
   the long-run taste.
2. **The play record counts.** From `play_sessions` and `playthroughs`,
   per item: *engagement* = journal hours ÷ time to beat (clamped 0–1.5;
   unknown length → sessions ÷ 8); *finish rate* across playthroughs; a
   *bounce* (one session, then paused or abandoned) is a −0.2. Engagement
   adds up to +0.3 to a finished game's weight and, for a game still in
   progress with engagement ≥ 0.5, makes it a reference at +0.3 even
   unrated — because sitting down with it nine times says more than a star.
   A comic's record is `read_to` ÷ `issues_owned` (a run read to the end is
   a finish); a movie's is watched / not.
3. **Ratings relative to the owner's own scale.** Unchanged in formula,
   but the mean is taken per type (a comic scale and a game scale differ),
   and a 10 is capped so that *finished + rating* never exceeds a favorite:
   `min(weight, 1.0)` unless `favorite`. Favorites stay the one way to say
   "this, specifically".

The profile is a table `facet → (mean weight over references carrying it,
specificity)`. **Specificity** is `log(N_references / carriers)`,
normalised to 0–1 within the kind, so "Action" (84 of 107) is near 0 and
"post-apocalyptic" (6) is near 1. A facet's contribution to a score is
`weight × (0.25 + 0.75 × specificity)`: common facets still count a little,
distinctive ones count most.

### The score

Six terms stay, two change meaning:

- **affinity** (35) — `50 + 50 × Σ(weight × spec) / Σ(spec)` over the
  candidate's facets *that the profile has seen*, times a coverage factor
  `min(1, seen / 3)` so a game with one matching facet cannot score 100 on
  it alone. Unseen facets no longer drag the mean toward 0; they simply
  don't vote. This is the fix for Jerry Anker.
- **similarity** (20) — unchanged for games (IGDB `similar_games` against
  the best-weighted reference). For other types it is 0 until a source
  offers links; the strategy says so. (Candidate for the later embedding
  phase.)
- **quality** (15) — community score where the source has one; neutral 50
  where it does not (Comic Vine), and the strategy may substitute
  (completeness of the run: a full run reads better than a gappy one).
- **length_fit** (15) — against the strategy's size: hours for games,
  minutes for movies, issues left for comics (short ≤ 4, medium ≤ 12,
  long beyond).
- **waiting** (10) — unchanged; private (reads `acquired_at`), admin only.
- **jitter** (5) — admin: `random.Random()` as today. Public: seeded from
  the UTC day and the item id, so every visitor sees one list per day and
  the list still moves a little day to day without events.
- **staleness** — admin only, unchanged. The public set has no events, so
  no staleness; day-seeded jitter is its variety.

The weights stay in `PICKER_WEIGHTS`; `PUBLIC_TERMS` stays the list of what
the public path may read.

### Diversity: the picks differ on purpose

After the top candidate is chosen, each further pick is the best-scoring
candidate whose **leading facet** (its highest `weight × spec` facet) is
not already taken by a chosen pick, and **at most one** pick in the set may
have a leading facet shared with the last finish. If the rule leaves no
candidate, it relaxes in that order (first the last-finish limit, then the
distinct-facet rule). This replaces Change of pace's "differs in size band
or genre" as the mechanism; Change of pace survives as a *label* (below).

### Strategies

A strategy is a small frozen dataclass per `ItemType` in `picker.py` (or a
`strategies/` package if it outgrows one file), answering:

| | Game | Comic | Movie |
|---|---|---|---|
| Pool | owned; backlog, active or paused; unpinned; not in hand; not never'd | owned run with `read_to < issues_owned`; following alone is not owned | owned, unwatched |
| Size | time to beat (IGDB "normally") | issues left | runtime |
| Finish | playthrough ends Finished | `read_to` reaches the last owned issue | watched |
| Extra terms | — | completeness of the run (gaps lower it) | — |
| Slots | Best fit; Change of pace; Overdue classic (public) / Waited longest, Pick it back up (admin) | Best fit; Back to it (a run started, `read_to > 0`) — admin only, it reports activity; none else | Best fit only |
| Public reason sources | public games, comics and movies | same | same |
| Verb | Play | Read | Watch |

Facet reasons are cross-media by design: a comic's reason may name a game
("Post-apocalyptic ocean worlds, across my shelf: Dredge, Waterworld (the
film)") when both are public.

### The public set is live

`public_picks(session, now)` replaces both `public_picks_with_day` and
Pick for me's separate table: it builds the public profile over public
rows of **all types**, runs each strategy's public pool through the scorer
with day-seeded jitter and no staleness or waiting, applies diversity, and
returns per-type sets. Pick for me's 88 combinations are computed from the
same scored pool (moods are facet filters now: `MOOD_BUCKETS` becomes a map
from mood to facets). `pick_events` are read only for `never` dated before
today's UTC midnight, exactly as Pick for me reads them today.

Privacy argument, stated: the public set reads nothing but public rows and
nevers before midnight. A finish is already public the moment it happens
(the chip, the fingerprint); a rating or a favorite is public on the item
page. So the set changing on a finish leaks nothing new, and it cannot
change on browsing because browsing writes only events, which it does not
read. The day-selection rule, `PICKS_WINDOW`, `SLOT_ORDER` and the
"published after midnight" shown-event logic are deleted, and with them
the nightly `picks` call in `.github/workflows/nightly.yml` (the step
exists only to feed the public page). Admin Play Next still records shown
events for its own staleness.

`generated_at.picks` goes away: the picks have no day. The fingerprint
already covers every `items`, `playthroughs` and `play_sessions` row and
the UTC day, which is everything the public set reads.

### Slots on the public page

A label is published only when its premise is public and currently true:

- **Best fit** — the top pick. Always.
- **Change of pace** — the diversity rule's second pick, labelled only when
  the last finish is public *and* `change_of_pace_reason` is non-None
  against it; the reason leads. Otherwise the pick stands unlabelled.
- **Overdue classic** — the third game pick when its release date is the
  oldest among candidates above median affinity; "Out since 1999" leads.
- No **Waited longest** or **Pick it back up** publicly: both read private
  data. (Admin keeps them.)

A pick with no slot shows **no kicker** and leads with its first reason
(`chosen.html`, state "No slots apply"). `WITHHELD_SLOTS` and the "a
withheld label sorts as unslotted" rule go with the event logic; order is
simply the set's order.

### Tonight on `/shelf/next` (chosen.html)

Games-first, lanes after. The Continue card and Wrap up are unchanged.

- **Chip + lead + Or instead** as today, from the live game set.
- **Or instead** caption: `picked live · changes when I finish something`
  replaces `rebuilt nightly`.
- **Read next** lane: an `h3`, a compact `PickList` of up to two comic
  picks with publisher · year, an issues-read progress mark (`1 of 4
  read`), the size pill in issues, one reason; owner buttons **Read this
  tonight** (moves the run to Reading — the comic equivalent of pin / Play
  this; the plan decides the write) and **Not tonight** (a skip event, as
  for games). The lane is absent when the comic pool is empty.
- **Watch next** lane: same shape for movies; ships with the movie
  strategy, shown in the mockup so the pattern is judged whole.
- **Empty game pool**: a dashed box, "Nothing on the game shelf to pick
  from tonight …", with a link to Pick for me; the lanes still stand.
- Masthead freshness: `Picks live · Releases checked Mon 9 Nov ·
  Suggestions Sun 8 Nov` — the picks entry is a word, not a date.
- Page lede: "What I could play, read or watch tonight, and what I'm
  watching for in stores. Picked live from what I've liked; full cartridges
  only in stores."
- Empty copy: `No picks yet — they're rebuilt every night.` becomes
  `Nothing on the shelf to pick from tonight.`
- How it works (`spine.js`, "Picks tonight's game"): the six-terms sentence
  gains facets and the play record, "change at most once a day" becomes
  "change the moment I finish something", and the nightly job's list drops
  "records the day's picks".

Responsive: phone (400px) stacks Or instead to one column and the lane
rows to two columns (cover · text, buttons under); desktop (1280px) as the
mockup. Themes: tokens only; the progress mark uses `--status-active` on
`--line-strong`, both already measured against `--surface`.

Accessibility: each lane is a labelled region (`aria-labelledby` on its
`h3`); the progress mark carries `aria-label="1 of 4 issues read"`; the
"Picks live" word is text, not colour alone; owner buttons keep the
existing focus management (focus moves to the next lead after a skip, per
tonight-picks). Reasons remain first person.

### Admin Play Next

Same engine, admin mode: all six terms, staleness, skips, rerolls, slots
including Waited longest and Pick it back up, shown events recorded.
Reasons gain the facet sentence. A type switch (Game / Comic / Movie) is
the one UI addition, defaulting to Game; "Read next" picks there are the
same strategy. Nothing else moves.

## Key decisions

- **Facets with per-type strategies (Joey, 2026-11-09)**, over tuning the
  existing per-source scorer and over embeddings. Tuning alone can never
  see that a comic and a game share a theme except by identical spelling;
  embeddings put a model on the recommendation path and make reasons
  unnameable. The facet map is work to keep, but it is the same kind of
  work `MOOD_BUCKETS` already is, and it is what makes a reason sayable:
  "post-apocalyptic ocean worlds" is a facet, not a vector.
- **The live-picks problem is folded in, not fixed first (Joey).** A
  live version of the current scorer would be a faster rut. Option A from
  that doc's question 2 is adopted (live from public rows, like Pick for
  me), question 5 is answered "visitors too" because the privacy argument
  holds, and the nightly picks step is retired rather than kept as a
  second truth.
- **Recency capped below a favorite.** The 10-30 decision "recency does
  both things" stands; what changes is the size. Momentum of 0.6 against a
  favorite's 1.0, applied to two slots, is why a platformer finish produced
  three platformers.
- **Specificity in the score, not a bigger keyword cap alone.** Lifting
  `KEYWORD_LIMIT` without specificity would make the dilution worse.
- **Diversity as a rule over the set, Change of pace as a label.** The
  contrast is guaranteed by construction; the label appears only when it
  can be explained.
- **The play record as a reference signal.** Engagement is the strongest
  evidence the owner has and costs nothing to collect; it is already
  collected. Sessions count toward a game only, never published as a
  reason (it reports activity); the *weight* it adds is invisible.
- **Lanes by verb (Joey), over one mixed set.** Tonight answers "what do I
  play" first; a comic should not spend one of the three game slots. One
  mixed set (B) also fights the Continue card and leaves Play this tonight
  with three equal homes. Rejected: a type toggle on Pick for me as the
  only route to comics (hides the new media behind a control).
- **Public slots only where the premise is public and true.** Fixes the
  label-without-reason defect at the root: a label is derived from the
  live set, so it cannot outlive its reason.
- **Form facets are type-scoped.** "Superhero" (comic) and "platformer"
  (game) would otherwise create false bridges; themes and tone are the
  bridges, by design.

## Component inventory

**New**

- `backend/facets.py` — the tag → facet table, `facets_of(item)`,
  `is_form(facet)`, specificity helper; a coverage report helper for tests.
- Strategy dataclasses (`picker.py` or `picker_strategies.py`): pool rule,
  size bands, extra terms, slot set, verb, public-reason gates per type.
- `public_picks` replacing `public_picks_with_day` and the separate Pick
  for me table; `PublicTonight` gains `read_next` and `watch_next` lists of
  `PublicTonightCard` (same card model; `time_to_beat_hours` becomes a
  `size` object the test suite pins: `{unit: "hours" | "issues" |
  "minutes", value}`).
- `frontend`: `Lane` wrapper (h3 + caption + `PickList`), the issues-read
  progress mark inside `PickList` rows, the empty dashed box; copy keys
  `tonight.readNext`, `tonight.watchNext`, `tonight.pickedLive`,
  `tonight.readTonight`, `tonight.watchTonight`, `fresh.picksLive`.

**Existing, changed**

- `picker.py`: `reference_weights` (recency cap, play record, per-type
  mean, favorite cap), `attribute_table` → facet table with specificity,
  `affinity` (seen-only, coverage), `candidates` per strategy, `recommend`
  (diversity, strategy slots), `public_pick_table` fed from the shared
  scored pool; `MOOD_BUCKETS` becomes mood → facets.
- `picker_routes.py`: `to_picker_item` carries the play record and comic
  / movie fields; a `type` parameter on `/api/picker/next`.
- Adapters: `igdb.py` keyword cap, `tmdb.py` keywords, `comicvine.py`
  concepts / characters / teams / locations.
- `public_outputs.py`, `public_pick_for_me.py`, `public_next_cache.py`
  (nothing new to fingerprint; `generated_at.picks` removed),
  `tests/test_public_outputs.py` (allowed fields: `size`, lanes).
- `Next.jsx`, `PickList.jsx`, `spine.js`, `StatusStrip.jsx` (picks day →
  "live"), How it works copy, `nightly.yml` (drop the picks call),
  `CLAUDE.md` Play Next / Tonight paragraphs, `frontend/changelog.md`.

**Tokens used**: `--surface`, `--line`, `--line-strong`, `--text-2`,
`--text-3`, `--ok` / `--status-active` (progress mark, "Picks live"),
`--accent` (primary buttons), `--font-mono` (kickers). No new tokens.

## Acceptance criteria

1. Finishing a game from the Wrap up sheet changes Tonight's picks in the
   same refetch that changes the Just finished chip, signed in and as a
   visitor, with no pick event written.
2. The public body of `/api/public/next` is a pure function of public
   rows, nevers dated before today's UTC midnight, and the UTC day: two
   calls with the same inputs return the same picks; a `shown` or
   `skipped` event written today changes nothing in it.
3. `test_public_outputs.py` still finds no slot key, score, date, event or
   rank on any pick; `size` is the only new allowed key on a card, and
   `read_next` / `watch_next` carry the same card model.
4. A pick's `slot_label` is never present when its reason would be None;
   "Change of pace" appears only with a leading contrast reason against a
   public last finish.
5. On the 2026-11-09 fixture (Balan Wonderworld finished, a platformer),
   no more than one of the three game picks has a leading facet shared with
   the last finish, and no two picks share a leading facet.
6. On the owner's collection snapshot used in the audit, a two-tag game
   with no keywords cannot outrank a game sharing three or more seen
   facets (regression test built from that data, titles anonymised).
7. A finished game's reference weight never exceeds a favorite's unless
   it is a favorite; a game finished today weighs no more than 0.45 before
   its rating.
8. A game in progress with engagement ≥ 0.5 is a reference even unrated;
   a one-session bounce lowers its weight; neither fact appears in any
   public reason.
9. Comic Vine rows refreshed after the change carry `concepts`,
   `characters`, `teams` and `locations`; TMDB rows carry `keywords`; IGDB
   rows carry every keyword the API returned. A row with none still scores
   on its own type-scoped facets.
10. Every mapped facet string in `facets.py` occurs in at least one
    snapshot in the fixtures or the collection (a test reads the table and
    the fixtures), and the coverage helper reports unmapped tags by count.
11. Read next appears only when a public, owned comic run has issues left;
    its rows show publisher · year, `n of m read` with an `aria-label`, a
    size pill in issues, one reason. Watch next behaves the same for
    movies once the movie strategy ships.
12. Pick for me returns the same games as before for the `any|` key on a
    games-only collection *up to* the changes in this doc (a snapshot test
    is regenerated once, by hand, with the diff reviewed).
13. Nightly no longer calls `/api/picker/next`; `/admin` shows no "picks"
    step; the masthead shows "Picks live"; no copy on `/shelf/next` or How
    it works says "nightly" about the picks.
14. Matches `chosen.html` at 400px and 1280px in both themes for the
    states "right after a finish", "no slots apply" and "empty"; the lanes
    are absent, not empty, when their pool is empty.
15. Reasons stay first person and name only public items, across media.

## Open questions for Code

- **Radar and Discover share `reference_weights` / `attribute_table`.**
  Keep their plain mode byte-for-byte (they are frozen to a batch and
  tested), and give the picker facet-aware siblings? Or move them to
  facets too in a later plan? Recommendation: siblings now, with a note.
- **Specificity denominator.** Over references only, or over the whole
  collection? References makes "distinctive among what I've judged";
  collection makes "distinctive among what I own". Recommendation:
  collection, so a facet common on the backlog but rare among finishes is
  not over-rewarded.
- **"Read this tonight" write.** Comics have no `pinned_at` semantics and
  no playthroughs. Is it a status move (Reading), a new `read_sessions`
  row, or a pin reused? The comics spec should decide; this doc only needs
  the button to exist and to be owner-only.
- **Day-seeded jitter and the snapshot.** The build snapshot is taken at
  00:17 UTC and the live body at any time; both see the same day's seed,
  so they agree. Confirm the fingerprint's UTC day is the same day the seed
  uses (it is in `public_next_cache` today).
- **Comic Vine concept volume.** A long-running series may carry hundreds
  of characters. Cap per field at the snapshot (say 25, by Comic Vine's
  order) and keep the facet table to what the collection shares?
- **Performance.** The public set scores every public item per request
  and the result is cached on the fingerprint, as today. With 107 games
  and a few hundred comics this is milliseconds; if movies push it, the
  facet table can be built once per fingerprint rather than per strategy.
- **Public `size` shape.** `{unit, value}` on the card versus three
  nullable fields. The former keeps `test_public_outputs` to one new key.
- **Migration.** Nothing new in the schema is required for the engine
  itself; richer snapshots arrive through refresh-metadata. A one-off bulk
  refresh of Comic Vine and TMDB rows is part of done.

---

# Plan

Status `planned` (2026-11-09). Worktree
`~/Developer/joey-haas.dev-worktrees/feat-recommendation-engine`, branch
`feat/recommendation-engine`. One PR. No migration.

## Answers to the open questions (Code, 2026-11-09)

| Question | Decision | Why |
|---|---|---|
| Radar / Discover share `reference_weights`, `attribute_table`, `affinity` | **Siblings now.** Those three keep their behaviour exactly as it is today: the same signatures, and the same output when called without `today`. The new engine lives in `taste.py` beside them. A note in `picker.py` and in this doc points Radar and Discover at a later move. | They are frozen to a batch and pinned by their own tests. Changing them here would widen the PR into two more features. `RECENCY_BONUS` is read only when `today` is passed, and only Play Next passes it, so the old constants stay for the plain path. |
| Specificity denominator | **The whole collection** (every item of every type that has facets). The number is normalised to 0–1 within each facet kind. | This is the spec's own recommendation. It stops a facet that is common on the backlog but rare among finishes from being over-rewarded. |
| "Read this tonight" write | **A status move to Active** ("Reading"), through the existing `POST /api/items/{id}/status`. **Watch this tonight** does the same for movies. | Comics already go through `apply_status`, which gives them playthroughs. No new write and no new table are needed. The **public** comic and movie pools leave Active rows out ("Back to it" reports activity, so it is admin only), so pressing the button takes the row off the lane, the same way Play this does for games. |
| Day seed vs the snapshot | The seed is `(fingerprint UTC date, item_id)`, computed from the same `now` that `next_fingerprint` uses. A test pins that both use one date. | The snapshot and the live body then agree on the day. |
| Comic Vine volume size | **Cap each field at 25** (`characters`, `concepts`, `teams`, `locations`), in Comic Vine's order, at the snapshot. | This bounds the snapshot and keeps the facet table to tags the collection actually shares. |
| Public `size` shape | **`{unit: "hours" \| "issues" \| "minutes", value}`.** | One key. "minutes" appears as a *value* here, not a key, so the `FORBIDDEN` walk is unaffected. |
| Performance | Facets and specificity are built **once per body build**, shared by every strategy and by Pick for me. The result is cached on the fingerprint, as today. | |
| Migration / bulk refresh | None in the schema. `POST /api/items/refresh-metadata/bulk?type=` is widened to `comic` and `movie`, and the admin collection page gets the matching buttons. | AC 9 needs a way to refresh rows in bulk. Today only games have one. |

## Deviations from the spec (flagged for "go")

1. **The card gets two new keys, not one.** It gains `size` and `progress`. `progress` is `{read, of}` for comics and absent for everything else. It is needed for the `1 of 4 read` mark, which cannot be drawn without it. `read_to` is already public on `/api/public/comics`, so this exposes nothing new. AC 3 is read as "`size` and `progress` are the only new keys". On a comic card, `platform` carries the publisher.
2. **No year on lane rows.** The card has no year field, and adding one would make a third key. Rows show `publisher · n of m read`.
3. **Facet reasons are plain text.** The mockup shows bold facets (`.facet b`), but reasons stay strings. Adding markup to a public string field is a sanitisation surface this feature does not need.
4. **The empty-pool box uses the mockup's longer copy.** That text is "…clears as soon as one is added — or try Pick for me". It replaces the spec's one-line version, because `chosen.html` wins.
5. **The public profile includes the play record of public items.** `/api/public/diary` already publishes days and minutes for public games, so this leaks nothing. The *reasons* never mention it (AC 8). Private items' records count only in admin mode.
6. **`/api/picker/next` leaves `JOB_ROUTES`** once the nightly call is gone. This is least privilege: the job token should not reach a route that writes shown events.
7. **Movie size bands are my own numbers**, since the spec gives none: short up to 100 minutes, medium up to 140, long beyond. They live in the movie strategy and are tunable.

## Question that needs Joey before Task 12

**The real-collection fixture (AC 5, AC 6) would be committed to a public repo.** My default is to export every game, titles and ids replaced with `Game 001…`, keeping only the facet-bearing tags (genres, themes, keywords, similar-game *indices*), the rating, favorite, status, time to beat and *relative* finish ages in days. Covers, notes, dates, platforms and private flags are dropped. Tag sets can still fingerprint a well-known game. The alternative is **public rows only**, which carries no risk but may not include the cases the audit found. Answer with the "go"; Tasks 1–11 do not depend on it.

## Milestones

```
Milestone 1 (auto): Tasks 0–11
   Task 0 hands Joey the export command early; nothing waits on it until Task 12
STOP — data carve-out: Joey has run the export (default: all games, anonymised)
Milestone 2 (auto): Task 12 (real-collection regression, facet curation pass)
STOP — CI / auth carve-out review
Milestone 3 (auto): Task 13 (nightly.yml drops picks; JOB_ROUTES; test_job_token)
Finish gate → PR
```

Every task follows TDD: write the failing test, implement, then bring the suite back to green. Backend tests run one at a time (`./.venv/bin/pytest`), because they share the single test database. Each task ends in its own conventional commit. All tasks run sequentially; none is flagged parallel-safe, because Tasks 4–8 thread through `picker.py` and the public body.

## Tasks

### Task 0 — Collection export script (no prod access by Code)
- **Files:** `backend/scripts/export_picker_fixture.py`, `backend/scripts/README.md`, `backend/tests/test_export_picker_fixture.py`.
- **Does:** reads `items`, `playthroughs` and `play_sessions` and writes `tests/fixtures/picker_collection.json` with the anonymisation above. `--public-only` restricts the export to public rows. `--dry-run` prints counts only.
- **AC:**
  - the output contains no title, uuid, cover, note, absolute date or private flag (asserted by a walk over the output);
  - the export is deterministic, so two runs produce byte-identical files.
- **Tests:** run against the test DB with seeded rows.
- **Then:** give Joey the `!` command to run from the worktree. Do not wait for it.

### Task 1 — Richer adapter snapshots (AC 9)
- **Files:** `sources/igdb.py`, `sources/tmdb.py`, `sources/comicvine.py`, `scripts/record_tmdb_fixtures.py` (new), `scripts/record_comicvine_fixtures.py` (add the volume), the re-recorded fixtures `tests/fixtures/tmdb_movie.json` and `tests/fixtures/comicvine_volume.json`, `tests/test_sources_{igdb,tmdb,comicvine}.py`, `sources/README.md`, `scripts/README.md`.
- **IGDB:**
  - remove `KEYWORD_LIMIT` from `_parse_detail`;
  - keep it in `parse_upcoming`, because Radar's lane 3 is frozen (sibling rule);
  - invert `test_keywords_are_trimmed_to_ten` so that all 62 Mario Kart World keywords survive.
  - `FIELDS` does not change, so the IGDB fixtures need no re-recording.
- **TMDB:**
  - fetch with `append_to_response=credits,keywords`;
  - store `keywords` as a list of names, absent when there are none;
  - record the fixture fresh, never by hand-editing it.
- **Comic Vine:**
  - a separate `VOLUME_FIELD_LIST`, passed only from `fetch`, so `/search` requests do not widen;
  - store `characters`, `concepts`, `teams` and `locations` as name lists capped at `CV_TAG_LIMIT = 25`, each absent when empty;
  - `genres` stays `[]`;
  - the issue snapshot keys still survive a volume refresh (existing `ISSUE_SNAPSHOT_KEYS` test).
- **AC:** AC 9.

### Task 2 — Bulk refresh for comics and movies
- **Files:** `items.py` (`refresh_metadata_bulk`), `tests/test_items_refresh*.py`, `frontend/src/pages/Collection admin` (the "Refresh game metadata" control gains Comics and Movies), its test, `sources/README.md`.
- **Does:** for `type=comic|movie`, calls `adapter.fetch` per item (neither source has a `fetch_many`) and keeps per-item failures as errors, as games do. It stays admin-session only and stays out of `JOB_ROUTES`.
- **AC:**
  - a comic refresh keeps `issues`, `released`, `ongoing` and `fetched_on`;
  - `type=book` and other types still return 422.

### Task 3 — `facets.py` (AC 10)
- **Files:** `backend/facets.py`, `backend/tests/test_facets.py`, `backend/scripts/facet_coverage.py` (test-time helper, documented in `scripts/README.md`).
- **Defines:**
  - `FACET_MAP: dict[(source, kind, exact string), facet]`;
  - `FORM_FACETS`, `THEME_FACETS` and `TONE_FACETS`;
  - `facets_of(item) -> frozenset[str]`, where an unmapped tag becomes `"{type}:{kind}:{value}"` and a form facet is stored type-scoped (`"game:form:platformer"`);
  - `is_form(facet)`;
  - `specificity(items) -> dict[facet, float]`, which is `log(N/carriers)` normalised 0–1 within each kind over the whole collection;
  - `coverage(items) -> list[(source, kind, value, count)]` for unmapped tags.
- **Curation:** strings are taken from the fixtures and from the public shelf's own data (`/api/public/items`, public data only). The two-carrier rule for adding a facet is applied. Task 12 runs a second pass on the real export.
- **AC:**
  - AC 10: every mapped string occurs in a fixture or in the committed collection export, checked by a test;
  - form facets never bridge types;
  - mode and perspective tags are not facets.

### Task 4 — The picker item carries what the engine needs
- **Files:** `picker.py` (`PickerItem` gains defaulted fields), `picker_routes.py` (`to_picker_item`, a new `load_play_records(session, item_ids)` built on `playthroughs.runs_with_journal`), `tests/test_picker_routes.py`, `tests/test_picker.py` (helper).
- **New `PickerItem` fields, all defaulted so `radar._picker_item` still builds:**
  - `source: str | None`;
  - `tags: tuple[(kind, value)]`, holding every source tag (IGDB genre, theme and keyword; TMDB genre and keyword; Comic Vine concept, character, team and location);
  - `issues_owned_count`, `issues_read`, `runtime_minutes`;
  - `play: PlayRecord | None`, with `hours`, `sessions`, `finished_runs`, `runs` and `bounced`.
- **Bounce:** exactly one journal day in a run that ended paused or abandoned.
- **Comics:** read from `comics.owned_set` and `read_state`.
- **AC:**
  - existing callers are unchanged;
  - a movie row carries its runtime;
  - a comic row carries its owned count and its read count.

### Task 5 — `taste.py`: weights, profile, affinity (AC 6 synthetic, AC 7, AC 8)
- **Files:** `backend/taste.py`, `backend/tests/test_taste.py`.
- **`taste_weights(items, today) -> dict[id, float]`:**
  - `BASE_WEIGHTS` as today;
  - `RECENCY_CAP = 0.15`, halving every `RECENCY_HALF_LIFE_DAYS = 14`;
  - the rating mean is taken **per type**;
  - `min(weight, 1.0)` unless the item is a favorite;
  - engagement = hours ÷ time to beat, clamped 0–1.5 (unknown length → sessions ÷ 8). It adds up to +0.3 to a finished item;
  - an in-progress item with engagement ≥ 0.5 becomes a reference at +0.3;
  - a bounce costs −0.2;
  - a comic's engagement is read ÷ owned; a run read to its end counts as a finish. A movie counts as finished when watched.
- **`facet_profile(items, weights) -> Profile`:** facet → (mean weight, specificity), with specificity computed over every item.
- **`affinity(item, profile)`:**
  - `50 + 50 × Σ(w × (0.25 + 0.75 × spec)) / Σ(0.25 + 0.75 × spec)` over the facets the profile has **seen**;
  - multiplied by the coverage factor `min(1, seen / 3)`, applied as a shrink toward 50;
  - unseen facets do not vote.
- **AC:**
  - AC 7, both halves;
  - AC 8's weight effects;
  - AC 6 on a synthetic pair: a two-tag game with no keywords scores below a game sharing three or more seen, specific facets.

### Task 6 — Strategies
- **Files:** `backend/strategies.py`, `backend/tests/test_strategies.py`.
- **Shape:** a frozen dataclass `Strategy(type, verb, pool(item, mode) -> bool, size(item) -> (unit, value) | None, bands, extra_terms, slots(mode))`, one per type:
  - **`GAME`:** the pool as `candidates()` today (the event filters stay in the engine). Bands come from `SIZE_BANDS`.
  - **`COMIC`:** an owned run with issues left. The admin pool includes Active rows; the public pool leaves them out. Bands: short ≤ 4 issues, medium ≤ 12, long beyond. The extra term is run completeness: owned ÷ span, which lowers quality for a gappy run.
  - **`MOVIE`:** owned and unwatched (backlog or paused). The public pool leaves out Active rows. Bands are 100 / 140 minutes.
  - **`BOARD_GAME`:** a stub with an empty pool.
- **Slots:** as in the spec table.
- **AC:** the pool rules hold per type and per mode; a new type means a new strategy entry and nothing else, which a test asserts against the registry.

### Task 7 — One scorer, diversity, admin Play Next on the new engine (AC 5 synthetic)
- **Files:** `picker.py` (`score_pool`, `diversify`, `recommend` rewritten over strategy and taste; `MOOD_BUCKETS` becomes mood → facets with `mood_facets`; `public_reasons` gains the facet sentence, cross-media and public-only), `picker_routes.py` (`PickNextIn.type`, default `game`), `tests/test_picker.py` (rewritten where it encoded the old affinity, recency or Change of pace mechanism; the weight pin kept), `frontend/src/lib/pick-for-me-keys.json` (regenerated only if `combo_keys` changes; the moods themselves stay).
- **Diversity:** picks take distinct leading facets, and at most one shares its leading facet with the last finish. When no candidate qualifies, the rules relax in that order.
- **Slots:**
  - Change of pace is a label on the second pick, given only when `change_of_pace_reason` is not None;
  - "Short and sweet" is retired as a mechanism, since diversity replaces it;
  - Waited longest and Pick it back up stay for admin.
- **Unchanged:** shown events are still written for admin picks.
- **AC:**
  - AC 5 on a synthetic platformer-finish set;
  - admin `type=comic` returns comic picks;
  - staleness and skips still apply in admin mode.

### Task 8 — The public set is live (AC 1–4, 12, 15)
- **Files:** `backend/public_picks.py` (new: `public_picks(session, now) -> PublicSets(game, comic, movie, profile)`), `public_outputs.py` (deletes `public_picks_with_day`, `PICKS_WINDOW`, `SLOT_ORDER`, `UNSLOTTED`, `WITHHELD_SLOTS` and `generated_at.picks`; `PublicTonight` gains `read_next` and `watch_next`; the card gains `size` and `progress`, drops `time_to_beat_hours`, and `PublicLastFinish` keeps it), `public_pick_for_me.py` (fed from the same scored game pool), `public_next_cache.py` (drops `late_picks` and the `PICKS_WINDOW` import), `public.py`, and the tests `test_public_outputs.py` (event-day tests replaced with live-set tests; `PICK_FIELDS`, the `PublicTonight` fields and `FORBIDDEN` updated), `test_public_pick_for_me.py`, `test_public_next_cache.py` (the late-pick test replaced by "an event written today changes nothing") and `test_picker_public_table.py`.
- **Public set rules:**
  - it reads public rows of every type, plus nevers created before UTC midnight, plus the play record of public items;
  - jitter is seeded per day; there is no staleness or waiting term;
  - up to three game picks and up to two each for comics and movies;
  - an empty lane comes back as `[]`, and the frontend renders it as absent.
- **AC:**
  - AC 2 as a pure-function test: an event written today changes nothing;
  - AC 1 at the API level: finish via the status route, then a refetch shows a new body;
  - AC 3 and AC 4;
  - AC 12: Pick for me's `any|` output on a games-only fixture, reviewed once by hand and pinned;
  - AC 15: no private title in any lane's reasons, using the existing leak walk.

### Task 9 — Frontend: Tonight lanes, copy, freshness, Play Next type switch (AC 11, 13, 14)
- **Files:** `SizePill.jsx` (takes `size`, falling back to `time_to_beat_hours` during the deploy window), `PickList.jsx` (`heading`, `caption`, `verb`, a progress mark with `role="img"` and `aria-label`), `Lane.jsx` (new: a region labelled by its `h3`), `pages/Next.jsx` (lanes; the "Or instead" caption in both branches; the empty dashed box with a `#pick-for-me` link; the owner note after the lanes), `Freshness` and `StatusStrip.jsx` ("Picks live"), `content/spine.js` (the spec's copy keys, lede, empty copy, and How it works stops 3 and 7 including the capture row and tour summary), `lib/snapshot.js` (`isNextBody` tolerates the lanes and a missing `generated_at.picks`), `index.css` (`.lane`, `.progress` and `.empty-box` with tokens only, plus the phone layout), `pages/PlayNext.jsx` (a Game / Comic / Movie chip row; `type` joins the request body and the effect deps; changing type clears `exclude`).
- **Owner actions:**
  - Read / Watch this tonight → `POST /api/items/{id}/status` with Active, then a refresh;
  - Not tonight → the existing skip;
  - focus follows the existing `data-tonight-title` / `data-tonight-undo` contract.
- **Tests:** `Next.test.jsx` (lanes present and absent, freshness, empty box, actions, focus), `PickList`, `SizePill`, `StatusStrip`, `HowItWorks`, `PlayNext` and `snapshot` tests updated; `npm test` and `npm run build` green.

### Task 10 — Docs and changelog
- **Files:** repo `CLAUDE.md` (the Play Next, public picks and Pick for me paragraphs; the nightly order; the fingerprint list loses late picks; the Shelf components list), `backend/README.md` or picker docs where they describe picks, `sources/README.md`, `frontend/changelog.md` (`## 2026-11-09`, one bullet linking `/shelf/next`), and `scripts/smoke.sh` (the picks expectations: no `generated_at.picks`, and the lanes are present as arrays).
- **AC:** no doc claims the picks are nightly; the changelog parses (`npm run build`).

### Task 11 — Local end-to-end check
- **Setup:** run the worktree API on local `stats_dev` (memory: worktree local verification) and Vite.
- **Checks in the browser pane:**
  - `/shelf/next` at 400px and 1280px, in both themes;
  - the states "right after a finish" (finish via Wrap up and watch the picks change in the same refetch), "no slots apply" and "empty game pool";
  - the comic lane present and absent;
  - admin Play Next with the type switch.
- **AC:** AC 1, 13 and 14 seen. Screenshots go to Joey.

### Task 12 — Real-collection regression and facet pass (after STOP)
- **Files:** `tests/fixtures/picker_collection.json` (from Joey's run), `tests/test_taste_collection.py`, and `facets.py` (a curation pass driven by `facet_coverage.py` on the export).
- **AC:**
  - AC 6 on the real data: the audit's two-tag, no-keyword game no longer outranks games sharing three or more seen facets;
  - AC 5 on a Balan-style set: one finished platformer, at most one pick sharing its leading facet, no two picks sharing one;
  - AC 10 still holds;
  - the coverage report is attached to the PR body.

### Task 13 — Retire the nightly picks step (after STOP: CI / auth carve-out)
- **Files:** `.github/workflows/nightly.yml` (drop `call picks`, and fix the header comment and the step numbering), `items.py` (`JOB_ROUTES` loses `POST /api/picker/next`), `tests/test_job_token.py` (`EXPECTED`), and `CLAUDE.md` (the nightly order).
- **AC:**
  - AC 13;
  - `test_job_token` is green with the smaller whitelist;
  - `actionlint` passes on the workflow, if it is installed.

## Smoke and environment tests

- **Local:** Task 11 (browser pane). The suites run with `./.venv/bin/pytest`, `npm test` and `npm run build`.
- **Post-deploy:**
  - run `./scripts/smoke.sh https://joey-haas.dev https://api.joey-haas.dev`;
  - check `/api/public/next` for `read_next` and `watch_next` arrays, no `generated_at.picks`, and `size` on the picks;
  - in the browser, check `/shelf/next` for "Picks live";
  - finish nothing in prod as a test. Joey presses Refresh comic metadata and Refresh movie metadata once on `/admin/collection` (AC 9's one-off). After that, the comic lane shows reasons with facets.
- **Deploy order:** no migration. Merge, then let Render deploy both services. The nightly change takes effect from `main` on the next run.
