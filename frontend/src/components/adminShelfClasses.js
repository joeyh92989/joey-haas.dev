import { cn } from '../lib/utils.js'
import { buttonVariants } from './ui/button-variants.js'
import { PRESSED_FILL } from './shelf-classes.js'

// Class strings for the admin Games and Comics lists (#532, slice b), the
// controls the shared shelf pieces do not draw. Everything comes from the
// Button look, so the focus ring (a solid 2px outline) is the one every other
// control paints. The legacy `.btn.sm`, `.chip` and `.shelf-pin` rules gave
// these a 44px phone target; the Button look has none, so each string adds
// `max-[700px]:min-h-11` itself. Merged with `cn`, because a pressed fill and
// the variant's own pressed card colour share a property. Lazy admin pages
// only: `cn` and Base UI stay out of the entry chunk.

/** Phone tap target: 44px, as the legacy controls had. */
export const PHONE_TARGET = 'max-[700px]:min-h-11'

/**
 * Extra classes for a toggle `<Button variant="chip" size="chip">`: the ink
 * as a fill with the page colour on it, and weight, so pressed is never
 * colour or a thin rule alone (PRESSED_FILL), and a phone target.
 */
export const TOGGLE = cn(PRESSED_FILL, PHONE_TARGET)

/**
 * A small outline button as a plain class string, for the places that draw a
 * bare `<button>` (ConfirmDelete's first button). `<Button>` takes the same
 * look through `variant="outline" size="sm"` plus `PHONE_TARGET`.
 */
export const ACTION = cn(
  buttonVariants({ variant: 'outline', size: 'sm' }),
  PHONE_TARGET,
)

/** A destructive first button (Delete on a card's panel). */
export const DANGER = cn(
  buttonVariants({ variant: 'destructive', size: 'sm' }),
  PHONE_TARGET,
)

/** The armed buttons of a delete or redo: Delete for good, Keep it. */
export const ARMED = {
  confirm: DANGER,
  keep: cn(buttonVariants({ variant: 'ghost', size: 'sm' }), PHONE_TARGET),
}

/**
 * A native select on a card's panel or in a bar: the flat field of `Input`
 * at the panel's small size, with its ring.
 */
export const SELECT = cn(
  'h-8 max-w-full rounded-md border border-foreground bg-card px-2 font-sans text-xs text-foreground outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring',
  PHONE_TARGET,
)

/** A native checkbox: sized, with the same ring as every other control. */
export const CHECKBOX =
  'size-4 cursor-pointer accent-primary outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring'

/**
 * The armed buttons of an action that is not destructive (Publish all): the
 * primary fill to go ahead, a ghost to keep things as they are.
 */
export const ARMED_NEUTRAL = {
  confirm: cn(buttonVariants({ variant: 'default', size: 'sm' }), PHONE_TARGET),
  keep: ARMED.keep,
}

/**
 * The label around a card panel's Public checkbox: at least 24px tall
 * (WCAG 2.5.8, #505) so it is a target beside Up next, and 44px on a phone.
 */
export const CHECK_LABEL =
  'inline-flex min-h-6 items-center gap-1 text-xs text-muted-foreground max-[700px]:min-h-11'
