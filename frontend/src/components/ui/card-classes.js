// The Card's look, in one place with no imports, so `ui/card.jsx` (lazy, uses
// `cn`) and `components/RecordCard.jsx` (eager, uses `cx`) draw from the same
// string and a restyle of Card reaches record cards (#530).

/** Shell: layout, outline, ground and text. No padding, gap or size. */
export const CARD_SHELL =
  'group/card flex flex-col overflow-hidden rounded-md border border-border bg-card text-sm text-card-foreground'

/** Card's own spacing: one `--card-spacing` for padding and gap, and the
 *  `data-size="sm"` and image-first variants. A record card sets none of it. */
export const CARD_SPACING =
  'gap-(--card-spacing) py-(--card-spacing) [--card-spacing:--spacing(4)] has-[>img:first-child]:pt-0 data-[size=sm]:[--card-spacing:--spacing(3)]'
