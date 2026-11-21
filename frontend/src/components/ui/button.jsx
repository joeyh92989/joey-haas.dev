import { Button as ButtonPrimitive } from '@base-ui/react/button'
import { buttonVariants } from './button-variants.js'
import { cn } from 'cn'

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
