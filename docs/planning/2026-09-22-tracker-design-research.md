# Tracker Design Research — how game/media trackers look and how they recommend

Research conducted 2026-09-22 to inform the media tracker's visual overhaul and
its "what should I play" features. Sources: fetched pages and screenshots of
Backloggd, Letterboxd, HowLongToBeat, Steam, Grouvee, Infinite Backlog,
Backloggery, Completionator, Exophase/TrueAchievements, StoryGraph, Backlog
Shuffle, Pick a Game, Playnite's PlayNext add-on, Steam Labs write-ups, and the
recent LLM-recommender literature. Findings feed
`2026-09-22-tracker-enhancement-design.md`.

## Where the tracker stands today

`/collection` renders inside the site's narrow reading column, so the poster
grid is four across on a desktop. Stats are two plain lists (by type, by
status); the rating histogram and finishes-per-month blocks are wired but
hidden because no item has a rating or a finish date yet (68 games public, 50
backlog, 1 active, 17 finished). Filters are two `<select>`s. There is no hover
state, no status marking on posters, no item page, no favorites row, no sort.
The warm-dark palette, serif display face, and off-white text are already the
right foundations — every well-regarded dark tracker uses an off-white on
near-black and lets the covers carry the saturation.

## What the best trackers do visually

**Backloggd** (the current best-in-class game tracker) is a Letterboxd clone
for games: a dense poster grid (~10 across at 1280px), sub-status tabs
(Played / Playing / Backlog / Wishlist) with a single sort dropdown (When
Added, Last Played, User Rating, Release Date, Random…), ratings as half-stars
stored 1–10. Its game page is the anatomy worth copying: a blurred backdrop
hero, cover overlapping the hero's bottom edge, title + developer + release
badge, genres and platforms as chips, then a row of stat tiles — a ratings
histogram with the average in large type, engagement counters, and three
time-to-beat tiles (average / to finish / to master). Its stats page (backers
only) leads with headline numbers ("2,238 games · 902 played (40%) · 1,336
backlog (60%)"), a yearly timeline with a Release-vs-First-Played toggle, and a
rule that empty sections are hidden. Two-layer status: a shelf (Playing /
Played / Backlog / Wishlist) plus an outcome (Completed / Mastered / Shelved /
Abandoned / Retired).

**Letterboxd** is the reference design. Profile header: avatar, name, then a
row of five hero numbers ("2,582 films · 98 this year · 158 lists…"); a
"Favorite films" row of exactly four posters; "Recent activity" as four posters
with stars beneath. Library grid: stars directly under posters, small/large
poster toggle, "fade watched" toggle, about twenty sort options (too many), a
rating-range slider. The stats page ("A Life in Film") opens with six hero
numbers, ranked "Best of <year>" posters with numbered corners and a year
segmented control, a by-year bar chart with Films / Ratings / Diary tabs, and
"highest rated decades" poster rows. Its year in review ends with "Highs and
lows" (highest/lowest rated, oldest/newest, longest/shortest). Palette from its
brand page: canvas #14181c, card #1c2228, text #d8dfe6 body / #99aabb muted
(never pure white), green #00e054 for rating/action, blue for links, orange
only for Pro. One accent per meaning.

**HowLongToBeat**'s identity is "the number in the box": four time cards
(HLTB / Main Story / Main + Sides / Completionist) in large type above the
description, a counters strip (Playing / Backlogs / Replays / Retired /
Rating / Beat), and a per-platform table. Its year in review is told as
superlative lists (most retired, most backlogged, longest, quickest) rather
than charts.

**Steam**'s library is shelf-based (Recent, Play Next, custom shelves) with a
grid-size slider over 600×900 capsules. Steam Replay is a single long scroll of
stat cards: games played vs. the median, achievement counts, longest daily
streak, a monthly playtime bar chart, top games as capsule art with a
percentage of playtime, a new/recent/classic release-age split.

**Grouvee** shows why text-only rows fail ("Now Playing" as plain links).
**Infinite Backlog** and **Completionator** track ownership per copy
(physical/digital, acquisition date and price, collection value) and per-game
progress bars with sub-ratings. **Backloggery**'s status vocabulary
(Unfinished / Beaten / Completed / Mastered / Null) and its stacked
"Beaten x% / Completed y%" progress bar per platform remain the clearest
completion visual. **StoryGraph**'s stats page (moods donut, pace, pages over
time, star histogram, publication-year vs. read-date scatter) is the model for a
"personality" stats view; its users' top request is hiding empty graphs.

### Patterns worth adopting

Three hero numbers with one time-scoped ("68 owned · 17 finished · 9 this
year"). A fixed-count favorites row of four covers. Stars under posters, not on
hover. A single sort control with five or six options including Random.
Poster-size and dim-finished toggles. Status shown as a small corner mark on
the poster, not a text badge. An item page with a blurred-cover hero, chips for
genre/platform, community score beside personal rating, and a "similar in this
collection" strip. Stats as a stacked status bar, a ten-bar rating histogram,
and a twelve-month finishes strip — every one hidden when empty. A year in
review composed from the same blocks, ending in highs and lows.

### Anti-patterns

Text-only library rows; community counters that mean nothing for one user
(TA Ratio, tracked-gamer counts, world rank); numbered pagination on a
personal-sized library; twenty sort options with direction submenus; empty
charts; pure white text on near-black; overloaded status taxonomies without a
"not counted" escape hatch; SPA-only pages with no shareable server render.

## How products recommend games

### Picking from what you already own

Steam's **Play Next** shelf uses the Interactive Recommender's model on the
user's own library. Its best idea was explaining picks by comparables ("you've
played these similar games"); its documented failure was staleness (the same
three games for a year) and a popularity skew toward famous titles. **Backlog
Shuffle** is the cleanest input model: two questions — session length
(Quick / Evening / Deep) and mood chips — as hard filters, HowLongToBeat data to
match length, a single spotlight card with a "Why this game?" line, Shuffle
Again that keeps the filters, and Pin to commit to a pick. **Pick a Game** adds
one-click presets: "Nearly Completed" (70–110% of main story), "Expensive
Regrets" (owned long, never started), "quick sessions"; recent picks are
excluded from the next roll. **Playnite's PlayNext add-on** is the
best-documented scoring model and maps almost one-to-one onto this tracker's
data: attribute affinities (genres, modes, developers, series) learned from
favorites (max score), ratings relative to the user's mean (+50…+100 above, 0…−50
below), and recency; game-level bonuses for critic/community score, release-year
fit, and length fit; a random term so Refresh reorders; user-tunable weights.
**StoryGraph's Up Next Suggestions** pick from the user's own to-read pile with
one named reason per pick ("matches your moods", "waiting longest", "fast one
to catch up on your goal") — three cards each with a different label rather
than one ranked list. HowLongToBeat, Backloggd, Grouvee, and Infinite Backlog
have no picker; Backloggd's roadmap item #1 is recommendations (17K votes), and
its reviewers' summary of the real problem: "200 games I already owned and
90 minutes."

### Discovering what to add

Steam's **Interactive Recommender** is trained on playtime, deliberately
ignores tags and reviews, and exposes two sliders (popularity: mainstream ↔
niche; release window) plus tag include/exclude and exclude-owned/wishlisted.
Rankings are precomputed for a 5×6 grid of slider positions and interpolated
client-side so drags are instant. The **Discovery Queue** shows twelve cards
one at a time with Wishlist / Not interested / skip; its documented failures
are popularity, "Not interested" not generalising, and skip being treated as
dislike. Steam Labs' **Deep Dive** (very similar / somewhat similar / similar
gems) and Lars Doucet's **Steam Diving Bell** (deliberately dumb, transparent
engines: forward, reverse, hidden gem; hover shows the tag-match breakdown)
were the best-loved experiments. **Backloggd's Discovery Engine** (2025) is
sixty highly-rated unplayed titles behind an obscurity slider, and its author
says the missing piece is a Hide control. **StoryGraph** cold-starts with a
preferences survey and offers "out of your comfort zone" rows. Console stores
present rows titled by the seed ("Because you played X"); Nintendo's eShop
refreshes "Game Finds For You" weekly.

Free similarity data: IGDB `similar_games` (already stored), plus `themes`,
`keywords`, `game_modes`, `player_perspectives`, `hypes`, and the
`/v4/game_time_to_beats` endpoint (seconds; `hastily` / `normally` /
`completely` / `count`; batch by `game_id` in chunks of 100). RAWG's
`/suggested` is paid-only. Steam's "More Like This" page is public HTML but
tag-co-occurrence biased toward popular games.

### What the LLM literature says

Free-form LLM recommendations hallucinate rarely for famous titles and badly
for the long tail (11–61% off-catalog in non-canonical domains, arXiv
2608.10008), and the model's stated confidence does not track whether an item
exists. Constraining generation to a supplied candidate list drives
out-of-catalog picks to zero (RecLM). LLM re-rankers favor early candidates,
so shuffle the list and cap it around twenty; short histories (the top and
most recent ten) work as well as long ones (arXiv 2411.00331). LLMs default to
popularity (their top movie picks coincide with the IMDb Top 250); asking for
less popular titles and separating a "safe bets" row from a "deep cuts" row
counters it. The production pattern everyone converges on is retrieve → filter
→ LLM re-rank → explain, with the LLM never inventing the catalog.

### Upcoming releases

IGDB supports the query directly — third-party integrations use the shape
`where hypes >= N & first_release_date > <now> & platforms = (508, 130); sort
hypes desc;` with `release_dates` giving per-platform dates, precision, and
`human` strings. Two cautions: `first_release_date` is populated for
year-only and quarter-only dates too, so precision has to be checked on
`release_dates`; and the `status` field those integrations filter on has been
superseded by `game_status` in IGDB's 2025 changes, so both need confirming
against the live API. There is no API for boutique physical publishers
(Limited Run, Super Rare, iam8bit, Fangamer); those stay manual entries.

## Pitfalls to design against

Hallucinated titles (resolve everything to an IGDB id before display; prefer
supplying ids). Popularity skew (slider plus a hidden-gems row). Staleness
(rotate, decay shown picks, exclude recent rolls). Skip ≠ never (two distinct
signals). Cold start (this collection has zero ratings: favorites, finished
status, and times_completed are the only positive signals until ratings
exist). Genre lock-in (reverse matches and comfort-zone rows). Gemini's free
tier is twenty requests per day per model, measured — one LLM call per
generation, cached batches, never automatic.
