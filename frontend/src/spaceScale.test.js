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

describe('spacing scale', () => {
  it('defines the --space steps on :root', () => {
    STEPS.forEach((rem, i) => {
      expect(css).toContain(`--space-${i + 1}: ${rem}rem;`)
    })
  })

  it('finds the spacing declarations', () => {
    expect(spacing.length).toBeGreaterThan(900)
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
})
