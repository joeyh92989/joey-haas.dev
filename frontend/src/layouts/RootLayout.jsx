import { useEffect, useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router'
import SiteHeader from '../components/SiteHeader.jsx'
import { profile } from '../content/profile.js'
import { posts } from '../content/posts.js'
import { apiFetch, loginUrl } from '../lib/api.js'

const STORAGE_KEY = 'theme'

/**
 * Routes that break out of the 45rem reading column: the tracker's shelves
 * and item pages are grids of covers, not prose. Each entry matches itself
 * and anything nested under it.
 */
const WIDE_ROUTES = [
  '/spine',
  '/admin/collection',
  '/admin/play-next',
  '/admin/catalogue',
  '/admin/discover',
  '/admin/radar',
]

/**
 * Routes that are the tracker rather than the person: the masthead shrinks
 * to a wordmark so the shelf starts in the first screen (Spine Next spec,
 * K4). A different question from WIDE_ROUTES (is this a grid?), so its own
 * list; same prefix rule.
 */
const COMPACT_ROUTES = ['/spine', '/admin']

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
 * Site chrome shared by every route: header with photo, name, nav pills and
 * the theme toggle; the routed page; and a footer carrying a credit line and
 * contact links. The LinkedIn link renders only when a URL has been supplied.
 */
export default function RootLayout() {
  const [theme, setTheme] = useState(readStoredTheme)
  const [signedIn, setSignedIn] = useState(false)
  const { pathname } = useLocation()
  const isHome = pathname === '/'

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
      .catch(() => {})
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

  return (
    <div className={isWideRoute(pathname) ? 'page page-wide' : 'page'}>
      <SiteHeader
        compact={isUnder(COMPACT_ROUTES, pathname)}
        isHome={isHome}
        theme={theme}
        onToggleTheme={toggleTheme}
        items={navItems(posts.length > 0)}
      />

      <main className={isHome ? 'home' : undefined}>
        {/* Routed pages read the session from here rather than each asking
            /api/auth/me again against a backend that may be asleep. */}
        <Outlet context={{ signedIn: Boolean(signedIn) }} />
      </main>

      <footer className="site-footer">
        <p className="footer-credit">
          &copy; {new Date().getFullYear()} {profile.name} &middot;{' '}
          <a href={profile.repo}>Source</a>
        </p>
        <p className="footer-links">
          <a href={`mailto:${profile.email}`}>{profile.email}</a>
          {' · '}
          <a href={profile.github}>GitHub</a>
          {profile.linkedin && (
            <>
              {' · '}
              <a href={profile.linkedin}>LinkedIn</a>
            </>
          )}
          {' · '}
          {/* Replaces having to know the /admin URL. Deliberately understated:
              it is a door for one person, not a call to action. */}
          {signedIn ? (
            <Link to="/admin" className="footer-admin">
              Admin
            </Link>
          ) : (
            <a href={loginUrl} className="footer-admin">
              Sign in
            </a>
          )}
        </p>
      </footer>
    </div>
  )
}
