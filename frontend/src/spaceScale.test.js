// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { readCss } from './testing/readCss.js'

// Read from disk (testing/readCss.js): Vitest stubs CSS imports.
const css = readCss()

const STEPS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4]

/** Every padding / margin / gap declaration, split into its top-level values. */
const spacing = css.split('\n').flatMap((text) => {
  const m = text.match(
    /^\s*(?:(?:padding|margin)(?:-[a-z-]+)?|gap|row-gap|column-gap):\s*([^;{}]*?)\s*(?:!important)?;/,
  )
  if (!m) return []
  const values = []
  let depth = 0
  let current = ''
  for (const ch of m[1]) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (/\s/.test(ch) && depth === 0) {
      if (current) values.push(current)
      current = ''
    } else current += ch
  }
  if (current) values.push(current)
  return [{ text, values }]
})

// Out of scope on purpose: negative margins (a deliberate pull, often paired
// with a matching positive value), `scroll-padding*` (a scroll offset, not
// layout spacing) and values inside calc()/clamp()/min()/max(). Everything
// else is a --space-* token, or its line carries
// `/* space-exception: <reason> */` (issue #213; the snap map and the
// exception list are in docs/planning/2026-11-15-spacing-snap-design.md).
const EXCEPTION = /\/\*\s*space-exception:\s*(\S[^*]*?)\s*\*\//
const LITERAL = /^\d*\.?\d+(rem|px|em|ch|vw|vh|vmin|vmax|%)$/
const isZero = (v) => /^0*\.?0+(rem|px|em|ch|vw|vh|vmin|vmax|%)?$/.test(v)
describe('spacing scale', () => {
  it('defines the --space steps on :root', () => {
    STEPS.forEach((rem, i) => {
      expect(css).toContain(`--space-${i + 1}: ${rem}rem;`)
    })
  })

  it('finds the spacing declarations', () => {
    expect(spacing.length).toBeGreaterThan(100)
  })

  it('uses a token wherever a spacing value is exactly a step', () => {
    for (const { text, values } of spacing) {
      for (const value of values) {
        const m = value.match(/^(\d*\.?\d+)(rem|px)$/)
        if (!m) continue
        const rem = m[2] === 'px' ? +m[1] / 16 : +m[1]
        expect(STEPS, text).not.toContain(rem)
      }
    }
  })

  it('has no literal padding, margin or gap value outside a documented exception', () => {
    const offenders = []
    for (const { text, values } of spacing) {
      if (EXCEPTION.test(text)) continue
      for (const value of values) {
        if (LITERAL.test(value) && !isZero(value)) offenders.push(text.trim())
      }
    }
    expect(offenders).toEqual([])
  })

  it('gives every exception a reason, and only on a line that needs one', () => {
    const marked = css.split('\n').filter((l) => /space-exception/.test(l))
    expect(marked.length).toBeGreaterThan(0)
    for (const line of marked) {
      expect(line, line).toMatch(EXCEPTION)
      const row = spacing.find((s) => s.text === line)
      expect(row, `${line} is not a spacing declaration`).toBeDefined()
      expect(
        row.values.some((v) => LITERAL.test(v) && !isZero(v)),
        `${line} has no literal to except`,
      ).toBe(true)
    }
  })
})
