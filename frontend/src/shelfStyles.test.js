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

/**
 * Every `selectors { body }` pair with the at-rule it sits in (the @media
 * prelude, or null for a base rule), comments dropped, selector lists split.
 * A media override is a rule of its own, so a test on the base rule cannot be
 * satisfied, or broken, by it.
 */
const rules = []
{
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const stack = []
  let start = 0
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (char === '{') {
      const prelude = text.slice(start, i).trim()
      const atRule = prelude.startsWith('@')
      stack.push({ prelude, atRule, bodyFrom: i + 1 })
      start = i + 1
    } else if (char === '}') {
      const open = stack.pop()
      if (open && !open.atRule) {
        const media = stack.find((entry) => entry.atRule)?.prelude ?? null
        const body = text.slice(open.bodyFrom, i)
        for (const selector of open.prelude.split(',')) {
          rules.push({
            selector: selector.trim().replace(/\s+/g, ' '),
            body,
            media,
          })
        }
      }
      start = i + 1
    }
  }
}

/** The declarations of every base rule naming this selector; fails if none. */
function rule(selector) {
  const bodies = rules
    .filter((r) => r.selector === selector && r.media === null)
    .map((r) => r.body)
  expect(bodies.length, `a base rule for ${selector}`).toBeGreaterThan(0)
  return bodies.join('\n')
}

/** The declarations of this selector's rules inside @media; fails if none. */
function mediaRule(selector) {
  const bodies = rules
    .filter((r) => r.selector === selector && r.media?.startsWith('@media'))
    .map((r) => r.body)
  expect(bodies.length, `a media rule for ${selector}`).toBeGreaterThan(0)
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
    expect(rule('.poster-heart')).toContain('color: var(--rating);')
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

describe('media-query rules are kept apart from base rules', () => {
  it('reads a media override as its own rule', () => {
    // .jump-nav ul has padding in its base rule and a phone override.
    expect(rule('.jump-nav ul')).toContain('padding: 0.6rem 4px;')
    expect(rule('.jump-nav ul')).not.toContain('padding-right: 2rem;')
    expect(mediaRule('.jump-nav ul')).toContain('padding-right: 2rem;')
  })
})
