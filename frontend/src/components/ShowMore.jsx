import { spine } from '../content/spine.js'

const copy = spine.shelf

/**
 * The paging row under a grid: "Showing 28 of 119", Show 28 more, Show all.
 * Renders nothing once everything is shown.
 *
 * @param {object} props
 * @param {number} props.shown - How many are on the page now.
 * @param {number} props.total - How many there are.
 * @param {number} props.step - One page, in items (whole rows).
 * @param {() => void} props.onMore - Adds a page.
 * @param {() => void} props.onAll - Shows the rest.
 */
export default function ShowMore({ shown, total, step, onMore, onAll }) {
  if (shown >= total) return null
  return (
    <div className="pager">
      <span aria-live="polite">{copy.showing(shown, total)}</span>
      <button type="button" className="chip" onClick={onMore}>
        {copy.showMore(Math.min(step, total - shown))}
      </button>
      <button type="button" className="chip" onClick={onAll}>
        {copy.showAll}
      </button>
    </div>
  )
}
