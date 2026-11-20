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
  ['--accent', '--bg', 4.5],
  ['--accent', '--surface', 4.5],
  ['--accent', '--accent-soft', 4.5],
  ['--accent-ink', '--accent', 4.5],
  ['--highlight-ink', '--highlight', 4.5],
  ['--badge-ink', '--badge', 4.5],
  // The badge colour is also text on the page, the card and the rail.
  ...['--bg', '--surface', '--sunken'].map((b) => ['--badge', b, 4.5]),
  ['--line', '--bg', 3],
  ['--line-strong', '--bg', 3],
  ['--line-card', '--surface', 3],
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

/**
 * Pairs the chosen palette cannot satisfy. The thresholds stay as written; a
 * pair listed here must still fail (`it.fails`), so fixing it makes the test
 * red until the entry is deleted. Each entry says why.
 */
const KNOWN = {
  'dark --accent on --bg':
    'the design table fixes accent #f7a391 on page #4e4e4d at 4.21 (non-text 3:1 only)',
  'dark --accent on --surface':
    'accent #f7a391 on card #5a5a59 is 3.49: no lightness of the accent reaches 4.5 on the table values without leaving the table',
}

describe.each(Object.keys(THEMES))('contrast, %s theme', (theme) => {
  for (const [fg, bg, min] of PAIRS) {
    const test = KNOWN[`${theme} ${fg} on ${bg}`] ? it.fails : it
    test(`${fg} on ${bg} is at least ${min}:1`, () => {
      expect(measure(theme, fg, bg)).toBeGreaterThanOrEqual(min)
    })
  }
})
