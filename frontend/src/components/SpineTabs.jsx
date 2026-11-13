import { useEffect, useRef } from 'react'
import { NavLink, useLocation } from 'react-router'
import { spine } from '../content/spine.js'
import { hasComics, hasGames } from '../lib/snapshotPresence.js'

/**
 * Games · Comics · What's next · Year in review · Tour · Daily game,
 * under the My Shelf name on each page (Spine Next spec, C13; Daily from the
 * daily puzzle spec, the one tab outside /shelf). Links, not ARIA tabs: each is its own
 * page with its own URL. Year in review stays current on every year's page.
 * A tab's optional `badge` is read as part of its name; none carries one now.
 * A type's tab is left out while the build's snapshot holds no public row of
 * that type (#125, shelf split), as the masthead leaves Blog out until a
 * post is published.
 *
 * @param {object} props
 * @param {boolean} [props.games] Whether to show the Games tab; defaults to
 *   the build-time answer.
 * @param {boolean} [props.comics] Whether to show the Comics tab; defaults to
 *   the build-time answer.
 */
export default function SpineTabs({ games = hasGames, comics = hasComics }) {
  const { how } = spine.tabs
  const nav = useRef(null)
  const { pathname } = useLocation()
  // On a phone the row scrolls sideways; keep the current tab fully in view,
  // clear of the edge fade. This moves only the row's own scrollLeft:
  // scrollIntoView would also scroll the page. A row that does not overflow
  // has nothing to scroll, and jsdom has no layout, so it is skipped there.
  useEffect(() => {
    const row = nav.current
    const tab = row?.querySelector('a.active')
    if (!row || !tab || row.scrollWidth <= row.clientWidth) return
    const fade = parseFloat(getComputedStyle(row).paddingRight) || 0
    const rowBox = row.getBoundingClientRect()
    const tabBox = tab.getBoundingClientRect()
    const start = tabBox.left - rowBox.left + row.scrollLeft
    const end = start + tabBox.width
    if (start < row.scrollLeft) row.scrollLeft = start
    else if (end > row.scrollLeft + row.clientWidth - fade) {
      row.scrollLeft = end - row.clientWidth + fade
    }
  }, [pathname])
  return (
    <nav ref={nav} className="spine-tabs" aria-label={`${spine.name} sections`}>
      {games && (
        <NavLink to={spine.tabs.games.to}>{spine.tabs.games.label}</NavLink>
      )}
      {comics && (
        <NavLink to={spine.tabs.comics.to}>{spine.tabs.comics.label}</NavLink>
      )}
      <NavLink to={spine.tabs.next.to}>{spine.tabs.next.label}</NavLink>
      <NavLink to={spine.tabs.year.to}>{spine.tabs.year.label}</NavLink>
      <NavLink to={how.to}>
        {how.label}
        {how.badge && <span className="spine-tab-badge"> {how.badge}</span>}
      </NavLink>
      <NavLink to={spine.tabs.daily.to}>{spine.tabs.daily.label}</NavLink>
    </nav>
  )
}
