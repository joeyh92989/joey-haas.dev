// Travel (/travel, /travel/:slug): the index cards, the trip page, the drawn map, photos, postcards and the lightbox
// (#536, group G2). The class names stay on the elements as hooks (tests, e2e
// and print read them); the look is these utilities. Every utility is written
// out whole: Tailwind reads source text, so a class glued from a constant is
// never emitted.

export const DRAFT_BADGE =
  'bg-(--surface) border border-(--line) rounded-[999px] text-(--text-3) text-[0.75rem] tracking-[0.06em] ml-2 py-0.5 px-3 uppercase'

export const TRIP_LIST =
  'grid gap-4 grid-cols-[repeat(2,minmax(0,1fr))] list-none mt-6 mb-0 mx-0 p-0 [@media(max-width:640px)]:grid-cols-[1fr]'

export const TRIP_CARD_COVER =
  'aspect-[16/9] bg-(--sunken) block h-[auto] object-cover w-full'

export const TRIP_CARD_BODY = '[align-content:start] grid gap-1 p-4'

export const TRIP_CARD_TITLE =
  '[font:500_var(--fs-24)/1.2_var(--font-display)] m-0'

export const TRIP_CARD_PLACES = 'text-(--text-3) text-[0.8125rem]'

export const TRIP_CARD_COUNT = 'text-(--text-3) text-[0.8125rem]'

export const TRIP =
  '[&_.lede]:text-(--text-2) [&_.lede]:text-[1rem] [&_.lede]:mt-0 [&_.lede]:mb-4 [&_.lede]:mx-0 [&_.kicker_a]:text-inherit'

export const DRAWN_MAP =
  'border border-(--line) rounded-[10px] my-6 mx-0 overflow-hidden'

export const DRAWN_MAP_FRAME = 'relative'

export const DRAWN_MAP_SVG = 'block h-full w-full'

export const DRAWN_MAP_SEA = 'fill-(--surface)'

export const DRAWN_MAP_LAND = 'fill-(--sunken) stroke-(--line-strong) stroke-1'

export const DRAWN_MAP_ROUTE =
  'fill-none stroke-(--accent) [stroke-dasharray:6_5] [stroke-linecap:round] stroke-2'

export const DRAWN_MAP_SEA_LABEL =
  'fill-(--text-3) [font:italic_400_11px_var(--font-display)] tracking-[0.08em]'

export const DRAWN_MAP_NAME =
  'bg-(--surface) rounded-[4px] text-[0.75rem] font-semibold py-0 px-1 whitespace-nowrap'

export const DRAWN_MAP_CAPTION =
  'bg-(--surface) border-t border-t-(--line) text-(--text-3) flex flex-wrap text-[0.75rem] gap-y-1 gap-x-4 justify-between py-2 px-3'

export const DRAWN_MAP_STOPS =
  'flex flex-wrap gap-y-0 gap-x-3 m-0 pl-4 [&_a]:text-(--text-2)'

export const TRIP_PLACES =
  '[&_ul]:flex [&_ul]:gap-2 [&_ul]:list-none [&_ul]:mt-0 [&_ul]:mb-4 [&_ul]:mx-0 [&_ul]:[overflow-x:auto] [&_ul]:p-0.5'

export const TRIP_DAY_TITLE = 'text-[1.125rem] font-medium m-0'

export const TRIP_DAY_PLACE = 'text-(--text-3) font-[400]'

export const PHOTO_GROUP = 'grid gap-2 mt-3'

export const PHOTO_GROUP_TWO =
  'grid-cols-[repeat(2,minmax(0,1fr))] [@media(max-width:640px)]:grid-cols-[1fr]'

export const TRIP_PHOTO = 'rounded-(--radius) m-0 overflow-hidden relative'

export const TRIP_PHOTO_IMG =
  'aspect-[3/2] bg-(--sunken) block h-[auto] object-cover w-full [@media(max-width:640px)]:aspect-[4/3]'

export const TRIP_PHOTO_CAPTION =
  'bg-(--bg) text-(--text) text-[0.8125rem] leading-[1.4] py-1 px-2'

export const POSTCARD_STAMP =
  'border border-dashed border-(--line-strong) rounded-[4px] text-(--text-3) [float:right] font-mono text-[0.75rem] tracking-[0.04em] mt-0 mb-2 mr-0 ml-3 py-1 px-2 uppercase'

export const TRIP_NAV =
  "border-t border-t-(--line) flex flex-wrap text-[0.875rem] gap-y-2 gap-x-4 justify-between pt-4 [&_a[rel='next']]:ml-auto"

export const LIGHTBOX =
  'bg-[transparent] [border:0] text-(--text) h-[100dvh] m-0 max-h-[none] max-w-[none] pt-12 pb-4 px-4 w-[100vw] [&[open]]:items-center [&[open]]:flex [&[open]]:justify-center [&::backdrop]:bg-(--overlay)'

export const LIGHTBOX_FIGURE = 'grid gap-2 m-0 max-w-[60rem] w-full'

export const LIGHTBOX_IMG =
  'rounded-[8px] block h-[auto] my-0 mx-[auto] max-h-[calc(100dvh_-_9rem)] object-contain w-[auto] max-w-full'

export const LIGHTBOX_CAPTION =
  'bg-(--bg) rounded-(--radius) flex flex-wrap text-[0.875rem] gap-y-1 gap-x-4 justify-between py-2 px-3'

export const LIGHTBOX_COUNT =
  'text-(--text-3) [font-variant-numeric:tabular-nums]'

/** A trip card: the whole card is one link. Hover is `[&:hover]`, not
 *  `hover:`, because the old rule also applied on a touch screen. It writes no
 *  `text-decoration`: the old `.trip-card { text-decoration: none }` lost to the
 *  global `a:hover` underline, so a hovered card has always been underlined, and
 *  a utility that said `none` would have changed that. */
export const TRIP_CARD =
  'bg-(--surface) border border-(--line) rounded-[10px] text-(--text) grid [grid-template-rows:auto_1fr] h-full overflow-hidden [&:hover]:border-(--line-strong) focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-(--accent) focus-visible:outline-offset-2'

/** A day. Its prose is spaced by the element that holds it (a photo day's
 *  `.post-body` takes DAY_PROSE, a postcard's takes none), so two
 *  descendant rules never fight over one margin. */
export const TRIP_DAY =
  'border-t border-t-(--line) py-4 px-0 [scroll-margin-top:1rem] [&_.kicker]:mt-0 [&_.kicker]:mb-[0.15rem] [&_.kicker]:mx-0'
export const DAY_PROSE = 'mt-2'

/** A photo-less day: the prose on a card with its place as a stamp. */
export const POSTCARD =
  'bg-(--surface) border border-(--line) rounded-[10px] mt-3 p-4 relative [&_.post-body]:mt-0 [&_.post-body>:last-child]:mb-0'

/** The button that opens a photo. The focus ring is two tones over the photo:
 *  an accent ring alone can vanish into a photo of the same hue, so a --bg
 *  ring sits inside it. Drawn on ::after, above the image; an inset shadow on
 *  the button would paint beneath it. */
export const TRIP_PHOTO_OPEN =
  "bg-transparent bg-none [border:0] cursor-zoom-in block p-0 relative w-full focus-visible:outline-none focus-visible:after:content-[''] focus-visible:after:absolute focus-visible:after:inset-0 focus-visible:after:pointer-events-none focus-visible:after:border-2 focus-visible:after:border-solid focus-visible:after:border-(--accent) focus-visible:after:[box-shadow:inset_0_0_0_2px_var(--bg)]"

/** A map pin: an HTML link over the drawing, its number centred on the
 *  projected point. A pin past 70% across puts its name on the left, so the
 *  placement is a map (two transforms must not fight over one element). */
export const DRAWN_MAP_PIN =
  'group/pin items-center text-(--text) flex gap-1 min-h-6 absolute focus-visible:outline-none'
export const DRAWN_MAP_PIN_SIDE = {
  right: '[transform:translate(-12px,-50%)]',
  left: '[flex-direction:row-reverse] [transform:translate(calc(-100%_+_12px),-50%)]',
}

/** The pin's number. The halo keeps it legible over land, sea or the route
 *  line. It grows a little when its pin is hovered or focused, unless the
 *  visitor asked for less motion. */
export const DRAWN_MAP_NUMBER =
  'items-center bg-(--accent) rounded-[50%] [box-shadow:0_0_0_1.5px_var(--surface)] text-(--accent-ink) inline-flex flex-[none] [font:600_var(--fs-12)/1_var(--font-sans)] h-6 justify-center w-6 group-focus-visible/pin:outline-2 group-focus-visible/pin:outline-solid group-focus-visible/pin:outline-(--accent) group-focus-visible/pin:outline-offset-3 motion-safe:[transition:transform_120ms_ease-out] motion-safe:group-[:hover]/pin:[transform:scale(1.15)] motion-safe:group-focus-visible/pin:[transform:scale(1.15)]'

/** The lightbox's three round buttons: the shared look, then each one's place
 *  (previous and next sit over the photo, under it on a phone; close is in the
 *  corner). */
export const LIGHTBOX_BUTTON =
  'items-center bg-(--surface) border border-(--line-strong) rounded-[50%] text-(--text) cursor-pointer inline-flex [font:var(--fs-18)/1_var(--font-sans)] h-11 justify-center absolute w-11 focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-(--accent) focus-visible:outline-offset-2'
export const LIGHTBOX_PREV =
  'left-4 top-[50%] [transform:translateY(-50%)] [@media(max-width:640px)]:bottom-4 [@media(max-width:640px)]:top-auto [@media(max-width:640px)]:[transform:none]'
export const LIGHTBOX_NEXT =
  'right-4 top-[50%] [transform:translateY(-50%)] [@media(max-width:640px)]:bottom-4 [@media(max-width:640px)]:top-auto [@media(max-width:640px)]:[transform:none]'
export const LIGHTBOX_CLOSE = 'right-4 top-3'
