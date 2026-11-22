// The shared chip look (#536 slice E1): what the legacy `.chip`, `.chip-count`
// and `.chip-list` rules drew, as utilities. Plain strings with no imports, so
// eager and lazy files can both take them. The `chip`, `chip-count` and
// `chip-list` names stay on the elements as hooks that tests, e2e and the
// style dump read.
//
// The phone step is written as a media query, not `max-[700px]:`: the legacy
// rule was `max-width: 700px` (inclusive) and Tailwind's `max-[700px]` is
// strictly below.
const PHONE = '[@media(max-width:700px)]:'

/** A chip on a phone is 44px high (#276). */
export const CHIP_TAP = `${PHONE}min-h-11`

/**
 * A chip that is a plain button or link, with no Button variant under it: the
 * pill, its hover, ring, pressed (ink fill, page colour on it) and current
 * states, and the phone's 44px target. The hover is a plain `:hover`, not
 * Tailwind's `hover:` (which waits for a pointer that hovers), because the old
 * rule also applied on touch; it steps aside for the pressed and current
 * states, as the later rules did.
 */
export const CHIP_BASE = [
  'cursor-pointer whitespace-nowrap rounded-[999px] border border-border bg-card px-3 py-1 text-muted-foreground',
  '[font-family:inherit] [font-style:inherit] [font-weight:inherit] [font-size:var(--fs-13)] [line-height:1.4]',
  '[&:hover:not([aria-pressed=true],[aria-current])]:border-(--text-3)',
  'focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-(--accent)',
  'aria-pressed:border-foreground aria-pressed:bg-foreground aria-pressed:text-background',
  'aria-[current]:border-foreground aria-[current]:text-foreground',
  `${CHIP_TAP} ${PHONE}items-center`,
].join(' ')

/** The chip as a button: inline-flex on a phone, so its label centres in the
 *  44px target. */
export const CHIP = `${CHIP_BASE} ${PHONE}inline-flex`

/**
 * The count inside a chip. A chip is inline-flex on a phone, and a flex
 * container drops the whitespace between the label and the count, so the
 * margin spaces them there instead (#505).
 */
export const CHIP_COUNT = `tabular-nums ${PHONE}ms-1`

/** A read-only pill in a list (Discover's genres): the chip's shape without
 *  its states. */
export const CHIP_LIST = 'flex list-none flex-wrap gap-2'
export const CHIP_LIST_ITEM =
  'rounded-[999px] border border-border bg-card px-3 py-1 text-muted-foreground [font-size:var(--fs-13)]'
