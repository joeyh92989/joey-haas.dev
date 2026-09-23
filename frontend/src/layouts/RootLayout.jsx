import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router'
import joeyPhoto from '../assets/joey.jpg'
import { profile } from '../content/profile.js'
import { apiFetch, loginUrl } from '../lib/api.js'

const STORAGE_KEY = 'theme'

/**
 * Routes that break out of the 45rem reading column: the tracker's shelves
 * and item pages are grids of covers, not prose. Each entry matches itself
 * and anything nested under it.
 */
const WIDE_ROUTES = [
  '/collection',
  '/admin/collection',
  '/admin/play-next',
  '/admin/discover',
  '/admin/radar',
]

/**
 * Whether a pathname gets the wide layout.
 *
 * @param {string} pathname The current location's pathname.
 * @returns {boolean} True for a wide route or a route nested under one.
 */
function isWideRoute(pathname) {
  return WIDE_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  )
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
 * the theme toggle; the routed page; and a footer carrying contact links. The
 * LinkedIn link renders only when a URL has been supplied.
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
      <header className={isHome ? 'site-header home' : 'site-header'}>
        <img className="avatar" src={joeyPhoto} alt="" />
        <div>
          <div className="site-name">{profile.name}</div>
          <div className="tagline">{profile.tagline}</div>
        </div>
      </header>

      {/* The toggle sits on the nav row visually but outside <nav>: it is not a
          navigation control, and the landmark should not advertise it as one. */}
      <div className={isHome ? 'nav-row home' : 'nav-row'}>
        <nav>
          <NavLink to="/" end>
            Home
          </NavLink>
          <NavLink to="/about">About</NavLink>
          <NavLink to="/projects">Projects</NavLink>
          <NavLink to="/blog">Blog</NavLink>
        </nav>
        {/* The visible label names the destination theme; the accessible name
            has to also say what the control does. */}
        <button
          type="button"
          className="theme-toggle"
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
          onClick={toggleTheme}
        >
          {theme === 'dark' ? 'Light' : 'Dark'}
        </button>
      </div>

      <main className={isHome ? 'home' : undefined}>
        {/* Routed pages read the session from here rather than each asking
            /api/auth/me again against a backend that may be asleep. */}
        <Outlet context={{ signedIn: Boolean(signedIn) }} />
      </main>

      <footer>
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
      </footer>
    </div>
  )
}
