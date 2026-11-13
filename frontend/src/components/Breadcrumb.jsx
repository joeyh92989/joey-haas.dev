import { Link } from 'react-router'

/**
 * The trail every detail page opens with: "My Shelf / Comics / Saga / #5".
 * A `nav` with a name, an ordered list, and the last item marked as the
 * current page. An item with a `to` is a link; the last is text. The
 * separators are CSS generated content (`.crumbs li + li::before`) with an
 * empty alternative text, so screen readers do not announce them.
 *
 * @param {object} props
 * @param {{label: string, to?: string}[]} props.trail - Root first, the
 *   current page last. A last item with a `to`
 *   is a link, not the current page (the trail of a page still loading).
 * @param {string} [props.label] - The nav's accessible name.
 */
export default function Breadcrumb({ trail, label = 'Breadcrumb' }) {
  const last = trail.length - 1
  return (
    <nav aria-label={label} className="crumbs">
      <ol>
        {trail.map((crumb, i) =>
          i === last && !crumb.to ? (
            <li key={i} aria-current="page">
              {crumb.label}
            </li>
          ) : (
            <li key={i}>
              <Link to={crumb.to}>{crumb.label}</Link>
            </li>
          ),
        )}
      </ol>
    </nav>
  )
}
