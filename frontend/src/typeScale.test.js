// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { DRAWN_MAP_SEA_LABEL } from './components/travelClasses.js'
import { readCss } from './testing/readCss.js'

// Read from disk (testing/readCss.js): Vitest stubs CSS imports.
const css = readCss()
const lines = css.split('\n')

const STEPS = [12, 13, 14, 16, 18, 20, 24, 28, 32, 40, 48, 56]

/**
 * The only font sizes allowed off the scale, by selector. Each entry is a
 * label inside a drawing that carries its accessible name elsewhere, or
 * prose-relative inline code. Adding one means adding it here, on purpose.
 */
const EXEMPT = {
  ".run-cell[data-k='read']::after": 'font-size: 0.5rem;',
  ".run-cell[data-k='skip']::after": 'font-size: 0.5625rem;',
}

// The drawn map's sea label (11px italic, inside a drawing that carries its
// accessible name on the SVG) is a utility now (travelClasses.js); the test
// below pins its size.

// The intake demo's drawn spines (0.625 to 0.4375rem) are utilities now
// (intakeDemoClasses.js); intakeStyles.test.js pins their sizes.

/** Sizes in em or %, which follow the text around them. Selector -> value. */
const RELATIVE = {
  '.post-body :not(pre) > code': 'font-size: max(0.85em, var(--fs-12));',
}

/** `revert` hands a size back to the browser (the Preflight shim in
 * styles/base.css, #536): it sets none. */
const reverts = (text) => /:\s*revert;/.test(text)

/** Every line that sets a size: `font-size:` or a `font:` shorthand. */
const sized = lines.flatMap((text, index) => {
  if (
    !/^\s*font(-size)?:/.test(text) ||
    /font:\s*inherit/.test(text) ||
    reverts(text)
  )
    return []
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

  it("keeps the drawn map's sea label at 11px, the one size off the scale", () => {
    expect(DRAWN_MAP_SEA_LABEL.split(' ')).toContain(
      '[font:italic_400_11px_var(--font-display)]',
    )
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

  // Only the 500 cuts of Source Serif 4 are installed (main.jsx): a heavier
  // weight set beside the serif is synthesised by the browser.
  it('sets h1, h2 and h3 in --font-display', () => {
    const base = css.match(/(?:^|\n)h1,\s*h2,\s*h3 \{([^{}]*)\}/)
    expect(base, 'the h1, h2, h3 base rule').not.toBeNull()
    expect(base[1]).toMatch(/font-family:\s*var\(--font-display\)/)
  })

  it('never sets a weight above 500 beside --font-display', () => {
    const heavy = []
    for (const [, selector, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (!/var\(--font-display\)/.test(body)) continue
      const weights = [
        ...body.matchAll(/font-weight:\s*(\d+)/g),
        ...body.matchAll(/font:[^;]*?\b([1-9]00)\b/g),
      ].map((m) => +m[1])
      if (weights.some((w) => w > 500)) heavy.push(selector.trim())
    }
    expect(heavy).toEqual([])
  })

  it('never sets a weight above 500 on a heading selector', () => {
    const heavy = []
    for (const [, selector, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const onHeading = selector
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split(',')
        .some((part) => /(^|[\s>+~])h[1-3]$/.test(part.trim()))
      if (!onHeading) continue
      const weights = [
        ...body.matchAll(/font-weight:\s*(\d+)/g),
        ...body.matchAll(/font:[^;]*?\b([1-9]00)\b/g),
      ].map((m) => +m[1])
      if (weights.some((w) => w > 500)) heavy.push(selector.trim())
    }
    expect(heavy).toEqual([])
  })
})
