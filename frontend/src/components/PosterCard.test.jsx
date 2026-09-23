import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
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

describe('PosterCard copy marks', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  const SWITCH_2 = { ...ITEM, platform: 'Nintendo Switch 2' }

  it.each([
    ['game_key_card', 'Game-Key Card'],
    ['code_in_box', 'Code in a box'],
  ])('marks a %s copy', (format, name) => {
    renderCard({ item: { ...SWITCH_2, physical_format: format } })
    expect(screen.getByRole('img', { name })).toHaveClass('format-mark')
  })

  // An unrecorded Switch 2 format must not look like a full cartridge.
  it('marks a Switch 2 copy with no recorded format as unknown', () => {
    renderCard({ item: { ...SWITCH_2, physical_format: null } })
    expect(
      screen.getByRole('img', { name: 'Format not recorded' }),
    ).toBeInTheDocument()
  })

  it('recognises a Switch 2 admin row by its platform id', () => {
    renderCard({ item: { ...ITEM, platform_id: 508, physical_format: null } })
    expect(
      screen.getByRole('img', { name: 'Format not recorded' }),
    ).toBeInTheDocument()
  })

  it.each([
    ['a full cartridge', { ...SWITCH_2, physical_format: 'game_card' }],
    [
      'another platform with no format',
      { ...ITEM, platform: 'Nintendo Switch', physical_format: null },
    ],
  ])('gives %s no mark', (_, item) => {
    const { container } = renderCard({ item })
    expect(container.querySelector('.format-mark')).toBeNull()
  })

  it('runs a ribbon along an upcoming release', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 8, 23, 12))
    renderCard({ item: { ...ITEM, release_date: '2027-03-05' } })
    expect(screen.getByText('Coming Mar 2027')).toHaveClass('upcoming-ribbon')
  })

  it.each([
    ['today', '2026-09-23'],
    ['the past', '2020-01-01'],
    ['no date', null],
  ])('has no ribbon for %s', (_, date) => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 8, 23, 12))
    const { container } = renderCard({ item: { ...ITEM, release_date: date } })
    expect(container.querySelector('.upcoming-ribbon')).toBeNull()
  })
})
