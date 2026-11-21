import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cwd } from 'node:process'
import { describe, expect, it } from 'vitest'

// The Closet pages draw from the Button, Card and Input looks (#535). The
// legacy `.btn`, `.chip` and `.panel` classes stay for areas not yet migrated
// (#536), so each migrated file is pinned not to use them.
const FILES = [
  'pages/AdminCloset.jsx',
  'pages/AdminClosetToday.jsx',
  'pages/AdminClosetReview.jsx',
  'pages/AdminClosetProfile.jsx',
  'pages/AdminGarment.jsx',
  'components/GarmentForm.jsx',
  'components/GarmentProductPanel.jsx',
  'components/GarmentTable.jsx',
  'components/OutfitBoard.jsx',
  'components/ReviewDeck.jsx',
  'components/SellChecklistSheet.jsx',
  'components/SeasonTurnBanner.jsx',
]
// Every class name in a className, whether a string or a template literal
// (`${btn()} btn-file`), minus the `${...}` parts.
const LEGACY = new Set([
  'btn',
  'chip',
  'panel',
  'btn-file',
  'garment-photo-pick',
  'outfit-piece-btn',
])

/** The legacy class names a file's className attributes use. */
export function legacyClasses(text) {
  const found = []
  for (const m of text.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
    const names = (m[1] ?? m[2]).replace(/\$\{[^}]*\}/g, ' ').split(/\s+/)
    found.push(...names.filter((name) => LEGACY.has(name)))
  }
  return found
}

describe('Closet pages and the legacy look', () => {
  for (const file of FILES) {
    it(`${file} has no legacy btn, chip or panel class`, () => {
      const text = readFileSync(resolve(cwd(), 'src', file), 'utf8')
      expect(legacyClasses(text)).toEqual([])
    })
  }

  it('the Today grid column may shrink', () => {
    const css = readFileSync(resolve(cwd(), 'src/index.css'), 'utf8')
    expect(css).toMatch(
      /\.today \{[^}]*grid-template-columns: minmax\(0, 1fr\)/,
    )
  })

  it('catches a legacy class in a template literal', () => {
    expect(
      legacyClasses('<label className={`${btn()} btn-file`}>x</label>'),
    ).toEqual(['btn-file'])
    expect(legacyClasses('<a className="btn sm">x</a>')).toEqual(['btn'])
    expect(legacyClasses('<a className={btn()}>x</a>')).toEqual([])
  })

  // Public rows that reset their padding must reset the start margin the
  // narrow-screen rule adds (a ring's room), or they sit 4px left (#535).
  for (const selector of [
    '.ctl-row .chip-row',
    '.tag-picker .chip-row',
    '.pick-choices .chip-row',
  ]) {
    it(`${selector} resets the start margin`, () => {
      const css = readFileSync(resolve(cwd(), 'src/index.css'), 'utf8')
      const at = css.indexOf(`${selector} {`)
      expect(at).toBeGreaterThan(-1)
      const body = css.slice(at, css.indexOf('}', at))
      expect(body).toMatch(/margin-inline-start: 0/)
    })
  }
})
