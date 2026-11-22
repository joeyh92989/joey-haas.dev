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
import { field, textarea } from './components/closetClasses.js'
import {
  BIG_FIELD,
  bigBtn,
  ibtn,
  INTAKE_FIELD,
  PHONE_ROW,
  TILE,
} from './components/addClasses.js'
import { PHONE_ROW as CLOSET_PHONE_ROW } from './components/closetClasses.js'
import { INTAKE_KIND, INTAKE_UNFINISHED } from './components/intakeClasses.js'
import { RADAR_CARD, RATE_A_FEW } from './components/playNextClasses.js'
import { readCss } from './testing/readCss.js'

// The Add, sitting, Discover, Radar and Pull list pages (#535, slice c) are
// drawn from the Button and Card looks. These tests pin what the look must
// keep: no legacy `.btn`/`.chip` class on these pages, a phone tap target on
// every control, an armed Discard that reads as destructive, a disabled tile
// that is not told apart by fading alone, and the legacy rules gone.

const here = dirname(fileURLToPath(import.meta.url))
// Read from disk: Vitest stubs CSS imports.
const read = (path) => readFileSync(join(here, path), 'utf8')
const css = readCss()

const OWNED = [
  'components/WrapUpSheet.jsx',
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
    // The intake tile and list are utilities now: their own strings carry no
    // surface (it comes from TILE and BOX).
    for (const classes of [INTAKE_KIND, INTAKE_UNFINISHED])
      expect(classes).not.toMatch(/(^| )(bg-|border|rounded)/)
    // Radar's card and Rate a few are utilities now (#536 G1): their own
    // strings carry the layout and the padding, never a surface (BOX).
    for (const classes of [RADAR_CARD, RATE_A_FEW])
      expect(classes).not.toMatch(/(^| )(bg-|border|rounded)/)
    for (const selector of ['.radar-card', '.rate-a-few'])
      expect(ruleOf(selector), selector).toBeNull()
    expect(css).not.toContain('.pull-list .next-row-actions button')
    expect(css).not.toContain('.pull-list-search-form button')
  })

  it('derives its field sizes from the field look, and the swap took effect', () => {
    // A reorder of FIELD_LOOK would leave `replace` a no-op: say so here.
    expect(field).toContain('h-10 ')
    expect(BIG_FIELD).toContain('h-11 ')
    expect(BIG_FIELD).not.toContain('h-10 ')
    expect(INTAKE_FIELD).toContain('max-[900px]:h-11')
    expect(textarea).toContain('min-h-16 ')
    expect(textarea).not.toContain('h-10 ')
  })

  it('has one PHONE_ROW', () => {
    expect(PHONE_ROW).toBe(CLOSET_PHONE_ROW)
  })

  it('draws every armed destructive confirm as the destructive button', () => {
    const confirms = [
      ['components/intake/UnfinishedList.jsx', 'Yes, discard', 1],
      ['components/intake/AddSection.jsx', 'Yes, discard', 1],
      ['components/intake/GarmentCheck.jsx', 'Yes, remove', 2],
      ['components/intake/LinkCheck.jsx', '{words.removeYes}', 1],
      ['components/intake/SeedCheck.jsx', '{words.dontOwnYes}', 1],
    ]
    for (const [file, text, count] of confirms) {
      const source = read(file)
      let found = 0
      for (
        let at = source.indexOf(text);
        at >= 0;
        at = source.indexOf(text, at + 1)
      ) {
        const open = source.lastIndexOf('<button', at)
        expect(source.slice(open, at), `${file}: ${text}`).toContain(
          "ibtn('danger'",
        )
        found++
      }
      expect(found, `${file}: ${text}`).toBe(count)
    }
  })
})
