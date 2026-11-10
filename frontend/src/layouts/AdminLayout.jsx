import { Suspense, useEffect, useRef, useState } from 'react'
import {
  Outlet,
  useLocation,
  useOutletContext,
  useSearchParams,
} from 'react-router'
import AdminShell from '../components/AdminShell.jsx'
import RouteErrorBoundary from '../components/RouteErrorBoundary.jsx'
import { LOAD_ERROR, WAKING } from '../content/status.js'
import { apiFetch, loginUrl } from '../lib/api.js'
import { usePageTitle } from '../lib/usePageTitle.js'
import { useRouteFocus } from '../lib/useRouteFocus.js'

/**
 * Loads the admin rows: the shell's owned count and Home's
 * figures. Null until loaded, and left null when the request fails, since
 * every page that needs the rows to work loads its own.
 */
async function loadItems() {
  try {
    const response = await apiFetch('/api/items')
    if (!response.ok) return null
    const body = await response.json()
    return Array.isArray(body) ? body : null
  } catch {
    return null
  }
}

/**
 * The closet's untagged count, for the Closet area's badge. Null when the
 * request fails: a missing badge is better than a page that breaks.
 */
async function loadUntagged() {
  try {
    const response = await apiFetch('/api/closet/garments')
    if (!response.ok) return null
    const body = await response.json()
    return typeof body?.counts?.untagged === 'number'
      ? body.counts.untagged
      : null
  } catch {
    return null
  }
}

/**
 * How many pieces Review has flagged, for the Closet area's badge. Null
 * when the request fails, like the untagged count.
 */
async function loadReview() {
  try {
    const response = await apiFetch('/api/closet/review')
    if (!response.ok) return null
    const body = await response.json()
    return typeof body?.tiles?.flagged === 'number' ? body.tiles.flagged : null
  } catch {
    return null
  }
}

/** The pages that reload the rows each time they open. */
const RELOAD_PATHS = ['/admin', '/admin/jobs']

/**
 * Every /admin route. It checks the session once, then renders the routed
 * page inside the admin shell; until then, and for every way that check can
 * go wrong, it renders a plain centred panel with no shell. A failed
 * sign-out stays in the shell, so the page and anything unsaved on it
 * survive.
 *
 * The admin area is deliberately absent from the site navigation. That is
 * not a security control; the server-side session check is. It keeps a
 * personal site from looking like an app with a login wall.
 *
 * Routed pages get the layout's outlet context plus `items`, the admin rows
 * (null until loaded), reloaded each time Home or Jobs is opened, and
 * `setClosetUntagged`, which the Closet page calls with the count it last
 * read, so Home's figure follows an upload or a tagging run, and
 * `closetReview` / `setClosetReview`, the flagged count Review calls with
 * after every read, so the area's badge follows each decision.
 */
export default function AdminLayout() {
  const context = useOutletContext()
  const [status, setStatus] = useState('checking')
  const [email, setEmail] = useState(null)
  const [slow, setSlow] = useState(false)
  const [items, setItems] = useState(null)
  const [closetUntagged, setClosetUntagged] = useState(null)
  const [closetReview, setClosetReview] = useState(null)
  const [signOutFailed, setSignOutFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const itemsLoaded = useRef(false)
  const signedOutHere = useRef(false)
  const [searchParams] = useSearchParams()
  const { pathname } = useLocation()
  const mainRef = useRouteFocus()
  const denied = searchParams.get('error') === 'access_denied'
  const signedIn = status === 'signed-in'
  // Home and Jobs read the rows for their figures and Recent changes.
  const onDashboard = RELOAD_PATHS.includes(pathname.replace(/\/+$/, ''))
  // The signed-in pages title themselves through AdminPageHeader.
  usePageTitle(signedIn ? null : 'Admin · Joey Haas')

  useEffect(() => {
    // The API sleeps on Render's free tier, so a first request after idle can
    // take ~30 seconds. Without this the page looks broken rather than slow.
    const timer = setTimeout(() => setSlow(true), 3000)

    let live = true
    apiFetch('/api/auth/me')
      .then(async (response) => {
        if (!live) return
        // Only the API saying no means signed out. A 502 while Render
        // deploys is the server, not the session, and must not offer sign-in.
        if (response.status === 401 || response.status === 403) {
          setStatus('signed-out')
          return
        }
        if (!response.ok) throw new Error(`status ${response.status}`)
        const data = await response.json()
        if (!live) return
        setEmail(data.email)
        setStatus('signed-in')
      })
      .catch(() => {
        if (live) setStatus('error')
      })
      .finally(() => clearTimeout(timer))

    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [attempt])

  useEffect(() => {
    // The shell, and the control that had focus, have just gone: start the
    // reader on the gate rather than at the top of the document.
    if (status === 'signed-out' && signedOutHere.current) {
      signedOutHere.current = false
      mainRef.current?.focus()
    }
  }, [status, mainRef])

  useEffect(() => {
    // Loaded once on sign-in, and again whenever Home or Jobs opens, so
    // their figures include what was changed on the other pages.
    if (!signedIn || (!onDashboard && itemsLoaded.current)) return
    let live = true
    loadItems().then((rows) => {
      if (!live || !rows) return
      itemsLoaded.current = true
      setItems(rows)
    })
    return () => {
      live = false
    }
  }, [signedIn, onDashboard])

  useEffect(() => {
    // Once per sign-in; the Closet and Review pages keep them current.
    if (!signedIn) return
    let live = true
    loadUntagged().then((count) => {
      if (live && count !== null) setClosetUntagged(count)
    })
    loadReview().then((count) => {
      if (live && count !== null) setClosetReview(count)
    })
    return () => {
      live = false
    }
  }, [signedIn])

  async function signOut() {
    // Only claim to be signed out if the server actually cleared the session.
    // Flipping the UI on a failed request would leave a valid 30-day cookie
    // behind while the page says otherwise — worst on a shared machine, where
    // the next visitor would still be authenticated.
    setSignOutFailed(false)
    try {
      const response = await apiFetch('/api/auth/logout', { method: 'POST' })
      if (!response.ok) {
        setSignOutFailed(true)
        return
      }
    } catch {
      setSignOutFailed(true)
      return
    }

    setEmail(null)
    setItems(null)
    setClosetUntagged(null)
    setClosetReview(null)
    itemsLoaded.current = false
    signedOutHere.current = true
    setStatus('signed-out')
  }

  function retry() {
    setSlow(false)
    setStatus('checking')
    setAttempt((count) => count + 1)
  }

  if (signedIn) {
    const owned = items
      ? items.filter((item) => item.owned_format !== 'none').length
      : null
    return (
      <AdminShell
        email={email}
        ownedCount={owned}
        onSignOut={signOut}
        badges={
          closetReview
            ? { closet: { value: closetReview, words: 'to review' } }
            : {}
        }
      >
        {signOutFailed && (
          <p className="admin-error" role="alert">
            Sign out failed — you are still signed in. Try again.
          </p>
        )}
        {/* Keyed on the path, so an error on one page is not carried to the
            next; the shell stays up either way. */}
        <RouteErrorBoundary key={pathname}>
          <Suspense
            fallback={
              <p className="muted" role="status">
                Loading…
              </p>
            }
          >
            <Outlet
              context={{
                ...context,
                items,
                closetUntagged,
                setClosetUntagged,
                closetReview,
                setClosetReview,
              }}
            />
          </Suspense>
        </RouteErrorBoundary>
      </AdminShell>
    )
  }

  return (
    <main id="main" ref={mainRef} tabIndex={-1} className="admin-gate">
      <section className="admin-gate-panel">
        <h1>Admin</h1>

        {denied && (
          <p className="admin-error" role="alert">
            That account is not authorized for this site.
          </p>
        )}

        {status === 'checking' && (
          <p className="muted" role="status">
            {slow ? WAKING : 'Checking your session…'}
          </p>
        )}

        {status === 'error' && (
          <>
            <p className="admin-error" role="alert">
              {LOAD_ERROR}
            </p>
            <p>
              <button type="button" className="btn" onClick={retry}>
                Try again
              </button>
            </p>
          </>
        )}

        {status === 'signed-out' && (
          <p>
            <a className="admin-signin" href={loginUrl}>
              Sign in with Google
            </a>
          </p>
        )}
      </section>
    </main>
  )
}
