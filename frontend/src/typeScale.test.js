// @vitest-environment node
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Read from disk: Vitest stubs CSS imports.
const css = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'index.css'),
  'utf8',
)
const lines = css.split('\n')

const STEPS = [12, 13, 14, 16, 18, 20, 24, 28, 32, 40, 48, 56]

/**
 * The only font sizes allowed off the scale, by selector. Each entry is a
 * label inside a drawing that carries its accessible name elsewhere, or
 * prose-relative inline code. Adding one means adding it here, on purpose.
 */
const EXEMPT = {
  '.intake-demo-spine': 'font-size: 0.625rem;',
  ".intake-demo-spine[data-size='md']": 'font-size: 0.5625rem;',
  ".intake-demo-spine[data-size='sm']": 'font-size: 0.5rem;',
  ".intake-demo-spine[data-size='xs']": 'font-size: 0.4375rem;',
  ".run-cell[data-k='read']::after": 'font-size: 0.5rem;',
  ".run-cell[data-k='skip']::after": 'font-size: 0.5625rem;',
  '.drawn-map__sea-label': 'font: italic 400 11px var(--font-display);',
  '.spot-map-label': 'font: 500 11px var(--font-mono);',
  '.spot-map-north text': 'font: 500 10px var(--font-mono);',
}

/** Sizes in em or %, which follow the text around them. Selector -> value. */
const RELATIVE = {
  '.post-body :not(pre) > code': 'font-size: max(0.85em, var(--fs-12));',
}

/** Every line that sets a size: `font-size:` or a `font:` shorthand. */
const sized = lines.flatMap((text, index) => {
  if (!/^\s*font(-size)?:/.test(text) || /font:\s*inherit/.test(text)) return []
  let at = index
  while (at > 0 && !lines[at].trimEnd().endsWith('{')) at--
  return [
    { text: text.trim(), selector: lines[at].replace(/\s*\{$/, '').trim() },
  ]
})

describe('type scale', () => {
  it('defines the --fs steps on :root', () => {
    for (const step of STEPS) {
      expect(css).toMatch(new RegExp(`--fs-${step}: [0-9.]+rem;`))
    }
  })

  it('sizes every font from a defined token, or is listed above', () => {
    const loose = []
    for (const { text, selector } of sized) {
      const tokens = [...text.matchAll(/var\(--fs-(\d+)\)/g)].map((m) => +m[1])
      // A bare token (optionally as the size in a shorthand): never inside
      // calc(), max(), min() or clamp(), which could carry a smaller size.
      const bare = tokens.length > 0 && !/(calc|max|min|clamp)\(/.test(text)
      if (bare) {
        for (const step of tokens) expect(STEPS, text).toContain(step)
        continue
      }
      if (EXEMPT[selector] === text || RELATIVE[selector] === text) continue
      loose.push(`${selector}: ${text}`)
    }
    expect(loose).toEqual([])
  })

  it('lists no exemption that the stylesheet no longer has', () => {
    const present = new Set(
      sized.map(({ selector, text }) => `${selector}|${text}`),
    )
    for (const [selector, text] of [
      ...Object.entries(EXEMPT),
      ...Object.entries(RELATIVE),
    ]) {
      expect(present.has(`${selector}|${text}`), selector).toBe(true)
    }
  })

  it('has no size under 12px outside the listed illustration labels', () => {
    for (const { text, selector } of sized) {
      if (selector in EXEMPT) continue
      const size = text.match(/([0-9.]+)(rem|px)/)
      if (!size) continue
      const px = size[2] === 'px' ? +size[1] : +size[1] * 16
      expect(px, `${selector}: ${text}`).toBeGreaterThanOrEqual(12)
    }
  })
})
