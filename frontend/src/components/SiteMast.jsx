import { useRef, useState } from 'react'
import { Link, NavLink } from 'react-router'
import { profile } from '../content/profile.js'
import MobileNavSheet from './MobileNavSheet.jsx'

/**
 * The site's one masthead, the same on every public route: monogram and
 * name, the nav as text links with the current one underlined, and on the
 * right the résumé download and the theme toggle.
 *
 * On a phone the CSS hides the nav and the résumé link and shows Menu,
 * which opens the same links as a sheet. Both are always rendered and CSS
 * picks one, so the first paint is right before any script measures the
 * viewport.
 *
 * @param {object} props
 * @param {'dark' | 'light'} props.theme The current theme.
 * @param {() => void} props.onToggleTheme Flips the theme.
 * @param {{to: string, label: string, end?: boolean}[]} props.items The nav.
 */
export default function SiteMast({ theme, onToggleTheme, items }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)
  const target = theme === 'dark' ? 'light' : 'dark'

  return (
    <header className="mast">
      <div className="wrap mast-row">
        <Link to="/" className="brand">
          <span className="mark" aria-hidden="true">
            JH
          </span>
          {profile.name}
        </Link>
        <nav className="site-nav" aria-label="Site">
          {items.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end}>
              {item.label}
            </NavLink>
          ))}
        </nav>
        {/* Outside <nav>: the toggle is a control, not a destination. */}
        <div className="mast-end">
          <a href="/resume.pdf" className="btn ghost mast-resume">
            Resume ↓
          </a>
          <button
            type="button"
            className="btn sm"
            aria-label={`Switch to ${target} theme`}
            onClick={onToggleTheme}
          >
            {target === 'light' ? 'Light' : 'Dark'}
          </button>
          <button
            type="button"
            ref={menuRef}
            className="btn sm mast-menu"
            aria-haspopup="dialog"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
          >
            Menu
          </button>
        </div>
      </div>
      <MobileNavSheet
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        items={items}
        returnFocusRef={menuRef}
      />
    </header>
  )
}
