import { badgeVariants } from './ui/badge-variants.js'
import { buttonVariants } from './ui/button-variants.js'
import { FIELD_LOOK } from './ui/field-classes.js'
import { closetCard } from './closetClasses.js'

// The Denver and Site admin pages' controls, drawn from the Button, Badge,
// Card and Input looks (#535, slice 3). Plain strings: no Base UI and no `cn`,
// so any of them can take one. The legacy `.btn`, `.chip` and `.panel` classes
// stay for the areas not yet migrated (#536).

// #276: 44px tall on a phone. The legacy `.chip` and `.btn.sm` carried this in
// one media rule; a utility has to say it itself, on every size.
const TAP = 'max-[700px]:min-h-11'

const VARIANTS = {
  primary: 'default',
  plain: 'outline',
  ghost: 'ghost',
}

/**
 * A button or a link that looks like one, 44px tall on a phone.
 *
 * @param {'primary'|'plain'|'ghost'} [kind]
 * @param {'default'|'sm'|'xs'} [size]
 * @returns {string} Class names.
 */
export function btn(kind = 'plain', size = 'default') {
  return `${buttonVariants({ variant: VARIANTS[kind], size })} ${TAP}`
}

/** A choice that can be pressed: the filter chip's look. The pressed one is
 *  marked by its border, weight and bar as well as its fill. */
export const chipBtn = `${buttonVariants({ variant: 'chip', size: 'chip' })} ${TAP}`

/** A tag toggle on a card: the chip look, small, 44px tall on a phone. */
export const tagBtn = `${buttonVariants({ variant: 'chip', size: 'xs' })} ${TAP}`

/** A link in the accent, 44px tall on a phone. */
export const linkBtn = `${buttonVariants({ variant: 'link', size: 'bare' })} ${TAP}`

/** A small outlined word: a tag, a count, a constraint. */
export const pill = badgeVariants({ variant: 'outline' })

/** A text field, search box, select or textarea: the Input look. */
export const field = FIELD_LOOK

/** A multi-line field: the look, with the height a textarea does not take. */
export const textarea = FIELD_LOOK.replace('h-10 ', 'min-h-16 ')

/** A native checkbox, in the accent colour with the ring. */
export const checkbox =
  'size-5 shrink-0 cursor-pointer accent-primary outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-55'

/**
 * A box of content: Card's surface (1px outline, 6px radius, the card
 * colour), with no flex layout and no `overflow-hidden`, which would clip a
 * ring. The page says the layout and the padding. The Closet's string.
 */
export const box = closetCard
