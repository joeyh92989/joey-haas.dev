// What index.css drew for Home's hero, the cover strip, the facts table, the
// shelf's header and tabs and a few one-off blocks (#536, group G3). The class
// names stay on the elements as hooks (tests, e2e and print read them); the
// look is these utilities. Every utility is written out whole: Tailwind reads
// source text, so a class glued from a constant is never emitted. A media
// query that is `max-width` inclusive is written `[@media(max-width:Npx)]`:
// Tailwind's `max-[Npx]` is strict.

// ---- Home's hero ----------------------------------------------------------
// The headline, lede and actions, with the At a glance card beside them from
// 981px and under them below it (the 3b1 mockup's break).

export const HERO =
  'grid [align-items:start] grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] gap-12 pt-12 [@media(max-width:980px)]:grid-cols-[minmax(0,1fr)] [@media(min-width:701px)_and_(max-width:980px)]:gap-8 [@media(min-width:701px)_and_(max-width:980px)]:pt-8 [@media(max-width:700px)]:gap-6 [@media(max-width:700px)]:pt-2'

// The one serif h1; every other h1 is the base sans 500.
export const HERO_TITLE =
  'mt-4 font-(family-name:--font-display) text-[length:var(--fs-56)] leading-[1.05] font-medium tracking-[-0.02em] text-balance [@media(max-width:700px)]:text-[length:var(--fs-40)]'

export const HERO_LEDE =
  'mt-4 mb-6 max-w-[54ch] text-(--text) text-[length:var(--fs-18)] [@media(max-width:700px)]:text-[length:var(--fs-16)]'

export const HERO_ACTIONS =
  'grid gap-3 grid-cols-[repeat(3,minmax(0,1fr))] [@media(max-width:700px)]:grid-cols-[repeat(2,minmax(0,1fr))]'

// ---- Cover strip (Home and Projects) --------------------------------------

export const COVER_STRIP =
  'mt-4 grid gap-2 grid-cols-[repeat(4,minmax(0,3.25rem))] [.project-card_&]:mb-3'

// ---- Facts table (a trip's) -----------------------------------------------

export const FACTS_TABLE =
  'bg-(--surface) border border-(--line) rounded-[var(--radius)] [&>div]:flex [&>div]:justify-between [&>div]:gap-4 [&>div]:border-t [&>div]:border-t-(--line) [&>div]:px-4 [&>div]:py-3 [&>div]:text-[0.875rem] [&>div:first-child]:[border-top:0] [&_dt]:flex-none [&_dt]:text-(--text-2) [&_dd]:font-medium [&_dd]:text-(--text) [&_dd]:text-right'

// ---- The shelf's header and tabs (SpineHeader, SpineTabs) -----------------

export const SPINE_HEADER = 'min-w-0 border-b border-b-(--line) mb-6 pb-1'

export const SPINE_NAME =
  'font-sans text-(--text) text-[length:var(--fs-28)] leading-[1.2] font-medium'

const TAP =
  '[@media(max-width:700px)]:inline-flex [@media(max-width:700px)]:items-center [@media(max-width:700px)]:min-h-11'
const RING =
  'focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-(--accent) focus-visible:outline-offset-2'

/** The shelf's name is a link: it keeps the text colour and the phone height. */
export const SPINE_NAME_LINK = `text-inherit ${RING} ${TAP}`

export const SPINE_LEDE =
  'mt-2 max-w-[min(45rem,68ch)] text-(--text-2) text-[length:var(--fs-18)]'

// A tab row: wrapping on a desktop, one row that scrolls sideways on a phone
// (#192), the right edge faded with a mask. The 2px focus ring plus offset
// would be clipped by the overflow, so the row pads every side and the
// negative margins give the space back.
export const SPINE_TABS =
  'flex flex-wrap gap-4 [@media(min-width:701px)]:mt-3 [@media(max-width:700px)]:flex-nowrap [@media(max-width:700px)]:overflow-x-auto [@media(max-width:700px)]:mt-[calc(0.75rem-4px)] [@media(max-width:700px)]:mr-[-4px] [@media(max-width:700px)]:mb-[-4px] [@media(max-width:700px)]:ml-[-4px] [@media(max-width:700px)]:pt-1 [@media(max-width:700px)]:pr-8 [@media(max-width:700px)]:pb-1 [@media(max-width:700px)]:pl-1 [@media(max-width:700px)]:[scrollbar-width:none] [@media(max-width:700px)]:[-webkit-mask-image:linear-gradient(to_right,var(--mask-opaque)_calc(100%-2rem),transparent)] [@media(max-width:700px)]:[mask-image:linear-gradient(to_right,var(--mask-opaque)_calc(100%-2rem),transparent)] [@media(max-width:700px)]:[&::-webkit-scrollbar]:hidden'

export const SPINE_TAB = `rounded-none border-b-2 border-b-transparent py-2 text-[length:var(--fs-16)] font-medium text-(--text-3) [&:hover]:text-(--text) aria-[current=page]:border-b-(--accent) aria-[current=page]:text-(--text) ${RING} [@media(max-width:700px)]:flex-none [@media(max-width:700px)]:whitespace-nowrap ${TAP}`

export const SPINE_TAB_BADGE =
  'ml-1 align-[0.15em] font-mono text-[0.75rem] font-medium tracking-[0.04em] text-(--accent-text) uppercase'

// ---- One-off blocks --------------------------------------------------------

/** A tap target on a phone (#276): 44px high. */
export const PHONE_TAP = TAP

export const ROUTE_ERROR = 'grid gap-3 py-8'

export const PROGRESS = 'inline-flex items-center gap-1'
export const PROGRESS_BAR =
  "relative inline-block h-1 w-[3.2rem] overflow-hidden rounded-[2px] bg-(--sunken) after:absolute after:top-0 after:right-auto after:bottom-0 after:left-0 after:w-[var(--p,0%)] after:bg-(--status-active) after:content-['']"

export const PROSE_LIST =
  'grid gap-2 max-w-[min(45rem,68ch)] pl-4 text-(--text-2)'
export const NOW_FINISHED = 'max-w-[min(45rem,68ch)] text-(--text-2)'

export const FOOTER_ADMIN = 'text-(--text-3)'

export const CLAMP_6 = 'line-clamp-6'
export const ITEM_TTB = 'flex items-baseline justify-between gap-2'
export const ITEM_TILE_FIGURE =
  'text-(--text) text-[length:var(--fs-16)] tabular-nums'
