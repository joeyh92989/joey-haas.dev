import { spine } from '../content/spine.js'
import { runCount, runLabel } from '../lib/comics.js'

/**
 * The corner badge on a comic's poster in the Covers view: "54/72+", green
 * for a complete or up-to-date run, "Want" for a want-list row. Named like
 * the run bar it stands for, since "54/72+" alone reads as a fraction.
 *
 * @param {object} props
 * @param {object} props.row - A PublicComicRow.
 */
export default function RunBadge({ row }) {
  if (row.wanted) {
    return (
      <span className="run-badge" data-wanted="">
        {spine.comics.pills.want}
      </span>
    )
  }
  const done = row.run_state === 'complete' || row.run_state === 'up_to_date'
  return (
    <span
      className="run-badge"
      data-complete={done ? '' : undefined}
      role="img"
      aria-label={runLabel(row)}
    >
      {runCount(row, '/')}
    </span>
  )
}
