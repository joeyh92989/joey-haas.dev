/**
 * The words around deleting, redoing and discarding on the shelf: what goes
 * with a row and what the confirm says. Voice per docs/voice.md; the counts
 * are the server's (`POST /api/items/delete-preview`), never guessed here.
 */

/** Shown in the armed confirm while the counts are on their way. */
export const CHECKING = 'Checking what goes with it.'

/** Shown when the counts could not be read; the delete stays off. */
export const CHECK_FAILED =
  'Couldn’t check what goes with it. Keep it and try again.'

/** The redo confirm's first line: where the row goes. */
export const redoIntro = (title) =>
  `Redo “${title}”? It leaves the shelf and comes back as an entry in Add to match again.`

/** The status line after a delete. */
export const deletedLine = (title) => `Deleted “${title}”.`

/** The status line after a bulk delete. */
export const deletedManyLine = (count) =>
  `Deleted ${count} ${count === 1 ? 'item' : 'items'}.`

/** The failure lines. */
export const DELETE_FAILED = 'Couldn’t delete that item.'
export const DELETE_MANY_FAILED = 'Couldn’t delete those items.'
export const REDO_FAILED = 'Couldn’t send that back to Add.'

/**
 * The discard confirm's question, for the Add page's list and the Shelf
 * banner: the sitting's name and what goes with it, from its real counts.
 *
 * @param {string} name  The sitting's name.
 * @param {{photos?: number, entries?: Record<string, number>}} sitting
 *   As `GET /api/intake/sittings` lists it.
 */
export function discardAsk(name, sitting) {
  const photos = sitting.photos ?? 0
  const entries = Object.values(sitting.entries ?? {}).reduce(
    (sum, count) => sum + count,
    0,
  )
  const parts = []
  if (photos > 0) parts.push(`${photos} ${photos === 1 ? 'photo' : 'photos'}`)
  if (entries > 0) {
    parts.push(`${entries} ${entries === 1 ? 'entry' : 'entries'}`)
  }
  if (parts.length === 0) return `Discard ${name}? It has no photos or entries.`
  return `Discard ${name}? Its ${parts.join(' and ')} go with it.`
}
