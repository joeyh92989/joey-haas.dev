/**
 * One headline figure: a mono label, the number, and an optional line of
 * detail under it. Tiles go inside `StatTiles`, which is the description
 * list that gives each label its value.
 *
 * `children` is a composite value (a rating, a few labelled rows) in place
 * of `value`: it sits in a column of small lines, and the label drops the
 * kicker for the quieter `figures` look the item page uses.
 *
 * @param {object} props
 * @param {string} props.label What is counted.
 * @param {import('react').ReactNode} [props.value] The figure.
 * @param {import('react').ReactNode} [props.detail] A line of context.
 * @param {import('react').ReactNode} [props.children] A composite value.
 */
export default function StatTile({ label, value, detail, children }) {
  if (children != null) {
    return (
      <div className="stat-tile stat-tile-figures">
        <dt>{label}</dt>
        <dd>{children}</dd>
      </div>
    )
  }
  return (
    <div className="stat-tile">
      <dt className="kicker">{label}</dt>
      <dd className="stat-value">{value}</dd>
      {detail && <dd className="stat-detail">{detail}</dd>}
    </div>
  )
}

/**
 * A row of tiles: four across on a desktop, two on a narrow screen. The
 * name sits on a group around the list, since a bare <dl> takes no label.
 *
 * @param {object} props
 * @param {string} [props.label] An accessible name for the row.
 * @param {boolean} [props.figures] Tiles hold composite `children`: fit as
 *   many as the width allows rather than four across.
 * @param {import('react').ReactNode} props.children `StatTile`s.
 */
export function StatTiles({ label, figures = false, children }) {
  return (
    <div role="group" aria-label={label}>
      <dl className={figures ? 'stat-tiles stat-tiles-figures' : 'stat-tiles'}>
        {children}
      </dl>
    </div>
  )
}
