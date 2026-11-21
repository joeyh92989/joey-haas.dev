import { cx } from '../lib/cx.js'
import CatalogueNumber from './CatalogueNumber.jsx'

// Card's look with no vertical padding, a 3px accent edge and no gap: written
// out here, not Card plus overrides, so no class needs a merge to win (this
// file is in the entry chunk, which has no tailwind-merge).
const CARD =
  'group/card flex flex-col overflow-hidden rounded-md border border-border border-l-[3px] border-l-primary bg-card text-sm text-card-foreground'

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
          {number != null ? <CatalogueNumber n={number} /> : <span />}
          {label != null && <span>{label}</span>}
        </div>
      )}
      {children}
    </div>
  )
}
