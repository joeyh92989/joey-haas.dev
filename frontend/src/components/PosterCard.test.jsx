import '@testing-library/jest-dom'
import { cleanup, render, screen } from '@testing-library/react'
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
      <PosterCard item={ITEM} to="/shelf/1" {...props} />
    </MemoryRouter>,
  )
}

describe('PosterCard', () => {
  it('tags an admin row that is private, and never a public row', () => {
    const { unmount } = renderCard({ item: { ...ITEM, is_public: false } })
    expect(screen.getByText('Private')).toBeInTheDocument()
    unmount()
    renderCard({ item: { ...ITEM, is_public: true } })
    expect(screen.queryByText('Private')).toBeNull()
    cleanup()
    // A public row has no is_public field at all.
    renderCard()
    expect(screen.queryByText('Private')).toBeNull()
  })

  it('marks a game finished more than once with its count', () => {
    renderCard({ item: { ...ITEM, times_completed: 3 } })
    expect(
      screen.getByRole('img', { name: 'Finished 3 times' }),
    ).toHaveTextContent('×3')
  })

  it('gives a single finish no replay mark', () => {
    renderCard({ item: { ...ITEM, times_completed: 1 } })
    expect(screen.queryByRole('img', { name: /Finished \d+ times/ })).toBeNull()
  })

  it('names a paused game’s mark Paused', () => {
    renderCard({ item: { ...ITEM, status: 'paused' } })
    const mark = screen.getByRole('img', { name: 'Paused' })
    expect(mark).toHaveAttribute('data-status', 'paused')
  })

  it('links the poster and the title together to the given page', () => {
    renderCard()
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', '/shelf/1')
    expect(link).toHaveTextContent('Hades')
    expect(link.querySelector('.cover')).not.toBeNull()
  })

  // A button inside an anchor is invalid, and clicking it would navigate.
  it('renders actions as a sibling of the link, never inside it', () => {
    renderCard({ actions: () => <button type="button">Rate</button> })
    expect(screen.getByRole('button', { name: 'Rate' }).closest('a')).toBeNull()
  })

  it('puts a comic’s run under the title, outside the link', () => {
    renderCard({ run: <p>12/12 · Complete run</p>, stacked: true })
    expect(screen.getByText('12/12 · Complete run').closest('a')).toBeNull()
    expect(document.querySelector('.poster-art')).toHaveAttribute(
      'data-stacked',
    )
  })

  it('draws no stack for a single book', () => {
    renderCard()
    expect(document.querySelector('.poster-art')).not.toHaveAttribute(
      'data-stacked',
    )
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
    expect(screen.getByRole('img', { name: 'Favorite' })).toBeInTheDocument()
  })

  it('shows no heart for an item that is not a favourite', () => {
    renderCard({ item: { ...ITEM, favorite: false } })
    expect(
      screen.queryByRole('img', { name: 'Favorite' }),
    ).not.toBeInTheDocument()
  })

  it('shows the rating and the year and creator beneath the poster', () => {
    renderCard()
    expect(screen.getByRole('img', { name: '9 out of 10' })).toHaveTextContent(
      '★9',
    )
    expect(screen.getByText('2020 · Supergiant Games')).toBeInTheDocument()
  })

  it('sets data-dimmed only when dimmed', () => {
    const { container, rerender } = renderCard({ dimmed: true })
    expect(container.querySelector('.poster-card')).toHaveAttribute(
      'data-dimmed',
    )
    rerender(
      <MemoryRouter>
        <PosterCard item={ITEM} to="/shelf/1" />
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

// A card in a numbered collection (the public Games and Comics lists, #532):
// a record card with a catalogue number and a status mark with its word.
describe('PosterCard in a numbered collection', () => {
  it('is a record card with a strip holding the number and the status word', () => {
    const { container } = renderCard({ number: 7 })
    const card = container.querySelector('.poster-card')
    expect(card).toHaveAttribute('data-slot', 'card')
    const strip = card.querySelector('[data-strip]')
    expect(strip).toHaveTextContent('No. 007')
    expect(strip).toHaveTextContent('Finished')
  })

  it('hides the number from assistive tech and names the card by its title', () => {
    const { container } = renderCard({
      number: 7,
      item: { ...ITEM, favorite: false },
    })
    expect(container.querySelector('[aria-hidden="true"]')).toHaveTextContent(
      'No. 007',
    )
    expect(screen.getByRole('link')).toHaveAccessibleName(/^Hades\b/)
  })

  it('says the status in words only, so the cover carries no status mark', () => {
    const { container } = renderCard({ number: 7 })
    expect(screen.queryByRole('img', { name: 'Finished' })).toBeNull()
    expect(container.querySelector('.poster-art .status-mark')).toBeNull()
  })

  it('writes a backlog game as Backlog, with an unfilled mark', () => {
    const { container } = renderCard({
      number: 3,
      item: { ...ITEM, status: 'backlog' },
    })
    expect(container.querySelector('[data-strip]')).toHaveTextContent('Backlog')
    expect(
      container.querySelector('[data-slot="status-mark-square"]'),
    ).toHaveAttribute('data-filled', 'false')
  })

  it.each([
    ['finished', 'true'],
    ['active', 'true'],
    ['paused', 'false'],
    ['abandoned', 'false'],
  ])('fills the mark for %s: %s', (status, filled) => {
    const { container } = renderCard({ number: 1, item: { ...ITEM, status } })
    expect(
      container.querySelector('[data-slot="status-mark-square"]'),
    ).toHaveAttribute('data-filled', filled)
  })

  it('uses the status names a comic passes', () => {
    renderCard({
      number: 1,
      item: { ...ITEM, status: 'active' },
      statusLabels: { active: 'Reading' },
    })
    expect(screen.getAllByText('Reading')).toHaveLength(2)
  })

  it('covers the card with its one link, and draws the keyboard ring inside it', () => {
    renderCard({ number: 7 })
    const link = screen.getByRole('link')
    expect(link.className).toContain('after:absolute')
    expect(link.className).toContain('after:inset-0')
    expect(link.className).toContain('focus-visible:after:-outline-offset-2')
  })

  it('keeps the legacy hooks the tests and the admin read', () => {
    const { container } = renderCard({ number: 7 })
    expect(container.querySelector('.poster-link')).not.toBeNull()
    expect(container.querySelector('.poster-art')).not.toBeNull()
    expect(container.querySelector('.poster-title')).toHaveTextContent('Hades')
  })

  it('keeps the other marks on the cover', () => {
    renderCard({ number: 7, item: { ...ITEM, times_completed: 2 } })
    expect(screen.getByRole('img', { name: 'Favorite' })).toBeInTheDocument()
    expect(
      screen.getByRole('img', { name: 'Finished 2 times' }),
    ).toBeInTheDocument()
  })

  it('leaves a card with no number as it was', () => {
    const { container } = renderCard()
    expect(container.querySelector('[data-strip]')).toBeNull()
    expect(screen.getByRole('img', { name: 'Finished' })).toHaveClass(
      'status-mark',
    )
  })

  it('names the card’s link by its title and then its status, said once', () => {
    const { container } = renderCard({
      number: 7,
      item: { ...ITEM, favorite: false, status: 'paused' },
    })
    const link = screen.getByRole('link')
    expect(link).toHaveAccessibleName(/^Hades\b.*Paused/)
    const word = link.querySelector('.sr-only')
    expect(word).toHaveTextContent('Paused')
    // The strip's word is for the eye: a screen reader gets it from the link.
    const strip = container.querySelector('[data-strip]')
    const hidden = [...strip.querySelectorAll('[aria-hidden="true"]')].map(
      (node) => node.textContent,
    )
    expect(hidden.some((text) => text.includes('Paused'))).toBe(true)
  })

  it('lets the title’s underline show: no clip, no line clamp', () => {
    renderCard({ number: 7 })
    const title = document.querySelector('.poster-title')
    expect(title.className).toContain('overflow-visible')
    expect(title.className).toContain('block')
    expect(title.className).toContain('[-webkit-line-clamp:unset]')
  })

  it('spaces the rating under the title', () => {
    renderCard({ number: 7 })
    const rating = screen.getByRole('img', { name: '9 out of 10' })
    expect(rating.parentElement.className).toContain('mt-1')
  })
})
