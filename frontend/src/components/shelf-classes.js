// Class strings the public shelf lists share (#532). Plain strings, no
// imports: safe in the entry chunk (PosterCard reaches it through Now).

/** The link that covers a record card. Its `::after` fills the card (the
 *  card is `relative`), and the keyboard ring is drawn inside it
 *  (`-outline-offset-2`), because the card clips whatever is drawn outside. */
export const CARD_LINK =
  'block text-inherit no-underline outline-none after:absolute after:inset-0 focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-solid focus-visible:after:outline-ring'

/** The card itself: positioned for the link's `::after`, the other three
 *  edges darken with the hover as Home's do, and no lift (the loose posters
 *  below lift; a record card does not). */
export const CARD_HOST =
  'relative h-full has-[a:hover]:border-y-foreground has-[a:hover]:border-r-foreground'

/** A card's title: the serif, with the accent underline Home's titles use.
 *  Not clamped (the loose poster's title is, to two lines), so the underline
 *  is never cut off the last line. */
export const CARD_TITLE =
  'mt-2 block font-heading text-base leading-tight font-medium text-foreground underline decoration-primary decoration-[1.5px] underline-offset-4 [overflow-wrap:anywhere]'

/** The grid of numbered cards: wider columns than loose posters, since a
 *  strip holds a number and a word. Two columns on a phone, one under 23rem (a strip's number and word do not fit two across at 320px). */
export const RECORD_GRID =
  '[--poster-min:12rem] data-[size=compact]:[--poster-min:10rem] max-[34rem]:[--poster-min:8.5rem] max-[34rem]:data-[size=compact]:[--poster-min:8.5rem] max-[23rem]:[--poster-min:100%] max-[23rem]:data-[size=compact]:[--poster-min:100%]'

/** The spine rail: three columns on a small phone (a spine needs room for
 *  four wrapped lines of a long title), four on a phone, six on a tablet,
 *  twelve on a desktop (3b2), with the rail's 6px between spines. */
export const SPINE_GRID =
  'grid-cols-3 min-[430px]:grid-cols-4 min-[701px]:grid-cols-6 min-[981px]:grid-cols-12 gap-x-[6px] gap-y-8'

/** A spine's stand: positioned for the 2px rail line under it, which reaches
 *  3px past each side so neighbours read as one shelf. */
export const SPINE_RAIL =
  'relative h-full after:absolute after:-inset-x-[3px] after:-bottom-0.5 after:h-0.5 after:bg-foreground'

/** The spine: a column on the card tone with the number on top, the title,
 *  the year and the mark below. Keeps its height at least the mockup's and
 *  grows with a long title rather than clipping it. The ring is an outline
 *  with an offset that fits the 6px between spines. */
export const SPINE_LINK =
  'group flex h-full min-h-[15.5rem] min-[701px]:min-h-[17.5rem] flex-col items-center rounded-t border border-b-0 border-border bg-card text-foreground no-underline outline-none transition-transform focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-ring motion-safe:hover:-translate-y-1.5'

/** A spine's title, set upright (vertical, reading top down). Wraps into
 *  more lines when it runs past `max-h`, never clamps or clips. */
export const SPINE_TITLE =
  'min-h-0 flex-auto py-3 font-sans leading-tight font-semibold [overflow-wrap:anywhere] [writing-mode:vertical-rl] group-hover:underline group-hover:decoration-primary group-hover:decoration-[1.5px]'

/** An Overview figure's box (the status bar, the charts): Card's look, on
 *  the card colour with its 1px outline, with room inside. Not clipped
 *  (`overflow-hidden`): a bar's number shows above it on hover and focus,
 *  and a focused bar draws its ring outside. */
export const STAT_CARD =
  'm-0 flex h-full flex-col gap-2 rounded-md border border-border bg-card p-4 text-card-foreground'

/** How tall a spine's title may run before it wraps to another line: a
 *  usual title in about 13rem, a long one (over `LONG_TITLE` characters) in
 *  16rem, the longest (over `LONGEST_TITLE`) in 17rem at a smaller size, so
 *  a spine stays under about 24rem tall and a title takes at most four
 *  lines of the spine's width. */
export const SPINE_TITLE_USUAL =
  'max-h-[12rem] min-[701px]:max-h-[13rem] text-[0.92rem] min-[701px]:text-base'
export const SPINE_TITLE_LONG =
  'max-h-[16rem] text-[0.92rem] min-[701px]:text-base'
export const SPINE_TITLE_LONGEST = 'max-h-[17rem] text-[0.8rem]'
export const LONG_TITLE = 48
export const LONGEST_TITLE = 90

/** A pressed chip button's state: the ink as a fill with the page colour on
 *  it, and weight, so it is not a colour or a thin rule alone (the tab look
 *  is for single-select rows only). */
export const PRESSED_FILL =
  'aria-pressed:border-foreground aria-pressed:bg-foreground aria-pressed:font-semibold aria-pressed:text-background aria-pressed:after:hidden'

// The shelf's frame: the top row, the toolbar, the result bar, the pager, the
// Overview and the loading skeleton (#536, slice D4c). Each user keeps the
// old class name beside these as a hook for tests and e2e.

/** The row above the toolbar: the links on the left, the search on the right. */
export const SHELF_TOP = 'mb-4 flex flex-wrap items-center gap-x-6 gap-y-2'

/** The links beside the search. A phone gets a 44px target (#276). */
export const SHELF_LINKS =
  'm-0 flex flex-wrap gap-x-4 gap-y-[0.1rem] text-[0.875rem] max-[700px]:[&_a]:inline-flex max-[700px]:[&_a]:min-h-11 max-[700px]:[&_a]:items-center'

/** The search label: 16rem on the right, the full row on a phone. */
export const SHELF_SEARCH =
  'm-0 ml-auto block w-64 max-w-none max-[34rem]:ml-0 max-[34rem]:w-full'

/** The unlabelled toolbar (the admin games list). */
export const SHELF_TOOLBAR = 'mb-6 flex flex-col gap-3'

/** The labelled toolbar: rows between two rules. */
export const SHELF_CONTROLS =
  'm-0 grid flex-col gap-2 border-y border-y-border py-3'

/** The unlabelled toolbar's second row: sort left, view right. */
export const SHELF_TOOLBAR_ROW =
  'flex flex-wrap items-center justify-between gap-x-6 gap-y-3'

/** The View group: Cards and Spines, size, dim. */
export const SHELF_VIEW_CONTROLS = 'flex flex-wrap items-center gap-x-3 gap-y-2'

/** A labelled row: the label on the left (4.25rem, 3.5rem on a phone), the
 *  controls on the right. The tag picker's labels are wider. */
export const CTL_ROW =
  'grid grid-cols-[4.25rem_minmax(0,1fr)] items-baseline gap-3 max-[34rem]:grid-cols-[3.5rem_minmax(0,1fr)]'
export const CTL_ROW_WIDE =
  'grid grid-cols-[6rem_minmax(0,1fr)] items-baseline gap-3'
export const CTL_LABEL = 'text-[0.8125rem] text-muted-foreground'

/** The Sort row's split: the select left, the View group right. */
export const CTL_SPLIT =
  'flex flex-wrap items-center justify-between gap-x-6 gap-y-2'

/** The word View; both sizes are 6rem on a phone, so it goes there. */
export const VIEW_LAB =
  'text-[0.8125rem] text-muted-foreground max-[34rem]:hidden'

/** The count line above a grid. */
export const RESULTBAR =
  'mt-3 mb-4 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2'

/** The Show more row under a grid. */
export const PAGER =
  'mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[0.875rem]'

/** The Overview section under a list. */
export const SHELF_OVERVIEW = 'mt-8 border-t border-t-border pt-6'

/** The line under the Overview; its links are underlined and, on a phone,
 *  44px high. */
export const SHELF_BEHIND =
  'm-0 mt-6 text-[0.8125rem] text-muted-foreground [&_a]:underline [&_a]:underline-offset-[3px] max-[700px]:[&_a]:inline-flex max-[700px]:[&_a]:min-h-11 max-[700px]:[&_a]:items-center'

/** The loading grid, in the grid's shape. */
export const SKELETON_GRID =
  'mt-6 grid list-none grid-cols-[repeat(auto-fill,minmax(var(--poster-min),1fr))] gap-(--grid-gap) [--poster-min:8.5rem] max-[34rem]:[--poster-min:6rem]'

/** A skeleton block: the cover (3:4) or a line of text. */
export const SKELETON_BLOCK = 'block rounded-[4px] bg-(--skeleton)'
export const SKELETON_COVER = `${SKELETON_BLOCK} aspect-[3/4]`
export const SKELETON_LINE = `${SKELETON_BLOCK} mt-2 h-[0.7rem]`
export const SKELETON_LINE_SHORT = 'w-[60%]'

/** The sort control: chips or a select, and Shuffle. */
export const SORT_CONTROL = 'flex flex-wrap items-center gap-2'
export const SORT_OPTIONS = 'flex flex-wrap gap-2'
export const SORT_SELECT =
  'flex items-center gap-2 text-[0.8125rem] text-muted-foreground'
export const SORT_SELECT_FIELD =
  'rounded-lg border border-border bg-card px-2 py-1 text-[0.875rem] text-foreground [font-family:inherit] [font-style:inherit] [font-weight:inherit] [line-height:inherit]'

/** The labelled filter rows. */
export const CHIP_ROWS = 'flex flex-col gap-2'
// The poster family (#536, slice D4): the loose posters (Now, a year, a month,
// an item's neighbours, the admin Radar) and the parts a record card shares
// with them. The class names `poster-card`, `poster-art`, `poster-link`,
// `poster-title`, `poster-meta`, `status-mark`, `format-mark`, `replay-mark`,
// `upcoming-ribbon` and `poster-heart` stay on the elements as the names
// tests and e2e read; they carry no rule.

/** The grid of loose posters: a column minimum of 8.5rem, 6rem when compact
 *  and on a phone (three across at 375px). A record grid and the spine rail
 *  bring their own minimums. */
export const POSTER_MIN =
  '[--poster-min:8.5rem] data-[size=compact]:[--poster-min:6rem] max-[34rem]:[--poster-min:6rem]'

/** Every poster grid: auto-filling columns of at least `--poster-min`. The
 *  spine rail sets its own columns after this. */
export const POSTER_GRID =
  'grid gap-(--grid-gap) m-0 list-none p-0 [grid-template-columns:repeat(auto-fill,minmax(var(--poster-min),1fr))]'

/** A poster card's frame: positioned for the marks, fading in step with the
 *  lift. */
export const POSTER_CARD = 'relative [transition:opacity_0.15s,transform_0.15s]'

/** The loose poster lifts 2px on a pointer device, on hover and on focus. */
export const POSTER_LIFT =
  'hover:[transform:translateY(-2px)] [@media(hover:hover)]:focus-within:[transform:translateY(-2px)]'

/** Finished and abandoned fade back so the backlog stands out; a card being
 *  looked at or worked with comes back to full strength. Only the cover
 *  dims: fading the whole card took the title and meta text below 4.5:1. */
export const POSTER_DIMMED =
  'data-dimmed:[&:not(:hover):not(:focus-within)_.poster-art]:opacity-45'

/** The admin lists fade only the cover of a finished or abandoned title, not
 *  its marks: a faded "x2" or heart fell below 4.5:1 against the cover. */
export const POSTER_DIMMED_COVER =
  'data-dimmed:[&:not(:hover):not(:focus-within)_.poster-art_.cover]:opacity-45'

/** A loose poster's link: the whole poster and its title, ringed on focus. */
export const POSTER_LINK =
  'block text-inherit no-underline focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-[3px] focus-visible:outline-ring'

/** The cover and its marks. The scrim over it darkens on hover and focus
 *  without catching the pointer. A comic's `data-stacked` draws two offset
 *  edges behind the cover (decorative, --line-strong on --surface). */
export const POSTER_ART =
  "relative block after:pointer-events-none after:absolute after:inset-0 after:rounded-[4px] after:bg-transparent after:content-[''] after:[transition:background-color_0.15s] [@media(hover:hover)]:[.poster-card:hover_&]:after:bg-(--overlay) [@media(hover:hover)]:[.poster-card:focus-within_&]:after:bg-(--overlay) data-stacked:isolate data-stacked:mr-2 data-stacked:mb-2 data-stacked:before:absolute data-stacked:before:inset-0 data-stacked:before:-z-1 data-stacked:before:rounded-[4px] data-stacked:before:border data-stacked:before:border-(--line-strong) data-stacked:before:bg-(--surface) data-stacked:before:content-[''] data-stacked:before:[box-shadow:3px_3px_0_-1px_var(--surface),3px_3px_0_0_var(--line-strong)] data-stacked:before:[transform:translate(3px,3px)]"

/** A loose poster's title, clamped to two lines. */
export const POSTER_TITLE =
  'mt-2 line-clamp-2 overflow-hidden text-foreground [font-size:var(--fs-13)] leading-[1.3]'

/** The line under a title: year and creator. */
export const POSTER_META = 'mt-[0.15rem] [font-size:var(--fs-12)]'

/** A private row's tag on the admin shelf: always visible, not a control. */
export const POSTER_PRIVATE =
  'mt-1 w-fit justify-self-start rounded-[999px] border border-(--line-strong) px-2 text-(--text-2) [font-size:var(--fs-12)]'

/** The status mark: a small square in the cover's top-left corner. The
 *  fills carry the status colour; a paused mark is an outline in the same
 *  colour, inside the 1px --surface halo the filled marks rely on against
 *  covers. The key draws it static (`CoverKey`). */
export const STATUS_MARK =
  'left-[0.4rem] top-[0.4rem] z-1 h-[0.625rem] w-[0.625rem] rounded-[2px] border border-(--surface) data-[status=active]:bg-(--status-active) data-[status=paused]:bg-(--surface) data-[status=paused]:[box-shadow:inset_0_0_0_2px_var(--status-active)] data-[status=finished]:bg-(--status-finished) data-[status=abandoned]:bg-(--status-abandoned)'

/** The format mark, bottom-right: a key for a copy that does not hold the
 *  game, "?" for a Switch 2 copy whose format was never recorded. */
export const FORMAT_MARK =
  'absolute right-[0.4rem] bottom-[0.4rem] z-1 flex h-[1.1rem] min-w-[1.1rem] items-center justify-center rounded-[3px] bg-(--overlay) font-semibold leading-none text-(--text-3) [font-size:var(--fs-12)]'

/** The replay mark: how many times a game was finished, when more than once.
 *  The format mark's overlay style with a mono numeral. Position and fill
 *  come from where it is drawn (the cover, or the key). */
export const REPLAY_MARK =
  'bottom-[0.4rem] left-[0.4rem] z-1 flex h-[1.1rem] items-center rounded-[3px] px-1 font-mono leading-none font-medium text-foreground [font-size:var(--fs-12)]'

/** The "Coming" ribbon along the bottom edge, clear of the corner marks. */
export const UPCOMING_RIBBON =
  'absolute inset-x-0 bottom-0 bg-(--overlay) py-1 pr-8 pl-2 tracking-[0.04em] text-foreground uppercase [font-size:var(--fs-12)]'

/** The favourite heart, top-right of the cover. Amber is a mark here (3:1),
 *  never text. The key draws it static. */
export const POSTER_HEART =
  'right-[0.4rem] top-[0.35rem] z-1 leading-none text-(--rating) [font-size:var(--fs-14)]'

// The admin card's controls (#536, slice D4). `shelf-actions`, `shelf-sheet`,
// `shelf-actions-row`, `quick-rate` and `quick-rate-target` stay as the names
// tests and e2e read; they carry no rule.

/** The star row: ten half-star targets. In the phone sheet it fills the width
 *  at 3rem, so each half star is 24px wide (WCAG 2.5.8's minimum). */
export const QUICK_RATE =
  'inline-flex leading-none [font-size:var(--fs-18)] [.shelf-sheet_&]:flex [.shelf-sheet_&]:justify-center [.shelf-sheet_&]:[font-size:var(--fs-48)]'

/** One half-star target. The targets are at least 44px tall on a phone (ten
 *  half stars are 9px wide each, so the width stays as drawn). Hovering a star
 *  fills every target up to it and empties the rest, previewing the click. */
export const QUICK_RATE_TARGET =
  'group/target relative h-[1.2em] w-[0.5em] cursor-pointer overflow-hidden border-0 bg-none p-0 text-(--text-3) [font:inherit] data-filled:text-(--rating) focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-1 focus-visible:outline-foreground max-[700px]:min-h-11 [@media(hover:hover)]:[.quick-rate:hover_&]:text-(--rating) [@media(hover:hover)]:[.quick-rate-target:hover~&]:text-(--text-3)'

/** The star inside a target: a full star, shifted so each target shows one
 *  half. Centred in the taller phone box; where the box is already taller
 *  (the sheet draws the stars at 3rem) the star keeps its own top. */
export const QUICK_RATE_STAR =
  'absolute top-[0.05em] left-0 block w-[1em] group-data-[half=right]/target:-left-[0.5em] max-[700px]:top-[max(0.05em,calc((2.75rem-1.2em)/2+0.05em))]'

/** A row of controls under the stars. In the phone sheet it centres at the
 *  page size with room between. */
export const SHELF_ACTIONS_ROW =
  'mt-1 flex flex-wrap items-center gap-1 [.shelf-sheet_&]:mt-3 [.shelf-sheet_&]:justify-center [.shelf-sheet_&]:gap-4 [.shelf-sheet_&]:[font-size:var(--fs-16)]'

/** The panel on a pointer device: out of the flow, anchored to the card foot,
 *  on a solid surface, and revealed with opacity on hover and on focus-within
 *  (never display or visibility, so the keyboard still reaches it and nothing
 *  moves). */
export const SHELF_ACTIONS_HOVER =
  'absolute inset-x-0 bottom-0 z-10 m-0 max-h-full overflow-y-auto border-t border-t-(--line) bg-(--surface) px-3 pt-2 pb-3 opacity-0 [transition:opacity_0.15s] focus-within:opacity-100 [.poster-card:hover_&]:opacity-100'

/** The touch form: one "..." button, in flow above the card's cover-wide link. */
export const SHELF_ACTIONS_SHEET = 'relative z-10 mt-1'

/** The bottom sheet the touch form opens: a modal dialog, so its own box is
 *  undone (no margin, no max width, no border but the top). */
export const SHELF_SHEET =
  'fixed inset-x-0 top-auto bottom-0 z-10 [.admin-app-phone_&]:z-40 m-0 max-h-[85dvh] w-auto max-w-none overflow-auto border-0 border-t border-t-(--line) bg-(--surface) px-4 pt-4 pb-6 text-foreground [box-shadow:0_-8px_24px_var(--overlay)] backdrop:bg-(--overlay)'
