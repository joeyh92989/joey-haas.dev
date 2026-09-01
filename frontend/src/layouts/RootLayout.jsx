import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router'
import joeyPhoto from '../assets/joey.jpg'
import { profile } from '../content/profile.js'

const STORAGE_KEY = 'theme'

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
  const isHome = useLocation().pathname === '/'

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

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
    <div className="page">
      <header className={isHome ? 'site-header home' : 'site-header'}>
        <img className="avatar" src={joeyPhoto} alt="" />
        <div>
          <div className="site-name">{profile.name}</div>
          <div className="tagline">{profile.tagline}</div>
        </div>
      </header>

      <nav className={isHome ? 'nav-home' : undefined}>
        <NavLink to="/" end>
          Home
        </NavLink>
        <NavLink to="/about">About</NavLink>
        <NavLink to="/projects">Projects</NavLink>
        <NavLink to="/blog">Blog</NavLink>
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
      </nav>

      <main className={isHome ? 'home' : undefined}>
        <Outlet />
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
      </footer>
    </div>
  )
}
