import { Link, useLocation, useMatch } from 'react-router'
import { cx } from '../lib/cx.js'

/**
 * The bar's link look: the full height of the bar, so the 2px underline sits
 * on the masthead's hairline whatever the line height. The current page takes
 * a heavier word and the accent bar, so colour never carries it alone.
 */
const BAR =
  'flex items-center whitespace-nowrap border-y-2 border-y-transparent text-foreground hover:underline hover:decoration-primary hover:underline-offset-[0.2em] focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring'
const BAR_CURRENT = 'border-b-primary font-semibold'

/**
 * One masthead link. A NavLink marks itself current only under its own
 * path, so an item can list `also` paths it owns: My Shelf owns /daily, a
 * shelf tab that lives outside /shelf (#192). On one of those the link is
 * current too. NavLink cannot do that (it sets aria-current only when its own
 * path matches), so this is a Link that matches the way NavLink does and sets
 * the same class and aria-current.
 *
 * @param {object} props
 * @param {{to: string, label: string, end?: boolean, also?: string[]}} props.item
 * @param {() => void} [props.onClick]
 * @param {'bar'} [props.variant] `bar` draws the masthead's text link; left
 *   out, the sheet around the link styles it (`NavSheet`).
 */
export default function MastNavLink({ item, onClick, variant }) {
  const { pathname } = useLocation()
  const owned = (item.also ?? []).some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  )
  const own = useMatch({ path: item.to, end: item.end ?? false })
  const current = Boolean(own) || owned
  return (
    <Link
      to={item.to}
      className={
        cx(
          current && 'active',
          variant === 'bar' && BAR,
          variant === 'bar' && current && BAR_CURRENT,
        ) || undefined
      }
      aria-current={current ? 'page' : undefined}
      onClick={onClick}
    >
      {item.label}
    </Link>
  )
}
