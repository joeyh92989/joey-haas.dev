// @vitest-environment node
import { PROGRESS_BAR } from './components/sharedClasses.js'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { REVIEW_BAR } from './components/closetReviewClasses.js'
import { readCss } from './testing/readCss.js'
import { BAR_FILL, BAR_TRACK, DAY_BAR } from './components/overview-classes.js'
import { TOUR_BAR, TOUR_BAR_FILL } from './components/tourClasses.js'
import { PICK_TERM_BAR } from './components/tonightClasses.js'
import { SHELFLE_CELL } from './components/dailyClasses.js'

// Read from disk (testing/readCss.js): Vitest stubs CSS imports.
const css = readCss()

/** The declarations of the first top-level block that opens with `selector`. */
function block(selector) {
  const start = css.indexOf(`\n${selector} {`)
  if (start < 0) throw new Error(`no ${selector} block in the stylesheets`)
  const open = css.indexOf('{', start)
  const close = css.indexOf('\n}', open)
  const body = css.slice(open + 1, close).replace(/\/\*[\s\S]*?\*\//g, '')
  const tokens = {}
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    tokens[m[1]] = m[2].trim()
  }
  return tokens
}

const root = block(':root')
// The light block only overrides: everything else comes from :root.
const THEMES = {
  dark: root,
  light: { ...root, ...block("[data-theme='light']") },
}

function resolve(tokens, name, seen = []) {
  let value = tokens[name]
  if (value === undefined) return undefined
  const ref = value.match(/^var\((--[\w-]+)\)$/)
  if (ref) {
    if (seen.includes(ref[1])) throw new Error(`cycle at ${ref[1]}`)
    return resolve(tokens, ref[1], [...seen, name])
  }
  return value
}

function rgb(hex) {
  const h = hex.replace('#', '')
  if (!/^[0-9a-f]{6}$/i.test(h)) return null
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
}

function luminance([r, g, b]) {
  const f = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

function ratio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

function measure(theme, fg, bg) {
  const tokens = THEMES[theme]
  const f = rgb(resolve(tokens, fg) ?? '')
  const b = rgb(resolve(tokens, bg) ?? '')
  if (!f) throw new Error(`${theme}: ${fg} is missing or not a hex colour`)
  if (!b) throw new Error(`${theme}: ${bg} is missing or not a hex colour`)
  return ratio(f, b)
}

const TEXT = ['--text', '--text-2', '--text-3']
const STATUS = [
  '--status-active',
  '--status-finished',
  '--status-backlog',
  '--status-abandoned',
]

/** [foreground, background, minimum ratio] */
const PAIRS = [
  ...TEXT.flatMap((t) =>
    ['--bg', '--surface', '--sunken', '--accent-soft'].map((b) => [t, b, 4.5]),
  ),
  // The accent as text takes its own token; --accent itself is the fill,
  // edge and underline colour, a mark.
  ...['--bg', '--surface', '--sunken', '--accent-soft'].map((b) => [
    '--accent-text',
    b,
    4.5,
  ]),
  // Closet marks (#535, closetClasses.js): PRESSED is --accent-text (4.5) with
  // an --accent border (3, a mark) on the card; CHECKED_CHIP is --text (4.5)
  // with a --text border on the card. Both also carry a heavier word, so
  // colour never carries the state alone.
  ['--accent-text', '--surface', 4.5],
  ['--accent', '--surface', 3],
  ['--text', '--surface', 4.5],
  ['--accent', '--bg', 3],
  ['--accent', '--surface', 3],
  ['--accent', '--accent-soft', 3],
  // Meter fills on their --sunken tracks (.pick-term-bar, the review
  // deck's bar, .progress i).
  ['--accent', '--sunken', 3],
  ['--status-active', '--sunken', 3],
  // Chart marks (#534): every bar fill on the --sunken track it grows from.
  // The track's outline is --line-card against the card it sits in (asserted
  // below, 3:1 in both themes); it is not measured against the track, where
  // light --line-card is 2.86 and is not what draws the shape. --chart on
  // --surface is asserted with the marks below.
  ['--chart', '--sunken', 3],
  // The Daily game's cells (#534): the match cell's word on its fill (text,
  // 4.5), the fill and the close ring as marks on the card (3, below for the
  // fill; the ring is --warn, also below), and the plain cell's word.
  ['--accent-ink', '--status-active', 4.5],
  ['--warn', '--surface', 3],
  ['--status-active', '--surface', 3],
  // Comic "upcoming" cells: numerals over the hatch's stripe, and the stripe
  // as a mark on the card.
  ['--text', '--hatch-stripe', 4.5],
  ['--hatch-stripe', '--surface', 3],
  // --ok and --warn as text (their marks are tested below at 3:1).
  ...['--ok-text', '--warn-text'].flatMap((t) =>
    ['--bg', '--surface', '--sunken'].map((b) => [t, b, 4.5]),
  ),
  ['--accent-ink', '--accent', 4.5],
  ['--highlight-ink', '--highlight', 4.5],
  ['--badge-ink', '--badge', 4.5],
  // The badge colour is also text on the page, the card and the rail.
  ...['--bg', '--surface', '--sunken'].map((b) => ['--badge', b, 4.5]),
  // A pressed filter chip (#532): the page colour as text on the ink fill.
  ['--bg', '--text', 4.5],
  ['--text', '--bg', 3],
  ['--line', '--bg', 3],
  ['--line-strong', '--bg', 3],
  ['--line-card', '--surface', 3],
  // Core components (#528). Status mark: its --text outline is a 3:1 mark on
  // the card and the page (covered by the --text text pairs above, 4.5 or
  // more). The highlighter fill alone is pale in light (1.3 on the card), so
  // the word and the outline carry the meaning, never the fill. The word and
  // mono labels are --text-2; the secondary button is --text on --sunken.
  // Badge outline (--line-card) on the page; on the card it is asserted above.
  ['--line-card', '--bg', 3],
  ...[
    '--ok',
    '--warn',
    '--chart',
    '--chart-2',
    '--rating',
    '--run-missing',
    ...STATUS,
  ].map((m) => [m, '--surface', 3]),
]

describe.each(Object.keys(THEMES))('contrast, %s theme', (theme) => {
  for (const [fg, bg, min] of PAIRS) {
    it(`${fg} on ${bg} is at least ${min}:1`, () => {
      expect(measure(theme, fg, bg)).toBeGreaterThanOrEqual(min)
    })
  }
})

const LIGHT_OWN = block("[data-theme='light']")

describe('theme blocks', () => {
  // #534: a chart's track is --sunken with a --line-card outline, so the fill
  // is measured against the track (above) and the track against the card.
  it('draws every bar track on --sunken with a --line-card outline', () => {
    // The list track is a class string now (overview-classes.js).
    expect(BAR_TRACK.split(' ')).toContain('bg-(--sunken)')
    expect(BAR_TRACK.split(' ')).toContain('border')
    expect(BAR_TRACK.split(' ')).toContain('border-line-card')
    // Pick for me's track is a class string too (tonightClasses.js).
    expect(PICK_TERM_BAR.split(' ')).toContain('bg-(--sunken)')
    expect(PICK_TERM_BAR.split(' ')).toContain('border')
    expect(PICK_TERM_BAR.split(' ')).toContain('border-line-card')
    expect(TOUR_BAR.split(' ')).toContain('bg-(--sunken)')
    expect(TOUR_BAR.split(' ')).toContain('border')
    expect(TOUR_BAR.split(' ')).toContain('border-(--line-card)')
  })

  it('fills bars with --chart, and the score meter with --accent', () => {
    expect(BAR_FILL.split(' ')).toContain('bg-chart-1')
    expect(TOUR_BAR_FILL.split(' ')).toContain('bg-(--chart)')
    expect(DAY_BAR.split(' ')).toContain('bg-chart-1')
    expect(PICK_TERM_BAR.split(' ')).toContain('[&>span]:bg-(--accent)')
  })

  // #534: the Daily game's rules, re-measured on the Archive tokens above.
  it('keeps the match cell as --accent-ink on --status-active and the close ring as --warn on --surface', () => {
    // The cell is a class string now (dailyClasses.js).
    const cell = SHELFLE_CELL.split(' ')
    expect(cell).toContain('data-[state=match]:bg-(--status-active)')
    expect(cell).toContain('data-[state=match]:text-(--accent-ink)')
    expect(cell).toContain('data-[state=close]:bg-(--surface)')
    expect(cell).toContain('data-[state=close]:border-(--warn)')
    expect(cell).toContain('data-[state=no]:text-muted-foreground')
  })

  it('the light block declares its own highlighter, not dark’s', () => {
    expect(LIGHT_OWN['--highlight']).toBe('#f3dc6b')
    expect(LIGHT_OWN['--highlight-ink']).toBe('#231f1a')
  })

  it('draws meter tracks on --sunken, so the fill is a 3:1 mark on it', () => {
    // The review deck's bar is utilities now: bg-muted is --sunken.
    expect(REVIEW_BAR).toMatch(/(^| )bg-muted( |$)/)
    expect(PICK_TERM_BAR.split(' ')).toContain('bg-(--sunken)')
    // The pick list's read-through bar is utilities too (sharedClasses.js).
    expect(PROGRESS_BAR.split(' ')).toContain('bg-(--sunken)')
  })

  // The paper is light whatever theme is browsed (index.css, Print): the
  // print copy must not drift from the light block.
  it('the @media print tokens equal the light block for every shared token', () => {
    const at = css.indexOf('@media print {')
    const open = css.indexOf('[data-theme] {', at)
    const close = css.indexOf('\n  }', open)
    const body = css.slice(open + '[data-theme] {'.length, close)
    const print = {}
    for (const m of body
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
      print[m[1]] = m[2].replace(/\s+/g, '')
    }
    const norm = (v) => v.replace(/\s+/g, '')
    const drift = Object.keys(print).filter(
      (k) => k in LIGHT_OWN && norm(LIGHT_OWN[k]) !== print[k],
    )
    expect(drift).toEqual([])
    // and nothing the light block overrides is missing from print
    const missing = Object.keys(LIGHT_OWN).filter((k) => !(k in print))
    expect(missing).toEqual([])
  })
})

// The admin shelf lists (#532, slice b). Delete is the destructive Button
// look (a border and text in --destructive on the card, and its word, so it
// is not colour alone): shadcn's --destructive lives in tailwind.css, one
// hex per theme, so it is read here and measured as text on --surface. The
// other new states reuse pairs measured above: a pressed toggle is --bg on
// --text (4.5), Play is --accent-ink on --accent (4.5), the heart is
// --rating on --surface (3) and its glyph changes shape when pressed.
describe.each(Object.keys(THEMES))(
  'admin shelf controls, %s theme',
  (theme) => {
    it('Delete (--destructive) is at least 4.5:1 on --surface', () => {
      const tailwind = readFileSync(
        join(dirname(fileURLToPath(import.meta.url)), 'tailwind.css'),
        'utf8',
      )
      const hex =
        theme === 'dark'
          ? tailwind.match(
              /:root \{[\s\S]*?--destructive:\s*(#[0-9a-f]{6})/i,
            )[1]
          : tailwind.match(
              /\[data-theme='light'\] \{[\s\S]*?--destructive:\s*(#[0-9a-f]{6})/i,
            )[1]
      const surface = rgb(resolve(THEMES[theme], '--surface'))
      expect(ratio(rgb(hex), surface)).toBeGreaterThanOrEqual(4.5)
    })

    // The comics panel's "Cover wall" and "Edit" are accent-text links on the
    // card (4.5, as text), and a pressed heart is a non-text mark in
    // --rating on the card (3:1; its glyph also changes from outline to
    // filled).
    it('the panel links (--accent-text) are at least 4.5:1 on --surface', () => {
      expect(
        measure(theme, '--accent-text', '--surface'),
      ).toBeGreaterThanOrEqual(4.5)
    })

    it('the pressed heart (--rating) is at least 3:1 on --surface', () => {
      expect(measure(theme, '--rating', '--surface')).toBeGreaterThanOrEqual(3)
    })

    it('a pressed toggle (--bg on a --text fill) is at least 4.5:1', () => {
      expect(measure(theme, '--bg', '--text')).toBeGreaterThanOrEqual(4.5)
    })
  },
)
