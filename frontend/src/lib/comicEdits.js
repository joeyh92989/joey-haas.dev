/**
 * The owner's range edits to a comic series, shared by the series page's
 * run box and the issue page.
 *
 * Each function reads the stored row (`GET /api/items/{id}`, the owner's own
 * ranges, not the public ones that count an edition's issues too), edits
 * the text with `lib/comics.js` and PATCHes it. Validation is the server's:
 * a refusal throws an Error whose message is the API's `detail`.
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
 * Owns or unowns one issue as a single. Owning a skipped issue drops the
 * skip, as Got it does: the API refuses an issue both owned and skipped.
 *
 * @param {string} id - The series' item id.
 * @param {number} n
 * @param {boolean} [want] - The state to reach; omitted, the stored state flips.
 */
export async function toggleOwned(id, n, want) {
  const row = await stored(id)
  const numbers = new Set(expandRanges(row.issues_owned))
  const owned = want ?? !numbers.has(n)
  if (owned) numbers.add(n)
  else numbers.delete(n)
  const changes = { issues_owned: compactRanges(numbers) }
  const skipped = new Set(expandRanges(row.issues_skipped))
  if (owned && skipped.delete(n))
    changes.issues_skipped = compactRanges(skipped)
  await patch(id, changes)
}

/** Sets the read marker to this issue. */
export async function setReadTo(id, n) {
  await patch(id, { read_to: n })
}

/** Skips or un-skips one issue (private; the API refuses a held one). */
export async function toggleSkip(id, n) {
  const row = await stored(id)
  const numbers = new Set(expandRanges(row.issues_skipped))
  if (numbers.has(n)) numbers.delete(n)
  else numbers.add(n)
  await patch(id, { issues_skipped: compactRanges(numbers) })
}
