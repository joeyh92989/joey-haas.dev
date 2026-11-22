// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  ABOUT,
  ABOUT_ASIDE,
  TIMELINE_EMPLOYER,
  TIMELINE_POINTS,
  timelineEntry,
  timelineStep,
} from './components/aboutClasses.js'
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
    // These are `print:` utilities now (aboutClasses.js).
    expect(ABOUT.split(' ')).toContain('print:block')
    expect(ABOUT_ASIDE.split(' ')).toEqual(
      expect.arrayContaining(['print:static', 'print:mb-6']),
    )
    expect(TIMELINE_EMPLOYER.split(' ')).toContain('print:break-inside-auto')
    expect(timelineEntry(false).split(' ')).toContain(
      'print:break-inside-avoid',
    )
    expect(timelineStep(false).split(' ')).toContain('print:break-inside-avoid')
    expect(TIMELINE_POINTS.split(' ')).toContain(
      'print:[&>li]:break-inside-avoid',
    )
  })

  it('keeps a role heading with its bullets', () => {
    expect(print).toMatch(/h3,\s+h4 \{\s+break-after: avoid;/)
  })
})
