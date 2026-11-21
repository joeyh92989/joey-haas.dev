// Class strings the public shelf lists share (#532). Plain strings, no
// imports: safe in the entry chunk (PosterCard reaches it through Now).

/** The link that covers a record card. Its `::after` fills the card (the
 *  card is `relative`), and the keyboard ring is drawn inside it
 *  (`-outline-offset-2`), because the card clips whatever is drawn outside. */
export const CARD_LINK =
  'block text-inherit no-underline outline-none after:absolute after:inset-0 focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-solid focus-visible:after:outline-ring'

/** The card itself: positioned for the link's `::after`, the other three
 *  edges darken with the hover as Home's do, and no lift (the legacy
 *  `.poster-card` hover transform is for the admin's loose posters). */
export const CARD_HOST =
  'relative h-full has-[a:hover]:border-y-foreground has-[a:hover]:border-r-foreground hover:transform-none focus-within:transform-none'

/** A card's title: the serif, with the accent underline Home's titles use. */
export const CARD_TITLE =
  'mt-2 block font-heading text-base leading-tight font-medium text-foreground underline decoration-primary decoration-[1.5px] underline-offset-4 [overflow-wrap:anywhere]'

/** The grid of numbered cards: wider columns than loose posters, since a
 *  strip holds a number and a word. Two columns on a phone, one under 23rem (a strip's number and word do not fit two across at 320px). */
export const RECORD_GRID =
  '[--poster-min:12rem] data-[size=compact]:[--poster-min:10rem] max-[34rem]:[--poster-min:8.5rem] max-[34rem]:data-[size=compact]:[--poster-min:8.5rem] max-[23rem]:[--poster-min:100%] max-[23rem]:data-[size=compact]:[--poster-min:100%]'

/** The spine rail: four columns on a phone, six on a tablet, twelve on a
 *  desktop (3b2), with the rail's 6px between spines. */
export const SPINE_GRID =
  'grid-cols-4 min-[701px]:grid-cols-6 min-[981px]:grid-cols-12 gap-x-[6px] gap-y-8'

/** A spine's stand: positioned for the 2px rail line under it, which reaches
 *  3px past each side so neighbours read as one shelf. */
export const SPINE_RAIL =
  'relative h-full after:absolute after:-inset-x-[3px] after:-bottom-0.5 after:h-0.5 after:bg-foreground'

/** The spine: a column on the card tone with the number on top, the title,
 *  the year and the mark below. Keeps its height at least the mockup's and
 *  grows with a long title rather than clipping it. The ring is an outline
 *  with an offset that fits the 6px between spines. */
export const SPINE_LINK =
  'group flex h-full min-h-[15.5rem] min-[701px]:min-h-[17.5rem] flex-col items-center rounded-t border border-b-0 border-border bg-card text-foreground no-underline outline-none transition-transform focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-ring motion-safe:hover:-translate-y-1.5'

/** A spine's title, set upright (vertical, reading top down). Wraps into
 *  more lines when it runs past `max-h`, never clamps or clips. */
export const SPINE_TITLE =
  'min-h-0 flex-auto py-3 font-sans text-[0.92rem] min-[701px]:text-base leading-tight font-semibold [overflow-wrap:anywhere] [writing-mode:vertical-rl] group-hover:underline group-hover:decoration-primary group-hover:decoration-[1.5px]'

/** An Overview figure's box (the status bar, the charts): Card's look, on
 *  the card colour with its 1px outline, with room inside. Not clipped
 *  (`overflow-hidden`): a bar's number shows above it on hover and focus,
 *  and a focused bar draws its ring outside. */
export const STAT_CARD =
  'm-0 flex h-full flex-col gap-2 rounded-md border border-border bg-card p-4 text-card-foreground'

/** How tall a spine's title may run before it wraps to another line: a
 *  usual title in about 13rem, a long one (over `LONG_TITLE` characters) in
 *  28rem, so it takes two or three lines of a phone's narrow spine and never
 *  more than the spine is wide. */
export const SPINE_TITLE_USUAL = 'max-h-[12rem] min-[701px]:max-h-[13rem]'
export const SPINE_TITLE_LONG = 'max-h-[28rem]'
export const SPINE_TITLE_LONGEST = 'max-h-[44rem]'
export const LONG_TITLE = 48
export const LONGEST_TITLE = 90
