// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { CHIP_COUNT } from './components/chipClasses.js'
import { HEAD_LINK } from './components/adminHomeClasses.js'

const here = dirname(fileURLToPath(import.meta.url))

describe('American spelling in admin copy (#505)', () => {
  const copyFiles = readdirSync(join(here, 'content'))
    .filter((name) => name.endsWith('.js') && !name.includes('.test.'))
    .map((name) => join('content', name))
  const files = [
    ...copyFiles,
    join('components', 'GarmentForm.jsx'),
    join('components', 'GarmentProductPanel.jsx'),
    join('components', 'intake', 'LinkCheck.jsx'),
  ]

  it.each(files)('%s has no British colour', (file) => {
    const source = readFileSync(join(here, file), 'utf8')
    expect(source.match(/\w*colour\w*/gi) ?? []).toEqual([])
  })
})

describe('admin tap targets reach 24px (#505, WCAG 2.5.8)', () => {
  // The plain text link in a header's right-hand slot ("View /shelf/games")
  // carried its floor as a legacy rule (`.admin-head-end a:not(.btn)`); it is
  // the HEAD_LINK utilities now (#536), on the two pages that draw one.
  it('gives the header text link a 24px floor and an inline-block box', () => {
    expect(HEAD_LINK).toContain('min-h-6')
    expect(HEAD_LINK).toContain('inline-block')
  })

  it.each(['AdminCollection', 'AdminComics'])(
    '%s draws its "View" link with HEAD_LINK',
    (page) => {
      const source = readFileSync(join(here, 'pages', `${page}.jsx`), 'utf8')
      expect(source).toContain('className={HEAD_LINK}')
    },
  )
})

describe('phone chip count keeps its space (#505)', () => {
  // A chip is inline-flex on a phone, and a flex container drops the
  // whitespace text between the label and the count span: "Active1".
  it('spaces the count from the label with a margin, not a text node', () => {
    expect(CHIP_COUNT).toContain('[@media(max-width:700px)]:ms-1')
  })

  it('puts the count class on every count a chip draws', () => {
    for (const file of [
      'components/FilterChips.jsx',
      'components/CoverWall.jsx',
      'pages/Denver.jsx',
      'pages/PlayNext.jsx',
    ]) {
      expect(readFileSync(join(here, file), 'utf8'), file).toContain(
        'CHIP_COUNT',
      )
    }
  })
})
