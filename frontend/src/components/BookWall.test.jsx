import '@testing-library/jest-dom'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { axeViolations } from '../lib/axe.test-util.js'
import bookLine from '../../e2e/fixtures/api/public-comic-book_line.json'
import both from '../../e2e/fixtures/api/public-comic-both.json'
import BookWall from './BookWall.jsx'

// Bodies come from the backend's own PublicItemDetailOut
// (backend/scripts/export_public_comic_fixtures.py).
const SERIES = { id: bookLine.id, title: bookLine.title }

function draw(comic = bookLine.comic, series = SERIES) {
  return render(
    <MemoryRouter>
      <BookWall comic={comic} series={series} />
    </MemoryRouter>,
  )
}

const tiles = () =>
  [...document.querySelectorAll('.cover-wall-grid > *')].map((tile) => [
    tile.tagName,
    tile.dataset.state,
    tile.textContent,
  ])

describe('BookWall', () => {
  it('draws the line in order: owned, a hollow gap, owned, then the unnumbered book', () => {
    draw()
    expect(tiles()).toEqual([
      ['A', 'read', 'Vol. 1Read ✓'],
      ['A', 'owned', 'Vol. 2Owned'],
      ['DIV', 'missing', 'Vol. 3not owned'],
      ['A', 'owned', 'Vol. 4Owned'],
      ['A', 'owned', 'Lantern Tales: OriginsOwned'],
    ])
  })

  it('links an owned book to its page and names it with its state', () => {
    draw()
    expect(
      screen.getByRole('link', { name: 'Lantern Tales, Book Two, Owned' }),
    ).toHaveAttribute('href', `/shelf/${bookLine.id}/vol-2/`)
    expect(
      screen.getByRole('link', { name: 'Lantern Tales, Book One, Read' }),
    ).toHaveAttribute('href', `/shelf/${bookLine.id}/vol-1/`)
  })

  it('draws a missing place as a plain block whose state is a word, not a link', () => {
    draw()
    const gap = document.querySelector('[data-state="missing"]')
    expect(gap.tagName).toBe('DIV')
    expect(gap).toHaveTextContent('not owned')
    expect(within(gap).queryByRole('link')).toBeNull()
    expect(
      screen.getByRole('group', { name: 'Vol. 3, not owned' }),
    ).toBeInTheDocument()
  })

  it('says what is owned in words and nothing about the size of the line', () => {
    draw()
    expect(
      screen.getByText('I have Vol. 1, 2 and 4, and 1 book with no number.'),
    ).toBeInTheDocument()
    expect(screen.queryByText(/ of \d/)).toBeNull()
  })

  it('lists plain book tiles in order when no book has a number', () => {
    draw({
      ...bookLine.comic,
      slots: [],
      volumes: bookLine.comic.volumes.map((v) => ({ ...v, line_number: null })),
    })
    expect(tiles().map(([, state]) => state)).toEqual([
      'read',
      'owned',
      'owned',
      'owned',
    ])
    expect(screen.getByText('I have 4 books.')).toBeInTheDocument()
  })

  it('says Vol. 3 for one numbered book', () => {
    draw({ ...both.comic, slots: [], volumes: [both.comic.volumes[1]] })
    expect(screen.getByText('I have Vol. 3.')).toBeInTheDocument()
  })

  it('has no axe violations', async () => {
    const { container } = draw()
    expect(await axeViolations(container)).toEqual([])
  })
})
