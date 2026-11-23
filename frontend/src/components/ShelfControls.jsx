import { useId, useState } from 'react'
import { spine } from '../content/spine.js'
import { cn } from '../lib/utils.js'
import { Button } from './ui/button.jsx'
import { CHIP_TAP } from './chipClasses.js'
import {
  CTL_BAR,
  CTL_LABEL,
  CTL_BAR_START,
  DISPLAY_GROUP,
  FILTERS_BUTTON,
  FILTERS_PANEL,
  SHELF_CONTROLS,
} from './shelf-classes.js'

const copy = spine.shelf

/**
 * The public shelf's controls bar (#473): a Filters button that opens the
 * filter groups, the sort, and the display toggles (layout, size, dim) in a
 * group of their own, so a search result is not pushed below five rows of
 * chips and a display toggle never reads as a filter.
 *
 * The panel stays mounted while closed (`hidden`), so a group's "More…" and
 * the chips' state survive a close. The button is a disclosure: it names the
 * panel with `aria-controls`, reports `aria-expanded` and carries how many
 * filters are on.
 *
 * @param {object} props
 * @param {import('react').ReactNode} props.filters - The FilterChips element.
 * @param {number} props.activeCount - Filters currently on, for the button.
 * @param {import('react').ReactNode} props.sort - The sort control.
 * @param {import('react').ReactNode} props.display - The display toggles.
 */
export default function ShelfControls({ filters, activeCount, sort, display }) {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  return (
    <section
      className={`shelf-toolbar controls ${SHELF_CONTROLS}`}
      aria-label="Filter and sort"
    >
      <div className={`ctl-bar ${CTL_BAR}`}>
        <div className={CTL_BAR_START}>
          <Button
            variant="chip"
            size="chip"
            className={cn('chip', CHIP_TAP, FILTERS_BUTTON)}
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen((current) => !current)}
          >
            {copy.filters}
            {activeCount > 0 && (
              <span className="font-mono text-xs">
                {' '}
                ({copy.filtersActive(activeCount)})
              </span>
            )}
            <span aria-hidden="true">{open ? ' ▴' : ' ▾'}</span>
          </Button>
          {sort}
        </div>
        <div
          className={`shelf-view-controls ${DISPLAY_GROUP}`}
          role="group"
          aria-label={copy.display}
        >
          <span className={`view-lab ${CTL_LABEL}`} aria-hidden="true">
            {copy.display}
          </span>
          {display}
        </div>
      </div>
      <div id={panelId} hidden={!open} className={FILTERS_PANEL}>
        {filters}
      </div>
    </section>
  )
}
