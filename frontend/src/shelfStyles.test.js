// @vitest-environment node
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Read from disk: Vitest stubs CSS imports, `?raw` included.
const css = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'index.css'),
  'utf8',
)

/** The declarations of every rule whose selector list is exactly this. */
function rule(selector) {
  const bodies = []
  let start = css.indexOf(`\n${selector} {`)
  while (start !== -1) {
    bodies.push(css.slice(start, css.indexOf('}', start)))
    start = css.indexOf(`\n${selector} {`, start + 1)
  }
  expect(bodies.length, `a rule for ${selector}`).toBeGreaterThan(0)
  return bodies.join('\n')
}

describe('single-series charts (#197)', () => {
  it.each([['.rating-bar,\n.month-bar'], ['.day-bar'], ['.bar-list-fill']])(
    'draws %s in --chart',
    (selector) => {
      expect(rule(selector)).toContain('background: var(--chart);')
    },
  )

  it('keeps amber for the rating star and the favorite heart only', () => {
    expect(rule('.rating-star')).toContain('color: var(--rating);')
    expect(rule('.rating-bar,\n.month-bar')).not.toContain('--rating')
    expect(rule('.day-bar')).not.toContain('--chart-2')
  })
})

describe('two widths (#188)', () => {
  it('uses only the 72rem page and the 45rem reading width on tracker pages', () => {
    for (const selector of [
      '.tonight',
      '.year-months',
      '.year-diary',
      '.month-days',
      '.daily-lede',
      '.comic-hero-next',
      '.comic-issue-desc',
      '.tour-lede',
      '.tour-stop-claim',
      '.tour-stop-why',
      '.tour-stop-cols.one',
    ]) {
      const start = css.indexOf(`\n${selector} {`)
      if (start === -1) continue
      const body = css.slice(start, css.indexOf('}', start))
      const widths = [...body.matchAll(/max-width: ([^;]+);/g)].map((m) => m[1])
      for (const width of widths) expect(width, selector).toBe('45rem')
    }
  })
})
