### 1. Persona and goal
- Persona: curious, non-technical friend-of-a-friend on a wide desktop browser, texted a link ("check out his game collection").
- Goal: understand the page, explore games, comics, the daily game, a blog post, and work out what the whole site is.

### 2. Journey log
1. /shelf/games - expected a list of games - saw "My Shelf: a tracker for my physical game and comic collection", big stats (109 owned, 58 finished, 8 in 2026), a "Now playing" card (Lies of P), then filters and a cover grid - read it, scrolled - pleased (clear in 5 seconds, though who "I/my" is only shows in the small "Joey Haas" logo).
2. Games filters - clicked Setting > Horror - list shrank to "17 of 109 games" with a "Clear filters" link - pleased. The filter block is a wall of ~25 pills; a bit much.
3. Clicked Catherine: Full Body - URL became /shelf/<long random id>/ - detail page with rating, community score, "Playthroughs" table (# / Started / Finished / Outcome / Journal), "More from this shelf" - ok, but I saw an "Edit" link and "Dates change on the edit page" that is not meant for me - confused.
4. /shelf/comics - expected comics - saw 12 series stats (SERIES, BOOKS OWNED, ISSUES OWNED, MISSING 28), filters, grid - the intro paragraph touches the stat cards (cramped); the grid has four tiles all named just "Creepshow", and cards have different heights with progress bars at different vertical positions - ok/confused.
5. Clicked Hello Darkness - "To read", "1 of 2, 1 missing", "Next to read #1", "First gap #2", "The run: I own #1, none read yet." - ok; "Comic Vine" and "Trades" unexplained.
6. Typed the guessed URL /shelf/daily - "That didn't load. Try again in a minute." with a Try again button - annoyed (I guessed the URL, but this is a dead end with no nav help beyond the top bar).
7. Used the "Daily game" tab instead (URL /daily) - Wordle-like: "Guess the game on my shelf in six", type-ahead search - typed "Mario", picked Super Mario 64 - row showed platform N64, year "1996 later", genre "Platform", size "Medium longer" in orange/yellow boxes - delighted, but the colours/arrows are not explained anywhere I could see.
8. "What's next" tab - "Tonight: Lies of P" with buttons "Wrap up / Log tonight / Not tonight" and tabs Tonight / Pick for me / In stores now / Coming soon / Further out / Not on cartridge - did NOT click the buttons because they look like they change real data - hesitant/confused (are these for me or Joey?).
9. "Tour" tab (/shelf/how) - "A tour of My Shelf, in nine stops" with items like /ADMIN/RADAR, NIGHTLY.YML, TESTS - jargon, I skimmed and left - annoyed. Page text readout also showed leftover Lies of P content from the previous tab, so tab content may linger.
10. Blog - one post, "How My Shelf works" (11 min read) with a table of contents - fine, but I would not read an engineering post. The header nav items sit in different x positions than on the Shelf pages (page width changes).
11. Home - "Senior software engineer, Denver... Shipping software since 2012" with Now / Focus / Stack panel and buttons "About me / Resume / Email me / See My Shelf" - ah, this is a personal portfolio, and the shelf is a side project. Pleased - this is where I finally understood the site.

### 3. Findings
- **F1** | Severity: major | Where: all /shelf pages for a link recipient | What happened: the link opens straight into the shelf with no cue of whose it is or that it sits inside a portfolio. "My/I" appears with no name beyond a small logo; I only learned it's a developer's portfolio after going Home. Expected: a one-line "Joey's game collection" or a visible byline. | Fix kind: copy / layout | Suggestion: add "Joey Haas's shelf" in the header text or subtitle, and a "Part of joey-haas.dev" link. | Evidence: first screenshot, title "My Shelf", subtitle starts "A tracker for my...".
- **F2** | Severity: major | Where: /shelf/daily | What happened: "That didn't load. Try again in a minute." for a plausible URL, while /daily works. Expected: a redirect to the daily game or a proper not-found page with links. | Fix kind: navigation | Suggestion: redirect /shelf/daily to /daily and give error states a nav and a home link. | Evidence: mostly blank page with a single error line.
- **F3** | Severity: major | Where: Tour page | What happened: jargon (admin paths, NIGHTLY.YML, TESTS, "pipeline", "Game-Key Card", "cartridge radar"). Expected: plain words for a visitor. | Fix kind: copy | Suggestion: lead with plain captions, move file/route names to small secondary text; say who the tour is for. | Evidence: nine-stop list with monospace path labels.
- **F4** | Severity: major | Where: Game detail, Comic detail, What's next | What happened: owner controls ("Edit", "Wrap up", "Log tonight", "Not tonight", "Dates change on the edit page.") shown to a stranger. I wasn't sure whether pressing them would change something. | Fix kind: interaction | Suggestion: hide for visitors, or label them clearly "Joey only". | Evidence: Edit link under the title on Catherine; three buttons on the Tonight card.
- **F5** | Severity: minor | Where: Daily game | What happened: result cells (orange/yellow boxes, "later", "longer") have no legend; "Day 18 - Nov 19", "Streak/Played/Avg guesses" are fine. | Fix kind: copy / visual design | Suggestion: add a small colour key or a "How to play" toggle. | Evidence: row after guessing Super Mario 64.
- **F3b/F6** | Severity: minor | Where: Comics list | What happened: four tiles all titled "Creepshow" and a "Single book" label; cards of different heights, progress bars at inconsistent positions; the intro paragraph butts against the stat cards. | Fix kind: layout / copy | Suggestion: show volume/year in the title, align card heights, add spacing under the intro. | Evidence: Comics page top and grid.
- **F7** | Severity: minor | Where: Games filters | What happened: ~25 filter pills across 5 rows before any game appears; "Play style/Setting/Tone" meanings unclear; "Dim finished" and "Comfortable/Compact" toggles look like the same kind of control as filters. | Fix kind: layout | Suggestion: collapse filters behind a "Filter" button or show the first row only. | Evidence: scrolled view of filter block.
- **F8** | Severity: minor | Where: Detail page URLs | What happened: item pages use long random IDs (/shelf/c1fc4f22-...), not shareable-looking and the breadcrumb on Catherine says "My Shelf / Catherine" while comics say "My Shelf / Comics / title". | Fix kind: navigation | Suggestion: slug URLs; make breadcrumb consistently include "Games". | Evidence: URL bars, breadcrumbs.
- **F9** | Severity: nit | Where: Header | What happened: header contents shift horizontally between wide Shelf pages and narrow Blog pages. | Fix kind: layout | Suggestion: same container width for the header everywhere.
- **F10** | Severity: nit | Where: Shelf header | What happened: "Tonight: Hades II / Today's daily game / Overview" link row under stats is unlabeled and small; "Tonight: Hades II" disagrees with "Now playing: Lies of P" and I did not know which is current. | Fix kind: copy | Suggestion: label as "Tonight's pick" or drop.

### 4. Could not do
- Did not click the What's next action buttons (looked like they change data).
- Did not try the global search (Cmd+K) or Year in review; skipped the Tour details and the long blog text after the intro.

### 5. Worked well
- Immediate clarity of the Games page: big numbers, now-playing card, cover art grid.
- Filters respond instantly with a result count and "Clear filters".
- Daily game: type-ahead with covers, clean grid, "same puzzle for everyone, no account".
- Comics progress bars (owned / missing / read) are a neat idea.
- Home page explains who and why in two lines; the Now/Focus/Stack panel is nice.

### 6. Overall
I would stay and poke around for 10 minutes, mostly because of the covers and the daily game, and I would send it to another game-loving friend. I would not read the Tour or the blog. What nags me is the first minute: I landed with no idea whose shelf this was and only worked it out by going to the home page myself. The owner-only buttons and the broken-looking /shelf/daily error also made me trust the page a little less. Fix the orientation and the jargon and it becomes a charming personal site.
