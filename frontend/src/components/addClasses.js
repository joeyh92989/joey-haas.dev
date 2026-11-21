import {
  btn,
  closetCard,
  field,
  PHONE_ROW,
  PRESSED,
  textarea,
} from './closetClasses.js'
import { CHECKBOX } from './adminShelfClasses.js'
import { cn } from '../lib/utils.js'

// The Add, sitting, Discover, Radar and Pull list pages' controls (#535,
// slice c), drawn from the Button, Card and Input looks through
// `closetClasses`. Plain strings with no Base UI; `cn` only merges the few
// strings that change a size (lazy admin pages and pieces only). The legacy `.btn`, `.chip`
// and `.panel` classes stay for the areas not yet migrated (#536).

/**
 * A button or link in an intake row: the Button look, 44px tall up to 900px.
 *
 * @param {'primary'|'plain'|'ghost'|'danger'} [kind]
 * @param {'default'|'sm'|'xs'} [size]
 * @returns {string} Class names.
 */
export function ibtn(kind = 'plain', size = 'default') {
  return `${btn(kind, size)} ${PHONE_ROW}`
}

/** A box of content that is not a control: the card surface. */
export const BOX = closetCard

/** A tile you press to start something (the Add page's kinds): a card that
 *  takes the primary border on hover. A disabled one keeps its ink and is
 *  drawn with a dashed border, so it is never told apart by fading alone. */
export const TILE = `${closetCard} cursor-pointer text-left hover:border-primary focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:border-dashed disabled:hover:border-border max-[900px]:min-h-11`

export { CHECKBOX, PHONE_ROW }

/** A text field, select or textarea in an intake row: the Input look, 44px
 *  tall up to 900px as the legacy fields were. */
export const INTAKE_FIELD = `${field} max-[900px]:h-11`
export const INTAKE_TEXTAREA = textarea

/** A short mono field (an issue number, a range): the intake field, narrow. */
export const NUM_FIELD = cn(INTAKE_FIELD, 'w-[4.5rem] font-mono')

/** An issues list field: the intake field in mono. */
export const MONO_FIELD = cn(INTAKE_FIELD, 'font-mono')

/** The label around a checkbox or radio: 44px tall on a phone. */
export const CHECK_ROW =
  'inline-flex cursor-pointer items-center gap-2 max-[700px]:min-h-11'

/** The pull list's buttons, read on a phone in a store: 44px at every width. */
export function bigBtn(kind = 'plain') {
  return `${btn(kind)} min-h-11 min-w-11`
}

/** A big button that can be pressed (Follow): marked by more than its ink. */
export const BIG_PRESSED = `${bigBtn('plain')} ${PRESSED}`

/** A search field as tall as the big buttons beside it. */
export const BIG_FIELD = field.replace('h-10 ', 'h-11 ')

/**
 * A page header's action (Generate, Refresh): the Button look, 44px on a
 * phone. A long label (Discover's) wraps in its own button instead of
 * widening the header; `cn` merges the nowrap and fixed height away.
 */
export function headBtn(kind = 'primary') {
  return cn(
    btn(kind),
    'h-auto min-h-9 max-w-full shrink whitespace-normal py-1.5 text-left max-[700px]:min-h-11',
  )
}

/** A text link that is a target on a phone (Needs match). */
export const PHONE_LINK =
  'max-[700px]:inline-flex max-[700px]:min-h-11 max-[700px]:items-center'
