import { cn } from '../lib/utils.js'

/**
 * A catalogue number, "No. 007": a mono label on a record card's strip.
 * Decorative (`aria-hidden`): it numbers the position in a collection, and
 * the title carries the meaning. Collections only (docs/design-system.md).
 *
 * @param {object} props
 * @param {number} props.n The number; padded to three digits.
 * @param {string} [props.className]
 */
export default function CatalogueNumber({ n, className, ...rest }) {
  return (
    <span aria-hidden="true" className={cn('font-mono', className)} {...rest}>
      No. {String(n).padStart(3, '0')}
    </span>
  )
}
