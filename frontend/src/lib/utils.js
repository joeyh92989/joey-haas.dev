import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

// The class-name helper shadcn components import (components.json aliases
// "utils" to @/lib/utils). clsx joins conditionals; twMerge drops the losing
// one of two conflicting Tailwind classes.
export function cn(...inputs) {
  return twMerge(clsx(inputs))
}
