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
 * A row of tiles: four across on a desktop, two on a narrow screen. The
 * name sits on a group around the list, since a bare <dl> takes no label.
 *
 * @param {object} props
 * @param {string} [props.label] An accessible name for the row.
 * @param {import('react').ReactNode} props.children `StatTile`s.
 */
export function StatTiles({ label, children }) {
  return (
    <div role="group" aria-label={label}>
      <dl className="stat-tiles">{children}</dl>
    </div>
  )
}
