// The comics family: the run lanes and their key, the run box, the cover wall's
// tiles, stacks and pills, the series pill, a comic card's run text and the
// neighbour strip (#536, group G3). The class names stay on the elements as
// hooks (tests, e2e and print read them) and so do the data-* marks; the look
// is these utilities. Every utility is written out whole: Tailwind reads
// source text, so a class glued from a constant is never emitted. A state is
// one whole string per state, never a base plus an override: two utilities of
// one property both reach the sheet and the sheet's order decides, not the
// string's. `:hover` is `[&:hover]` or `[x:hover_&]`, not `hover:`: the old
// rules applied on a touch screen too.

// ---- Run lanes (RunLanes.jsx) ---------------------------------------------
// The lanes' custom properties are set on the root; `--lane-ground` is the
// colour of the ring that separates neighbouring spans (the card's ground).

const LANES = 'grid gap-1 [--lane-height:16px] [--lane-thin:4px]'

const LANES_NAME = {
  plain: '[--lane-name:4.5rem] [@media(max-width:700px)]:[--lane-name:3.25rem]',
  private:
    '[--lane-name:6.75rem] [@media(max-width:700px)]:[--lane-name:6.25rem]',
}

/**
 * The lanes' root.
 *
 * @param {{mini: boolean, tail: boolean, secret: boolean}} flags The card's
 *   form, an unreleased tail, and the admin's private Skipped lane.
 */
export function lanesClass({ mini, tail, secret }) {
  if (mini)
    return tail
      ? 'grid gap-[2px] mb-1 [--lane-ground:var(--bg)] [--lane-name:0px] [--lane-height:8px] [--lane-thin:3px] [--lane-tail:0.9rem]'
      : 'grid gap-[2px] mb-1 [--lane-ground:var(--bg)] [--lane-name:0px] [--lane-height:8px] [--lane-thin:3px] [--lane-tail:0px]'
  const name = secret ? LANES_NAME.private : LANES_NAME.plain
  return tail
    ? `${LANES} [--lane-ground:var(--surface)] [--lane-tail:1.75rem] ${name}`
    : `${LANES} [--lane-ground:var(--surface)] [--lane-tail:0px] ${name}`
}

// The old `.lane` rule that spaces Read next and Watch next also reached every
// run lane, so each lane carries a 24px top margin; kept as drawn.
export const LANE =
  'mt-6 grid items-center gap-x-1 grid-cols-[var(--lane-name)_minmax(0,1fr)_var(--lane-tail)]'

export const LANE_NAME =
  'overflow-hidden whitespace-nowrap text-(--text-3) text-[0.75rem] tracking-[0.04em]'

export const LANE_PRIVATE = 'text-[0.75rem] not-italic'

export const LANE_TRACK = 'relative h-(--lane-height)'
export const LANE_TRACK_THIN = 'relative h-(--lane-thin)'
export const LANE_TRACK_AXIS = 'relative h-[0.9rem]'

export const LANE_AXIS_LABEL =
  'absolute top-0 text-(--text-3) text-[0.75rem] leading-none font-normal font-mono [transform:translateX(-50%)]'

/** A span on a lane, by its mark. */
export const LANE_SPAN = {
  owned:
    'absolute top-0 bottom-0 min-w-[3px] rounded-[2px] bg-(--chart) [box-shadow:0_0_0_1px_var(--lane-ground)]',
  missing:
    'absolute top-0 bottom-0 min-w-[3px] rounded-[2px] border-[1.5px] border-(--run-missing) [box-shadow:0_0_0_1px_var(--lane-ground)]',
  skip: 'absolute top-0 bottom-0 min-w-[6px] rounded-[2px] border-[1.5px] border-dashed border-(--run-missing) [box-shadow:0_0_0_1px_var(--lane-ground)]',
  readbar:
    'absolute top-0 bottom-0 min-w-[3px] rounded-[2px] bg-(--text-2) [box-shadow:0_0_0_1px_var(--lane-ground)]',
}

export const LANE_TAIL = 'relative h-(--lane-height)'
export const LANE_TAIL_THIN = 'relative h-(--lane-thin)'
export const LANE_TAIL_MARK =
  'block h-full rounded-[2px] [background:var(--hatch)]'

// ---- The key under the lanes or the box (RunKey) --------------------------
// The key sits outside the lanes, where `--lane-ground` is undefined, so its
// swatches use a border and no ring.

export const RUN_KEY =
  'flex flex-wrap items-center gap-x-4 gap-y-1 list-none mt-2 text-(--text-3) text-[0.75rem]'

export const RUN_KEY_ITEM = 'flex items-center gap-1'

/** A swatch, by variant and mark. */
export const RUN_KEY_SWATCH = {
  lanes: {
    owned:
      'inline-block h-[0.6rem] w-[0.9rem] rounded-[2px] border-transparent bg-(--chart)',
    missing:
      'inline-block h-[0.6rem] w-[0.9rem] rounded-[2px] border-[1.5px] border-(--run-missing)',
    upcoming:
      'inline-block h-[0.6rem] w-[0.9rem] rounded-[2px] border-transparent [background:var(--hatch)]',
    readbar:
      'inline-block h-[3px] w-[0.9rem] rounded-[2px] border-transparent bg-(--text-2)',
    skip: 'inline-block h-[0.6rem] w-[0.9rem] rounded-[2px] border-[1.5px] border-dashed border-(--run-missing)',
  },
  box: {
    read: 'inline-block h-[0.9rem] w-[0.9rem] rounded-[2px] border border-transparent bg-(--chart) text-(--accent-ink)',
    owned:
      'inline-block h-[0.9rem] w-[0.9rem] rounded-[2px] border border-(--chart-2) bg-(--accent-soft) text-(--text)',
    missing:
      'inline-block h-[0.9rem] w-[0.9rem] rounded-[2px] border border-(--run-missing)',
    upcoming:
      'inline-block h-[0.9rem] w-[0.9rem] rounded-[2px] border border-transparent text-(--text) [background:var(--hatch)]',
    skip: 'inline-block h-[0.9rem] w-[0.9rem] rounded-[2px] border-[1.5px] border-dashed border-(--run-missing)',
    book: 'inline-block h-[0.9rem] w-[1.4rem] rounded-[2px] border border-(--chart-2) border-l-4 border-l-(--text-2) bg-(--accent-soft)',
  },
}

// ---- Run box (RunBox.jsx, SeriesGrewRow.jsx) ------------------------------
// Cells, books and bundles in issue order. A phone's box (about 21rem wide)
// fits ten cells to a row, wider boxes keep 2.1rem squares.

export const RUN_BOX_FRAME = '[container-type:inline-size]'
export const RUN_BOX = 'flex flex-wrap gap-1'

const TILE =
  'relative grid h-[2.1rem] place-items-center border border-solid p-0 not-italic font-medium leading-none'

const CELL = `${TILE} w-[2.1rem] rounded-[2px] font-mono [@container(max-width:26rem)]:h-8 [@container(max-width:26rem)]:w-[calc((100%-27px)/10)]`

const PRESS =
  'cursor-pointer focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-(--accent) focus-visible:outline-offset-2'

const MARK_READ =
  "text-[0.75rem] after:absolute after:bottom-px after:right-[2px] after:text-[0.5rem] after:content-['✓']"
const MARK_SKIP =
  "text-[0.75rem] after:absolute after:bottom-px after:right-[2px] after:text-[0.5625rem] after:content-['×']"

/** A cell's look by its mark (`data-k`); a fold button is its own mark. */
const CELL_K = {
  none: `${CELL} border-transparent bg-transparent text-(--text-3) text-[0.75rem]`,
  new: `${CELL} border-(--ok) bg-(--ok) text-(--accent-ink) text-[0.75rem]`,
  owned: `${CELL} border-(--chart-2) bg-(--accent-soft) text-(--text) text-[0.75rem]`,
  read: `${CELL} border-transparent bg-(--chart) text-(--accent-ink) ${MARK_READ}`,
  missing: `${CELL} border-(--run-missing) bg-transparent text-(--text-3) text-[0.75rem]`,
  skip: `${CELL} border-[1.5px] border-dashed border-(--run-missing) bg-transparent text-(--text-3) ${MARK_SKIP}`,
  upcoming: `${CELL} border-transparent text-(--text) text-[0.75rem] [background:var(--hatch)]`,
  fold: `${CELL} border-(--line-strong) bg-transparent text-(--text-2) text-[0.875rem]`,
}

/**
 * A run cell.
 *
 * @param {string|undefined} k The mark (`data-k`): new, owned, read, missing,
 *   skip or upcoming; `fold` for the fold button, none for a gap.
 * @param {boolean} [button] A cell that can be pressed.
 */
export function runCell(k, button = false) {
  const look = CELL_K[k] ?? CELL_K.none
  return button ? `${look} ${PRESS} aria-disabled:cursor-progress` : look
}

const SHAPE =
  'content-center justify-items-start gap-[2px] min-w-[5.2rem] py-0 px-2 font-sans [&_b]:text-[0.75rem] [&_b]:font-semibold [&_small]:text-[0.75rem]'

const BOOK = `${TILE} ${SHAPE} text-[0.75rem] rounded-[1px_3px_3px_1px] border-l-4`

/** A book (an edition) in the box, by its mark. */
export const RUN_BOOK = {
  owned: `${BOOK} border-(--chart-2) border-l-(--text-2) bg-(--accent-soft) text-(--text)`,
  read: `${BOOK} border-transparent border-l-(--text-2) bg-(--chart) text-(--accent-ink)`,
  none: `${BOOK} border-transparent border-l-(--text-2) bg-transparent text-(--text-3)`,
}

const BUNDLE = `${TILE} ${SHAPE} rounded-[2px] text-[0.75rem] ${PRESS}`

/** A bundle (a stretch of cells folded into one button), by its mark. */
export const RUN_BUNDLE = {
  owned: `${BUNDLE} border-(--chart-2) bg-(--accent-soft) text-(--text)`,
  read: `${BUNDLE} border-transparent bg-(--chart) text-(--accent-ink)`,
  missing: `${BUNDLE} border-(--run-missing) bg-transparent text-(--text-3)`,
  skip: `${BUNDLE} border-[1.5px] border-dashed border-(--run-missing) bg-transparent text-(--text-3)`,
  none: `${BUNDLE} border-transparent bg-transparent text-(--text-3)`,
}

// ---- Series pill (the series page, a card, an intake row) -----------------

const SERIES_PILL =
  'inline-block rounded-[999px] border border-solid px-2 py-0 align-middle text-[0.75rem] leading-normal font-normal'

/** The pill beside a run's count: plain, ok (up to date) or warn (wanted). */
export const SERIES_PILL_PLAIN = `${SERIES_PILL} border-(--line-strong) text-(--text-2)`
export const SERIES_PILL_OK = `${SERIES_PILL} border-(--ok) text-(--ok-text)`
export const SERIES_PILL_WARN = `${SERIES_PILL} border-(--warn) text-(--warn-text)`

// ---- Comic card text (ComicCardRun.jsx) -----------------------------------

export const COMIC_CARD_RUN = 'mt-2'
// The kind word and the volumes (or the single book's note) sit in a block that
// holds three lines of 0.75rem at 1.4 when a grid reserves it, so the lanes
// start at the same height on every card in a row (#474).
export const COMIC_CARD_TOP = 'min-h-[3.15rem]'
export const COMIC_CARD_VOLUMES = 'line-clamp-2'
// A same-title qualifier under the title; an empty one keeps its line so the
// cards in a grid stay level.
export const CARD_QUALIFIER =
  'block text-(--text-2) text-[0.75rem] leading-[1.4]'
export const COMIC_CARD_KIND =
  'text-(--text) text-[0.75rem] font-medium leading-[1.4]'
export const COMIC_CARD_LINE =
  'text-(--text-2) text-[0.75rem] leading-[1.4] [&_b]:text-(--text) [&_b]:font-mono [&_b]:font-medium [&_b]:tabular-nums'

// ---- Read next / Watch next (Lane.jsx) ------------------------------------

export const NEXT_LANE = 'mt-6 grid items-center gap-x-1'
export const NEXT_LANE_HEAD = 'flex items-baseline justify-between gap-3 mb-2'
export const NEXT_LANE_TITLE = 'text-[1rem] font-medium'
export const NEXT_LANE_CAP = 'text-(--text-3) text-[0.75rem]'

// ---- Cover wall and its tiles (CoverTile.jsx, CoverWall.jsx) --------------

export const COVER_WALL_GRID =
  'grid gap-y-4 gap-x-3 grid-cols-[repeat(auto-fill,minmax(112px,1fr))] [@media(max-width:480px)]:gap-y-3 [@media(max-width:480px)]:gap-x-2 [@media(max-width:480px)]:grid-cols-[repeat(3,1fr)]'

/** A titled box on the series page (the wall, the books, a single book). */
export const ITEM_CARD =
  'bg-(--surface) border border-(--line) rounded-[6px] mt-0 mb-4 p-4'

/** The top margin the old `.item-card` rule zeroed, for a panel drawn from
 *  PANEL: without it `section + section` spaces the box 2rem down. */
export const ITEM_CARD_TOP = 'mt-0'

// A tile's cover: a missing or skipped one is greyed, and a frame already
// carries the dashed outline in a tile, so the cover's own goes.
const TILE_COVER =
  '[&_.cover[data-nocover]]:border-0 [&_.cover-nocover]:text-[0.75rem] [&_.cover-nocover]:p-1 [&_.cover-nocover_b]:text-[0.875rem]'
const TILE_GREY =
  '[&_.cover:not([data-nocover])]:[filter:grayscale(1)] [&_.cover:not([data-nocover])]:opacity-45'
/** A stacked edge for a book, drawn with the sunken and line tones. */
export const BOOK_STACK =
  '[&_.cover]:mt-0 [&_.cover]:mr-2 [&_.cover]:mb-2 [&_.cover]:ml-0 [&_.cover]:w-[calc(100%-9px)] [&_.cover]:[box-shadow:4px_4px_0_var(--sunken),5px_5px_0_var(--line-strong),8px_8px_0_var(--sunken),9px_9px_0_var(--line-strong)]'
const TILE_RING =
  'focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-(--accent) focus-visible:outline-offset-2'

/**
 * A tile's root.
 *
 * @param {object} opts
 * @param {string} [opts.state] The tile's state (`data-state`).
 * @param {boolean} [opts.link] An anchor: it draws a focus ring.
 * @param {boolean} [opts.strip] In the neighbour strip.
 * @param {boolean} [opts.book] A stacked book.
 */
export function tileClass({
  state,
  link = false,
  strip = false,
  book = false,
}) {
  const grey = state === 'missing' || state === 'skipped'
  const stack = book ? BOOK_STACK : ''
  return [
    'relative block min-w-0 text-inherit',
    strip && '[flex:0_0_auto]',
    link && `${TILE_RING} [&:hover]:no-underline`,
    TILE_COVER,
    grey && TILE_GREY,
    stack,
  ]
    .filter(Boolean)
    .join(' ')
}

const FRAME = 'relative block rounded-[6px]'
const FRAME_SOLID = `${FRAME} border-2 border-solid p-[2px]`
const FRAME_DASHED = `${FRAME} border-[1.5px] border-dashed border-(--run-missing) p-1`
const FRAME_LINK =
  '[a.cover-tile:hover_&]:border-(--accent) [a.cover-tile:focus-visible_&]:border-(--accent)'
const FRAME_PRESS =
  '[.cover-tile-btn:hover_&]:border-(--accent) [.cover-tile-btn:focus-visible_&]:border-(--accent)'

/**
 * A tile's frame: a state is a frame as well as a colour.
 *
 * @param {object} opts
 * @param {string} [opts.state]
 * @param {'link'|'press'|null} [opts.on] What lights it: an anchor tile
 *   (hover and focus) or a cover button.
 * @param {boolean} [opts.current] The page's own issue.
 */
export function frameClass({ state, on = null, current = false }) {
  let look
  if (state === 'missing' || state === 'skipped') look = FRAME_DASHED
  else if (state === 'owned' || state === 'book')
    look = `${FRAME_SOLID} border-(--chart-2)`
  else if (state === 'read') look = `${FRAME_SOLID} border-(--chart)`
  else look = `${FRAME_SOLID} border-transparent`
  return [
    look,
    current && '[box-shadow:0_0_0_2px_var(--accent)]',
    on === 'link' && FRAME_LINK,
    on === 'press' && FRAME_PRESS,
  ]
    .filter(Boolean)
    .join(' ')
}

export const TILE_HATCH =
  'flex aspect-[2/3] items-end rounded-[4px] border border-(--run-missing) p-[8%] [background-image:var(--hatch)]'
export const TILE_HOLLOW = 'block aspect-[2/3]'

export const TILE_CHIP =
  'rounded-[3px] bg-(--surface) px-1 py-[0.15rem] text-(--text) text-[0.75rem] leading-none font-semibold font-mono'
export const TILE_FLAG = 'absolute bottom-[6px] left-[6px]'

export const TILE_TICK =
  'absolute -top-[4px] -right-[4px] h-[1.125rem] w-[1.125rem] rounded-[50%] border-2 border-(--surface) bg-(--chart) text-center text-(--accent-ink) text-[0.75rem] leading-[1.125rem] font-bold font-mono'

const CAP =
  'mt-1 justify-between text-(--text-2) text-[0.75rem] leading-[1.3] font-medium font-mono [&_em]:text-(--text-3) [&_em]:not-italic'

/** A caption under a tile; a stacked book's is a column. */
export const TILE_CAP = `flex gap-1 ${CAP}`
export const TILE_CAP_BOOK = `flex flex-col gap-0 ${CAP}`

/** A caption that is a link to the issue (an owner's tile). */
export const TILE_CAP_LINK = `${TILE_CAP} min-h-6 pt-[0.1rem] no-underline`

/** The number inside that link: underlined, and lit with it. */
export const TILE_CAP_NUMBER =
  'underline decoration-(--line-strong) underline-offset-[3px] [a.cover-tile-cap:hover_&]:text-(--accent-text) [a.cover-tile-cap:focus-visible_&]:text-(--accent-text)'

export const TILE_HOLD = 'relative'

export const TILE_BUTTON = `block w-full cursor-pointer bg-transparent p-0 text-inherit [border:0] ${TILE_RING}`

export const TILE_DO =
  'absolute right-[6px] bottom-[6px] left-[6px] hidden rounded-[3px] bg-(--accent) px-1 py-1 text-center text-(--accent-ink) text-[0.75rem] leading-none font-semibold font-sans [.cover-tile-btn:hover_&]:block [.cover-tile-btn:focus-visible_&]:block'

/** A run of missing issues folded into one stack, or its fold tile. */
const STACK =
  'flex aspect-[2/3] w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-[4px] border-[1.5px] bg-transparent p-2 text-center text-[0.75rem] leading-[1.3] font-medium font-mono [&:hover]:border-(--accent) [&:hover]:text-(--text) focus-visible:border-(--accent) focus-visible:text-(--text) focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-(--accent) focus-visible:outline-offset-2'
export const COVER_STACK = `${STACK} border-dashed border-(--run-missing) text-(--text-2)`
export const COVER_STACK_FOLD = `${STACK} border-solid border-(--run-missing) text-(--text-2)`

export const WALL_BAR = 'flex flex-wrap items-center gap-y-2 gap-x-6 mb-4'
export const WALL_HOW =
  'ml-auto max-w-[28rem] text-(--text-3) text-[0.8125rem] [@media(max-width:640px)]:ml-0 [@media(max-width:640px)]:w-full [@media(max-width:640px)]:max-w-none'
export const WALL_STATUS =
  'flex min-h-[1.4rem] flex-wrap items-baseline gap-y-1 gap-x-2 mt-3 text-(--text-2) text-[0.8125rem]'
export const WALL_KEY = 'flex flex-wrap gap-2 list-none mt-4'
export const BOOK_WALL_HAVE = 'text-[0.875rem] mb-4'

// ---- State pill -----------------------------------------------------------

const PILL =
  'inline-flex items-center gap-1 rounded-[99px] px-2 py-1 text-[0.75rem] leading-none font-medium font-mono whitespace-nowrap'

/** A state named in words, by state: read, owned and book are filled, missing
 *  is solid-outlined, skipped dashed, not-out carries the hatch block. */
export const STATE_PILL = {
  read: `${PILL} border border-(--chart) bg-(--chart) text-(--accent-ink)`,
  owned: `${PILL} border border-(--chart-2) bg-(--accent-soft) text-(--text)`,
  book: `${PILL} border border-(--chart-2) bg-(--accent-soft) text-(--text)`,
  missing: `${PILL} border-[1.5px] border-(--run-missing) text-(--text-2)`,
  skipped: `${PILL} border-[1.5px] border-dashed border-(--run-missing) text-(--text-2)`,
  'not-out': `${PILL} border border-(--line-strong) text-(--text-2) before:box-content before:h-[10px] before:w-[12px] before:rounded-[2px] before:border before:border-(--run-missing) before:[background-image:var(--hatch)] before:content-['']`,
  none: `${PILL} border border-(--line-strong) text-(--text-2)`,
}

// ---- Neighbour strip (NeighbourStrip.jsx) ---------------------------------

export const NEIGHBOUR_STRIP =
  'flex gap-2 list-none mb-4 overflow-x-auto pt-1 px-1 pb-2 [&>li]:min-w-0 [&>li]:[flex:0_0_76px]'
