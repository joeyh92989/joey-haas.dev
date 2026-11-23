import { Link } from 'react-router'
import { spine } from '../content/spine.js'
import ShelfByline from './ShelfByline.jsx'
import SpineTabs from './SpineTabs.jsx'
import {
  SPINE_HEADER,
  SPINE_LEDE,
  SPINE_NAME,
  SPINE_NAME_LINK,
} from './sharedClasses.js'

/**
 * The shelf's area band, shared by every shelf list page (Games, Comics,
 * What's next, Year in review, Tour, Daily game): the name at display size,
 * the byline (whose shelf, and a link back to the site), the tagline, the tab row and a hairline rule. It is never the page's h1:
 * each page puts its own `PageHeader` below, so each page has exactly one
 * (docs/design-system.md → Page types).
 */
export default function SpineHeader() {
  return (
    <div className={`spine-header ${SPINE_HEADER}`}>
      <p className={`spine-name ${SPINE_NAME}`}>
        <Link to={spine.path} className={SPINE_NAME_LINK}>
          {spine.name}
        </Link>
      </p>
      <ShelfByline className="mt-1 mb-0 flex flex-wrap items-baseline gap-x-2 text-[0.8125rem] text-muted-foreground" />
      <p className={`spine-lede ${SPINE_LEDE}`}>{spine.tagline}</p>
      <SpineTabs />
    </div>
  )
}
