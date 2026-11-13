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

/** Every line that sets a size: `font-size:` or a `font:` shorthand. */
const sized = lines.flatMap((text, index) =>
  /^\s*font(-size)?:/.test(text) && !/font:\s*inherit/.test(text)
    ? [{ text, previous: lines[index - 1] ?? '' }]
    : [],
)

describe('type scale', () => {
  it('defines the --fs steps on :root', () => {
    for (const step of [12, 13, 14, 16, 18, 20, 24, 28, 32, 40, 48]) {
      expect(css).toMatch(new RegExp(`--fs-${step}: [0-9.]+rem;`))
    }
  })

  it('sizes every font from a token, or says why not', () => {
    const loose = sized.filter(({ text }) => !/var\(--fs-\d+\)/.test(text))
    for (const { text, previous } of loose) {
      expect(previous, text).toMatch(/exempt|display size|Relative to/)
    }
  })

  it('has no font size under 12px outside the marked illustration glyphs', () => {
    const small = sized.filter(({ text }) => {
      const size = text.match(/([0-9.]+)(rem|px)/)
      if (!size) return false
      const px = size[2] === 'px' ? +size[1] : +size[1] * 16
      return px < 12
    })
    for (const { text, previous } of small) {
      expect(previous, text).toContain('exempt: illustration glyph')
    }
  })
})
