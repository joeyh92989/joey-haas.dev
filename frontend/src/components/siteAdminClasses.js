import { buttonVariants } from './ui/button-variants.js'
import { closetCard } from './closetClasses.js'

// The Site admin pages' controls (Analytics), drawn from the Button and Card
// looks (#535, slice 3). Plain strings: no Base UI and no `cn`, so any of
// them can take one.

// #276: 44px tall on a phone. A utility has to say it itself, on every size.
const TAP = 'max-[700px]:min-h-11'

/** A choice that can be pressed: the filter chip's look. The pressed one is
 *  marked by its border, weight and bar as well as its fill. */
export const chipBtn = `${buttonVariants({ variant: 'chip', size: 'chip' })} ${TAP}`

/**
 * A box of content: Card's surface (1px outline, 6px radius, the card
 * colour), with no flex layout and no `overflow-hidden`, which would clip a
 * ring. The page says the layout and the padding. The Closet's string.
 */
export const box = closetCard
