// The Daily game and the pieces around it (#536, group G1): what the legacy
// `.daily*`, `.shelfle*`, `.guess-*` and `.share-*` rules drew, as utilities.
// Plain strings with no imports. The old class names stay on the elements as
// hooks that tests, e2e and the style dump read.
//
// A phone here is `max-width: 34rem` (inclusive, a media query: Tailwind's
// `max-[34rem]:` is strictly below); the narrowest is `max-width: 24rem`.
// Spacing steps are Tailwind's 0.25rem unit: the old `--space-5` is `6`.

/** The page: a column. The puzzle keeps the 45rem reading column inside the
 *  shelf's wide frame, so the header and tabs stay put between tabs. */
export const DAILY =
  'grid gap-4 [&>:where(:not(.spine-header,.share-sheet))]:max-w-[45rem] [&>:where(:not(.spine-header,.share-sheet))]:min-w-0'
export const DAILY_LEDE = 'm-0 max-w-[min(45rem,68ch)] text-muted-foreground'
export const DAILY_STATS =
  '-mt-2 mb-0 flex flex-wrap gap-4 text-(--text-3) [font-size:var(--fs-13)] [&_b]:font-semibold [&_b]:text-foreground'
export const DAILY_HINT = 'm-0 [font-size:var(--fs-14)]'

// ---------- The board ----------

export const SHELFLE = `table-fixed border-separate [border-spacing:0.35rem] [margin:0_-0.35rem] w-[calc(100%+0.7rem)] [@media(max-width:34rem)]:[border-spacing:0.25rem] [@media(max-width:34rem)]:[margin:0_-0.25rem] [@media(max-width:34rem)]:w-[calc(100%+0.5rem)]`
/** A header cell: the narrowest screens swap "Platform" for a short form. */
export const SHELFLE_TH = `font-normal [padding:0_0_0.1rem] [@media(max-width:24rem)]:relative`
export const SHELFLE_TH_CENTER = `${SHELFLE_TH} text-center`
export const SHELFLE_TH_TITLE = `${SHELFLE_TH} text-left w-[32%] [@media(max-width:34rem)]:w-[28%]`
/** "PLATFORM" (8 mono characters at the 12px floor) is wider than its column
 *  at 320px, so there the header shows "PLAT." and the full word stays for a
 *  screen reader (visually hidden, not display:none). */
export const TH_SHORT = `hidden [@media(max-width:24rem)]:inline`
export const TH_FULL_HIDDEN = `[@media(max-width:24rem)]:[clip:rect(0_0_0_0)] [@media(max-width:24rem)]:[clip-path:inset(50%)] [@media(max-width:24rem)]:h-px [@media(max-width:24rem)]:overflow-hidden [@media(max-width:24rem)]:absolute [@media(max-width:24rem)]:whitespace-nowrap [@media(max-width:24rem)]:w-px`

const TD =
  'h-[2.6rem] rounded-[4px] border border-line-card bg-(--sunken) py-2 align-middle text-foreground leading-[1.2] [font-size:var(--fs-13)] px-2 ' +
  `[@media(max-width:34rem)]:[font-size:var(--fs-12)] [@media(max-width:34rem)]:px-1`
export const SHELFLE_TD = `${TD} text-center`
export const SHELFLE_TD_TITLE = `${TD} font-semibold text-left [overflow-wrap:anywhere]`
/** A graded cell. Match: filled. --accent-ink on --status-active measured 6.58
 *  dark and 4.58 light; both clear 4.5:1 for text. Close: a 2px --warn ring on
 *  the surface, a non-text mark. No: the plain cell. The hidden state word in
 *  each cell carries the same information for a screen reader. */
export const SHELFLE_CELL = `${SHELFLE_TD} data-[state=match]:border-(--status-active) data-[state=match]:bg-(--status-active) data-[state=match]:text-(--accent-ink) data-[state=close]:border-(--warn) data-[state=close]:bg-(--surface) data-[state=close]:[box-shadow:inset_0_0_0_1px_var(--warn)] data-[state=no]:bg-(--surface) data-[state=no]:text-muted-foreground`
export const SHELFLE_HINT = 'block font-mono [font-size:var(--fs-12)]'
/** An unused row is one cell with five dashed boxes. */
export const SHELFLE_EMPTY_TD = `h-auto rounded-[4px] [border:0] bg-transparent p-0 text-center align-middle text-foreground leading-[1.2] [font-size:var(--fs-13)] [@media(max-width:34rem)]:[font-size:var(--fs-12)] [@media(max-width:34rem)]:px-1 [@media(max-width:34rem)]:py-2`
export const SHELFLE_EMPTY_CELLS = `grid grid-cols-[32%_repeat(4,minmax(0,1fr))] gap-1 [@media(max-width:34rem)]:grid-cols-[28%_repeat(4,minmax(0,1fr))] [&>span]:block [&>span]:h-[2.6rem] [&>span]:rounded-[4px] [&>span]:border [&>span]:border-dashed [&>span]:border-line-card [&>span]:bg-(--sunken)`

export const DAILY_LEGEND =
  'm-0 flex flex-wrap gap-3 text-(--text-3) [font-size:var(--fs-12)] [&_i]:mr-1 [&_i]:inline-block [&_i]:h-[0.8rem] [&_i]:w-[0.8rem] [&_i]:rounded-[3px] [&_i]:border [&_i]:border-line-card [&_i]:bg-(--sunken) [&_i]:align-[-2px] [&_i[data-state=match]]:border-(--status-active) [&_i[data-state=match]]:bg-(--status-active) [&_i[data-state=close]]:border-(--warn) [&_i[data-state=close]]:[box-shadow:inset_0_0_0_1px_var(--warn)]'

// ---------- The guess combobox ----------

export const GUESS_BOX = 'relative grid gap-1'
export const GUESS_INPUT =
  'w-full rounded-(--radius) border border-(--line-strong) bg-(--sunken) px-3 py-2 text-foreground [font-family:inherit] [font-style:inherit] [font-weight:inherit] [line-height:inherit] [font-size:var(--fs-16)] placeholder:text-(--text-3) disabled:opacity-[0.55]'
export const GUESS_COUNT = '[font-size:var(--fs-12)]'
export const GUESS_LIST =
  'absolute inset-x-0 top-[calc(100%-1.1rem)] z-[3] m-0 list-none rounded-[8px] border border-(--line-strong) bg-(--surface) p-1 [box-shadow:0_8px_24px_var(--overlay)]'
export const GUESS_OPTION =
  'grid cursor-pointer grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-2 rounded-[6px] p-2 aria-selected:bg-(--sunken) aria-selected:[box-shadow:inset_3px_0_0_var(--accent)]'
export const GUESS_THUMB = 'w-8 [&_.cover]:rounded-[3px]'
export const GUESS_TITLE = 'overflow-hidden text-ellipsis whitespace-nowrap'
export const GUESS_SUB = '[font-size:var(--fs-12)]'

// ---------- The result and the share sheet ----------

export const DAILY_RESULT = `grid grid-cols-[5.5rem_minmax(0,1fr)] gap-4 [border-top:1px_solid_var(--line-card)] pt-4 [@media(max-width:34rem)]:grid-cols-[4.5rem_minmax(0,1fr)] [&_h2]:m-0 [&_h2]:[font-size:var(--fs-18)]`
export const DAILY_RESULT_BODY = 'grid gap-1'
export const DAILY_RESULT_LINE = 'm-0 [font-size:var(--fs-16)]'
export const DAILY_RESULT_ACTS = 'mt-2 flex flex-wrap gap-2'
export const DAILY_YESTERDAY =
  'm-0 [border-top:1px_solid_var(--line-card)] pt-4 text-muted-foreground [font-size:var(--fs-14)] [&_b]:text-foreground'

export const SHARE_SHEET = 'max-w-[26rem]'
export const SHARE_BODY =
  'grid gap-4 p-4 [&_h2]:m-0 [&_h2]:[font-size:var(--fs-16)]'
const SHARE_BOX =
  'm-0 w-full whitespace-pre-wrap rounded-[8px] border border-border bg-(--sunken) p-3 text-foreground [font-family:var(--font-mono)] [font-style:normal] [font-weight:normal] [font-size:var(--fs-16)] leading-[1.4]'
export const SHARE_GRID = SHARE_BOX
export const SHARE_TEXT = `${SHARE_BOX} resize-none`
export const SHARE_WORDS_LEAD = 'm-0 [font-size:var(--fs-12)]'
export const SHARE_WORDS = 'm-0 list-disc pl-4 [font-size:var(--fs-12)]'
export const SHARE_STATUS = 'm-0 min-h-[1.5em]'
export const SHARE_FOOT = 'flex flex-wrap justify-end gap-2'

// ---------- The rest of the shelf ----------

/** The project line under the footer's credits: its links never break across
 *  lines, sit apart, and are a 44px target on a phone. */
export const SPINE_PROJECT =
  'mt-2 max-w-[45rem] [font-size:var(--fs-14)] [&_a]:whitespace-nowrap [&_a+a]:ms-3 [@media(max-width:700px)]:[&_a]:inline-flex [@media(max-width:700px)]:[&_a]:min-h-11 [@media(max-width:700px)]:[&_a]:items-center'

/** The journal's year: twelve cells, then the previous and next months. */
export const MONTH_NAV = 'mt-2'
export const MONTH_INDEX =
  'mt-4 mb-2 grid max-w-[45rem] grid-cols-[repeat(12,1fr)] list-none [border-block:1px_solid_var(--line)] p-0'
const MONTH_CELL =
  'grid justify-items-center border-b-2 px-0 pt-2 pb-1 leading-[1.3] [font-size:var(--fs-12)]'
export const MONTH_CELL_PLAIN = `${MONTH_CELL} border-b-transparent text-(--text-3)`
export const MONTH_CELL_LINK = `${MONTH_CELL} border-b-transparent text-accent-text`
/** The current month: its rule is the accent. */
export const MONTH_CELL_CURRENT = `${MONTH_CELL} border-b-(--accent) font-semibold text-foreground`
export const MONTH_COUNT =
  'font-mono font-medium leading-[normal] [font-size:var(--fs-12)]'
export const MONTH_STEP =
  'm-0 flex max-w-[45rem] justify-between gap-4 [font-size:var(--fs-14)]'
