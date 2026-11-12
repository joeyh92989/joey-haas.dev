import { RunKey } from './RunLanes.jsx'
import SeriesRow from './SeriesRow.jsx'

/**
 * The Runs view on /shelf/comics: the lanes' key once, then a row per
 * series in the order given.
 *
 * @param {object} props
 * @param {object[]} props.rows - PublicComicRow objects, already sorted.
 * @param {(row: object) => string} props.linkFor - A row's series page.
 * Rows that share a title show their start year and publisher beside it.
 */
export default function SeriesList({ rows, linkFor }) {
  const counts = new Map()
  for (const row of rows) {
    const key = row.title.trim().toLowerCase()
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return (
    <>
      {rows.some((row) => !row.wanted) && <RunKey />}
      <ul className="series-list">
        {rows.map((row) => (
          <SeriesRow
            key={row.item_id}
            row={row}
            to={linkFor(row)}
            sharesTitle={counts.get(row.title.trim().toLowerCase()) > 1}
          />
        ))}
      </ul>
    </>
  )
}
