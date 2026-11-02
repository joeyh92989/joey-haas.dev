import { Link } from 'react-router'
import { spine } from '../content/spine.js'
import { runCount, shortDate } from '../lib/comics.js'
import CoverImage from './CoverImage.jsx'
import RunBar from './RunBar.jsx'

const COPY = spine.comics

/** "Image · 2012– · Trades (Vol. 1–9)": the meta line before the status. */
function metaParts(row) {
  const year = row.year ? `${row.year}${row.ongoing ? '–' : ''}` : null
  const format = row.shelf_format ? COPY.formats[row.shelf_format] : null
  const edition = row.edition_labels[0]
  const binding =
    format && edition ? `${format} (${edition})` : (format ?? edition)
  return [row.publisher, year, binding].filter(Boolean)
}

/** The right-hand line: the next issue, a complete run, or the gap count. */
function runNote(row) {
  if (row.wanted) return null
  if (row.next_issue) {
    return COPY.run.next(
      row.next_issue.number,
      shortDate(row.next_issue.store_date),
    )
  }
  if (row.run_state === 'complete') return COPY.run.complete
  if (row.run_state === 'gaps') return COPY.run.missingCount(row.missing)
  return null
}

/**
 * One series in the Runs view: cover, title with its Following or Want pill,
 * the meta line, the run bar, and the count with what comes next. A want has
 * no run, so it shows neither bar nor count.
 *
 * The status dot always sits beside its label: colour is never the only
 * signal.
 *
 * @param {object} props
 * @param {object} props.row - A PublicComicRow.
 * @param {string} props.to - The series page.
 */
export default function SeriesRow({ row, to }) {
  const note = runNote(row)
  const readTo =
    !row.wanted && row.read_to && row.read < row.owned
      ? `, ${COPY.run.readTo(row.read_to)}`
      : ''
  return (
    <li className="series-row">
      <span className="series-thumb">
        <CoverImage src={row.cover_url} type="comic" alt="" />
      </span>
      <div className="series-body">
        <p className="series-title">
          <Link to={to}>{row.title}</Link>
          {row.following && (
            <span className="series-pill" data-accent="">
              {COPY.pills.following}
            </span>
          )}
          {row.wanted && (
            <span className="series-pill" data-warn="">
              {COPY.pills.want}
            </span>
          )}
        </p>
        <p className="series-meta">
          {metaParts(row).map((part) => (
            <span key={part}>{part} · </span>
          ))}
          <span
            className="status-swatch"
            data-status={row.status}
            aria-hidden="true"
          />
          {COPY.status[row.status]}
          {readTo}
        </p>
        {!row.wanted && (
          <RunBar
            segments={row.segments}
            owned={row.owned}
            released={row.released}
            ongoing={row.ongoing}
          />
        )}
      </div>
      {!row.wanted && (
        <p className="series-count">
          <b>{runCount(row)}</b>
          {note && <span>{note}</span>}
        </p>
      )}
    </li>
  )
}
