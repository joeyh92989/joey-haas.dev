import { Link } from 'react-router'

// The trail's look (#533), in utilities so the component stays eager-safe: no
// Base UI, no `cn`. The slash is generated content with an empty alternative
// text, so a screen reader does not announce it. The `crumbs` class names
// stay as hooks for tests and the styles of other pages.
const LIST =
  "m-0 mb-3 flex list-none flex-wrap gap-x-2 gap-y-1 p-0 text-[0.8125rem] text-muted-foreground [&_li+li]:before:mr-2 [&_li+li]:before:text-muted-foreground [&_li+li]:before:content-['/'_/_''] [&_li[aria-current]]:text-foreground [&_li[aria-current]]:font-medium [&_li]:max-w-full [&_li]:min-w-0 [&_li]:[overflow-wrap:anywhere]"
const BAR =
  'flex flex-wrap items-center justify-between gap-x-3 gap-y-1 [&>nav]:max-w-full [&>nav]:min-w-0'
const END = 'flex-none text-[0.8125rem]'

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
 * @param {import('react').ReactNode} [props.end] - A control to the right
 *   of the trail (the owner's Edit link). It sits beside the `nav`, not in
 *   it, so the landmark stays a trail.
 */
export default function Breadcrumb({
  trail,
  label = 'Breadcrumb',
  end = null,
}) {
  const last = trail.length - 1
  const nav = (
    <nav aria-label={label} className="crumbs">
      <ol className={LIST}>
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
  if (!end) return nav
  return (
    <div className={`crumbs-bar ${BAR}`}>
      {nav}
      <div className={`crumbs-end ${END}`}>{end}</div>
    </div>
  )
}
