/**
 * API helpers for the authenticated parts of the site.
 *
 * Every call sends credentials so the session cookie set by api.joey-haas.dev
 * is included. That works because the site and the API share a registrable
 * domain, which makes the request same-site.
 */
const API_URL = import.meta.env.VITE_API_URL || ''

/** Fetches an API path with the session cookie attached. */
export function apiFetch(path, options = {}) {
  return fetch(`${API_URL}${path}`, { ...options, credentials: 'include' })
}

/** Full-page navigation target that starts the Google sign-in flow. */
export const loginUrl = `${API_URL}/api/auth/login`

/**
 * A failed response's error in words: the API's `detail` when it sent one,
 * else the status. A 409 from the catalogue means another refresh holds the
 * lock, which is worth saying plainly.
 */
export async function errorMessage(response) {
  if (response.status === 409) return 'A refresh is already running'
  try {
    const body = await response.json()
    if (typeof body.detail === 'string') return body.detail
  } catch {
    // Not JSON; the status says enough.
  }
  return `The server answered ${response.status}`
}
