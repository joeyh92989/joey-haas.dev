import { Input as InputPrimitive } from '@base-ui/react/input'
import { cn } from 'cn'

// A flat field: 1px outline in the ink colour, on the card colour (#528).
function Input({ className, type, ...props }) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        'h-10 w-full min-w-0 rounded-md border border-foreground bg-card px-3 py-1 font-sans text-base text-foreground outline-none placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-55 aria-invalid:border-destructive md:text-sm',
        className,
      )}
      {...props}
    />
  )
}

export { Input }
