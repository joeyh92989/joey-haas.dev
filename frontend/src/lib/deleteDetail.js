import { CHECK_FAILED, CHECKING } from '../content/shelfDelete.js'

const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`

/**
 * What goes with the rows, as phrases, from a delete preview. Pick events
 * are history the owner does not think of as part of the row, so they are
 * counted by the server but never named.
 *
 * @param {{playthroughs?: number, play_sessions?: number, comic_issues?: number}} preview
 * @returns {string[]}
 */
export function goesWith(preview) {
  const parts = []
  if (preview.playthroughs > 0) {
    parts.push(plural(preview.playthroughs, 'playthrough', 'playthroughs'))
  }
  if (preview.play_sessions > 0) {
    parts.push(plural(preview.play_sessions, 'journal day', 'journal days'))
  }
  if (preview.comic_issues > 0) {
    parts.push(plural(preview.comic_issues, 'issue record', 'issue records'))
  }
  return parts
}

/** "a", "a and b", "a, b and c". */
function joinWords(parts) {
  if (parts.length <= 1) return parts.join('')
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}

/**
 * The line a delete confirm shows for one row: its name and what goes with
 * it. A row with nothing attached says so.
 *
 * @param {object} preview  The server's delete preview.
 * @param {string} title  The row's title.
 */
export function deleteDetail(preview, title) {
  const parts = goesWith(preview)
  if (parts.length === 0) return `Nothing else goes with “${title}”.`
  return `“${title}” goes with ${joinWords(parts)}.`
}

/**
 * The line a bulk delete confirm shows: up to three titles and "N more",
 * then the totals that go with them.
 *
 * @param {object} preview  The server's delete preview over all the ids.
 */
export function bulkDeleteDetail(preview) {
  const named = preview.titles.map((title) => `“${title}”`)
  const more = preview.items - named.length
  if (more > 0) named.push(`${more} more`)
  const names = joinWords(named)
  const parts = goesWith(preview)
  if (parts.length === 0) return `${names} go. Nothing else is attached.`
  return `${names} go with ${joinWords(parts)}.`
}

/**
 * The armed confirm's line for a preview in whatever state it is in:
 * the words, and whether the confirm may go ahead.
 *
 * @param {{status: string, preview: object|null}} state  From `useDeletePreview`.
 * @param {(preview: object) => string} describe  Words for a ready preview.
 * @returns {{detail: string|null, ready: boolean}}
 */
export function previewLine(state, describe) {
  if (state.status === 'ready') {
    return { detail: describe(state.preview), ready: true }
  }
  if (state.status === 'error') return { detail: CHECK_FAILED, ready: false }
  return { detail: CHECKING, ready: false }
}
