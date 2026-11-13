import { Link } from 'react-router'
import { spine } from '../content/spine.js'
import SpineTabs from './SpineTabs.jsx'

/**
 * The shelf's area band, shared by every shelf list page (Games, Comics,
 * What's next, Year in review, Tour, Daily game): the name at display size,
 * the tagline, the tab row and a hairline rule. It is never the page's h1:
 * each page puts its own `PageHeader` below, so each page has exactly one
 * (docs/design-system.md → Page types).
 */
export default function SpineHeader() {
  return (
    <div className="spine-header">
      <p className="spine-name">
        <Link to={spine.path}>{spine.name}</Link>
      </p>
      <p className="spine-lede">{spine.tagline}</p>
      <SpineTabs />
    </div>
  )
}
