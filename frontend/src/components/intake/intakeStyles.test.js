// @vitest-environment node
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Read from disk: Vitest stubs CSS imports, `?raw` included.
const css = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'index.css'),
  'utf8',
)

/** The intake block of index.css, from its heading to the next block's. */
function intakeBlock() {
  const start = css.indexOf('/* Intake (/admin/collection/add')
  const end = css.indexOf('/* Collection table and add form', start)
  expect(start, 'the intake block').toBeGreaterThan(-1)
  return css.slice(start, end)
}

describe('intake styles', () => {
  it('colours with tokens only (AC 13)', () => {
    const block = intakeBlock()
    expect(block.replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(
      /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i,
    )
  })

  it('draws "still reading" in the measured token, not --line-strong', () => {
    const block = intakeBlock()
    expect(block).toMatch(
      /\.intake-meter-reading \{\s*background: var\(--status-backlog\);/,
    )
    // The ratios are recorded beside the rules.
    expect(block).toContain('--line-strong measured 1.60 and 1.50')
  })

  it('puts the drawer beside the grid, and a fixed sheet below 900px', () => {
    const block = intakeBlock()
    expect(block).toMatch(
      /\.intake-withdrawer\[data-drawer='open'\] \{[^}]*grid-template-columns: minmax\(0, 1fr\) 340px;/,
    )
    expect(block).toMatch(/\.intake-drawer-sheet \{[^}]*position: fixed;/)
  })

  it('records the add bar’s text on --accent-soft (the waiting line)', () => {
    const block = intakeBlock()
    expect(block).toMatch(
      /\.intake-waiting \{[^}]*background: var\(--accent-soft\);/,
    )
    expect(block).toContain('--text on --accent-soft 13.11 dark, 15.65 light')
  })

  it('gives the add bar, drawer and Clothes Check 44px targets on a phone', () => {
    const phone = intakeBlock().split('@media (max-width: 900px)')[1]
    for (const selector of [
      '.intake-addbar .btn',
      '.intake-drawer .btn',
      '.intake-waiting .btn',
      '.intake-result .btn',
    ]) {
      expect(phone, selector).toContain(selector)
    }
  })

  it('keeps a file-picker label focusable and pointable (.btn-file)', () => {
    // The input inside is visually hidden, so the label is the only ring.
    const rule = css.match(/\.btn-file:focus-within \{[^}]*\}/)
    expect(rule, '.btn-file:focus-within').not.toBeNull()
    expect(rule[0]).toMatch(/outline: 2px solid var\(--accent\);/)
    expect(css).toMatch(/\.btn-file \{[^}]*cursor: pointer;/)
  })
})
