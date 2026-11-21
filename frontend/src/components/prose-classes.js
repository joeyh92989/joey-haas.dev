// Class strings the prose pages share (#531), so the About, Projects, Now,
// Colophon and Blog headings are one look. Plain strings, no imports: safe in
// the entry chunk.

/** A prose page's `h1`: the serif, one step above the section heads. */
export const PROSE_H1 =
  'font-heading text-4xl leading-tight font-medium max-[700px]:text-3xl'

/** A section's `h2`: the serif with a 1px ink rule under it, as Home's
 *  section heads. No margin above: the section spaces itself. */
export const SECTION_HEAD =
  'mb-4 border-b border-foreground pb-2 font-heading text-2xl font-medium'

/** A section head that sits among siblings in one `section` (Colophon). */
export const PROSE_H2 = `mt-10 ${SECTION_HEAD}`

/** A record's title: the serif, one step down from a section head. */
export const RECORD_TITLE =
  'mb-2 font-heading text-xl leading-tight font-medium'

/** A link in a record's title: ink, with the accent underline Home uses. */
export const TITLE_LINK =
  'text-foreground underline decoration-primary decoration-[1.5px] underline-offset-4'

/** The title link of a whole-card link: its `::after` covers the card, and a
 *  keyboard ring is drawn inside it (`-outline-offset-2`), since the card
 *  clips whatever is drawn outside it. */
export const WHOLE_CARD_LINK = `${TITLE_LINK} outline-none after:absolute after:inset-0 focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-solid focus-visible:after:outline-ring`

/** The card that holds a whole-card link: positioned for the `::after`, and
 *  the other three edges darken with the hover as Home's do. */
export const WHOLE_CARD =
  'relative has-[a:hover]:border-y-foreground has-[a:hover]:border-r-foreground'
