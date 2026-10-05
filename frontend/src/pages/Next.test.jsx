import '@testing-library/jest-dom'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useSnapshotThenLive } from '../lib/useSnapshotThenLive.js'
import Next from './Next.jsx'

vi.mock('../lib/useMediaQuery.js', () => ({ useMediaQuery: () => false }))
vi.mock('../lib/useSnapshotThenLive.js', () => ({
  useSnapshotThenLive: vi.fn(),
}))

const row = (title, fields = {}) => ({
  title,
  platform: 'Nintendo Switch 2',
  physical_format: 'game_card',
  release_date: null,
  release_precision: null,
  cover_url: null,
  igdb_url: null,
  reasons: [],
  top_pick: false,
  new: false,
  item_id: null,
  ...fields,
})

const NEXT = {
  generated_at: {
    picks: '2026-10-04',
    catalogue: '2026-10-04T00:40:00Z',
    radar: null,
    discover: '2026-10-04T00:45:00Z',
  },
  tonight: {
    up_next: null,
    picks: [
      {
        item_id: 'p1',
        type: 'game',
        title: 'Hades II',
        cover_url: null,
        platform: 'Nintendo Switch',
        reasons: ['A reason'],
      },
    ],
  },
  wanted: [],
  buy_now: [
    row('Old', { release_date: '2026-01-01' }),
    row('Fresh', { release_date: '2026-09-20', new: true, top_pick: true }),
    row('Cart', { platform: 'Nintendo Switch' }),
  ],
  preorders: [
    row('Soon', { release_date: '2026-10-15', release_precision: 'day' }),
  ],
  later: [],
  not_on_cartridge: [row('Digital', { physical_format: null })],
}

function mockNext(state) {
  vi.mocked(useSnapshotThenLive).mockReturnValue(state)
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/spine/next']}>
      <Next />
    </MemoryRouter>,
  )
}

afterEach(() => {
  localStorage.clear()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('Next', () => {
  it('has one h1, the freshness line and every section in order', () => {
    mockNext({ data: NEXT, live: true, failed: false })
    renderPage()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'What’s next',
    )
    expect(screen.getByText(/Picks from/)).toBeInTheDocument()
    const headings = screen
      .getAllByRole('heading', { level: 2 })
      .map((h) => h.textContent)
    expect(headings).toEqual([
      'Tonight',
      'Wanted',
      'Buy now',
      'Pre-orders',
      'Later',
    ])
    expect(screen.getByText('Nothing pinned tonight.')).toBeInTheDocument()
    expect(screen.getByText('Nothing on the want list.')).toBeInTheDocument()
    expect(screen.getByText('Nothing further out yet.')).toBeInTheDocument()
  })

  it('sets the page title', () => {
    mockNext({ data: NEXT, live: true, failed: false })
    renderPage()
    expect(document.title).toBe('What’s next · Spine')
  })

  it('links tonight’s picks to their item pages, with Up next first', () => {
    mockNext({
      data: {
        ...NEXT,
        tonight: {
          ...NEXT.tonight,
          up_next: {
            item_id: 'u1',
            type: 'game',
            title: 'Pinned Game',
            cover_url: null,
            platform: 'Nintendo Switch 2',
            reasons: [],
          },
        },
      },
      live: true,
      failed: false,
    })
    renderPage()
    const tonight = screen.getByRole('region', { name: 'Tonight' })
    const links = within(tonight).getAllByRole('link')
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/spine/u1',
      '/spine/p1',
    ])
    expect(within(links[0]).getByText('Up next')).toBeInTheDocument()
    expect(within(tonight).queryByText('Nothing pinned tonight.')).toBeNull()
  })

  it('groups Buy now by console and sorts by newest on request', async () => {
    mockNext({ data: NEXT, live: true, failed: false })
    renderPage()
    const buy = screen.getByRole('region', { name: 'Buy now' })
    expect(
      within(buy)
        .getAllByRole('heading', { level: 3 })
        .map((h) => h.textContent),
    ).toEqual(['Nintendo Switch 2', 'Nintendo Switch'])
    await userEvent.click(within(buy).getByRole('button', { name: 'Newest' }))
    const titles = within(buy)
      .getAllByText(/^(Old|Fresh)$/)
      .map((n) => n.textContent)
    expect(titles).toEqual(['Fresh', 'Old'])
    expect(localStorage.getItem('shelf.next.sort')).toBe('"newest"')
  })

  it('offers no direction for Buy now’s fixed-order sorts', () => {
    mockNext({ data: NEXT, live: true, failed: false })
    renderPage()
    const buy = screen.getByRole('region', { name: 'Buy now' })
    expect(within(buy).queryByRole('button', { name: /direction/i })).toBeNull()
  })

  it('restores a stored sort and ignores an unknown one', () => {
    localStorage.setItem('shelf.next.sort', '"newest"')
    mockNext({ data: NEXT, live: true, failed: false })
    const { unmount } = renderPage()
    expect(screen.getByRole('button', { name: 'Newest' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    unmount()
    localStorage.setItem('shelf.next.sort', '"price"')
    renderPage()
    expect(screen.getByRole('button', { name: 'Best match' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  // A game can be on both Switches, so the title alone is not a row's key.
  it('shows a game listed on both Switches twice', () => {
    mockNext({
      data: {
        ...NEXT,
        buy_now: [row('Twice'), row('Twice', { platform: 'Nintendo Switch' })],
      },
      live: true,
      failed: false,
    })
    renderPage()
    const buy = screen.getByRole('region', { name: 'Buy now' })
    expect(within(buy).getAllByText('Twice')).toHaveLength(2)
  })

  it('keeps Not on cartridge in a details element', () => {
    mockNext({ data: NEXT, live: true, failed: false })
    const { container } = renderPage()
    const details = container.querySelector('details')
    expect(within(details).getByText(/Not on cartridge/)).toBeInTheDocument()
    expect(within(details).getByText(/not for the shelf/)).toBeInTheDocument()
    expect(within(details).getByText('Digital')).toBeInTheDocument()
  })

  it('shows stale data when the live call failed after a snapshot', () => {
    mockNext({ data: NEXT, live: false, failed: true })
    renderPage()
    expect(screen.getByRole('region', { name: 'Buy now' })).toBeInTheDocument()
    expect(screen.queryByText(/could not be loaded/)).toBeNull()
  })

  it('says it could not load with neither snapshot nor live data', () => {
    mockNext({ data: null, live: false, failed: true })
    renderPage()
    expect(
      screen.getByText('What’s next could not be loaded. Try again shortly.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 2 })).toBeNull()
  })

  it('says it is waking the server only without a snapshot', () => {
    vi.useFakeTimers()
    mockNext({ data: null, live: false, failed: false })
    renderPage()
    expect(screen.getByRole('status')).toHaveTextContent('Loading…')
    act(() => {
      vi.advanceTimersByTime(3500)
    })
    expect(screen.getByText(/Waking the server/)).toBeInTheDocument()
  })

  it('never says it is waking the server once a snapshot has painted', () => {
    vi.useFakeTimers()
    mockNext({ data: NEXT, live: false, failed: false })
    renderPage()
    act(() => {
      vi.advanceTimersByTime(3500)
    })
    expect(screen.queryByText(/Waking the server/)).toBeNull()
  })
})
