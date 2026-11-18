import { spine } from '../content/spine.js'
import StatTile, { StatTiles } from './StatTile.jsx'

const fig = spine.comics.figures

/**
 * The comics figures row, shared by the public shelf and its admin twin so
 * both say the same words (#333).
 *
 * The three book-first figures are optional: an older API or snapshot body
 * does not carry them, and their tiles are then left out. Volumes missing is
 * left out too when it is 0 and no book line exists (nothing to be missing
 * from).
 *
 * @param {object} props
 * @param {string} [props.label] Accessible name for the row.
 * @param {number} props.series
 * @param {number} props.complete Complete runs.
 * @param {number} props.gaps Runs with gaps.
 * @param {number} props.issues Issues owned.
 * @param {number} props.missing Issues missing.
 * @param {number|null} props.readPercent Share of owned issues read.
 * @param {number} [props.books]
 * @param {number} [props.volumesMissing]
 * @param {number} [props.issuesRead]
 * @param {boolean} [props.hasLine] A book line is on the shelf.
 */
export default function ComicFigures({
  label,
  series,
  complete,
  gaps,
  issues,
  missing,
  readPercent,
  books,
  volumesMissing,
  issuesRead,
  hasLine = false,
}) {
  const showVolumesMissing =
    volumesMissing != null && (volumesMissing > 0 || hasLine)
  return (
    <StatTiles label={label}>
      <StatTile
        label={fig.series}
        value={series}
        detail={fig.runs(complete, gaps)}
      />
      {books != null && (
        <StatTile
          label={fig.booksOwned}
          value={books}
          detail={fig.booksOwnedNote}
        />
      )}
      <StatTile label={fig.issues} value={issues} />
      <StatTile label={fig.missing} value={missing} />
      {showVolumesMissing && (
        <StatTile
          label={fig.volumesMissing}
          value={volumesMissing}
          detail={fig.volumesMissingNote}
        />
      )}
      {issuesRead != null && (
        <StatTile
          label={fig.issuesRead}
          value={issuesRead}
          detail={fig.issuesReadNote}
        />
      )}
      <StatTile
        label={fig.read}
        value={readPercent == null ? '—' : `${readPercent}%`}
        detail={readPercent == null ? null : fig.readOf}
      />
    </StatTiles>
  )
}
