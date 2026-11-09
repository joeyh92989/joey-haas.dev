import '@testing-library/jest-dom'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { axeViolations } from '../lib/axe.test-util.js'
import Trip from './Trip.jsx'

// trips.js globs markdown the Vitest config cannot compile, so it is
// replaced; tests fill this array, newest first, published only.
const content = vi.hoisted(() => ({ trips: [] }))
vi.mock('../content/trips.js', () => ({
  get trips() {
    return content.trips
  },
  findTrip: (slug) => content.trips.find((trip) => trip.slug === slug),
}))

const photo = (name, caption = null) => ({
  name,
  alt: `${name} alt`,
  caption,
  width: 1600,
  height: 1067,
})

const day = (id, first, last, title, legs, photos = []) => ({
  id,
  label: first === last ? `${first}` : `${first}–${last}`,
  first,
  last,
  title,
  place: legs.at(-1),
  legs,
  html: `<p>${title} prose.</p>`,
  dates: null,
  photos,
})

// The real slug, so the real drawn map is found.
const CROATIA = {
  slug: 'croatia-greece-2026',
  frontmatter: {
    title: 'Croatia & Greece',
    date: '2026-09-12',
    end: '2026-09-23',
    precision: 'day',
    summary: 'Twelve days, three places.',
    places: [
      { name: 'Dubrovnik', lat: 42.6507, lon: 18.0944 },
      { name: 'Naxos', lat: 37.1036, lon: 25.3767 },
      { name: 'Athens', lat: 37.9838, lon: 23.7275 },
    ],
  },
  cover: { name: 'walls', width: 1600, height: 1067 },
  days: [
    day('day-1', 1, 1, 'Arrive', ['Dubrovnik']),
    day(
      'day-2',
      2,
      2,
      'The walls',
      ['Dubrovnik'],
      [photo('walls', 'On the wall'), photo('lokrum')],
    ),
    day('day-4', 4, 4, 'Travel day', ['Dubrovnik', 'Athens', 'Naxos']),
    day('day-5', 5, 5, 'Chora', ['Naxos'], [photo('portara')]),
    day('day-8-9', 8, 9, 'Slow days', ['Naxos'], [photo('walls')]),
    day('day-12', 12, 12, 'Home', ['Athens']),
  ],
}

const LISBON = {
  slug: 'lisbon-2019',
  frontmatter: {
    title: 'Lisbon',
    date: '2019-03-04',
    end: '2019-03-08',
    precision: 'day',
    places: [{ name: 'Lisbon', lat: 38.72, lon: -9.14 }],
  },
  cover: null,
  days: [day('day-1', 1, 1, 'Trams', ['Lisbon'])],
}

const IRELAND = {
  slug: 'ireland-2014',
  frontmatter: {
    title: 'Ireland',
    date: '2014-06-01',
    end: '2014-06-14',
    precision: 'month',
    places: [{ name: 'Dublin', lat: 53.35, lon: -6.26 }],
  },
  cover: null,
  days: [day('day-1', 1, 3, 'Dublin', ['Dublin'])],
}

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open')
    this.dispatchEvent(new Event('close'))
  }
})

afterEach(() => {
  content.trips = []
  delete HTMLDialogElement.prototype.showModal
  delete HTMLDialogElement.prototype.close
})

function renderTrip(slug) {
  return render(
    <MemoryRouter initialEntries={[`/travel/${slug}`]}>
      <Routes>
        <Route path="/travel/:slug" element={<Trip />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('Trip', () => {
  it('lays the page out in the spec order', () => {
    content.trips = [CROATIA]
    const { container } = renderTrip('croatia-greece-2026')
    const kicker = container.querySelector('.trip > .kicker')
    expect(kicker).toHaveTextContent('Travel · Sept 2026')
    expect(within(kicker).getByRole('link')).toHaveAttribute('href', '/travel')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Croatia & Greece',
    )
    const order = [
      ...container.querySelectorAll(
        '.trip > .kicker, h1, .lede, .facts, .drawn-map, .trip-places, .trip-day',
      ),
    ].map((el) => el.className || el.tagName)
    expect(order.slice(0, 6)).toEqual([
      'kicker',
      'trip__title',
      'lede',
      'facts',
      'drawn-map',
      'trip-places',
    ])
    expect(
      screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent),
    ).toEqual([
      'Arrive · Dubrovnik',
      'The walls · Dubrovnik',
      'Travel day · Dubrovnik → Athens → Naxos',
      'Chora · Naxos',
      'Slow days · Naxos',
      'Home · Athens',
    ])
  })

  it('states the facts, counting a repeated photo once', () => {
    content.trips = [CROATIA]
    const { container } = renderTrip('croatia-greece-2026')
    const facts = container.querySelector('.facts')
    expect(facts).toHaveTextContent('Dates12–23 Sept 2026')
    expect(facts).toHaveTextContent('Places3')
    expect(facts).toHaveTextContent('Days12')
    expect(facts).toHaveTextContent('Photos3')
  })

  it('pairs two photos, sets one alone, and makes a photo-less day a postcard', () => {
    content.trips = [CROATIA]
    renderTrip('croatia-greece-2026')
    const walls = document.getElementById('day-2')
    const pair = walls.querySelector('.photo-group--two')
    expect(within(pair).getAllByRole('img')).toHaveLength(2)
    expect(within(pair).getByText('On the wall')).toBeInTheDocument()
    // No caption: the alt is shown instead.
    expect(within(pair).getByText('lokrum alt')).toBeInTheDocument()

    const chora = document.getElementById('day-5')
    const single = chora.querySelector('.photo-group')
    expect(single).not.toHaveClass('photo-group--two')
    expect(within(single).getAllByRole('img')).toHaveLength(1)

    const arrive = document.getElementById('day-1')
    expect(arrive.querySelector('.postcard')).toHaveTextContent('Arrive prose.')
    expect(arrive.querySelector('img')).toBeNull()
    expect(walls.querySelector('.postcard')).toBeNull()
  })

  it('points chips and pins at the first day in each place', () => {
    content.trips = [CROATIA]
    renderTrip('croatia-greece-2026')
    const chips = within(screen.getByRole('navigation', { name: 'Places' }))
      .getAllByRole('link')
      .map((link) => [link.textContent, link.getAttribute('href')])
    // Naxos's first day is the travel day that ends there. Athens is only
    // passed through on it, so its chip goes to the day spent there.
    expect(chips).toEqual([
      ['Dubrovnik', '#day-1'],
      ['Naxos', '#day-4'],
      ['Athens', '#day-12'],
    ])
    expect(screen.getByRole('link', { name: '2. Naxos' })).toHaveAttribute(
      'href',
      '#day-4',
    )
    for (const [, href] of chips) {
      expect(document.getElementById(href.slice(1))).not.toBeNull()
    }
  })

  it('loads the first photo group eagerly and every later one lazily', () => {
    content.trips = [CROATIA]
    const { container } = renderTrip('croatia-greece-2026')
    const images = [...container.querySelectorAll('.trip-photo__img')]
    expect(images.map((img) => img.getAttribute('loading'))).toEqual([
      'eager',
      'eager',
      'lazy',
      'lazy',
    ])
    for (const img of images) {
      expect(img).toHaveAttribute('width', '1600')
      expect(img).toHaveAttribute('height', '1067')
      expect(img.getAttribute('srcset')).toMatch(/-800\.webp 800w, .*1600w$/)
    }
  })

  it('opens a photo in the lightbox, counting a repeated photo once', async () => {
    const user = userEvent.setup()
    content.trips = [CROATIA]
    renderTrip('croatia-greece-2026')
    // The repeat of walls on day 8–9 opens the first, not a fourth photo.
    const opens = screen.getAllByRole('button', { name: 'walls alt' })
    await user.click(opens[1])
    const dialog = document.querySelector('dialog')
    expect(dialog).toHaveAttribute('open')
    expect(dialog).toHaveTextContent('1 of 3')
  })

  it('links the older and newer trips', () => {
    content.trips = [CROATIA, LISBON, IRELAND]
    renderTrip('lisbon-2019')
    const nav = within(screen.getByRole('navigation', { name: 'More trips' }))
    expect(nav.getByRole('link', { name: /Ireland/ })).toHaveAttribute(
      'href',
      '/travel/ireland-2014',
    )
    expect(nav.getByRole('link', { name: /Croatia/ })).toHaveAttribute(
      'href',
      '/travel/croatia-greece-2026',
    )
  })

  it('has no map, chips or day count it cannot back', () => {
    content.trips = [IRELAND]
    const { container } = renderTrip('ireland-2014')
    expect(container.querySelector('.drawn-map')).toBeNull()
    expect(screen.queryByRole('navigation')).toBeNull()
    const facts = container.querySelector('.facts')
    expect(facts).toHaveTextContent('DatesJune 2014')
    // Month precision: the count is the days written, not the date span.
    expect(facts).toHaveTextContent('Days3')
    expect(facts).not.toHaveTextContent('Photos')
  })

  it('is a 404 for a slug that is not published', () => {
    // Drafts never reach the list in production, so a draft's slug misses.
    content.trips = [LISBON]
    renderTrip('croatia-greece-2026')
    expect(screen.getByRole('heading', { level: 1 })).not.toHaveTextContent(
      'Croatia',
    )
    expect(screen.queryByText('Twelve days, three places.')).toBeNull()
  })

  it('has no axe violations', async () => {
    content.trips = [CROATIA, LISBON]
    const { container } = renderTrip('croatia-greece-2026')
    expect(await axeViolations(container)).toEqual([])
  })
})
