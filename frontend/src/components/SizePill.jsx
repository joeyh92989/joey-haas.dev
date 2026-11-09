import { sizeLabel } from '../lib/sizeBand.js'

export { sizeLabel }

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
