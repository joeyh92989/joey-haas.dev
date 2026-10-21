import '@testing-library/jest-dom'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { spine } from '../content/spine.js'
import { axeViolations } from '../lib/axe.test-util.js'
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

function mockData({ items, next }) {
  vi.mocked(useSnapshotThenLive).mockImplementation((name) =>
    name === 'items' ? items : next,
  )
}

const ready = (data) => ({ data, live: true, failed: false })
const empty = { data: null, live: false, failed: true }

function renderAt(path = '/spine/how') {
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
  it('has one h1, the contents and eight stops with headings', () => {
    mockData({ items: ready(ITEMS), next: ready(NEXT) })
    renderAt()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(
      screen.getByRole('heading', { level: 1, name: spine.how.title }),
    ).toBeInTheDocument()
    const toc = screen.getByRole('navigation', { name: spine.how.tocLabel })
    expect(within(toc).getAllByRole('link')).toHaveLength(8)
    expect(within(toc).getAllByRole('link')[2]).toHaveAttribute(
      'href',
      '/spine/how#stop-3',
    )
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(8)
    expect(document.title).toBe('How it works · Spine')
  })

  it('shows the four newest owned games on stop 1', () => {
    mockData({ items: ready(ITEMS), next: ready(NEXT) })
    renderAt()
    const titles = within(stop(1))
      .getAllByRole('link')
      .map((link) => link.textContent)
      .filter((text) => !text.includes('/'))
    expect(titles).toEqual(['Newest', 'Third', 'Fourth', 'Second'])
  })

  it('shows a top-pick cartridge and a skipped row on stop 2', () => {
    mockData({ items: ready(ITEMS), next: ready(NEXT) })
    renderAt()
    expect(within(stop(2)).getByText('Top Cart')).toBeInTheDocument()
    expect(within(stop(2)).getByText('Key Card')).toBeInTheDocument()
    expect(within(stop(2)).queryByText('Plain Cart')).toBeNull()
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

  it('shows one coming-soon and one further-out row on stop 4', () => {
    mockData({ items: ready(ITEMS), next: ready(NEXT) })
    renderAt()
    expect(within(stop(4)).getByText('Soon Cart')).toBeInTheDocument()
    expect(within(stop(4)).getByText('Far Cart')).toBeInTheDocument()
  })

  it('says so in each live box when there is nothing to show', () => {
    mockData({ items: empty, next: empty })
    renderAt()
    for (const n of [1, 2, 3, 4]) {
      expect(stop(n)).toHaveTextContent(spine.how.stops[n - 1].live.empty)
    }
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
    renderAt('/spine/how#stop-5')
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
