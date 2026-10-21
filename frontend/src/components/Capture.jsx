import Redacted from './Redacted.jsx'

/**
 * A drawing of a signed-in page: a browser-style bar (decoration, hidden
 * from assistive tech), the body, and a note saying it's drawn. Never a
 * screenshot: the real page carries stores, prices and scores.
 */
export default function Capture({ url, tag, note, children }) {
  return (
    <figure className="tour-capture">
      <div className="tour-capture-bar" aria-hidden="true">
        <span className="tour-capture-dot" />
        <span className="tour-capture-dot" />
        <span className="tour-capture-dot" />
        <span className="tour-capture-url">{url}</span>
        {tag && <span className="tour-capture-tag">{tag}</span>}
      </div>
      <div className="tour-capture-body">{children}</div>
      {note && <figcaption className="tour-capture-note">{note}</figcaption>}
    </figure>
  )
}

/** A cell from spine.how: text, `{ pill, tone }` or `{ redacted }`. */
function Cell({ value }) {
  if (value && typeof value === 'object') {
    if ('redacted' in value) return <Redacted text={value.redacted} />
    if ('pill' in value) {
      const tone = value.tone ? ` tour-pill-${value.tone}` : ''
      return <span className={`tour-pill${tone}`}>{value.pill}</span>
    }
  }
  return value
}

/** A capture's table, scrolled sideways inside its frame when narrow. */
export function CaptureTable({ columns, rows }) {
  return (
    <div className="tour-capture-scroll">
      <table className="tour-capture-table">
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
    <dl className="tour-kv">
      {facts.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  )
}
