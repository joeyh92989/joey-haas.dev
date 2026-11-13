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

/** Every `selectors { body }` pair, comments dropped, selector lists split. */
const rules = []
for (const [, list, body] of css
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
  for (const selector of list.split(',')) {
    rules.push({ selector: selector.trim().replace(/\s+/g, ' '), body })
  }
}

/** The declarations of every rule naming this selector; fails if none. */
function rule(selector) {
  const bodies = rules.filter((r) => r.selector === selector).map((r) => r.body)
  expect(bodies.length, `a rule for ${selector}`).toBeGreaterThan(0)
  return bodies.join('\n')
}

describe('single-series charts (#197)', () => {
  it.each(['.rating-bar', '.month-bar', '.day-bar', '.bar-list-fill'])(
    'draws %s in --chart',
    (selector) => {
      expect(rule(selector)).toContain('background: var(--chart);')
    },
  )

  it('keeps amber for the rating star and the favorite heart only', () => {
    expect(rule('.rating-star')).toContain('color: var(--rating);')
    expect(rule('.rating-bar')).not.toContain('--rating')
    expect(rule('.day-bar')).not.toContain('--chart-2')
  })
})

describe('two widths (#188)', () => {
  const COLUMN = 'max-width: 45rem;'
  const TEXT = 'max-width: min(45rem, 68ch);'

  it.each([
    '.year-diary',
    '.month-days',
    '.month-index',
    '.month-step',
    '.comic-hero-next',
    '.series-row .lanes',
    '.tour-stop-cols.one',
  ])('holds %s to the 45rem column', (selector) => {
    expect(rule(selector)).toContain(COLUMN)
  })

  it.each([
    '.prose',
    '.prose-list',
    '.daily-lede',
    '.comic-issue-desc',
    '.item-description-wrap',
    '.tour-lede',
    '.tour-stop-claim',
    '.tour-stop-why',
  ])('caps running text in %s at the reading measure', (selector) => {
    expect(rule(selector)).toContain(TEXT)
  })

  it.each(['.tonight', '.year-months'])(
    'leaves %s no width of its own',
    (s) => {
      const bodies = rules.filter((r) => r.selector === s).map((r) => r.body)
      expect(bodies.join('')).not.toMatch(/max-width/)
    },
  )
})
