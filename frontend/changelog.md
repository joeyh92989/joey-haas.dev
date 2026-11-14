# Changes

The public changelog, shown on /stats. One `## YYYY-MM-DD` heading per
day something shipped, one bullet per change, newest first, markdown links
where a change has a page. A shipped feature adds its entry (repo CLAUDE.md).

## 2026-11-13

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
