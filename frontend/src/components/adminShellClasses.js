import { buttonVariants } from './ui/button-variants.js'

// The admin shell's controls, drawn from the Button look (#535). Eager shell
// code takes `buttonVariants`, never the Base UI Button or `cn` (#529). Only
// what the Button look does not say is added here: a shape, and the current
// mark. Type sizes for the rail and tab labels sit on their inner spans in
// index.css, since a size class here would fight the button's `text-sm`.
//
// Current pages carry a foreground border and a card fill as well as the
// colour, and an area or page is current through `aria-current`, so the
// style follows the same attribute a screen reader reads.

const CURRENT =
  'aria-[current]:border-foreground aria-[current]:bg-card aria-[current]:text-foreground'

const ghost = buttonVariants({ variant: 'ghost', size: 'bare' })

/** An area link in the desktop rail: icon over label, 56px wide. */
export const railLink = `${ghost} h-auto min-h-12 w-14 flex-col px-0.5 py-1.5 ${CURRENT}`

/** An area link in the phone tab bar: one equal 52px+ target per area. */
export const tabLink = `${ghost} h-auto min-h-13 min-w-0 flex-col px-0.5 py-1.5 ${CURRENT}`

/** A page link in the area's page list (desktop). */
export const pageLink = `${ghost} h-auto min-h-9 w-full justify-start gap-3 px-3 py-2 ${CURRENT}`

/** A segment of the phone's page control: a link, or the sheet's button. */
export const segmentLink = `${buttonVariants({ variant: 'ghost', size: 'sm' })} min-h-9 ${CURRENT}`

/** The account trigger at the head of the desktop rail. */
export const accountRail = `${ghost} h-auto min-h-12 w-14 flex-col px-0.5 py-1 aria-expanded:border-foreground aria-expanded:bg-card aria-expanded:text-foreground`

/** The account trigger on a phone: the mark and a caret. */
export const accountPill = `${buttonVariants({ variant: 'quiet', size: 'bare' })} h-11 px-2 aria-expanded:border-foreground aria-expanded:bg-card`

/** A row in the account panel; 44px on a phone. */
export const accountRow = `${ghost} h-auto min-h-9 w-full justify-between px-3 py-2 max-[900px]:min-h-11 max-[900px]:text-base`

/** The sign-in link on the gate. */
export const signInLink = buttonVariants({ variant: 'outline', size: 'lg' })
