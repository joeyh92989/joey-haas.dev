import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import RangeControl from './RangeControl.jsx'
import SectionCard from './SectionCard.jsx'
import { readCss } from '../testing/readCss.js'

// The Site admin pages (#535, slice 3) draw from the Button, Card
// and Input looks. The legacy `.btn`, `.chip`, `.panel` and the old table and
// form classes stay for the areas not yet migrated (#536), so each migrated
// file is pinned not to use them; the rendered controls are pinned to carry
// the Button look's focus ring.

const here = dirname(fileURLToPath(import.meta.url))
const read = (path) => readFileSync(join(here, '..', path), 'utf8')
// Read from disk: Vitest stubs CSS imports.
const css = readCss()

const FILES = ['pages/AdminAnalytics.jsx', 'components/RangeControl.jsx']
const LEGACY =
  /\b(btn|chip|chip-row|panel|minitag|item-table|item-table-wrap|item-detail-form|item-detail-actions|range-control)\b/

/** Every class name written in a file: className strings and template parts. */
function classNames(text) {
  return [...text.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)].map(
    (m) => m[1] ?? m[2],
  )
}

describe('Site pages and the legacy look', () => {
  for (const file of FILES) {
    it(`${file} has no legacy button, chip, panel, table or form class`, () => {
      const bad = classNames(read(file)).filter((value) => LEGACY.test(value))
      expect(bad).toEqual([])
    })
  }

  it('the pages use SectionCard, not the shared Panel', () => {
    expect(read('pages/AdminAnalytics.jsx')).not.toMatch(
      /from '(\.\.\/components|\.)\/Panel\.jsx'/,
    )
  })

  it('the rules only these pages read are gone from the stylesheets', () => {
    for (const selector of [
      '.range-control',
      '.minitag',
      '.cand-src',
      '.wk-pills li',
      '.sug-tag',
      '.analytics > .panel',
    ]) {
      expect(css, selector).not.toContain(`${selector} {`)
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
