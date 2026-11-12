import '@testing-library/jest-dom'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CHANGELOG } from '../content/changelog.js'
import { COUNTED, FROM_SNAPSHOT } from '../content/stats.js'
import { LOAD_ERROR, STALE_COPY, WAKING } from '../content/status.js'
import { axeViolations } from '../lib/axe.test-util.js'
import { flaky } from '../lib/flaky.test-util.js'
import { loadIndex } from '../lib/searchIndex.js'
import { useSnapshotThenLive } from '../lib/useSnapshotThenLive.js'
import Stats from './Stats.jsx'

vi.mock('../lib/useSnapshotThenLive.js', () => ({
  useSnapshotThenLive: vi.fn(),
}))

vi.mock('../lib/searchIndex.js', () => ({ loadIndex: vi.fn() }))

const ITEM = '0b7c6f3e-1111-4c1c-9a50-000000000001'

const DAYS = Array.from({ length: 30 }, (_, index) => ({
  day: `2026-10-${String(index + 1).padStart(2, '0')}`,
  views: index === 29 ? 8 : 1,
}))

const summary = (overrides = {}) => ({
  start: '2026-10-01',
  end: '2026-10-30',
  views: 37,
  visitors: 21,
  views_per_visitor: 1.8,
  best_day: { day: '2026-10-30', views: 8 },
  series: DAYS,
  pages: [
    { value: '/', count: 20 },
    { value: '/shelf', count: 17 },
  ],
  referrers: [
    { value: '', count: 15 },
    { value: 'news.example.com', count: 6 },
  ],
  referrers_other: 0,
  devices: [
    { value: 'desktop', count: 30 },
    { value: 'phone', count: 7 },
  ],
  live_since: '2026-09-01',
  ...overrides,
})

const BODY = {
  thirty: summary(),
  all: summary({ views: 1234, visitors: 567 }),
}

function mockStats(state) {
  vi.mocked(useSnapshotThenLive).mockReturnValue({
    data: null,
    live: false,
    failed: false,
    ...state,
  })
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/stats']}>
      <Stats />
    </MemoryRouter>,
  )
}

const tiles = () => within(screen.getByRole('group', { name: 'Site figures' }))

describe('Stats', () => {
  beforeEach(() => {
    vi.mocked(loadIndex).mockResolvedValue({ unavailable: true })
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date('2026-11-06T15:04:00'))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('paints the snapshot: four tiles, the series, the lists and the snapshot line', async () => {
    mockStats({ data: BODY })
    const { container } = renderPage()
    expect(document.title).toBe('Stats · Joey Haas')
    const figures = tiles()
      .getAllByRole('definition')
      .map((node) => node.textContent)
    expect(figures).toEqual([
      '37',
      'last 30 days',
      '21',
      'last 30 days',
      '1,234',
      'all time',
      '567',
      'all time',
    ])
    expect(screen.getByRole('status')).toHaveTextContent(FROM_SNAPSHOT)
    expect(screen.getAllByRole('img')).toHaveLength(30)
    expect(
      screen.getByRole('table', { name: 'Views per UTC day' }),
    ).toBeInTheDocument()
    const referrers = within(
      screen.getByRole('list', { name: 'Referrers by visitors' }),
    )
    expect(
      referrers.getAllByRole('listitem').map((item) => item.textContent),
    ).toEqual(['Direct / none15', 'news.example.com6'])
    expect(
      within(screen.getByRole('list', { name: 'Devices by views' }))
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['Desktop30', 'Phone7'])
    expect(
      screen.getByRole('heading', { name: 'How this is counted' }),
    ).toBeInTheDocument()
    expect(screen.getByText(COUNTED.join(' '))).toBeInTheDocument()
    expect(await axeViolations(container)).toEqual([])
  })

  it('hides the all-time tiles until counting is over 30 days old', () => {
    const young = { ...BODY, all: summary({ live_since: '2026-10-20' }) }
    mockStats({ data: young })
    renderPage()
    expect(
      tiles()
        .getAllByRole('definition')
        .map((node) => node.textContent),
    ).toEqual(['37', 'last 30 days', '21', 'last 30 days'])
  })

  it('names the busiest day and its count under the chart', () => {
    mockStats({ data: BODY })
    renderPage()
    expect(screen.getByText('Busiest day: Fri 30 Oct, 8 views.')).toBeVisible()
  })

  it('names item, year and month rows, and keeps the path when unknown', async () => {
    vi.mocked(loadIndex).mockResolvedValue({
      entries: [{ g: 'shelf', title: 'Hades', href: `/shelf/${ITEM}/` }],
    })
    mockStats({
      data: {
        ...BODY,
        thirty: summary({
          pages: [
            { value: `/shelf/${ITEM}`, count: 9 },
            { value: '/shelf/year/2026', count: 5 },
            { value: '/shelf/journal/2026-10', count: 4 },
            { value: '/about', count: 2 },
          ],
        }),
      },
    })
    renderPage()
    const list = within(screen.getByRole('list', { name: 'Pages by views' }))
    expect(await list.findByText('Hades')).toBeInTheDocument()
    expect(list.getByText('2026 in review')).toBeInTheDocument()
    expect(list.getByText('October 2026 · My Shelf')).toBeInTheDocument()
    expect(list.getByText('/about')).toBeInTheDocument()
  })

  it('says live, with the time, once the API has answered', () => {
    mockStats({ data: BODY, live: true })
    renderPage()
    expect(screen.getByRole('status')).toHaveTextContent('Live as of 3:04 PM.')
  })

  it('moves from the snapshot line to the live one when the answer lands', () => {
    mockStats({ data: BODY })
    const { rerender } = renderPage()
    expect(screen.getByRole('status')).toHaveTextContent(FROM_SNAPSHOT)
    vi.setSystemTime(new Date('2026-11-06T15:09:00'))
    mockStats({ data: { ...BODY, thirty: summary({ views: 40 }) }, live: true })
    rerender(
      <MemoryRouter initialEntries={['/stats']}>
        <Stats />
      </MemoryRouter>,
    )
    expect(screen.getByRole('status')).toHaveTextContent('Live as of 3:09 PM.')
    expect(tiles().getAllByRole('definition')[0]).toHaveTextContent('40')
  })

  it('renders an older snapshot without referrers_other and a short series', () => {
    const older = summary({ series: DAYS.slice(-5) })
    delete older.referrers_other
    mockStats({ data: { thirty: older, all: older } })
    renderPage()
    expect(screen.getAllByRole('img')).toHaveLength(5)
    const rows = within(
      screen.getByRole('list', { name: 'Referrers by visitors' }),
    ).getAllByRole('listitem')
    expect(rows.map((row) => row.textContent)).toEqual([
      'Direct / none15',
      'news.example.com6',
    ])
  })

  it('keeps the snapshot figures and says so when the API did not answer', () => {
    mockStats({ data: BODY, failed: true, retry: vi.fn() })
    renderPage()
    expect(screen.getByRole('status')).toHaveTextContent(STALE_COPY)
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
    expect(tiles().getAllByRole('definition')[0]).toHaveTextContent('37')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('adds an Other row only when hosts were folded', () => {
    mockStats({
      data: { ...BODY, thirty: summary({ referrers_other: 9 }) },
    })
    renderPage()
    const rows = within(
      screen.getByRole('list', { name: 'Referrers by visitors' }),
    ).getAllByRole('listitem')
    expect(rows.at(-1)).toHaveTextContent('Other9')
  })

  it('says none yet and skips the chart with no views', () => {
    const empty = summary({
      views: 0,
      visitors: 0,
      best_day: null,
      series: DAYS.map((point) => ({ ...point, views: 0 })),
      pages: [],
      referrers: [],
      devices: [],
    })
    mockStats({ data: { thirty: empty, all: empty } })
    renderPage()
    expect(
      screen.getByText('No views in the last 30 days.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.getAllByText('None yet.')).toHaveLength(3)
  })

  it('shows loading, then the waking line, with no snapshot', async () => {
    mockStats({})
    renderPage()
    expect(screen.getByRole('status')).toHaveTextContent('Loading…')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000)
    })
    expect(screen.getByRole('status')).toHaveTextContent(WAKING)
    // The changelog is static copy: it shows whatever the API does.
    expect(screen.getByRole('heading', { name: 'Changes' })).toBeInTheDocument()
  })

  it('keeps its heading on a failed read, and Try again brings the figures', async () => {
    vi.mocked(useSnapshotThenLive).mockImplementation(
      flaky({ data: BODY, live: true }),
    )
    renderPage()
    expect(
      screen.getByRole('heading', { level: 1, name: 'Stats' }),
    ).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(tiles().getAllByRole('definition')[0]).toHaveTextContent('37')
  })

  it('shows the error with no snapshot and a failed read', () => {
    mockStats({ failed: true })
    renderPage()
    expect(screen.getByRole('alert')).toHaveTextContent(LOAD_ERROR)
    expect(screen.queryByRole('group')).toBeNull()
  })

  it('lists the changelog newest first with its links', () => {
    mockStats({ data: BODY })
    const { container } = renderPage()
    const entries = container.querySelectorAll('.changelog > li')
    expect(entries).toHaveLength(CHANGELOG.length)
    expect(entries[0].querySelector('time')).toHaveAttribute(
      'dateTime',
      CHANGELOG[0].date,
    )
    // A past entry, so a new one at the top leaves this alone.
    expect(
      container.querySelector('time[datetime="2026-11-06"]'),
    ).toHaveTextContent('Nov 6, 2026')
    // Scoped to that entry: later entries may link /stats too.
    const past = container
      .querySelector('time[datetime="2026-11-06"]')
      .closest('li')
    expect(within(past).getByRole('link', { name: 'Stats' })).toHaveAttribute(
      'href',
      '/stats',
    )
  })
})
