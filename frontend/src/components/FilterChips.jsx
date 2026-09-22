/** One chip; hidden at zero unless pressed, so a filter can be undone. */
function Chip({ pressed, count, label, onClick }) {
  if (!pressed && !count) return null
  return (
    <button
      type="button"
      className="chip"
      aria-pressed={pressed}
      onClick={onClick}
    >
      {label} <span className="chip-count">{count}</span>
    </button>
  )
}

/**
 * Rows of filter chips with counts.
 *
 * Each group is single-select with an implicit All: clicking the pressed chip
 * clears the group. Toggles are independent booleans ANDed on top. Counts come
 * from the unfiltered list, and a chip with nothing behind it is hidden unless
 * it is pressed, so a filter can always be undone.
 *
 * @param {object} props
 * @param {{key: string, label: string, options: {value: string, label: string, count: number}[]}[]} props.groups
 *   Single-select groups, keyed by the `value` field they set.
 * @param {{key: string, label: string, count: number}[]} [props.toggles]
 *   Boolean toggles, keyed by the `value` field they flip.
 * @param {object} props.value - The selection, in `filterItems`' shape.
 * @param {(next: object) => void} props.onChange - Receives the whole new selection.
 */
export default function FilterChips({ groups, toggles = [], value, onChange }) {
  return (
    <div className="chip-rows">
      {groups.map((group) => (
        <div
          key={group.key}
          className="chip-row"
          role="group"
          aria-label={group.label}
        >
          {group.options.map((option) => {
            const pressed = value[group.key] === option.value
            return (
              <Chip
                key={option.value}
                pressed={pressed}
                count={option.count}
                label={option.label}
                onClick={() =>
                  onChange({
                    ...value,
                    [group.key]: pressed ? null : option.value,
                  })
                }
              />
            )
          })}
        </div>
      ))}
      {toggles.length > 0 && (
        <div className="chip-row" role="group" aria-label="Show only">
          {toggles.map((toggle) => (
            <Chip
              key={toggle.key}
              pressed={Boolean(value[toggle.key])}
              count={toggle.count}
              label={toggle.label}
              onClick={() =>
                onChange({ ...value, [toggle.key]: !value[toggle.key] })
              }
            />
          ))}
        </div>
      )}
    </div>
  )
}
