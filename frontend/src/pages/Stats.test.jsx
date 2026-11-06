import '@testing-library/jest-dom'
import { act, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CHANGELOG } from '../content/changelog.js'
import {
  COUNTED,
  FROM_SNAPSHOT,
  FROM_SNAPSHOT_ASLEEP,
} from '../content/stats.js'
import { LOAD_ERROR, WAKING } from '../content/status.js'
import { axeViolations } from '../lib/axe.test-util.js'
import { useSnapshotThenLive } from '../lib/useSnapshotThenLive.js'
import Stats from './Stats.jsx'

vi.mock('../lib/useSnapshotThenLive.js', () => ({
  useSnapshotThenLive: vi.fn(),
}))

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
  live_since: '2026-10-20',
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

  it('says live, with the time, once the API has answered', () => {
    mockStats({ data: BODY, live: true })
    renderPage()
    expect(screen.getByRole('status')).toHaveTextContent('Live as of 3:04 PM.')
  })

  it('keeps the snapshot figures and says asleep when the API did not answer', () => {
    mockStats({ data: BODY, failed: true })
    renderPage()
    expect(screen.getByRole('status')).toHaveTextContent(FROM_SNAPSHOT_ASLEEP)
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
    const time = entries[0].querySelector('time')
    expect(time).toHaveAttribute('dateTime', CHANGELOG[0].date)
    expect(time).toHaveTextContent('Nov 6, 2026')
    expect(screen.getByRole('link', { name: 'Stats' })).toHaveAttribute(
      'href',
      '/stats',
    )
  })
})
