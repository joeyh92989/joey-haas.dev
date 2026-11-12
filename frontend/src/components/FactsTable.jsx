/**
 * Home's facts table: short label and value pairs in a bordered box, beside
 * the hero on a desktop and under it on a phone. A description list, so a
 * screen reader pairs each value with its label.
 *
 * @param {object} props
 * @param {{label: string, value: import('react').ReactNode}[]} props.rows
 */
export default function FactsTable({ rows }) {
  return (
    <dl className="facts">
      {rows.map((row) => (
        <div key={row.label}>
          <dt>{row.label}</dt>
          <dd>{row.value}</dd>
        </div>
      ))}
    </dl>
  )
}
