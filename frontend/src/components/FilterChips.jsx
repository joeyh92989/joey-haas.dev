import { useId, useState } from 'react'
import { Button } from './ui/button.jsx'
import { cn } from '../lib/utils.js'
import { CHIP_ROWS, CTL_LABEL, CTL_ROW, PRESSED_FILL } from './shelf-classes.js'
import { CHIP_COUNT, CHIP_TAP } from './chipClasses.js'

// A labelled single-select row's chips are underline tabs (#532): no pill, the
// pressed one bold with the chip variant's 3px accent bar under it (its
// `after`), on the row's own 1px rule. A toggle on such a row stays a chip
// button with a filled pressed state (PRESSED_FILL).
const TAB =
  'rounded-none border-transparent px-3 text-sm hover:border-transparent hover:underline aria-pressed:border-transparent aria-pressed:bg-transparent aria-pressed:font-semibold'

/**
 * One chip; hidden at zero unless pressed, so a filter can be undone. A null
 * count is a chip without one (a choice, not a filter), always shown.
 */
function Chip({ pressed, count, label, onClick, className, disabled, tab }) {
  const counted = count !== null
  if (counted && !pressed && !count) return null
  return (
    <Button
      variant="chip"
      size="chip"
      className={cn(
        'chip',
        CHIP_TAP,
        tab && TAB,
        tab === false && PRESSED_FILL,
        className,
      )}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
    >
      {label}
      {counted && (
        <>
          {' '}
          <span className={cn('chip-count', CHIP_COUNT)}>{count}</span>
        </>
      )}
    </Button>
  )
}

/**
 * Whether a group offers a choice: more than one chip that would render, or
 * a pressed one to clear. A single-member row -- "Games 68" on a games-only
 * shelf -- filters nothing and reads as noise.
 */
function offersChoice(group, value) {
  if (value[group.key] != null) return true
  return (
    group.options.filter((option) => option.count === null || option.count > 0)
      .length > 1
  )
}

/**
 * Rows of filter chips with counts.
 *
 * Each group is single-select with an implicit All: clicking the pressed chip
 * clears the group. Toggles are independent booleans ANDed on top. Counts come
 * from the unfiltered list, and a chip with nothing behind it is hidden unless
 * it is pressed, so a filter can always be undone. A group with at most one chip
 * to show, and none pressed, is left out.
 *
 * @param {object} props
 * @param {{key: string, label: string, limit?: number, moreLabel?: string, options: {value: string, label: string, count: number|null}[]}[]} props.groups
 *   Single-select groups, keyed by the `value` field they set. A group with
 *   a `limit` draws that many chips and a More… chip for the rest. A null count
 *   shows the chip without a count, whatever it would filter to.
 * @param {{key: string, label: string, count: number|null, className?: string}[]} [props.toggles]
 *   Boolean toggles, keyed by the `value` field they flip; `className` is
 *   added to the chip (Today's Bike modifier).
 * @param {string} [props.togglesLabel] - The toggles row's accessible name.
 * @param {object} props.value - The selection, in `filterItems`' shape.
 * @param {(next: object) => void} props.onChange - Receives the whole new selection.
 * @param {boolean} [props.labelled] - Draw each group's label as visible text
 *   in a label column, which also names the group; the toggles join the
 *   first group's row. Off by default, so other pages' rows are unchanged.
 * @param {boolean} [props.disabled] - Disables every chip, for a page that
 *   is waiting on a request the selection would start again.
 */
export default function FilterChips({
  groups,
  toggles = [],
  togglesLabel = 'Show only',
  value,
  onChange,
  disabled = false,
  labelled = false,
}) {
  const id = useId()
  const [expanded, setExpanded] = useState(() => new Set())
  const shown = groups.filter((group) => offersChoice(group, value))

  function groupChips(group) {
    let options = group.options
    let hidden = 0
    if (group.limit) {
      // Only the chips that would render count toward the limit; the pressed
      // one always stays.
      const drawn = options.filter(
        (option) =>
          option.count === null ||
          option.count > 0 ||
          value[group.key] === option.value,
      )
      const open = expanded.has(group.key)
      options = open
        ? drawn
        : drawn.filter(
            (option, index) =>
              index < group.limit || value[group.key] === option.value,
          )
      hidden = drawn.length - options.length
    }
    const chips = options.map((option) => {
      const pressed = value[group.key] === option.value
      return (
        <Chip
          key={option.value}
          pressed={pressed}
          count={option.count}
          label={option.label}
          disabled={disabled}
          tab={labelled ? true : undefined}
          onClick={() =>
            onChange({
              ...value,
              [group.key]: pressed ? null : option.value,
            })
          }
        />
      )
    })
    if (!group.limit || (hidden === 0 && !expanded.has(group.key))) return chips
    return [
      ...chips,
      <Button
        key="more"
        variant="chip"
        size="chip"
        className={cn('chip', CHIP_TAP, labelled && TAB)}
        aria-expanded={expanded.has(group.key)}
        disabled={disabled}
        onClick={() =>
          setExpanded((current) => {
            const next = new Set(current)
            if (!next.delete(group.key)) next.add(group.key)
            return next
          })
        }
      >
        {group.moreLabel ?? 'More…'}
      </Button>,
    ]
  }

  const toggleChips = toggles.map((toggle) => (
    <Chip
      key={toggle.key}
      pressed={Boolean(value[toggle.key])}
      count={toggle.count}
      label={toggle.label}
      className={toggle.className}
      disabled={disabled}
      tab={labelled ? false : undefined}
      onClick={() => onChange({ ...value, [toggle.key]: !value[toggle.key] })}
    />
  ))

  if (labelled) {
    // The toggles ride on the first row; with no row to ride on they get one.
    const rows = shown.map((group, index) => ({
      key: group.key,
      label: group.label,
      chips: (
        <>
          {groupChips(group)}
          {index === 0 && toggleChips}
        </>
      ),
    }))
    if (rows.length === 0 && toggles.length > 0)
      rows.push({ key: 'toggles', label: togglesLabel, chips: toggleChips })
    return (
      <div className={`chip-rows chip-rows-labelled ${CHIP_ROWS}`}>
        {rows.map((row) => (
          <div key={row.key} className={`ctl-row ${CTL_ROW}`}>
            <span className={`ctl-label ${CTL_LABEL}`} id={`${id}-${row.key}`}>
              {row.label}
            </span>
            <div
              className="chip-row border-b border-line"
              role="group"
              aria-labelledby={`${id}-${row.key}`}
            >
              {row.chips}
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className={`chip-rows ${CHIP_ROWS}`}>
      {shown.map((group) => (
        <div
          key={group.key}
          className="chip-row"
          role="group"
          aria-label={group.label}
        >
          {groupChips(group)}
        </div>
      ))}
      {toggles.length > 0 && (
        <div className="chip-row" role="group" aria-label={togglesLabel}>
          {toggleChips}
        </div>
      )}
    </div>
  )
}
