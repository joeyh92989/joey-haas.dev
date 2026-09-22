import { useRef, useState } from 'react'

const TARGETS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

/**
 * Ten half-star targets that set a rating out of ten in one click.
 *
 * A radio group with a roving tabindex, so a shelf of cards costs one tab stop
 * each: the arrow keys move focus within the group, and Space or Enter select.
 * Arrows deliberately do not select, because every selection is a PATCH.
 * Choosing the current value clears the rating, and that target is named
 * "Clear rating" so the effect is announced before it happens.
 *
 * @param {object} props
 * @param {number|null} props.value - The current rating, 1 to 10, or null.
 * @param {(next: number|null) => void} props.onChange - Receives the new rating, or null to clear.
 */
export default function QuickRate({ value, onChange }) {
  // Null until the visitor moves within the group, so the tab stop follows
  // the rating as the server reports it.
  const [movedTo, setMovedTo] = useState(null)
  const focusIndex = movedTo ?? (value ? value - 1 : 0)
  const targets = useRef([])

  function moveTo(index) {
    const next = Math.min(Math.max(index, 0), TARGETS.length - 1)
    setMovedTo(next)
    targets.current[next]?.focus()
  }

  function onKeyDown(event) {
    const moves = {
      ArrowRight: focusIndex + 1,
      ArrowUp: focusIndex + 1,
      ArrowLeft: focusIndex - 1,
      ArrowDown: focusIndex - 1,
      Home: 0,
      End: TARGETS.length - 1,
    }
    if (event.key in moves) {
      event.preventDefault()
      moveTo(moves[event.key])
    }
  }

  return (
    <div
      className="quick-rate"
      role="radiogroup"
      aria-label="Rating"
      onKeyDown={onKeyDown}
    >
      {TARGETS.map((rating, index) => {
        const current = rating === value
        return (
          <button
            key={rating}
            ref={(node) => {
              targets.current[index] = node
            }}
            type="button"
            role="radio"
            className="quick-rate-target"
            data-half={rating % 2 === 1 ? 'left' : 'right'}
            data-filled={(value ?? 0) >= rating || undefined}
            aria-checked={current}
            aria-label={current ? 'Clear rating' : `Rate ${rating} out of 10`}
            tabIndex={index === focusIndex ? 0 : -1}
            onFocus={() => setMovedTo(index)}
            onClick={() => onChange(current ? null : rating)}
          >
            <span aria-hidden="true">★</span>
          </button>
        )
      })}
    </div>
  )
}
