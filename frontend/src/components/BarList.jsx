/**
 * A ranked list with proportional bars: label, bar, number. The bar is
 * scaled to the list's largest count and hidden from screen readers, which
 * read the label and the number.
 *
 * @param {object} props
 * @param {string} props.label An accessible name for the list.
 * @param {{value: string, count: number}[]} props.rows In display order.
 * @param {(value: string) => string} [props.name] The label for a value.
 */
export default function BarList({ label, rows, name = (value) => value }) {
  if (!rows.length) return <p className="muted">None yet.</p>
  const largest = Math.max(...rows.map((row) => row.count))
  return (
    <ul className="bar-list" aria-label={label}>
      {rows.map((row) => (
        <li key={row.value}>
          <span className="bar-list-label">{name(row.value)}</span>
          <span className="bar-list-track" aria-hidden="true">
            <span
              className="bar-list-fill"
              style={{
                width: `${largest ? (row.count / largest) * 100 : 0}%`,
              }}
            />
          </span>
          <span className="bar-list-count">{row.count}</span>
        </li>
      ))}
    </ul>
  )
}
