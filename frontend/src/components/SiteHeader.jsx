import { NavLink } from 'react-router'
import joeyPhoto from '../assets/joey.jpg'
import { profile } from '../content/profile.js'

/**
 * The site's one masthead in two densities (Spine Next spec, K4): the full
 * résumé header on the person's pages, and a compact wordmark on the
 * tracker's, where the shelf is the point. On a narrow screen the nav is one
 * sideways-scrolling row with the theme toggle at its end, never a second
 * line.
 *
 * @param {object} props
 * @param {boolean} props.compact - Tracker routes: 24px avatar, no tagline.
 * @param {boolean} props.isHome - Home's larger header.
 * @param {'dark'|'light'} props.theme
 * @param {() => void} props.onToggleTheme
 * @param {{to: string, label: string, end?: boolean}[]} props.items - The nav.
 */
export default function SiteHeader({
  compact,
  isHome,
  theme,
  onToggleTheme,
  items,
}) {
  const density = [compact && 'compact', isHome && 'home']
    .filter(Boolean)
    .join(' ')
  return (
    <div className={`masthead ${density}`.trim()}>
      <header className={`site-header ${density}`.trim()}>
        <img className="avatar" src={joeyPhoto} alt="" />
        <div>
          <div className="site-name">{profile.name}</div>
          {!compact && <div className="tagline">{profile.tagline}</div>}
        </div>
      </header>

      {/* The toggle sits on the nav row visually but outside <nav>: it is not a
          navigation control, and the landmark should not advertise it as one. */}
      <div className={isHome ? 'nav-row home' : 'nav-row'}>
        <nav aria-label="Site">
          {items.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end}>
              {item.label}
            </NavLink>
          ))}
        </nav>
        {/* The visible label names the destination theme; the accessible name
            has to also say what the control does. */}
        <button
          type="button"
          className="theme-toggle"
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
          onClick={onToggleTheme}
        >
          {theme === 'dark' ? 'Light' : 'Dark'}
        </button>
      </div>
    </div>
  )
}
