// @vitest-environment node
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Read from disk: Vitest stubs CSS imports, `?raw` included.
const here = dirname(fileURLToPath(import.meta.url))
const css = readFileSync(join(here, 'index.css'), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
)

/** Every selector in the sheet, split out of its rule's selector list. */
const selectors = new Set(
  [...css.matchAll(/([^{}]+)\{/g)].flatMap((m) =>
    m[1].split(',').map((s) => s.trim().replace(/\s+/g, ' ')),
  ),
)

/** The pages that draw their own look (#533): a rule for these classes is
 *  dead weight, and a copy of it would pull the pages two ways. The markup
 *  keeps the class names as hooks (tests and e2e read them), not as styles. */
const MIGRATED = [
  '.crumbs ol',
  '.crumbs-bar',
  '.crumbs-end',
  '.item-head',
  '.item-heading',
  '.item-groups',
  '.item-copy',
  '.item-edit',
  '.item-status',
  '.item-kicker',
  '.item-similar h2',
  '.comic-sum',
  '.comic-next',
  '.comic-hero-next',
  '.comic-issue-main',
  '.comic-issue-facts',
  '.comic-issue-owner',
  '.volume-collects',
  '.issue-neighbours',
  '.year-numbers',
  '.year-diary',
  '.month-days',
  '.year-nav',
]

describe('shelf detail pages carry their look in utilities (#533)', () => {
  it.each(MIGRATED)('has no legacy rule for %s', (selector) => {
    const found = [...selectors].filter(
      (s) =>
        s === selector ||
        s.startsWith(`${selector} `) ||
        s.startsWith(`${selector}:`) ||
        s.startsWith(`${selector}.`) ||
        s.startsWith(`${selector}[`),
    )
    expect(found).toEqual([])
  })
})

describe('the detail pages hold their measures in utilities (#533)', () => {
  const classes = readFileSync(
    join(here, 'components/detail-classes.js'),
    'utf8',
  )
  const strings = Object.fromEntries(
    [...classes.matchAll(/export const (\w+) =\s*\n?\s*'([^']*)'/g)].map(
      (m) => [m[1], m[2]],
    ),
  )

  it.each(['DIARY'])('%s is held to the 45rem column', (name) => {
    expect(strings[name]).toContain('max-w-[45rem]')
  })

  it('caps a description at the reading measure', () => {
    expect(strings.DESCRIPTION).toContain('max-w-[min(45rem,68ch)]')
  })

  it("holds What's next to the 45rem column", () => {
    expect(strings.DETAIL_BELOW).toContain('max-w-[45rem]')
  })
})

describe('phone tap targets (#533)', () => {
  const read = (path) => readFileSync(join(here, path), 'utf8')
  it('keeps 44px on the controls that were 44px with the legacy rules', () => {
    expect(read('components/detail-classes.js')).toMatch(
      /PHONE_TARGET = 'max-\[700px\]:min-h-11'/,
    )
    for (const file of [
      'pages/Item.jsx',
      'pages/ComicIssue.jsx',
      'pages/ComicVolume.jsx',
      'pages/YearInReview.jsx',
      'components/OwnerControls.jsx',
    ]) {
      expect(read(file), file).toContain('PHONE_TARGET')
    }
  })
})
