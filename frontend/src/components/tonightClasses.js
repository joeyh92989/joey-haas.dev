// What's next, Tonight, Play next's cards and the shared next-row (#536, group
// G1): what the legacy `.tonight*`, `.next-*`, `.pick-*` (the cards), `.size-pill`
// and `.up-next*` rules drew, as utilities. Plain strings with no imports, so
// the eager Next page and its cards and the lazy admin pages can all take them.
// The old class names stay on the elements as hooks that tests, e2e and the
// style dump read.
//
// A phone here is `max-width: 34rem` (inclusive), written as a media query:
// Tailwind's `max-[34rem]:` is strictly below. Every variant is written out in
// full: Tailwind finds a class by scanning the text, so a prefix joined on by
// a template would be missed. Spacing steps are Tailwind's
// 0.25rem unit: the old `--space-5` (1.5rem) is `6`, `--space-6` is `8`.
// A target that scrolls to a heading clears the sticky jump row.
const SCROLL_CLEAR = 'scroll-mt-[calc(3.5rem+env(safe-area-inset-top,0px))]'

/** How big a pick is, as a pill: the band as text, never colour alone. */
export const SIZE_PILL =
  'rounded-[999px] border border-(--line-strong) px-2 text-foreground [font-size:var(--fs-12)] leading-[1.5]'

/** A card's slot label ("Best fit"): small caps in the accent ink. */
export const PICK_SLOT =
  'm-0 font-semibold tracking-[0.06em] text-accent-text uppercase [font-size:var(--fs-12)]'

// ---------- What's next: the page and its sections ----------

export const NEXT_TITLE = 'm-0 [font-size:var(--fs-28)]'
export const NEXT_FRESH = 'mt-2 mb-0 [font-size:var(--fs-14)]'

/** A section's heading: the jump links point at it, so the scroll margin sits
 *  on it. The heading is 24px at every depth the page draws it. */
export const NEXT_H2 = `${SCROLL_CLEAR} mb-2 [font-size:var(--fs-24)]`

/** A section of the page. */
export const NEXT_SECTION = 'mt-8'

/** The heading and, beside it, the section's one control. */
export const NEXT_SECTION_HEAD = 'flex flex-wrap items-center gap-x-4 gap-y-1'

/** "Not on cartridge": a details, closed by default. */
export const NEXT_SKIP = `${SCROLL_CLEAR} mt-8 [border-top:1px_solid_var(--line)] pt-2`
export const NEXT_SKIP_SUMMARY =
  'cursor-pointer rounded-[4px] py-2 text-foreground font-sans [font-size:var(--fs-18)] focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-(--accent)'
/** A paragraph that is a direct child of the details. */
export const NEXT_SKIP_P = 'mt-1 max-w-[min(45rem,68ch)]'

// ---------- The shared row ----------

/** The list of rows: one column, two across once there is room (`cols`). */
export const NEXT_ROWS = 'mt-2 grid list-none gap-2 p-0'
export const NEXT_ROWS_COLS = `min-[48rem]:grid-cols-[repeat(2,minmax(0,1fr))]`

/** The card is a grid: cover | text, with any admin actions in an implicit
 *  third column. */
export const NEXT_ROW =
  'grid auto-cols-auto grid-cols-[3rem_minmax(0,1fr)] grid-rows-[auto_1fr] gap-x-3 gap-y-1 rounded-[8px] border border-border bg-card p-3'

/** The link (cover and title) is a subgrid over the first two columns and
 *  both rows. */
export const NEXT_ROW_LINK =
  'grid rounded-[4px] text-inherit [grid-column:1/3] [grid-row:1/3] grid-cols-subgrid grid-rows-subgrid focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-4 focus-visible:outline-(--accent)'
export const NEXT_ROW_COVER = '[grid-column:1] [grid-row:1/3]'
export const NEXT_ROW_TITLE =
  'min-w-0 text-foreground font-sans [font-size:var(--fs-18)] leading-[1.3] [grid-column:2] [grid-row:1] [overflow-wrap:anywhere]'
export const NEXT_ROW_TEXT =
  'grid min-w-0 content-start gap-1 [font-size:var(--fs-14)] [grid-column:2] [grid-row:2] [overflow-wrap:anywhere]'
export const NEXT_ROW_REASONS = 'm-0 list-[circle] pl-4 text-muted-foreground'
export const NEXT_BADGES = 'flex flex-wrap gap-1'
const BADGE =
  'rounded-[999px] border bg-card px-2 py-[0.05rem] text-foreground [font-size:var(--fs-12)] leading-[1.4]'
/** A badge; `pick` draws the accent outline, `inline` rides the title's line. */
export function nextBadge({ pick = false, inline = false } = {}) {
  return [
    BADGE,
    pick ? 'border-(--accent)' : 'border-border',
    inline && 'ml-2 align-[0.1em] whitespace-nowrap',
  ]
    .filter(Boolean)
    .join(' ')
}
export const NEXT_ROW_ACTIONS = `flex flex-wrap gap-2 self-center [grid-column:3] [grid-row:1/3] [@media(max-width:34rem)]:mt-2 [@media(max-width:34rem)]:[grid-column:1/-1] [@media(max-width:34rem)]:[grid-row:3]`
/** The store list's platform group heading. */
export const NEXT_GROUP_H3 = 'mt-4 mb-0 [font-size:var(--fs-18)]'

// ---------- Tonight ----------

/** The Tonight section: two columns (the lead and Read next | Or instead)
 *  once the page has the room, when there are other picks to put beside the
 *  lead. Its direct paragraphs keep the reading width and the section's own
 *  margin. */
export const TONIGHT_SECTION =
  '[&>p]:max-w-[min(45rem,68ch)] [&>p]:[margin:0.5rem_0_0]'
export const TONIGHT_SPLIT =
  'min-[48rem]:grid min-[48rem]:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] min-[48rem]:gap-x-4 min-[48rem]:max-w-none min-[48rem]:[&>*]:[grid-column:1/-1] min-[48rem]:[&>.tonight-main]:[grid-column:1] min-[48rem]:[&>.tonight-lanes]:[grid-column:1] min-[48rem]:[&>.tonight-more]:[grid-column:2] min-[48rem]:[&>.tonight-more]:row-span-2 min-[48rem]:[&_.tonight-alts-h]:mt-0 min-[48rem]:[&_.tonight-alts]:grid-cols-[minmax(0,1fr)]'

/** The owner's buttons are 14px and 36px tall inside Tonight. */
export const TONIGHT_BTN =
  '[.tonight_&]:min-h-9 [.tonight_&]:[font-size:var(--fs-14)]'

/** The Just finished line. Two text runs, side by side when there is room. */
export const TONIGHT_JUST = `grid grid-cols-[1.4rem_auto_minmax(0,1fr)] items-center gap-x-2 text-muted-foreground [font-size:var(--fs-13)] leading-[1.4] [@media(max-width:34rem)]:grid-cols-[1.4rem_minmax(0,1fr)] [&_b]:font-semibold [&_b]:text-foreground`
export const TONIGHT_JUST_THUMB =
  'aspect-square w-[1.4rem] [grid-row:1/3] overflow-hidden rounded-[50%] [&>*]:h-full [&>*]:w-full [&>*]:object-cover [&_img]:h-full [&_img]:w-full [&_img]:object-cover'
/** Side by side the two runs read as one line; stacked they need no dot. */
export const TONIGHT_JUST_B = `before:content-['·_'] [@media(max-width:34rem)]:before:content-none`

/** The lead card and the Continue card. */
export const LEAD = `grid grid-cols-[8.5rem_minmax(0,1fr)] gap-x-4 gap-y-4 rounded-[10px] border border-border bg-card p-4 [@media(max-width:34rem)]:grid-cols-[5.5rem_minmax(0,1fr)]`
export const LEAD_PINNED = `grid grid-cols-[8.5rem_minmax(0,1fr)] gap-x-4 gap-y-4 rounded-[10px] border border-(--accent) bg-card p-4 [@media(max-width:34rem)]:grid-cols-[5.5rem_minmax(0,1fr)]`
/** The Continue card: the Now playing band's rule on the left. */
export const LEAD_CONTINUE = `${LEAD} border-l-4 border-l-(--status-active)`
export const LEAD_COVER = '[grid-column:1] [grid-row:1/3]'
export const LEAD_TEXT = 'flex min-w-0 flex-col gap-2 [grid-column:2]'

const TITLE =
  'text-foreground font-sans font-semibold no-underline [overflow-wrap:anywhere] [&:hover]:underline focus-visible:rounded-[2px] focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-[3px] focus-visible:outline-(--accent)'
/** A card's title link. */
export const TONIGHT_TITLE = `${TITLE} [font-size:var(--fs-16)] leading-[1.3]`
/** The lead card's title, larger. */
export const LEAD_TITLE = `${TITLE} [font-size:var(--fs-24)] leading-[1.2] [@media(max-width:34rem)]:[font-size:var(--fs-20)]`

export const TONIGHT_META =
  'flex flex-wrap items-center gap-2 text-(--text-3) [font-size:var(--fs-13)]'
export const TONIGHT_REASONS =
  'm-0 list-disc pl-4 text-muted-foreground [font-size:var(--fs-14)]'
export const TONIGHT_REASONS_ALT =
  'm-0 list-disc pl-4 text-muted-foreground [font-size:var(--fs-13)]'

/** The owner's buttons. */
export const TONIGHT_ACTS = 'flex flex-wrap gap-2'
/** In the lead card they take the second row of its second column. */
export const TONIGHT_ACTS_LEAD = `${TONIGHT_ACTS} self-end [grid-column:2] [grid-row:2] [@media(max-width:34rem)]:[grid-column:1/-1] [@media(max-width:34rem)]:[grid-row:auto] [@media(max-width:34rem)]:[&_.btn.primary]:flex-1`
/** The Continue card asks a question first: its buttons centre on it. */
export const TONIGHT_ACTS_ASK = `${TONIGHT_ACTS_LEAD} items-center`
/** In the compact list the buttons stack, and sit beside the text on a phone. */
export const TONIGHT_ACTS_LIST = `flex flex-col flex-wrap items-stretch gap-1 [@media(max-width:34rem)]:flex-row [@media(max-width:34rem)]:[grid-column:2]`
export const TONIGHT_ASK = `mr-auto text-(--text-3) [font-size:var(--fs-14)] [@media(max-width:34rem)]:basis-full`

export const TONIGHT_PLAYING =
  "inline-flex items-center gap-2 self-center font-semibold text-ok-text [font-size:var(--fs-14)] before:h-[6px] before:w-[6px] before:rounded-[50%] before:bg-(--ok) before:content-['']"
export const TONIGHT_SESSIONS =
  'm-0 text-muted-foreground [font-size:var(--fs-14)] [&_b]:font-semibold [&_b]:text-foreground [&_.late]:text-warn-text'
/** The Continue cards' list. */
export const TONIGHT_CONTINUING = 'm-0 grid list-none gap-3 p-0'

/** "Or instead": the heading over the compact cards, and the cards. */
export const TONIGHT_ALTS_H =
  'mt-4 mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 tracking-[0.04em] text-(--text-3) uppercase [font-size:var(--fs-13)] [&_.muted]:tracking-[0] [&_.muted]:normal-case [&_.muted]:[font-size:var(--fs-12)]'
export const TONIGHT_ALTS = `m-0 grid list-none grid-cols-[repeat(2,minmax(0,1fr))] gap-2 p-0 [@media(max-width:34rem)]:grid-cols-[minmax(0,1fr)]`
/** Pick for me's results: three across when the page is wide. */
export const PICK_CARDS = 'min-[64rem]:grid-cols-[repeat(3,minmax(0,1fr))]'

const ALT =
  'grid content-start grid-cols-[3rem_minmax(0,1fr)] gap-x-3 gap-y-1 border bg-card [&>:not(.tonight-alt-cover)]:min-w-0 [&>:not(.tonight-alt-cover)]:[grid-column:2] [&>.tonight-acts]:mt-1'
/** A compact card. A page that restyles it (Pick for me's record-card edge)
 *  passes its own outline, radius and padding in place of the defaults. */
export const tonightAlt = (own) =>
  own ? `${ALT} ${own}` : `${ALT} rounded-[8px] border-border p-3`
export const TONIGHT_ALT_COVER = '[grid-column:1] [grid-row:1/6]'

/** "Not tonight": the dashed line where a card stood. */
export const TONIGHT_TOAST =
  'flex items-center justify-between gap-2 rounded-[8px] border border-dashed border-(--line-strong) px-3 py-2 text-muted-foreground [font-size:var(--fs-14)] [&_strong]:text-foreground'
/** The same as a row of the compact list: the list's own padding and rules
 *  between rows, the top rule gone on the first. */
export const TONIGHT_TOAST_LIST =
  'flex [align-items:start] justify-between gap-x-3 gap-y-2 rounded-none px-4 py-3 text-muted-foreground [font-size:var(--fs-14)] [&_strong]:text-foreground [border-left:0] [border-right:0] [border-bottom:0] first:[border-top:0] not-first:[border-top:1px_solid_var(--line-card)]'

export const TONIGHT_OWNER_NOTE =
  "flex items-center gap-2 text-(--text-3) [font-size:var(--fs-12)] before:h-[6px] before:w-[6px] before:flex-none before:rounded-[50%] before:bg-(--ok) before:content-['']"

// ---------- Pick for me ----------

export const PICK_FOR_ME = `my-8 ${SCROLL_CLEAR}`
/** A fieldset. A fieldset's default min-inline-size is min-content, which lets
 *  the chips push the page sideways at phone width. */
export const PICK_CHOICES =
  'mb-3 min-w-0 p-0 [border:0] [&_legend]:mb-2 [&_legend]:text-muted-foreground [&_legend]:[font-size:var(--fs-13)]'
/** Pick for me's chips wrap at every width: two short rows, unlike the shelf
 *  filters, which scroll sideways on narrow screens. */
export const PICK_CHIP_ROW =
  'ms-0 mt-0 flex-wrap overflow-x-visible p-0 [-webkit-mask-image:none] [mask-image:none]'
/** A radio drawn as a chip: the input stays focusable, only visually hidden. */
export const PICK_RADIO =
  'relative cursor-pointer [&_input]:absolute [&_input]:m-0 [&_input]:h-px [&_input]:w-px [&_input]:overflow-hidden [&_input]:[clip-path:inset(50%)]'
/** No opacity: it blended --text-2 under 4.5:1 on --surface in dark. */
export const PICK_HINT = 'opacity-100'
export const PICK_NOTE =
  'min-h-5 text-muted-foreground [font-size:var(--fs-13)]'
export const PICK_SCORE = '[font-size:var(--fs-13)] [grid-column:2]'
export const PICK_SCORE_TOTAL = 'mt-2 mb-1'
export const PICK_TERMS = 'm-0 grid gap-[0.125rem]'
export const PICK_TERM =
  'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 [&_dt]:text-muted-foreground [&_dd]:m-0 [&_dd]:flex [&_dd]:items-center [&_dd]:gap-2 [&_dd]:tabular-nums'
export const PICK_TERM_BAR =
  'inline-block h-[10px] w-12 overflow-hidden rounded-[4px] border border-line-card bg-(--sunken) [&>span]:block [&>span]:h-full [&>span]:bg-(--accent)'
export const PICK_HOW = 'mt-3 [font-size:var(--fs-13)]'

/** The Pull list's answered issue stays in place, struck through. */
export const PULL_ROW_DONE =
  '[&_.next-row-title]:text-(--text-3) [&_.next-row-title]:line-through [&_.next-row-text]:text-(--text-3) [&_.next-row-text]:line-through'
