// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { readCss } from './testing/readCss.js'

// Read from disk (testing/readCss.js): Vitest stubs CSS imports.
const css = readCss()
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

  it('stacks About and lets the timeline break between roles', () => {
    for (const rule of [
      '.about {\n    display: block;',
      '.about-aside {',
      'position: static;',
      '.timeline-entry.timeline-employer {\n    break-inside: auto;',
      '.timeline-step,\n  .timeline-points li {\n    break-inside: avoid;',
    ])
      expect(print).toContain(rule)
  })

  it('keeps a role heading with its bullets', () => {
    expect(print).toMatch(/h3,\s+h4 \{\s+break-after: avoid;/)
  })
})
