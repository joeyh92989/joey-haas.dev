import '@testing-library/jest-dom'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readSnapshot } from '../lib/snapshot.js'
import Collection from './Collection.jsx'

// A wide screen: the sort renders as buttons. The narrow select variant is
// covered in SortControl.test.jsx.
vi.mock('../lib/useMediaQuery.js', () => ({ useMediaQuery: () => false }))

vi.mock('../lib/snapshot.js', () => ({ readSnapshot: vi.fn() }))

beforeEach(() => {
  vi.mocked(readSnapshot).mockReset()
  vi.mocked(readSnapshot).mockResolvedValue(null)
})

/** A snapshot of the given rows and stats, as the build wrote them. */
function stubSnapshot({ items = ITEMS, stats = STATS } = {}) {
  vi.mocked(readSnapshot).mockImplementation(async (name) =>
    name === 'items' ? items : name === 'stats' ? stats : null,
  )
}

/**
 * Queries scoped to the poster grid.
 *
 * A favourite's title also appears in the favourites row, so an unscoped
 * query would fail on the duplication rather than on anything being wrong.
 */
function grid() {
  return within(document.querySelector('.poster-grid'))
}

function gridTitles() {
  return [...document.querySelectorAll('.poster-grid .poster-title')].map(
    (node) => node.textContent,
  )
}

const ITEMS = [
  {
    id: '1',
    type: 'movie',
    title: 'Dune',
    year: 2021,
    creator: 'Denis Villeneuve',
    cover_url: 'https://image.tmdb.org/t/p/w342/a.jpg',
    status: 'finished',
    rating: 9,
    favorite: true,
    finished_at: '2026-03-14',
    genres: ['Science Fiction'],
    community_score: 7.8,
    platforms: [],
    created_at: '2026-01-01T00:00:00Z',
    wanted: false,
    pinned: false,
  },
  {
    id: '2',
    type: 'boardgame',
    title: 'Gloomhaven',
    year: null,
    creator: null,
    cover_url: null,
    status: 'backlog',
    rating: null,
    favorite: false,
    finished_at: null,
    genres: [],
    community_score: null,
    platforms: [],
    created_at: '2026-02-01T00:00:00Z',
    wanted: true,
    pinned: false,
  },
]

const STATS = {
  total: 2,
  by_type: { movie: 1, boardgame: 1 },
  by_status: { finished: 1, backlog: 1 },
  rating_histogram: { 9: 1 },
  finishes_by_month: { '2026-03': 1 },
  owned: 1,
  finished_this_year: 1,
  average_rating: 9,
  by_platform: {},
  by_format: {},
}

function stubApi({
  items = ITEMS,
  stats = STATS,
  itemsOk = true,
  statsOk = true,
} = {}) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url) => {
      if (String(url).includes('/api/public/items')) {
        return {
          ok: itemsOk,
          status: itemsOk ? 200 : 500,
          json: async () => items,
        }
      }
      return {
        ok: statsOk,
        status: statsOk ? 200 : 500,
        json: async () => stats,
      }
    }),
  )
}

function renderPage() {
  return render(
    <MemoryRouter>
      <Collection />
    </MemoryRouter>,
  )
}

/** Renders and waits for the grid, the last thing a ready page draws. */
async function renderReady() {
  renderPage()
  await waitFor(() =>
    expect(document.querySelector('.poster-grid')).not.toBeNull(),
  )
}

afterEach(() => {
  // Unconditional, so a test that fails before its own cleanup cannot leave
  // fake timers installed and time out every test after it.
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('Collection', () => {
  it('renders a poster for every public item', async () => {
    stubApi()
    await renderReady()

    expect(grid().getByText('Dune')).toBeInTheDocument()
    expect(grid().getByText('Gloomhaven')).toBeInTheDocument()
  })

  it('links each card to its item page', async () => {
    stubApi()
    await renderReady()

    expect(grid().getByRole('link', { name: /Dune/ })).toHaveAttribute(
      'href',
      '/collection/1',
    )
  })

  it('shows the hero numbers from stats', async () => {
    stubApi({
      stats: {
        ...STATS,
        owned: 68,
        by_status: { finished: 17 },
        finished_this_year: 9,
      },
    })
    await renderReady()

    const hero = within(document.querySelector('.hero-numbers'))
    expect(hero.getByText('68')).toBeInTheDocument()
    expect(hero.getByText('Owned')).toBeInTheDocument()
    expect(hero.getByText('17')).toBeInTheDocument()
    expect(hero.getByText('9')).toBeInTheDocument()
    expect(hero.getByText(/^Finished in \d{4}$/)).toBeInTheDocument()
  })

  it('shows favourites, highest rated first, up to four', async () => {
    const favourites = [
      { ...ITEMS[0], id: 'a', title: 'Low', rating: 2 },
      { ...ITEMS[0], id: 'b', title: 'High', rating: 10 },
      { ...ITEMS[0], id: 'c', title: 'Mid', rating: 6 },
      { ...ITEMS[0], id: 'd', title: 'Also Mid', rating: 6 },
      { ...ITEMS[0], id: 'e', title: 'Unrated', rating: null },
    ]
    stubApi({ items: favourites })
    await renderReady()

    const row = within(screen.getByRole('region', { name: 'Favourites' }))
    expect(row.getAllByRole('link').map((link) => link.textContent)).toEqual([
      'High',
      'Also Mid',
      'Mid',
      'Low',
    ])
  })

  it('has no favourites row when nothing is a favourite', async () => {
    stubApi({ items: ITEMS.map((item) => ({ ...item, favorite: false })) })
    await renderReady()

    expect(
      screen.queryByRole('region', { name: 'Favourites' }),
    ).not.toBeInTheDocument()
  })

  it('draws the status bar with named segments and a legend', async () => {
    stubApi({ stats: { ...STATS, by_status: { backlog: 50, finished: 17 } } })
    await renderReady()

    const bar = document.querySelector('.status-bar')
    expect(within(bar).getByRole('img', { name: 'Backlog: 50' })).toBeVisible()
    expect(within(bar).getByRole('img', { name: 'Finished: 17' })).toBeVisible()
    // Segments follow shelf order, not response order.
    expect(
      within(bar)
        .getAllByRole('img')
        .map((segment) => segment.getAttribute('aria-label')),
    ).toEqual(['Backlog: 50', 'Finished: 17'])
    expect(
      within(document.querySelector('.status-legend')).getByText('Backlog'),
    ).toBeInTheDocument()
  })

  it('draws ten rating bars, each focusable and named, with the average', async () => {
    stubApi({
      stats: {
        ...STATS,
        rating_histogram: { 7: 3, 9: 1 },
        average_rating: 7.5,
      },
    })
    await renderReady()

    const ratings = screen.getByRole('region', { name: 'Ratings' })
    const bars = within(ratings).getAllByRole('img')
    expect(bars).toHaveLength(10)
    const seven = within(ratings).getByRole('img', { name: 'Rated 7: 3 items' })
    expect(seven).toHaveAttribute('tabindex', '0')
    expect(
      within(ratings).getByRole('img', { name: 'Rated 9: 1 item' }),
    ).toBeInTheDocument()
    expect(
      within(ratings).getByRole('img', { name: 'Rated 1: 0 items' }),
    ).toBeInTheDocument()
    expect(within(ratings).getByText('7.5')).toBeInTheDocument()
  })

  it('draws twelve months of finishes ending this month', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-09-15T12:00:00Z'))
    stubApi({
      stats: {
        ...STATS,
        finishes_by_month: { '2026-03': 2, '2025-01': 5 },
        finished_this_year: 2,
      },
    })
    await renderReady()

    const finishes = screen.getByRole('region', { name: 'Finishes' })
    const months = within(finishes).getAllByRole('img')
    expect(months).toHaveLength(12)
    expect(months.at(-1)).toHaveAccessibleName('Sep 2026: 0 finished')
    expect(months[0]).toHaveAccessibleName('Oct 2025: 0 finished')
    expect(
      within(finishes).getByRole('img', { name: 'Mar 2026: 2 finished' }),
    ).toBeInTheDocument()
    expect(within(finishes).getByText(/2 in 2026/)).toBeInTheDocument()
  })

  it('hides the ratings and finishes blocks when they have no data', async () => {
    stubApi({
      stats: {
        ...STATS,
        rating_histogram: {},
        average_rating: null,
        finishes_by_month: {},
      },
    })
    await renderReady()

    expect(document.querySelector('.status-bar')).not.toBeNull()
    expect(
      screen.queryByRole('region', { name: 'Ratings' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('region', { name: 'Finishes' }),
    ).not.toBeInTheDocument()
  })

  it('counts the chips from the whole collection', async () => {
    stubApi()
    await renderReady()

    expect(screen.getByRole('button', { name: /Film & TV/ })).toHaveTextContent(
      '1',
    )
    expect(screen.getByRole('button', { name: /Want/ })).toHaveTextContent('1')
    // Nothing is abandoned, so there is no chip for it.
    expect(
      screen.queryByRole('button', { name: /Abandoned/ }),
    ).not.toBeInTheDocument()
  })

  it('filters the grid by type', async () => {
    stubApi()
    await renderReady()

    await userEvent.click(screen.getByRole('button', { name: /Board games/ }))

    expect(grid().queryByText('Dune')).not.toBeInTheDocument()
    expect(grid().getByText('Gloomhaven')).toBeInTheDocument()
  })

  it('filters to the want list', async () => {
    stubApi()
    await renderReady()

    await userEvent.click(screen.getByRole('button', { name: /Want/ }))

    expect(gridTitles()).toEqual(['Gloomhaven'])
  })

  it('says so when filters match nothing, rather than looking empty', async () => {
    stubApi()
    await renderReady()

    await userEvent.click(screen.getByRole('button', { name: /Film & TV/ }))
    await userEvent.click(screen.getByRole('button', { name: /Backlog/ }))

    expect(
      screen.getByText(/nothing matches those filters/i),
    ).toBeInTheDocument()
  })

  it('sorts by recently added by default, and re-sorts on request', async () => {
    stubApi()
    await renderReady()

    expect(gridTitles()).toEqual(['Gloomhaven', 'Dune'])

    await userEvent.click(screen.getByRole('button', { name: 'Title' }))
    expect(gridTitles()).toEqual(['Dune', 'Gloomhaven'])

    await userEvent.click(screen.getByRole('button', { name: /direction/i }))
    expect(gridTitles()).toEqual(['Gloomhaven', 'Dune'])
  })

  // Asserts the seed changes rather than the order: two shuffles of a
  // two-item fixture agree half the time.
  it('reseeds on Shuffle', async () => {
    stubApi()
    await renderReady()

    await userEvent.click(screen.getByRole('button', { name: 'Random' }))
    const control = document.querySelector('.sort-control')
    const before = control.getAttribute('data-seed')

    await userEvent.click(screen.getByRole('button', { name: 'Shuffle' }))

    expect(control.getAttribute('data-seed')).not.toBe(before)
  })

  it('switches poster size and remembers it', async () => {
    stubApi()
    await renderReady()

    await userEvent.click(screen.getByRole('button', { name: 'Compact' }))

    expect(document.querySelector('.poster-grid')).toHaveAttribute(
      'data-size',
      'compact',
    )
    expect(localStorage.getItem('shelf.public.size')).toBe('"compact"')
  })

  it('starts from a remembered size and dimming', async () => {
    localStorage.setItem('shelf.public.size', '"compact"')
    localStorage.setItem('shelf.public.dim', 'true')
    stubApi()
    await renderReady()

    expect(document.querySelector('.poster-grid')).toHaveAttribute(
      'data-size',
      'compact',
    )
    expect(grid().getByText('Dune').closest('.poster-card')).toHaveAttribute(
      'data-dimmed',
    )
  })

  it('dims finished items only when asked, and remembers it', async () => {
    stubApi()
    await renderReady()

    const dune = () => grid().getByText('Dune').closest('.poster-card')
    expect(dune()).not.toHaveAttribute('data-dimmed')

    await userEvent.click(screen.getByRole('button', { name: 'Dim finished' }))

    expect(dune()).toHaveAttribute('data-dimmed')
    // Backlog is never dimmed: it is what the toggle is for.
    expect(
      grid().getByText('Gloomhaven').closest('.poster-card'),
    ).not.toHaveAttribute('data-dimmed')
    expect(localStorage.getItem('shelf.public.dim')).toBe('true')
  })

  // Storage throws outright in some private-browsing modes.
  it('still renders and toggles when storage throws', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    stubApi()
    await renderReady()

    await userEvent.click(screen.getByRole('button', { name: 'Compact' }))

    expect(document.querySelector('.poster-grid')).toHaveAttribute(
      'data-size',
      'compact',
    )
  })

  it('shows twelve skeleton cards while loading', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    )
    renderPage()

    expect(document.querySelectorAll('.skeleton-card')).toHaveLength(12)
  })

  it('announces the cold start rather than showing a bare spinner', async () => {
    // The free tier sleeps after about fifteen minutes; a spinner for thirty
    // seconds reads as broken rather than slow.
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    )
    renderPage()

    expect(screen.getByText('Loading…')).toBeInTheDocument()
    await waitFor(
      () => expect(screen.getByText(/waking the server/i)).toBeInTheDocument(),
      { timeout: 4000 },
    )
  })

  it('reports a failed load instead of an empty collection', async () => {
    stubApi({ itemsOk: false })
    renderPage()

    expect(await screen.findByText(/could not be loaded/i)).toBeInTheDocument()
  })

  it('renders the required TMDB attribution verbatim', async () => {
    stubApi()
    renderPage()

    expect(
      await screen.findByText(
        /This product uses the TMDB API but is not endorsed or certified by TMDB/i,
      ),
    ).toBeInTheDocument()
    expect(screen.getByText(/IGDB/)).toBeInTheDocument()
    expect(screen.getByText(/Comic Vine/)).toBeInTheDocument()
  })

  it('shows a rating as stars without claiming one that is absent', async () => {
    stubApi()
    await renderReady()

    expect(screen.getByLabelText('9 out of 10')).toBeInTheDocument()
    // Gloomhaven has no rating, so exactly one star element exists rather
    // than an empty or zero-star one implying it was rated badly.
    expect(screen.getAllByLabelText(/out of 10/)).toHaveLength(1)
  })

  it('says nothing here yet on an empty collection, and nothing else', async () => {
    stubApi({
      items: [],
      stats: {
        ...STATS,
        total: 0,
        by_type: {},
        by_status: {},
        rating_histogram: {},
        finishes_by_month: {},
        owned: 0,
        finished_this_year: 0,
        average_rating: null,
      },
    })
    renderPage()

    expect(await screen.findByText(/nothing here yet/i)).toBeInTheDocument()
    expect(document.querySelector('.hero-numbers')).toBeNull()
    expect(document.querySelector('.status-bar')).toBeNull()
    expect(document.querySelector('.shelf-toolbar')).toBeNull()
    expect(
      screen.queryByRole('region', { name: 'Favourites' }),
    ).not.toBeInTheDocument()
  })
})

describe('Collection platforms and formats', () => {
  const SWITCH_2 = { platform: 'Nintendo Switch 2' }

  it('has no platform chips while every item is on one platform', async () => {
    stubApi({ items: ITEMS.map((item) => ({ ...item, ...SWITCH_2 })) })
    await renderReady()
    expect(
      screen.queryByRole('group', { name: 'Platform' }),
    ).not.toBeInTheDocument()
  })

  it('filters by platform once there are two', async () => {
    stubApi({
      items: [
        { ...ITEMS[0], ...SWITCH_2 },
        { ...ITEMS[1], platform: 'Nintendo 64' },
      ],
    })
    await renderReady()

    const chips = screen.getByRole('group', { name: 'Platform' })
    await userEvent.click(within(chips).getByRole('button', { name: /64/ }))

    expect(gridTitles()).toEqual(['Gloomhaven'])
  })

  it('states the on-cartridge line with unknowns kept apart', async () => {
    stubApi({
      stats: {
        ...STATS,
        by_format: {
          508: {
            game_card: 61,
            game_key_card: 3,
            code_in_box: 0,
            unknown: 4,
            total: 68,
          },
        },
      },
    })
    await renderReady()

    const block = screen.getByRole('region', { name: 'On cartridge' })
    expect(block.closest('.shelf-stats')).not.toBeNull()
    expect(
      within(block).getByText('Nintendo Switch 2 — 61 of 68'),
    ).toBeInTheDocument()
    expect(
      within(block).getByText('3 Game-Key Cards · 4 not recorded'),
    ).toBeInTheDocument()
  })

  it('labels the ends of the ratings axis and titles every bar', async () => {
    stubApi()
    await renderReady()

    const ratings = screen.getByRole('region', { name: 'Ratings' })
    const axis = ratings.querySelector('.bar-axis')
    expect(axis).toHaveAttribute('aria-hidden', 'true')
    expect([...axis.children].map((label) => label.textContent)).toEqual([
      '1',
      '10',
    ])
    for (const bar of within(ratings).getAllByRole('img')) {
      expect(bar).toHaveAttribute('title', bar.getAttribute('aria-label'))
    }
  })

  it('labels each month of the finishes strip with its initial', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-03-20T12:00:00Z'))
    stubApi()
    await renderReady()

    const finishes = screen.getByRole('region', { name: 'Finishes' })
    const axis = finishes.querySelector('.bar-axis')
    expect(axis).toHaveAttribute('aria-hidden', 'true')
    expect(axis.textContent).toBe('AMJJASONDJFM')
    for (const bar of within(finishes).getAllByRole('img')) {
      expect(bar).toHaveAttribute('title', bar.getAttribute('aria-label'))
    }
  })

  it('has no on-cartridge line before any format is recorded', async () => {
    stubApi({
      stats: {
        ...STATS,
        by_format: {
          508: {
            game_card: 0,
            game_key_card: 0,
            code_in_box: 0,
            unknown: 9,
            total: 9,
          },
        },
      },
    })
    await renderReady()

    expect(screen.queryByRole('region', { name: 'On cartridge' })).toBeNull()
  })
})

describe('Collection Up next', () => {
  it('shows the pinned game as Up next, linked to its page', async () => {
    stubApi({
      items: [
        { ...ITEMS[0], pinned: true },
        { ...ITEMS[1], pinned: false },
      ],
    })
    await renderReady()

    const upNext = screen.getByRole('region', { name: 'Up next' })
    expect(within(upNext).getByRole('link', { name: /Dune/ })).toHaveAttribute(
      'href',
      '/collection/1',
    )
  })

  it('shows nothing when no game is pinned', async () => {
    stubApi({ items: ITEMS.map((item) => ({ ...item, pinned: false })) })
    await renderReady()

    expect(
      screen.queryByRole('region', { name: 'Up next' }),
    ).not.toBeInTheDocument()
  })
})

describe('Collection On the radar', () => {
  // Local dates, as the strip compares them (toISOString would be UTC and,
  // late in the evening, already tomorrow).
  const later = (days) => {
    const date = new Date()
    date.setDate(date.getDate() + days)
    const pad = (value) => String(value).padStart(2, '0')
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  }

  it('lists watched games still to come, soonest first, after Up next', async () => {
    stubApi({
      items: [
        { ...ITEMS[0], pinned: true },
        {
          ...ITEMS[1],
          id: 'w1',
          title: 'Far Off',
          wanted: true,
          release_date: later(200),
        },
        {
          ...ITEMS[1],
          id: 'w2',
          title: 'Soon',
          wanted: true,
          release_date: later(20),
        },
        {
          ...ITEMS[1],
          id: 'w3',
          title: 'Out Already',
          wanted: true,
          release_date: '2020-01-01',
        },
        {
          ...ITEMS[1],
          id: 'o1',
          title: 'Owned Later',
          wanted: false,
          release_date: later(30),
        },
      ],
    })
    await renderReady()

    const radar = screen.getByRole('region', { name: 'On the radar' })
    const titles = within(radar)
      .getAllByRole('link')
      .map((link) => link.textContent)
    expect(titles).toEqual([
      expect.stringContaining('Soon'),
      expect.stringContaining('Far Off'),
    ])
    const upNext = screen.getByRole('region', { name: 'Up next' })
    expect(
      upNext.compareDocumentPosition(radar) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('shows nothing when nothing watched is still to come', async () => {
    stubApi({
      items: [{ ...ITEMS[1], id: 'w4', wanted: true, release_date: later(0) }],
    })
    await renderReady()
    expect(
      screen.queryByRole('region', { name: 'On the radar' }),
    ).not.toBeInTheDocument()
  })
})

describe('Collection snapshot', () => {
  it('paints the snapshot while the server wakes, with no waking notice', async () => {
    stubSnapshot()
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    )
    await renderReady()

    expect(gridTitles()).toEqual(['Gloomhaven', 'Dune'])
    await new Promise((done) => setTimeout(done, 2100))
    expect(screen.queryByText(/waking the server/i)).toBeNull()
  })

  it('replaces the snapshot with live data when it arrives', async () => {
    stubSnapshot({ items: [ITEMS[0]] })
    stubApi()
    renderPage()

    await waitFor(() => expect(gridTitles()).toEqual(['Gloomhaven', 'Dune']))
  })

  it('keeps the snapshot when the live load fails', async () => {
    stubSnapshot()
    stubApi({ itemsOk: false })
    await renderReady()

    await new Promise((done) => setTimeout(done, 50))
    expect(screen.queryByText(/could not be loaded/i)).toBeNull()
    expect(gridTitles()).toHaveLength(2)
  })

  it('keeps the snapshot stats when live items load but live stats fail', async () => {
    stubSnapshot({
      items: [ITEMS[0]],
      stats: { ...STATS, owned: 68 },
    })
    stubApi({ statsOk: false })
    renderPage()

    await waitFor(() => expect(gridTitles()).toEqual(['Gloomhaven', 'Dune']))
    const hero = within(document.querySelector('.hero-numbers'))
    expect(hero.getByText('68')).toBeInTheDocument()
    expect(hero.getByText('Owned')).toBeInTheDocument()
  })

  it('ignores a snapshot that arrives after the live data', async () => {
    const releases = []
    vi.mocked(readSnapshot).mockImplementation(
      (name) =>
        new Promise((done) => {
          releases.push(() => done(name === 'items' ? [ITEMS[0]] : STATS))
        }),
    )
    stubApi()
    await renderReady()
    expect(gridTitles()).toEqual(['Gloomhaven', 'Dune'])

    for (const release of releases) release()
    await new Promise((done) => setTimeout(done, 50))
    expect(gridTitles()).toEqual(['Gloomhaven', 'Dune'])
  })
})
