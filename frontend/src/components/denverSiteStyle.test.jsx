import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import CandidateCard from './CandidateCard.jsx'
import RangeControl from './RangeControl.jsx'
import SectionCard from './SectionCard.jsx'
import SuggestionCard from './SuggestionCard.jsx'

// The Denver and Site admin pages (#535, slice 3) draw from the Button, Card
// and Input looks. The legacy `.btn`, `.chip`, `.panel` and the old table and
// form classes stay for the areas not yet migrated (#536), so each migrated
// file is pinned not to use them; the rendered controls are pinned to carry
// the Button look's focus ring.

const here = dirname(fileURLToPath(import.meta.url))
const read = (path) => readFileSync(join(here, '..', path), 'utf8')
// Read from disk: Vitest stubs CSS imports.
const css = read('index.css')

const FILES = [
  'pages/AdminWeekend.jsx',
  'pages/AdminSpots.jsx',
  'pages/AdminAnalytics.jsx',
  'components/SuggestionCard.jsx',
  'components/WeatherPanel.jsx',
  'components/CandidateCard.jsx',
  'components/SpotFinder.jsx',
  'components/SpotForm.jsx',
  'components/RangeControl.jsx',
]
const LEGACY =
  /\b(btn|chip|chip-row|panel|minitag|item-table|item-table-wrap|item-detail-form|item-detail-actions|range-control)\b/

/** Every class name written in a file: className strings and template parts. */
function classNames(text) {
  return [...text.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)].map(
    (m) => m[1] ?? m[2],
  )
}

describe('Denver and Site pages and the legacy look', () => {
  for (const file of FILES) {
    it(`${file} has no legacy button, chip, panel, table or form class`, () => {
      const bad = classNames(read(file)).filter((value) => LEGACY.test(value))
      expect(bad).toEqual([])
    })
  }

  it('the pages use SectionCard, not the shared Panel', () => {
    for (const file of [
      'pages/AdminWeekend.jsx',
      'pages/AdminSpots.jsx',
      'pages/AdminAnalytics.jsx',
      'components/WeatherPanel.jsx',
    ]) {
      expect(read(file)).not.toMatch(/from '(\.\.\/components|\.)\/Panel\.jsx'/)
    }
  })

  it('the rules only these pages read are gone from index.css', () => {
    for (const selector of [
      '.range-control',
      '.spots-search',
      '.spots-pill',
      '.spots-anchor',
      '.spot-form-wrap',
      '.minitag',
      '.cand-src',
      '.wk-pills li',
      '.sug-tag',
      '.analytics > .panel',
    ]) {
      expect(css, selector).not.toContain(`${selector} {`)
    }
  })

  it('cards and suggestions take their surface from the Card look', () => {
    for (const selector of ['.sug', '.cand']) {
      const block = css.match(new RegExp(`\\n\\${selector} \\{[^}]*\\}`))?.[0]
      expect(block ?? '', selector).not.toMatch(/background|border/)
    }
  })

  it('the spots table scrolls in a positioned wrapper that pads its focus', () => {
    // Positioned, so a visually hidden label cannot escape it and widen the
    // page; scroll padding, so a focused control is not scrolled flush against
    // the edge, where the wrapper would clip its ring.
    expect(read('pages/AdminSpots.jsx')).toMatch(
      /className="relative overflow-x-auto scroll-px-4"/,
    )
  })

  it('every grid these pages lay out lets its columns shrink', () => {
    for (const selector of ['.finder-layout', '.wx-days', '.wk-foot']) {
      const block = css.match(new RegExp(`\\n\\${selector}[^{]*\\{[^}]*\\}`))
      expect(block?.[0], selector).toMatch(/minmax\(0, \d+fr\)/)
    }
  })
})

const RING = 'focus-visible:outline-ring'
// #276: a phone tap target is 44px; the legacy rule that said so no longer
// reaches a utility-styled control.
const TAP = 'max-[700px]:min-h-11'

describe('controls carry the Button look', () => {
  it('RangeControl buttons draw the ring and mark the pressed one', () => {
    render(<RangeControl value="30d" onChange={() => {}} />)
    for (const button of screen.getAllByRole('button')) {
      expect(button.className).toContain(RING)
      expect(button.className).toContain(TAP)
    }
    expect(screen.getByRole('button', { name: '30d' }).className).toContain(
      'aria-pressed:border-foreground',
    )
  })

  it('SuggestionCard buttons draw the ring', () => {
    render(
      <SuggestionCard
        suggestion={{
          slot_key: 'a',
          slot: 'Best bet',
          when: 'Saturday',
          spot_id: 's',
          name: 'Corvus',
          tags: ['coffee'],
          distance: '1 mi',
          reasons: ['Dry'],
          saved: false,
        }}
        onSave={vi.fn()}
        onUnsave={vi.fn()}
        onBeen={vi.fn()}
        onSkip={vi.fn()}
      />,
    )
    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(3)
    for (const button of buttons) {
      expect(button.className).toContain(RING)
      expect(button.className).toContain(TAP)
    }
  })

  it('CandidateCard buttons and tag toggles draw the ring', () => {
    render(
      <ul>
        <CandidateCard
          candidate={{ id: 'c1', name: 'Place', suggested_tags: ['coffee'] }}
          busy={false}
          onAccept={vi.fn()}
          onDismiss={vi.fn()}
        />
      </ul>,
    )
    const buttons = screen.getAllByRole('button')
    expect(buttons.length).toBeGreaterThan(3)
    for (const button of buttons) {
      expect(button.className).toContain(RING)
      expect(button.className).toContain(TAP)
    }
  })
})

describe('SectionCard', () => {
  it('is a region named by its heading, with the action beside it', () => {
    render(
      <SectionCard title="Pages" action={<span>views</span>} className="x">
        <p>body</p>
      </SectionCard>,
    )
    const region = screen.getByRole('region', { name: 'Pages' })
    expect(region).toHaveClass('border-border')
    expect(region).not.toHaveClass('panel')
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Pages')
    expect(screen.getByText('views')).toBeInTheDocument()
    expect(screen.getByText('body').parentElement).toHaveClass('x')
  })

  it('ignores the global sibling-section margin', () => {
    render(
      <SectionCard title="T">
        <p>b</p>
      </SectionCard>,
    )
    expect(screen.getByRole('region').className).toContain('mt-0')
  })

  it('does not clip a ring at its edge', () => {
    render(
      <SectionCard title="T">
        <p>b</p>
      </SectionCard>,
    )
    expect(screen.getByRole('region').className).not.toMatch(/overflow-/)
  })
})
