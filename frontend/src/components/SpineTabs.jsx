import { NavLink } from 'react-router'
import { spine } from '../content/spine.js'

/**
 * Shelf · What's next, under the Spine name on both pages (Spine Next spec,
 * C13). Links, not ARIA tabs: each is its own page with its own URL.
 */
export default function SpineTabs() {
  return (
    <nav className="spine-tabs" aria-label="Spine sections">
      <NavLink to={spine.tabs.shelf.to} end>
        {spine.tabs.shelf.label}
      </NavLink>
      <NavLink to={spine.tabs.next.to}>{spine.tabs.next.label}</NavLink>
    </nav>
  )
}
