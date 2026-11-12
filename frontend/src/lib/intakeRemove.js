import { apiFetch } from './api.js'

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
