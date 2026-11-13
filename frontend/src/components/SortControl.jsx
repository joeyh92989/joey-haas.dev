import { spine } from '../content/spine.js'

const copy = spine.shelf

/** The sorts on offer, each with the direction it starts in. */
const SORTS = [
  { value: 'added', label: 'Recently added', direction: 'desc' },
  { value: 'finished', label: 'Recently finished', direction: 'desc' },
  { value: 'rating', label: 'Rating', direction: 'desc' },
  { value: 'year', label: 'Release year', direction: 'desc' },
  { value: 'title', label: 'Title', direction: 'asc' },
  { value: 'random', label: 'Random', direction: 'desc' },
]

/**
 * The shelf's one sort control.
 *
 * A labelled select at every width, then a worded direction button (Newest
 * first, A to Z) that flips it. Random swaps the direction for an explicit
 * Shuffle, because a select fires nothing when its current option is chosen
 * again. Changing key resets the direction to the one that reads naturally
 * for it (A to Z for titles, newest or highest first for everything else).
 *
 * @param {object} props
 * @param {string} props.value - The current sort key.
 * @param {'asc'|'desc'} props.direction - The current direction.
 * @param {number} props.seed - The current shuffle seed; exposed as
 *   `data-seed` so the page's state can be inspected.
 * @param {(next: {value: string, direction: 'asc'|'desc'}) => void} props.onChange
 * @param {() => void} props.onShuffle - Requests a new seed.
 * @param {Array<{value: string, label: string, direction: 'asc'|'desc'}>} [props.sorts]
 *   The sorts on offer; the shelf's own by default.
 * @param {boolean} [props.directional] - Whether to show the direction
 *   button; false for a page whose sorts have one fixed order.
 * @param {string} [props.label] - The select's accessible name ("Sort" by
 *   default); a page with a sort per section names the section.
 * @param {boolean} [props.hideLabel] - Keep the name for assistive tech but
 *   draw no text, for a toolbar that shows its own row label.
 */
export default function SortControl({
  value,
  direction,
  seed,
  onChange,
  onShuffle,
  sorts = SORTS,
  directional = true,
  label = 'Sort',
  hideLabel = false,
}) {
  const isRandom = value === 'random'
  const words = copy.directions[value]
  const wording = words
    ? words[direction === 'asc' ? 1 : 0]
    : direction === 'asc'
      ? 'Ascending'
      : 'Descending'

  function choose(next) {
    if (next === value) return
    const sort = sorts.find((option) => option.value === next)
    onChange({ value: next, direction: sort?.direction ?? 'desc' })
  }

  return (
    <div className="sort-control" data-seed={seed}>
      <label className="sort-select">
        <span className={hideLabel ? 'visually-hidden' : undefined}>
          {label}
        </span>
        <select value={value} onChange={(event) => choose(event.target.value)}>
          {sorts.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      {isRandom ? (
        <button type="button" className="chip" onClick={onShuffle}>
          {copy.shuffle}
        </button>
      ) : (
        directional && (
          <button
            type="button"
            className="chip sort-direction"
            aria-label={`Order: ${wording}`}
            onClick={() =>
              onChange({
                value,
                direction: direction === 'asc' ? 'desc' : 'asc',
              })
            }
          >
            {wording}
          </button>
        )
      )}
    </div>
  )
}
