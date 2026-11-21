import { cva } from 'class-variance-authority'

// The badge's look, apart from the component, so eager pages take it without
// Base UI or `cn` (the same split as button-variants.js, #530).
// A small mono label with a 1px outline (#528). `default` sits on the card
// tone, `outline` on nothing, `accent` is the one filled variant.
export const badgeVariants = cva(
  'inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-sm border px-2 font-mono text-xs font-normal whitespace-nowrap outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring [&>svg]:pointer-events-none [&>svg]:size-3',
  {
    variants: {
      variant: {
        default: 'border-line-card bg-card text-foreground',
        outline: 'border-line-card bg-transparent text-muted-foreground',
        accent: 'border-primary bg-primary text-primary-foreground',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)
