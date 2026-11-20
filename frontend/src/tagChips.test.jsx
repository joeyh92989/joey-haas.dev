import '@testing-library/jest-dom'
import { render, screen, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import CandidateCard from './components/CandidateCard.jsx'
import SpotForm from './components/SpotForm.jsx'
import PlaceFields from './components/places/PlaceFields.jsx'
import { EXPECTED_TAG_LABELS } from './tagLabels.fixture.js'
import { TAGS } from './content/denver.js'

// The 20-tag vocabulary (#351) on a 400px phone: every tag has a chip, and
// every chip row wraps instead of running sideways off the page.

const here = dirname(fileURLToPath(import.meta.url))
// Read from disk: Vitest stubs CSS imports.
const css = readFileSync(join(here, 'index.css'), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
)

/** Every `selector { body }` pair with the @media prelude it sits in, or null. */
const rules = []
{
  const stack = []
  let start = 0
  for (let i = 0; i < css.length; i++) {
    if (css[i] === '{') {
      const prelude = css.slice(start, i).trim()
      stack.push({ prelude, atRule: prelude.startsWith('@'), from: i + 1 })
      start = i + 1
    } else if (css[i] === '}') {
      const open = stack.pop()
      if (open && !open.atRule) {
        const media = stack.find((entry) => entry.atRule)?.prelude ?? null
        for (const selector of open.prelude.split(',')) {
          rules.push({
            selector: selector.trim().replace(/\s+/g, ' '),
            body: css.slice(open.from, i),
            media,
          })
        }
      }
      start = i + 1
    }
  }
}

/** The declarations of a selector's rules outside every @media query. */
function always(selector) {
  const bodies = rules
    .filter((rule) => rule.selector === selector && rule.media === null)
    .map((rule) => rule.body)
  expect(bodies.length, `a top-level rule for ${selector}`).toBeGreaterThan(0)
  return bodies.join('\n')
}

function everyTagIsAButton(root) {
  expect(TAGS).toHaveLength(20)
  for (const label of EXPECTED_TAG_LABELS) {
    expect(within(root).getByRole('button', { name: label })).toBeVisible()
  }
}

describe('all 20 tags, as controls', () => {
  it('SpotForm offers each one', () => {
    render(<SpotForm onSaved={vi.fn()} onCancel={vi.fn()} />)
    everyTagIsAButton(screen.getByRole('group', { name: 'Tags' }))
  })

  it('PlaceFields offers each one', () => {
    render(
      <PlaceFields
        values={{
          city: 'denver',
          otherCity: '',
          tags: [],
          blurb: '',
          isPublic: false,
        }}
        onChange={vi.fn()}
        cities={[]}
      />,
    )
    const rows = screen.getAllByRole('group')
    everyTagIsAButton(rows.find((row) => within(row).queryByText('Coffee')))
  })

  it('CandidateCard offers each one', () => {
    render(
      <ul>
        <CandidateCard
          candidate={{
            id: 'k1',
            source: 'osm',
            source_id: 'node/1',
            name: 'Cafe',
            category: 'cafe',
            distance: '0.6 mi',
            fit: 80,
            reason: 'Near.',
            suggested_tags: [],
          }}
          busy={false}
          onAccept={vi.fn()}
          onDismiss={vi.fn()}
        />
      </ul>,
    )
    everyTagIsAButton(screen.getByRole('list', { name: /Tags/ }))
  })
})

describe('chip rows wrap at 400px', () => {
  // `.chip-row` is a sideways-scrolling strip under 34rem; every row that
  // holds the 20 tags must opt out at all widths, not inside a media query.
  it('has the strip these rows opt out of', () => {
    const strip = rules.find(
      (rule) =>
        rule.selector === '.chip-row' &&
        rule.media === '@media (max-width: 34rem)' &&
        /flex-wrap:\s*nowrap/.test(rule.body),
    )
    expect(strip).toBeTruthy()
  })

  it.each([
    '.chip-row.denver-chips',
    '.spot-form .chip-row',
    '.place-col .chip-row',
    '.spots-addbar .chip-row',
  ])('%s wraps and does not scroll', (selector) => {
    const body = always(selector)
    expect(body).toMatch(/flex-wrap:\s*wrap;/)
    expect(body).toMatch(/overflow-x:\s*visible;/)
  })

  it('lets the two shared rows shrink inside their parent', () => {
    for (const selector of ['.chip-row.denver-chips', '.spot-form .chip-row']) {
      expect(always(selector)).toMatch(/max-width:\s*100%;/)
      expect(always(selector)).toMatch(/min-width:\s*0;/)
    }
  })

  it('wraps the finder tag list', () => {
    expect(always('.cand-tags')).toMatch(/flex-wrap:\s*wrap;/)
  })
})
