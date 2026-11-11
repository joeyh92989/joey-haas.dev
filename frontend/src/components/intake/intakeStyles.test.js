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
})
