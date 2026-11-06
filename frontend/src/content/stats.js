/**
 * Copy for /stats, the public analytics page.
 *
 * `COUNTED` is quoted verbatim from the README's Analytics section, which
 * opens with the same four sentences; `stats.test.js` reads both so the
 * page and the README cannot drift apart. Edit the README first.
 */

export const STATS_TITLE = 'Stats · Joey Haas'

export const LEDE =
  'What this site sees, counted by the site itself. No cookies, no third-party scripts.'

/** How the figures are counted: the README's Analytics paragraph. */
export const COUNTED = [
  "This site counts its own visits: no cookies, no third-party script, and nothing leaves the site's own API.",
  "Each page view sends the path, the referring site on a visit's first page, and whether the device is a desktop, phone or tablet.",
  'A visitor is a hash of IP address and browser that changes every day, so one day cannot be joined to the next, and neither the address nor the browser is stored.',
  'Nothing is sent under Global Privacy Control or Do Not Track, and the figures undercount: the API sleeps when idle, and a view sent while it wakes is lost.',
]

/** The status line under the tiles, by where the figures came from. */
export const LIVE_AS_OF = (time) => `Live as of ${time}.`
export const FROM_SNAPSHOT = "From last night's snapshot."
export const FROM_SNAPSHOT_ASLEEP =
  "From last night's snapshot; the API is asleep."
