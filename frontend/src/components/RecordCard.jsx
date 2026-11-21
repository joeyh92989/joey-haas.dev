import { cx } from '../lib/cx.js'
import { CARD_SHELL } from './ui/card-classes.js'
import CatalogueNumber from './CatalogueNumber.jsx'

// Card's shell with its spacing left out (the strip and body pad themselves)
// and a 3px accent edge: the shell string is Card's own (ui/card-classes.js),
// so a restyle of Card reaches record cards, and no class here needs a merge
// to win. Card's `data-size` and image-first padding do not apply.
const CARD = `${CARD_SHELL} border-l-[3px] border-l-primary`

/**
 * An index card for one record in a collection: a mono label strip across
 * the top (catalogue number left, type or status right), a 3px accent left
 * edge and a flat outline. The body is `children`.
 *
 * @param {object} props
 * @param {number} [props.number] Position in the collection; leave out on a
 *   card that is not part of a numbered collection.
 * @param {import('react').ReactNode} [props.label] The strip's right side: a
 *   type word or a `StatusMark`.
 * @param {string} [props.className]
 * @param {import('react').ReactNode} [props.children] The card body.
 */
export default function RecordCard({
  number,
  label,
  className,
  children,
  ...rest
}) {
  const hasStrip = number != null || label != null
  return (
    <div data-slot="card" className={cx(CARD, className)} {...rest}>
      {hasStrip && (
        <div
          data-strip
          className="flex items-center justify-between gap-3 border-b border-line-card px-4 py-2 font-mono text-xs text-muted-foreground"
        >
          {number != null && <CatalogueNumber n={number} />}
          {label != null && <div>{label}</div>}
        </div>
      )}
      {children}
    </div>
  )
}
