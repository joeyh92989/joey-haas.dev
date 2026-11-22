import Redacted from './Redacted.jsx'
import {
  PILL_TONE,
  TOUR_PILL,
  TOUR_CAPTURE,
  TOUR_CAPTURE_BAR,
  TOUR_CAPTURE_BODY,
  TOUR_CAPTURE_DOT,
  TOUR_CAPTURE_NOTE,
  TOUR_CAPTURE_SCROLL,
  TOUR_CAPTURE_TABLE,
  TOUR_CAPTURE_TAG,
  TOUR_CAPTURE_URL,
  TOUR_KV,
} from './tourClasses.js'

/**
 * A drawing of a signed-in page: a browser-style bar (decoration, hidden
 * from assistive tech), the body, and a note saying it's drawn. Never a
 * screenshot: the real page carries stores, prices and scores.
 */
export default function Capture({ url, tag, note, children }) {
  return (
    <figure className={`tour-capture ${TOUR_CAPTURE}`}>
      <div
        className={`tour-capture-bar ${TOUR_CAPTURE_BAR}`}
        aria-hidden="true"
      >
        <span className={`tour-capture-dot ${TOUR_CAPTURE_DOT}`} />
        <span className={`tour-capture-dot ${TOUR_CAPTURE_DOT}`} />
        <span className={`tour-capture-dot ${TOUR_CAPTURE_DOT}`} />
        <span className={`tour-capture-url ${TOUR_CAPTURE_URL}`}>{url}</span>
        {tag && (
          <span className={`tour-capture-tag ${TOUR_CAPTURE_TAG}`}>{tag}</span>
        )}
      </div>
      <div className={`tour-capture-body ${TOUR_CAPTURE_BODY}`}>{children}</div>
      {note && (
        <figcaption className={`tour-capture-note ${TOUR_CAPTURE_NOTE}`}>
          {note}
        </figcaption>
      )}
    </figure>
  )
}

/**
 * A cell from spine.how: text, `{ pill, tone }`, or `{ redacted }`, which
 * draws the store's name withheld and then the text.
 */
function Cell({ value }) {
  if (value && typeof value === 'object') {
    if ('redacted' in value)
      return (
        <>
          <Redacted /> {value.redacted}
        </>
      )
    if ('pill' in value) {
      const tone = value.tone ? ` tour-pill-${value.tone}` : ''
      return (
        <span
          className={`tour-pill${tone} ${TOUR_PILL} ${PILL_TONE[value.tone] ?? PILL_TONE.none}`}
        >
          {value.pill}
        </span>
      )
    }
  }
  return value
}

/** A capture's table, scrolled sideways inside its frame when narrow. */
export function CaptureTable({ columns, rows }) {
  return (
    <div className={`tour-capture-scroll ${TOUR_CAPTURE_SCROLL}`}>
      <table className={`tour-capture-table ${TOUR_CAPTURE_TABLE}`}>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column} scope="col">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r}>
              {row.map((value, c) => (
                <td key={c}>
                  <Cell value={value} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Label and value pairs, as a description list. */
export function CaptureFacts({ facts }) {
  return (
    <dl className={`tour-kv ${TOUR_KV}`}>
      {facts.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  )
}
