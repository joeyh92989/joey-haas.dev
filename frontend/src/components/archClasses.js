// The Colophon's architecture figure (Projects visuals, #289), drawn with
// tokens in both themes. (#536, group G2). The `arch*` names stay on the
// elements as hooks (tests read them); the look is these utilities. Every
// utility is written out whole, since Tailwind reads source text.
//
// Measured contrast (WCAG 2.x), dark / light. Figure ground is --surface; a
// node is filled --bg.
// Text: --text on --bg 7.57 / 14.03; --text on --surface 6.28 / 15.83;
// --text-2 on --bg 5.90 / 6.54; --text-2 on --surface 4.89 / 7.38;
// --text on --accent-soft (snapshot) 8.59 / 13.98; --text-2 on
// --accent-soft 6.69 / 6.52; --accent-ink on --accent (badge numerals)
// 7.16 / 6.69.
// Lines and marks (3:1 needed): --text-3 on --surface 4.89 / 7.38 (node
// outlines, edges, arrowheads); --text-3 on --bg 5.90 / 6.54; --accent on
// --surface 3.49 / 6.46 (snapshot outline and badges); --accent on
// --accent-soft 4.77 / 5.71.

export const ARCH =
  'bg-(--surface) border border-(--line) rounded-(--radius) mx-0 my-4 p-4'

export const ARCH_SVG = 'block h-auto mx-auto my-0 max-w-[22.5rem] w-full'

/** A node's box. The fill and stroke are in the two maps below, so a snapshot
 *  node never has two fills fighting over one rect. */
export const ARCH_NODE = '[&_rect]:stroke-[1.5]'
export const ARCH_NODE_FILL = {
  plain: '[&_rect]:fill-(--bg)',
  frame: '[&_rect]:fill-none',
  snapshot: '[&_rect]:fill-(--accent-soft)',
}
export const ARCH_NODE_STROKE = {
  plain: '[&_rect]:stroke-(--text-3)',
  snapshot: '[&_rect]:stroke-(--accent)',
}

export const ARCH_NAME = 'fill-(--text) text-[0.875rem] font-semibold'
export const ARCH_SUB = 'fill-(--text-2) text-[0.75rem]'
export const ARCH_EDGE = 'fill-none stroke-(--text-3) stroke-[1.5]'
export const ARCH_HEAD = 'fill-(--text-3)'
export const ARCH_BADGE =
  '[&_circle]:fill-(--accent) [&_text]:fill-(--accent-ink) [&_text]:text-[0.75rem] [&_text]:font-bold'

export const ARCH_CAPTION = {
  figcaption: 'text-(--text-2) text-[0.875rem] mt-3',
  list: 'mt-2 mb-0 mx-0 pl-4',
  item: '[&:not(:first-child)]:mt-1',
}

/** A project's hero: both themes' screenshots are in the markup, one is drawn.
 *  Print draws the light one whatever the theme. */
export const PROJECT_HERO = 'mt-4 mb-3 mx-0'
export const PROJECT_HERO_IMG =
  'border border-(--line) rounded-(--radius) h-auto max-w-full'
export const PROJECT_HERO_THEME = {
  dark: 'block [[data-theme=light]_&]:hidden print:hidden',
  light: 'hidden [[data-theme=light]_&]:block print:block',
}
