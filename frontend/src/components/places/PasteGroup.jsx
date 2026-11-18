import { placesAdd } from '../../content/placesAdd.js'

const words = placesAdd.paste

/** The id of a group's heading button, a focus target. */
export const groupButtonId = (group) => `paste-group-${group}`

/**
 * One group of the review list: a heading that is a disclosure button (the
 * name, the count, a caret), its note, and its rows, cut to `cap` with "Show
 * all N" under them (`.capped-toggle`, as CappedList draws it; CappedList's
 * own cap is fixed at 6 and 4, the mockup's is 10 and 6).
 *
 * @param {object} props
 * @param {'check'|'ready'|'wait'|'saved'|'same'} props.group
 * @param {object[]} props.rows Every row of the group.
 * @param {boolean} props.open
 * @param {boolean} props.showAll
 * @param {number} props.cap
 * @param {() => void} props.onToggle Folds or unfolds the group.
 * @param {() => void} props.onShowAll
 * @param {(row: object) => import('react').ReactNode} props.children Draws a row.
 */
export default function PasteGroup({
  group,
  rows,
  open,
  showAll,
  cap,
  onToggle,
  onShowAll,
  children,
}) {
  if (!rows.length) return null
  const label = words.groups[group]
  const capped = rows.length > cap
  const shown = capped && !showAll ? rows.slice(0, cap) : rows
  const note = words.groupNotes[group]
  return (
    <section
      className="place-paste-group"
      aria-labelledby={`${groupButtonId(group)}-h`}
    >
      <h3 id={`${groupButtonId(group)}-h`}>
        <button
          type="button"
          className="place-paste-group-btn"
          id={groupButtonId(group)}
          aria-expanded={open}
          onClick={onToggle}
        >
          <span className="place-paste-caret" aria-hidden="true" />
          {label} <span className="spots-pill">{rows.length}</span>
        </button>
      </h3>
      {open && (
        <>
          {note && <p className="place-paste-group-note">{note}</p>}
          <div className="place-results">
            <ul aria-label={label}>{shown.map((row) => children(row))}</ul>
          </div>
          {capped && (
            <button
              type="button"
              className="chip capped-toggle"
              aria-expanded={showAll}
              onClick={onShowAll}
            >
              {showAll ? words.showFewer : words.showAll(rows.length)}
              <span className="visually-hidden"> {label.toLowerCase()}</span>
            </button>
          )}
        </>
      )}
    </section>
  )
}
