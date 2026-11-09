import '@testing-library/jest-dom'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { axeViolations } from '../lib/axe.test-util.js'
import Travel from './Travel.jsx'

// trips.js globs markdown the Vitest config cannot compile, so it is
// replaced; tests fill this array. Like the real module, it holds only
// published trips: a draft never reaches it in production.
const content = vi.hoisted(() => ({ trips: [] }))
vi.mock('../content/trips.js', () => ({
  get trips() {
    return content.trips
  },
}))

const place = (name) => ({ name, lat: 0, lon: 0 })
const photo = (name) => ({
  name,
  alt: name,
  caption: null,
  width: 1600,
  height: 1067,
})

const CROATIA = {
  slug: 'croatia-greece-2026',
  frontmatter: {
    title: 'Croatia & Greece',
    date: '2026-09-12',
    end: '2026-09-23',
    precision: 'day',
    places: [place('Dubrovnik'), place('Naxos'), place('Athens')],
  },
  cover: { name: 'walls', width: 1600, height: 1067 },
  days: [
    { id: 'day-1', photos: [photo('walls'), photo('lokrum')] },
    { id: 'day-2', photos: [photo('walls')] },
  ],
}

const IRELAND = {
  slug: 'ireland-2014',
  frontmatter: {
    title: 'Ireland',
    date: '2014-06-01',
    end: '2014-06-14',
    precision: 'month',
    places: [place('Dublin'), place('Galway')],
  },
  cover: null,
  days: [{ id: 'day-1', photos: [] }],
}

const LISBON = {
  slug: 'lisbon-2019',
  frontmatter: {
    title: 'Lisbon',
    date: '2019-03-04',
    end: '2019-03-08',
    precision: 'day',
    places: [place('Lisbon'), place('Athens')],
  },
  cover: null,
  days: [{ id: 'day-1', photos: [photo('tram')] }],
}

afterEach(() => {
  content.trips = []
})

function ShowSearch() {
  return <output data-testid="search">{useLocation().search}</output>
}

function renderTravel(entry = '/travel') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Travel />
      <ShowSearch />
    </MemoryRouter>,
  )
}

const titles = () =>
  screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)

describe('Travel', () => {
  it('lists the trips in the order given, each card one link', () => {
    content.trips = [CROATIA, LISBON, IRELAND]
    renderTravel()
    expect(titles()).toEqual(['Croatia & Greece', 'Lisbon', 'Ireland'])
    const card = screen.getByRole('link', { name: /Croatia & Greece/ })
    expect(card).toHaveAttribute('href', '/travel/croatia-greece-2026')
    expect(within(card).getByText('Sept 2026 · 12 days')).toBeInTheDocument()
    expect(
      within(card).getByText('Dubrovnik · Naxos · Athens'),
    ).toBeInTheDocument()
    // A photo shown on two days counts once.
    expect(within(card).getByText('2 photos')).toBeInTheDocument()
  })

  it('gives a month-precise trip no day count and a cover-less trip no image', () => {
    content.trips = [IRELAND]
    const { container } = renderTravel()
    const card = screen.getByRole('link', { name: /Ireland/ })
    expect(within(card).getByText('June 2014')).toBeInTheDocument()
    expect(within(card).queryByText(/photo/)).toBeNull()
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('.trip-card__cover--blank')).not.toBeNull()
  })

  it('sizes the cover and loads only the first eagerly', () => {
    content.trips = [CROATIA, { ...LISBON, cover: CROATIA.cover }]
    const { container } = renderTravel()
    const [first, second] = container.querySelectorAll('img')
    expect(first).toHaveAttribute('width', '1600')
    expect(first).toHaveAttribute('height', '1067')
    expect(first).toHaveAttribute(
      'srcset',
      '/travel/croatia-greece-2026/walls-800.webp 800w, /travel/croatia-greece-2026/walls-1600.webp 1600w',
    )
    expect(first).toHaveAttribute('loading', 'eager')
    expect(second).toHaveAttribute('loading', 'lazy')
  })

  it('filters by place and keeps the choice in the query', async () => {
    const user = userEvent.setup()
    content.trips = [CROATIA, LISBON, IRELAND]
    renderTravel()
    await user.click(screen.getByRole('button', { name: /Athens/ }))
    expect(titles()).toEqual(['Croatia & Greece', 'Lisbon'])
    expect(screen.getByTestId('search')).toHaveTextContent('?place=athens')
    await user.click(screen.getByRole('button', { name: /Athens/ }))
    expect(titles()).toHaveLength(3)
    expect(screen.getByTestId('search')).toBeEmptyDOMElement()
  })

  it('restores a filter from the query, and ignores one naming no place', () => {
    content.trips = [CROATIA, LISBON, IRELAND]
    const { unmount } = renderTravel('/travel?place=galway')
    expect(titles()).toEqual(['Ireland'])
    expect(screen.getByRole('button', { name: /Galway/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    unmount()
    renderTravel('/travel?place=atlantis')
    expect(titles()).toHaveLength(3)
  })

  it('keeps the filter when the hash changes, and survives a malformed one', () => {
    // The skip link's #main, or a hand-typed #%, which decodeURIComponent
    // throws on, are not filters.
    content.trips = [CROATIA, LISBON, IRELAND]
    renderTravel('/travel?place=galway#%')
    expect(titles()).toEqual(['Ireland'])
  })

  it('hides the chips when there is only one trip', () => {
    content.trips = [IRELAND]
    renderTravel()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('renders only its heading and lede with no trips', () => {
    renderTravel()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Travel',
    )
    expect(screen.queryByRole('list')).toBeNull()
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('has no axe violations', async () => {
    content.trips = [CROATIA, LISBON, IRELAND]
    const { container } = renderTravel()
    expect(await axeViolations(container)).toEqual([])
  })
})
