# Changes

The public changelog, shown on /stats. One `## YYYY-MM-DD` heading per
day something shipped, one bullet per change, newest first, markdown links
where a change has a page. A shipped feature adds its entry (repo CLAUDE.md).

## 2026-11-24

- Behind the scenes: the outfit planner can now be told a single piece is not for today, too cold, too warm, or never for an occasion; it leaves that piece out of every plan and swap, and tells the model why. The Closet page suggests checking the warmth of pieces turned down as too cold or too warm, and never changes a tag itself.
- Behind the scenes: pieces saved by hand with their warmth or formality left empty now get those two filled in overnight, without changing anything already set.
- Behind the scenes: the outfit planner's formality scale now has examples, so flannels and casual button-ups count as fine for the office, and pieces already tagged are re-tagged overnight against it.
- Behind the scenes: the outfit planner keeps at least three choices for each piece, loosening its rules one at a time and saying which, and the suggested outfits each use a different top when there are enough.
- Behind the scenes: the outfit planner treats a piece's tagged months as a preference rather than a rule, so a shirt tagged for spring can still be suggested on a cold November day; only shorts and linen stay out when the low is under 50°F.
- Behind the scenes: the outfit planner no longer suggests a piece missing its warmth or formality while a tagged piece fits, and the Closet counts the pieces that need details.

## 2026-11-23

- The Denver page is gone. The site keeps the shelf and the closet, so the short list of places and the map behind it came down, and Denver no longer shows in the More menu or the footer.
- Pages on [the shelf](/shelf/games) have readable addresses: a game is at a name like `/shelf/hades/` instead of a long string of letters and digits. Old links keep working and move to the new address.
- [Stats](/stats) says what its Pages list covers (the top pages, and how many of the views they add up to), names every fixed page instead of showing its path, and dates the all-time figures from the day counting began. The Projects screenshot of the shelf is dated, and the shelf's link to what's next now reads "Tonight’s pick", so it is not mistaken for the game I'm playing now.
- The phone's theme button shows a sun or a moon for the theme it switches to, and Escape in the search box closes search at once instead of only clearing the text.
- The shelf names its owner: every shelf page now says "Joey Haas's shelf" with a quiet link back to the rest of the site, and a game's page trail reads My Shelf / Games / the game, like a comic's.
- The shelf's filters sit behind a Filters button, so a search shows its result and the first game within one screen, and the display options (Cards, Spines, size, Dim finished) have a group of their own.
- The comics list tells same-title series apart on the card, lines the progress bars up across a row, explains "Single book", and gives the intro room above the figures.
- Small accessibility fixes: links in text show the same keyboard focus ring as the rest of the site, the page links on a phone are all tap-sized with their words centred, a finished game with a replay count stays readable when it is dimmed, and a long line of detail in the admin stats wraps instead of being cut off.

## 2026-11-21

- Home now opens with my name.
- Game, comic, issue, book, year and month pages have the same flat card look as the rest of the shelf, and the trail above a post, note or trip reads the same way.

## 2026-11-20

- The [Games](/shelf/games) and [Comics](/shelf/comics) lists follow the new look: each title is a numbered record card with its status in words, single-choice filter rows are underline tabs, and View has a new Spines choice (also `?view=spines`) that shows the shelf as upright spines on a rail.
- About, Projects, Now, Colophon, Blog and TIL follow the new look: projects, posts and notes are numbered record cards, tags and tech are outlined badges, and section headings are serif with a rule under them.
- [Stats](/stats), [Denver](/denver), the [Daily game](/daily) and Pick for me follow the new look: charts in cards on measured colours, filter chips, outlined buttons and spot cards with their tags as badges. The game's header now matches the other pages.
- Home follows the new look: a plain headline, the facts in an At a glance card, Work as numbered record cards and Experience as a dated list.
- The masthead, menus, search and footer follow the new look: outlined monogram, an accent bar under the current page, flat menus, and a 1200px page width on Home, About, Projects and the shelf. Buttons, filter chips and "Try again" now show their outline. On a phone the theme toggle reads Light or Dark so the masthead still fits at 320px. Link previews and the browser icon use the paper and ink colours.
- The site has a new look: warm paper in the light theme, graphite in the dark one, a rust accent in light and a red-pencil accent in dark, and serif headings. Text and marks were measured for contrast in both themes.
- The [tour](/shelf/how) no longer scrolls sideways on narrow phones: the masthead fits at 320px, and the drawn tables wrap their columns instead of cutting them off.
- The masthead now has a More menu with [Now](/now), [Stats](/stats), Daily game, [Denver](/denver) and [Colophon](/colophon) (and TIL when there are notes), and the phone Menu lists the same pages under More. Search finds Denver by “places” and “outings”. Below 960px wide the bar now shows Menu.

## 2026-11-19

- [Jobs](/admin/jobs) now has a working Run now button on Weekend forecast, Radar, Comic refresh and Comic issues. It shows Running, then Done or the error, and reads “Already running” if the job is already going; the Open link stays beside it.
- The admin now has an account menu: the `jh` mark at the top of the sidebar (a button beside the page tabs on a phone) opens the signed-in email, View site and Sign out, replacing the small links at the foot of the page.
- Home’s headline now reads “Building software since 2012, as a product manager first and an engineer since 2021”, so it matches the five years of engineering and eight of product on the About page.
- Home’s work history now carries the $1B in annual benefit spend and the 55–74% latency cut from [About](/about), with a “Full history” link there; LinkedIn is a button beside GitHub, and the Work link reads “Project details”.
- The résumé PDF and the About and Home work history now match the latest edit: a tighter line on the ledger migration, “Salesforce CRM”, a “two-week release cadence”, and “$1B” without “roughly”.
- The résumé PDF now opens with the title “Joseph Haas - Resume” instead of the draft name, and the nav link reads “Resume (PDF)”, since it opens in the browser.
- On the admin Home and Jobs lists, the links that only open a page (Sources, Radar, Weekend, Intake and the rest) now say “Open Radar” and so on instead of “Run now”, which they never did.
- Admin spelling is American throughout (“Color”, “Store color”, “Coloring”), and the Run now, Delete, header and footer links in the admin are at least 24px tall.
- The count on a filter chip on a phone, such as Active 1 on the Closet, keeps its space instead of reading “Active1”.
- The admin form for adding a game by hand now labels every field and marks Title and Owned format as required. A missing one is named next to the field instead of in a browser tooltip. After an add it says what it saved, links to the new item, and the Shelf count in the sidebar updates without a reload.
- The place forms on the admin side now say Coordinates are required, show the paste tip at normal size, and use “Show on the public map” for the public switch when adding as well as editing.
- The admin page you land on after signing out now says you are signed out and links back to the public site.
- The post “How My Shelf works” now lives at [/blog/how-my-shelf-works](/blog/how-my-shelf-works). The old address redirects, and feed readers will not see it as a new entry.
- The links in the footer and the feed link under Changes on [stats](/stats) are now at least 24px tall, so they are easier to hit on a phone without landing on their neighbor.
- The theme button in the header now says what it will do (“Switch to light” or “Switch to dark”) instead of naming the mode you would get, which read as the current one.
- The [tour](/shelf/how) no longer scrolls sideways on a phone: its stops now shrink to the screen instead of stretching past it.
- The [daily game](/daily) now shows its color key above the board, before the first guess, and says what the arrows mean: ↑ later or longer, ↓ earlier or shorter.
- A guessed /shelf/daily now goes to the [daily game](/daily), and a shelf address that matches no title shows the not-found page instead of “That didn’t load”.
- A book on a title’s admin page with no contents yet now says so and has a Find contents link to its page, where the Metron lookup lives. A title with no books explains that a single issue has no contents to find.

## 2026-11-18

- A comic book’s admin page now has Find contents: it asks Metron what a trade collects, shows the list with a link to Metron and whether the ISBN matches, and saves nothing until I accept. Books with contents from Metron credit it on their page (CC BY-SA 4.0).
- The Check step now lists the collected books I typed in Details (label, kind, issues and ISBN) before I add them, so a wrong ISBN shows up while it can still be fixed.
- A comic’s shelf card no longer says “1 book with no number” when two of my books share a line number: only a book with no number at all is counted that way.
- Adding a book from the add bar and tapping again after a slow answer no longer makes a second copy of it.
- Collected books can now be added by ISBN: type it or scan the barcode with the camera, and Open Library fills in the label and tells me if I already own that book. The ISBN is kept on the book, and if the lookup finds nothing I just type it in.
- Adding comics by photo or by hand, the Details step now asks for the collected books I own (kind, label and the issues each collects), and each one becomes a book on the comic’s page, the same as a photographed one.
- The add-a-comic form no longer has rows for collected editions: books are added from the comic’s own page, as volumes.
- The cover wall on a comic’s series page now draws every book I own as a book tile, including ones I added by hand or from a photo, not only the ones typed in as editions.
- The figures on the [comics shelf](/shelf/comics) now count books owned, volumes I’m missing and issues read, alongside issues. Volumes missing only counts gaps below the highest volume I own in a line, so it never guesses how long a line is. The old Read tile is now Share read.
- A comic issue page now says how I have it: as a single issue, in one or more books, or both. Each book is a link to its page, and a book from another series says which series.
- Each card on the [comics shelf](/shelf/comics) now says what it is: a run of issues, a line of books, a single book, or books and issues. A line of books says which volumes I own, like Vol. 1, 2 and 4, and there are new Books and Single issues filters.
- A comic on the [comics shelf](/shelf/comics) that is a line of books now shows its books in order, with an empty place for each one I’m missing. A single book gets a page that leads with the book, and a comic I have both books and issues of shows Books, then Issues.

## 2026-11-17

- The [comics shelf](/shelf/comics) now has a page for each book that shows what it collects, with a link to each issue I have a page for, and links to the books before and after it in the same series.

## 2026-11-16

- The [resume](/resume.pdf) is the final 2026 version, and [About](/about) now lists each role at Guild with what I did in it, with my summary, skills, work history and certifications updated to match.

## 2026-11-15

- [Projects](/projects) cards now have a screenshot, and the [Colophon](/colophon#architecture) has a diagram of how the static site, the API, Postgres, the nightly job and the snapshot fit together.
- Posts, TIL notes and trips now preview with their own title card when shared, instead of the same site image.
- Three new [TIL](/til) notes: profiling CI before parallelizing it, a deploy hook that answers 2xx for the wrong service, and guarding state-dependent writes on the server.
- A comic series whose issues I own are all read now says Read, or Caught up while the run is still going, instead of To read.
- The blog, TIL and these changes now have RSS feeds you can find: an RSS link on each page and in the footer, and `/blog/feed.xml` works alongside `/feed.xml`.
- Home now has Resume (PDF) and Email me buttons, and search finds Resume and Contact.
- [Now](/now) says what day it was last written and that it covers games only.
- Dates read month first everywhere, such as Nov 9, 2026, and the admin’s Play next is spelled that way across the site.
- Posts and notes show a reading time and, when revised, an updated date.
- The [Colophon](/colophon) has an accessibility section (what is tested and how to report a problem) and links to the design, learnings and planning docs; there is now a `/.well-known/security.txt`.

## 2026-11-14

- A game’s page no longer sits nearly blank while the server wakes up. A game added since the last nightly build now shows the page’s outline and says the server is waking, and a game I already have a preview of says so too if the rest takes more than a few seconds.

## 2026-11-13

- Games and comics now have tags I picked the words for. On [Games](/shelf/games) I can filter by play style, setting and tone, and on [Comics](/shelf/comics) by genre and form, instead of IGDB’s genres, where Adventure and Action were on almost everything. A game’s page lists its tags in labelled groups, with the platforms in a row of their own. Each comic series is tagged by a model that can only choose from my list, and I can change any tag on the edit page.
- Every [comic series](/shelf/comics) on my shelf now says which books I actually own, including the four Creepshow trades and the single issues of the rest.
- On a [comic series page](/shelf/comics) I can now tap a cover to mark an issue owned, read or missing again, with an Undo, and the issue page does the same thing. Read is now kept for each issue instead of one marker for the whole series. Comics also have their own edit page in my admin, and a series page shows the same facts it does: description, publisher, years and how many issues Comic Vine lists.
- Each comic issue now records whether I own it, have read it and skipped it, instead of that living only in the ranges on the series. Nothing on the site looks different yet; the next change builds on it.
- When I photograph comics for the shelf, each book now comes out as its own entry with the issue number read off the cover, so four photos of Waterworld #1 to #4 add issues 1 to 4 to the series. I can fix a number that was read wrong or type one it couldn’t read, and a collected edition is added as a book.
- I can now delete a game or comic from its card, the list view or its edit page, several at once from the list, and every delete says what goes with it first. I can also send a wrong match back to Add to be matched again, and discard an unfinished sitting from the banner on the shelf.
- My shelf now has a page for each kind of thing: [Games](/shelf/games) and [Comics](/shelf/comics). A comic shows up on its own page only, the figures on each count that kind alone, and my admin has the same two pages.
- I wrote down the design rules the shelf follows: one header, one way back, two widths, and the same names on the public pages and in my admin.
- Comic series pages now show a cover for every issue, and each issue page has its cover and description. [Waterworld](/shelf/ab94b320-05ad-4845-b0e0-4fd39c1ccd43/) is one.

## 2026-11-12

- Each thing now has one name: Blog, [Daily game](/daily) and [Tour](/shelf/how). Pick for me says “vibe” instead of “mood”, [Home](/) and [About](/about) end with how to reach me, and some waiting messages are reworded.
- The [shelf](/shelf) puts covers first, with labeled filters. [What’s next](/shelf/next) is shorter, with jump links. My rating shows one way everywhere, a star and the number, and the pages keep to two widths.
- Every detail page now has one breadcrumb at the top. An item page labels its genres, platforms and time to beat. Comic issues I’m missing now show up. [Year in review](/shelf/year/2026) has covers, and the month journal has an index of the year.
- [Now](/now) falls back to tonight's pick when nothing is up next, the Last shipped line on Home dates the latest change, long posts open with an On this page list, and the [intake demo](/shelf/intake) is linked from [Tour](/shelf/how) and [Projects](/projects). I also switched a few British spellings to American.
- When the server doesn’t answer, the [shelf](/shelf) pages, [Denver](/denver) and [Stats](/stats) keep their heading and say they couldn’t load instead of looking empty, and offer Try again. I also let a page wait up to 90 seconds for a sleeping server before giving up.
- Links inside running text are now underlined, so they can be told from the words around them without relying on color.
- Finished rows on [Year in review](/shelf/year/2026) keep their three columns when a game is marked as played again.
- [Stats](/stats) fits a phone without sideways scrolling, the all-time figures wait until there is a month of data behind them, and the pages list names pages by title.
- The shelf tabs stay on one row on a phone and scroll sideways, with the current tab in view, and the masthead marks My Shelf on [Daily game](/daily).
- On [Daily game](/daily) the guess box now sits above the board.
- Small layout fixes: long titles on the [intake demo](/shelf/intake) shelf get short spine labels instead of being cut off, the [Comics](/shelf/comics) numbers sit two by two on a phone, [Tour](/shelf/how) lists its nine stops three by three, and the footer stays at the bottom of short pages.
- Comics now read as comics on their pages: Reading, Reads and Read on instead of game words.
- The shelf copy no longer claims twelve stores, and the What it does cards now name the stop they link to.
- Small labels and captions are now at least 12px. A few headings and figures changed size slightly to fit one scale, and the big stat numbers are a little smaller.

## 2026-11-11

- Every comic issue and collected edition now has a cover on its [series page](/shelf/comics) and a page of its own, with its Comic Vine description.
- The model behind the site's suggestions and photo reading answers faster and runs out less: the free models are tried in a longer chain, quick ones first for text and stronger ones first for photos, and one that has used up its day is skipped until midnight.
- Adding comics to a series already on my shelf now says so: the check step lists each one apart from the new titles, with the issues it adds, the count before and after, and the cells around the change, and the summary ends with the [series](/shelf/comics) that grew.
- [Comics](/shelf/comics) read as runs: each card stacks its cover and shows the run and how far I've read in two lanes, with what's next under them, and a series page leads with what to read, the first gap and the next issue out, then the run as a box of trades, single issues and folded stretches, so a 362-issue series fits on one screen.
- One way in for everything I track: photograph a shelf or a rack, or search for one title; the sources match it, I check the doubtful ones, and it's added. Games, films, comics and clothes all use it, and a sitting can start on my phone and finish at my desk. Try [the intake demo](/shelf/intake) on a recorded shelf.
- A refreshed [résumé](/resume.pdf), with the [About](/about) page's bio and timeline brought in line with it.

## 2026-11-10

- Behind the scenes: a new intake pipeline reads shelf photos into a draft you check before anything joins the collection, with a nightly job that reads within the free daily budget.
- Behind the scenes: one Add page for the shelf and the closet replaces the photo importer. A sitting of photos is read one at a time, saved so it can be finished on another device, checked (only the doubtful titles one by one, the rest at a glance) and added in one go; [How it works](/shelf/how) stop 1 now describes it.
- Behind the scenes: a search-to-add bar above the shelf and the closet. One search asks every source at once and names the kind of each result, says which sources could not answer, and adds one title at a time through the same path as a sitting; the closet's pieces are typed in or photographed, and its photos waiting to be tagged sit on one line with Tag now. [How it works](/shelf/how) stop 1 names both ways in.
- [Site stats](/stats) leave out obvious bots: crawlers, headless browsers and scripts that say what they are no longer count as visitors.
- Layout fixes across the shelf: [Shelfle](/daily) keeps the shelf's header in place between tabs, Pick for me's chips wrap instead of pushing the page sideways on a phone, and Year in review says "rated finishes".
- Links to pages with nothing on them yet stay hidden: the Comics tab and the Denver link appear once there is something to show.
- The [resume](/resume.pdf) has had a proofreading pass: the same roles and figures, in cleaner sentences.
- Behind the scenes: the admin pages' forms match the site's theme, the store lists tell two editions at one store apart, and a failed recommendation run says why.

## 2026-11-09

- A private outfit planner for my own closet: each morning it suggests what to wear from the forecast, the day's plans and what I've worn lately, with a swap for any piece and a one-tap log of what I actually wore.
- The outfit planner's Review: once a week it flags what I haven't worn, what's out of season and what no longer fits, one piece at a time, and I keep, pack away, sell or donate it, with a listing checklist for the ones I sell.
- [Tonight](/shelf/next) picks live from what I've liked, read through shared genres, settings and moods and how much I actually played them, so they change the moment I finish something. Read next and Watch next sit under the games: what to read from my comics and what to watch from my movies.
- [Denver, the short list](/denver): the places I keep sending people to, on a map drawn from OpenStreetMap beside the list, filterable by tag.
- [Shelfle](/daily), a daily puzzle built from my shelf: guess the game in six, each guess graded on platform, year, genre and size. The same puzzle for everyone, new at midnight Denver time, with a streak kept on your device and a spoiler-free grid to share.

## 2026-11-08

- [Tonight](/shelf/next) leads with the game I'm playing while one is in progress: playing since, hours and sessions from the journal, last played, with the picks as a compact list underneath. Signed in, Wrap up finishes, pauses or abandons it in two taps, with a rating, a line and the date while they're fresh.
- [Pick for me](/shelf/next#pick-for-me) on What's next: choose a length and up to two moods, and Play Next's own scoring picks three games from my backlog, with its working shown.

## 2026-11-07

- Site search now finds [TIL](/til) notes too.

## 2026-11-06

- Site search: press ⌘K (or Ctrl K) to search pages, posts, the
  [shelf](/shelf) and comics.
- [TIL](/til): short notes on things I learned, with their own feed.
- [Stats](/stats): the site's own visitor figures, how they are counted,
  and this list of changes.

## 2026-11-04

- [My Shelf](/shelf) shows what I am playing now, and a game can be paused
  or played again: each run is its own playthrough on the item page.

## 2026-11-02

- [Comics](/shelf/comics): series with their issue runs and collected
  editions, and the week's issues on [What's next](/shelf/next).

## 2026-10-31

- The [resume](/resume.pdf) is the October 2026 edition.

## 2026-10-30

- [What's next](/shelf/next) opens with Tonight: a lead pick and two
  alternatives from the backlog, with the reasons.

## 2026-10-23

- Spine is now [My Shelf](/shelf); every old /spine link redirects.
