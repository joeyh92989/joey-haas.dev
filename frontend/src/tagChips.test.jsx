import '@testing-library/jest-dom'
import { render, screen, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import CandidateCard from './components/CandidateCard.jsx'
import SpotForm from './components/SpotForm.jsx'
import PlaceFields from './components/places/PlaceFields.jsx'
import { TAG_LABELS, TAGS } from './content/denver.js'

// The 20-tag vocabulary (#351) on a 400px phone: every tag has a chip, and
// every chip row wraps instead of running sideways off the page.

const here = dirname(fileURLToPath(import.meta.url))
// Read from disk: Vitest stubs CSS imports.
const css = readFileSync(join(here, 'index.css'), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
)

/** Every top-level or @media rule body for a selector, in source order. */
function declared(selector, property) {
  const found = []
  const re = /([^{}]+)\{([^{}]*)\}/g
  let match
  while ((match = re.exec(css))) {
    const selectors = match[1].split(',').map((s) => s.trim())
    if (!selectors.includes(selector)) continue
    const value = match[2].match(
      new RegExp(`(?:^|[;\\s])${property}:\\s*([^;]+)`),
    )
    if (value) found.push({ at: match.index, value: value[1].trim() })
  }
  return found
}

function lastValue(selector, property) {
  return declared(selector, property).at(-1)?.value
}

function everyTagIsAButton(root) {
  expect(TAGS).toHaveLength(20)
  for (const tag of TAGS) {
    expect(
      within(root).getByRole('button', { name: TAG_LABELS[tag] }),
    ).toBeVisible()
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
  // `.chip-row` is a sideways-scrolling strip under 34rem; these rows must
  // opt out, and the opt-out must come later in the file than the strip.
  const stripAt = Math.max(
    ...declared('.chip-row', 'flex-wrap')
      .filter((rule) => rule.value === 'nowrap')
      .map((rule) => rule.at),
  )

  it.each(['.chip-row.denver-chips', '.spot-form .chip-row'])(
    '%s wraps, after the phone strip rule',
    (selector) => {
      const wraps = declared(selector, 'flex-wrap')
      expect(wraps.at(-1)?.value).toBe('wrap')
      expect(wraps.at(-1).at).toBeGreaterThan(stripAt)
      expect(lastValue(selector, 'overflow-x')).toBe('visible')
      expect(lastValue(selector, 'max-width')).toBe('100%')
      expect(lastValue(selector, 'min-width')).toBe('0')
    },
  )

  it.each(['.place-col .chip-row', '.cand-tags'])('%s wraps', (selector) => {
    expect(lastValue(selector, 'flex-wrap')).toBe('wrap')
  })
})
