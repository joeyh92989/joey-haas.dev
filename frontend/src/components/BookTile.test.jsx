import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import BookTile, { shortEditionLabel } from './BookTile.jsx'

const SERIES = { id: 'abc', title: 'Saga' }
const book = (over = {}) => ({
  kind: 'book',
  slug: 'ed-1-6',
  edition: { label: 'Volume One', from: 1, to: 6, kind: 'Trade paperback' },
  cover_url: null,
  readTo: null,
  ...over,
})

function show(tile) {
  return render(
    <MemoryRouter>
      <BookTile tile={tile} series={SERIES} />
    </MemoryRouter>,
  )
}

describe('BookTile', () => {
  it('links to the edition with the short label and range as its caption', () => {
    show(book())
    const link = screen.getByRole('link', {
      name: 'Volume One, collects #1–6',
    })
    expect(link).toHaveAttribute('href', '/shelf/abc/ed-1-6/')
    expect(screen.getByText('Vol. One')).toBeInTheDocument()
    expect(screen.getByText('#1–6')).toBeInTheDocument()
  })

  it('says how far a partly read book is read', () => {
    show(book({ readTo: 4 }))
    expect(screen.getByText('#1–6 · read to 4')).toBeInTheDocument()
  })

  it('shortens only a leading "Volume"', () => {
    expect(shortEditionLabel('Volume Two')).toBe('Vol. Two')
    expect(shortEditionLabel('Deluxe Volume 2')).toBe('Deluxe Volume 2')
    expect(shortEditionLabel('Compendium')).toBe('Compendium')
  })
})
