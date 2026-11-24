import { useId } from 'react'
import { box } from './siteAdminClasses.js'
import { cx } from '../lib/cx.js'

/**
 * A titled card for the Site admin pages: the Card look, a header
 * with the heading and an optional action beside it, then the body. The
 * heading names the region. `mt-0` is there because the global
 * `section + section` rule would otherwise add a gap the page's own grid
 * already makes (utilities sit above that sheet, so no `!`). It never clips
 * (no `overflow`), so a ring on a control at its edge is not cut off.
 *
 * @param {object} props
 * @param {string} props.title The card's heading.
 * @param {import('react').ReactNode} [props.action] At the right of the header.
 * @param {string} [props.className] Extra classes for the body.
 * @param {import('react').ReactNode} props.children The body.
 */
export default function SectionCard({ title, action, className, children }) {
  const id = useId()
  return (
    <section className={cx(box, 'mt-0 min-w-0')} aria-labelledby={id}>
      <header className="flex items-center justify-between gap-3 border-b border-line-card px-4 py-3">
        <h2 id={id} className="m-0 text-sm font-medium">
          {title}
        </h2>
        {action}
      </header>
      <div className={cx('p-4', className)}>{children}</div>
    </section>
  )
}
