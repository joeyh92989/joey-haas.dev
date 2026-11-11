import { spine } from '../content/spine.js'
import { shortDate } from '../lib/comics.js'
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
 * A comic card's run, under its title: the Run and Read lanes, then
 * "58/72+ · Next #73 · Dec 2" and "read next: #55". A want or a series with
 * no issues recorded says so in words and draws no lanes.
 *
 * @param {object} props
 * @param {object} props.row - A PublicComicRow.
 */
export default function ComicCardRun({ row }) {
  const lines = cardLines(row, shortDate)
  return (
    <div className="comic-card-run">
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
    </div>
  )
}
