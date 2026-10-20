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
 * Loads the admin rows: the shell's owned count and the Dashboard's
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
 * Every /admin route. It checks the session once, then renders the routed
 * page inside the admin shell; until then, and for every way that check or
 * a sign-out can go wrong, it renders a plain centred panel with no shell.
 *
 * The admin area is deliberately absent from the site navigation. That is
 * not a security control; the server-side session check is. It keeps a
 * personal site from looking like an app with a login wall.
 *
 * Routed pages get the layout's outlet context plus `items`, the admin rows
 * (null until loaded), reloaded each time the Dashboard is opened.
 */
export default function AdminLayout() {
  const context = useOutletContext()
  const [status, setStatus] = useState('checking')
  const [email, setEmail] = useState(null)
  const [slow, setSlow] = useState(false)
  const [items, setItems] = useState(null)
  const itemsLoaded = useRef(false)
  const [searchParams] = useSearchParams()
  const { pathname } = useLocation()
  const mainRef = useRouteFocus()
  const denied = searchParams.get('error') === 'access_denied'
  const signedIn = status === 'signed-in'
  const onDashboard = pathname.replace(/\/+$/, '') === '/admin'
  // The signed-in pages title themselves through AdminPageHeader.
  usePageTitle(signedIn ? null : 'Admin · Joey Haas')

  useEffect(() => {
    // The API sleeps on Render's free tier, so a first request after idle can
    // take ~30 seconds. Without this the page looks broken rather than slow.
    const timer = setTimeout(() => setSlow(true), 3000)

    apiFetch('/api/auth/me')
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        setEmail(data ? data.email : null)
        setStatus(data ? 'signed-in' : 'signed-out')
      })
      .catch(() => setStatus('error'))
      .finally(() => clearTimeout(timer))

    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    // Loaded once on sign-in, and again whenever the Dashboard opens, so its
    // figures include what was changed on the other pages.
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

  async function signOut() {
    // Only claim to be signed out if the server actually cleared the session.
    // Flipping the UI on a failed request would leave a valid 30-day cookie
    // behind while the page says otherwise — worst on a shared machine, where
    // the next visitor would still be authenticated.
    try {
      const response = await apiFetch('/api/auth/logout', { method: 'POST' })
      if (!response.ok) {
        setStatus('signout-failed')
        return
      }
    } catch {
      setStatus('signout-failed')
      return
    }

    setEmail(null)
    setItems(null)
    itemsLoaded.current = false
    setStatus('signed-out')
  }

  if (signedIn) {
    const owned = items
      ? items.filter((item) => item.owned_format !== 'none').length
      : null
    return (
      <AdminShell email={email} ownedCount={owned} onSignOut={signOut}>
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
            <Outlet context={{ ...context, items }} />
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
          <p className="admin-error">
            That account is not authorized for this site.
          </p>
        )}

        {status === 'checking' && (
          <p className="muted">{slow ? WAKING : 'Checking your session…'}</p>
        )}

        {status === 'error' && <p className="admin-error">{LOAD_ERROR}</p>}

        {status === 'signed-out' && (
          <p>
            <a className="admin-signin" href={loginUrl}>
              Sign in with Google
            </a>
          </p>
        )}

        {status === 'signout-failed' && (
          <>
            <p className="admin-error">
              Sign out failed — you are still signed in. Try again.
            </p>
            <p>
              <button type="button" className="admin-signout" onClick={signOut}>
                Sign out
              </button>
            </p>
          </>
        )}
      </section>
    </main>
  )
}
