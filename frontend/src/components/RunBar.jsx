import { spine } from '../content/spine.js'
import { runLabel } from '../lib/comics.js'

const { run: RUN } = spine.comics

/**
 * A series' run as one proportional bar: owned, missing and, for a series
 * still coming out, a hatched tail of issues not out yet. The segments come
 * from the API (comics.run_summary) and are drawn in order, so the bar never
 * re-derives the run.
 *
 * A non-text mark with a name, so `role="img"` and an `aria-label` stating
 * owned of released; the legend (RunLegend) names the fills once per list.
 *
 * @param {object} props
 * @param {{kind: string, length: number}[]} props.segments
 * @param {number} props.owned
 * @param {number} props.released
 * @param {boolean} props.ongoing
 * @param {string} [props.className]
 */
export default function RunBar({ segments, owned, released, ongoing, className }) {
  return (
    <span
      className={className ? `run ${className}` : 'run'}
      role="img"
      aria-label={runLabel({ owned, released, ongoing })}
    >
      {segments.map((segment, index) => (
        <i
          key={index}
          data-k={segment.kind}
          style={{ flexGrow: segment.length }}
        />
      ))}
    </span>
  )
}

/** The three fills, named once above a list of run bars. */
export function RunLegend() {
  return (
    <ul className="run-legend" aria-label="Run bar key">
      {['owned', 'missing', 'upcoming'].map((kind) => (
        <li key={kind}>
          <i data-k={kind} aria-hidden="true" />
          {RUN[kind]}
        </li>
      ))}
    </ul>
  )
}
