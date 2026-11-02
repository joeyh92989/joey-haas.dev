import { RunLegend } from './RunBar.jsx'
import SeriesRow from './SeriesRow.jsx'

/**
 * The Runs view on /shelf/comics: the run bar key once, then a row per
 * series in the order given.
 *
 * @param {object} props
 * @param {object[]} props.rows - PublicComicRow objects, already sorted.
 * @param {(row: object) => string} props.linkFor - A row's series page.
 */
export default function SeriesList({ rows, linkFor }) {
  return (
    <>
      {rows.some((row) => !row.wanted) && <RunLegend />}
      <ul className="series-list">
        {rows.map((row) => (
          <SeriesRow key={row.item_id} row={row} to={linkFor(row)} />
        ))}
      </ul>
    </>
  )
}
