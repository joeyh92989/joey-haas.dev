import { useId } from 'react'
import { Link } from 'react-router'

/**
 * One area on admin Home: its name, a link to its home page, the one thing
 * that matters today, a few figures and at most two actions. The heading
 * names the region.
 *
 * @param {object} props
 * @param {string} props.title The area's name.
 * @param {string} props.to The area's home page.
 * @param {string} props.linkLabel The link's words, e.g. "Play Next".
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
    <section className="area-card" aria-labelledby={id}>
      <header className="area-card-head">
        <h2 id={id}>{title}</h2>
        <Link to={to}>
          {linkLabel} <span aria-hidden="true">→</span>
        </Link>
      </header>
      {lead}
      {figures.length > 0 && (
        <dl className="area-card-figures">
          {figures.map((figure) => (
            <div key={figure.label}>
              <dt>{figure.label}</dt>
              <dd>{figure.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {actions && <div className="area-card-actions">{actions}</div>}
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
    <div className={cover ? 'area-card-lead with-cover' : 'area-card-lead'}>
      {cover && <div className="area-card-cover">{cover}</div>}
      <div>
        <p className="area-card-title">{title}</p>
        {meta && <p className="area-card-meta">{meta}</p>}
      </div>
    </div>
  )
}
