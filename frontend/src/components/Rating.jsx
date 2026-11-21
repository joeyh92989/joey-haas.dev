import { cx } from '../lib/cx.js'

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
 * @param {string} [props.className] - Where it sits: `inline-block` unless
 *   given another display.
 */
export default function Rating({ rating, size, className = 'inline-block' }) {
  if (!rating) return null
  return (
    <span
      className={cx(
        size === 'large' ? 'rating rating-large' : 'rating',
        'whitespace-nowrap text-foreground tabular-nums',
        size === 'large'
          ? 'font-normal [font-size:var(--fs-24)]'
          : 'font-medium [font-size:var(--fs-13)]',
        className,
      )}
      role="img"
      aria-label={`${rating} out of 10`}
    >
      <span className="mr-[0.2em] text-(--rating)" aria-hidden="true">
        ★
      </span>
      <span aria-hidden="true">{rating}</span>
    </span>
  )
}
