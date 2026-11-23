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
export const textarea = FIELD_LOOK.replace('h-10 ', 'min-h-16 resize ')

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

// ---- Garment tiles, Today and the outfit board (#536, slice D5) -----------
// The look the `.garment-*`, `.today-*`, `.outfit-*` rules used to draw. The
// class names stay on the elements as hooks (tests read them). The base
// layer zeroes margin and padding on every element, so a rule that said
// `margin: 0` or `padding: 0` is not repeated here.

/** The Closet grid: as many 140px columns as fit, two on a small phone. */
export const GARMENT_GRID =
  'grid list-none grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-(--grid-gap) max-[400px]:grid-cols-[repeat(2,minmax(0,1fr))] max-[400px]:gap-2 [&>li]:min-w-0'

/** One tile (a link, or the picker's button): photo, name, stat. A named
 *  group, so the photo and the name answer to the tile's state. */
export const GARMENT_TILE = 'group/tile grid gap-1 text-foreground'

/** The photo at 4:5. Untagged: a dashed --warn outline inside the edge (a
 *  non-text mark, the stat line says it too). Packed: the picture dimmed. */
export const GARMENT_PHOTO =
  'relative block aspect-[4/5] overflow-hidden rounded-md border border-border bg-muted group-data-[status=packed]/tile:[&_img]:opacity-45 group-data-[status=untagged]/tile:outline-2 group-data-[status=untagged]/tile:-outline-offset-2 group-data-[status=untagged]/tile:outline-dashed group-data-[status=untagged]/tile:outline-chart-4 [&_img]:block [&_img]:h-full [&_img]:w-full [&_img]:object-cover'

/** The slot, in a pill of its own so it reads over any photo: --text-2 on
 *  --surface is the site's body pair (dark 8.53:1, light 8.24:1). */
export const GARMENT_SLOT =
  'absolute top-[0.4rem] left-[0.4rem] rounded-[999px] bg-card px-2 py-[0.05rem] font-mono text-[0.75rem] leading-[normal] font-normal text-muted-foreground'

/** A garment's name under its picture. */
export const GARMENT_NAME_TEXT =
  'text-[0.8125rem] leading-[1.3] [overflow-wrap:anywhere]'

/** The tile's name: it underlines when the tile is hovered or focused. */
export const GARMENT_NAME = `${GARMENT_NAME_TEXT} group-[:hover]/tile:underline group-focus-visible/tile:underline`

/** A mono stat line. */
export const GARMENT_STAT =
  'font-mono text-[0.75rem] leading-[normal] font-normal text-muted-foreground'

/** Today's page: one column that may shrink (a bare grid track is as wide as
 *  its widest child's min-content, and the nowrap chip rows pushed the page
 *  sideways). */
export const TODAY = 'grid grid-cols-[minmax(0,1fr)] gap-4'
export const TODAY_WEATHER =
  'flex flex-wrap items-baseline gap-x-4 gap-y-2 px-4 py-3'
export const TODAY_TEMPS = 'whitespace-nowrap tabular-nums'
export const TODAY_LOW = 'text-[1.75rem] font-semibold'
export const TODAY_HIGH = 'text-[1.125rem] text-muted-foreground'
export const TODAY_SENTENCE =
  'flex-[1_1_14rem] text-[0.875rem] text-muted-foreground'
/** The hours wrap under the read on a phone: flex-wrap does it. */
export const TODAY_HOURS = `flex list-none flex-wrap gap-x-3 gap-y-1 ${GARMENT_STAT} [&_span]:text-muted-foreground`
export const TODAY_CARD = 'grid gap-3 p-4'
export const TODAY_KICKER = `${GARMENT_STAT} tracking-[0.04em] uppercase`
export const TODAY_REASON = 'text-[1rem] text-muted-foreground'
export const TODAY_ACTS = 'flex flex-wrap gap-2'
export const TODAY_WORN = 'text-muted-foreground'
/** The status line stays mounted so a screen reader hears each change; it
 *  takes no room while nothing is running. */
export const TODAY_STATUS = 'empty:m-0'
/** The alternatives: two across, one under 640px and in the phone shell. */
export const TODAY_ALTS =
  'grid list-none grid-cols-[repeat(2,minmax(0,1fr))] gap-4 max-[640px]:grid-cols-[minmax(0,1fr)] [.admin-app-phone_&]:grid-cols-[minmax(0,1fr)]'
export const TODAY_ALT =
  'grid content-start justify-items-start gap-2 px-4 py-3'
export const TODAY_ALT_NAMES =
  'max-w-full overflow-hidden text-[0.875rem] text-ellipsis whitespace-nowrap'
export const TODAY_ALT_REASON = 'text-[0.8125rem] text-muted-foreground'
export const TODAY_FOOTNOTE = `${GARMENT_STAT} [&_p]:m-0`
export const TODAY_SHEET_BODY = 'grid gap-3 p-4 [&_h2]:text-[1.125rem]'
/** A garment in the Match sheet's closet list: a button that looks like its
 *  tile, with the ring when focused. */
export const TODAY_PICK =
  'w-full cursor-pointer bg-transparent p-0 text-left [border:0] [font:inherit] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-primary'

/** An outfit as small squares: Today's alternatives and the Home card. */
export const OUTFIT_SWATCHES = 'inline-flex gap-1'
export const OUTFIT_SWATCH =
  'block aspect-[4/5] w-[1.6rem] overflow-hidden rounded-[3px] border border-border bg-muted [&_img]:block [&_img]:h-full [&_img]:w-full [&_img]:object-cover'

/** The outfit board: outer and top over bottom over shoes, accessories
 *  beside. `small` is an alternative's version, as decoration. */
export const BOARD =
  'group/board grid max-w-[34rem] grid-cols-[minmax(0,1fr)] gap-3 data-[aside=true]:grid-cols-[minmax(0,1fr)_minmax(0,0.45fr)] data-[size=small]:w-[7.5rem] data-[size=small]:gap-1'
export const BOARD_COLUMN =
  'grid content-start gap-3 group-data-[size=small]/board:gap-1'
export const BOARD_ROW =
  'grid list-none grid-cols-[repeat(var(--pieces,1),minmax(0,1fr))] gap-3 group-data-[size=small]/board:gap-1'
export const BOARD_ROW_ASIDE =
  'grid list-none grid-cols-[minmax(0,1fr)] gap-3 group-data-[size=small]/board:gap-1'
export const PIECE = 'group/piece relative grid min-w-0 content-start gap-1'
/** A piece's picture. The locked piece takes an --accent outline (3.49 dark
 *  on --surface, 5.71 light at worst) next to its "Built around" pill; a
 *  piece not yet saved has a dashed edge. */
export const PIECE_PIC =
  'flex aspect-square items-center justify-center overflow-hidden rounded-md border border-border group-data-[locked=true]/piece:outline-2 group-data-[locked=true]/piece:outline-offset-2 group-data-[locked=true]/piece:outline-solid group-data-[locked=true]/piece:outline-primary group-data-[size=small]/board:rounded-[3px] group-data-[slot=bottom]/piece:aspect-[4/3] group-data-[slot=shoes]/piece:aspect-[3/1] group-data-[transient=true]/piece:border-dashed'
/** The ground of a piece with no photo: its colour family's token, else the
 *  neutral one. */
export const PIECE_GROUND = {
  none: 'bg-muted',
  black: 'bg-(--gc-black)',
  white: 'bg-(--gc-white)',
  grey: 'bg-(--gc-grey)',
  navy: 'bg-(--gc-navy)',
  blue: 'bg-(--gc-blue)',
  green: 'bg-(--gc-green)',
  red: 'bg-(--gc-red)',
  orange: 'bg-(--gc-orange)',
  yellow: 'bg-(--gc-yellow)',
  pink: 'bg-(--gc-pink)',
  purple: 'bg-(--gc-purple)',
  brown: 'bg-(--gc-brown)',
  beige: 'bg-(--gc-beige)',
  tan: 'bg-(--gc-tan)',
}
export const PIECE_IMG = 'block h-full w-full object-contain'
export const PIECE_NAME = 'text-[0.875rem] [overflow-wrap:anywhere]'
export const PIECE_COLOR = 'text-[0.8125rem] text-muted-foreground'
export const PIECE_ACTS = 'flex flex-wrap gap-1'

// ---- The list view and the toolbar (#536, slice D5) -----------------------

/** The Closet's toolbar: filters at the start, view and add at the end. */
export const CLOSET_TOOLBAR =
  'mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-3 [&>*]:max-w-full [&>*]:min-w-0'
export const CLOSET_TOOLBAR_END = 'flex flex-wrap items-center gap-x-3 gap-y-2'

/** The list view's table, scrolling inside its own box. */
export const GARMENT_TABLE_WRAP =
  'overflow-x-auto rounded-md border border-border bg-card px-3 py-1'
export const GARMENT_TABLE =
  'w-full border-collapse text-[0.875rem] [&_tbody>tr:last-child>td]:[border-bottom:0]'
export const GARMENT_TH =
  'border-b border-b-border p-2 text-left text-[0.75rem] font-medium text-muted-foreground'
export const GARMENT_TD = 'border-b border-b-border p-2 align-middle'
/** Type, Last worn and Season drop out on a phone. */
export const HIDE_PHONE = 'max-[640px]:hidden'
export const GARMENT_ROW_NAME =
  'inline-flex items-center gap-2 text-foreground [overflow-wrap:anywhere]'
export const GARMENT_THUMB =
  'aspect-[4/5] w-8 flex-none overflow-hidden rounded-[3px] bg-muted [&_img]:block [&_img]:h-full [&_img]:w-full [&_img]:object-cover'
export const GARMENT_WEARS = 'inline-flex items-center gap-2'
/** The wear meter: --accent on a --sunken track, 4.77:1 dark and 5.23:1
 *  light (a non-text mark; the number beside it carries the value). */
export const GARMENT_METER =
  'block h-1 w-16 overflow-hidden rounded-[2px] bg-muted [&_i]:block [&_i]:h-full [&_i]:bg-primary'
export const GARMENT_TRAIL_CELL = 'text-right whitespace-nowrap'
