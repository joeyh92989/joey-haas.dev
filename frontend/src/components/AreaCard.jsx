import { useId } from 'react'
import { Link } from 'react-router'
import {
  AREA_ACTIONS,
  AREA_CARD,
  AREA_COVER,
  AREA_FIGURES,
  AREA_HEAD,
  AREA_LEAD_COVER,
  AREA_META,
  AREA_TITLE,
  AREA_TITLE_H2,
  LINK,
} from './adminHomeClasses.js'

/**
 * One area on admin Home: its name, a link to its home page, the one thing
 * that matters today, a few figures and at most two actions. The heading
 * names the region.
 *
 * @param {object} props
 * @param {string} props.title The area's name.
 * @param {string} props.to The area's home page.
 * @param {string} props.linkLabel The link's words, e.g. "Play next".
 * @param {import('react').ReactNode} [props.lead] The one thing today.
 * @param {Array<{label: string, value: import('react').ReactNode}>} [props.figures]
 * @param {import('react').ReactNode} [props.actions] Buttons or links.
 */
export default function AreaCard({
  title,
  to,
  linkLabel,
  lead,
  figures = [],
  actions,
}) {
  const id = useId()
  return (
    <section className={`area-card ${AREA_CARD}`} aria-labelledby={id}>
      <header className={`area-card-head ${AREA_HEAD}`}>
        <h2 id={id} className={AREA_TITLE_H2}>
          {title}
        </h2>
        <Link to={to} className={LINK}>
          {linkLabel} <span aria-hidden="true">→</span>
        </Link>
      </header>
      {lead}
      {figures.length > 0 && (
        <dl className={`area-card-figures ${AREA_FIGURES}`}>
          {figures.map((figure) => (
            <div key={figure.label}>
              <dt>{figure.label}</dt>
              <dd>{figure.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {actions && (
        <div className={`area-card-actions ${AREA_ACTIONS}`}>{actions}</div>
      )}
    </section>
  )
}

/**
 * A card's lead: an optional cover, a title line and a line of detail.
 *
 * @param {object} props
 * @param {import('react').ReactNode} [props.cover]
 * @param {import('react').ReactNode} props.title
 * @param {import('react').ReactNode} [props.meta]
 */
export function AreaLead({ cover, title, meta }) {
  return (
    <div
      className={
        cover
          ? `area-card-lead with-cover ${AREA_LEAD_COVER}`
          : 'area-card-lead'
      }
    >
      {cover && <div className={`area-card-cover ${AREA_COVER}`}>{cover}</div>}
      <div>
        <p className={`area-card-title ${AREA_TITLE}`}>{title}</p>
        {meta && <p className={`area-card-meta ${AREA_META}`}>{meta}</p>}
      </div>
    </div>
  )
}
