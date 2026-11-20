import { cn } from '../lib/utils.js'

/** Statuses that fill the mark; every other one is an outlined square. */
const FILLED = new Set(['live', 'finished'])

/**
 * A small outlined square, filled with the highlighter when the thing is live
 * or finished, and always the word beside it: the fill never carries the
 * meaning alone. The square is decorative; the word is the content.
 *
 * @param {object} props
 * @param {string} [props.status] `live` or `finished` fills the mark.
 * @param {import('react').ReactNode} [props.children] The word; the status
 *   itself when omitted, so a mark is never drawn bare.
 * @param {string} [props.className]
 */
export default function StatusMark({ status, children, className }) {
  const filled = FILLED.has(status)
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 font-mono text-xs text-muted-foreground',
        className,
      )}
    >
      <span
        aria-hidden="true"
        data-slot="status-mark-square"
        data-filled={filled}
        className={cn(
          'inline-block size-2.5 shrink-0 border-[1.5px] border-foreground',
          filled && 'bg-highlight',
        )}
      />
      <span>{children ?? status}</span>
    </span>
  )
}
