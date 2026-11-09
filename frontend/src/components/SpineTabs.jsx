import { NavLink } from 'react-router'
import { spine } from '../content/spine.js'

/**
 * Collection · Comics · What's next · Year in review · How it works · Daily,
 * under the My Shelf name on each page (Spine Next spec, C13; Daily from the
 * daily puzzle spec, the one tab outside /shelf). Links, not ARIA tabs: each is its own
 * page with its own URL. Year in review stays current on every year's page.
 * A tab's optional `badge` is read as part of its name; none carries one now.
 */
export default function SpineTabs() {
  const { how } = spine.tabs
  return (
    <nav className="spine-tabs" aria-label={`${spine.name} sections`}>
      <NavLink to={spine.tabs.shelf.to} end>
        {spine.tabs.shelf.label}
      </NavLink>
      <NavLink to={spine.tabs.comics.to}>{spine.tabs.comics.label}</NavLink>
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
