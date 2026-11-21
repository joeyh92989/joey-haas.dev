// Class strings the shelf detail pages share (#533): the item page, a comic
// title, an issue, a book, and the Year and Month in review. Plain strings,
// no imports. These pages are lazy chunks, but a string here costs nothing and
// keeps the pages to one look.

/** The detail head: the cover beside the heading, and an optional full row
 *  under both (a comic's What's next). 9rem cover, 6.5rem on a phone. */
export const DETAIL_HEAD =
  'mt-2 mb-6 grid grid-cols-[9rem_minmax(0,1fr)] items-end gap-x-5 gap-y-4 max-[700px]:grid-cols-[6.5rem_minmax(0,1fr)] max-[700px]:gap-x-4'

/** The cover cell of a head: a 1px outline, no shadow (flat). */
export const DETAIL_COVER = 'overflow-hidden rounded-sm border border-border'

/** The heading cell: the title tight under its kicker, the rest below. */
export const DETAIL_HEADING = 'min-w-0 pb-1 [&_h1]:mb-1'

/** The row under the head's cover and heading: full width on a phone, under
 *  the heading on a desktop. */
export const DETAIL_BELOW =
  'col-span-full max-w-[45rem] min-[701px]:col-span-1 min-[701px]:col-start-2'

/** A section as a panel: Card's shell with 16px inside and body type at 16px
 *  (a Card sets 14). The wall and book panels keep `.item-card`, which
 *  matches it. */
export const PANEL =
  'mb-4 flex flex-col overflow-hidden rounded-md border border-border bg-card p-4 text-[1rem] text-card-foreground'

/** A panel's `h2`: a serif with a hairline under it, as a record card's strip. */
export const PANEL_HEAD =
  'mb-3 border-b border-line-card pb-2 font-heading text-lg leading-tight font-medium text-foreground'

/** A mono caption: a source line, a fact label. Muted, never faded. */
export const CAPTION = 'font-mono text-xs text-muted-foreground'

/** The smallest line: a source credit under a description. */
export const SOURCE_LINE =
  'text-xs text-muted-foreground [&_a]:text-foreground [&_a]:underline [&_a]:decoration-primary [&_a]:decoration-[1.5px] [&_a]:underline-offset-4'

/** A link inside running text: underlined, since the accent is too close to
 *  body text to mark a link alone. */
export const TEXT_LINK =
  'text-foreground underline decoration-primary decoration-[1.5px] underline-offset-4 hover:no-underline'

/** The facts list of an issue or a book: label and value in two columns. */
export const FACTS =
  'my-4 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm [&_dd]:m-0 [&_dd]:text-foreground [&_dt]:font-mono [&_dt]:text-xs [&_dt]:leading-[1.7] [&_dt]:text-muted-foreground'

/** A reading-width block of description. */
export const DESCRIPTION = 'max-w-[min(45rem,68ch)] text-muted-foreground'

/** The groups of labelled chips on the item page: label left, chips right,
 *  stacked on a phone. */
export const CHIP_GROUPS =
  'mb-4 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 max-[700px]:grid-cols-1 max-[700px]:gap-y-1 [&>div]:contents [&_dd]:m-0 max-[700px]:[&_dd]:mb-2 [&_dt]:pt-1 [&_dt]:font-mono [&_dt]:text-xs [&_dt]:text-muted-foreground'

/** One chip's extra room over the badge look: it may grow past 20px and
 *  wrap, since a tag is a word but a platform can be a phrase. */
export const CHIP_GROW =
  'h-auto! min-h-5 max-w-full py-0.5 text-left whitespace-normal!'

/** A small "do" control in a detail page's head or owner box: the button at
 *  the small size, 44px tall on a phone (the legacy `.btn.sm` rule is not
 *  applied to a migrated button). */
export const PHONE_TARGET = 'max-[700px]:min-h-11'

/** The previous or next link under a book page: a block with an inset
 *  keyboard ring, since the strip it sits in may clip. */
export const SIBLING_LINK =
  'grid gap-0.5 rounded-md border border-line-card bg-card px-4 py-3 text-foreground no-underline outline-none hover:border-foreground hover:no-underline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-solid focus-visible:outline-ring [&_strong]:underline [&_strong]:decoration-primary [&_strong]:decoration-[1.5px] [&_strong]:underline-offset-4'

/** The strip of neighbouring issues: it scrolls inside itself, so the ring of
 *  a tile is drawn inside the tile (an outward outline would be clipped by
 *  the strip's own overflow). */
export const NEIGHBOUR_RING =
  '[&_a.cover-tile:focus-visible]:outline-2 [&_a.cover-tile:focus-visible]:-outline-offset-2 [&_a.cover-tile:focus-visible]:outline-solid [&_a.cover-tile:focus-visible]:outline-ring'

/** A page section's `h2` outside a panel (More from this shelf, the review
 *  pages' sections): the serif with the 1px ink rule the prose pages use. */
export const SECTION_H2 =
  'mt-8 mb-3 border-b border-foreground pb-2 font-heading text-xl leading-tight font-medium text-foreground'

/** A diary: dated rows at the 45rem column, each row one line of a ledger. */
export const DIARY =
  'm-0 grid max-w-[45rem] list-none gap-2 p-0 text-muted-foreground [&_time]:font-mono [&_time]:text-xs [&_time]:text-muted-foreground [&_time]:tabular-nums'

/** A diary row: date, title, then the rating or minutes. */
export const DIARY_ROW =
  'grid grid-cols-[4.5rem_1fr_auto] items-center gap-x-3 border-b border-line-card pb-2'

/** A day's rows in the Month in review: the date is the heading above, so a
 *  row is a title and its minutes. */
export const DIARY_DAY_ROW =
  'grid grid-cols-[1fr_auto] items-center gap-x-3 border-b border-line-card pb-2'

/** The Year in review's two columns: the months and finishes beside the
 *  genres and the crowd from 60rem, one column below. The genre bars fill
 *  their column. */
export const YEAR_COLUMNS =
  'grid grid-cols-[minmax(0,1fr)] items-start gap-x-12 min-[60rem]:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] [&_.bar-list_li]:grid-cols-[minmax(0,10rem)_minmax(2rem,1fr)_auto]'

/** A year link in the years nav: a chip, the current year filled like a
 *  pressed toggle (ink and weight, never colour alone). */
export const YEAR_CHIP =
  'aria-[current=page]:border-foreground aria-[current=page]:bg-foreground aria-[current=page]:font-semibold aria-[current=page]:text-background'

/** A sub-section's `h2` on an issue or book page (neighbours, what a book
 *  collects): smaller than a section head, no rule. */
export const SUB_HEAD =
  'mt-8 mb-3 font-heading text-lg leading-tight font-medium text-foreground'

/** The owner's box on an issue or book page: dashed, so it reads as a tool
 *  and not as content. */
export const OWNER_BOX =
  'my-4 rounded-md border border-dashed border-muted-foreground p-3'

/** The owner box's note: the smallest line. */
export const OWNER_NOTE = 'm-0 mb-2 text-xs text-muted-foreground'
