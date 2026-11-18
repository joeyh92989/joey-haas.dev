import { apiFetch, errorMessage } from '../../lib/api.js'
import { placesAdd as words } from '../../content/placesAdd.js'

const JSON_HEADERS = { 'Content-Type': 'application/json' }

/**
 * One call to the intake API, as `call` in pages/PlacesAdd.jsx makes it (a
 * second copy, so the paste way imports no page). Resolves `{ok: true,
 * data}`, or `{ok: false, status, message}` in the server's words: a 409
 * here is intake's own conflict, a commit refusal (422) says
 * `refused[0].message`, and `status` 0 means the server did not answer.
 *
 * @param {string} path
 * @param {string} method
 * @param {object} [body]
 */
export async function call(path, method, body) {
  try {
    const response = await apiFetch(path, {
      method,
      headers: body ? JSON_HEADERS : undefined,
      body: body ? JSON.stringify(body) : undefined,
    })
    if (!response.ok) {
      const answer = await response.json().catch(() => null)
      const refusal = answer?.refused?.[0]?.message
      return {
        ok: false,
        status: response.status,
        message:
          typeof refusal === 'string' && refusal
            ? refusal
            : await errorMessage(
                { status: response.status, json: async () => answer },
                { ownConflicts: true },
              ),
      }
    }
    if (response.status === 204) return { ok: true, data: null }
    return { ok: true, data: await response.json() }
  } catch {
    return { ok: false, status: 0, message: words.noAnswer }
  }
}
