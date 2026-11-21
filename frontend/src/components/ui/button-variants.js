import { cva } from 'class-variance-authority'

// The button's look, apart from the component: the masthead takes it without
// the Base UI runtime or `cn` (about 40KB), which are not in the entry chunk
// (#529).
// Restyled in place for the Archive look (#528): flat, a 1px outline, no
// shadow. `bg-primary` is the brand fill; `bg-accent` is shadcn's hover
// background (--sunken) and is not used for fills. A link-button passes
// `render={<Link />}` with `nativeButton={false}`.
export const buttonVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-md border border-transparent bg-transparent font-sans text-sm font-medium whitespace-nowrap no-underline transition-colors outline-none select-none hover:no-underline focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-55 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          'border-primary bg-primary text-primary-foreground hover:brightness-110',
        outline:
          'border-foreground bg-transparent text-foreground hover:bg-card',
        secondary:
          'border-border bg-secondary text-secondary-foreground hover:border-foreground',
        ghost:
          'bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground',
        destructive:
          'border-destructive bg-transparent text-destructive hover:bg-accent',
        // A filter chip: weight 400 in --text-2 until pressed; pressed shows a
        // heavier word (500), a darker outline and the 3px accent bar, so
        // colour never carries it alone.
        chip: 'relative overflow-hidden border-line-card bg-transparent font-normal text-muted-foreground after:absolute after:inset-x-0 after:bottom-0 after:hidden after:h-[3px] after:bg-primary hover:border-foreground aria-pressed:border-foreground aria-pressed:bg-card aria-pressed:font-medium aria-pressed:text-foreground aria-pressed:after:block',
        // The masthead's controls: transparent, a muted outline that darkens
        // on hover (the 3b1 mockup's .tools buttons).
        quiet:
          'border-muted-foreground bg-transparent text-foreground hover:border-foreground hover:bg-card',
        // A nav trigger that reads like the links beside it (More): no box,
        // the 2px top and bottom borders keep its label level with them.
        nav: 'h-auto rounded-none border-x-0 border-y-2 border-transparent px-0 font-normal text-foreground hover:underline',
        link: 'h-auto px-0 text-accent-text underline underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-4',
        xs: 'h-6 px-2 text-xs',
        sm: 'h-8 px-3 text-[0.8125rem]',
        lg: 'h-11 px-5',
        // 4px between label and count on desktop; on a phone the legacy
        // `.chip > .chip-count` margin supplies it (adminPolish.test.js).
        chip: 'gap-1 px-3 py-1 text-[0.8125rem] leading-[1.4] max-[700px]:gap-0',
        icon: 'size-9',
        'icon-xs': 'size-6',
        'icon-sm': 'size-8',
        'icon-lg': 'size-11',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)
