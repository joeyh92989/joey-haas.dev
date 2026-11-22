import { spine } from '../content/spine.js'
import { cn } from '../lib/utils.js'
import { PRESSED_FILL } from './shelf-classes.js'
import { Button } from './ui/button.jsx'
import { CHIP_TAP } from './chipClasses.js'

const copy = spine.shelf

/**
 * Cards and Spines: the public lists' two layouts, as a pair of pressed
 * buttons in a labelled group. Holds no state; the page keeps the choice in
 * the URL (`?view=spines`).
 *
 * @param {object} props
 * @param {'cards'|'spines'} props.layout - The current layout.
 * @param {(next: 'cards'|'spines') => void} props.onChange
 */
export default function LayoutToggle({ layout, onChange }) {
  return (
    <div className="chip-row" role="group" aria-label={copy.layout}>
      {['cards', 'spines'].map((value) => (
        <Button
          key={value}
          variant="chip"
          size="chip"
          className={cn('chip', CHIP_TAP, PRESSED_FILL)}
          aria-pressed={layout === value}
          onClick={() => onChange(value)}
        >
          {copy.layouts[value]}
        </Button>
      ))}
    </div>
  )
}
