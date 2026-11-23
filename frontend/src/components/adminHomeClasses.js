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
export const HEAD_DESC =
  'mt-1 text-sm text-muted-foreground [overflow-wrap:anywhere]'

/** The right-hand slot: it drops under the title when it does not fit. */
export const HEAD_END = 'ml-auto flex flex-wrap items-center gap-x-3 gap-y-2'

/** One group of controls in the right-hand slot (primary links, the view
 *  toggle): it wraps inside itself, so opening a confirm in one group never
 *  moves another (#495). */
export const HEAD_GROUP = 'flex flex-wrap items-center gap-2'

/** The bulk actions (Publish all, Hide all, Refresh metadata): a group of
 *  their own, set off from the primary controls by a rule beside it on a
 *  desktop and a row of its own on a phone. */
export const HEAD_BULK =
  'flex flex-wrap items-center gap-2 max-[700px]:basis-full min-[701px]:border-l min-[701px]:border-line-card min-[701px]:pl-3'

/** A plain text link in the right-hand slot ("View /shelf/games"): it reaches
 *  the 24px floor (WCAG 2.5.8, #505). `inline-block` keeps the space before an
 *  arrow, which `inline-flex` would drop. A Button drawn as a link has its own
 *  box and target. */
export const HEAD_LINK = 'inline-block min-h-6 py-1'

/** Status in a header or a job row: a dot and the word, never the dot alone.
 *  Dots on --surface: ok and warn as measured in the token block; --text-3
 *  (unknown) at least 4.89 dark and 6.54 light. Failed is also squared, so
 *  stale and failed differ in shape as well as in the word. */
export const STATUS_TEXT =
  'inline-flex items-center gap-2 font-mono leading-[normal] font-medium'

/** The words' size and colour: the small muted word, or the Weekend weather
 *  verdict's, which is the page's text colour at 13px. */
export const STATUS_WORDS = 'text-[0.75rem] text-muted-foreground'
export const STATUS_WORDS_STRONG = 'text-[0.8125rem] text-foreground'

const DOT = 'size-2 flex-none'

/** The dot by state: the shape and the fill each state has. */
export const DOT_OK = `${DOT} rounded-[50%] bg-[color:var(--ok)]`
export const DOT_STALE = `${DOT} rounded-[50%] bg-[color:var(--warn)]`
export const DOT_FAILED = `${DOT} rounded-[1px] bg-[color:var(--warn)]`
export const DOT_UNKNOWN = `${DOT} rounded-[50%] bg-[color:var(--text-3)]`

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
export const PANEL_ACTION = `[&_a]:inline-flex [&_a]:min-h-6 [&_a]:items-center [&_a]:gap-1 [&_a]:text-sm [&_a]:text-accent-text [&_a]:underline [&_a]:underline-offset-4 [&_a]:hover:no-underline [&_a]:focus-visible:outline-2 [&_a]:focus-visible:outline-solid [&_a]:focus-visible:outline-offset-2 [&_a]:focus-visible:outline-ring max-[700px]:[&_a]:min-h-11`

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

export const AREA_COVER =
  'w-[2.4rem] [&:has(.outfit-swatches)]:w-auto [&_.cover]:block [&_.cover]:aspect-[3/4] [&_.cover]:overflow-hidden [&_.cover]:rounded-[3px] [&_.cover]:border [&_.cover]:border-border [&_img]:h-full [&_img]:w-full [&_img]:object-cover'

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
  'disabled:pointer-events-auto! disabled:cursor-not-allowed disabled:border-dashed disabled:border-border! disabled:bg-secondary! disabled:text-muted-foreground! disabled:opacity-100! disabled:hover:brightness-100'

/** Home's primary and plain small buttons. */
export const PRIMARY = `${btn('primary', 'sm')} ${CALM}`
export const PLAIN = `${btn('plain', 'sm')} ${CALM}`

/** A button that looks like its neighbour link ("Change", "Run now"). */
export const LINK_BUTTON = `${LINK} disabled:pointer-events-auto! disabled:cursor-not-allowed disabled:aria-busy:cursor-progress! disabled:text-muted-foreground! disabled:no-underline disabled:opacity-100! disabled:hover:no-underline`

/**
 * The jobs table: six columns (job, what it does, last run, next run, status,
 * actions) from 1180px, where the main column is about 880px wide. Below that
 * each row is stacked: the job and what it does across the top, the two times
 * side by side under their own small labels, then the status and the actions.
 * The head is read by assistive tech only when stacked. No column is empty: a
 * job that has never run says so in its time cell.
 */
export const JOB_LIST = 'w-full border-collapse text-sm max-[1179px]:block'

export const JOB_HEAD = 'max-[1179px]:sr-only'

export const JOB_BODY = 'max-[1179px]:block'

export const JOB_ROW =
  'group/row max-[1179px]:grid max-[1179px]:grid-cols-2 max-[1179px]:gap-x-3 max-[1179px]:gap-y-2 max-[1179px]:border-t max-[1179px]:border-line-card max-[1179px]:py-3 max-[1179px]:first:border-t-0'

export const JOB_HEAD_CELL =
  'border-b border-line-card px-3 py-2 text-left font-mono text-xs font-semibold tracking-wider text-muted-foreground uppercase'

/** A cell: a top rule between rows from 1180px, none when stacked. */
const JOB_CELL =
  'min-w-0 border-t border-line-card px-3 py-3 text-left align-top group-first/row:border-t-0 max-[1179px]:border-t-0 max-[1179px]:p-0'

export const JOB_NAME = `${JOB_CELL} font-medium text-foreground [overflow-wrap:break-word] max-[1179px]:col-span-full`

export const JOB_PURPOSE = `${JOB_CELL} text-muted-foreground [overflow-wrap:anywhere] max-[1179px]:col-span-full`

/** Last run and next run: the distance, then the exact time under it. */
export const JOB_WHEN = `${JOB_CELL} min-[1180px]:whitespace-nowrap`

export const JOB_STATE_CELL = `${JOB_CELL} [overflow-wrap:anywhere] max-[1179px]:col-span-full`

/** The stacked layout's small label over a cell; hidden when the head shows. */
export const JOB_CELL_LABEL =
  'block font-mono text-xs tracking-wider text-muted-foreground uppercase min-[1180px]:hidden'

export const JOB_DISTANCE = 'block text-foreground'

export const JOB_EXACT = 'block font-mono text-xs text-muted-foreground'

export const JOB_SUMMARY =
  'mt-1 block text-[0.8125rem] text-muted-foreground [&_a]:text-foreground [&_a]:underline [&_a]:decoration-primary [&_a]:decoration-1 [&_a]:underline-offset-4'

export const JOB_ACTIONS = `${JOB_CELL} max-[1179px]:col-span-full`

/** The links and button in the actions cell, stacked from 1180px. */
export const JOB_ACTIONS_INNER =
  'flex flex-wrap items-center gap-x-3 gap-y-1 min-[1180px]:flex-col min-[1180px]:items-start'

export const JOB_RESULT = 'text-[0.8125rem] text-muted-foreground empty:hidden'

export const JOB_RESULT_FAILED = 'text-[0.8125rem] text-foreground'

/** The line under the table: when the times are. */
export const JOB_NOTE = 'mt-3 text-[0.8125rem] text-muted-foreground'

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
  'border-b border-line-card px-3 py-2 text-left group-last/row:border-b-0 max-[700px]:border-b-0 max-[700px]:px-0 max-[700px]:py-1'

/** The item cell takes the whole row on a phone. */
/** Item and change words may break anywhere, so a long one cannot widen the table. */
export const TD_WORDS = `${TD} [overflow-wrap:anywhere]`

export const TD_ITEM = `${TD_WORDS} max-[700px]:col-span-full`

/** The time stays on one line where there is room. */
export const TD_WHEN = `${TD} font-mono text-xs text-muted-foreground min-[701px]:whitespace-nowrap`

/** A link in a table cell: the item's name, underlined in the accent. */
export const TEXT_LINK =
  'inline-block py-1 text-foreground underline decoration-primary decoration-[1.5px] underline-offset-4 outline-none hover:no-underline focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring max-[700px]:min-h-11 max-[700px]:py-3'

/** The swap sheet. */
export const SWAP_BODY = 'grid gap-3 p-4'

export const SWAP_TITLE = 'm-0 font-heading text-lg font-medium'

export const SWAP_SLOTS = 'flex flex-wrap gap-2'

export const SWAP_LIST = 'm-0 grid list-none gap-2 p-0'

export const SWAP_CHOICE = `flex min-h-11 w-full min-w-0 cursor-pointer items-center gap-3 rounded-md border border-border bg-card p-2 text-left font-sans text-base text-foreground transition-colors hover:border-foreground focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring`

export const SWAP_CHOICE_TEXT = 'grid min-w-0 gap-0.5 [overflow-wrap:anywhere]'

export const SWAP_ACTIONS = 'flex justify-end'

export const SWAP_CANCEL = `${btn('plain')} ${TAP}`
