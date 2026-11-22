import { spine } from '../content/spine.js'
import { useMediaQuery } from '../lib/useMediaQuery.js'
import { cn } from '../lib/utils.js'
import { Button } from './ui/button.jsx'
import FilterChips from './FilterChips.jsx'
import LayoutToggle from './LayoutToggle.jsx'
import {
  CTL_LABEL,
  CTL_ROW,
  CTL_SPLIT,
  PRESSED_FILL,
  SHELF_CONTROLS,
  SHELF_TOOLBAR,
  SHELF_TOOLBAR_ROW,
  SHELF_VIEW_CONTROLS,
  VIEW_LAB,
} from './shelf-classes.js'
import SortControl from './SortControl.jsx'
import { CHIP_TAP } from './chipClasses.js'

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
 * @param {'cards'|'spines'} [props.layout] - The public lists' layout. With
 *   `onLayoutChange` the toolbar offers Cards and Spines; the spine layout
 *   has no poster size or dimming, so those controls are left out of it.
 * @param {(next: 'cards'|'spines') => void} [props.onLayoutChange]
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
  layout = 'cards',
  onLayoutChange,
}) {
  const narrow = useMediaQuery(NARROW)

  const sizes = (
    <div className="chip-row" role="group" aria-label="Poster size">
      {[
        ['comfortable', 'Comfortable'],
        ['compact', 'Compact'],
      ].map(([value, label]) => (
        <Button
          key={value}
          variant="chip"
          size="chip"
          className={cn('chip', CHIP_TAP, labelled && PRESSED_FILL)}
          aria-pressed={size === value}
          onClick={() => onSizeChange(value)}
          data-size={value}
        >
          {label}
        </Button>
      ))}
    </div>
  )
  const dimmer = (
    <Button
      variant="chip"
      size="chip"
      className={cn('chip', CHIP_TAP, labelled && PRESSED_FILL)}
      aria-pressed={dim}
      onClick={() => onDimChange(!dim)}
    >
      Dim finished
    </Button>
  )

  const spines = layout === 'spines'
  const layouts = onLayoutChange && (
    <LayoutToggle layout={layout} onChange={onLayoutChange} />
  )

  if (labelled) {
    return (
      <section
        className={`shelf-toolbar controls ${SHELF_CONTROLS}`}
        aria-label="Filter and sort"
      >
        <FilterChips
          groups={groups}
          toggles={toggles}
          value={filters}
          onChange={onFiltersChange}
          labelled
        />
        <div className={`ctl-row ${CTL_ROW}`}>
          <span className={`ctl-label ${CTL_LABEL}`} aria-hidden="true">
            {copy.sort}
          </span>
          <div className={`ctl-split ${CTL_SPLIT}`}>
            <SortControl
              value={sort.value}
              direction={sort.direction}
              seed={seed}
              onChange={onSortChange}
              onShuffle={onShuffle}
              select
              hideLabel
            />
            <div
              className={`shelf-view-controls ${SHELF_VIEW_CONTROLS}`}
              role="group"
              aria-label={copy.view}
            >
              <span className={`view-lab ${VIEW_LAB}`} aria-hidden="true">
                {copy.view}
              </span>
              {layouts}
              {!spines && !narrow && sizes}
              {!spines && dimmer}
            </div>
          </div>
        </div>
      </section>
    )
  }

  return (
    <div className={`shelf-toolbar ${SHELF_TOOLBAR}`}>
      <FilterChips
        groups={groups}
        toggles={toggles}
        value={filters}
        onChange={onFiltersChange}
      />
      <div className={`shelf-toolbar-row ${SHELF_TOOLBAR_ROW}`}>
        <SortControl
          value={sort.value}
          direction={sort.direction}
          seed={seed}
          onChange={onSortChange}
          onShuffle={onShuffle}
        />
        <div className={`shelf-view-controls ${SHELF_VIEW_CONTROLS}`}>
          {sizes}
          {dimmer}
        </div>
      </div>
    </div>
  )
}
