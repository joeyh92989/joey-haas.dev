import { buttonVariants } from './ui/button-variants.js'
import { FIELD_LOOK } from './ui/field-classes.js'
import { btn, chipBtn, closetCard, PRESSED } from './closetClasses.js'
import { PANEL, PANEL_HEAD } from './detail-classes.js'
import { ACTION, ARMED, DANGER } from './adminShelfClasses.js'

// Class strings for the admin Shelf data and edit pages (#535): Sources, the
// Store list, the item and comic edit pages, a book's page, and the
// components only they use. Everything is drawn from the Button, Card and
// Input looks, as closetClasses.js is. Plain strings, no `cn`, no Base UI. The
// legacy `.btn`, `.chip`, `.panel` and `.link-button` classes stay for the
// areas not yet migrated (#536). Each control carries its own 44px phone
// target, since the legacy media rule no longer reaches it (#276).

export { btn, chipBtn, PRESSED, ACTION, ARMED, DANGER }

const TAP = 'max-[700px]:min-h-11'
// Tab scrolls a control that was off screen flush to the viewport edge, which
// would cut its 4px ring: 16px of scroll margin keeps it whole.
const SCROLL = 'scroll-my-4'
const RING =
  'outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring'

/** A text field, select or date input: the Input look with a phone target. */
export const FIELD = `${FIELD_LOOK} ${TAP} ${SCROLL}`

/** A select or input that sits beside a label or a button, at its own width. */
export const FIELD_AUTO = `${FIELD_LOOK.replace('w-full ', 'w-auto max-w-full ')} ${TAP} ${SCROLL}`

/** A multi-line field. */
export const TEXTAREA = FIELD_LOOK.replace('h-10 ', 'min-h-16 resize ')

/** A date or number field inside a table cell: compact. */
export const FIELD_CELL = `${FIELD_LOOK.replace('h-10 ', 'h-8 ')
  .replace('w-full ', 'w-auto max-w-full ')
  .replace('px-3 ', 'px-2 ')
  .replace('text-base', 'text-sm')} ${TAP} ${SCROLL}`

/** A native checkbox: 24px, with the ring every control paints. */
export const CHECKBOX = `size-6 cursor-pointer justify-self-start accent-primary ${RING}`

/** An edit form: label and field in two columns, one column on a phone. */
export const FORM_GRID =
  'grid grid-cols-1 items-center gap-x-3 gap-y-2 min-[560px]:grid-cols-[minmax(0,8rem)_minmax(0,1fr)] [&>*]:min-w-0'

/** A form's label: small and muted, the field's name. */
export const LABEL =
  'text-[0.8125rem] text-muted-foreground max-[700px]:flex max-[700px]:min-h-11 max-[700px]:items-center'

/** A form's own note or message, across both columns. */
export const FORM_NOTE = 'col-span-full m-0 text-sm text-muted-foreground'

/** A form's buttons: a row under both columns. */
export const FORM_ACTIONS =
  'col-span-full mt-2 flex flex-wrap items-center gap-2'

/** A text button in the flow of a sentence (Undo, Cancel). */
export const LINK_BTN = `inline-flex min-h-6 cursor-pointer items-center border-0 bg-transparent p-0 font-sans text-sm text-accent-text underline underline-offset-4 hover:no-underline ${RING} max-[700px]:min-h-11`

/** A panel: Card's shell with its heading strip, as the cover wall draws it. */
export { PANEL, PANEL_HEAD }

/** A box for a note: the Card surface with padding. */
export const NOTE_BOX = `${closetCard} my-4 px-4 py-3`

/** A table's scroller: it scrolls, not the page; padding and scroll-padding
 *  keep a focused control's ring whole at its edge. */
export const TABLE_WRAP = 'relative overflow-x-auto scroll-px-4'

/** The table: wide enough to read, scrolling inside its wrapper. */
export const TABLE = 'w-full min-w-[32rem] border-collapse text-sm'

/** A column heading. */
export const TH =
  'border-b border-border px-3 py-2 text-left text-xs font-semibold tracking-[0.06em] text-muted-foreground uppercase'

/** A row heading: the row's name. */
export const TH_ROW =
  'border-b border-border px-3 py-2 text-left align-top text-sm font-semibold text-foreground [overflow-wrap:anywhere]'

/** A cell. */
export const TD =
  'border-b border-border px-3 py-2 text-left align-top [overflow-wrap:anywhere]'

/** The "needs attention" mark: a filled circle with a bang. */
export const ATTENTION =
  'ml-2 inline-block size-5 rounded-full bg-primary text-center text-xs leading-5 font-bold text-primary-foreground'

/** A sentence under a heading or a table: muted body text. */
export const MUTED = 'text-muted-foreground'

/** A store list answer: 44px at every width, for a phone held in an aisle.
 *  The lg size's own 20px padding, and 16px text as the page had (`!`: the
 *  Button base says text-sm). */
export const ANSWER = `${buttonVariants({ variant: 'outline', size: 'lg' })} min-w-11 text-base!`

/** The status line that takes focus when the last answered row leaves. */
export const STATUS_LINE =
  'min-h-6 text-muted-foreground outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring'

/** A small button inside a row or a panel (44px on a phone). */
export const SMALL = `${ACTION} ${SCROLL}`

/** The form's primary button (Save): the brand fill, 44px on a phone. */
export const PRIMARY = `${btn('primary', 'sm')} ${SCROLL}`

/** A plain button at the form's size. */
export const PLAIN = SMALL

/** A search hit that is a whole-row button (the Comic Vine link picker). */
export const HIT = `${RING} max-[700px]:min-h-11`

/** A quiet button beside the primary one (Cancel). */
export const GHOST = `${btn('ghost', 'sm')} ${SCROLL}`
