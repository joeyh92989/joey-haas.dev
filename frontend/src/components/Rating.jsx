/**
 * My rating, written one way everywhere: an amber star and the number out of
 * ten ("★ 8"). The star is a mark; the number is in the text colour, so the
 * rating never depends on amber text (4.24:1 on white in the light theme).
 *
 * Renders nothing when unrated, so an absent rating never reads as a bad one.
 * The community score is not a rating of mine and is written "NN / 100"
 * with no star; the QuickRate input is a control and does not use this.
 *
 * @param {object} props
 * @param {number|null} props.rating - 1 to 10 (an average may carry a
 *   decimal), or null.
 * @param {'large'} [props.size] - The larger figure on the item tile and the
 *   year's average.
 */
export default function Rating({ rating, size }) {
  if (!rating) return null
  const className = size === 'large' ? 'rating rating-large' : 'rating'
  return (
    <span className={className} role="img" aria-label={`${rating} out of 10`}>
      <span className="rating-star" aria-hidden="true">
        ★
      </span>
      <span aria-hidden="true">{rating}</span>
    </span>
  )
}
