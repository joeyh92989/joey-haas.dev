import { profile } from '../content/profile.js'
import { spine } from '../content/spine.js'
import BarRow from './BarRow.jsx'
import Capture, { CaptureFacts, CaptureTable } from './Capture.jsx'
import LiveBox from './LiveBox.jsx'
import {
  TOUR_CAPTURE_PICK,
  TOUR_CODE,
  TOUR_CODE_LINK,
  TOUR_LIVE_DOT,
  TOUR_STOP,
  TOUR_STOP_CLAIM,
  TOUR_STOP_COL,
  TOUR_STOP_COLS,
  TOUR_STOP_LINKS,
  TOUR_STOP_N,
  TOUR_STOP_WHY,
} from './tourClasses.js'

const copy = spine.how

/** The drawn half of a stop, from its `capture` copy. */
function StopCapture({ capture }) {
  return (
    <Capture url={capture.url} tag={capture.tag} note={capture.note}>
      {capture.facts && <CaptureFacts facts={capture.facts} />}
      {capture.terms && (
        <div>
          <p className={`tour-capture-pick ${TOUR_CAPTURE_PICK}`}>
            {capture.pick}
          </p>
          {capture.terms.map((term) => (
            <BarRow
              key={term.label}
              label={`${term.label} ×${term.weight}`}
              value={term.value}
            />
          ))}
        </div>
      )}
      {capture.rows && (
        <CaptureTable columns={capture.columns} rows={capture.rows} />
      )}
      {capture.code && (
        <pre
          className={`tour-code ${TOUR_CODE}`}
          tabIndex={0}
          aria-label="Code"
        >
          <code className="[font-family:monospace]">{capture.code}</code>
        </pre>
      )}
    </Capture>
  )
}

/**
 * One stop of the tour: number and route, the claim, the public result
 * beside the drawn signed-in tool, why it works that way, and the code.
 * `children` is the live content; a stop without it or a capture is brief.
 *
 * @param {object} props
 * @param {object} props.stop - One of spine.how.stops.
 * @param {import('react').ReactNode} [props.children] - The live box's body.
 */
export default function Stop({ stop, children }) {
  const hasLive = Boolean(stop.live)
  const columns = [hasLive, Boolean(stop.capture)].filter(Boolean).length
  return (
    <section
      id={`stop-${stop.n}`}
      className={`tour-stop ${TOUR_STOP}`}
      aria-labelledby={`stop-${stop.n}-title`}
    >
      <p className={`tour-stop-n ${TOUR_STOP_N}`}>
        {copy.stopLabel} {stop.n} · {stop.where}
      </p>
      <h2 id={`stop-${stop.n}-title`}>{stop.title}</h2>
      <p className={`tour-stop-claim ${TOUR_STOP_CLAIM}`}>{stop.claim}</p>
      {columns > 0 && (
        <div
          className={`tour-stop-cols ${TOUR_STOP_COLS}${columns === 1 ? ' one' : ''}`}
        >
          {hasLive && (
            <div className={`tour-stop-col ${TOUR_STOP_COL}`}>
              <h3>
                <span
                  className={`tour-live-dot ${TOUR_LIVE_DOT}`}
                  aria-hidden="true"
                />
                {copy.live}
              </h3>
              <LiveBox caption={stop.live.caption}>{children}</LiveBox>
            </div>
          )}
          {stop.capture && (
            <div className={`tour-stop-col ${TOUR_STOP_COL}`}>
              <h3>{copy.behind}</h3>
              <StopCapture capture={stop.capture} />
            </div>
          )}
        </div>
      )}
      {stop.why && (
        <p className={`tour-stop-why ${TOUR_STOP_WHY}`}>
          <strong>{stop.why.lead}</strong> {stop.why.text}
        </p>
      )}
      <p className={`tour-stop-links ${TOUR_STOP_LINKS}`}>
        {stop.code.map((path) => (
          <a
            key={path}
            className={`tour-code-link ${TOUR_CODE_LINK}`}
            href={`${profile.repo}/blob/main/${path}`}
          >
            <span aria-hidden="true">{'</> '}</span>
            {path}
          </a>
        ))}
      </p>
    </section>
  )
}
