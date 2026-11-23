// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { readCss } from './testing/readCss.js'
import {
  TOUR_LEDE,
  TOUR_STOP_CLAIM,
  TOUR_STOP_COLS,
  TOUR_STOP_WHY,
  TOUR_TOC,
} from './components/tourClasses.js'
import { POSTER_HEART } from './components/shelf-classes.js'
import { NOW_FINISHED, PROSE_LIST } from './components/sharedClasses.js'
import { BAR, BAR_FILL, DAY_BAR } from './components/overview-classes.js'
import {
  DAILY_LEDE,
  MONTH_INDEX,
  MONTH_STEP,
} from './components/dailyClasses.js'

// Read from disk (testing/readCss.js): Vitest stubs CSS imports.
const css = readCss()

/**
 * Every `selectors { body }` pair with the at-rule it sits in (the @media
 * prelude, or null for a base rule), comments dropped, selector lists split.
 * A media override is a rule of its own, so a test on the base rule cannot be
 * satisfied, or broken, by it.
 */
function parseRules(source) {
  const rules = []
  const text = source.replace(/\/\*[\s\S]*?\*\//g, '')
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
  return rules
}
const rules = parseRules(css)

/** The declarations of every base rule naming this selector; fails if none. */
function rule(selector, from = rules) {
  const bodies = from
    .filter((r) => r.selector === selector && r.media === null)
    .map((r) => r.body)
  expect(bodies.length, `a base rule for ${selector}`).toBeGreaterThan(0)
  return bodies.join('\n')
}

/** The declarations of this selector's rules inside @media; fails if none. */
function mediaRule(selector, from = rules) {
  const bodies = from
    .filter((r) => r.selector === selector && r.media?.startsWith('@media'))
    .map((r) => r.body)
  expect(bodies.length, `a media rule for ${selector}`).toBeGreaterThan(0)
  return bodies.join('\n')
}

describe('single-series charts (#197)', () => {
  it.each([
    ['a rating or month bar', BAR],
    ['a day bar', DAY_BAR],
    ['a list fill', BAR_FILL],
  ])('draws %s in --chart', (_name, classes) => {
    expect(classes.split(' ')).toContain('bg-chart-1')
  })

  it('keeps amber for the rating star and the favorite heart only', () => {
    // Both are utilities on the components now (#536, slice D4).
    const rating = readFileSync(
      new URL('./components/Rating.jsx', import.meta.url),
      'utf8',
    )
    expect(rating).toMatch(/mr-\[0\.2em\] text-\(--rating\)/)
    expect(POSTER_HEART).toContain('text-(--rating)')
    expect(BAR).not.toContain('--rating')
    expect(DAY_BAR).not.toContain('chart-2')
  })
})

describe('tour on a phone (#475)', () => {
  // A bare 1fr track is minmax(auto, 1fr): a wide table or URL inside it
  // stretches the track past the viewport. minmax(0, 1fr) lets it shrink.
  it('lets the one-column stop shrink below its content', () => {
    expect(TOUR_STOP_COLS.split(' ')).toContain(
      '[@media(max-width:34rem)]:grid-cols-[minmax(0,1fr)]',
    )
  })

  it('lets the contents row shrink below its content', () => {
    expect(TOUR_TOC.split(' ')).toContain(
      '[@media(max-width:34rem)]:[&_a]:grid-cols-[2rem_minmax(0,1fr)]',
    )
  })
})

describe('two widths (#188)', () => {
  // These three are class strings now (dailyClasses.js).
  it.each([MONTH_INDEX, MONTH_STEP])(
    'holds %s to the 45rem column',
    (classes) => {
      expect(classes.split(' ')).toContain('max-w-[45rem]')
    },
  )

  it('caps running text in the Daily lede at the reading measure', () => {
    expect(DAILY_LEDE.split(' ')).toContain('max-w-[min(45rem,68ch)]')
  })

  const TEXT = 'max-width: min(45rem, 68ch);'

  it('holds the one-column stop to the 45rem column', () => {
    expect(TOUR_STOP_COLS.split(' ')).toContain('[&.one]:max-w-[45rem]')
  })

  it('caps running text in .prose at the reading measure', () => {
    expect(rule('.prose')).toContain(TEXT)
  })

  it.each([PROSE_LIST, NOW_FINISHED])(
    'caps the list %s at the reading measure',
    (classes) => {
      expect(classes.split(' ')).toContain('max-w-[min(45rem,68ch)]')
    },
  )

  it.each([TOUR_LEDE, TOUR_STOP_CLAIM, TOUR_STOP_WHY])(
    'caps the tour text %s at the reading measure',
    (classes) => {
      expect(classes.split(' ')).toContain('max-w-[min(45rem,68ch)]')
    },
  )

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
    // The sample has padding in its base rule and a phone override.
    const sample = parseRules(`
      .list { padding: 8px 4px; }
      @media (max-width: 700px) { .list { padding-right: 32px; } }
    `)
    expect(rule('.list', sample)).toContain('padding: 8px 4px;')
    expect(rule('.list', sample)).not.toContain('padding-right: 32px;')
    expect(mediaRule('.list', sample)).toContain('padding-right: 32px;')
  })
})
