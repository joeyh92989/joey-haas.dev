import '@testing-library/jest-dom'
import { act, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { intake } from '../content/intake.js'
import { spine } from '../content/spine.js'
import { WAKING } from '../content/status.js'
import userEvent from '@testing-library/user-event'
import { axeViolations } from '../lib/axe.test-util.js'
import { flaky } from '../lib/flaky.test-util.js'
import { useSnapshotThenLive } from '../lib/useSnapshotThenLive.js'
import HowItWorks from './HowItWorks.jsx'

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

const item = (id, title, created_at, fields = {}) => ({
  id,
  type: 'game',
  title,
  cover_url: null,
  wanted: false,
  created_at,
  ...fields,
})

const ITEMS = [
  item('a', 'Oldest', '2026-01-01T00:00:00Z'),
  item('b', 'Second', '2026-05-01T00:00:00Z'),
  item('c', 'Newest', '2026-10-01T00:00:00Z'),
  item('d', 'Wanted one', '2026-10-02T00:00:00Z', { wanted: true }),
  item('e', 'A film', '2026-10-03T00:00:00Z', { type: 'film' }),
  item('f', 'Third', '2026-07-01T00:00:00Z'),
  item('g', 'Fourth', '2026-06-01T00:00:00Z'),
]

const NEXT = {
  generated_at: {},
  tonight: {
    up_next: {
      item_id: 'u1',
      type: 'game',
      title: 'Pinned Game',
      cover_url: null,
      platform: 'Nintendo Switch',
      reasons: [],
    },
    picks: [
      {
        item_id: 'p1',
        type: 'game',
        title: 'First Pick',
        cover_url: null,
        platform: 'Nintendo Switch',
        reasons: ['Waited longest on the shelf'],
      },
    ],
  },
  wanted: [],
  buy_now: [row('Plain Cart'), row('Top Cart', { top_pick: true })],
  preorders: [row('Soon Cart', { release_date: '2026-11-15' })],
  later: [row('Far Cart')],
  not_on_cartridge: [row('Key Card', { physical_format: 'game_key_card' })],
}

const STATUS = {
  refreshed_at: '2026-10-21T00:40:00Z',
  titles: 5724,
  platforms: 2,
  stores_watched: 12,
  listings: 121958,
}

function mockData({ items, next, status = empty }) {
  vi.mocked(useSnapshotThenLive).mockImplementation(
    (name) => ({ items, next, status })[name],
  )
}

const ready = (data) => ({ data, live: true, failed: false })
const empty = { data: null, live: false, failed: true, retry: () => {} }

function renderAt(path = '/shelf/how') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <HowItWorks />
    </MemoryRouter>,
  )
}

const stop = (n) => document.getElementById(`stop-${n}`)

afterEach(() => {
  vi.restoreAllMocks()
})

describe('HowItWorks', () => {
  it('has one h1, the contents and nine stops with headings', () => {
    mockData({ items: ready(ITEMS), next: ready(NEXT) })
    renderAt()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(
      screen.getByRole('heading', { level: 1, name: spine.how.title }),
    ).toBeInTheDocument()
    const toc = screen.getByRole('navigation', { name: spine.how.tocLabel })
    expect(within(toc).getAllByRole('link')).toHaveLength(9)
    expect(within(toc).getAllByRole('link')[2]).toHaveAttribute(
      'href',
      '/shelf/how#stop-3',
    )
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(9)
    expect(document.title).toBe('Tour · My Shelf')
  })

  it('shows the four newest owned games on stop 1', () => {
    mockData({ items: ready(ITEMS), next: ready(NEXT) })
    renderAt()
    const titles = within(stop(1))
      .getAllByRole('link')
      .map((link) => link.textContent)
      .filter((text) => !text.includes('/') && text !== intake.title)
    expect(titles).toEqual(['Newest', 'Third', 'Fourth', 'Second'])
  })

  it('links the intake demo from the photo-intake stop', () => {
    mockData({ items: empty, next: empty })
    renderAt()
    expect(
      within(stop(1)).getByRole('link', { name: intake.title }),
    ).toHaveAttribute('href', '/shelf/intake')
  })

  it('links stop 3 to Pick for me, also before Play Next has picks', () => {
    mockData({ items: empty, next: empty })
    renderAt()
    expect(
      within(stop(3)).getByRole('link', { name: /Try Pick for me/ }),
    ).toHaveAttribute('href', '/shelf/next#pick-for-me')
  })

  it('shows a top-pick cartridge and a skipped row on stop 2', () => {
    mockData({ items: ready(ITEMS), next: ready(NEXT) })
    renderAt()
    expect(within(stop(2)).getByText('Top Cart')).toBeInTheDocument()
    expect(within(stop(2)).getByText('Key Card')).toBeInTheDocument()
    expect(within(stop(2)).queryByText('Plain Cart')).toBeNull()
  })

  it('states the catalog’s live counts on stop 2 once the status answers', () => {
    mockData({ items: ready(ITEMS), next: ready(NEXT), status: ready(STATUS) })
    renderAt()
    const two = within(stop(2))
    expect(
      two.getByText('5,724 matched titles on 2 platforms'),
    ).toBeInTheDocument()
    expect(two.getByText('12 watched, 121,958 listings')).toBeInTheDocument()
  })

  it('keeps stop 2’s written facts without a status', () => {
    mockData({ items: ready(ITEMS), next: ready(NEXT) })
    renderAt()
    expect(within(stop(2)).queryByText(/matched titles/)).toBeNull()
  })

  it('shows Up next and the first pick with its own reason on stop 3', () => {
    mockData({ items: ready(ITEMS), next: ready(NEXT) })
    renderAt()
    const three = within(stop(3))
    expect(three.getByText('Pinned Game')).toBeInTheDocument()
    expect(three.getByText(spine.next.upNext)).toBeInTheDocument()
    const pick = three.getByText('First Pick').closest('li')
    expect(pick).toHaveTextContent('Waited longest on the shelf')
  })

  it('leads stop 3 with the game in hand and drops its pin from Up next', () => {
    const card = {
      item_id: 'u1',
      type: 'game',
      title: 'Pinned Game',
      cover_url: null,
      platform: 'Nintendo Switch',
      time_to_beat_hours: 30,
      playthrough: 1,
      playing_since: '2026-10-24',
      last_played_on: '2026-11-07',
      journal_hours: 31,
      sessions: 9,
      stale: false,
    }
    mockData({
      items: ready(ITEMS),
      next: ready({
        ...NEXT,
        tonight: { ...NEXT.tonight, continuing: [card] },
      }),
    })
    renderAt()
    const three = within(stop(3))
    expect(three.getByRole('article', { name: 'Pinned Game' })).toHaveClass(
      'continue',
    )
    expect(three.queryByText(spine.next.upNext)).toBeNull()
    expect(three.queryByRole('button')).toBeNull()
    expect(three.getByText('First Pick')).toBeInTheDocument()
  })

  it('shows the day’s other picks as covers on stop 3', () => {
    const second = {
      ...NEXT.tonight.picks[0],
      item_id: 'p2',
      title: 'Second Pick',
    }
    mockData({
      items: ready(ITEMS),
      next: ready({
        ...NEXT,
        tonight: { ...NEXT.tonight, picks: [...NEXT.tonight.picks, second] },
      }),
    })
    renderAt()
    const cover = within(stop(3)).getByRole('link', { name: 'Second Pick' })
    expect(cover).toHaveAttribute('href', '/shelf/p2/')
  })

  it('shows one coming-soon and one further-out row on stop 4', () => {
    mockData({ items: ready(ITEMS), next: ready(NEXT) })
    renderAt()
    expect(within(stop(4)).getByText('Soon Cart')).toBeInTheDocument()
    expect(within(stop(4)).getByText('Far Cart')).toBeInTheDocument()
  })

  it('says so in each live box when the shelf is really empty', () => {
    mockData({ items: ready([]), next: ready({}) })
    renderAt()
    for (const n of [1, 2, 3, 4]) {
      expect(stop(n)).toHaveTextContent(spine.how.stops[n - 1].live.empty)
    }
  })

  it('says a failed read failed, never the empty copy', () => {
    mockData({ items: empty, next: empty })
    renderAt()
    for (const n of [1, 2, 3, 4]) {
      expect(stop(n)).not.toHaveTextContent(spine.how.stops[n - 1].live.empty)
    }
    for (const n of [1, 2]) {
      expect(stop(n)).toHaveTextContent(spine.how.liveFailed)
      expect(
        within(stop(n)).getByRole('button', { name: 'Try again' }),
      ).toBeInTheDocument()
    }
  })

  it('raises one alert per failed read: the stops sharing next point to the first', () => {
    mockData({ items: empty, next: empty })
    renderAt()
    // items (stop 1) and next (stop 2) each fail once.
    expect(screen.getAllByRole('alert')).toHaveLength(2)
    for (const n of [3, 4]) {
      expect(within(stop(n)).queryByRole('alert')).toBeNull()
      expect(
        within(stop(n)).queryByRole('button', { name: 'Try again' }),
      ).toBeNull()
      expect(stop(n)).toHaveTextContent(spine.how.liveFailedSame)
    }
  })

  it('turns Loading… into the waking line after the threshold', () => {
    vi.useFakeTimers()
    mockData({
      items: { data: null, live: false, failed: false },
      next: { data: null, live: false, failed: false },
    })
    renderAt()
    expect(within(stop(1)).getByRole('status')).toHaveTextContent('Loading…')
    act(() => {
      vi.advanceTimersByTime(3500)
    })
    expect(within(stop(1)).getByRole('status')).toHaveTextContent(WAKING)
    vi.useRealTimers()
  })

  it('shows the live example after Try again', async () => {
    const reads = {
      items: flaky(ready(ITEMS)),
      next: flaky(ready(NEXT)),
      status: flaky(ready(STATUS)),
    }
    vi.mocked(useSnapshotThenLive).mockImplementation((name) => reads[name]())
    renderAt()
    expect(stop(1)).toHaveTextContent(spine.how.liveFailed)
    await userEvent.click(
      within(stop(1)).getByRole('button', { name: 'Try again' }),
    )
    expect(within(stop(1)).getByText('Newest')).toBeInTheDocument()
    expect(stop(1)).not.toHaveTextContent(spine.how.liveFailed)
  })

  it('withholds store names in the drawings and draws real tables', () => {
    mockData({ items: ready(ITEMS), next: ready(NEXT) })
    renderAt()
    expect(within(stop(2)).getAllByText(spine.how.redacted)).toHaveLength(3)
    expect(within(stop(2)).getAllByRole('columnheader')).toHaveLength(4)
  })

  it('links each stop to its code on GitHub', () => {
    mockData({ items: ready(ITEMS), next: ready(NEXT) })
    renderAt()
    expect(
      within(stop(3)).getByRole('link', { name: /backend\/picker\.py/ }),
    ).toHaveAttribute(
      'href',
      'https://github.com/joeyh92989/joey-haas.dev/blob/main/backend/picker.py',
    )
  })

  it('focuses the stop named by the hash', () => {
    mockData({ items: ready(ITEMS), next: ready(NEXT) })
    renderAt('/shelf/how#stop-5')
    expect(
      screen.getByRole('heading', { level: 2, name: spine.how.stops[4].title }),
    ).toHaveFocus()
  })

  it('has no axe violations, with data and without', async () => {
    mockData({ items: ready(ITEMS), next: ready(NEXT) })
    const { container, unmount } = renderAt()
    expect(await axeViolations(container)).toEqual([])
    unmount()

    mockData({ items: empty, next: empty })
    const bare = renderAt()
    expect(await axeViolations(bare.container)).toEqual([])
  }, 15_000)
})
