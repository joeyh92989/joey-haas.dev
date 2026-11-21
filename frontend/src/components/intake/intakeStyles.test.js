// @vitest-environment node
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ibtn } from '../addClasses.js'

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
  it('colors with tokens only (AC 13)', () => {
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
    expect(block).toContain('--line-strong is a mid grey now')
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
    expect(block).toContain('--text on --accent-soft 8.59 dark, 13.98 light')
  })

  it('gives the add bar, drawer and Clothes Check 44px targets on a phone', () => {
    // The buttons say it themselves (ibtn, #535); the rule is not in the CSS.
    const phone = intakeBlock().split('@media (max-width: 900px)')[1]
    expect(phone).not.toContain('.intake-addbar .btn')
    expect(phone).not.toContain('.intake-result .btn')
    expect(ibtn('plain')).toContain('max-[900px]:min-h-11')
  })

  it('draws the public demo in tokens, with its spine text measured', () => {
    const block = intakeBlock()
    expect(block).toContain('/* Public intake demo (/shelf/intake)')
    expect(block).toMatch(
      /\.intake-demo-spine \{[^}]*background: var\(--sunken\);[^}]*color: var\(--text\);/,
    )
    expect(block).toContain('--text on --sunken 8.59 dark, 12.81 light')
  })
})
