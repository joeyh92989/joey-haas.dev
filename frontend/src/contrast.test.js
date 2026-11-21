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

/** The declarations of the first top-level block that opens with `selector`. */
function block(selector) {
  const start = css.indexOf(`\n${selector} {`)
  if (start < 0) throw new Error(`no ${selector} block in index.css`)
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
  ['--accent', '--bg', 3],
  ['--accent', '--surface', 3],
  ['--accent', '--accent-soft', 3],
  // Meter fills on their --sunken tracks (.pick-term-bar, .review-bar,
  // .progress i).
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
  /** The declarations of the first rule for `selector` at top level. */
  function rule(selector) {
    const at = css.indexOf(`\n${selector} {`)
    expect(at, selector).toBeGreaterThan(-1)
    return css.slice(at, css.indexOf('}', at))
  }

  // #534: a chart's track is --sunken with a --line-card outline, so the fill
  // is measured against the track (above) and the track against the card.
  it('draws every bar track on --sunken with a --line-card outline', () => {
    for (const sel of ['.bar-list-track', '.tour-bar', '.pick-term-bar']) {
      expect(rule(sel), sel).toMatch(/background:\s*var\(--sunken\)/)
      expect(rule(sel), sel).toMatch(/border:\s*1px solid var\(--line-card\)/)
    }
  })

  it('fills bars with --chart, and the score meter with --accent', () => {
    expect(rule('.bar-list-fill')).toMatch(/background:\s*var\(--chart\)/)
    expect(rule('.tour-bar-fill')).toMatch(/background:\s*var\(--chart\)/)
    expect(rule('.day-bar')).toMatch(/background:\s*var\(--chart\)/)
    expect(rule('.pick-term-bar > span')).toMatch(
      /background:\s*var\(--accent\)/,
    )
  })

  // #534: the Daily game's rules, re-measured on the Archive tokens above.
  it('keeps the match cell as --accent-ink on --status-active and the close ring as --warn on --surface', () => {
    const match = rule(".shelfle-cell[data-state='match']")
    expect(match).toMatch(/background:\s*var\(--status-active\)/)
    expect(match).toMatch(/color:\s*var\(--accent-ink\)/)
    const close = rule(".shelfle-cell[data-state='close']")
    expect(close).toMatch(/background:\s*var\(--surface\)/)
    expect(close).toMatch(/border-color:\s*var\(--warn\)/)
    const no = rule(".shelfle-cell[data-state='no']")
    expect(no).toMatch(/color:\s*var\(--text-2\)/)
  })

  it('the light block declares its own highlighter, not dark’s', () => {
    expect(LIGHT_OWN['--highlight']).toBe('#f3dc6b')
    expect(LIGHT_OWN['--highlight-ink']).toBe('#231f1a')
  })

  it('draws meter tracks on --sunken, so the fill is a 3:1 mark on it', () => {
    for (const sel of ['.pick-term-bar', '.review-bar', '.progress i']) {
      const at = css.indexOf(`\n${sel} {`)
      expect(at, sel).toBeGreaterThan(-1)
      const body = css.slice(at, css.indexOf('}', at))
      expect(body, sel).toMatch(/background:\s*var\(--sunken\)/)
    }
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
