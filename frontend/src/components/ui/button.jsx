import { Button as ButtonPrimitive } from '@base-ui/react/button'
import { buttonVariants } from './button-variants.js'
import { cn } from 'cn'

function Button({
  className,
  variant = 'default',
  size,
  nativeButton,
  render,
  ...props
}) {
  // Base UI gives a non-native button role="button", which would turn a
  // link into a button for a screen reader. A link-button stays a link.
  // A nav trigger or text link has no box: its own variant sets the height.
  const sized =
    size ?? (variant === 'nav' || variant === 'link' ? 'bare' : 'default')
  const asLink = render && nativeButton === false
  return (
    <ButtonPrimitive
      data-slot="button"
      nativeButton={nativeButton}
      render={render}
      {...(asLink ? { role: 'link' } : null)}
      className={cn(buttonVariants({ variant, size: sized, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
