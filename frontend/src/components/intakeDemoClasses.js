// The public intake demo (/shelf/intake)
// (#536, slice D5b). The class names stay on the elements as hooks (tests, e2e
// and print read them); the look is these utilities. The base layer zeroes
// margin and padding on every element, so a rule that said `margin: 0` is not
// repeated.
// Spines alternate --sunken and --accent-soft under --text: --text on --sunken
// 8.59 dark, 12.81 light; --text on --accent-soft 8.59 dark, 13.98 light.
// The confidence words reuse CONF on --surface. Long titles take smaller type
// and the full height instead of being clipped at the shelf line (#200); the
// ellipsis is the last resort on a phone.

export const INTAKE_DEMO = '[&_h1]:mb-2 max-[900px]:[&_.btn]:min-h-11'

export const INTAKE_DEMO_LEDE = 'text-(--text-2) mb-6 max-w-[min(45rem,68ch)]'

export const INTAKE_DEMO_GRID =
  '[align-items:start] grid gap-6 grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] max-[900px]:grid-cols-[minmax(0,1fr)]'

export const INTAKE_DEMO_SHELF =
  'bg-(--surface) border border-(--line) rounded-(--radius) p-4'

export const INTAKE_DEMO_OUT =
  'bg-(--surface) border border-(--line) rounded-(--radius)'

export const INTAKE_DEMO_SPINES =
  'items-end border-b-[6px] border-b-(--line-strong) flex gap-[3px] h-57.5 px-1 max-[900px]:h-42.5'

export const INTAKE_DEMO_SPINE =
  "items-center bg-(--sunken) border border-(--line) [border-radius:2px_2px_0_0] text-(--text) flex flex-1 text-[0.625rem] font-semibold tracking-[0.06em] min-w-0 overflow-hidden [padding:6px_3px] text-ellipsis uppercase whitespace-nowrap [writing-mode:vertical-rl] [&[data-size='md']]:text-[0.5625rem] [&[data-size='md']]:tracking-[0.03em] [&[data-size='sm']]:text-[0.5rem] [&[data-size='sm']]:tracking-[0.02em] [&[data-size='xs']]:text-[0.4375rem] [&[data-size='xs']]:tracking-[0.01em] [&[data-tone='soft']]:bg-(--accent-soft)"

export const INTAKE_DEMO_ACTIONS = 'items-center flex flex-wrap gap-2 mt-4'

export const INTAKE_DEMO_FOOT =
  'items-center flex flex-wrap gap-2 text-(--text-3) text-[0.8125rem] justify-between mt-3'

export const INTAKE_DEMO_STAGES =
  "grid text-[0.75rem] gap-2 grid-cols-[repeat(4,minmax(0,1fr))] list-none mb-4 [&_li]:bg-(--surface) [&_li]:border [&_li]:border-(--line) [&_li]:rounded-(--radius) [&_li]:text-(--text-3) [&_li]:p-2 [&_b]:text-(--text) [&_b]:block [&_b]:text-[0.8125rem] [&_b]:font-medium [&_li[data-state='done']]:border-(--ok) [&_li[data-state='now']]:bg-(--accent-soft) [&_li[data-state='now']]:border-(--accent) max-[900px]:grid-cols-[repeat(2,minmax(0,1fr))]"

export const INTAKE_DEMO_ROWS = 'list-none'

export const INTAKE_DEMO_ROW =
  'items-center border-b border-b-(--line) grid gap-3 grid-cols-[minmax(0,1fr)_auto] py-2 px-3 last:[border-bottom:0]'

export const INTAKE_DEMO_TITLE = 'block text-[1rem] font-medium leading-[1.3]'

export const INTAKE_DEMO_META = 'text-(--text-3) text-[0.8125rem]'

export const INTAKE_DEMO_FINE =
  'text-(--text-3) text-[0.8125rem] mt-4 [&_a]:text-current [&_a]:underline [&_a]:decoration-1 [&_a]:underline-offset-[0.18em]'

export const INTAKE_DEMO_NOTE =
  'text-(--text-3) text-[0.8125rem] mt-4 [&:empty]:m-0'
