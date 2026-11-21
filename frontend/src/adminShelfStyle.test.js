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

/** The body of the first rule that opens with exactly `selector`. */
function body(selector) {
  const at = css.indexOf(`\n${selector} {`)
  expect(at, selector).toBeGreaterThan(-1)
  return css.slice(css.indexOf('{', at) + 1, css.indexOf('\n}', at))
}

describe('the admin card panel on a pointer device (#532 b)', () => {
  // In flow at opacity 0 it left 250px of empty card: it is taken out of the
  // flow, kept reachable by opacity (never display or visibility), and drawn
  // on a solid surface so the text under it does not show through.
  const panel = body(".collection-list .shelf-actions[data-mode='hover']")

  it('is out of the flow, anchored to the card foot', () => {
    expect(panel).toMatch(/position:\s*absolute/)
    expect(panel).toMatch(/bottom:\s*0/)
  })

  it('has a solid surface and is never hidden with display or visibility', () => {
    expect(panel).toMatch(/background:\s*var\(--surface\)/)
    expect(panel).not.toMatch(/display:\s*none|visibility:\s*hidden/)
  })

  it('is revealed on hover and on focus within, without moving anything', () => {
    expect(css).toMatch(
      /\.collection-list \.poster-card:hover \.shelf-actions\[data-mode='hover'\]/,
    )
    expect(css).toMatch(/\.shelf-actions\[data-mode='hover'\]:focus-within/)
  })
})
