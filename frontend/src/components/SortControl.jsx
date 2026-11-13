import { spine } from '../content/spine.js'
import { useMediaQuery } from '../lib/useMediaQuery.js'

const copy = spine.shelf
const NARROW = '(max-width: 34rem)'

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
 * The shelf's one sort control, in two modes.
 *
 * By default: sort chips on a wide screen and a select on a narrow one, with
 * an arrow button for the direction. This is what the admin shelf, Comics and
 * What's next's store sort use.
 *
 * With `select`: the public shelf's mode. A labelled select at every width,
 * then a worded direction button (Newest first, A to Z) that flips it.
 *
 * In both, Random swaps the direction for an explicit Shuffle, because a
 * select fires nothing when its current option is chosen again. Changing key
 * resets the direction to the one that reads naturally for it (A to Z for
 * titles, newest or highest first for everything else).
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
 * @param {string} [props.label] - The accessible name of the group or select
 *   ("Sort" by default); a page with a sort per section names the section.
 * @param {boolean} [props.select] - The labelled select at every width, with
 *   a worded direction button. Off by default.
 * @param {boolean} [props.hideLabel] - With `select`, keep the name for
 *   assistive tech but draw no text, for a toolbar that shows its own row
 *   label.
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
  select = false,
  hideLabel = false,
}) {
  const phone = useMediaQuery(NARROW)
  const asSelect = select || phone
  const isRandom = value === 'random'
  const words = copy.directions[value]
  // copy: pending voice review
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

  const chooser = asSelect ? (
    <label className="sort-select">
      <span className={select && hideLabel ? 'visually-hidden' : undefined}>
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
  )

  function flip() {
    onChange({ value, direction: direction === 'asc' ? 'desc' : 'asc' })
  }

  return (
    <div className="sort-control" data-seed={seed}>
      {chooser}
      {isRandom ? (
        <button type="button" className="chip" onClick={onShuffle}>
          {copy.shuffle}
        </button>
      ) : (
        directional &&
        (select ? (
          <button
            type="button"
            className="chip sort-direction"
            aria-label={`Order: ${wording}`}
            onClick={flip}
          >
            {wording}
          </button>
        ) : (
          <button
            type="button"
            className="chip sort-direction"
            aria-label={`Direction: ${direction === 'asc' ? 'ascending' : 'descending'}`}
            onClick={flip}
          >
            <span aria-hidden="true">{direction === 'asc' ? '↑' : '↓'}</span>
          </button>
        ))
      )}
    </div>
  )
}
