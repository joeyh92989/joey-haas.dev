/**
 * The owner's edits to a comic series, shared by the series page, the issue
 * page and the admin comic page.
 *
 * `setMark` is the one write for owned and read (a POST to the mark route).
 * `toggleSkip` reads the stored row (`GET /api/items/{id}`, the owner's own
 * ranges), edits the text with `lib/comics.js` and PATCHes it. Validation is
 * the server's: a refusal throws an Error whose message is the API's
 * `detail`.
 */
import { apiFetch, errorMessage } from './api.js'
import { compactRanges, expandRanges } from './comics.js'

const path = (id) => `/api/items/${encodeURIComponent(id)}`

async function stored(id) {
  const response = await apiFetch(path(id))
  if (!response.ok) throw new Error(await errorMessage(response))
  return response.json()
}

async function patch(id, changes) {
  const response = await apiFetch(path(id), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(changes),
  })
  if (!response.ok) throw new Error(await errorMessage(response))
}

/**
 * Sets one book to missing, owned or read: the one write behind every tap on
 * a cover (the series page, the issue page, the admin page). The marks on the
 * issue rows are the record; the server keeps the range text and `read_to`
 * in step. `to` marks every issue from `n` through it (a whole edition).
 *
 * @param {string} id - The series' item id.
 * @param {number} n
 * @param {'missing'|'owned'|'read'} state
 * @param {number} [to]
 * @returns {Promise<object>} The series' comic state after the write.
 */
export async function setMark(id, n, state, to) {
  const response = await apiFetch(`/api/comics/${encodeURIComponent(id)}/issues/${n}/mark`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(to ? { state, to } : { state }),
  })
  // A 409 here is the route's own (an edition-held book can't go missing).
  if (!response.ok)
    throw new Error(await errorMessage(response, { ownConflicts: true }))
  return response.json()
}

/** Skips or un-skips one issue (private; the API refuses a held one). */
export async function toggleSkip(id, n) {
  const row = await stored(id)
  const numbers = new Set(expandRanges(row.issues_skipped))
  if (numbers.has(n)) numbers.delete(n)
  else numbers.add(n)
  await patch(id, { issues_skipped: compactRanges(numbers) })
}
