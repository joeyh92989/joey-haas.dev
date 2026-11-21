import { buttonVariants } from './ui/button-variants.js'
import { FIELD_LOOK } from './ui/field-classes.js'

// The Closet pages' controls, drawn from the Button, Card and Input looks
// (#535). The pages and what they hold are lazy, but these are plain strings
// with no Base UI or `cn`, so any of them can take one without a runtime.
// The legacy `.btn`, `.chip` and `.panel` classes stay for the areas not yet
// migrated (#536).

// #276: 44px tall on a phone. The legacy `.chip` and `.btn.sm` carried this in
// one media rule; a utility has to say it itself.
const TAP = 'max-[700px]:min-h-11'

const VARIANTS = {
  primary: 'default',
  plain: 'outline',
  ghost: 'ghost',
  danger: 'destructive',
}

/**
 * A button or a link that looks like one.
 *
 * @param {'primary'|'plain'|'ghost'|'danger'} [kind]
 * @param {'default'|'sm'|'xs'} [size]
 * @returns {string} Class names.
 */
export function btn(kind = 'plain', size = 'default') {
  const look = buttonVariants({ variant: VARIANTS[kind], size })
  return size === 'sm' ? `${look} ${TAP}` : look
}

/** A choice that can be pressed: the filter chip's look. */
export const chipBtn = `${buttonVariants({ variant: 'chip', size: 'chip' })} ${TAP}`

/** A button that can be pressed (aria-pressed): the pressed one is marked by
 *  its border, a heavier word and an underline as well as its ink, so colour
 *  never carries it alone. Ink is --accent-text and the border --accent, both
 *  measured on the card in contrast.test.js. */
export const PRESSED =
  'aria-pressed:border-primary aria-pressed:font-semibold aria-pressed:text-accent-text aria-pressed:underline aria-pressed:underline-offset-4'

/**
 * A box of content: Card's surface (1px outline, 6px radius, the card
 * colour), without its flex layout, padding or overflow. The page's own CSS
 * says the layout and the padding, since a utility sits above it and
 * `flex-col` would overrule a grid, and `overflow-hidden` would clip a ring.
 */
export const closetCard =
  'rounded-md border border-border bg-card text-card-foreground'

/** A native select or textarea, in the text field's look. */
export const field = FIELD_LOOK

/** A text field: the look, with the height a textarea does not take. */
export const textarea = FIELD_LOOK.replace('h-10 ', 'min-h-16 ')

/** A chip that wraps a visually hidden radio: it shows the choice as the
 *  pressed chip does (a darker outline, the heavier word, the accent bar) and
 *  draws the ring when the radio is focused by keyboard. */
export const CHECKED_CHIP =
  'has-checked:border-foreground has-checked:bg-card has-checked:font-medium has-checked:text-foreground has-checked:after:block has-focus-visible:outline-2 has-focus-visible:outline-solid has-focus-visible:outline-offset-2 has-focus-visible:outline-ring'

/** Swap and Build around under a piece of an outfit: small, and marked when
 *  pressed (the locked piece). */
export const pieceBtn = `${btn('plain', 'xs')} ${PRESSED}`

/** A label that opens a visually hidden file input: it draws the ring when
 *  the input is focused by keyboard. */
export const FILE_PICK =
  'cursor-pointer has-focus-visible:outline-2 has-focus-visible:outline-solid has-focus-visible:outline-offset-2 has-focus-visible:outline-ring'

/** A button in the intake row ("Show them", "Tag now"): 44px up to 900px, as
 *  `.intake-waiting .btn` said (the shell's phone layout). */
export const PHONE_ROW = 'max-[900px]:min-h-11'
