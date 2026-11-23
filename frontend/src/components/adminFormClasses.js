// The admin add form and collection table (ItemForm, AdminCollection), the load state, the Now page's RSS line and ConfirmDelete's detail line
// (#536, group G2). The class names stay on the elements as hooks (tests, e2e
// and print read them); the look is these utilities. Every utility is written
// out whole: Tailwind reads source text, so a class glued from a constant is
// never emitted.

export const ITEM_FORM =
  "flex flex-wrap gap-2 mb-6 mt-4 [&_input]:bg-(--surface) [&_input]:border [&_input]:border-(--line) [&_input]:rounded-[8px] [&_input]:text-(--text) [&_input]:text-[0.875rem] [&_input]:p-2 [&_select]:bg-(--surface) [&_select]:border [&_select]:border-(--line) [&_select]:rounded-[8px] [&_select]:text-(--text) [&_select]:text-[0.875rem] [&_select]:p-2 [&_button]:bg-(--surface) [&_button]:border [&_button]:border-(--line) [&_button]:rounded-[8px] [&_button]:text-(--text) [&_button]:text-[0.875rem] [&_button]:p-2 [&_input[type='number']]:w-26 [&_input::placeholder]:text-(--text-3) [&_input:focus-visible]:border-(--accent) [&_input:focus-visible]:outline-2 [&_input:focus-visible]:outline-solid [&_input:focus-visible]:outline-(--accent) [&_input:focus-visible]:outline-offset-2 [&_select:focus-visible]:border-(--accent) [&_select:focus-visible]:outline-2 [&_select:focus-visible]:outline-solid [&_select:focus-visible]:outline-(--accent) [&_select:focus-visible]:outline-offset-2 [&_button]:cursor-pointer [&_button:hover]:border-(--accent) [&>button[type='submit']]:[align-self:end]"

export const ITEM_TABLE =
  '[&_select]:bg-(--surface) [&_select]:border [&_select]:border-(--line) [&_select]:rounded-[8px] [&_select]:text-(--text) [&_select]:text-[0.875rem] [&_select]:p-2 [&_button]:bg-(--surface) [&_button]:border [&_button]:border-(--line) [&_button]:rounded-[8px] [&_button]:text-(--text) [&_button]:text-[0.875rem] [&_button]:p-2 [&_select:focus-visible]:border-(--accent) [&_select:focus-visible]:outline-2 [&_select:focus-visible]:outline-solid [&_select:focus-visible]:outline-(--accent) [&_select:focus-visible]:outline-offset-2 [&_button]:cursor-pointer [&_button:hover]:border-(--accent) [border-collapse:collapse] min-w-[32rem] w-full [&_th]:border-b [&_th]:border-b-(--line) [&_th]:py-2 [&_th]:px-3 [&_th]:text-left [&_td]:border-b [&_td]:border-b-(--line) [&_td]:py-2 [&_td]:px-3 [&_td]:text-left [&_th]:text-(--text-3) [&_th]:text-[0.75rem] [&_th]:font-semibold [&_th]:tracking-[0.06em] [&_th]:uppercase'

export const LINKED_SOURCE = 'basis-full text-[0.8125rem] m-0'

export const ITEM_TABLE_WRAP = '[overflow-x:auto]'

export const FULL_ADD_FORM =
  '[margin-block:var(--space-4)] [&_summary]:cursor-pointer [&_summary]:[padding-block:var(--space-2)] [&_summary]:font-semibold'

export const LOAD_STATE = 'items-center flex flex-wrap gap-3 [&_p]:m-0'

export const NOW_RSS = 'mt-3'

export const CONFIRM_DETAIL =
  'text-(--text-2) flex-[1_1_100%] text-[0.8125rem] leading-[1.4]'

export const ITEM_FORM_FIELD =
  'grid gap-1 [align-content:start] [&_label]:text-(--text-2) [&_label]:text-[0.8125rem]'

export const ITEM_FORM_REQUIRED = 'text-(--text-2) text-[0.75rem]'

export const ITEM_FORM_ERROR = 'm-0'

export const ITEM_FORM_LABEL_ROW = '[align-items:baseline] flex gap-2'
