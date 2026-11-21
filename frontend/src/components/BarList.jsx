import { cx } from '../lib/cx.js'
import {
  BAR_COUNT,
  BAR_FILL,
  BAR_LABEL,
  BAR_LABEL_STACKED,
  BAR_LIST,
  BAR_ROW,
  BAR_ROW_STACKED,
  BAR_ROW_WIDE,
  BAR_TRACK,
} from './overview-classes.js'

/**
 * A ranked list with proportional bars: label, bar, number. The bar is
 * scaled to the list's largest count and hidden from screen readers, which
 * read the label and the number.
 *
 * @param {object} props
 * @param {string} props.label An accessible name for the list.
 * @param {{value: string, count: number}[]} props.rows In display order.
 * @param {(value: string) => string} [props.name] The label for a value.
 * @param {boolean} [props.stacked] Each row is the label above its bar and
 *   number, for a narrow column (the three lists on /stats).
 */
export default function BarList({
  label,
  rows,
  name = (value) => value,
  stacked = false,
}) {
  if (!rows.length) return <p className="muted">None yet.</p>
  const largest = Math.max(...rows.map((row) => row.count))
  return (
    <ul className={cx('bar-list', BAR_LIST)} aria-label={label}>
      {rows.map((row) => (
        <li
          key={row.value}
          className={cx(BAR_ROW, stacked ? BAR_ROW_STACKED : BAR_ROW_WIDE)}
        >
          <span
            className={cx(
              'bar-list-label',
              BAR_LABEL,
              stacked && BAR_LABEL_STACKED,
            )}
          >
            {name(row.value)}
          </span>
          <span className={cx('bar-list-track', BAR_TRACK)} aria-hidden="true">
            <span
              className={cx('bar-list-fill', BAR_FILL)}
              style={{
                width: `${largest ? (row.count / largest) * 100 : 0}%`,
              }}
            />
          </span>
          <span className={cx('bar-list-count', BAR_COUNT)}>{row.count}</span>
        </li>
      ))}
    </ul>
  )
}
