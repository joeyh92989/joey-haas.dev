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
const print = css.slice(css.indexOf('/* ===== Print (#292) ====='))

describe('print stylesheet', () => {
  it('has a print block that hides the chrome', () => {
    expect(print).toContain('@media print')
    for (const sel of ['.mast', '.site-footer', '.search-dialog', '.skip-link'])
      expect(print).toContain(sel)
    expect(print).toContain('display: none !important')
  })

  it('repeats every light token', () => {
    const light = css.match(/\[data-theme='light'\] \{([\s\S]*?)\n\}/)[1]
    const names = [...light.matchAll(/^\s*(--[\w-]+):/gm)].map((m) => m[1])
    for (const name of names) expect(print).toContain(`${name}:`)
  })

  it('shows external link addresses in About and posts', () => {
    expect(print).toContain(".about a[href^='http']::after")
    expect(print).toContain(".post-body a[href^='http']::after")
  })
})
