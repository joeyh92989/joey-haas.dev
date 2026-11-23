// Play next, Radar, Discover and Rate a few (#536, group G1): what the legacy
// `.play-next-*`, `.up-next*`, `.pick-*` (the cards and their grid),
// `.shelf-nudge`, `.radar-*`, `.discover-*`, `.rec-genres` and `.rate-a-few*`
// rules drew, as utilities. Plain strings with no imports. The old class names
// stay on the elements as hooks that tests, e2e and the style dump read.
//
// A phone here is `max-width: 700px` (inclusive), written as a media query:
// Tailwind's `max-[700px]:` is strictly below. Spacing steps are Tailwind's
// 0.25rem unit: the old `--space-5` (1.5rem) is `6`, `--space-6` is `8`.

/** A bare button in Play next's cards and Up next: a small outline button. The
 *  hover is a plain `:hover` (the old rule also applied on touch). */
export const PLAY_BTN =
  'cursor-pointer rounded-[8px] border border-border bg-card px-2 py-1 text-foreground [font-family:inherit] [font-style:inherit] [font-weight:inherit] [line-height:inherit] [font-size:var(--fs-13)] [&:hover:not(:disabled)]:border-(--accent) focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-(--accent) disabled:cursor-default disabled:opacity-50'

/** The nudge to rate a few games. */
export const SHELF_NUDGE =
  'mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[8px] border border-border bg-card px-4 py-3'

export const PLAY_NEXT_CONTROLS = 'mt-4 mb-6 flex flex-col gap-2'

/** The pinned game above the picks. */
export const UP_NEXT =
  'my-4 flex items-center gap-4 rounded-[8px] border border-border border-l-[3px] border-l-(--status-active) bg-card px-4 py-3'
export const UP_NEXT_COVER = 'flex-[0_0_4rem]'
export const UP_NEXT_H2 = 'mb-2'

export const PICK_GRID =
  'mb-4 grid grid-cols-[repeat(auto-fit,minmax(17rem,1fr))] gap-(--grid-gap)'
export const PICK_CARD =
  'flex flex-col gap-3 rounded-[8px] border border-border bg-card p-4'
export const PICK_BODY = 'flex gap-3'
export const PICK_COVER = 'flex-[0_0_5.5rem]'
export const PICK_CARD_H2 = 'mb-1 [font-size:var(--fs-18)]'
export const PICK_META =
  'mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 [font-size:var(--fs-13)]'
export const PICK_REASONS =
  'm-0 list-disc pl-4 [font-size:var(--fs-14)] [&>li+li]:mt-1'
export const PICK_ACTIONS = 'mt-auto flex flex-wrap gap-2'
/** "Play this" pins and starts the game; the line under it says so. */
export const PICK_PLAY = 'inline-flex flex-col gap-[0.15rem]'
export const PICK_PLAY_HINT = 'text-(--text-3) [font-size:var(--fs-12)]'

// ---------- Radar and Discover ----------

export const RADAR_HEADER = 'mt-4 mb-2 flex flex-wrap items-center gap-3'
export const RADAR_MONTH = 'mt-4 mb-2 [font-size:var(--fs-16)]'
export const RADAR_CARDS =
  'grid grid-cols-[repeat(auto-fill,minmax(min(100%,22rem),1fr))] gap-(--grid-gap)'
/** The card surface comes from BOX (addClasses.js). */
export const RADAR_CARD = 'grid grid-cols-[5.5rem_minmax(0,1fr)] gap-3 p-3'
export const RADAR_COVER = '[&_img]:w-full [&_img]:rounded-[4px]'
/** A long or unbroken title wraps inside the card instead of widening it. */
export const RADAR_BODY =
  'min-w-0 [overflow-wrap:anywhere] [&_h3]:mb-1 [&_h3]:[font-size:var(--fs-16)] [&_p]:mb-2'
/** A link inside running text is underlined: colour alone does not set it
 *  apart (axe link-in-text-block). */
const LINK_UNDERLINED = '[&_a]:underline [&_a]:underline-offset-[0.15em]'
export const RADAR_LIST = `mb-2 list-disc pl-4 [font-size:var(--fs-14)]`
export const RADAR_STORES = `${RADAR_LIST} ${LINK_UNDERLINED}`
export const RADAR_BUTTONS = 'flex flex-wrap gap-2'
export const RADAR_DIGITAL = `mt-6 [&_summary]:cursor-pointer [&_summary]:font-semibold [@media(max-width:700px)]:[&_summary]:py-3`
export const RADAR_SUMMARY_TITLE = 'inline [font-size:var(--fs-20)]'
export const RADAR_WATCH_NOTE = `mt-1 mb-0 [font-size:var(--fs-14)] ${LINK_UNDERLINED}`
export const REC_GENRES = 'mb-2 p-0'

export const DISCOVER_CONTROLS = 'mt-4 flex flex-wrap gap-x-6 gap-y-4'
export const DISCOVER_CHOICE =
  'm-0 p-0 [border:0] [&_legend]:mb-2 [&_legend]:font-semibold [&_label]:mr-3 [&_p]:mt-2 [&_p]:[font-size:var(--fs-14)]'

// ---------- Rate a few ----------

/** The card surface comes from BOX (addClasses.js). */
export const RATE_A_FEW =
  'my-6 px-4 py-3 [&_h2]:mb-1 [&_h2]:[font-size:var(--fs-18)]'
/** A table; on a phone each game is its own block: the title gets the full
 *  width, the stars and the saved score sit under it. */
export const RATE_A_FEW_TABLE = [
  'my-3 w-full max-w-[45rem] border-collapse',
  '[&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:align-middle',
  '[&_td]:px-2 [&_td]:py-1 [&_td]:text-left [&_td]:align-middle',
  '[&_thead_th]:[border-bottom:1px_solid_var(--line)] [&_thead_th]:font-semibold [&_thead_th]:text-muted-foreground [&_thead_th]:[font-size:var(--fs-13)]',
  // A long title wraps rather than pushing the table past a phone's width:
  // hyphenated where the language allows, broken anywhere as a last resort.
  '[&_tbody_th]:font-normal [&_tbody_th]:hyphens-auto [&_tbody_th]:[overflow-wrap:anywhere]',
  // Stripes on --bg: in the dark theme --surface is the panel's own color.
  // The row being rated lights up on --sunken.
  '[&_tbody_tr:nth-child(even):not(:hover,:focus-within)]:bg-background',
  '[&_tbody_tr:hover]:bg-(--sunken) [&_tbody_tr:focus-within]:bg-(--sunken)',
  `[@media(max-width:700px)]:block`,
  `[@media(max-width:700px)]:[&_thead]:absolute [@media(max-width:700px)]:[&_thead]:h-px [@media(max-width:700px)]:[&_thead]:w-px [@media(max-width:700px)]:[&_thead]:overflow-hidden [@media(max-width:700px)]:[&_thead]:[clip-path:inset(50%)]`,
  `[@media(max-width:700px)]:[&_tbody]:block [@media(max-width:700px)]:[&_tr]:block [@media(max-width:700px)]:[&_th]:block [@media(max-width:700px)]:[&_tr]:py-2`,
  `[@media(max-width:700px)]:[&_td]:inline-block`,
].join(' ')
export const RATE_A_FEW_NOTE = 'text-muted-foreground [font-size:var(--fs-14)]'
export const RATE_A_FEW_ACTIONS = 'flex flex-wrap gap-2'

/** A genre under a pick: a plain outlined pill in a wrapping row. */
export const ITEM_CHIPS = 'm-0 flex list-none flex-wrap gap-2 p-0'
export const ITEM_CHIP =
  'rounded-[999px] border border-border px-3 py-[0.15rem] text-muted-foreground [font-size:var(--fs-13)]'
