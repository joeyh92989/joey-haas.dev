/**
 * Copy for /stats, the public analytics page.
 *
 * `COUNTED` is quoted verbatim from the README's Analytics section, which
 * opens with the same five sentences; `stats.test.js` reads both so the
 * page and the README cannot drift apart. Edit the README first.
 */

export const STATS_TITLE = 'Stats · Joey Haas'

export const LEDE =
  'What this site sees, counted by the site itself. No cookies, no third-party scripts.'

/** How the figures are counted: the README's Analytics paragraph. */
export const COUNTED = [
  'This site counts its own visits: no cookies, no third-party script, and nothing leaves the site’s own API.',
  'Each page view sends the path, the referring site on a visit’s first page, and whether the device is a desktop, phone or tablet.',
  'A visitor is a hash of IP address and browser that changes every day, so one day cannot be joined to the next, and neither the address nor the browser is stored.',
  'Nothing is sent under Global Privacy Control or Do Not Track, and the figures undercount: the API sleeps when idle, and a view sent while it wakes is lost.',
  'Obvious bots are left out: anything that says it is a crawler, a headless browser or a script is not counted.',
]

/** The status line under the tiles, by where the figures came from. */
export const LIVE_AS_OF = (time) => `Live as of ${time}.`
export const FROM_SNAPSHOT = 'From last night’s snapshot.'

/** The line under the day chart: the busiest day and its count. */
export const PEAK_CAPTION = (day, views) =>
  `Busiest day: ${day}, ${views} ${views === 1 ? 'view' : 'views'}.`

/** What a comic page is called in the Pages list, after its series title. */
export const ISSUE_NAME = (title, number) => `${title} · issue ${number}`
export const EDITION_NAME = (title) => `${title} · collected edition`

/** Names for the site's fixed pages, so the Pages list shows titles, not paths. */
export const PAGE_NAMES = {
  '/': 'Home',
  '/about': 'About',
  '/projects': 'Projects',
  '/now': 'Now',
  '/colophon': 'Colophon',
  '/stats': 'Stats',
  '/denver': 'Denver',
  '/daily': 'Daily game',
  '/blog': 'Blog',
  '/til': 'TIL',
  '/travel': 'Travel',
  '/shelf': 'My Shelf',
  '/shelf/games': 'My Shelf · Games',
  '/shelf/comics': 'My Shelf · Comics',
  '/shelf/next': 'My Shelf · What’s next',
  '/shelf/how': 'How My Shelf works',
  '/shelf/intake': 'My Shelf · Intake demo',
  '/shelf/year': 'My Shelf · This year',
}

/** The all-time tiles' detail: counting began on a date, so all time is short. */
export const ALL_TIME_SINCE = (date) => `all time, since ${date}`

/**
 * What the Pages list covers: the top rows only, with how much of the
 * total they add up to. Whole list shown: the plain scope.
 */
export const PAGES_COVER = (shown, total, rows) =>
  shown >= total
    ? 'views, last 30 days'
    : `top ${rows} pages: ${shown} of ${total} views, last 30 days`
