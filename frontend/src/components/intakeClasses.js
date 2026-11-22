// The admin intake flow: Add, a sitting's steps, Check, Details, Done, the add bar, results and drawer
// (#536, slice D5b). The class names stay on the elements as hooks (tests, e2e
// and print read them); the look is these utilities. The base layer zeroes
// margin and padding on every element, so a rule that said `margin: 0` is not
// repeated.
// Measured (WCAG 2.x, 2026-11-10). Confidence words are text, >= 4.5:1 on
// the surfaces they sit on (--surface in panels, --bg in the skim grid):
//   --ok-text      dark 4.53 surface / 5.47 bg    light 5.57 / 4.94
//   --accent-text  dark 4.52 / 5.46               light 6.46 / 5.73
//   --warn-text    dark 4.50 / 5.43               light 5.91 / 5.24
//   --text-3       dark 4.89 / 5.90               light 7.38 / 6.54
// (--ok, --accent and --warn themselves are marks; see the token block.)
// The add bar's waiting line sits on --accent-soft:
//   --text on --accent-soft 8.59 dark, 13.98 light
//   --text-2 6.69 / 6.52   --text-3 6.69 / 6.52   --accent-text 6.18 / 5.71
// "Already on the shelf" rows: an added cell is --ok, its "+n" numeral
// --accent-ink: --ok on --surface 3.21 dark / 5.14 light, --accent-ink on
// --ok 6.58 / 5.32. A book's number mark is words first (Read, Typed,
// Couldn't read); its colour only repeats them: --ok on --surface 3.21 dark /
// 5.14 light, --text-3 as the muted text everywhere, --badge (the darker
// warning) for what needs a hand. It is not match confidence: the server
// decides it from the series' run (design-system.md, "A mark that is not
// match confidence").
// The form controls take the shared admin rule; a bare control keeps its
// intrinsic width (an input is ~20 characters), which overflows a narrow grid
// cell, so INTAKE_FIELD_CELL's controls fill the cell. A long or unbroken name
// wraps inside its row or column instead of widening it (grid items default
// to min-width: auto).

export const INTAKE_FIELD_CELL =
  "grid text-[0.8125rem] gap-1 min-w-0 [&_label]:text-(--text-2) [&_:is(input,_select,_textarea):not([type='checkbox']):not([type='radio'])]:box-border [&_:is(input,_select,_textarea):not([type='checkbox']):not([type='radio'])]:min-w-0 [&_:is(input,_select,_textarea):not([type='checkbox']):not([type='radio'])]:w-full max-[900px]:[.intake-row_&]:col-[1/-1]"

export const INTAKE_REFUSAL = 'text-(--badge) text-[0.8125rem]'

export const INTAKE_KINDS =
  'grid gap-2 grid-cols-[repeat(5,minmax(0,1fr))] mb-6 max-[900px]:grid-cols-[repeat(2,minmax(0,1fr))]'

export const INTAKE_KIND =
  'text-(--text) grid [font:inherit] gap-[0.15rem] min-w-0 [overflow-wrap:anywhere] p-3 text-left [&>span]:min-w-0 [&>span]:[overflow-wrap:anywhere]'

export const INTAKE_KIND_NAME = 'font-semibold'

export const INTAKE_KIND_NOTE = 'text-(--text-2) text-[0.8125rem]'

export const INTAKE_KIND_WAYS = 'text-(--text-3) text-[0.75rem] mt-1'

export const INTAKE_UNFINISHED = 'list-none px-4'

export const INTAKE_SITTING =
  'items-center border-b border-b-(--line) grid gap-4 grid-cols-[minmax(0,1fr)_12rem_auto] py-3 last:[border-bottom:0] max-[900px]:grid-cols-[minmax(0,1fr)]'

export const INTAKE_SITTING_TEXT = 'min-w-0 [overflow-wrap:anywhere]'

export const INTAKE_SITTING_NAME = 'font-semibold'

export const INTAKE_SITTING_ACTIONS = 'items-center flex flex-wrap gap-2'

export const INTAKE_STEPS =
  "text-(--text-3) flex text-[0.8125rem] gap-1 list-none mb-4 [&_li]:border-t-[3px] [&_li]:border-t-(--line-strong) [&_li]:flex-1 [&_li]:pt-2 [&_li.done]:border-(--ok) [&_li.done]:text-(--text-2) [&_li[aria-current='step']]:border-(--accent) [&_li[aria-current='step']]:text-(--text) [&_li[aria-current='step']]:font-medium"

export const INTAKE_STEP =
  '[&_h2]:text-[1.125rem] [&_h2]:mb-3 [&_h2:focus]:outline-none [&>p[tabindex]:focus]:outline-none'

export const INTAKE_DROP =
  'bg-(--surface) border-[1.5px] border-dashed border-(--line-strong) rounded-(--radius) grid gap-2 justify-items-center p-6 text-center'

export const INTAKE_DROP_TITLE = 'font-semibold'

export const INTAKE_DROP_ACTIONS = 'flex flex-wrap gap-2 justify-center mt-2'

export const INTAKE_ACTIONS =
  'flex flex-wrap gap-2 [.intake-adds+&]:mt-4 [.intake-checkone_&]:grid [.intake-checkone_&]:grid-cols-[2fr_1fr_1fr] [.intake-checkone_&]:mt-3 [.intake-checkone_&.quiet]:flex [.intake-checkone_&.quiet]:mt-2 max-[900px]:[.intake-checkone_&]:grid-cols-[1fr_1fr] max-[900px]:[.intake-checkone_&_.primary]:col-[1/-1]'

export const INTAKE_FILE = 'cursor-pointer relative'

export const INTAKE_STRIP =
  'grid gap-2 grid-cols-[repeat(6,minmax(0,1fr))] list-none my-4 max-[900px]:grid-cols-[repeat(3,minmax(0,1fr))]'

export const INTAKE_BAR =
  'items-center flex flex-wrap gap-3 justify-between mt-4'

export const INTAKE_BAR_ACTIONS = 'flex flex-wrap gap-2'

export const INTAKE_CHECKONE =
  '[align-items:start] grid gap-4 grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] [&>div]:min-w-0 [&>div]:[overflow-wrap:anywhere] [&_h3:focus]:outline-none [.intake-garment-check_&]:mt-2 max-[900px]:grid-cols-[1fr]'

export const INTAKE_CHECKONE_SOURCE =
  'grid gap-2 min-w-0 [overflow-wrap:anywhere]'

export const INTAKE_OPTION =
  '[&>span]:min-w-0 [&>span]:[overflow-wrap:anywhere] items-center bg-(--surface) border border-(--line) rounded-(--radius) cursor-pointer grid gap-3 grid-cols-[auto_2.5rem_minmax(0,1fr)] py-2 px-3 [&.selected]:bg-(--accent-soft) [&.selected]:border-(--accent) [&:focus-within]:outline-2 [&:focus-within]:outline-solid [&:focus-within]:outline-(--accent) [&:focus-within]:outline-offset-2 max-[900px]:min-h-11'

export const INTAKE_ROW =
  '[&>div]:min-w-0 [&>div]:[overflow-wrap:anywhere] items-center border-b border-b-(--line) grid gap-4 grid-cols-[2rem_minmax(0,1fr)_minmax(0,12rem)_auto] py-2 [.intake-rows_li:last-child_&]:[border-bottom:0] max-[900px]:grid-cols-[2rem_minmax(0,1fr)_auto]'

export const INTAKE_CHECKONE_PHOTO =
  'border border-(--line) rounded-(--radius) block object-cover w-full max-[900px]:max-h-[14rem]'

export const INTAKE_READLINE =
  '[overflow-wrap:anywhere] bg-(--sunken) rounded-(--radius) font-mono text-[0.875rem] p-2'

export const INTAKE_QUESTION = 'font-semibold mb-2'

export const INTAKE_CANDIDATES = 'grid gap-2'

export const INTAKE_SKIM_HEAD = 'mt-6'

export const INTAKE_TYPED =
  'list-none [&_li]:items-center [&_li]:flex [&_li]:flex-wrap [&_li]:gap-2 px-3 items-center flex flex-wrap gap-2'

export const INTAKE_GARMENT_OTHERS =
  '[&_li]:items-center [&_li]:flex [&_li]:flex-wrap [&_li]:gap-2 grid gap-2 list-none mt-2 [&_img]:rounded-(--radius) [&_img]:h-12 [&_img]:object-cover [&_img]:w-12'

export const INTAKE_SKIM =
  'grid gap-2 grid-cols-[repeat(8,minmax(0,1fr))] list-none mt-2 [&_li]:grid [&_li]:gap-1 [&_li]:justify-items-start [&_li]:min-w-0 [&_label]:cursor-pointer [&_label]:grid [&_label]:gap-1 [&_label]:w-full [&_li.owned]:opacity-[0.55] [&_li.owned_label]:cursor-not-allowed max-[900px]:grid-cols-[repeat(4,minmax(0,1fr))]'

export const INTAKE_SKIM_NAME =
  'text-(--text-2) text-[0.75rem] leading-[1.2] [overflow-wrap:anywhere]'

export const INTAKE_GROW_LIST =
  'bg-(--surface) border border-(--line) rounded-(--radius) list-none mt-2'

export const INTAKE_GROW =
  "[align-items:start] border-t border-t-(--line) grid gap-y-2 gap-x-3 [grid-template-areas:'cover_body_edit'] grid-cols-[2.5rem_minmax(0,1fr)_auto] py-3 px-4 [&[data-tick]]:[grid-template-areas:'tick_cover_body_edit'] [&[data-tick]]:grid-cols-[auto_2.5rem_minmax(0,1fr)_auto] first:[border-top:0] max-[40rem]:[grid-template-areas:'tick_cover_body'_'._._edit'] max-[40rem]:grid-cols-[auto_2.5rem_minmax(0,1fr)] max-[40rem]:[&[data-tick]]:[grid-template-areas:'tick_cover_body'_'._._edit'] max-[40rem]:[&[data-tick]]:grid-cols-[auto_2.5rem_minmax(0,1fr)] max-[40rem]:[&:not([data-tick])]:[grid-template-areas:'cover_body'] max-[40rem]:[&:not([data-tick])]:grid-cols-[2.5rem_minmax(0,1fr)]"

export const INTAKE_GROW_TICK = '[grid-area:tick] mt-1'

export const INTAKE_GROW_COVER = '[grid-area:cover]'

export const INTAKE_GROW_BODY = '[grid-area:body] min-w-0'

export const INTAKE_GROW_EDIT =
  '[grid-area:edit] max-[40rem]:justify-self-start'

export const INTAKE_GROW_TITLE = 'font-semibold'

export const INTAKE_GROW_READ = 'text-(--text-3) text-[0.75rem] mt-[0.1rem]'

export const INTAKE_GROW_ADDS =
  'text-(--text-2) text-[0.875rem] mt-1 [&_b]:text-(--text) [&_.mono]:mt-2 [&_.mono]:max-w-[26rem]'

export const INTAKE_GROW_STRIP = 'mt-2 max-w-[26rem]'

export const INTAKE_GROW_FORM =
  'grid gap-2 mt-2 max-w-[22rem] [&_label]:text-[0.8125rem]'

export const INTAKE_GROW_FORM_ACTIONS = 'flex flex-wrap gap-2'

export const INTAKE_BOOK_LIMIT = 'text-[0.8125rem] mb-3'

export const INTAKE_BOOKS =
  'bg-(--surface) border border-(--line) rounded-(--radius) list-none'

export const INTAKE_BOOK =
  "[align-items:start] border-t border-t-(--line) grid gap-y-2 gap-x-4 [grid-template-areas:'tick_photo_match_number'] grid-cols-[auto_4.5rem_minmax(0,1fr)_minmax(13rem,17rem)] py-3 px-4 first:[border-top:0] [&[data-off]]:opacity-[0.55] max-[45rem]:[grid-template-areas:'tick_photo_match'_'._number_number'] max-[45rem]:grid-cols-[auto_4rem_minmax(0,1fr)] max-[45rem]:p-3"

export const INTAKE_BOOK_TICK =
  'accent-(--accent) [grid-area:tick] h-4 mt-1 w-4'

export const INTAKE_BOOK_PHOTO =
  'grid gap-1 [grid-area:photo] text-[0.75rem] [&_img]:aspect-[3/4] [&_img]:bg-(--sunken) [&_img]:border [&_img]:border-(--line) [&_img]:rounded-[0.25rem] [&_img]:object-cover [&_img]:w-full'

export const INTAKE_BOOK_MATCH = '[grid-area:match] min-w-0'

export const INTAKE_BOOK_TITLE = 'text-(--text) font-semibold leading-[1.35]'

export const INTAKE_BOOK_META = 'text-[0.8125rem]'

export const INTAKE_BOOK_LINKS = 'text-[0.8125rem] mt-1'

export const INTAKE_BOOK_READ =
  'bg-(--sunken) rounded-(--radius) text-(--text-2) inline-block [font:var(--fs-12)_/_1.5_var(--font-mono)] mt-2 max-w-full [overflow-wrap:anywhere] py-[0.15rem] px-2'

export const INTAKE_BOOK_MARK =
  "[&_a]:text-inherit [&_a]:underline text-(--text-3) text-[0.75rem] leading-[1.4] [&[data-state='in\\_run']]:text-(--ok-text) [&[data-state='none']]:text-(--badge) [&[data-state='bad']]:text-(--badge) [&[data-state='out\\_of\\_run']]:text-(--badge)"

export const INTAKE_BOOK_ADDS = 'text-(--text-2) text-[0.8125rem] mt-1'

export const INTAKE_BOOK_CONTENTS =
  'grid gap-1 [&_ul]:text-(--text-2) [&_ul]:text-[0.8125rem] [&_ul]:list-none'

export const INTAKE_DONE_MADE = 'text-(--text) font-semibold mt-4'

export const INTAKE_BOOK_NUMBER = 'grid gap-2 [grid-area:number]'

export const INTAKE_BOOK_FIELD =
  'grid gap-1 [&_label]:text-(--text-2) [&_label]:text-[0.8125rem] [&>span:first-child]:text-(--text-2) [&>span:first-child]:text-[0.8125rem] [&_select]:max-w-[14rem]'

export const INTAKE_BOOK_NUM =
  'items-center flex gap-2 [&_span]:text-(--text-3) [&_span]:[font:500_var(--fs-14)_var(--font-mono)]'

export const INTAKE_ADDS =
  'bg-(--surface) border border-(--line) rounded-(--radius) list-none mt-2 [&_li]:border-t [&_li]:border-t-(--line) [&_li]:py-3 [&_li]:px-4 [&_li:first-child]:[border-top:0]'

export const INTAKE_ADDS_TITLE =
  '[overflow-wrap:anywhere] text-(--text) font-semibold'

export const INTAKE_ADDS_WHAT = 'text-[0.875rem]'

export const INTAKE_ADDS_NEED = 'text-(--badge)'

export const INTAKE_PASS = 'mb-4 p-4 [&_h3]:text-[1rem] [&_h3]:mb-3'

export const INTAKE_SETALL_FIELDS =
  '[align-items:end] grid gap-3 grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] mb-4'

export const INTAKE_ROWS = 'list-none'

export const INTAKE_EDITIONS = 'col-[1/-1] order-1'

export const INTAKE_ROW_TITLE = 'font-medium'

export const INTAKE_ADD = 'grid gap-3'

export const INTAKE_ADDBAR =
  'grid gap-2 grid-cols-[minmax(0,1fr)_auto_auto] [&_input]:min-w-0'

export const INTAKE_RESULTS =
  'bg-(--surface) border border-(--line-strong) rounded-(--radius) grid gap-2 pt-1 pb-3 [&>p]:px-3 [&>ul:first-child]:list-none'

export const INTAKE_SOURCES =
  'px-3 grid text-[0.875rem] gap-2 list-none [&_li]:items-center [&_li]:flex [&_li]:flex-wrap [&_li]:gap-2'

export const INTAKE_RESULT =
  'items-center border-b border-b-(--line) grid gap-3 grid-cols-[1.9rem_minmax(0,1fr)_auto_auto] py-2 px-3 max-[900px]:grid-cols-[1.9rem_minmax(0,1fr)_auto] max-[900px]:[&_.cover]:row-[span_2] max-[900px]:[&>:is(button,_a)]:col-3 max-[900px]:[&>:is(button,_a)]:row-[1/span_2]'

export const INTAKE_RESULT_TEXT = 'grid min-w-0'

export const INTAKE_RESULT_TITLE = 'font-medium [overflow-wrap:anywhere]'

export const INTAKE_RESULT_KIND =
  'text-(--text-3) text-[0.75rem] tracking-[0.06em] uppercase max-[900px]:col-2 max-[900px]:row-2'

export const INTAKE_RESUME =
  'items-center flex flex-wrap text-[0.875rem] gap-y-2 gap-x-3 justify-between py-2 px-4'

export const INTAKE_WAITING =
  'items-center flex flex-wrap text-[0.875rem] gap-y-2 gap-x-3 justify-between py-2 px-4 bg-(--accent-soft) border border-(--line) rounded-(--radius) mb-4'

export const INTAKE_WAITING_ACTIONS = 'flex flex-wrap gap-2'

export const INTAKE_WITHDRAWER =
  "[align-items:start] grid gap-4 [&[data-drawer='open']]:grid-cols-[minmax(0,1fr)_340px]"

export const INTAKE_WITHDRAWER_MAIN = 'min-w-0'

/** The drawer's box (surface, ring, one column of fields); the aside and the
 *  phone's sheet add their own placement. */
export const INTAKE_DRAWER_BASE =
  'bg-(--surface) border border-(--line-strong) [container-type:inline-size] grid gap-3 p-4'
export const INTAKE_DRAWER = `${INTAKE_DRAWER_BASE} rounded-(--radius) sticky top-4`

export const INTAKE_DRAWER_HEAD =
  'items-center flex gap-3 [&_.cover]:flex-[none] [&_.cover]:w-12'

export const INTAKE_DRAWER_TITLE = 'text-[1.125rem] [overflow-wrap:anywhere]'

export const INTAKE_DRAWER_FIELDS =
  'grid gap-2 grid-cols-[repeat(2,minmax(0,1fr))] @max-[24rem]:grid-cols-[minmax(0,1fr)] [&>:not(.intake-field)]:col-[1/-1]'

export const INTAKE_GARMENT_FIELDS =
  'grid gap-2 grid-cols-[repeat(2,minmax(0,1fr))] [&>:not(.intake-field)]:col-[1/-1]'

export const INTAKE_DRAWER_ACTIONS = 'flex flex-wrap gap-2'

export const INTAKE_DRAWER_SHEET =
  '[border-radius:var(--radius)_var(--radius)_0_0] bottom-0 text-(--text) left-0 max-h-[85vh] max-w-full overflow-y-auto pb-[calc(1rem_+_env(safe-area-inset-bottom,0px))] fixed right-0 top-auto w-full [&:not([open])]:hidden [&::backdrop]:bg-(--overlay)'

export const INTAKE_CHECKSEARCH =
  'flex gap-2 mt-3 [&_input]:flex-1 [&_input]:min-w-0'

export const INTAKE_GARMENT_PHOTO =
  'aspect-[4/5] border border-(--line) rounded-(--radius) block max-h-[22rem] object-cover w-full max-[900px]:max-h-[13rem] [.intake-seed-card_&]:max-h-[10rem]'

export const INTAKE_GARMENT_MISSING = 'text-(--badge)'

export const INTAKE_SHOOTSEARCH =
  'mt-4 text-left [&_form]:flex [&_form]:gap-2 [&_input]:flex-1 [&_input]:min-w-0'

export const INTAKE_SEED_LIST = 'grid gap-3 list-none'

export const INTAKE_SEED_CARD =
  'border border-(--line) rounded-(--radius) grid gap-3 grid-cols-[minmax(0,8rem)_minmax(0,1fr)] p-3 max-[600px]:grid-cols-[minmax(0,1fr)]'

export const INTAKE_SEED_NOPHOTO =
  'items-center aspect-[4/5] border border-dashed border-(--line) rounded-(--radius) flex text-[0.8125rem] justify-center p-2 text-center'

export const INTAKE_LINKS =
  'grid gap-2 my-3 [&_textarea]:max-w-full [&_textarea]:min-w-0 [&_textarea]:w-full'

export const INTAKE_LINK_COLORS =
  '[border:0] flex flex-wrap gap-y-2 gap-x-3 mb-2 [&_legend]:text-[0.8125rem]'

export const INTAKE_LINK_FIELDS = '[border:0] min-w-0'

/** A confidence badge (Exact, Probable, Check, On shelf): the pill, then the
 *  state's ink (the class `conf-<state>` is built from the state). */
export const CONF =
  'border border-current rounded-[999px] inline-block text-[0.75rem] leading-[1.4] px-2 whitespace-nowrap'
export const CONF_STATE = {
  exact: 'text-(--ok-text)',
  probable: 'text-(--accent-text)',
  check: 'text-(--badge)',
  owned: 'text-(--text-3)',
}

/** A sitting's progress meter and its three parts (`intake-meter-<part>`).
 *  "Still reading" is drawn in the measured --status-backlog, not --line-strong
 *  (a mid grey, 3.38 on --bg in dark): --ok 4.39 dark, 4.16 light; --badge
 *  6.16, 4.78; --status-backlog 5.62, 4.89. */
export const INTAKE_METER =
  'bg-(--sunken) rounded-[3px] flex gap-0.5 h-1.5 overflow-hidden [&_i]:block [&_i]:basis-0 [&_i]:h-full'
export const METER_PART = {
  ready: 'bg-(--ok)',
  check: 'bg-(--badge)',
  reading: 'bg-(--status-backlog)',
}

/** A photo tile (`intake-shot-<state>` is built from the photo's state). */
export const INTAKE_SHOT =
  'text-(--text-3) grid text-[0.75rem] gap-1 min-w-0 [&_img]:aspect-[2/1] [&_img]:bg-(--sunken) [&_img]:border [&_img]:border-(--line) [&_img]:rounded-(--radius) [&_img]:block [&_img]:object-cover [&_img]:w-full'
export const INTAKE_SHOT_BLANK =
  'aspect-[2/1] bg-(--sunken) border border-(--line) rounded-(--radius) block object-cover w-full'
export const SHOT_STATE = {
  reading: '[&_img]:opacity-[0.55]',
  uploaded: '[&_img]:opacity-[0.55]',
  read: '[&_span:first-of-type]:text-(--text)',
}
