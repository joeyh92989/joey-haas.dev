/**
 * Readable names for the paths on /stats' Pages list.
 *
 * The titles come from the search index (`/search-index.json`), which is
 * public-only build output: shelf items and comic series with the slash-form
 * href. The server stores paths without the trailing slash, so both sides
 * are compared without it. Year and month pages are not in the index; their
 * titles follow the pages' own (`YearInReview`, `MonthInReview`). Anything
 * unknown falls back to the path.
 */
import { useEffect, useState } from 'react'
import { EDITION_NAME, ISSUE_NAME } from '../content/stats.js'
import { spine } from '../content/spine.js'
import { monthName } from './monthInReview.js'
import { loadIndex } from './searchIndex.js'

const bare = (path) => (path.length > 1 ? path.replace(/\/+$/, '') : path)

const ID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const YEAR = /^\/(?:shelf|spine)\/year\/(\d{4})$/
const MONTH = /^\/(?:shelf|spine)\/journal\/(\d{4}-(?:0[1-9]|1[0-2]))$/
const COMIC_PART = new RegExp(`^/(?:shelf|spine)/(${ID})/([^/]+)$`)

/**
 * A lookup from an index's entries: path (either slash form) to title.
 *
 * @param {{g: string, title: string, href: string}[]} entries
 * @returns {Map<string, string>} Keyed by the path without a trailing slash.
 */
export function titleLookup(entries) {
  const titles = new Map()
  for (const entry of entries) {
    if (entry.g === 'shelf' || entry.g === 'comics') {
      titles.set(bare(entry.href), entry.title)
    }
  }
  return titles
}

/**
 * The name for a path from the Pages list.
 *
 * @param {Map<string, string> | null} titles From `titleLookup`, or null
 *   while the index has not loaded (or is missing).
 * @param {string} path A server path, no trailing slash.
 */
export function pageName(titles, path) {
  // Old analytics rows still carry the /spine prefix from before the rename.
  const current = path.replace(/^\/spine(?=\/)/, '/shelf')
  const year = YEAR.exec(current)
  if (year) return `${year[1]} in review`
  const month = MONTH.exec(current)
  if (month) return `${monthName(month[1])} · ${spine.name}`
  const own = titles?.get(current)
  if (own) return own
  const part = COMIC_PART.exec(current)
  const series = part && titles?.get(current.slice(0, current.lastIndexOf('/')))
  if (series) {
    return part[2].startsWith('ed-')
      ? EDITION_NAME(series)
      : ISSUE_NAME(series, part[2])
  }
  return path
}

/**
 * The titles lookup, null until the index loads and null if it is missing.
 *
 * @returns {Map<string, string> | null}
 */
export function usePageTitles() {
  const [titles, setTitles] = useState(null)
  useEffect(() => {
    let live = true
    loadIndex().then((index) => {
      if (live && index.entries) setTitles(titleLookup(index.entries))
    })
    return () => {
      live = false
    }
  }, [])
  return titles
}
