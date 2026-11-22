import { GARMENT_STAT } from './closetClasses.js'

// The Closet review deck, its banner, the sell sheet and the undo toast
// (#536, slice D5). The class names stay on the elements as hooks; the look
// is these utilities. The base layer zeroes margin and padding on every
// element, so a rule that said `margin: 0` is not repeated.

/** The season-turn and due-back banner. */
export const REVIEW_BANNER =
  'mb-4 rounded-md bg-(--accent-soft) px-4 py-3 [&_p]:mb-2'
export const REVIEW_BANNER_ACTS = 'flex flex-wrap items-center gap-x-3 gap-y-2'

/** The deck: a piece at a time. */
export const REVIEW_DECK = 'mt-6 max-w-[34rem]'
export const REVIEW_PROGRESS =
  'mb-2 font-mono text-[0.75rem] leading-[normal] font-medium text-muted-foreground'
/** The bar's track; the line above it says the same in words. */
export const REVIEW_BAR =
  'mb-4 h-[3px] overflow-hidden rounded-[2px] bg-muted [&_span]:block [&_span]:h-full [&_span]:bg-primary'
export const REVIEW_CARD =
  'grid grid-cols-[8rem_1fr] gap-4 p-4 [align-items:start] max-[640px]:grid-cols-[1fr]'
const THUMB_IMG =
  '[&_img]:block [&_img]:h-full [&_img]:w-full [&_img]:object-cover'
export const REVIEW_THUMB = `block aspect-square w-32 overflow-hidden rounded-md bg-muted max-[640px]:w-28 ${THUMB_IMG}`
export const REVIEW_NAME = 'mb-1 text-[1.125rem] [overflow-wrap:anywhere]'
export const REVIEW_STAT = `${GARMENT_STAT} mb-3`

/** The evidence: a bullet per flag. The bullets are decorative: a data flag
 *  is filled warn, the model's opinion hollow, and the word "Opinion:"
 *  carries the difference. */
export const EVIDENCE = 'grid list-none gap-2'
const EVIDENCE_ITEM =
  "relative pl-4 before:absolute before:top-[0.5em] before:left-0 before:h-2 before:w-2 before:rounded-[50%] before:content-['']"
export const EVIDENCE_FLAG = `${EVIDENCE_ITEM} before:bg-chart-4`
export const EVIDENCE_OPINION = `${EVIDENCE_ITEM} text-muted-foreground before:box-border before:border-[1.5px] before:border-solid before:border-(--text-3) [&_strong]:font-semibold`

/** The four outcomes, equal buttons; the suggested one has a border and a
 *  fill (and ", suggested" in its name). */
export const OUTCOME_ROW =
  'mt-4 grid grid-cols-[repeat(4,1fr)] gap-2 max-[640px]:grid-cols-[repeat(2,1fr)]'
export const OUTCOME =
  'grid cursor-pointer gap-[0.15rem] rounded-md border border-border bg-card p-2 text-center text-foreground [font:inherit] hover:border-(--text-3) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-primary disabled:cursor-default disabled:opacity-60 data-suggested:border-primary data-suggested:bg-(--accent-soft)'
export const OUTCOME_LABEL = 'font-semibold'
export const OUTCOME_HINT = 'text-[0.75rem] text-muted-foreground'

/** Pack away's month. */
export const PACK_MONTH = 'mt-4 flex flex-wrap items-center gap-2'
export const PACK_INPUT =
  'rounded-md border border-border bg-card px-2 py-1 text-foreground [font:inherit]'
export const REVIEW_SKIP = 'mt-3'

/** Listed for sale, each with Mark sold. */
export const REVIEW_LISTED = 'mt-6 max-w-[34rem] p-4 [&_h2]:mb-2'
export const REVIEW_LISTED_LIST = 'grid list-none gap-2'
export const REVIEW_LISTED_ROW =
  'flex flex-wrap items-center justify-between gap-4 [&>span]:min-w-0 [&>span]:[overflow-wrap:anywhere]'

/** The sell sheet's listing checklist. */
export const SELL_CHECK = 'grid grid-cols-[6rem_1fr] gap-4 [align-items:start]'
export const SELL_THUMB = `block aspect-square w-24 overflow-hidden rounded-md bg-muted ${THUMB_IMG}`
export const SELL_LINES = 'grid gap-1'
export const SELL_LINE = 'grid grid-cols-[6rem_1fr] gap-2'
export const SELL_TERM = `${GARMENT_STAT} pt-[0.15rem] uppercase`
export const SELL_COPIED = 'min-h-[1.4em]'
export const SELL_BODY = 'grid gap-3 p-4'
export const SELL_ACTIONS = 'flex flex-wrap justify-end gap-2'

/** The undo toast after an outcome. */
export const CLOSET_TOAST =
  'mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-md border border-border bg-card px-4 py-2 [&_strong]:font-semibold'
export const CLOSET_TOAST_ACTS = 'flex gap-2'
