import FilterChips from './FilterChips.jsx'
import SortControl from './SortControl.jsx'

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
}) {
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
              >
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="chip"
            aria-pressed={dim}
            onClick={() => onDimChange(!dim)}
          >
            Dim finished
          </button>
        </div>
      </div>
    </div>
  )
}
