// Class strings for the shelf's overview, Now playing band, the charts and
// the stat tiles (#536 slice D4b). Plain strings and no imports, so the entry
// chunk can take them (eager code joins them with `cx`). They replaced the
// legacy rules in index.css; the legacy class names stay on the elements
// where a test, an e2e spec or the style dump reads them as hooks.

// ---------------------------------------------------------------- stat tiles

/** A row of tiles: four across, two beside the admin sidebar. */
export const STAT_TILES =
  'grid grid-cols-[repeat(4,minmax(0,1fr))] gap-4 max-[900px]:grid-cols-[1fr_1fr]'

/** The default space under a row of tiles; `StatTiles` takes `margin` to
 *  replace it (/stats puts the space above instead). */
export const STAT_TILES_MARGIN = 'mb-6'

/** A row of composite tiles (the item page): as many as the width allows. */
export const STAT_TILES_FIGURES =
  'mb-8 grid grid-cols-[repeat(auto-fit,minmax(11rem,1fr))] gap-4'

/** A composite tile's label and rows: a quiet mono-less label over a column
 *  of small lines. The label is a bare `dt`, so these reach it from the tile. */
export const STAT_TILE_FIGURES =
  '[&_dt]:mb-1 [&_dt]:text-[0.75rem] [&_dt]:tracking-[0.08em] [&_dt]:text-(color:--text-3) [&_dt]:uppercase [&_dd]:flex [&_dd]:flex-col [&_dd]:gap-[0.15rem] [&_dd]:text-[0.8125rem]'

/** A plain tile's label, under the kicker look. */
export const STAT_LABEL = 'mb-2 block'

/** A plain tile's figure. The weight and the serif come from the tile. */
export const STAT_VALUE =
  'text-[1.75rem] leading-none tracking-[-0.02em] tabular-nums'

/** A plain tile's line of detail. */
export const STAT_DETAIL = 'mt-2 text-[0.75rem] text-(color:--text-3)'

// ----------------------------------------------------------------- day bars

export const DAY_BARS_CHART = 'flex h-[180px] items-end gap-[2px] pt-2'
export const DAY_BAR = 'block min-w-0 flex-1 rounded-t-[2px] bg-chart-1'
export const DAY_BARS_PEAK = 'mt-2 mb-0 text-[0.8125rem] text-muted-foreground'
export const DAY_BARS_AXIS =
  'mt-2 flex justify-between font-mono text-[0.75rem] leading-[normal] font-normal text-(color:--text-3)'

// ----------------------------------------------------------------- bar list

export const BAR_LIST = 'm-0 list-none p-0'
/** A row: label, bar and number on one line (admin), or the label above its
 *  bar and number where three lists share a column (`stacked`, /stats). */
export const BAR_ROW =
  'grid items-center border-t border-line-card py-2 text-[0.875rem] first:[border-top:0]'
export const BAR_ROW_WIDE = 'grid-cols-[minmax(0,1fr)_70px_50px] gap-3'
export const BAR_ROW_STACKED = 'grid-cols-[minmax(0,1fr)_3rem] gap-x-3 gap-y-1'
export const BAR_LABEL =
  'overflow-hidden text-ellipsis whitespace-nowrap text-foreground'
export const BAR_LABEL_STACKED = 'col-[1/-1]'
/** The track is --sunken with a --line-card outline (a 3:1 mark on the
 *  card, contrast.test.js); the fill is --chart, 3:1 or better on it. */
export const BAR_TRACK =
  'h-[10px] overflow-hidden rounded-[4px] border border-line-card bg-(--sunken)'
export const BAR_FILL = 'block h-full bg-chart-1'
export const BAR_COUNT = 'text-right text-muted-foreground tabular-nums'

// ------------------------------------------------------------ the overview

/** A stat card's heading (the favourites, Now playing and every card). */
export const STAT_HEAD =
  'mt-0 mb-2 text-[0.8125rem] tracking-[0.04em] uppercase'

/** The overview's row of cards. */
export const SHELF_STATS =
  'mb-6 grid grid-cols-[repeat(auto-fit,minmax(15rem,1fr))] gap-x-8 gap-y-4'

export const STAT_COUNT = 'text-(color:--text-3) tabular-nums'

export const FAVOURITES = 'mb-6'
export const FAVOURITES_ROW =
  'grid list-none grid-cols-[repeat(4,minmax(0,8.5rem))] gap-4'
export const FAVOURITE_LINK =
  'block focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-solid focus-visible:outline-ring'
export const FAVOURITE_EMPTY =
  'aspect-[3/4] rounded-[4px] border border-dashed border-border'
export const FAVOURITES_HINT = 'mt-2 text-[0.8125rem]'

/** The status bar: segments grow by their count (`--count`); the 2px gaps
 *  are the --surface behind them, which is why every status token is
 *  measured against --surface. */
export const STATUS_BAR =
  'flex h-3 gap-[2px] overflow-hidden rounded-[4px] bg-card'
export const STATUS_SEGMENT = 'min-w-[2px] [flex:var(--count)_1_0]'
export const STATUS_LEGEND =
  'mt-2 flex list-none flex-wrap gap-x-4 gap-y-1 text-[0.8125rem]'
export const STATUS_LEGEND_ITEM = 'flex items-center gap-1'
export const STATUS_SWATCH = 'inline-block size-2.5 rounded-[2px]'
/** The wrap-up sheet's swatches are a little larger. */
export const STATUS_SWATCH_LARGE = 'inline-block size-3 rounded-[2px]'

const FILL = {
  backlog: 'bg-(--status-backlog)',
  active: 'bg-(--status-active)',
  // Hollow, as the card mark is: a solid segment in Playing's colour beside
  // Playing's would read as one.
  paused: 'bg-card shadow-[inset_0_0_0_2px_var(--status-active)]',
  finished: 'bg-(--status-finished)',
  abandoned: 'bg-(--status-abandoned)',
}

/** The fill of a status segment or swatch (`fill` is the status key). */
export const statusFill = (status) => FILL[status] ?? ''

/** Ratings and finishes: the figure is the bars and, beside them, a number. */
export const STAT_FIGURE = 'flex items-end gap-4'
/** The bars over their axis labels; the labels are aria-hidden. */
export const BAR_COLUMN = 'flex min-w-0 flex-auto flex-col gap-1'
/** Bars scaled by a --share custom property the markup sets (count over the
 *  largest count), so no colour is inlined. Always inside a `BAR_COLUMN`. */
export const BARS = 'flex h-16 flex-none items-end gap-1'
/** The bars a year page draws: a baseline under them, and a cap on width. */
export const BARS_BASELINE = 'max-w-xl border-b border-(color:--text-3)'
export const BAR =
  'group/bar relative h-[calc(var(--share)*100%)] min-h-[2px] flex-[1_1_0] rounded-t-[2px] bg-chart-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-foreground'
/** A month bar that links to its journal page is clickable over the whole
 *  column, not just its painted height: a quiet month is a 2px stub. */
export const BAR_LINK =
  "before:absolute before:inset-x-0 before:bottom-0 before:h-16 before:content-['']"
/** The count is in the bar's accessible name; this numeral is its visible
 *  twin and shows on focus as well as hover, so nothing is hover-only. */
export const BAR_COUNT_FIGURE =
  'absolute bottom-full left-1/2 text-[0.75rem] leading-[1.4] text-(color:--text-3) tabular-nums opacity-0 [transform:translateX(-50%)] [transition:opacity_0.15s] group-hover/bar:opacity-100 group-focus/bar:opacity-100'
export const BAR_AXIS =
  'flex justify-between text-[0.75rem] leading-none text-(color:--text-3)'
export const BAR_AXIS_MONTHS =
  'gap-1 [&_span]:flex-[1_1_0] [&_span]:text-center'
/** The year page's axis keeps to the bars' width. */
export const BAR_AXIS_CAPPED = 'max-w-xl'

export const CARTRIDGE_PLATFORM = '[&_p]:mt-0 [&_p]:mb-1'
export const STAT_BIG = 'm-0 flex flex-col'
export const STAT_BIG_NUMBER =
  'font-sans text-[2rem] leading-none text-foreground tabular-nums'
export const STAT_BIG_LABEL =
  'text-[0.75rem] whitespace-nowrap text-(color:--text-3)'

// ------------------------------------------------------------- Now playing

/** The band: the games I am playing, ahead of everything else on the shelf.
 *  `group/now` lets a single game's card grow (`data-count="1"`). */
export const NOW_PLAYING = 'group/now mb-6'
/** Each item is a grid so a Wrap up button (admin) sits under its card. */
export const NOW_PLAYING_LIST =
  'm-0 grid list-none grid-cols-[repeat(auto-fit,minmax(16rem,1fr))] gap-4 p-0 [&>li]:grid [&>li]:gap-2'
/** The rule is --status-active, the grid's Playing dot, so the two read as
 *  one mark; it already clears 3:1 on --surface in both themes. */
export const NOW_PLAYING_CARD =
  'flex h-full items-center gap-4 rounded-md border border-l-4 border-border border-l-(--status-active) bg-card p-3 text-foreground no-underline hover:border-(--line-strong) hover:border-l-(--status-active) focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-solid focus-visible:outline-ring'
export const NOW_PLAYING_COVER =
  'shrink-0 grow-0 basis-24 group-data-[count=1]/now:basis-[8.5rem]'
export const NOW_PLAYING_BODY = 'flex min-w-0 flex-col gap-1'
export const NOW_PLAYING_TITLE =
  'text-[1.125rem] leading-[1.25] font-semibold group-data-[count=1]/now:text-[1.5rem]'
export const NOW_PLAYING_META = 'text-[0.875rem] text-muted-foreground'
export const NOW_PLAYING_WRAP = 'justify-self-start'
