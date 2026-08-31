import { NavLink, Outlet } from 'react-router'
import { profile } from '../content/profile.js'

/**
 * Site chrome shared by every route: header with nav, the routed page, and a
 * footer carrying contact links. The LinkedIn link renders only when a URL
 * has been supplied.
 */
export default function RootLayout() {
  return (
    <main>
      <header className="hero">
        <h1>{profile.name}</h1>
        <p className="tagline">{profile.tagline}</p>
        <nav>
          <NavLink to="/" end>
            Home
          </NavLink>
          <NavLink to="/about">About</NavLink>
          <NavLink to="/projects">Projects</NavLink>
        </nav>
      </header>

      <Outlet />

      <footer>
        <p className="muted">
          <a href={`mailto:${profile.email}`}>{profile.email}</a>
          {' · '}
          <a href={profile.github}>GitHub</a>
          {profile.linkedin && (
            <>
              {' · '}
              <a href={profile.linkedin}>LinkedIn</a>
            </>
          )}
        </p>
      </footer>
    </main>
  )
}
