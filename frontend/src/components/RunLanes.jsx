import { spine } from '../content/spine.js'
import {
  LANE,
  LANE_AXIS_LABEL,
  LANE_NAME,
  LANE_PRIVATE,
  LANE_SPAN,
  LANE_TAIL,
  LANE_TAIL_MARK,
  LANE_TAIL_THIN,
  LANE_TRACK,
  LANE_TRACK_AXIS,
  LANE_TRACK_THIN,
  RUN_KEY,
  RUN_KEY_ITEM,
  RUN_KEY_SWATCH,
  lanesClass,
} from './comicClasses.js'

const { run: RUN } = spine.comics

/** Axis tick spacing for a run of this length. */
function tickStep(released) {
  if (released <= 60) return 10
  if (released <= 160) return 25
  return 50
}

/** The issue numbers the axis labels: 1, the steps, and the last. */
export function axisTicks(released) {
  const step = tickStep(released)
  const ticks = [1]
  for (let n = step; n < released - step / 2; n += step) {
    if (n > 1) ticks.push(n)
  }
  if (released > 1) ticks.push(released)
  return ticks
}

const pct = (value) => `${value * 100}%`

/** One span on a lane, placed by issue number on the shared axis. */
function Span({ span, released, k = span.k }) {
  return (
    <i
      className={LANE_SPAN[k]}
      data-k={k}
      style={{
        left: pct((span.from - 1) / released),
        width: pct((span.to - span.from + 1) / released),
      }}
    />
  )
}

function Lane({ name, thin, tail, children, note }) {
  return (
    <div className={`lane ${LANE}`} data-thin={thin ? '' : undefined}>
      {/* Always rendered, empty on a card, so every lane keeps its grid
          columns and the read lane lines up under the run. */}
      <span className={`lane-name ${LANE_NAME}`}>
        {name}
        {name && note && (
          <em className={`lane-private ${LANE_PRIVATE}`}> {note}</em>
        )}
      </span>
      <span className={`lane-track ${thin ? LANE_TRACK_THIN : LANE_TRACK}`}>
        {children}
      </span>
      <span className={`lane-tail ${thin ? LANE_TAIL_THIN : LANE_TAIL}`}>
        {tail && <i className={LANE_TAIL_MARK} data-k="upcoming" />}
      </span>
    </div>
  )
}

/**
 * A series' run as lanes on one axis: Run (owned, missing, and a hatched
 * tail of fixed width while the series is still coming out), then Read, a
 * thinner lane under it, so owned-but-unread is a position rather than a
 * second colour. The admin edit adds a dashed Skipped lane, marked private.
 *
 * The lanes look the same at 4 issues and 362. A short run (12 or fewer)
 * draws a block per issue. One `role="img"` carries the facts as its name;
 * the spans themselves are decorative.
 *
 * @param {object} props
 * @param {ReturnType<import('../lib/comicRun.js').laneSpans>} props.spans
 * @param {string} props.label - The facts, from `lanesLabel`.
 * @param {boolean} [props.mini] - The card's form: no names, no axis.
 * @param {boolean} [props.showSkipped] - Admin only: the Skipped lane.
 */
export default function RunLanes({ spans, label, mini = false, showSkipped }) {
  const { released, run, readTo, skipped, tail, short } = spans
  if (!released) return null
  const name = (text) => (mini ? undefined : text)
  return (
    <div
      className={`lanes ${lanesClass({
        mini,
        tail: Boolean(tail),
        secret: Boolean(showSkipped && skipped.length > 0),
      })}`}
      data-mini={mini ? '' : undefined}
      data-tail={tail ? '' : undefined}
      data-private={showSkipped && skipped.length > 0 ? '' : undefined}
      role="img"
      aria-label={label}
    >
      <Lane name={name(RUN.lanes.run)} tail={tail}>
        {run.map((span) => (
          <Span key={span.from} span={span} released={released} />
        ))}
      </Lane>
      {showSkipped && skipped.length > 0 && (
        <Lane name={name(RUN.lanes.skipped)} note={RUN.private}>
          {skipped.map((span) => (
            <Span key={span.from} span={span} released={released} />
          ))}
        </Lane>
      )}
      <Lane name={name(RUN.lanes.read)} thin>
        {readTo > 0 && (
          <Span
            span={{ from: 1, to: readTo }}
            released={released}
            k="readbar"
          />
        )}
      </Lane>
      {!mini && !short && (
        <div className={`lane ${LANE}`} data-axis="">
          <span className={`lane-name ${LANE_NAME}`} />
          <span className={`lane-track ${LANE_TRACK_AXIS}`}>
            {axisTicks(released).map((n) => (
              <b
                key={n}
                className={LANE_AXIS_LABEL}
                style={{ left: pct((n - 0.5) / released) }}
              >
                {n}
              </b>
            ))}
          </span>
          <span className={`lane-tail ${LANE_TAIL}`} />
        </div>
      )}
    </div>
  )
}

const LANE_KEY = [
  ['owned', RUN.owned],
  ['missing', RUN.missing],
  ['upcoming', RUN.upcoming],
  ['readbar', RUN.read],
]

const BOX_KEY = [
  ['read', RUN.readCell],
  ['owned', RUN.ownedCell],
  ['missing', RUN.missing],
  ['upcoming', RUN.upcoming],
]

/**
 * The marks, named once: for the lanes (a shelf list, a run card) or for
 * the box's cells and books. The admin edit adds Skipped.
 *
 * @param {object} props
 * @param {'lanes'|'box'} [props.variant]
 * @param {boolean} [props.showSkipped]
 */
export function RunKey({ variant = 'lanes', showSkipped = false }) {
  const keys = variant === 'box' ? BOX_KEY : LANE_KEY
  const swatches = RUN_KEY_SWATCH[variant === 'box' ? 'box' : 'lanes']
  return (
    <ul
      className={`run-key ${RUN_KEY}`}
      data-variant={variant}
      aria-label={RUN.key}
    >
      {keys.map(([k, word]) => (
        <li key={k} className={RUN_KEY_ITEM}>
          <i className={swatches[k]} data-k={k} aria-hidden="true" />
          {word}
        </li>
      ))}
      {showSkipped && (
        <li className={RUN_KEY_ITEM}>
          <i className={swatches.skip} data-k="skip" aria-hidden="true" />
          {RUN.skippedKey}
        </li>
      )}
      {variant === 'box' && (
        <li className={RUN_KEY_ITEM}>
          <i className={swatches.book} data-k="book" aria-hidden="true" />
          {RUN.edition}
        </li>
      )}
    </ul>
  )
}
