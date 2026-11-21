import { useId } from 'react'
import {
  PANEL,
  PANEL_ACTION,
  PANEL_BODY,
  PANEL_HEAD,
  PANEL_TITLE,
} from './adminHomeClasses.js'

/**
 * A bordered surface with a titled header bar: the Dashboard's jobs, quick
 * actions and recent changes. The heading names the region.
 *
 * @param {object} props
 * @param {string} props.title The panel's heading.
 * @param {import('react').ReactNode} [props.action] A link at the right of
 *   the header bar.
 * @param {string} [props.className] Extra classes for the body.
 * @param {import('react').ReactNode} props.children The body.
 */
export default function Panel({ title, action, className, children }) {
  const id = useId()
  return (
    <section className={`panel ${PANEL}`} aria-labelledby={id}>
      <header className={`panel-head ${PANEL_HEAD} ${PANEL_ACTION}`}>
        <h2 id={id} className={PANEL_TITLE}>
          {title}
        </h2>
        {action}
      </header>
      <div
        className={
          className
            ? `panel-body ${PANEL_BODY} ${className}`
            : `panel-body ${PANEL_BODY}`
        }
      >
        {children}
      </div>
    </section>
  )
}
