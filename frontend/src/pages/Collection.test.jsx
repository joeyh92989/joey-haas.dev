import '@testing-library/jest-dom'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Collection from './Collection.jsx'

/**
 * Queries scoped to the poster grid.
 *
 * Titles deliberately appear twice on this page -- once in the
 * recently-finished strip and once in the grid -- so an unscoped getByText
 * would fail on the duplication rather than on anything being wrong.
 */
function grid() {
  return within(document.querySelector('.poster-grid'))
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
  },
]

const STATS = {
  total: 2,
  by_type: { movie: 1, boardgame: 1 },
  by_status: { finished: 1, backlog: 1 },
  rating_histogram: { 9: 1 },
  finishes_by_month: { '2026-03': 1 },
}

function stubApi({ items = ITEMS, stats = STATS, itemsOk = true } = {}) {
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
      return { ok: true, status: 200, json: async () => stats }
    }),
  )
}

afterEach(() => {
  // Unconditional, so a test that fails before its own cleanup cannot leave
  // fake timers installed and time out every test after it.
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('Collection', () => {
  it('renders a poster for every public item', async () => {
    stubApi()
    render(<Collection />)

    await screen.findByText('By type')
    expect(grid().getByText('Dune')).toBeInTheDocument()
    expect(grid().getByText('Gloomhaven')).toBeInTheDocument()
  })

  it('shows the stats block', async () => {
    stubApi()
    render(<Collection />)

    expect(await screen.findByText('By type')).toBeInTheDocument()
    expect(screen.getByText('Ratings')).toBeInTheDocument()
    // The month key is rendered readably, not as "2026-03".
    expect(screen.getByText('Mar 2026')).toBeInTheDocument()
  })

  it('filters the grid by type', async () => {
    stubApi()
    render(<Collection />)
    await screen.findByText('By type')

    await userEvent.selectOptions(screen.getByLabelText('Type'), 'boardgame')

    expect(grid().queryByText('Dune')).not.toBeInTheDocument()
    expect(grid().getByText('Gloomhaven')).toBeInTheDocument()
  })

  it('says so when filters match nothing, rather than looking empty', async () => {
    stubApi()
    render(<Collection />)
    await screen.findByText('By type')

    await userEvent.selectOptions(screen.getByLabelText('Status'), 'abandoned')

    expect(
      screen.getByText(/nothing matches those filters/i),
    ).toBeInTheDocument()
  })

  it('announces the cold start rather than showing a bare spinner', async () => {
    // The free tier sleeps after about fifteen minutes; a spinner for thirty
    // seconds reads as broken rather than slow.
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    )
    render(<Collection />)

    expect(screen.getByText('Loading…')).toBeInTheDocument()
    await waitFor(
      () => expect(screen.getByText(/waking the server/i)).toBeInTheDocument(),
      { timeout: 4000 },
    )
  })

  it('reports a failed load instead of an empty collection', async () => {
    stubApi({ itemsOk: false })
    render(<Collection />)

    expect(await screen.findByText(/could not be loaded/i)).toBeInTheDocument()
  })

  it('renders the required TMDB attribution verbatim', async () => {
    stubApi()
    render(<Collection />)

    expect(
      await screen.findByText(
        /This product uses the TMDB API but is not endorsed or certified by TMDB/i,
      ),
    ).toBeInTheDocument()
    expect(screen.getByText(/Comic Vine/)).toBeInTheDocument()
  })

  it('shows a rating as stars without claiming one that is absent', async () => {
    stubApi()
    render(<Collection />)

    expect(await screen.findByLabelText('9 out of 10')).toBeInTheDocument()
    // Gloomhaven has no rating, so exactly one star element exists rather
    // than an empty or zero-star one implying it was rated badly.
    expect(screen.getAllByLabelText(/out of 10/)).toHaveLength(1)
  })

  it('says nothing here yet on an empty collection', async () => {
    stubApi({ items: [], stats: { ...STATS, total: 0 } })
    render(<Collection />)

    expect(await screen.findByText(/nothing here yet/i)).toBeInTheDocument()
  })
})
