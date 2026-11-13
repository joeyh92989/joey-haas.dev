import { useId } from 'react'

/**
 * One chip; hidden at zero unless pressed, so a filter can be undone. A null
 * count is a chip without one (a choice, not a filter), always shown.
 */
function Chip({ pressed, count, label, onClick, className, disabled }) {
  const counted = count !== null
  if (counted && !pressed && !count) return null
  return (
    <button
      type="button"
      className={className ? `chip ${className}` : 'chip'}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
    >
      {label}
      {counted && (
        <>
          {' '}
          <span className="chip-count">{count}</span>
        </>
      )}
    </button>
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
 * @param {{key: string, label: string, options: {value: string, label: string, count: number|null}[]}[]} props.groups
 *   Single-select groups, keyed by the `value` field they set. A null count
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
  const shown = groups.filter((group) => offersChoice(group, value))

  function groupChips(group) {
    return group.options.map((option) => {
      const pressed = value[group.key] === option.value
      return (
        <Chip
          key={option.value}
          pressed={pressed}
          count={option.count}
          label={option.label}
          disabled={disabled}
          onClick={() =>
            onChange({
              ...value,
              [group.key]: pressed ? null : option.value,
            })
          }
        />
      )
    })
  }

  const toggleChips = toggles.map((toggle) => (
    <Chip
      key={toggle.key}
      pressed={Boolean(value[toggle.key])}
      count={toggle.count}
      label={toggle.label}
      className={toggle.className}
      disabled={disabled}
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
      <div className="chip-rows chip-rows-labelled">
        {rows.map((row) => (
          <div key={row.key} className="ctl-row">
            <span className="ctl-label" id={`${id}-${row.key}`}>
              {row.label}
            </span>
            <div
              className="chip-row"
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
    <div className="chip-rows">
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
