import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cwd } from 'node:process'
import { describe, expect, it } from 'vitest'
import { FIELD, FIELD_AUTO, FIELD_CELL } from './adminDataClasses.js'
import { TEXT_LINK } from './detail-classes.js'

// The admin Shelf data and edit pages draw from the Button, Card and Input
// looks (#535). The legacy `.btn`, `.chip`, `.panel` and `.link-button`
// classes stay for areas not yet migrated (#536), so each migrated file is
// pinned not to use them.
const FILES = [
  'pages/AdminCatalogue.jsx',
  'pages/AdminStoreList.jsx',
  'pages/AdminItem.jsx',
  'pages/AdminComic.jsx',
  'pages/AdminComicVolume.jsx',
  'components/BooksPanel.jsx',
  'components/CollectsEditor.jsx',
  'components/EditionLinkPicker.jsx',
  'components/MetronFind.jsx',
  'components/PlayJournal.jsx',
  'components/TagPicker.jsx',
]
const LEGACY = new Set([
  'btn',
  'chip',
  'panel',
  'link-button',
  'sm',
  'danger',
  'ghost',
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

describe('admin data pages and the legacy look', () => {
  for (const file of FILES) {
    it(`${file} has no legacy btn, chip, panel or link-button class`, () => {
      const text = readFileSync(resolve(cwd(), 'src', file), 'utf8')
      expect(legacyClasses(text)).toEqual([])
    })
  }

  it('catches a legacy class in a plain or template className', () => {
    expect(legacyClasses('<a className="btn sm">x</a>')).toEqual(['btn', 'sm'])
    expect(legacyClasses('<a className={`${a} link-button`}>x</a>')).toEqual([
      'link-button',
    ])
    expect(legacyClasses('<a className={btn()}>x</a>')).toEqual([])
  })

  // The legacy `.item-detail-form label` rule is gone, so a label with no
  // class is 16px ink with no phone target (#535 review).
  for (const file of FILES) {
    it(`${file}: every <label> carries a class`, () => {
      const text = readFileSync(resolve(cwd(), 'src', file), 'utf8')
      const bare = [...text.matchAll(/<label\b[^>]*>/g)]
        .map((m) => m[0])
        .filter((tag) => !/className=/.test(tag))
      expect(bare).toEqual([])
    })
  }

  // A link in running text with no underline is told from the words around
  // it by colour alone (axe link-in-text-block, serious). Every link in these
  // files names a class: TEXT_LINK for text, a button look for a button.
  for (const file of FILES) {
    it(`${file}: every link carries a class`, () => {
      const text = readFileSync(resolve(cwd(), 'src', file), 'utf8')
      const bare = [...text.matchAll(/<(Link|a)\b[^>]*>/g)]
        .map((m) => m[0])
        .filter((tag) => !/className=/.test(tag))
      expect(bare).toEqual([])
    })
  }

  it('TEXT_LINK underlines', () => {
    expect(TEXT_LINK.split(/\s+/)).toContain('underline')
  })

  it('every field takes a 44px phone target', () => {
    for (const look of [FIELD, FIELD_AUTO, FIELD_CELL])
      expect(look).toContain('max-[700px]:min-h-11')
  })
})
