import { buttonVariants } from './ui/button-variants.js'

// The admin shell's controls, drawn from the Button look (#535). Eager shell
// code takes `buttonVariants`, never the Base UI Button or `cn` (#529). Only
// what the Button look does not say is added here: a shape, and the current
// mark. Type sizes for the rail and tab labels sit on their inner spans
// (`AREA_LABEL`), since a size class here would fight the button's `text-sm`.
//
// `justify-start!` and `justify-between!` are important on purpose: the
// button look centres (`justify-center`), and with no class merger two
// utilities for one property are ordered by the stylesheet, not by us.
//
// Current pages carry a foreground border and a card fill as well as the
// colour, and an area or page is current through `aria-current`, so the
// style follows the same attribute a screen reader reads.

// The ghost button's hover fill is --sunken, which is the rail's and the
// segment row's own fill: only the text would change. Hover is --surface
// (`bg-card`) everywhere in the shell. Important, because it shares a
// property with the variant's `hover:bg-accent`.
const HOVER = 'hover:bg-card!'

const CURRENT = `${HOVER} aria-[current]:border-foreground aria-[current]:bg-card aria-[current]:text-foreground`

const ghost = buttonVariants({ variant: 'ghost', size: 'bare' })

/** An area link in the desktop rail: icon over label, 56px wide. */
export const railLink = `${ghost} relative h-auto min-h-12 w-14 flex-col px-0.5 py-1.5 ${CURRENT}`

/** An area link in the phone tab bar: one equal 52px+ target per area. */
export const tabLink = `${ghost} relative h-auto min-h-13 min-w-0 flex-col px-0.5 py-1.5 ${CURRENT}`

/** A page link in the area's page list (desktop). */
export const pageLink = `${ghost} h-auto min-h-9 w-full justify-start! px-3 py-2 ${CURRENT}`

/**
 * A segment of the phone's page control: a link, or the sheet's button.
 * Weight 400 until current (the button look is 500, and the wider word is
 * what pushed a row past 320px); `px-1` keeps four segments beside the
 * account button inside 320px. `!` because both weights are one property.
 */
export const segmentLink = `${ghost} min-h-9 flex-[1_0_auto] px-1 text-[0.8125rem] font-normal! aria-[current]:font-medium! ${CURRENT}`

/** The account trigger at the head of the desktop rail. */
export const accountRail = `${ghost} h-auto min-h-12 w-14 flex-col px-0.5 py-1 ${HOVER} aria-expanded:border-foreground aria-expanded:bg-card aria-expanded:text-foreground`

/** The account trigger on a phone: the mark and a caret. */
export const accountPill = `${buttonVariants({ variant: 'quiet', size: 'bare' })} h-11 px-2 aria-expanded:border-foreground aria-expanded:bg-card`

/**
 * A row in the account panel; 44px on a phone. A pending sign-out is
 * `aria-disabled` (not `disabled`, so focus stays): it reads as disabled
 * with the default cursor and no hover fill, which the legacy sheet cannot
 * say now that utilities sit above it.
 */
export const accountRow = `${ghost} h-auto min-h-9 w-full justify-between! px-3 py-2 ${HOVER} aria-disabled:cursor-default! aria-disabled:hover:bg-transparent! max-[900px]:min-h-11 max-[900px]:text-base`

/** The sign-in link on the gate. */
export const signInLink = buttonVariants({ variant: 'outline', size: 'lg' })

// ---- The frame and its columns ----
//
// The shell's own layout, which was `.admin-app`, `.admin-rail`, `.admin-side`,
// `.admin-tabs`, `.admin-subnav` and `.acct*` in index.css (#536). The hook
// class names stay on the elements where a test or a rule still reads them.

/** The frame: on a desktop a rail, the area's page list, then the page. */
export const APP = 'min-h-screen'
export const APP_DESKTOP = 'grid grid-cols-[64px_232px_minmax(0,1fr)]'
export const APP_PHONE = 'block'

/** The page. A phone keeps clear of the fixed tab bar (90px is off the scale). */
export const MAIN = 'min-w-0 focus:outline-none'
export const MAIN_DESKTOP = 'px-8 pt-6 pb-8'
export const MAIN_PHONE = 'px-4 pt-4 pb-[90px]'

/** The rail: over the page list beside it, so the account panel opens above it. */
export const RAIL =
  'sticky top-0 z-5 flex h-screen flex-col items-center gap-2 border-r border-r-line-card bg-secondary py-4'
export const RAIL_NAV = 'grid justify-items-center gap-2'

/** The monogram, as the public masthead draws it: an outlined square, mono 500
 *  (the 600 cut is not loaded). */
export const MARK =
  'grid size-8 place-items-center rounded-[4px] border border-foreground bg-transparent font-mono text-[0.75rem] leading-[normal] font-medium text-foreground'

export const AREA_ICON = 'text-base leading-[1.2]'
const LABEL = 'font-sans text-[0.75rem] leading-[1.1]'
/** An area's name under its icon (the rail, the account trigger). */
export const AREA_LABEL = `${LABEL} font-normal`
/** The tab bar's label is a weight heavier. */
export const TAB_LABEL = `${LABEL} font-medium`

// An area's or page's pending count. See --badge for its measured contrast.
// The base sets no display or position: each place sets its own.
const BADGE =
  'min-h-4 min-w-4 place-items-center rounded-[999px] bg-[color:var(--badge)] px-1 font-sans text-[0.75rem] leading-none font-semibold text-[color:var(--badge-ink)]'
/** On a rail link: in the corner. */
export const BADGE_RAIL = `${BADGE} absolute top-1 right-1 grid`
/** On a tab: anchored by its left edge so a two-digit pill grows away from the icon. */
export const BADGE_TAB = `${BADGE} absolute top-[6px] right-auto left-[calc(50%+0.25rem)] grid`
/** In the page list: at the end of the row. */
export const BADGE_PAGE = `${BADGE} static ml-auto inline-grid`
/** In a phone segment: after the word. */
export const BADGE_SEGMENT = `${BADGE} static ml-1 inline-grid align-middle`

export const SIDE =
  'sticky top-0 flex h-screen flex-col gap-1 overflow-y-auto border-r border-r-line-card bg-background px-3 py-4'
export const SIDE_TITLE =
  'px-3 py-2 font-heading text-xl leading-[1.2] font-medium'
export const SIDE_SMALL =
  'mt-1 block font-sans text-[0.75rem] leading-[normal] font-normal text-[color:var(--text-3)]'
export const SIDE_KICKER = 'mt-4 px-3 pt-0 pb-2'
export const SIDE_LIST = 'grid list-none gap-[2px]'
export const SIDE_COUNT =
  'ml-auto text-[0.75rem] font-normal text-[color:var(--text-3)]'

/** The phone tab bar: fixed to the bottom, one equal target per area. */
export const TABS =
  'fixed inset-x-0 bottom-0 z-30 grid auto-cols-[1fr] grid-flow-col gap-1 border-t border-t-line-card bg-background px-1 pt-1 pb-[calc(0.25rem+env(safe-area-inset-bottom,0px))]'

/** The phone's top row: the account button, then the segments. A row that
 *  does not fit beside the button drops under it, so nothing is clipped. */
export const PHONE_TOP = 'mb-4 flex flex-wrap items-center gap-2'

/** The phone's segmented control: a hairline box like the masthead's
 *  controls. A safety net on `overflow-x`: a badge must never widen the page
 *  (the focus ring still fits in the 4px padding). */
export const SUBNAV =
  'flex min-w-0 flex-auto gap-[2px] overflow-x-auto rounded-[var(--radius)] border border-line-card bg-secondary p-1'

// ---- The account menu (#503) ----

export const ACCT = 'relative'
export const ACCT_RAIL = 'mb-2'
export const ACCT_CARET = 'flex-none text-[color:var(--text-3)]'
export const ACCT_CARET_UP = '[transform:rotate(180deg)]'

const PANEL =
  'absolute z-50 rounded-[var(--radius)] border border-line-card bg-card p-2 text-left text-muted-foreground motion-safe:[&:not([hidden])]:animate-[acct-in_0.12s_ease-out]'
/** The rail's panel opens to its right, 13.5rem wide. */
export const ACCT_PANEL_RAIL = `${PANEL} top-0 left-[calc(100%+0.5rem)] w-54`
/** The phone's opens below the button. */
export const ACCT_PANEL_PHONE = `${PANEL} top-[calc(100%+6px)] left-0 w-[min(18rem,calc(100vw-2rem))]`
export const ACCT_WHO =
  'mx-0 mt-0 mb-2 grid border-b border-b-line-card px-3 pt-1 pb-3 leading-[1.4]'
export const ACCT_WHO_LABEL = 'text-[0.75rem] text-[color:var(--text-3)]'
export const ACCT_WHO_EMAIL =
  'text-[0.875rem] text-foreground [overflow-wrap:anywhere]'
export const ACCT_LIST = 'm-0 grid list-none gap-[2px] p-0'
export const ACCT_ARROW = 'text-[color:var(--text-3)]'
export const ACCT_ERROR =
  "m-0 px-3 pt-2 pb-1 text-[0.8125rem] leading-[1.4] text-foreground before:mr-2 before:inline-block before:size-2 before:rounded-[2px] before:bg-[color:var(--warn)] before:content-['']"

// ---- The gate: signed out, waking or failed, a plain centred panel ----

export const GATE =
  'grid min-h-screen place-items-center px-4 py-6 focus:outline-none'
export const GATE_PANEL =
  'w-full max-w-[26rem] rounded-[var(--radius)] border border-line-card bg-card p-6'
export const GATE_TITLE = 'mb-3 text-[1.5rem]'
