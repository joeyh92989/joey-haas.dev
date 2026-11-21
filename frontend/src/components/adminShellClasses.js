import { buttonVariants } from './ui/button-variants.js'

// The admin shell's controls, drawn from the Button look (#535). Eager shell
// code takes `buttonVariants`, never the Base UI Button or `cn` (#529). Only
// what the Button look does not say is added here: a shape, and the current
// mark. Type sizes for the rail and tab labels sit on their inner spans in
// index.css, since a size class here would fight the button's `text-sm`.
//
// `justify-start!` and `justify-between!` are important on purpose: the
// button look centres (`justify-center`), and with no class merger two
// utilities for one property are ordered by the stylesheet, not by us.
//
// Current pages carry a foreground border and a card fill as well as the
// colour, and an area or page is current through `aria-current`, so the
// style follows the same attribute a screen reader reads.

// The ghost button's hover fill is --sunken, which is the rail's and the
// segment row's own fill: only the text would change. Hover is --surface
// (`bg-card`) everywhere in the shell. Important, because it shares a
// property with the variant's `hover:bg-accent`.
const HOVER = 'hover:bg-card!'

const CURRENT = `${HOVER} aria-[current]:border-foreground aria-[current]:bg-card aria-[current]:text-foreground`

const ghost = buttonVariants({ variant: 'ghost', size: 'bare' })

/** An area link in the desktop rail: icon over label, 56px wide. */
export const railLink = `${ghost} h-auto min-h-12 w-14 flex-col px-0.5 py-1.5 ${CURRENT}`

/** An area link in the phone tab bar: one equal 52px+ target per area. */
export const tabLink = `${ghost} h-auto min-h-13 min-w-0 flex-col px-0.5 py-1.5 ${CURRENT}`

/** A page link in the area's page list (desktop). */
export const pageLink = `${ghost} h-auto min-h-9 w-full justify-start! px-3 py-2 ${CURRENT}`

/**
 * A segment of the phone's page control: a link, or the sheet's button.
 * Weight 400 until current (the button look is 500, and the wider word is
 * what pushed a row past 320px); `px-1` keeps four segments beside the
 * account button inside 320px. `!` because both weights are one property.
 */
export const segmentLink = `${ghost} min-h-9 px-1 text-[0.8125rem] font-normal! aria-[current]:font-medium! ${CURRENT}`

/** The account trigger at the head of the desktop rail. */
export const accountRail = `${ghost} h-auto min-h-12 w-14 flex-col px-0.5 py-1 ${HOVER} aria-expanded:border-foreground aria-expanded:bg-card aria-expanded:text-foreground`

/** The account trigger on a phone: the mark and a caret. */
export const accountPill = `${buttonVariants({ variant: 'quiet', size: 'bare' })} h-11 px-2 aria-expanded:border-foreground aria-expanded:bg-card`

/**
 * A row in the account panel; 44px on a phone. A pending sign-out is
 * `aria-disabled` (not `disabled`, so focus stays): it reads as disabled
 * with the default cursor and no hover fill, which the legacy sheet cannot
 * say now that utilities sit above it.
 */
export const accountRow = `${ghost} h-auto min-h-9 w-full justify-between! px-3 py-2 ${HOVER} aria-disabled:cursor-default! aria-disabled:hover:bg-transparent! max-[900px]:min-h-11 max-[900px]:text-base`

/** The sign-in link on the gate. */
export const signInLink = buttonVariants({ variant: 'outline', size: 'lg' })
