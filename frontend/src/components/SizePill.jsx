/**
 * Upper bounds in hours, mirroring SIZE_BANDS in backend/picker.py (a game
 * of exactly six hours is Short). Keep the two in step.
 */
const SIZE_BANDS = [
  [6, 'Short'],
  [15, 'Medium'],
  [Infinity, 'Long'],
]

export function sizeLabel(hours) {
  if (hours == null) return null
  return SIZE_BANDS.find(([high]) => hours <= high)[1]
}

/**
 * How big a game is: the band as text, never colour alone, then the hours.
 * Renders nothing when the hours are unknown, so it sits in a meta row
 * without leaving a gap.
 */
export default function SizePill({ hours }) {
  const label = sizeLabel(hours)
  if (!label) return null
  return (
    <>
      <span className="size-pill">{label}</span>
      <span>about {Math.round(hours)} h to finish</span>
    </>
  )
}
