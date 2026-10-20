/**
 * One headline figure: a mono label, the number, and an optional line of
 * detail under it. Tiles go inside `StatTiles`, which is the description
 * list that gives each label its value.
 *
 * @param {object} props
 * @param {string} props.label What is counted.
 * @param {import('react').ReactNode} props.value The figure.
 * @param {import('react').ReactNode} [props.detail] A line of context.
 */
export default function StatTile({ label, value, detail }) {
  return (
    <div className="stat-tile">
      <dt className="kicker">{label}</dt>
      <dd className="stat-value">{value}</dd>
      {detail && <dd className="stat-detail">{detail}</dd>}
    </div>
  )
}

/**
 * A row of tiles: four across on a desktop, two on a phone.
 *
 * @param {object} props
 * @param {string} [props.label] An accessible name for the row.
 * @param {import('react').ReactNode} props.children `StatTile`s.
 */
export function StatTiles({ label, children }) {
  return (
    <dl className="stat-tiles" aria-label={label}>
      {children}
    </dl>
  )
}
