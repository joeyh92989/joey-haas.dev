### 1. Persona and goal
- Persona: phone visitor (thumb, impatient, no prior knowledge) who arrived from a group-chat link.
- Goal: work out what the site is, visit 5+ sections (about, projects, shelf games/comics, blog, stats, a place page), open a detail page, try search and the light/dark switch, then keyboard-navigate one page.
- Caveat: resize_window reported success for 390x844, but the page measured innerWidth 633 CSS px (dpr 1.8). Everything below was seen at about 633px wide, not a true 390px. Horizontal-scroll checks at 390 were NOT verified. At 633px I saw no horizontal scroll (scrollWidth == innerWidth on home).

### 2. Journey log
1. Home (/) - expected: what is this? - saw: "Shipping software since 2012, from roadmap to production", Senior engineer, Denver, buttons About / Resume / Email / See My Shelf / GitHub, and a Now/Focus/Stack/Last shipped/Playing card - read it in about 5 seconds as a personal portfolio, with a games twist - pleased.
2. Home header - expected a menu - saw Search, Light, Menu buttons top right, large and easy to tap - tapped Menu - full-width list: Home, About, Projects, My Shelf, Blog, Resume. Clear, big rows. No Stats, Now, Places, TIL entries - ok, but see F2.
3. Projects (/projects) - one project, "My Shelf", with screenshot, long text, bullets. Readable. Title link is the only way in - ok.
4. Shelf (/shelf -> /shelf/games) - heading, sub-tabs (Games, Comics, What's next, Year in review, Tour, Daily game), stat cards, search box. Typed "zelda", pressed Enter - the page looked unchanged in the viewport; I had to scroll about 13 wheel ticks past Now Playing and a wall of filter chips to find "2 of 109 games" - confused, then pleased once found.
5. Game detail (Breath of the Wild) - cover, meta, "Finished", "My copy: Nintendo Switch . Full game on cartridge", tags, description with "More" - nice. A tiny "Edit" link sits under the title - confused (visitor sees an edit control).
6. Search overlay (header Search) - lists Pages (Home, About, Projects, My Shelf, Games), "stats" found Stats, Enter opened it - pleased. "places" and "outings" returned "Nothing for ..." with a "Search the shelf" link.
7. Stats (/stats) - view and visitor cards, bar chart, per-page list. Readable. Chart axis labels small but legible - ok.
8. Blog (/blog) - one post, RSS link, "Shorter things are in TIL". Fine. Footer exposes Source, Now, Daily game, TIL, Colophon, Stats, RSS, Admin as tiny inline text links.
9. Dismissed search overlay with Escape, then tapped where a blog post title was - landed on /projects instead. Unsure whether the overlay stayed open or Escape was ignored - confused (noted as F5, low confidence).
10. Theme switch (header "Light") - whole site switched to light, label became "Dark", choice persisted across later pages - pleased.
11. Comics (/shelf/comics) and About (/about) - clean stat cards, profile photo, role table. About photo and facts load quickly - pleased.
12. Places: guessed /places - friendly "Not found. Try the shelf, or go home." No place page reachable from the menu, search, or footer - could not do.
13. Now (/now, via footer) - Playing, Paused, Tonight sections. Fine.
14. Keyboard on home - first Tab shows a "Skip to content" button with a clear ring, further Tabs show a clear ring on Menu; Enter opened the menu; Tab moved focus to About with a visible blue outline - pleased.

### 3. Findings
- **F1** | Severity: major | Where: Shelf search (/shelf/games) | What happened: typed "zelda" and pressed Enter; nothing visibly changed near the box. The 2 matches were about 13 scroll ticks down, below Now Playing and a large filter-chip wall. Expected: results right under the box, or a scroll to results. | Fix kind: interaction / layout | Suggestion: after typing, scroll to the results and show the count ("2 of 109") next to the box; consider collapsing the filter chips on mobile behind a "Filters" button. | Evidence: after typing, screenshot still showed stats and the search box with text; results only appeared after long scroll.
- **F2** | Severity: major | Where: Navigation | What happened: Menu has only six items. Stats, Now, TIL, Daily game and Colophon live only in the footer; there is no place-related page I could find by menu, search or footer. Expected: the main sections in the menu. | Fix kind: navigation | Suggestion: add Now, Stats, TIL, Daily game to the menu (or a "More" group), and add the places/outings page if it exists to both menu and search index. | Evidence: Menu screenshot with Home/About/Projects/My Shelf/Blog/Resume; "Nothing for 'places'".
- **F3** | Severity: minor | Where: Footer on every page | What happened: 8 links and an email set as small inline text separated by dots, about 12-13px; hard to hit with a thumb and neighbours are very close (Colophon / Stats / RSS). Expected: tap targets about 44px. | Fix kind: layout | Suggestion: render footer links as a wrapped list with vertical padding of 10-12px per link. | Evidence: zoom of footer shows single-line text links with a dot between each.
- **F4** | Severity: minor | Where: Game detail | What happened: a small "Edit" link appears under the title for an anonymous visitor; tiny target and unclear purpose. Also "Admin" in footer. Expected: visitor-only controls. | Fix kind: interaction | Suggestion: show Edit and Admin only to a signed-in owner. | Evidence: BotW detail screenshot, blue "Edit" under "My copy" line.
- **F5** | Severity: minor (low confidence) | Where: Search overlay | What happened: after pressing Escape on a no-results search, my next tap went to the Projects page, as if the overlay or its dimmed results were still active. Expected: Escape closes it and the page underneath is tappable. | Fix kind: interaction | Suggestion: verify Escape closes the overlay and restores focus on every device. | Evidence: tap at the blog post title landed on /projects.
- **F6** | Severity: nit | Where: Stats | What happened: the cards say 263 views "last 30 days" and 263 "all time" (same), while the per-page list shows counts like 21, 20, 12 that do not add up to 263 and has an untitled item "Creepshow" mixed with paths. Expected: consistent units. | Fix kind: copy / visual design | Suggestion: explain the gap (for example "top pages only") and show page titles consistently. | Evidence: stats page list.
- **F7** | Severity: nit | Where: Theme toggle | What happened: button shows the target mode ("Light" while dark, "Dark" while light), which can read as the current mode. Expected: an icon or "Switch to light". | Fix kind: copy | Suggestion: add an icon or aria-style label "Switch to light theme". | Evidence: header buttons before and after the tap.
- **F8** | Severity: nit | Where: Test setup | What happened: window resize to 390 did not produce a 390px layout (measured 633px). Real 390px behaviour (wrapping of the shelf sub-tabs, chip rows, hero buttons) is unverified. | Fix kind: n/a | Suggestion: re-run at true 390px with device emulation. | Evidence: innerWidth 633.

### 4. Could not do
- Place-related page: none found via menu, site search ("places", "outings"), footer; /places gives a 404.
- True 390px width check: the browser would not narrow below about 633 CSS px, so horizontal-scroll and cramped-text checks at phone width are unconfirmed.
- Did not open Projects item detail beyond the one project page; did not test Year in review, Tour, or Daily game.

### 5. Worked well
- Home answers "who and what" in seconds; hero copy and Now/Focus/Stack card are crisp.
- Header buttons are big and obvious; full-screen menu rows are thumb-friendly.
- Site search is fast, groups pages, finds "stats", and has a useful empty state.
- Light/dark switch works instantly and persists across pages.
- Keyboard: skip link, strong focus rings, menu operable with Enter and Tab.
- Friendly 404 with links; game detail page is rich and tidy; stats page is clear and privacy-forward ("no cookies").

### 6. Overall: would I come back or recommend it?
I would forward it to a friend who likes games or wants to see an engineer's portfolio. The first screen is clear and the shelf is oddly charming. What would put me off is hunting: search results hidden far below the shelf's filter wall, a menu that leaves out Stats and Now, no place page I could reach, and a footer of tiny links. Fix those and the phone experience is solid. A true 390px pass is still owed.
