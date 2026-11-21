import { buttonVariants } from './ui/button-variants.js'
import { btn } from './closetClasses.js'

// Admin Home, Jobs and the admin page header, drawn from the Button, Card and
// Input looks (#535). Plain strings, no Base UI and no `cn`, so the header,
// panel and card can all take them. The hook classes (`admin-head`, `panel`,
// `area-card`, `job-row` ...) stay on the elements as test hooks and for the
// pages that still read them (#536); the look is these utilities.
//
// Where a string joins a `buttonVariants` look with more classes, the extras
// set no colour, padding or opacity the look already sets (or are marked `!`),
// so the sheet's order cannot decide (`classCollisions.test.js`).

// #276: 44px tall on a phone.
const TAP = 'max-[700px]:min-h-11'

/** The page header: title and description at the left, status or controls at
 *  the right, a hairline under both. */
export const HEAD =
  'mb-6 flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-line-card pb-4'

/** The header's text cell: it may shrink, so a long title wraps. */
export const HEAD_TEXT = 'min-w-0'

/** The page's title. */
export const HEAD_TITLE =
  'font-heading text-2xl leading-tight font-medium tracking-tight [overflow-wrap:anywhere]'

/** One muted line under the title. */
export const HEAD_DESC = 'mt-1 text-sm text-muted-foreground'

/** The right-hand slot: it drops under the title when it does not fit. */
export const HEAD_END = 'ml-auto flex flex-wrap items-center gap-x-3 gap-y-2'

/** The header's status line: one dot-and-word per state, side by side. */
export const HEAD_STATUS = 'flex flex-wrap items-center gap-x-3 gap-y-2'

/** A link in running chrome ("Today →", "Jobs →"): the accent link, 24px
 *  tall on a desktop and 44px on a phone. */
export const LINK = `${buttonVariants({ variant: 'link', size: 'bare' })} min-h-6 text-sm ${TAP}`

/** A panel: Card's surface (1px outline, 6px radius, the card colour),
 *  without Card's flex layout or its clipping overflow. */
export const PANEL =
  'min-w-0 rounded-md border border-border bg-card text-card-foreground'

/** A panel's header bar: the heading and an optional link. */
export const PANEL_HEAD =
  'flex items-center justify-between gap-3 border-b border-line-card px-4 py-3'

/** A panel's heading: the serif, as a detail page's panels. */
export const PANEL_TITLE =
  'font-heading text-lg leading-tight font-medium text-foreground'

/** A link in the header bar. */
export const PANEL_ACTION = `[&_a]:inline-flex [&_a]:min-h-6 [&_a]:items-center [&_a]:gap-1 [&_a]:text-sm [&_a]:text-accent-text [&_a]:underline [&_a]:underline-offset-4 [&_a]:hover:no-underline max-[700px]:[&_a]:min-h-11`

/** A panel's body. */
export const PANEL_BODY = 'p-4'

/** The area cards on Home: two across, one up to the phone shell's 900px. */
export const AREA_CARDS = 'mb-4 grid grid-cols-2 gap-4 max-[900px]:grid-cols-1'

/** One area card: a panel with 16px inside and a grid of its parts. */
export const AREA_CARD =
  'm-0 grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-2 rounded-md border border-border bg-card p-4 text-card-foreground'

export const AREA_HEAD = 'flex items-baseline justify-between gap-4'

export const AREA_TITLE_H2 =
  'm-0 font-heading text-lg leading-tight font-medium text-foreground'

/** A lead beside its cover. */
export const AREA_LEAD_COVER =
  'grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3'

export const AREA_COVER = 'w-[2.4rem] [&:has(.outfit-swatches)]:w-auto'

/** The lead's title: it wraps, however long its one word. */
export const AREA_TITLE =
  'm-0 text-base leading-snug font-medium text-foreground [overflow-wrap:anywhere]'

export const AREA_META =
  'm-0 text-sm text-muted-foreground [overflow-wrap:anywhere]'

/** The card's figures: label, then value, wrapping as a row of pairs. */
export const AREA_FIGURES =
  'm-0 flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground [&_dd]:m-0 [&_dd]:font-semibold [&_dd]:text-foreground [&_dd]:[overflow-wrap:anywhere] [&>div]:flex [&>div]:min-w-0 [&>div]:gap-1'

export const AREA_ACTIONS = 'flex flex-wrap items-center gap-2'

/** What a disabled button shows: the words and the outline in the page's own
 *  colours, not the look dimmed to 55% (a dimmed accent fill measured under
 *  4.5:1). `!` because the look sets the opacity and the fill itself. */
export const CALM =
  'disabled:border-border! disabled:bg-secondary! disabled:text-muted-foreground! disabled:opacity-100!'

/** Home's primary and plain small buttons. */
export const PRIMARY = `${btn('primary', 'sm')} ${CALM}`
export const PLAIN = `${btn('plain', 'sm')} ${CALM}`

/** A button that looks like its neighbour link ("Change", "Run now"). */
export const LINK_BUTTON = `${LINK} disabled:text-muted-foreground! disabled:no-underline disabled:opacity-100!`

/** The jobs list: no bullets. */
export const JOB_LIST = 'm-0 list-none p-0'

/** A job row. A phone stacks the time, the job, then the state and the
 *  actions. From 1000px (the rail and page list narrow the main column, so it
 *  is not 700) the time sits over the job at the left and the state and the
 *  actions stand to its right: no column is a fixed width, so a job that has
 *  never run leaves no wide empty one. */
export const JOB_ROW =
  'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 border-t border-line-card py-3 text-sm first:border-t-0 min-[1000px]:grid-cols-[minmax(0,1fr)_auto_auto]'

export const JOB_WHEN =
  'col-span-full font-mono text-xs whitespace-nowrap text-muted-foreground min-[1000px]:col-span-1 min-[1000px]:col-start-1 min-[1000px]:row-start-1'

export const JOB_TEXT =
  'col-span-full flex min-w-0 flex-col [overflow-wrap:anywhere] min-[1000px]:col-span-1 min-[1000px]:col-start-1 min-[1000px]:row-start-2'

/** The state and the actions, beside the pair at the left. */
export const JOB_STATE =
  'min-[1000px]:col-start-2 min-[1000px]:row-span-2 min-[1000px]:row-start-1'

export const JOB_LABEL = 'text-foreground'

export const JOB_SUMMARY =
  'text-[0.8125rem] text-muted-foreground [&_a]:text-foreground [&_a]:underline [&_a]:decoration-primary [&_a]:underline-offset-4'

export const JOB_ACTIONS =
  'min-[1000px]:col-start-3 min-[1000px]:row-span-2 min-[1000px]:row-start-1 inline-flex flex-wrap items-center justify-end gap-x-3 gap-y-1'

export const JOB_RESULT = 'text-[0.8125rem] text-muted-foreground empty:hidden'

export const JOB_RESULT_FAILED = 'text-[0.8125rem] text-foreground'

/** The Jobs table: three short columns on the automatic layout, so spare
 *  width goes to each in proportion to its words and none is left empty.
 *  Words wrap, and a long one breaks, so it fits 320px without a scroller. */
export const TABLE = 'w-full border-collapse text-sm max-[700px]:block'

/** On a phone the table is stacked: the item over the change and the time, so
 *  no column is squeezed to a few letters. The head is read by assistive tech
 *  only (the cells keep their roles). */
export const THEAD = 'max-[700px]:sr-only'

export const TBODY = 'max-[700px]:block'

export const TR =
  'group/row max-[700px]:grid max-[700px]:grid-cols-[minmax(0,1fr)_auto] max-[700px]:gap-x-3 max-[700px]:border-b max-[700px]:border-line-card max-[700px]:py-2 max-[700px]:last:border-b-0'

export const TH =
  'border-b border-line-card px-3 py-2 text-left font-mono text-xs font-semibold tracking-wider text-muted-foreground uppercase'

export const TD =
  'border-b border-line-card px-3 py-2 text-left [overflow-wrap:anywhere] group-last/row:border-b-0 max-[700px]:border-b-0 max-[700px]:px-0 max-[700px]:py-1'

/** The item cell takes the whole row on a phone. */
export const TD_ITEM = `${TD} max-[700px]:col-span-full`

/** A link in a table cell: the item's name, underlined in the accent. */
export const TEXT_LINK =
  'inline-block py-1 text-foreground underline decoration-primary decoration-[1.5px] underline-offset-4 hover:no-underline max-[700px]:min-h-11 max-[700px]:py-3'

/** The swap sheet. */
export const SWAP_BODY = 'grid gap-3 p-4'

export const SWAP_TITLE = 'm-0 font-heading text-lg font-medium'

export const SWAP_SLOTS = 'flex flex-wrap gap-2'

export const SWAP_LIST = 'm-0 grid list-none gap-2 p-0'

export const SWAP_CHOICE = `flex min-h-11 w-full min-w-0 cursor-pointer items-center gap-3 rounded-md border border-border bg-card p-2 text-left font-sans text-base text-foreground transition-colors hover:border-foreground focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring`

export const SWAP_CHOICE_TEXT = 'grid min-w-0 gap-0.5 [overflow-wrap:anywhere]'

export const SWAP_ACTIONS = 'flex justify-end'

export const SWAP_CANCEL = `${btn('plain')} ${TAP}`
