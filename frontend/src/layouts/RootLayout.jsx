import { Suspense, useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router'
import RouteErrorBoundary from '../components/RouteErrorBoundary.jsx'
import SiteFooter from '../components/SiteFooter.jsx'
import SiteMast from '../components/SiteMast.jsx'
import { posts } from '../content/posts.js'
import { apiFetch } from '../lib/api.js'
import { useAnalyticsBeacon } from '../lib/useAnalyticsBeacon.js'
import { useRouteFocus } from '../lib/useRouteFocus.js'

const STORAGE_KEY = 'theme'

/**
 * Routes that break out of the 45rem reading column: the tracker's shelves
 * and item pages are grids of covers, not prose. Each entry matches itself
 * and anything nested under it.
 */
const WIDE_ROUTES = ['/spine']

/**
 * Routes that bring their own frame: the admin shell replaces the masthead
 * and footer, and lays out its own pages.
 */
const SHELL_ROUTES = ['/admin']

/**
 * Routes laid out on the site's full 1040px measure rather than the reading
 * column: pages of cards and columns, not running prose. Matched exactly,
 * since '/' would otherwise match everything.
 */
const CONTENT_ROUTES = ['/', '/about', '/projects']

/**
 * Whether a pathname is one of the routes or nested under one.
 *
 * @param {string[]} routes Route prefixes.
 * @param {string} pathname The current location's pathname.
 * @returns {boolean} True for a listed route or a route nested under one.
 */
function isUnder(routes, pathname) {
  return routes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  )
}

/**
 * Whether a pathname gets the wide layout.
 *
 * @param {string} pathname The current location's pathname.
 * @returns {boolean} True for a wide route or a route nested under one.
 */
function isWideRoute(pathname) {
  return isUnder(WIDE_ROUTES, pathname)
}

/**
 * The nav, in order. Blog is listed only while a published post exists:
 * production builds compile drafts to null, so a repo of drafts would
 * otherwise put a nav item in front of an empty page.
 *
 * @param {boolean} hasPosts Whether any post is published.
 * @returns {{to: string, label: string, end?: boolean}[]}
 */
function navItems(hasPosts) {
  return [
    { to: '/', label: 'Home', end: true },
    { to: '/about', label: 'About' },
    { to: '/projects', label: 'Projects' },
    { to: '/spine', label: 'Spine' },
    ...(hasPosts ? [{ to: '/blog', label: 'Blog' }] : []),
  ]
}

/**
 * Reads the persisted theme, falling back to dark.
 *
 * Dark is the brand default and is deliberately not derived from
 * prefers-color-scheme: a visitor's OS setting says nothing about which of
 * these two palettes the site should greet them with. Storage access is
 * guarded because it throws outright in some private-browsing modes.
 *
 * Keep the accepted values in step with the pre-paint script in index.html,
 * which performs the same check before this bundle loads.
 *
 * @returns {'dark' | 'light'} The theme to render on first paint.
 */
function readStoredTheme() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored === 'light' || stored === 'dark' ? stored : 'dark'
  } catch {
    return 'dark'
  }
}

/**
 * Site chrome shared by every route: the masthead, the routed page and the
 * footer. The masthead is the same everywhere; only the page's width
 * changes with the route. The admin routes keep the theme and the outlet
 * context but render none of the chrome: AdminLayout brings the shell.
 */
export default function RootLayout() {
  const [theme, setTheme] = useState(readStoredTheme)
  // null until the session check answers: the beacon waits for it.
  const [signedIn, setSignedIn] = useState(null)
  const { pathname } = useLocation()
  const mainRef = useRouteFocus()
  useAnalyticsBeacon(pathname, signedIn)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  useEffect(() => {
    // Fails quietly on purpose. This runs on every public page, and the
    // free-tier API is asleep most of the time; a footer that reported an
    // error because a session check timed out would be worse than a footer
    // that simply offers sign-in.
    let cancelled = false
    apiFetch('/api/auth/me')
      .then((response) => {
        if (!cancelled) setSignedIn(response.ok)
      })
      .catch(() => {
        if (!cancelled) setSignedIn(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  /**
   * Flips the theme and records the choice.
   *
   * Persisting here rather than in an effect keeps the stored value a record of
   * what the visitor actually chose: writing on mount would pin every first-time
   * visitor to today's default, so a future change of default would never reach
   * anyone who had merely visited.
   */
  function toggleTheme() {
    setTheme((current) => {
      const next = current === 'dark' ? 'light' : 'dark'
      try {
        localStorage.setItem(STORAGE_KEY, next)
      } catch {
        // A theme that cannot be persisted still applies for this visit.
      }
      return next
    })
  }

  const context = { signedIn: Boolean(signedIn) }

  if (isUnder(SHELL_ROUTES, pathname)) {
    return (
      <div className="site site-admin">
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        {/* Not keyed on the path: AdminLayout stays mounted across admin
            pages, so its session check runs once, and keys its own. */}
        <RouteErrorBoundary>
          <Suspense
            fallback={
              <p className="muted" role="status">
                Loading…
              </p>
            }
          >
            <Outlet context={context} />
          </Suspense>
        </RouteErrorBoundary>
      </div>
    )
  }

  const wide = isWideRoute(pathname)
  // Render serves the prerendered pages at /about/ as well as /about.
  const path = pathname.replace(/\/+$/, '') || '/'
  const pageClass = wide
    ? 'page page-wide'
    : CONTENT_ROUTES.includes(path)
      ? 'page page-content'
      : 'page'

  return (
    <div className={wide ? 'site site-wide' : 'site'}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <SiteMast
        theme={theme}
        onToggleTheme={toggleTheme}
        items={navItems(posts.length > 0)}
      />

      <main id="main" ref={mainRef} tabIndex={-1} className={pageClass}>
        <RouteErrorBoundary key={pathname}>
          {/* Lazy admin pages wait here; public pages are in the main chunk. */}
          <Suspense
            fallback={
              <p className="muted" role="status">
                Loading…
              </p>
            }
          >
            {/* Routed pages read the session from here rather than each asking
                /api/auth/me again against a backend that may be asleep. */}
            <Outlet context={context} />
          </Suspense>
        </RouteErrorBoundary>
      </main>

      <SiteFooter signedIn={Boolean(signedIn)} />
    </div>
  )
}
