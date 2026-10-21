import { NavLink } from 'react-router'
import { spine } from '../content/spine.js'

/**
 * Shelf · What's next · Year in review · How it works, under the Spine name
 * on each page (Spine Next spec, C13). Links, not ARIA tabs: each is its own
 * page with its own URL. Year in review stays current on every year's page.
 * A tab's `badge` is read as part of its name ("How it works New").
 */
export default function SpineTabs() {
  const { how } = spine.tabs
  return (
    <nav className="spine-tabs" aria-label="Spine sections">
      <NavLink to={spine.tabs.shelf.to} end>
        {spine.tabs.shelf.label}
      </NavLink>
      <NavLink to={spine.tabs.next.to}>{spine.tabs.next.label}</NavLink>
      <NavLink to={spine.tabs.year.to}>{spine.tabs.year.label}</NavLink>
      <NavLink to={how.to}>
        {how.label}
        {how.badge && <span className="spine-tab-badge"> {how.badge}</span>}
      </NavLink>
    </nav>
  )
}
