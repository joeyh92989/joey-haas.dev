// The Tour (/shelf/how): its primitives (Capture, LiveBox, Redacted, bars) and the page (Stop, StopIndex)
// (#536, group G2). The class names stay on the elements as hooks (tests, e2e
// and print read them); the look is these utilities. Every utility is written
// out whole: Tailwind reads source text, so a class glued from a constant is
// never emitted.

export const TOUR_LIVE =
  'bg-(--surface) border border-(--line) rounded-[8px] p-4'

export const TOUR_LIVE_CAPTION =
  'text-(--text-3) text-[0.8125rem] mt-2 mb-0 mx-0'

export const TOUR_CAPTURE =
  'bg-(--surface) border border-(--line-strong) rounded-[8px] m-0 overflow-hidden'

export const TOUR_CAPTURE_BAR =
  'items-center bg-(--sunken) border-b border-b-(--line) text-(--text-3) flex font-mono text-[0.75rem] gap-2 py-2 px-3'

export const TOUR_CAPTURE_DOT =
  'bg-(--line-strong) rounded-[50%] flex-[none] h-2 w-2'

export const TOUR_CAPTURE_URL =
  'text-(--text-2) [margin-left:var(--space-2)] min-w-0 [overflow-wrap:anywhere]'

export const TOUR_CAPTURE_TAG = '[margin-left:auto] whitespace-nowrap'

export const TOUR_CAPTURE_BODY = 'text-[0.8125rem] p-4 [&>*+*]:mt-4'

export const TOUR_CAPTURE_NOTE =
  'bg-(--sunken) border-t border-t-(--line) text-(--text-3) font-mono text-[0.75rem] py-2 px-3'

export const TOUR_CAPTURE_SCROLL = '[overflow-x:auto]'

export const TOUR_CAPTURE_TABLE =
  '[border-collapse:collapse] text-[0.8125rem] w-full [&_th]:border-b [&_th]:border-b-(--line) [&_th]:text-(--text-3) [&_th]:font-mono [&_th]:text-[0.75rem] [&_th]:font-medium [&_th]:tracking-[0.05em] [&_th]:p-2 [&_th]:text-left [&_th]:uppercase [&_th]:whitespace-nowrap [&_td]:border-b [&_td]:border-b-(--line) [&_td]:text-(--text-2) [&_td]:p-2 [&_td]:[vertical-align:top] [&_td:first-child]:text-(--text) [@media(max-width:34rem)]:text-[0.75rem] [@media(max-width:34rem)]:[&_th]:[overflow-wrap:anywhere] [@media(max-width:34rem)]:[&_th]:px-1 [@media(max-width:34rem)]:[&_td]:[overflow-wrap:anywhere] [@media(max-width:34rem)]:[&_td]:px-1 [@media(max-width:34rem)]:[&_th]:[white-space:normal]'

export const TOUR_REDACTED =
  '[background:var(--redact)] rounded-[3px] inline-block h-3.5 align-middle w-18'

export const TOUR_KV =
  'grid text-[0.8125rem] gap-y-1 gap-x-4 grid-cols-[max-content_1fr] m-0 [&_div]:[display:contents] [&_dt]:text-(--text-3) [&_dt]:font-mono [&_dt]:text-[0.75rem] [&_dt]:tracking-[0.05em] [&_dt]:pt-1 [&_dt]:uppercase [&_dd]:text-(--text) [&_dd]:m-0'

export const TOUR_BAR_ROW =
  'items-center grid text-[0.8125rem] gap-3 grid-cols-[7.5rem_1fr_2.5rem] py-1 px-0 [@media(max-width:34rem)]:grid-cols-[6.5rem_1fr_2rem]'

export const TOUR_BAR =
  'bg-(--sunken) border border-(--line-card) rounded-[4px] h-2.5 overflow-hidden relative'

export const TOUR_BAR_FILL = 'bg-(--chart) [inset:0_auto_0_0] absolute'

export const TOUR_BAR_VALUE = 'text-(--text-3) font-mono text-right'

export const TOUR_TITLE = 'mt-6 mb-3 mx-0'

export const TOUR_LEDE =
  'text-(--text-2) text-[1.125rem] max-w-[min(45rem,68ch)]'

export const TOUR_TOC =
  '[&_ol]:border-b [&_ol]:border-b-(--line) [&_ol]:border-t [&_ol]:border-t-(--line) [&_ol]:[column-gap:var(--space-6)] [&_ol]:grid [&_ol]:[grid-auto-flow:column] [&_ol]:grid-cols-[repeat(3,minmax(0,1fr))] [&_ol]:[grid-template-rows:repeat(3,auto)] [&_ol]:list-none [&_ol]:mt-6 [&_ol]:mb-2 [&_ol]:mx-0 [&_ol]:p-0 [&_li+li:not(:nth-child(3n_+_1))]:border-t [&_li+li:not(:nth-child(3n_+_1))]:border-t-(--line) [&_a]:[align-items:baseline] [&_a]:text-(--text) [&_a]:grid [&_a]:text-[0.875rem] [&_a]:gap-3 [&_a]:grid-cols-[2rem_1fr_auto] [&_a]:py-2 [&_a]:px-0 [@media(max-width:60rem)]:[&_ol]:[grid-auto-flow:row] [@media(max-width:60rem)]:[&_ol]:grid-cols-[1fr] [@media(max-width:60rem)]:[&_ol]:[grid-template-rows:none] [@media(max-width:60rem)]:[&_li+li]:border-t [@media(max-width:60rem)]:[&_li+li]:border-t-(--line) [@media(max-width:34rem)]:[&_a]:grid-cols-[2rem_minmax(0,1fr)]'

export const TOUR_TOC_N = 'text-(--accent-text) font-mono text-[0.75rem]'

export const TOUR_TOC_WHERE =
  'text-(--text-3) font-mono text-[0.75rem] tracking-[0.05em] uppercase [@media(max-width:34rem)]:col-2'

export const TOUR_STOP =
  'border-t border-t-(--line) mt-8 pt-12 [&_h2]:[font-family:var(--font-display)] [&_h2]:text-[2rem] [&_h2]:font-medium [&_h2]:tracking-[-0.01em] [&_h2]:leading-[1.15] [&_h2]:mt-2 [&_h2]:mb-3 [&_h2]:mx-0 [&_h2]:[scroll-margin-top:1rem] [&_h2:focus]:outline-none [&_h2:focus-visible]:outline-2 [&_h2:focus-visible]:outline-solid [&_h2:focus-visible]:outline-(--accent) [&_h2:focus-visible]:outline-offset-2 [@media(max-width:34rem)]:[&_h2]:text-[1.5rem]'

export const TOUR_STOP_N =
  'text-(--accent-text) font-mono text-[0.75rem] tracking-[0.06em] m-0 uppercase'

export const TOUR_STOP_CLAIM =
  'text-(--text-2) text-[1rem] mb-6 max-w-[min(45rem,68ch)]'

export const TOUR_STOP_COLS =
  '[align-items:start] grid gap-6 grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] [&.one]:grid-cols-[minmax(0,1fr)] [&.one]:max-w-[45rem] [@media(max-width:34rem)]:grid-cols-[minmax(0,1fr)]'

export const TOUR_STOP_COL =
  '[&_h3]:items-center [&_h3]:text-(--text-3) [&_h3]:flex [&_h3]:font-mono [&_h3]:text-[0.75rem] [&_h3]:font-medium [&_h3]:gap-2 [&_h3]:tracking-[0.08em] [&_h3]:mt-0 [&_h3]:mb-3 [&_h3]:mx-0 [&_h3]:uppercase'

export const TOUR_LIVE_DOT = 'bg-(--ok) rounded-[50%] h-[7px] w-[7px]'

export const TOUR_STOP_WHY =
  'text-(--text-2) text-[0.875rem] mt-4 max-w-[min(45rem,68ch)] [&_strong]:text-(--text) [&_strong]:font-medium'

export const TOUR_STOP_LINKS = 'flex flex-wrap gap-y-2 gap-x-4 mt-3'

export const TOUR_CLOSING =
  'flex flex-wrap border-t border-t-(--line) text-[0.875rem] gap-y-2 gap-x-6 mt-8 pt-4'

export const TOUR_CODE_LINK =
  'font-mono text-[0.8125rem] [overflow-wrap:anywhere] [&_span]:text-(--text-3)'

export const TOUR_COVERS =
  'grid gap-2 grid-cols-[repeat(4,minmax(0,1fr))] list-none m-0 p-0 [&_a]:text-(--text) [&_a]:flex [&_a]:[flex-direction:column] [&_a]:text-[0.75rem] [&_a]:gap-1 [&_a]:leading-[1.3]'

export const TOUR_CAPTURE_PICK = 'text-(--text) font-medium mt-0 mb-2 mx-0'

export const TOUR_CODE =
  'bg-(--code-bg) border border-(--line) rounded-[4px] text-(--text) font-mono text-[0.75rem] leading-[1.5] m-0 [overflow-x:auto] py-3 px-4'

/** A pill in a capture's table. Its text stays --text, which clears AA
 *  everywhere; the tone is carried by the border, a non-text mark held to 3:1
 *  (light --warn text is 4.24). The border colour is in the tone, not here, so
 *  two border colours never fight over one element. */
export const TOUR_PILL =
  'border rounded-[999px] text-(--text) font-mono text-[0.75rem] font-medium py-[0.1rem] px-2 whitespace-nowrap [@media(max-width:34rem)]:[.tour-capture-table_&]:[white-space:normal]'
export const PILL_TONE = {
  none: 'border-(--line-strong)',
  ok: 'border-(--ok)',
  warn: 'border-(--warn)',
  acc: 'border-(--accent)',
}

/** The "Try it" line under a live box. */
export const HOW_TRY = 'text-[0.875rem] mt-3'
