import { spine } from '../content/spine.js'
import { editionCoverage, expandRanges } from '../lib/comics.js'
import RunBar from './RunBar.jsx'

const RUN = spine.comics.run

/** Past this many issues the grid stops being readable; the run bar stands in. */
export const ISSUE_GRID_CAP = 300

const LEGEND = ['read', 'owned', 'missing', 'unreleased']
const LEGEND_LABEL = {
  read: RUN.read,
  owned: RUN.owned,
  missing: RUN.missing,
  unreleased: RUN.upcoming,
}

/** The one hatched cell after the last released issue, when it is dated. */
function nextCell(detail) {
  const number = Number(detail.next_issue?.number)
  return Number.isInteger(number) && number > detail.released ? number : null
}

/**
 * One cell per issue 1…released on the series page, plus a hatched cell for
 * the next issue when it is dated. Read is an owned issue at or below the
 * read marker; the marker itself is set on the form, never by a cell.
 *
 * Public, the grid is decoration: its text equivalent is the owned ranges in
 * the Issues heading, so the cells are hidden from assistive tech. Signed
 * in (`onToggle`), each cell is a toggle button for owned. A cell an edition
 * covers is not (spec, D6): a click edits `issues_owned` only, so it could
 * never unown it, and its title names the edition instead.
 *
 * @param {object} props
 * @param {object} props.detail - A PublicComicDetail.
 * @param {(issue: number, owned: boolean) => void} [props.onToggle]
 * @param {boolean} [props.busy] - Ignore the toggles while a save runs. They
 *   stay focusable (aria-disabled, not disabled), or each toggle would drop
 *   focus to the page.
 */
export default function IssueGrid({ detail, onToggle, busy = false }) {
  if (detail.released > ISSUE_GRID_CAP) {
    return (
      <RunBar
        segments={detail.segments}
        owned={expandRanges(detail.owned_text).length}
        released={detail.released}
        ongoing={detail.ongoing}
      />
    )
  }
  const owned = new Set(expandRanges(detail.owned_text))
  const covered = editionCoverage(detail.editions)
  const next = nextCell(detail)
  const interactive = Boolean(onToggle)

  const cells = Array.from({ length: detail.released }, (_, index) => {
    const n = index + 1
    const isOwned = owned.has(n)
    const kind = !isOwned
      ? 'missing'
      : detail.read_to != null && n <= detail.read_to
        ? 'read'
        : 'owned'
    const edition = covered.get(n)
    if (interactive && !edition) {
      return (
        <button
          key={n}
          type="button"
          data-k={kind}
          aria-pressed={isOwned}
          aria-label={`Issue ${n}`}
          aria-disabled={busy || undefined}
          onClick={() => {
            if (!busy) onToggle(n, !isOwned)
          }}
        >
          {n}
        </button>
      )
    }
    if (interactive) {
      // Signed in, the group is read: an edition's cell says so in words.
      return (
        <i
          key={n}
          data-k={kind}
          role="img"
          aria-label={`Issue ${n}, ${LEGEND_LABEL[kind].toLowerCase()}, in ${edition}`}
          title={`In ${edition}`}
        >
          {n}
        </i>
      )
    }
    return (
      <i key={n} data-k={kind} title={edition ? `In ${edition}` : undefined}>
        {n}
      </i>
    )
  })
  if (next) {
    cells.push(
      <i key="next" data-k="unreleased" aria-hidden={interactive || undefined}>
        {next}
      </i>,
    )
  }

  return (
    <>
      {interactive ? (
        <div className="issue-grid" role="group" aria-label="Issues I own">
          {cells}
        </div>
      ) : (
        <div className="issue-grid" aria-hidden="true">
          {cells}
        </div>
      )}
      <ul className="run-legend issue-legend" aria-hidden="true">
        {LEGEND.map((kind) => (
          <li key={kind}>
            <i data-k={kind} />
            {LEGEND_LABEL[kind]}
          </li>
        ))}
      </ul>
    </>
  )
}
