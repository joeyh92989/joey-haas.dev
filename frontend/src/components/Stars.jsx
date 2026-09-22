/**
 * A rating out of ten, rendered as five stars with halves.
 *
 * Renders nothing when unrated, so an absent rating never reads as a bad one.
 * The glyphs are hidden from assistive technology; the wrapper carries the
 * number as an image with an accessible name.
 *
 * @param {object} props
 * @param {number|null} props.rating - 1 to 10, or null.
 */
export default function Stars({ rating }) {
  if (!rating) return null
  const full = Math.floor(rating / 2)
  const half = rating % 2 === 1
  return (
    <span className="stars" role="img" aria-label={`${rating} out of 10`}>
      <span aria-hidden="true">
        {'★'.repeat(full)}
        {half ? '½' : ''}
      </span>
    </span>
  )
}
