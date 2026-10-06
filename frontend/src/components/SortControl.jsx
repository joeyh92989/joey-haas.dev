import { useMediaQuery } from '../lib/useMediaQuery.js'

/** The sorts on offer, each with the direction it starts in. */
const SORTS = [
  { value: 'added', label: 'Recently added', direction: 'desc' },
  { value: 'finished', label: 'Recently finished', direction: 'desc' },
  { value: 'rating', label: 'Rating', direction: 'desc' },
  { value: 'year', label: 'Release year', direction: 'desc' },
  { value: 'title', label: 'Title', direction: 'asc' },
  { value: 'random', label: 'Random', direction: 'desc' },
]

const NARROW = '(max-width: 34rem)'

/**
 * The shelf's one sort control.
 *
 * Buttons on a wide screen and a select on a narrow one. Random hides the
 * direction and shows an explicit Shuffle, in both variants, because a select
 * fires nothing when its current option is chosen again. Changing key resets
 * the direction to the one that reads naturally for it (A to Z for titles,
 * newest or highest first for everything else).
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
 * @param {string} [props.label] - The accessible name of the group and the
 *   select's visible label; "Sort" by default. A page with a sort per
 *   section names the section.
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
}) {
  const narrow = useMediaQuery(NARROW)
  const isRandom = value === 'random'

  function choose(next) {
    if (next === value) return
    const sort = sorts.find((option) => option.value === next)
    onChange({ value: next, direction: sort?.direction ?? 'desc' })
  }

  return (
    <div className="sort-control" data-seed={seed}>
      {narrow ? (
        <label className="sort-select">
          {label}
          <select
            value={value}
            onChange={(event) => choose(event.target.value)}
          >
            {sorts.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <div className="sort-options" role="group" aria-label={label}>
          {sorts.map((option) => (
            <button
              key={option.value}
              type="button"
              className="chip"
              aria-pressed={option.value === value}
              onClick={() => choose(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
      {isRandom ? (
        <button type="button" className="chip" onClick={onShuffle}>
          Shuffle
        </button>
      ) : (
        directional && (
          <button
            type="button"
            className="chip sort-direction"
            aria-label={`Direction: ${direction === 'asc' ? 'ascending' : 'descending'}`}
            onClick={() =>
              onChange({
                value,
                direction: direction === 'asc' ? 'desc' : 'asc',
              })
            }
          >
            <span aria-hidden="true">{direction === 'asc' ? '↑' : '↓'}</span>
          </button>
        )
      )}
    </div>
  )
}
