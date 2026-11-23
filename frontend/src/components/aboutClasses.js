// The About page (#536, group G1): what the legacy `.about*` and `.timeline*`
// rules drew, as utilities. Plain strings with no imports. The old class names
// stay on the elements as hooks that tests, e2e and the style dump read, and
// the print rules (`print:`) take the paper layout: About stacks, and a role
// keeps its heading with its bullets. A phone here is `max-width: 700px`
// (inclusive, written as a media query: Tailwind's `max-[700px]:` is strictly
// below). Spacing steps are Tailwind's 0.25rem unit: `--space-5` is `6`,
// `--space-7` is `12`.

/** The aside holds still beside the body on a desktop and leads it on a
 *  phone; on paper the page stacks. */
export const ABOUT = `grid grid-cols-[280px_minmax(0,1fr)] gap-12 pt-4 print:block [@media(max-width:700px)]:grid-cols-[1fr] [@media(max-width:700px)]:gap-6 [@media(max-width:700px)]:pt-0`
export const ABOUT_ASIDE = `sticky top-[24px] self-start print:static print:mb-6 [@media(max-width:700px)]:static`
export const ABOUT_PHOTO =
  'mb-4 block h-24 w-24 rounded-(--radius) object-cover'
/** The body: its paragraphs keep the 64ch measure. */
export const ABOUT_BODY = '[&_.prose]:max-w-[64ch]'

/** A hairline rail with a dot per entry; the current role's dot is the
 *  accent. */
export const TIMELINE = 'ml-1 list-none border-l border-l-(--line-strong) pl-6'
const DOT =
  "relative before:absolute before:-left-[27px] before:box-content before:h-[9px] before:w-[9px] before:rounded-[50%] before:border-2 before:content-['']"
/** An entry: a dot on the rail. */
export const timelineEntry = (current) =>
  `${DOT} pb-6 before:top-[7px] print:break-inside-avoid before:border-background ${
    current ? 'before:bg-(--accent)' : 'before:bg-(--line-strong)'
  }`
/** An employer holding several roles: a ring on the rail. It is taller than a
 *  page can promise, so it may break between roles. */
export const TIMELINE_EMPLOYER = `${DOT} pb-0 before:top-[6px] before:border-(--line-strong) before:bg-background print:break-inside-auto`
/** A role under an employer: a dot on the same rail. */
export const timelineStep = (current) =>
  `${DOT} pb-6 before:top-[5px] print:break-inside-avoid before:border-background [&_.kicker]:mt-1 [&_.kicker]:mb-2 ${
    current ? 'before:bg-(--accent)' : 'before:bg-(--line-strong)'
  }`
export const TIMELINE_ROLE = 'font-medium [font-size:var(--fs-16)]'
export const TIMELINE_EMPLOYER_NAME = 'font-medium [font-size:var(--fs-18)]'
export const TIMELINE_COMPANY = 'font-medium text-muted-foreground'
export const TIMELINE_META = 'mt-1 mb-2'
export const TIMELINE_SUMMARY =
  'max-w-[64ch] text-muted-foreground [font-size:var(--fs-14)]'
/** A role's bullets: a real list with its discs kept, so it is announced as
 *  one without a role attribute. */
export const TIMELINE_POINTS =
  'mt-2 max-w-[64ch] list-disc pl-4 text-muted-foreground [font-size:var(--fs-14)] [&>li+li]:mt-2 [&_li::marker]:text-(--text-3) print:[&>li]:break-inside-avoid'
export const TIMELINE_ROLES = 'mt-6 list-none'
export const TIMELINE_STEP_TITLE =
  'font-sans font-semibold leading-[1.2] text-foreground [font-size:var(--fs-16)]'

/** A post's lede under its title. */
export const POST_SUMMARY =
  'mt-2 text-muted-foreground [font-size:var(--fs-18)]'
