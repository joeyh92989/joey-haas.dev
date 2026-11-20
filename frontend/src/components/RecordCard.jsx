import { cn } from '../lib/utils.js'
import { Card } from './ui/card.jsx'
import CatalogueNumber from './CatalogueNumber.jsx'

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
    <Card
      className={cn('gap-0 border-l-[3px] border-l-primary py-0', className)}
      {...rest}
    >
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
    </Card>
  )
}
