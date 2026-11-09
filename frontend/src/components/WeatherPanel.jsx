import Panel from './Panel.jsx'
import { StatusText } from './JobStatusRow.jsx'

/**
 * The wet hours as runs of labels: "10a–4p, 7p". Hours are consecutive
 * in the view, so a run is a stretch of wet neighbours.
 */
export function wetRuns(hours) {
  const runs = []
  let start = null
  hours.forEach((hour, i) => {
    if (hour.wet && start === null) start = i
    const ends = start !== null && (!hour.wet || i === hours.length - 1)
    if (!ends) return
    const last = hour.wet ? i : i - 1
    runs.push(
      last === start
        ? hours[start].label
        : `${hours[start].label}–${hours[last].label}`,
    )
    start = null
  })
  return runs
}

/** A bar's height in percent: the day's temperatures over the weekend's
 * range, never below a sliver so a cold hour still shows. */
function height(temp, range) {
  const [lo, hi] = range
  if (hi <= lo) return 60
  return Math.round(20 + ((temp - lo) / (hi - lo)) * 80)
}

/**
 * One day of the weekend's forecast, 8 am to 8 pm: thirteen temperature
 * bars in `--chart`, the hours likely wet hatched, high and low, and the
 * ride verdict. The bars are decoration for the words beside them: the
 * strip is one image whose name says the range and the wet hours, and the
 * verdict carries the colour as a dot beside its text, never alone.
 *
 * @param {object} props
 * @param {object} props.day `planner.day_view`: date, name, high, low,
 *   summary, hours and verdict.
 * @param {[number, number]} [props.range] The weekend's low and high, so
 *   two days' bars share a scale.
 */
export default function WeatherPanel({ day, range }) {
  const hours = day.hours ?? []
  const scale = range ?? [day.low ?? 0, day.high ?? 0]
  const wet = wetRuns(hours)
  const date = new Date(`${day.date}T12:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
  const label =
    hours.length === 0
      ? null
      : `Temperatures from ${hours[0].label} to ${hours[hours.length - 1].label}, ` +
        `${day.low}° to ${day.high}°` +
        (wet.length ? `; wet ${wet.join(', ')}` : '; dry all day')

  return (
    <Panel
      title={`${day.name} · ${date}`}
      action={
        day.high === null ? null : (
          <span className="wx-range">
            {day.high}° / {day.low}°
          </span>
        )
      }
      className="wx"
    >
      {label && (
        <>
          <div className="wx-bars" role="img" aria-label={label}>
            {hours.map((hour) => (
              <i
                key={hour.hour}
                className={hour.wet ? 'wet' : undefined}
                style={{ height: `${height(hour.temp_f, scale)}%` }}
              />
            ))}
          </div>
          <div className="wx-axis" aria-hidden="true">
            <span>8a</span>
            <span>noon</span>
            <span>4p</span>
            <span>8p</span>
          </div>
        </>
      )}
      {day.summary && (
        <p className="wx-summary">
          {day.summary}
          {wet.length > 0 && <> · Wet {wet.join(', ')}</>}
        </p>
      )}
      <p className="wx-verdict">
        <StatusText state={day.verdict.state === 'ok' ? 'ok' : 'stale'}>
          {day.verdict.text}
        </StatusText>
      </p>
    </Panel>
  )
}
