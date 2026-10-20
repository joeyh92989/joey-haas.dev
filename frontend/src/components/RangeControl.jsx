/** The ranges the analytics read accepts, in order, with their labels. */
export const RANGES = [
  ['7d', '7d'],
  ['30d', '30d'],
  ['90d', '90d'],
  ['all', 'All'],
]

/**
 * The Analytics page's range: a row of pressed-state buttons, one pressed.
 *
 * @param {object} props
 * @param {string} props.value The range shown, a key of RANGES.
 * @param {(range: string) => void} props.onChange Called with a new range.
 */
export default function RangeControl({ value, onChange }) {
  return (
    <div className="range-control" role="group" aria-label="Range">
      {RANGES.map(([key, label]) => (
        <button
          key={key}
          type="button"
          aria-pressed={value === key}
          onClick={() => {
            if (key !== value) onChange(key)
          }}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
