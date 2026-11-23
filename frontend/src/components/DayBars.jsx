import { PEAK_CAPTION } from '../content/stats.js'
import { counted, dayLabel } from '../lib/analytics.js'
import { cx } from '../lib/cx.js'
import {
  DAY_BAR,
  DAY_BARS_AXIS,
  DAY_BARS_CHART,
  DAY_BARS_PEAK,
} from './overview-classes.js'

/** Most axis labels under the chart; the rest of the days go unlabelled. */
const AXIS_LABELS = 5

/**
 * Up to AXIS_LABELS evenly spaced positions, always the first and the last.
 *
 * @param {number} length The number of days.
 */
function axisPositions(length) {
  if (length <= AXIS_LABELS) return [...Array(length).keys()]
  const step = (length - 1) / (AXIS_LABELS - 1)
  return [...Array(AXIS_LABELS).keys()].map((n) => Math.round(n * step))
}

/**
 * The views-per-day chart: one bar per UTC day, all in the chart colour. The
 * busiest day is the latest on a tie, as the Best day tile has it. Each bar
 * is named for a screen reader, and a visually hidden table holds the same
 * figures to read in order. The caption names the busiest day and its count,
 * so the peak is told in words rather than by colour, and the bars carry no
 * scale.
 *
 * @param {object} props
 * @param {{day: string, views: number}[]} props.series Oldest first.
 */
export default function DayBars({ series }) {
  const highest = Math.max(0, ...series.map((point) => point.views))
  const peak = highest ? series.findLastIndex((p) => p.views === highest) : -1
  const axis = axisPositions(series.length)

  return (
    <div className="day-bars">
      <div className={cx('day-bars-chart', DAY_BARS_CHART)}>
        {series.map((point) => (
          <span
            key={point.day}
            role="img"
            aria-label={`${dayLabel(point.day, { weekday: true })}: ${counted(point.views, 'view')}`}
            className={cx('day-bar', DAY_BAR)}
            style={{
              height: `${highest ? (point.views / highest) * 100 : 0}%`,
            }}
          />
        ))}
      </div>
      <div className={cx('day-bars-axis', DAY_BARS_AXIS)} aria-hidden="true">
        {axis.map((index) => (
          <span key={series[index].day}>{dayLabel(series[index].day)}</span>
        ))}
      </div>
      {peak >= 0 && (
        <p className={cx('day-bars-peak', DAY_BARS_PEAK)}>
          {PEAK_CAPTION(dayLabel(series[peak].day, { weekday: true }), highest)}
        </p>
      )}
      <table className="visually-hidden border-separate">
        <caption>Views per UTC day</caption>
        <thead>
          <tr>
            <th scope="col">Day</th>
            <th scope="col">Views</th>
          </tr>
        </thead>
        <tbody>
          {series.map((point) => (
            <tr key={point.day}>
              <td>{dayLabel(point.day, { weekday: true })}</td>
              <td>{point.views}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
