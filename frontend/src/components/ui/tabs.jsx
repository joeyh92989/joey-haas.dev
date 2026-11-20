import { Tabs as TabsPrimitive } from '@base-ui/react/tabs'
import { cn } from 'cn'

// Underline tabs (#528): a rule under the list, a 3px accent bar under the
// active tab. Keyboard and aria-selected come from Base UI. Horizontal only.
function Tabs({ className, ...props }) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn('flex flex-col gap-3', className)}
      {...props}
    />
  )
}

function TabsList({ className, ...props }) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        'flex w-full flex-wrap gap-1 border-b border-border',
        className,
      )}
      {...props}
    />
  )
}

function TabsTrigger({ className, ...props }) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        'relative inline-flex cursor-pointer items-center justify-center gap-2 border-0 bg-transparent px-3.5 py-3 font-sans text-sm whitespace-nowrap text-foreground outline-none after:absolute after:inset-x-0 after:bottom-0 after:hidden after:h-[3px] after:bg-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-55 data-active:font-medium data-active:after:block',
        className,
      )}
      {...props}
    />
  )
}

function TabsContent({ className, ...props }) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={cn('flex-1 text-sm outline-none', className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
