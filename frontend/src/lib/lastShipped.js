import { clip } from './clip.js'

const LINK = /\[([^\]]+)\]\(([^)\s]+)\)/g

/** Short enough for one line in the facts card. */
export const LAST_SHIPPED_LIMIT = 48

/**
 * What Home's "Last shipped" says about a changelog entry: its first
 * bullet's own text, links as their text, cut at a word with an ellipsis.
 *
 * @param {{lines: string[]}|undefined} entry The newest changelog entry.
 * @returns {string|null}
 */
export function lastShippedText(entry) {
  const line = entry?.lines?.[0]
  if (!line) return null
  return clip(line.replace(LINK, '$1'), LAST_SHIPPED_LIMIT)
}
