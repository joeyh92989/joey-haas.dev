import { useEffect, useRef } from 'react'
import { API_URL } from './api.js'
import { useMediaQuery } from './useMediaQuery.js'

/** Never counted: the admin, which is Joey's own traffic. */
const EXCLUDED = '/admin'

/** Whether the visitor asked not to be tracked (GPC or Do Not Track). */
function optedOut() {
  return navigator.globalPrivacyControl === true || navigator.doNotTrack === '1'
}

/** A site host without its www., so the two spellings compare equal. */
function bare(host) {
  return host.replace(/^www\./, '')
}

/**
 * The referring site's hostname, or '' for a direct visit, an unreadable
 * referrer, or a link from this site.
 */
function referrerHost() {
  try {
    const host = new URL(document.referrer).hostname
    return bare(host) === bare(window.location.hostname) ? '' : host
  } catch {
    return ''
  }
}

/**
 * Sends one page view per public route change to `POST /api/track`, through
 * `navigator.sendBeacon`: a text/plain body, so no CORS preflight, and it
 * survives the page unloading.
 *
 * Nothing is sent while signed in, on `/admin*`, when the browser sends
 * GPC or Do Not Track, or when sendBeacon is missing. While the session
 * check is still out (`signedIn === null`) views are queued, not dropped:
 * a visitor who clicks through before it answers is counted for every
 * page, in order, once it says signed out, and the queue is thrown away if
 * it says signed in. The body is `{path, ref, device}` and nothing else.
 * `ref` is where the visit came from on its first view ('' for direct) and
 * null on every later one, which the server leaves out of the referrer
 * counts.
 *
 * @param {string} pathname The current location's pathname.
 * @param {boolean | null} signedIn The session, or null while it is checked.
 */
export function useAnalyticsBeacon(pathname, signedIn) {
  const coarse = useMediaQuery('(pointer: coarse)')
  const narrow = useMediaQuery('(max-width: 700px)')
  const device = !coarse ? 'desktop' : narrow ? 'phone' : 'tablet'
  const first = useRef(true)
  // The path last seen: a device change (a resized window) is not a view.
  const seen = useRef(null)
  // Views waiting on the session check, oldest first.
  const pending = useRef([])

  useEffect(() => {
    if (seen.current !== pathname) {
      seen.current = pathname
      if (pathname !== EXCLUDED && !pathname.startsWith(`${EXCLUDED}/`)) {
        pending.current.push(pathname)
      }
    }
    if (signedIn === null) return
    const queue = pending.current
    pending.current = []
    if (signedIn) return
    if (optedOut() || typeof navigator.sendBeacon !== 'function') return
    for (const path of queue) {
      const ref = first.current ? referrerHost() : null
      first.current = false
      navigator.sendBeacon(
        `${API_URL}/api/track`,
        JSON.stringify({ path, ref, device }),
      )
    }
  }, [pathname, signedIn, device])
}
