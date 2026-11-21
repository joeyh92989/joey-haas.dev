import { badgeVariants } from './ui/badge-variants.js'
import { buttonVariants } from './ui/button-variants.js'

// The Denver and Site admin pages' controls, drawn from the Button, Badge,
// Card and Input looks (#535, slice 3). Plain strings: no Base UI and no `cn`,
// so any of them can take one. The legacy `.btn`, `.chip` and `.panel` classes
// stay for the areas not yet migrated (#536).

const VARIANTS = {
  primary: 'default',
  plain: 'outline',
  ghost: 'ghost',
}

/**
 * A button or a link that looks like one.
 *
 * @param {'primary'|'plain'|'ghost'} [kind]
 * @param {'default'|'sm'|'xs'} [size]
 * @returns {string} Class names.
 */
export function btn(kind = 'plain', size = 'default') {
  return buttonVariants({ variant: VARIANTS[kind], size })
}

/** A choice that can be pressed: the filter chip's look. The pressed one is
 *  marked by its border, weight and bar as well as its fill. */
export const chipBtn = buttonVariants({ variant: 'chip', size: 'chip' })

/** A button that can be pressed: also marked by its accent text. */
export const PRESSED =
  'aria-pressed:border-primary aria-pressed:text-accent-text'

/** A small outlined word: a tag, a count, a constraint. */
export const pill = badgeVariants({ variant: 'outline' })

/** A text field, search box, select or textarea: the Input look. */
export const field =
  'h-10 w-full min-w-0 rounded-md border border-foreground bg-card px-3 py-1 font-sans text-base text-foreground outline-none placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-55 aria-invalid:border-destructive md:text-sm'

/** A multi-line field: the look, with the height a textarea does not take. */
export const textarea = field.replace('h-10 ', 'min-h-16 ')

/** A native checkbox, in the accent colour with the ring. */
export const checkbox =
  'size-4 shrink-0 cursor-pointer accent-primary outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-55'

/**
 * A box of content: Card's surface (1px outline, 6px radius, the card
 * colour), with no flex layout and no `overflow-hidden`, which would clip a
 * ring. The page says the layout and the padding.
 */
export const box =
  'rounded-md border border-border bg-card text-card-foreground'

/** A tag toggle on a card: the chip look, small. */
export const tagBtn = buttonVariants({ variant: 'chip', size: 'xs' })
