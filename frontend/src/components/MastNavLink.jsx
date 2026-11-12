import { Link, useLocation, useMatch } from 'react-router'

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
 */
export default function MastNavLink({ item, onClick }) {
  const { pathname } = useLocation()
  const owned = (item.also ?? []).some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  )
  const own = useMatch({ path: item.to, end: item.end ?? false })
  const current = Boolean(own) || owned
  return (
    <Link
      to={item.to}
      className={current ? 'active' : undefined}
      aria-current={current ? 'page' : undefined}
      onClick={onClick}
    >
      {item.label}
    </Link>
  )
}
