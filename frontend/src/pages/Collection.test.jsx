import '@testing-library/jest-dom'
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link, MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { axeViolations } from '../lib/axe.test-util.js'
import { readSnapshot } from '../lib/snapshot.js'
import Collection from './Collection.jsx'

// A wide screen. The shelf's sort is a select at every width; the chips and
// narrow variants of SortControl are covered in SortControl.test.jsx.
vi.mock('../lib/useMediaQuery.js', () => ({ useMediaQuery: () => false }))

vi.mock('../lib/snapshot.js', async (importOriginal) => ({
  ...(await importOriginal()),
  readSnapshot: vi.fn(),
}))

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

const STATUS_BODY = {
  refreshed_at: '2026-10-21T00:40:00Z',
  titles: 5724,
  platforms: 2,
  stores_watched: 12,
  listings: 121958,
}

function stubApi({
  items = ITEMS,
  stats = STATS,
  itemsOk = true,
  statsOk = true,
  status = null,
} = {}) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url) => {
      const path = String(url)
      if (status && path.includes('/api/public/status')) {
        return { ok: true, status: 200, json: async () => status }
      }
      if (path.includes('/api/public/items')) {
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

function renderPage(path = '/shelf') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Collection />
    </MemoryRouter>,
  )
}

/** Renders and waits for the grid, the last thing a ready page draws. */
async function renderReady(path) {
  renderPage(path)
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

  it('shows the game being played in the Now playing band', async () => {
    stubApi({
      items: [
        ...ITEMS,
        {
          ...ITEMS[0],
          id: 'p',
          type: 'game',
          title: 'Hollow',
          status: 'active',
          favorite: false,
          playing_since: '2026-11-03',
        },
      ],
    })
    await renderReady()

    const band = screen.getByRole('region', { name: 'Now playing' })
    expect(within(band).getByRole('link', { name: /Hollow/ })).toHaveAttribute(
      'href',
      '/shelf/p/',
    )
    expect(band).toHaveTextContent('Playing since Nov 3, 2026')
  })

  it('has no Now playing band when nothing is being played', async () => {
    stubApi()
    await renderReady()

    expect(
      screen.queryByRole('region', { name: 'Now playing' }),
    ).not.toBeInTheDocument()
  })

  it('links each card to its item page', async () => {
    stubApi()
    await renderReady()

    expect(grid().getByRole('link', { name: /Dune/ })).toHaveAttribute(
      'href',
      '/shelf/1/',
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

  it('puts the grid before the overview, and drops the strips and cards', async () => {
    stubApi({ status: STATUS_BODY })
    await renderReady()

    const grid = document.querySelector('.poster-grid')
    const overview = document.getElementById('overview')
    const favourites = screen.getByRole('region', { name: 'Favorites' })
    const follows = Node.DOCUMENT_POSITION_FOLLOWING
    expect(grid.compareDocumentPosition(overview) & follows).toBeTruthy()
    expect(overview).toContainElement(favourites)
    expect(overview).toContainElement(document.querySelector('.stat-status'))
    expect(
      screen.getByRole('heading', { level: 2, name: 'Overview' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('region', { name: 'What it does' }),
    ).not.toBeInTheDocument()
    expect(document.querySelector('.tour-status')).toBeNull()
    expect(document.querySelector('.next-band')).toBeNull()
  })

  it('points to How it works under the overview, with the catalogue line', async () => {
    stubApi({ status: STATUS_BODY })
    await renderReady()

    const line = await screen.findByText(/Catalog 5,724 titles/)
    expect(line).toHaveTextContent('12 stores watched')
    expect(document.getElementById('overview')).toContainElement(line)
    expect(
      within(line).getByRole('link', { name: 'How it works' }),
    ).toHaveAttribute('href', '/shelf/how')
  })

  it('links Tonight, Shelfle and the overview from the totals line', async () => {
    stubSnapshot()
    stubApi()
    await renderReady()

    const links = document.querySelector('.shelf-links')
    expect(
      within(links).getByRole('link', { name: /What’s next|Tonight/ }),
    ).toHaveAttribute('href', '/shelf/next')
    expect(
      within(links).getByRole('link', { name: 'Overview' }),
    ).toHaveAttribute('href', '#overview')
  })

  it('labels the filter rows, the sort and the view', async () => {
    stubApi()
    await renderReady()

    expect(screen.getByRole('group', { name: 'Show' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Status' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Sort' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'View' })).toBeInTheDocument()
    expect(
      screen.getByRole('list', { name: 'Key to the marks on covers' }),
    ).toBeInTheDocument()
  })

  it('counts the titles, and offers Clear filters only while filtered', async () => {
    stubApi()
    await renderReady()

    const bar = document.querySelector('.resultbar')
    expect(bar).toHaveTextContent('2 titles')
    expect(
      screen.queryByRole('button', { name: 'Clear filters' }),
    ).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /^Film & TV/ }))
    expect(bar).toHaveTextContent('1 of 2 titles')

    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(bar).toHaveTextContent('2 titles')
    expect(gridTitles()).toHaveLength(2)
  })

  it('clears a search with Clear filters', async () => {
    stubApi()
    await renderReady()

    await userEvent.type(screen.getByRole('searchbox'), 'dune')
    expect(document.querySelector('.resultbar')).toHaveTextContent(
      '1 of 2 titles',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(screen.getByRole('searchbox')).toHaveValue('')
    expect(gridTitles()).toHaveLength(2)
  })

  // The button unmounts itself, so focus must be handed on or it falls to the
  // body and a keyboard user restarts from the top of the page.
  it('moves focus to the search field after Clear filters', async () => {
    stubApi()
    await renderReady()

    await userEvent.click(screen.getByRole('button', { name: /^Film & TV/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(screen.getByRole('searchbox')).toHaveFocus()
  })

  it('keeps Overview as the one h2, with its blocks one level down', async () => {
    stubApi()
    await renderReady()

    const overview = document.getElementById('overview')
    expect(overview).toHaveAccessibleName('Overview')
    expect(within(overview).getAllByRole('heading', { level: 2 })).toHaveLength(
      1,
    )
    expect(
      within(overview).getByRole('heading', { level: 3, name: 'Ratings' }),
    ).toBeInTheDocument()
  })

  it('has one polite live region over the grid, not two', async () => {
    stubApi()
    await renderReady()
    expect(document.querySelectorAll('[aria-live="polite"]')).toHaveLength(1)
  })

  it('says in words when the catalog is stale, and not when it is fresh', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-21T20:00:00Z'))
    stubApi({ status: STATUS_BODY })
    await renderReady()
    const fresh = await screen.findByText(/Catalog 5,724 titles/)
    expect(fresh).toHaveTextContent('refreshed October 21, 2026')
    expect(fresh).not.toHaveTextContent('not refreshed')
    cleanup()

    vi.setSystemTime(new Date('2026-10-25T00:00:00Z'))
    stubApi({ status: STATUS_BODY })
    await renderReady()
    expect(await screen.findByText(/Catalog 5,724 titles/)).toHaveTextContent(
      'not refreshed in over 36 hours',
    )
  })

  it('pages the grid by whole rows, and a filter returns to the first page', async () => {
    const many = Array.from({ length: 60 }, (_, index) => ({
      ...ITEMS[0],
      id: `m${index}`,
      title: `Movie ${String(index).padStart(2, '0')}`,
      favorite: false,
      type: index % 2 ? 'movie' : 'boardgame',
    }))
    stubApi({ items: many, stats: { ...STATS, total: 60 } })
    await renderReady()

    expect(gridTitles()).toHaveLength(28)
    expect(screen.getByText('Showing 28 of 60')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Show 28 more' }))
    expect(gridTitles()).toHaveLength(56)

    await userEvent.click(screen.getByRole('button', { name: /^Film & TV/ }))
    expect(gridTitles()).toHaveLength(28)
    expect(screen.getByText('Showing 28 of 30')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(gridTitles()).toHaveLength(28)
  })

  it("links today's Shelfle when the shelf has a game to guess", async () => {
    const game = {
      ...ITEMS[0],
      id: '77',
      type: 'game',
      title: 'Sea of Stars',
      platform: 'Nintendo Switch',
      year: 2023,
      genres: ['Role-playing (RPG)'],
      time_to_beat_hours: 30,
      favorite: false,
    }
    stubSnapshot({ items: [...ITEMS, game] })
    await renderReady()
    expect(
      screen.getByRole('link', { name: 'Today’s Shelfle →' }),
    ).toHaveAttribute('href', '/daily')
  })

  it('has no Shelfle link when no game could be the answer', async () => {
    stubSnapshot()
    await renderReady()
    expect(screen.queryByRole('link', { name: /Shelfle/ })).toBeNull()
  })

  it('has no axe violations on the landing', async () => {
    stubApi({ status: STATUS_BODY })
    await renderReady()
    await screen.findByText(/Catalog 5,724 titles/)

    // The render container, like the other page tests: the page is drawn
    // without RootLayout's <main>, so the whole body has no landmarks.
    expect(await axeViolations(document.body.firstElementChild)).toEqual([])
  }, 15_000)

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

    const row = within(screen.getByRole('region', { name: 'Favorites' }))
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
      screen.queryByRole('region', { name: 'Favorites' }),
    ).not.toBeInTheDocument()
  })

  it('does not ask visitors to pick favourites when there are none', async () => {
    stubApi({ items: ITEMS.map((item) => ({ ...item, favorite: false })) })
    await renderReady()

    expect(screen.queryByText(/pick your favorites/i)).toBeNull()
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
    // Reachable by keyboard, like the rating bars: the count is not hover-only.
    expect(months.every((month) => month.tabIndex === 0)).toBe(true)
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

  it('searches the shelf by title', async () => {
    stubApi()
    await renderReady()

    await userEvent.type(
      screen.getByRole('searchbox', { name: 'Search the shelf' }),
      'gloom',
    )
    expect(gridTitles()).toEqual(['Gloomhaven'])

    await userEvent.clear(screen.getByRole('searchbox'))
    await userEvent.type(screen.getByRole('searchbox'), 'zelda')
    expect(
      screen.getByText('Nothing on the shelf matches “zelda”.'),
    ).toBeInTheDocument()
  })

  // The site search's no-match link: /shelf?q=… opens already searched.
  it('starts searched when the URL carries ?q=', async () => {
    stubApi()
    await renderReady('/shelf?q=gloom')

    expect(
      screen.getByRole('searchbox', { name: 'Search the shelf' }),
    ).toHaveValue('gloom')
    expect(gridTitles()).toEqual(['Gloomhaven'])
  })

  // Already on /shelf, the no-match link only changes the query string, so
  // the page stays mounted and has to pick the new ?q= up.
  it('follows ?q= when it changes while the page is open', async () => {
    stubApi()
    render(
      <MemoryRouter initialEntries={['/shelf']}>
        <Link to="/shelf?q=gloom">search gloom</Link>
        <Routes>
          <Route path="/shelf" element={<Collection />} />
        </Routes>
      </MemoryRouter>,
    )
    await waitFor(() =>
      expect(document.querySelector('.poster-grid')).not.toBeNull(),
    )
    await userEvent.click(screen.getByRole('link', { name: 'search gloom' }))

    expect(
      screen.getByRole('searchbox', { name: 'Search the shelf' }),
    ).toHaveValue('gloom')
    expect(gridTitles()).toEqual(['Gloomhaven'])
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
      screen.getByText(/no titles match these filters/i),
    ).toBeInTheDocument()
  })

  it('sorts by recently added by default, and re-sorts on request', async () => {
    stubApi()
    await renderReady()

    expect(gridTitles()).toEqual(['Gloomhaven', 'Dune'])

    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Sort' }),
      'Title',
    )
    expect(gridTitles()).toEqual(['Dune', 'Gloomhaven'])

    await userEvent.click(screen.getByRole('button', { name: 'Order: A to Z' }))
    expect(gridTitles()).toEqual(['Gloomhaven', 'Dune'])
  })

  // Asserts the seed changes rather than the order: two shuffles of a
  // two-item fixture agree half the time.
  it('reseeds on Shuffle', async () => {
    stubApi()
    await renderReady()

    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Sort' }),
      'Random',
    )
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

  it('chips, bars and never dims a paused game', async () => {
    const paused = {
      ...ITEMS[1],
      id: '3',
      type: 'game',
      title: 'Elden Ring',
      status: 'paused',
      wanted: false,
    }
    stubApi({
      items: [...ITEMS, paused],
      stats: { ...STATS, by_status: { active: 2, paused: 1, finished: 1 } },
    })
    await renderReady()

    expect(screen.getByRole('button', { name: /Paused/ })).toHaveTextContent(
      '1',
    )
    // Between Playing and Finished, as on the chips.
    expect(
      within(document.querySelector('.status-bar'))
        .getAllByRole('img')
        .map((segment) => segment.getAttribute('aria-label')),
    ).toEqual(['Playing: 2', 'Paused: 1', 'Finished: 1'])

    await userEvent.click(screen.getByRole('button', { name: 'Dim finished' }))
    expect(
      grid().getByText('Elden Ring').closest('.poster-card'),
    ).not.toHaveAttribute('data-dimmed')
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

    expect(await screen.findByRole('alert')).toHaveTextContent(/didn’t load/i)
  })

  it('keeps the header on a failed load, and Try again shows the shelf', async () => {
    let up = false
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url) => {
        const body = String(url).includes('/api/public/items') ? ITEMS : STATS
        return { ok: up, status: up ? 200 : 500, json: async () => body }
      }),
    )
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent(/didn’t load/i)
    expect(
      screen.getByRole('heading', { level: 1, name: 'My Shelf' }),
    ).toBeInTheDocument()
    expect(screen.queryByText('Nothing on the shelf yet.')).toBeNull()
    up = true
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect((await screen.findAllByText('Dune')).length).toBeGreaterThan(0)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('treats a live body of the wrong shape as a failed load', async () => {
    // A 200 whose body is not a list would otherwise throw in the render.
    stubApi({ items: { detail: 'not a list' }, stats: { total: 1 } })
    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent(/didn’t load/i)
  })

  it('renders the required TMDB attribution verbatim', async () => {
    stubApi()
    renderPage()

    expect(
      await screen.findByText(
        /This product uses the TMDB API but is not endorsed or certified by TMDB/i,
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'IGDB' })).toHaveAttribute(
      'href',
      'https://www.igdb.com/',
    )
    expect(screen.getByRole('link', { name: 'Comic Vine' })).toBeInTheDocument()
  })

  it('shows a rating as a star and number without claiming one that is absent', async () => {
    stubApi()
    await renderReady()

    expect(screen.getByLabelText('9 out of 10')).toBeInTheDocument()
    // Gloomhaven has no rating, so exactly one rating exists rather
    // than an empty or zero one implying it was rated badly.
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

    expect(
      await screen.findByText(/nothing on the shelf yet/i),
    ).toBeInTheDocument()
    expect(document.querySelector('.hero-numbers')).toBeNull()
    expect(document.querySelector('.status-bar')).toBeNull()
    expect(document.querySelector('.shelf-toolbar')).toBeNull()
    expect(
      screen.queryByRole('region', { name: 'Favorites' }),
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

describe('Collection snapshot', () => {
  it('paints the snapshot while the server wakes, with no waking notice', async () => {
    stubSnapshot()
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    )
    await renderReady()

    expect(gridTitles()).toEqual(['Gloomhaven', 'Dune'])
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
    expect(screen.queryByText(/didn’t load/i)).toBeNull()
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

describe('Collection and What’s next', () => {
  it('leaves the living strips to What’s next', async () => {
    stubSnapshot()
    stubApi()
    await renderReady()

    for (const name of ['Recent picks', 'Coming to cartridge', 'On the radar'])
      expect(screen.queryByRole('heading', { name })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Up next' })).toBeNull()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(
      screen.getByRole('navigation', { name: 'My Shelf sections' }),
    ).toBeInTheDocument()
  })

  it('puts the project line at the foot of the page', async () => {
    stubSnapshot()
    stubApi()
    await renderReady()

    expect(document.querySelector('.attribution .spine-project')).not.toBeNull()
  })

  it('keeps the header and its tabs while loading and on error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    )
    const { unmount } = renderPage()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(
      screen.getByRole('navigation', { name: 'My Shelf sections' }),
    ).toBeInTheDocument()
    unmount()

    stubApi({ itemsOk: false })
    renderPage()
    await screen.findByText(/didn’t load/i)
    expect(
      screen.getByRole('heading', { level: 1, name: 'My Shelf' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('navigation', { name: 'My Shelf sections' }),
    ).toBeInTheDocument()
  })
})

describe('Collection header', () => {
  it('names My Shelf, says what it is, and links the post and the source', async () => {
    stubApi()
    await renderReady()

    expect(
      screen.getByRole('heading', { level: 1, name: 'My Shelf' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/^A tracker for my physical game and comic collection:/),
    ).toBeInTheDocument()
    expect(screen.getByText(/^I built this myself:/)).toBeInTheDocument()
    // The tab row has its own How it works link; this is the project line's.
    const project = document.querySelector('.spine-project')
    expect(
      within(project).getByRole('link', { name: /How it works/ }),
    ).toHaveAttribute('href', '/shelf/how')
    expect(screen.getByRole('link', { name: /Source/ })).toHaveAttribute(
      'href',
      'https://github.com/joeyh92989/joey-haas.dev',
    )
  })

  // A cold start leads with the waking notice, not a project pitch.
  it('keeps the project line out of the loading state', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    )
    renderPage()

    expect(
      screen.getByRole('heading', { level: 1, name: 'My Shelf' }),
    ).toBeInTheDocument()
    expect(screen.queryByText(/^I built this myself:/)).toBeNull()
  })
})
