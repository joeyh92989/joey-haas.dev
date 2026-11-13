import { spine } from '../content/spine.js'

const copy = spine.shelf

/**
 * The count above a grid ("119 titles", or "59 of 119 titles" while a
 * filter or search narrows it) and, only then, Clear filters. Children sit
 * beside the count (the cover key).
 *
 * The count is a polite live region, so a screen reader hears the result of
 * each filter change without the focus moving.
 *
 * @param {object} props
 * @param {number} props.shown - How many titles match.
 * @param {number} props.total - How many titles the shelf holds.
 * @param {boolean} props.filtered - Whether a filter or search is on.
 * @param {() => void} props.onClear - Clears every filter and the search.
 * @param {import('react').ReactNode} [props.children] - Shown beside the count.
 */
export default function ResultBar({
  shown,
  total,
  filtered,
  onClear,
  children,
}) {
  return (
    <div className="resultbar">
      <p className="result" aria-live="polite">
        <strong>
          {filtered ? copy.titlesOf(shown, total) : copy.titles(total)}
        </strong>
        {filtered && (
          <>
            {' '}
            <button type="button" className="linkbtn" onClick={onClear}>
              {copy.clear}
            </button>
          </>
        )}
      </p>
      {children}
    </div>
  )
}
