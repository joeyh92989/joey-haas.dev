// A text field's look, apart from the component: `ui/input.jsx` (Base UI, `cn`)
// and the native selects and textareas that have no component share one
// string, so a restyle of Input reaches them (#535). No imports.
export const FIELD_LOOK =
  'h-10 w-full min-w-0 rounded-md border border-foreground bg-card px-3 py-1 font-sans text-base text-foreground outline-none placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-55 aria-invalid:border-destructive md:text-sm'
