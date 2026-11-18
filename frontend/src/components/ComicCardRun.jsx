import { spine } from '../content/spine.js'
import { kindSummary, shortDate } from '../lib/comics.js'
import { cardLines, laneSpansFromRow, lanesLabel } from '../lib/comicRun.js'
import RunLanes from './RunLanes.jsx'

const COPY = spine.comics

/** The mini lanes for a public list row, or nothing for a want or no run. */
export function RowLanes({ row }) {
  const lines = cardLines(row, shortDate)
  if (!lines.lanes) return null
  const spans = laneSpansFromRow(row)
  return (
    <RunLanes
      spans={spans}
      mini
      label={lanesLabel({
        held: row.owned,
        released: row.released,
        missing: row.missing,
        ongoing: row.ongoing,
        readTo: row.read_to,
      })}
    />
  )
}

/**
 * A comic card's words under its title: the title's kind ("Line of books"),
 * which volumes are owned for a title that holds books, then the run: the Run
 * and Read lanes, "58/72+ · Next #73 · Dec 2" and "read next: #55". A want or
 * a series with no issues recorded says so in words and draws no lanes. A
 * line of books or a single book has no run, so it draws neither lanes nor
 * run text: the kind and its volumes are the card (no slot pips: the line's
 * size is not stored, and pips would imply one).
 *
 * @param {object} props
 * @param {object} props.row - A PublicComicRow, or the admin shelf's twin of
 *   one (`kind`, `volumes_owned`, `volume_numbers`).
 */
export default function ComicCardRun({ row }) {
  const lines = cardLines(row, shortDate)
  const { kind, word, volumes } = kindSummary(row)
  const hasRun = kind === 'run' || kind === 'both'
  return (
    <div
      className="comic-card-run"
      role="group"
      aria-label={[row.title, word].filter(Boolean).join(': ')}
    >
      <p className="comic-card-kind">{word}</p>
      {volumes && <p className="comic-card-line">{volumes}</p>}
      {hasRun && <ComicRun row={row} lines={lines} />}
    </div>
  )
}

/** The run's lanes and lines, for a title that holds issues. */
function ComicRun({ row, lines }) {
  return (
    <>
      <RowLanes row={row} />
      <p className="comic-card-line">
        {lines.count && (
          <>
            <b>{lines.count}</b>
            {' · '}
          </>
        )}
        {lines.status}
        {row.wanted && (
          <>
            {' '}
            <span className="series-pill" data-warn="">
              {COPY.pills.want}
            </span>
          </>
        )}
      </p>
      {lines.reading && <p className="comic-card-line">{lines.reading}</p>}
    </>
  )
}
