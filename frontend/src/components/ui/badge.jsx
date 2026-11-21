import { mergeProps } from '@base-ui/react/merge-props'
import { useRender } from '@base-ui/react/use-render'
import { badgeVariants } from './badge-variants.js'
import { cn } from 'cn'

function Badge({ className, variant = 'default', render, ...props }) {
  return useRender({
    defaultTagName: 'span',
    props: mergeProps(
      {
        className: cn(badgeVariants({ variant }), className),
      },
      props,
    ),
    render,
    state: {
      slot: 'badge',
      variant,
    },
  })
}

export { Badge, badgeVariants }
