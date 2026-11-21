import { useId } from 'react'
import { box } from './denverSiteClasses.js'
import { cx } from '../lib/cx.js'

/**
 * A titled card for the Denver and Site admin pages: the Card look, a header
 * with the heading and an optional action beside it, then the body. The
 * heading names the region. It never clips (no `overflow`), so a ring on a
 * control at its edge is not cut off.
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
    <section className={cx(box, 'min-w-0')} aria-labelledby={id}>
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
