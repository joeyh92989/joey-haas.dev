import { useEffect, useRef } from 'react'
import { NavLink, useLocation } from 'react-router'
import joeyPhoto from '../assets/joey.jpg'
import { profile } from '../content/profile.js'

/**
 * The width of the fade on the nav's right edge, in px. It mirrors the CSS
 * `2rem` fade width in `.nav-row nav`'s mask (at 16px); the two change
 * together.
 */
const FADE_PX = 32

/**
 * The nav's left padding, in px (0.25rem at 16px): room for the first link's
 * focus ring, which the nav's overflow would otherwise clip. It mirrors the
 * `padding-inline` in `.nav-row nav`; the two change together.
 */
const RING_PX = 4

/**
 * Scrolls the nav sideways, and only sideways, so a link is fully visible and
 * clear of the fade. Does nothing when the nav does not overflow.
 *
 * Not scrollIntoView: that can also scroll the page vertically, and the
 * browser's own focus scrolling leaves a partly visible link where it is,
 * under the fade. offsetLeft is measured against the nav (it is positioned),
 * so it does not change as the nav scrolls. A link counts as hidden on the
 * left when its focus ring is, and is scrolled in with RING_PX of room for
 * that ring, which also makes the first link scroll all the way back to 0.
 *
 * @param {HTMLElement | null} nav The scrolling nav.
 * @param {HTMLElement | null} link A link inside it.
 */
function revealInNav(nav, link) {
  if (!nav || !link || nav.scrollWidth <= nav.clientWidth) return
  const right = link.offsetLeft + link.offsetWidth + FADE_PX
  if (link.offsetLeft - RING_PX < nav.scrollLeft) {
    nav.scrollLeft = Math.max(0, link.offsetLeft - RING_PX)
  } else if (right > nav.scrollLeft + nav.clientWidth) {
    nav.scrollLeft = right - nav.clientWidth
  }
}

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
  const navRef = useRef(null)
  const { pathname } = useLocation()

  // On a phone the nav scrolls sideways; make sure the current page's item
  // is never the one under the fade.
  useEffect(() => {
    revealInNav(navRef.current, navRef.current?.querySelector('a.active'))
  }, [pathname])

  // Tabbing to a partly visible link: the browser leaves it where it is.
  useEffect(() => {
    const nav = navRef.current
    if (!nav) return undefined
    const onFocusIn = (event) => revealInNav(nav, event.target.closest('a'))
    nav.addEventListener('focusin', onFocusIn)
    return () => nav.removeEventListener('focusin', onFocusIn)
  }, [])

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
        <nav aria-label="Site" ref={navRef}>
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
