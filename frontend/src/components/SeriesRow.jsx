import { Link } from 'react-router'
import { spine } from '../content/spine.js'
import { runCount, shortDate } from '../lib/comics.js'
import CoverImage from './CoverImage.jsx'
import { RowLanes } from './ComicCardRun.jsx'

const COPY = spine.comics

/** "Image · Trades (Vol. 1–9)": the meta line before the status. The start
    year is in the title. */
function metaParts(row) {
  const format = row.shelf_format ? COPY.formats[row.shelf_format] : null
  const edition = row.edition_labels[0]
  const binding =
    format && edition ? `${format} (${edition})` : (format ?? edition)
  return [row.publisher, binding].filter(Boolean)
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
 * the meta line, the Run and Read lanes, and the count with what comes next. A want has
 * no run, so it shows neither bar nor count.
 *
 * The status dot always sits beside its label: colour is never the only
 * signal.
 *
 * @param {object} props
 * @param {object} props.row - A PublicComicRow.
 * @param {string} props.to - The series page.
 * @param {boolean} [props.sharesTitle] - Another row has this title: add
 *   the publisher to the link's accessible name (the meta line already
 *   shows it; the volume year is in the visible title).
 */
export default function SeriesRow({ row, to, sharesTitle = false }) {
  const note = runNote(row)
  const edition = sharesTitle ? (row.publisher ?? '') : ''
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
          <Link to={to}>
            {row.title}
            {row.year && (
              <>
                {' '}
                <span className="series-vol">({row.year})</span>
              </>
            )}
            {edition && (
              <span className="visually-hidden">{`, ${edition}`}</span>
            )}
          </Link>
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
        <RowLanes row={row} />
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
