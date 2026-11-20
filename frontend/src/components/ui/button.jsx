import { Button as ButtonPrimitive } from '@base-ui/react/button'
import { cva } from 'class-variance-authority'
import { cn } from 'cn'

// Restyled in place for the Archive look (#528): flat, a 1px outline, no
// shadow. `bg-primary` is the brand fill; `bg-accent` is shadcn's hover
// background (--sunken) and is not used for fills. A link-button passes
// `render={<Link />}` with `nativeButton={false}`.
const buttonVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-md border border-transparent font-sans text-sm font-medium whitespace-nowrap no-underline transition-colors outline-none select-none hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-55 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
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
        // A filter chip: pressed shows a heavier word, a darker outline and
        // the 3px accent bar, so colour never carries it alone.
        chip: 'relative overflow-hidden border-line-card bg-transparent text-foreground after:absolute after:inset-x-0 after:bottom-0 after:hidden after:h-[3px] after:bg-primary hover:border-foreground aria-pressed:border-foreground aria-pressed:bg-card aria-pressed:font-medium aria-pressed:after:block',
        link: 'h-auto px-0 text-accent-text underline underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-4',
        xs: 'h-6 px-2 text-xs',
        sm: 'h-8 px-3 text-[0.8125rem]',
        lg: 'h-11 px-5',
        chip: 'px-3 py-1 text-[0.8125rem] leading-snug',
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

function Button({
  className,
  variant = 'default',
  size = 'default',
  nativeButton,
  render,
  ...props
}) {
  // Base UI gives a non-native button role="button", which would turn a
  // link into a button for a screen reader. A link-button stays a link.
  const asLink = render && nativeButton === false
  return (
    <ButtonPrimitive
      data-slot="button"
      nativeButton={nativeButton}
      render={render}
      {...(asLink ? { role: 'link' } : null)}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
