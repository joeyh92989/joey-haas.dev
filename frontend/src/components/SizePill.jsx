import { sizeLabel } from '../lib/sizeBand.js'

export { sizeLabel }

/** The words after the band: how much is left, in the unit's own terms. */
function sizeWords(value, unit) {
  const n = Math.round(value)
  if (unit === 'issues') return n === 1 ? '1 issue left' : `${n} issues left`
  if (unit === 'minutes') return `${n} min`
  return `about ${n} h to finish`
}

/**
 * How big a pick is: the band as text, never colour alone, then the amount.
 * Takes a card's `size` ({unit, value}); `hours` stands in where there is
 * none (Pick for me's cards, the Continue card, and a snapshot written
 * before `size` existed). Renders nothing when the size is unknown, so it
 * sits in a meta row without leaving a gap.
 *
 * @param {object} props
 * @param {{unit: 'hours'|'issues'|'minutes', value: number}|null} [props.size]
 * @param {number|null} [props.hours]
 */
export default function SizePill({ size = null, hours = null }) {
  const { unit, value } = size ?? { unit: 'hours', value: hours }
  const label = sizeLabel(value, unit)
  if (!label) return null
  return (
    <>
      <span className="size-pill">{label}</span>
      <span>{sizeWords(value, unit)}</span>
    </>
  )
}
