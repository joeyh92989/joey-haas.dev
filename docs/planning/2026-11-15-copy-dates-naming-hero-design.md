---
status: shipped-in-pr
kind: fix
mode: auto
issues: [282, 283, 284, 287]
---

# Dates, naming, /now date, hero buttons

## #282 One date format

`lib/formatDate.js` is the one module: named, shared `en-US` formatters
(`DAY`, `DAY_YEAR`, `WEEKDAY_DAY`, `MONTH_YEAR`, `MONTH_YEAR_LONG`, and the
timestamp ones). Every inline `Intl.DateTimeFormat` and `toLocale*` call in
`src` now imports from it; `lib/dateFormats.test.js` fails on a new one.

My call: month first, as the issue recommends. Day-only stays "Nov 9"; the
year is kept where a value can be read in any year (run and release dates).
The Dashboard's run times move to 12-hour clock with the same locale.

Not changed: `lib/tripDates.js` (hand-built trip ranges such as
"12-23 Sept 2026", no Intl) is a travel-log grammar with its own spec and
tests; left for its own change. `/blog` uppercase is CSS on the kicker, not a
format.

## #283 Naming

My calls: "Play next" in sentence case everywhere visible (matches Pull list,
Store list, What's next); the tour lede no longer says "Collection"; About's
role line becomes "Company — Role" like Home. Home's folded earlier-roles row
stays folded (Home is the short list; About has each role with its years).
Written down in `docs/voice.md`. The resume PDF is not touched here.

## #284 /now

An "As of <date>" line from the snapshot's `meta.fetched_at`, and a line that
says the page covers games only and points to About. My call: state the scope
rather than rename the route (the URL is the /now convention and is linked).
Copy drafted by the writer agent against `docs/voice.md`.

## #287 Hero and search

Resume (PDF) and Email me join the hero actions. Search gets Resume and
Contact through `SEARCH_ONLY_PAGES` in `content/pages.js`, listed by
`searchPages()`. My call: not in `STATIC_PAGES` itself, because that list
drives the prerender, sitemap and render.yaml rules, and `/resume.pdf` is a
file, not a page. Contact points to `/about#contact`.
