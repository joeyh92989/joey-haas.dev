// The Wrap up sheet (#536, slice D5): the look the `.wrap-*` rules drew. The
// class names stay on the elements as hooks. The base layer zeroes margin and
// padding on every element, so a rule that said `margin: 0` is not repeated.

export const WRAP_BODY = 'grid gap-4 p-4'
export const WRAP_HEAD =
  'grid grid-cols-[2.6rem_minmax(0,1fr)_auto] items-center gap-3'
export const WRAP_HEADING =
  '[&_h2]:text-[1.125rem] [&_p]:mt-[0.15rem] [&_p]:text-[0.8125rem]'

/** The three outcomes side by side, stacked under 34rem. */
export const WRAP_OUTCOME =
  'grid grid-cols-[repeat(3,minmax(0,1fr))] gap-2 max-[34rem]:grid-cols-[minmax(0,1fr)]'
/** One outcome: the pressed one has an accent outline and an inset ring, so
 *  it never relies on colour alone (its swatch and word say it too). */
export const WRAP_CHOICE =
  'grid cursor-pointer gap-1 rounded-lg border border-border bg-muted p-3 text-left text-foreground [font:inherit] hover:border-(--line-strong) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-primary aria-pressed:border-primary aria-pressed:[box-shadow:inset_0_0_0_1px_var(--accent)] max-[34rem]:min-h-[52px] max-[34rem]:grid-cols-[auto_1fr] max-[34rem]:items-center'
export const WRAP_CHOICE_WORD = 'flex items-center gap-2 font-semibold'
export const WRAP_CHOICE_HINT = 'text-[0.75rem] text-muted-foreground'

export const WRAP_FRESH = 'grid gap-3 border-t border-t-border pt-4'
export const WRAP_FRESH_TITLE =
  'text-[0.75rem] leading-[inherit] font-medium tracking-[0.06em] text-muted-foreground uppercase'
export const WRAP_FIELD = 'grid gap-1'
export const WRAP_LABEL = 'text-[0.8125rem] text-muted-foreground'
const WRAP_INPUT =
  'rounded-md border border-border bg-background p-2 text-foreground [font:inherit]'
export const WRAP_TEXTAREA = `${WRAP_INPUT} resize-y`
export const WRAP_DATE = `${WRAP_INPUT} w-max`
export const WRAP_HINT = 'text-[0.75rem] text-muted-foreground'
export const WRAP_FOOT = 'flex flex-wrap items-center justify-between gap-2'
export const WRAP_FOOT_NOTE = 'text-[0.75rem]'
export const WRAP_ACTS = 'ml-auto flex gap-2'
