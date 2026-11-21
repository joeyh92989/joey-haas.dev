import '@testing-library/jest-dom'
import { render, screen, within } from '@testing-library/react'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import KindTile from './components/intake/KindTile.jsx'
import UnfinishedList from './components/intake/UnfinishedList.jsx'
import RecommendationCard from './components/RecommendationCard.jsx'
import { bigBtn, ibtn, TILE } from './components/addClasses.js'

// The Add, sitting, Discover, Radar and Pull list pages (#535, slice c) are
// drawn from the Button and Card looks. These tests pin what the look must
// keep: no legacy `.btn`/`.chip` class on these pages, a phone tap target on
// every control, an armed Discard that reads as destructive, a disabled tile
// that is not told apart by fading alone, and the legacy rules gone.

const here = dirname(fileURLToPath(import.meta.url))
// Read from disk: Vitest stubs CSS imports.
const read = (path) => readFileSync(join(here, path), 'utf8')
const css = read('index.css')

const OWNED = [
  'components/intake',
  'components/NowPlaying.jsx',
  'components/RateAFew.jsx',
  'components/RecommendationCard.jsx',
  'pages/AdminDiscover.jsx',
  'pages/AdminRadar.jsx',
  'pages/AdminPullList.jsx',
]

function sources() {
  const out = []
  for (const entry of OWNED) {
    const path = join(here, entry)
    const files = entry.endsWith('.jsx')
      ? [path]
      : readdirSync(path).map((name) => join(path, name))
    for (const file of files)
      if (file.endsWith('.jsx') && !file.includes('.test.')) out.push(file)
  }
  return out
}

/** The body of the first `selector {` rule in the stylesheet, or null. */
function ruleOf(selector) {
  const start = css.indexOf(`\n${selector} {`)
  return start < 0 ? null : css.slice(start, css.indexOf('}', start))
}

describe('Add and recommend pages, on the Button and Card looks', () => {
  it('draw no control with the legacy .btn or .chip class', () => {
    const offenders = sources().filter((file) =>
      /className="([^"]* )?(btn|chip)( [^"]*)?"/.test(
        readFileSync(file, 'utf8'),
      ),
    )
    expect(offenders).toEqual([])
  })

  it('give every intake button 44px up to 900px, and small ones on a phone', () => {
    expect(ibtn('primary')).toContain('max-[900px]:min-h-11')
    expect(ibtn('plain', 'sm')).toContain('max-[700px]:min-h-11')
    expect(bigBtn('plain')).toContain('min-h-11')
  })

  it('draws a kind tile as a card, dashed when it cannot start', () => {
    render(
      <KindTile
        kind={{ key: 'boardgame', label: 'Board game', ways_in: ['type'] }}
        onStart={() => {}}
      />,
    )
    const tile = screen.getByRole('button')
    expect(tile).toBeDisabled()
    expect(tile.className).toContain('rounded-md')
    expect(tile.className).toContain('disabled:border-dashed')
    // Dimmed ink would drop under 4.5:1: the dashed border says it instead.
    expect(TILE).not.toMatch(/disabled:(opacity|text-)/)
  })

  it('draws the armed Discard as the destructive button', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    render(
      <MemoryRouter>
        <UnfinishedList
          sittings={[
            {
              id: 's1',
              kind: 'game',
              label: 'Longbox',
              photos: 2,
              entries: {},
            },
          ]}
          kinds={{ game: { label: 'Game' } }}
          base="/admin/collection/add"
          onDiscard={() => {}}
        />
      </MemoryRouter>,
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'Discard Longbox' }),
    )
    const armed = screen.getByRole('button', { name: 'Yes, discard' })
    expect(armed.className).toContain('border-destructive')
    expect(screen.getByRole('button', { name: 'Keep it' }).className).toContain(
      'max-[700px]:min-h-11',
    )
  })

  it('draws a suggestion as a card with phone-sized answers', () => {
    const { container } = render(
      <RecommendationCard
        row={{
          id: 'r1',
          title: 'Hades',
          reasons: [],
          store_lines: [],
          cover_url: null,
        }}
        when="2026"
        busy={false}
        onAnswer={() => {}}
      />,
    )
    expect(container.querySelector('article').className).toContain('rounded-md')
    const buttons = within(container).getAllByRole('button')
    expect(buttons).toHaveLength(3)
    for (const button of buttons)
      expect(button.className).toContain('max-[700px]:min-h-11')
  })

  it('leaves no hand-written surface on the cards, or buttons in the CSS', () => {
    for (const selector of [
      '.intake-kind',
      '.intake-unfinished',
      '.radar-card',
      '.rate-a-few',
    ]) {
      const rule = ruleOf(selector)
      expect(rule, selector).not.toBeNull()
      expect(rule, selector).not.toMatch(/background:|border:|border-radius:/)
    }
    expect(css).not.toContain('.radar-actions button')
    expect(css).not.toContain('.rate-a-few-actions button')
    expect(css).not.toContain('.pull-list .next-row-actions button')
    expect(css).not.toContain('.pull-list-search-form button')
  })
})
