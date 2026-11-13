import { spine } from '../content/spine.js'
import { useMediaQuery } from '../lib/useMediaQuery.js'
import FilterChips from './FilterChips.jsx'
import SortControl from './SortControl.jsx'

const copy = spine.shelf
const NARROW = '(max-width: 34rem)'

/**
 * The shelf's controls in one block: filter chips, the sort, the poster-size
 * toggle, and Dim finished.
 *
 * Holds no state. The page owns the selection and decides what is persisted,
 * because the public and admin shelves persist under different keys and with
 * different defaults.
 *
 * @param {object} props
 * @param {object[]} props.groups - Chip groups, as FilterChips takes them.
 * @param {object[]} [props.toggles] - Chip toggles, as FilterChips takes them.
 * @param {object} props.filters - The chip selection.
 * @param {(next: object) => void} props.onFiltersChange
 * @param {{value: string, direction: 'asc'|'desc'}} props.sort
 * @param {(next: {value: string, direction: 'asc'|'desc'}) => void} props.onSortChange
 * @param {number} props.seed - The shuffle seed.
 * @param {() => void} props.onShuffle
 * @param {'comfortable'|'compact'} props.size
 * @param {(next: 'comfortable'|'compact') => void} props.onSizeChange
 * @param {boolean} props.dim - Whether finished and abandoned are dimmed.
 * @param {(next: boolean) => void} props.onDimChange
 * @param {boolean} [props.labelled] - The public shelf's layout: a visible
 *   label per row (the groups' own labels, Sort), and View on the Sort row,
 *   without Comfortable and Compact on a phone where both are 6rem. Off for
 *   the admin shelf, which keeps its unlabelled rows.
 */
export default function ShelfToolbar({
  groups,
  toggles,
  filters,
  onFiltersChange,
  sort,
  onSortChange,
  seed,
  onShuffle,
  size,
  onSizeChange,
  dim,
  onDimChange,
  labelled = false,
}) {
  const narrow = useMediaQuery(NARROW)

  const sizes = (
    <div className="chip-row" role="group" aria-label="Poster size">
      {[
        ['comfortable', 'Comfortable'],
        ['compact', 'Compact'],
      ].map(([value, label]) => (
        <button
          key={value}
          type="button"
          className="chip"
          aria-pressed={size === value}
          onClick={() => onSizeChange(value)}
          data-size={value}
        >
          {label}
        </button>
      ))}
    </div>
  )
  const dimmer = (
    <button
      type="button"
      className="chip"
      aria-pressed={dim}
      onClick={() => onDimChange(!dim)}
    >
      Dim finished
    </button>
  )

  if (labelled) {
    return (
      <section className="shelf-toolbar controls" aria-label="Filter and sort">
        <FilterChips
          groups={groups}
          toggles={toggles}
          value={filters}
          onChange={onFiltersChange}
          labelled
        />
        <div className="ctl-row">
          <span className="ctl-label" aria-hidden="true">
            {copy.sort}
          </span>
          <div className="ctl-split">
            <SortControl
              value={sort.value}
              direction={sort.direction}
              seed={seed}
              onChange={onSortChange}
              onShuffle={onShuffle}
              hideLabel
            />
            <div
              className="shelf-view-controls"
              role="group"
              aria-label={copy.view}
            >
              <span className="view-lab" aria-hidden="true">
                {copy.view}
              </span>
              {!narrow && sizes}
              {dimmer}
            </div>
          </div>
        </div>
      </section>
    )
  }

  return (
    <div className="shelf-toolbar">
      <FilterChips
        groups={groups}
        toggles={toggles}
        value={filters}
        onChange={onFiltersChange}
      />
      <div className="shelf-toolbar-row">
        <SortControl
          value={sort.value}
          direction={sort.direction}
          seed={seed}
          onChange={onSortChange}
          onShuffle={onShuffle}
        />
        <div className="shelf-view-controls">
          {sizes}
          {dimmer}
        </div>
      </div>
    </div>
  )
}
