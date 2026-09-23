import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import PosterCard from './PosterCard.jsx'

const ITEM = {
  id: '1',
  type: 'game',
  title: 'Hades',
  year: 2020,
  creator: 'Supergiant Games',
  cover_url: 'https://images.igdb.com/a.jpg',
  status: 'finished',
  rating: 9,
  favorite: true,
}

function renderCard(props = {}) {
  return render(
    <MemoryRouter>
      <PosterCard item={ITEM} to="/collection/1" {...props} />
    </MemoryRouter>,
  )
}

describe('PosterCard', () => {
  it('links the poster and the title together to the given page', () => {
    renderCard()
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', '/collection/1')
    expect(link).toHaveTextContent('Hades')
    expect(link.querySelector('.cover')).not.toBeNull()
  })

  // A button inside an anchor is invalid, and clicking it would navigate.
  it('renders actions as a sibling of the link, never inside it', () => {
    renderCard({ actions: () => <button type="button">Rate</button> })
    expect(screen.getByRole('button', { name: 'Rate' }).closest('a')).toBeNull()
  })

  it('passes the item to the actions render prop', () => {
    renderCard({ actions: (item) => <span>actions for {item.title}</span> })
    expect(screen.getByText('actions for Hades')).toBeInTheDocument()
  })

  it('marks the status as a named image', () => {
    renderCard()
    expect(screen.getByRole('img', { name: 'Finished' })).toHaveClass(
      'status-mark',
    )
  })

  it('calls the active status Playing', () => {
    renderCard({ item: { ...ITEM, status: 'active' } })
    expect(screen.getByRole('img', { name: 'Playing' })).toBeInTheDocument()
  })

  // The absence of a mark is the backlog signal.
  it('gives backlog no mark', () => {
    const { container } = renderCard({ item: { ...ITEM, status: 'backlog' } })
    expect(container.querySelector('.status-mark')).toBeNull()
  })

  it('shows the heart only for a favourite', () => {
    renderCard()
    expect(screen.getByRole('img', { name: 'Favourite' })).toBeInTheDocument()
  })

  it('shows no heart for an item that is not a favourite', () => {
    renderCard({ item: { ...ITEM, favorite: false } })
    expect(
      screen.queryByRole('img', { name: 'Favourite' }),
    ).not.toBeInTheDocument()
  })

  it('shows stars and the year and creator beneath the poster', () => {
    renderCard()
    expect(screen.getByRole('img', { name: '9 out of 10' })).toBeInTheDocument()
    expect(screen.getByText('2020 · Supergiant Games')).toBeInTheDocument()
  })

  it('sets data-dimmed only when dimmed', () => {
    const { container, rerender } = renderCard({ dimmed: true })
    expect(container.querySelector('.poster-card')).toHaveAttribute(
      'data-dimmed',
    )
    rerender(
      <MemoryRouter>
        <PosterCard item={ITEM} to="/collection/1" />
      </MemoryRouter>,
    )
    expect(container.querySelector('.poster-card')).not.toHaveAttribute(
      'data-dimmed',
    )
  })
})
