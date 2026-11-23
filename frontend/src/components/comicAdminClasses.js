// The comic admin pages (the comic edit page, a book's page, Books, Collects, the tag picker, the edition link picker) and the public Book page and single-book card
// (#536, group G2). The class names stay on the elements as hooks (tests, e2e
// and print read them); the look is these utilities. Every utility is written
// out whole: Tailwind reads source text, so a class glued from a constant is
// never emitted.

export const COMIC_FIELDS = 'grid gap-1'

export const COMIC_PRIVATE =
  'border border-(--line-strong) rounded-[999px] text-(--text-2) text-[0.75rem] py-0 px-2'

export const COMIC_EDITIONS =
  '[border:0] grid gap-2 col-[1/-1] my-1 mx-0 min-w-0 p-0 [&_legend]:text-(--text-3) [&_legend]:text-[0.8125rem] [&_legend]:mb-2 [&_legend]:p-0 [&>.link-button]:[justify-self:start]'

export const COMIC_EDITION_ROW =
  'items-center grid gap-2 grid-cols-[minmax(0,7rem)_minmax(0,1fr)_4rem_4rem_auto] [@media(max-width:700px)]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_3.5rem_3.5rem_auto]'

export const COMIC_FIELD_ERROR =
  'col-2 m-0 [.comic-editions_&]:col-[1/-1] [@media(max-width:700px)]:col-[1/-1] [.admin-collect-field_&]:col-[auto]'

export const COMIC_HINT =
  'text-[0.875rem] mt-0 mb-2 mx-0 [.tag-picker_&]:col-[1/-1] [.tag-picker_&]:m-0'

export const TAG_PICKER =
  '[border:0] grid gap-3 col-[1/-1] my-2 mx-0 min-w-0 p-0 [&_legend]:text-(--text-2) [&_legend]:text-[0.8125rem] [&_legend]:mb-2 [&_legend]:p-0 [&_.chip-row]:[-webkit-mask-image:none] [&_.chip-row]:flex-wrap [&_.chip-row]:mt-0 [&_.chip-row]:[mask-image:none] [&_.chip-row]:[overflow-x:visible] [&_.chip-row]:[margin-inline-start:0] [&_.chip-row]:p-0'

export const EDITION_NEIGHBOURS =
  'flex flex-wrap gap-y-3 gap-x-4 justify-between mt-6'

export const EDITION_NEIGHBOUR =
  'text-(--text) grid gap-[0.1rem] [&.next]:[margin-left:auto] [&.next]:text-right [&:hover_strong]:text-(--accent-text) [&:focus-visible_strong]:text-(--accent-text) [&_.tiny]:text-(--text-3) [&_.tiny]:text-[0.75rem]'

export const COMIC_EDITION_LINK =
  'items-center flex flex-wrap gap-y-2 gap-x-3 text-[0.8125rem] [&_.muted]:m-0'

export const EDITION_LINK_HITS =
  'grid gap-1 col-[1/-1] list-none m-0 p-0 w-full'

export const EDITION_LINK_HIT =
  'items-center bg-(--surface) border border-(--line) rounded-[6px] text-(--text) cursor-pointer flex [font:inherit] gap-2 py-1 px-2 text-left w-full [&:hover]:border-(--accent) focus-visible:border-(--accent) [&_img]:h-10 [&_img]:object-cover [&_img]:w-[27px]'

export const COMIC_VOLUME = 'grid gap-1'

export const ADMIN_COMIC_HEAD =
  '[align-items:start] grid gap-6 grid-cols-[7.5rem_minmax(0,1fr)] mb-6 [@media(max-width:480px)]:gap-4 [@media(max-width:480px)]:grid-cols-[4.5rem_minmax(0,1fr)]'

export const ADMIN_COMIC_COLS =
  '[align-items:start] grid gap-y-4 gap-x-4 grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] [&>div]:grid [&>div]:gap-4 [&>div>*]:[margin-block:0] [@media(max-width:900px)]:grid-cols-[minmax(0,1fr)]'

export const ADMIN_COMIC_SUM =
  '[font-variant-numeric:tabular-nums] mt-0 mb-2 mx-0'

export const ADMIN_COMIC_ADD =
  'items-center flex flex-wrap gap-2 mt-3 mb-2 mx-0'

export const ADMIN_VOLUME_BODY = 'grid gap-4'

export const ADMIN_BOOKS = 'grid gap-2 list-none mt-0 mb-4 mx-0 p-0'

export const ADMIN_BOOK =
  'items-center border-b border-b-(--line) grid gap-3 grid-cols-[3rem_minmax(0,1fr)_auto] pb-2 [@media(max-width:700px)]:grid-cols-[3rem_minmax(0,1fr)]'

export const ADMIN_BOOK_TEXT = 'grid min-w-0'

export const ADMIN_BOOK_FACTS = 'text-[0.8125rem]'

export const ADMIN_BOOK_MARKS =
  'items-center flex flex-wrap gap-2 [justify-content:flex-end] [@media(max-width:700px)]:col-2 [@media(max-width:700px)]:[justify-content:flex-start]'

export const ADMIN_BOOK_ADD =
  '[&_h3]:text-[1rem] [&_h3]:mt-0 [&_h3]:mb-2 [&_h3]:mx-0'

export const ADMIN_BOOK_ADD_FIELDS =
  'grid gap-3 grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)] mb-3 [&>div]:grid [&>div]:gap-1 [&>div]:[align-content:start] [&_.admin-error]:col-[auto] [@media(max-width:700px)]:grid-cols-[minmax(0,1fr)]'

export const ADMIN_COLLECT_FIELD = 'grid gap-1 [align-content:start]'

export const ADMIN_COLLECTS = 'grid gap-3 list-none mt-0 mb-3 mx-0 p-0'

export const ADMIN_COLLECT = 'border-b border-b-(--line) grid gap-2 pb-3'

export const ADMIN_COLLECT_TEXT = 'grid gap-1'

export const ADMIN_COLLECT_SOURCE = 'text-[0.75rem]'

export const ADMIN_COLLECT_LINK = 'text-[0.8125rem]'

export const ADMIN_COLLECT_ACTIONS = 'items-center flex flex-wrap gap-2'

export const ADMIN_COLLECT_FORM = 'grid gap-3 mb-3'

export const ADMIN_COLLECT_RANGE =
  'grid gap-3 grid-cols-[repeat(2,minmax(0,8rem))]'

export const ADMIN_VOLUME_MOVE =
  '[align-items:end] flex flex-wrap gap-y-2 gap-x-3'

export const SINGLE_BOOK = '[align-items:flex-start] flex flex-wrap gap-4'

export const SINGLE_BOOK_COVER = 'flex-[0_0_7rem]'

export const SINGLE_BOOK_TEXT =
  'flex-[1_1_14rem] min-w-0 [&_p]:mt-2 [&_p]:mb-0 [&_p]:mx-0'

/** The public Book page's previous and next links draw their layout from
 *  utilities of their own; they take only the name's colour on hover and focus
 *  from here. */
export const EDITION_NEIGHBOUR_HOVER =
  '[&:hover_strong]:text-(--accent-text) [&:focus-visible_strong]:text-(--accent-text)'
