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
    try {
      localStorage.setItem(STORAGE_KEY, theme)
    } catch {
      // A theme that cannot be persisted still applies for this visit.
    }
  }, [theme])

  return (
    <main>
      <header className={isHome ? 'site-header home' : 'site-header'}>
        <img className="avatar" src={joeyPhoto} alt="" width="76" height="76" />
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
        <button
          type="button"
          className="theme-toggle"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        >
          {theme === 'dark' ? 'Light' : 'Dark'}
        </button>
      </nav>

      <Outlet />

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
    </main>
  )
}
