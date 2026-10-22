/**
 * One scored term as a bar: label, a 0–100 fill and the number. The bar is
 * drawn only; the number beside it carries the value.
 */
export default function BarRow({ label, value }) {
  const width = `${Math.min(Math.max(value, 0), 100)}%`
  return (
    <div className="tour-bar-row">
      <span className="tour-bar-label">{label}</span>
      <span className="tour-bar" aria-hidden="true">
        <span className="tour-bar-fill" style={{ width }} />
      </span>
      <span className="tour-bar-value">{value}</span>
    </div>
  )
}
