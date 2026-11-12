import { STATIC_PAGES } from '../content/pages.js'
import { clip } from './clip.js'
import { hiddenPaths } from './snapshotPresence.js'

const LINK = /\[([^\]]+)\]\(([^)\s]+)\)/g

/** Short enough for one line in the facts card. */
export const LAST_SHIPPED_LIMIT = 48

/**
 * What Home's "Last shipped" says about a changelog entry: the title of the
 * page its first bullet links to (the link's own text for a page without a
 * row in the static list), otherwise the bullet's plain text cut at a word.
 * A link to a hidden path (a page with nothing on it yet) does not count.
 *
 * @param {{lines: string[]}|undefined} entry The newest changelog entry.
 * @param {string[]} [hidden]
 * @returns {string|null}
 */
export function lastShippedText(entry, hidden = hiddenPaths) {
  const line = entry?.lines?.[0]
  if (!line) return null
  for (const [, text, href] of line.matchAll(LINK)) {
    const path = href.split(/[?#]/)[0]
    if (!href.startsWith('/') || hidden.includes(path)) continue
    return STATIC_PAGES.find((page) => page.path === path)?.title ?? text
  }
  return clip(line.replace(LINK, '$1'), LAST_SHIPPED_LIMIT)
}
