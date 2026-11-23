import { Link } from 'react-router'
import { spine } from '../content/spine.js'
import Breadcrumb from './Breadcrumb.jsx'

const LINE =
  'm-0 mb-3 flex flex-wrap items-baseline gap-x-2 text-[0.8125rem] text-muted-foreground'
const SITE =
  'text-muted-foreground max-[700px]:inline-flex max-[700px]:min-h-11 max-[700px]:items-center'

/**
 * The one-line byline on every shelf page (#470): whose shelf it is, and a
 * quiet way back to the portfolio it sits in. A visitor who lands on a deep
 * link can name the owner without leaving the page.
 *
 * @param {object} props
 * @param {string} [props.className] - Replaces the default line spacing.
 */
export default function ShelfByline({ className }) {
  const { owner, site, to } = spine.byline
  return (
    <p className={`shelf-byline ${className ?? LINE}`}>
      <span>{owner}</span>
      <span aria-hidden="true">·</span>
      <Link to={to} className={SITE}>
        {site}
      </Link>
    </p>
  )
}

/**
 * A detail page's top: the byline, then the breadcrumb trail.
 *
 * @param {import('react').ComponentProps<typeof Breadcrumb>} props
 */
export function ShelfTrail(props) {
  return (
    <>
      <ShelfByline />
      <Breadcrumb {...props} />
    </>
  )
}
