// The item pages' detail layout, the play journal and playthroughs, the store
// list, the pull list, the pick list, Stats and its changelog (#536, group G3).
// The class names stay on the elements as hooks (tests, e2e and print read
// them); the look is these utilities. Every utility is written out whole:
// Tailwind reads source text, so a class glued from a constant is never
// emitted. A rule on a descendant is written `[:where(&_x)]:`, a selector with
// no specificity: the old rule lost to any utility on the descendant itself,
// and a bare `[&_x]:` would beat it. `max-[Npx]` is strict, so an inclusive
// query is `[@media(max-width:Npx)]`.

// ---- The item edit page (AdminItem, AdminComic) ---------------------------

/** The cover beside a form, stacking on narrow screens. */
export const ITEM_DETAIL =
  'mt-4 grid gap-6 grid-cols-[minmax(0,12rem)_minmax(0,1fr)] [@media(max-width:40rem)]:grid-cols-[minmax(0,1fr)]'
export const ITEM_DETAIL_COVER = '[@media(max-width:40rem)]:max-w-[12rem]'
export const ITEM_DETAIL_LINK = '[:where(&)]:mt-2 [:where(&)]:text-[0.75rem]'

const SECTION_BOX = 'mt-4 border-t border-t-(--line) pt-4'
const SECTION_H2 =
  '[:where(&_h2)]:text-[0.8125rem] [:where(&_h2)]:tracking-[0.04em] [:where(&_h2)]:uppercase'

/** The re-link picker's box. */
export const ITEM_RELINK = `${SECTION_BOX} ${SECTION_H2} [:where(&_h2)]:mb-1 [:where(&_p)]:mb-2 [:where(&_p)]:text-[0.75rem]`

/** The play journal's box, its form and its list. */
export const PLAY_JOURNAL = `${SECTION_BOX} ${SECTION_H2} [:where(&_h2)]:mb-1`
export const PLAY_JOURNAL_FORM =
  'grid gap-1 text-[0.8125rem] [:where(&_button)]:mt-1 [:where(&_button)]:[justify-self:start]'
export const PLAY_JOURNAL_LIST =
  'mt-3 grid list-none gap-1 text-[0.8125rem] [:where(&_li)]:grid [:where(&_li)]:items-baseline [:where(&_li)]:gap-2 [:where(&_li)]:grid-cols-[6.5rem_1fr_auto] [:where(&_time)]:text-(--text-3) [:where(&_time)]:tabular-nums'

/** The status control and the runs table under it. */
export const ITEM_PLAYTHROUGHS = `${SECTION_BOX} ${SECTION_H2} [:where(&_h2)]:mb-2`
export const ITEM_STATUS_CONTROL =
  'mb-3 flex flex-wrap items-center gap-2 text-[0.875rem]'

/** Positioned, so an absolutely placed visually-hidden header label is
 *  clipped by this scroller and cannot widen the page. Scroll padding keeps a
 *  focused control's ring whole at the scroller's edge. */
export const PLAYTHROUGHS_WRAP =
  'relative overflow-x-auto [scroll-padding-inline:var(--space-4)]'
export const PLAYTHROUGHS_TABLE =
  'w-full border-collapse text-[0.8125rem] [:where(&_th)]:border-b [:where(&_th)]:border-b-(--line) [:where(&_th)]:py-2 [:where(&_th)]:pr-2 [:where(&_th)]:pl-0 [:where(&_th)]:text-left [:where(&_th)]:whitespace-nowrap [:where(&_td)]:border-b [:where(&_td)]:border-b-(--line) [:where(&_td)]:py-2 [:where(&_td)]:pr-2 [:where(&_td)]:pl-0 [:where(&_td)]:text-left [:where(&_td)]:whitespace-nowrap [:where(&_th)]:font-medium [:where(&_th)]:text-(--text-3) [:where(&_.mono)]:font-mono'
export const PLAYTHROUGHS_ACTIONS =
  'whitespace-nowrap [:where(&>button+button)]:ml-1'
export const PLAYTHROUGHS_NOTE = 'mt-2 text-[0.8125rem]'
export const PLAYTHROUGHS_ADD_FORM =
  'mt-2 flex flex-wrap [align-items:end] gap-2 text-[0.8125rem] [:where(&_label)]:grid [:where(&_label)]:gap-1'

/** Narrow on purpose: the cover is there to make a wrong match obvious at a
 *  glance, not to be looked at. The table still has to work at 375px. */
export const ITEM_COVER_CELL = '[&_.cover]:w-9'

/** The registry line sits under the format select, in the field column. */
export const REGISTRY_LINE =
  'col-2 text-[0.875rem] [@media(max-width:34rem)]:col-[1/-1] [:where(&_p)]:mb-2'

export const ITEM_ATTRIBUTION = '[:where(&)]:mt-6 [:where(&)]:text-[0.8125rem]'

// ---- The physical catalogue and the pull list -----------------------------

/** A key a human has to decide: the list item is the test's hook, so its look
 *  stays here. */
export const NEEDS_MATCH_ROW =
  'border-b border-b-(--line) py-3 [overflow-wrap:anywhere]'

export const CATALOGUE_PROGRESS =
  'min-h-[1.5em] text-(--text-3) [.pull-list_&]:focus-visible:outline-2 [.pull-list_&]:focus-visible:outline-solid [.pull-list_&]:focus-visible:outline-(--accent) [.pull-list_&]:focus-visible:outline-offset-2'

export const PULL_LIST_WEEK =
  'mt-6 [:where(&_h2)]:mb-2 [:where(&_h2)]:text-[1.5rem] [:where(&_h2)]:flex [:where(&_h2)]:items-center [:where(&_h2)]:gap-2'
export const PULL_LIST_SEARCH = 'mt-8 border-t border-t-(--line) pt-4'
export const PULL_LIST_SEARCH_FORM =
  'flex flex-wrap items-center gap-2 [:where(&_input)]:[flex:1_1_14rem]'

// ---- The store list, Radar and Discover -----------------------------------

export const STORE_LIST_SECTION =
  'mt-6 [:where(&_h2)]:mb-2 [:where(&_h2)]:text-[1.5rem]'
export const STORE_LINES =
  'grid list-none gap-[0.15rem] [:where(&_a)]:inline-flex [:where(&_a)]:min-h-[44px] [:where(&_a)]:items-center'

/** Radar's and Discover's headings sit in the page's own flow, not in a
 *  section, so they carry the store list section's space above. */
export const RADAR =
  '[:where(&>h2)]:mt-6 [:where(&>h2)]:mb-2 [:where(&>h2)]:text-[1.5rem]'

// ---- The pick list (PickList) ---------------------------------------------

/** "Or instead" as a compact list while a Continue card leads. */
export const PICKS_H =
  'mt-4 mb-2 flex items-baseline justify-between text-(--text-3) text-[0.8125rem] tracking-[0.04em] uppercase [:where(&_.muted)]:text-[0.75rem] [:where(&_.muted)]:tracking-[0] [:where(&_.muted)]:normal-case'
export const PICKLIST =
  'list-none rounded-[6px] border border-(--line-card) bg-(--surface) [:where(&>li)]:grid [:where(&>li)]:[align-items:start] [:where(&>li)]:gap-x-3 [:where(&>li)]:px-4 [:where(&>li)]:py-3 [:where(&>li)]:grid-cols-[2.6rem_minmax(0,1fr)_auto] [@media(max-width:34rem)]:[:where(&>li)]:grid-cols-[2.6rem_minmax(0,1fr)] [@media(max-width:34rem)]:[:where(&>li)]:gap-y-2 [:where(&>li+li)]:border-t [:where(&>li+li)]:border-t-(--line-card)'
export const PICKLIST_COVER = 'col-1'
export const PICKLIST_TEXT = 'flex min-w-0 flex-col gap-1'

// ---- Stats (Stats.jsx) ----------------------------------------------------

export const SITE_STATS =
  '[&_h2]:mt-8 [&_h2]:mb-3 [&_h2]:text-[length:var(--fs-18)]'
export const SITE_STATS_STATUS = 'mt-3 text-[0.8125rem]'
export const SITE_STATS_LISTS =
  'grid gap-6 grid-cols-[repeat(3,minmax(0,1fr))] [@media(max-width:700px)]:grid-cols-[minmax(0,1fr)] [&>section]:mt-0 [.site-stats_&_h2]:mb-1 [&_.kicker]:mb-2 [&_.kicker]:block'

export const CHANGELOG_LIST =
  'grid list-none gap-3 [&_time]:text-(--text-2) [&_time]:text-[0.8125rem] [&_time]:leading-[normal] [&_time]:font-mono [&_ul]:pl-4 [&_ul_li+li]:mt-1'
export const CHANGES_FEED = 'mb-3'

/** After a replayed finish's title on Now and the review pages. */
export const AGAIN_TAG =
  'ml-[0.15rem] text-(--text-2) text-[0.75rem] font-medium font-mono'
