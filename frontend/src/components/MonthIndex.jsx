import { Link } from 'react-router'
import { monthName } from '../lib/monthInReview.js'
import { monthPath } from '../lib/spinePaths.js'
import { spine } from '../content/spine.js'

const COPY = spine.journal

/**
 * What a cell has, in words; null when it has nothing known. A month with
 * no finish says "nothing" only once the diary is known, since a session
 * could still be on its way.
 */
function words(cell, known) {
  const parts = []
  if (cell.finished > 0) parts.push(COPY.finished(cell.finished))
  if (cell.played) parts.push(COPY.played)
  if (parts.length > 0) return parts.join(', ')
  return known ? COPY.nothing : null
}

/**
 * The journal's index of one year: twelve cells, each a month and the number
 * of games finished in it. A month with a finish or a session links to its
 * page; the current month is marked and is not a link. The nearest months
 * with entries sit under it as previous and next.
 *
 * @param {object} props
 * @param {{month: string, short: string, name: string, finished: number, played: boolean}[]} props.cells
 *   From `monthIndex`.
 * @param {string} props.current `yyyy-mm` of the page.
 * @param {string|null} props.previous
 * @param {string|null} props.next
 * @param {boolean} [props.known] The diary answered. Until it has (or if it
 *   failed) a month without a finish is neutral: not announced as
 *   "nothing", not a link.
 */
export default function MonthIndex({
  cells,
  current,
  previous,
  next,
  known = true,
}) {
  return (
    <nav className="month-nav" aria-label="Months">
      <ol className="month-index">
        {cells.map((cell) => {
          const has = cell.finished > 0 || cell.played
          const said = words(cell, known)
          const label = said ? `${cell.name}, ${said}` : cell.name
          const face = (
            <>
              <span aria-hidden="true">{cell.short}</span>
              <small aria-hidden="true">{cell.finished || '·'}</small>
            </>
          )
          return (
            <li key={cell.month}>
              {cell.month === current ? (
                <span aria-current="page">
                  {face}
                  <span className="visually-hidden">{label}</span>
                </span>
              ) : has ? (
                <Link to={monthPath(cell.month)} aria-label={label}>
                  {face}
                </Link>
              ) : (
                <span>
                  {face}
                  <span className="visually-hidden">{label}</span>
                </span>
              )}
            </li>
          )
        })}
      </ol>
      <p className="month-step">
        {previous ? (
          <Link to={monthPath(previous)}>
            <span aria-hidden="true">&larr;</span>{' '}
            <span className="visually-hidden">{COPY.previous}</span>{' '}
            {monthName(previous)}
          </Link>
        ) : (
          <span />
        )}
        {next && (
          <Link to={monthPath(next)}>
            <span className="visually-hidden">{COPY.next}</span>{' '}
            {monthName(next)} <span aria-hidden="true">&rarr;</span>
          </Link>
        )}
      </p>
    </nav>
  )
}
