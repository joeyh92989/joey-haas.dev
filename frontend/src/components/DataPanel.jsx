import { useId } from 'react'
import { PANEL, PANEL_HEAD } from './adminDataClasses.js'

/**
 * A titled panel on the admin data pages (#535): the card the cover wall
 * draws, with the heading naming the region. `Panel` stays for the areas not
 * yet migrated (#536).
 *
 * @param {object} props
 * @param {string} props.title The panel's heading.
 * @param {string} [props.className] Extra classes for the body.
 * @param {import('react').ReactNode} props.children The body.
 */
export default function DataPanel({ title, className = '', children }) {
  const id = useId()
  return (
    <section className={PANEL} aria-labelledby={id}>
      <h2 id={id} className={PANEL_HEAD}>
        {title}
      </h2>
      <div className={className}>{children}</div>
    </section>
  )
}
