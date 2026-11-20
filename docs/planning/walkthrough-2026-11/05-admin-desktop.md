# Admin desktop walk (blind, Playwright, 1440x900, then 390x844)

### 1. Persona and goal
- Persona: brand-new site administrator on a desktop browser, untrained, fresh empty install.
- Goal: learn what the admin is for from the screen alone, visit every page, then do first-day jobs (add game, comic, place, garment; find analytics and jobs; see the public result; sign out).

### 2. Journey log
1. /admin - expected a dashboard - saw "Home: everything, one card each" with Site card, a Nightly jobs list, 0 of 13 jobs ok, "nightly stale" - read the list; "Run now" looked like it would run things - ok/confused (no explanation of what the jobs are).
2. /admin/shelf/games - expected a list of games - saw one wide search box ("Search to add one, or ▤ Photos for a sitting"), Photos button, an unlabeled ▥ button, collapsed "Add with the full form", one-line empty state - confused by placeholder and the mystery ▥ icon.
3. /admin/shelf/comics - bare "No comics on the shelf yet." with two header links - ok, empty state does not say how to add (only a small "Add comics" button top right).
4. /admin/collection/add - "Add: a sitting: one kind, many at once", five type cards (Game, Movie, Comic, Board game, Mixed shelf) - confused by "sitting"; cards have uneven empty space; "Nothing unfinished" - ok.
5. /admin/play-next, /discover, /radar, /pull-list, /catalogue (Sources), /store-list - each opened and screenshotted; empty states mostly tell me to generate or rate things first. Several buttons spend a quota ("uses one of today's Gemini requests") - pleased by the warning, confused by what the pages are for before using them.
6. Closet: /admin/closet/today, /closet, /add, /review, /profile - Today shows 25° to 52° with "No forecast yet" and "Nothing in the closet fits today yet"; Closet list has a mis-wrapped toolbar; Profile is a long single column of blank fields.
7. Denver: /admin/weekend, /spots, /history, /places/add - clear forms, good copy ("Nothing is looked up while you type. Press Search or Enter.").
8. Site: /admin/analytics, /admin/jobs - analytics is clear and honest about limits; Jobs duplicates the Home list.
9. (a) Add a game by hand: Games > "Add with the full form" > typed Title and Year > Add. Browser tooltip "Please select an item in the list" on Format (not marked required). After choosing Format and Platform it saved with NO message; form stayed open; sidebar count still said 0 until a reload; page layout shifted down - annoyed.
10. Game card: hover reveals stars, Start playing, heart, status select, Public checkbox, Up next, Redo, Delete; card grows about 100px on hover (jitter). Detail page /admin/collection/:id is a clear form but a single column.
11. Published the game: "Publish all 1" asks inline "Publish 1 game to My Shelf? Yes, publish / Keep it" - pleased with the safe confirm, but the header toolbar reflows messily while it is open.
12. (b) Add a comic: Add > Comic card created a sitting immediately (clicking it twice makes a second sitting). Shoot step is camera/photo oriented; used "Search instead", live Comic Vine results appeared with covers (pleased). Typed "ZZ Test Comic", used the small "Comic" button under "No match? Keep ... as typed". Check step labelled it "MATCHED"; Details step; "Add 1 to the shelf" > Done page ("Comic · Nov 19, 7:14 AM is in"). Published from Done and from list. Revisiting the sitting URL says "This sitting is gone".
13. (c) Add a place: Add a place > "Type it by hand". Name only fails on Coordinates ("Please fill out this field", not marked required, and a stranger does not have coordinates). With "39.75, -104.99" it saved with a very clear green confirmation and Add another / View on Spots - pleased.
14. Spots: ticked Public (one click was ignored once, worked on retry), "Log visit" logged a visit instantly with a one-line message and no undo. Edit opens a big form at the top of the page that pushes everything down.
15. Weekend: Refresh forecast worked instantly with a real forecast and bar charts; Reroll gave a "BEST FIT" suggestion. "Edit" next to constraint chips opens a panel at the bottom of the page, off screen.
16. (d) Add a garment: Closet > typed in the top box > Enter opened a side panel form > category Top, colour Blue > Add to closet. Confirmation line shown (pleased). Today then took several seconds ("Waking the server or planning the day · 3 s") and showed a 540px empty photo placeholder.
17. (e) Analytics: /admin/analytics (7d/30d/90d/All, footnote explaining the beacon) is understandable. Jobs: 13 rows each with a one-line status only. I could not tell what each does.
18. (f) Public view: "View /shelf/games" link exists. First public load right after publishing still said "No games on the shelf yet"; a later reload showed the game. Comics showed on /shelf/comics; /denver showed the park on a map. No admin link on a spot to view it publicly.
19. Tested Pull list Refresh (message "Refreshed 0 series." and still "last refresh never") and Sources "Refresh N64" (worked, 234 games, row updated).
20. (g) Sign out (last): works, lands on a bare "Admin / Sign in with Google" card with no confirmation and no link back to the site.
21. Phone pass at 390px: Home, Games, Add a place, Jobs, Closet, Spots (see section 8).

### 3. Findings

**F1 - major - Home and Jobs: "Run now" is not "run now".** Every "Run now" on the job rows is a link to another page (Radar -> /admin/radar, Weekend forecast -> /admin/weekend, Intake -> /admin/collection/add). I expected the job to start. Fix kind: copy / interaction. Suggestion: label them "Open Radar" etc., or make real run buttons that show a result; keep one style. Evidence: Jobs screenshot, row buttons in blue link style; controls list shows hrefs.

**F2 - major - Jobs: cannot tell what a job does or when it last ran.** 13 rows, each with a dash in a wide empty first column, a one-line status ("No run recorded", "First run Sunday evening") and a badge (unknown / stale / scheduled). No description, no schedule, no result. "Sources refresh: stale" with "how to re-enable it" links off to GitHub. "Intake", "Closet opinions", "Public snapshot" are opaque. Fix kind: copy / layout. Suggestion: add a grey one-line purpose per job, a "Last run / Next run" column with headers, collapse the dead first column on empty. Evidence: Jobs screenshot, dash column leaves a 150px gap before the name.

**F3 - major - Adding a game by hand is silent and awkward.** The inline form has no visible labels (placeholders only), Format is required but not marked, no success message, form stays open, the sidebar count (Games 0) lags until reload, and the page jumps as stats and cards appear. Compare Place and Garment adds, which confirm well. Fix kind: interaction / copy. Suggestion: label fields, mark required, show "Added ZZ Test Game" with a link, update the sidebar count, clear the form. Evidence: tooltip on Format screenshot; after-add screenshot with layout shifted.

**F4 - major - Items are created private and nothing says how visitors will see them.** Game, comic and place all default to private; the only hints are a small "Private" chip or "0 of 1 public". The "Publish all" flow then has a lagging public page (first view still empty). There is no "view this on the public site" link per item. Fix kind: navigation / copy. Suggestion: after adding, show "Private. Publish to show on /shelf/games" and a link; add a per-item "View public" link; explain any publish delay. Evidence: games list "0 of 1 public"; public /shelf/games "No games on the shelf yet" right after publishing.

**F5 - major - Place by hand requires coordinates, unmarked.** Name only triggers a browser tooltip on Coordinates. A new admin does not know lat/long; the maps-link tip is small grey text. Fix kind: interaction. Suggestion: mark Coordinates required, or look it up from the name/city; make the paste tip prominent. Evidence: "Please fill out this field" tooltip.

**F6 - major - Navigation model: Jobs lives in two places and the rail highlight changes.** Jobs is in the Home sidebar and the Site sidebar. Opening Jobs from Site highlights the Home rail item and shows the Home sidebar, so "where am I" flips. Rail icons are unlabeled glyphs plus tiny labels; "Denver" as the section name for places/outings/weekends is not obvious; "Site" hides analytics. Fix kind: navigation. Suggestion: keep one home for Jobs; keep the rail highlight stable; rename Denver to "Places" or "Outings". Evidence: Jobs screenshot shows Home sidebar; Analytics shows Site sidebar with Jobs.

**F7 - minor - Sidebar counts inconsistent and stale.** Games shows a count, Comics and Closet show none; the count was stale (0) after adding until reload. Fix kind: visual design / interaction.

**F8 - minor - Add pages use the unexplained word "sitting".** "a sitting: one kind, many at once", "START A SITTING", "Photos for a sitting". Clicking a type card instantly creates a persisted sitting (two clicks made two "unfinished" sittings that then show as a banner on the Games page and the Add page). Cards have uneven blank space (Game card tall and empty vs Board game card text-heavy). Fix kind: copy / interaction. Suggestion: say "batch"; create the sitting only on first photo or add; tidy the card layout.

**F9 - minor - Comic flow wording and polish.** The check step labels a typed-as-is comic "MATCHED... untick anything wrong"; "Keep ‘ZZ Test Comic’ as typed:" is followed by a tiny "Comic" chip button that does not look clickable; "Finish later" is low contrast; Done title reads "Comic · Nov 19, 7:14 AM is in"; Done page primary button is "Shoot the next box" not Publish; the result dropdown stays open after choosing; "About 1 model call per photo; 108 left today" is jargon. Evidence: step 2 and Done screenshots.

**F10 - minor - Games list header toolbar crowded and reflows.** Title, "0 of 1 public", View link, Add games, Publish all, Hide all, Refresh game metadata, Shelf/List all in the header; opening the publish confirm re-wraps them. The big search box is also the add box ("Search to add one, or ▤ Photos for a sitting") and sits beside an unlabeled ▥ icon button. A second "Look up" search lives in the full form. Fix kind: layout / copy.

**F11 - minor - Game/comic card controls appear only on hover and the card jumps.** Stars (10 tiny 9px-wide buttons), status select, Public checkbox, Up next, Redo, Delete appear on hover and grow the card about 100px, pushing the grid. Delete is a 54x18 blue text button next to Redo. Delete confirmation not tested (avoided triggering dialogs). Fix kind: interaction / visual design.

**F12 - minor - Closet list toolbar mis-wrapped.** The add input, Photos and From a file are on row one, "From links" stretches full width on row two beside an empty-looking boxed ▥ button. Glyph icons (▤ ▥ ▦) are cryptic. Fix kind: layout.

**F13 - minor - Closet Today: misleading temperature and huge placeholder.** Shows "25° → 52°" with "No forecast yet; dressed for a typical November day." With one garment it shows a 540px blank photo box. Loading says "Waking the server or planning the day · 3 s" for about 10 s, ending with the footer "Model: The model's outfits did not hold up" and "picked without the model" (jargon). Fix kind: copy / layout.

**F14 - minor - Weekend page: constraints editor off-screen, cards misaligned.** "Edit" beside the chips opens a Constraints panel at the bottom of the page; nothing visible changes at the top. The Sunday card sits 32px lower than Saturday. Suggestion "Save / Been / Skip" is ambiguous, and it suggests a place "Last there today". Fix kind: interaction / layout.

**F15 - minor - Spots page: right pane cramped, left half empty, accidental logging.** All spots table is squeezed into the right half (name wraps, "Log visit" clipped); Spot finder fills the left with little. "Log visit" logs instantly with no undo. The Edit form opens at the top and pushes the page down. Wording differs: "Show on the public Denver page" (add) vs "Show on the public map" (edit); City is a dropdown on add and a free text field on edit. No "Add a place" CTA inside the empty state beyond "Add by hand". Fix kind: layout / interaction / copy. Also a Public checkbox click was ignored once.

**F16 - minor - Pull list: the main action is at the bottom.** "Following 0 series" and four "Nothing out." week blocks come before "Find a series", which is the first thing to do. Refresh at top right is blue though it does nothing with 0 series ("Refreshed 0 series." and "last refresh never" persists). Fix kind: layout / copy.

**F17 - minor - Sources page dense and inconsistent.** Seven stat cards, a table where the first three rows have no action while others have a big Refresh button, plus five header buttons that do the same things in bulk (Refresh stores, Refresh registry, Refresh N64, Refresh Switch 1, Resolve). The intro sentence is jargon-heavy (r/NSCollectors, IGDB). Fix kind: copy / layout.

**F18 - minor - Discover/Radar.** Platform chips (Switch 2, Switch, N64) are offered on an empty database; "Needs match →" and "Include Game-Key Cards" are unexplained; the blue Generate button spends a quota but is the same style as harmless Generate on Radar. Fix kind: copy.

**F19 - minor - Wide screens: many forms are one narrow column.** Closet Profile (about 575px of 1440, long scroll of blank fields, "Mids" jargon), garment detail (single column, "← Closet" back link alone far top-right), place add form. Dashboards use two columns well, but forms leave the right 40 to 50 percent empty. Fix kind: layout.

**F20 - nit - Spelling mix.** "Colour", "Colouring", "Store colour" vs "Primary color". "Active1" with no space on phone chip.

**F21 - nit - Home cards.** Site card repeats "Analytics →" and a "Jobs" button right above the Nightly jobs card; "Jobs →" appears twice. Fine but redundant.

**F22 - minor - Sign-out and signed-out state.** Sign out sits small in the sidebar footer (51x21) and, on phone, at the very bottom of long pages. After it, a bare "Admin / Sign in with Google" card appears with no "signed out" message or link back to the public site. Fix kind: interaction / navigation.

**F23 - nit - Small tap targets.** "Run now" links 53x21, "Delete" 54x18, stars 9x22, header links around 21px high.

**F24 - minor - Movies and board games have no visible list.** The Add page offers Movie and Board game, but Shelf has only Games and Comics in the nav; I could not tell where they would appear. (Not tested end to end.) Fix kind: navigation.

### 4. Could not do
- Delete flows (game, comic, sitting Discard): not tried to avoid risk of native confirm dialogs, so destructive safety is unverified. The stray "Comic" sitting I created (second click) remains unfinished.
- Photo-based adding (no camera/files supplied).
- Generate on Discover/Radar (spends Gemini quota), Closet Review actions, Paste a list place import, Movies/Board game add.
- Seeing a Done page again (it says the sitting is gone).

### 5. Worked well
- Place add confirmation: green card, "Add another / View on Spots", and "Added this visit" list.
- Garment add and "added to the closet" confirmation; Enter in the top box opens a prefilled form.
- Inline publish confirm ("Publish 1 game to My Shelf? Yes, publish / Keep it") instead of a browser dialog.
- Weekend forecast with hourly bars and ride windows; Refresh felt instant.
- Analytics page: calm, honest footnote, period toggle, helpful empty states.
- Comic search with covers and a "keep as typed" fallback; wizard progress bar, state survives reload.
- Home dashboard with real data is a good one-glance summary; "Wore this" / "Swap" shortcuts.
- Empty states are mostly friendly and specific ("Rate a few finished games...", "Nothing is looked up while you type").
- Phone: bottom tab bar plus a top segmented control is clear; no horizontal scroll at 390px on any page tested.
- Admin visually matches the public site's dark look, with the same tone of copy.

### 6. Overall: would I come back or recommend it?
I would come back, but only after a short orientation. The admin looks tidy and feels coherent, and the creation flows for places and clothes are genuinely friendly. For a new administrator the biggest gaps are meaning and feedback: job rows I cannot interpret, "Run now" links that only navigate, private-by-default items with no path to "how a visitor sees this", silent saves on the game form, jargon like "sitting" and "model", and a navigation model where Jobs and the rail highlight shift. On a wide screen the dashboards use space well, but forms and list headers either leave half the screen empty or cram everything in a toolbar. With copy and feedback fixes it would be a pleasant tool; today it works but needs explaining.

### 7. Coverage (admin URLs reached)
- /admin
- /admin/jobs
- /admin/analytics
- /admin/shelf/games
- /admin/shelf/comics
- /admin/shelf/comics/:id (comic detail, via card link, link seen; list page tested, detail not screenshotted)
- /admin/collection/add
- /admin/collection/add/:sittingId (comic sitting: shoot, check, details, done; plus "sitting is gone")
- /admin/collection/:id (game detail)
- /admin/play-next
- /admin/discover
- /admin/radar
- /admin/pull-list
- /admin/catalogue (Sources)
- /admin/store-list
- /admin/closet/today
- /admin/closet
- /admin/closet/:id (garment detail)
- /admin/closet/add
- /admin/closet/review
- /admin/closet/profile
- /admin/weekend
- /admin/spots
- /admin/history
- /admin/places/add
- Public pages seen for comparison: /shelf/games, /shelf/comics, /denver
- Linked but not opened: external GitHub "how to re-enable it".
- Sign-out result: /admin (login card).

### 8. Phone pass (390px, 390x844, 2x, touch)
Pages: /admin, /admin/shelf/games, /admin/places/add (and Type it by hand form), /admin/jobs, /admin/closet, /admin/spots. No horizontal overflow on any (scrollWidth 390).
- Navigation converts well: a bottom tab bar (Home, Shelf, Closet, Denver, Site) and a top segmented control for sub-pages. Shelf's segmented control shows Games / Comics / Add / More; the other seven pages (Play next, Discover, Radar, Pull list, Sources, Store list) hide behind "More", a good compromise but not discoverable. Closet tabs (Today/Closet/Add/Review/Profile) and Denver tabs fit.
- Home: cards stack in one column and read well; nightly jobs list stacks with the status and action on the next line. Page is about 2480px tall, so the jobs list is a long scroll.
- Games: header buttons wrap into three loose rows (View link, Add games, Publish all, Hide all, Refresh game metadata, Shelf/List); the add input's placeholder is cut ("Search to add one, or ▤"); the unfinished-sitting banner and stats push the actual list far below the fold.
- Closet: the add input placeholder is truncated ("Type a piece to a"), the lone ▥ button is a mystery box, and "Active1" has no space between label and count.
- Spots: the All spots table is squeezed; the name wraps, "Log visit" wraps to two lines and the Edit button disappears off the layout edge; a long scroll.
- Places add: clean; the hand form stacks neatly, labels and hints are readable, Save place button is large. Sign out and View site are at the very bottom of the page (reachable only by scrolling), and no top-of-page sign out exists.
- Small targets: "Run now" 53x21, header links ~21px high, stars and Delete tiny. The fixed bottom tab bar overlaps content only in full-page captures; in normal view it behaves.
