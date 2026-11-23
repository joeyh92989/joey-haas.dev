import {
  TOUR_BAR,
  TOUR_BAR_FILL,
  TOUR_BAR_ROW,
  TOUR_BAR_VALUE,
} from './tourClasses.js'
/**
 * One scored term as a bar: label, a 0–100 fill and the number. The bar is
 * drawn only; the number beside it carries the value.
 */
export default function BarRow({ label, value }) {
  const width = `${Math.min(Math.max(value, 0), 100)}%`
  return (
    <div className={`tour-bar-row ${TOUR_BAR_ROW}`}>
      <span className="tour-bar-label">{label}</span>
      <span className={`tour-bar ${TOUR_BAR}`} aria-hidden="true">
        <span className={`tour-bar-fill ${TOUR_BAR_FILL}`} style={{ width }} />
      </span>
      <span className={`tour-bar-value ${TOUR_BAR_VALUE}`}>{value}</span>
    </div>
  )
}
