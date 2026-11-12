import { apiFetch, errorMessage } from './api.js'

/**
 * Whether an entry was removed from its sitting: `ignored` with no
 * `payload.unticked`. (An unticked one is the skim grid's untick and stays
 * listed; a removed one is shown nowhere and a commit clears it.)
 */
export function isRemoved(entry) {
  return entry.state === 'ignored' && entry.payload?.unticked !== true
}

/** The entries a page lists: those not removed. */
export const live = (entries) => entries.filter((entry) => !isRemoved(entry))

/**
 * Removes one title from an unfinished sitting: `PATCH state: ignored`,
 * with the skim grid's untick note dropped so it stays hidden everywhere.
 *
 * @param {object} entry
 * @returns {Promise<Response>}
 */
export function removeEntryRequest(entry) {
  const payload = { ...entry.payload }
  delete payload.unticked
  delete payload.was
  return apiFetch(`/api/intake/entries/${entry.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state: 'ignored', payload }),
  })
}

/**
 * Removes one photo, and every entry read from it, from an unfinished
 * sitting (a closet photo takes its untagged piece along).
 *
 * @returns {Promise<Response>}
 */
export function removePhotoRequest(sittingId, photoId) {
  return apiFetch(`/api/intake/sittings/${sittingId}/photos/${photoId}`, {
    method: 'DELETE',
  })
}

/**
 * Removes a garment through the Closet's own route (its sitting entry goes
 * with it, by cascade).
 *
 * @returns {Promise<Response>}
 */
export function removeGarmentRequest(garmentId) {
  return apiFetch(`/api/closet/garments/${garmentId}`, { method: 'DELETE' })
}

// Entries whose removal is on its way: a second click sends nothing.
const removing = new Set()

/**
 * Takes one entry out of its unfinished sitting and reports the result: the
 * one place every page's Remove goes through. A typed closet piece (a
 * garment with no photo) is deleted with its garment, through the Closet's
 * route, since ignoring its entry would leave the garment behind; any other
 * entry is ignored (`removeEntryRequest`). A second call for the same entry
 * while one is on its way does nothing.
 *
 * @param {object} entry
 * @param {object} handlers
 * @param {(entry: object) => void} handlers.onEntry The entry, now removed.
 * @param {(message: string|null) => void} handlers.onError Called with null
 *   when a removal starts, then with the words if it fails.
 * @returns {Promise<void>}
 */
export async function removeEntry(entry, { onEntry, onError }) {
  if (removing.has(entry.id)) return
  removing.add(entry.id)
  onError(null)
  try {
    const garmentOnly = entry.garment_id != null && !entry.photo_id
    const response = garmentOnly
      ? await removeGarmentRequest(entry.garment_id)
      : await removeEntryRequest(entry)
    if (!response.ok && !(garmentOnly && response.status === 404)) {
      onError(await errorMessage(response, { ownConflicts: true }))
      return
    }
    onEntry(
      garmentOnly
        ? { ...entry, state: 'ignored', payload: withoutNotes(entry.payload) }
        : await response.json(),
    )
  } catch {
    onError('The server did not answer; try again.')
  } finally {
    removing.delete(entry.id)
  }
}

function withoutNotes(payload) {
  const rest = { ...payload }
  delete rest.unticked
  delete rest.was
  return rest
}
