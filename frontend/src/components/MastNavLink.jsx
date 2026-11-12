import { Link, NavLink, useLocation } from 'react-router'

/**
 * One masthead link. A NavLink marks itself current only under its own
 * path, so an item can list `also` paths it owns: My Shelf owns /daily, a
 * shelf tab that lives outside /shelf (#192). On one of those the link is
 * drawn current by hand, with the same class and aria-current NavLink sets.
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
  if (owned) {
    return (
      <Link
        to={item.to}
        className="active"
        aria-current="page"
        onClick={onClick}
      >
        {item.label}
      </Link>
    )
  }
  return (
    <NavLink to={item.to} end={item.end} onClick={onClick}>
      {item.label}
    </NavLink>
  )
}
