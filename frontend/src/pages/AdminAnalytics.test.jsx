import '@testing-library/jest-dom'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AdminAnalytics from './AdminAnalytics.jsx'

const json = (body, status = 200) => ({
  ok: status === 200,
  status,
  json: async () => body,
})

/** A read over `days` days ending 14 Oct, empty unless overridden. */
function body(days, overrides = {}) {
  return {
    range: `${days}d`,
    start: '2026-10-08',
    end: '2026-10-14',
    views: 0,
    visitors: 0,
    views_per_visitor: 0,
    best_day: null,
    series: Array.from({ length: days }, (_, n) => ({
      day: `2026-10-${String(15 - days + n).padStart(2, '0')}`,
      views: 0,
    })),
    pages: [],
    referrers: [],
    devices: [],
    live_since: '2026-10-08',
    ...overrides,
  }
}

const FULL = body(7, {
  views: 9,
  visitors: 4,
  views_per_visitor: 2.3,
  best_day: { day: '2026-10-12', views: 6, referrer: 'news.example.com' },
  series: [0, 1, 0, 0, 6, 2, 0].map((views, n) => ({
    day: `2026-10-${String(8 + n).padStart(2, '0')}`,
    views,
  })),
  pages: [
    { value: '/', count: 6 },
    { value: '/about', count: 3 },
  ],
  referrers: [
    { value: '', count: 1 },
    { value: 'news.example.com', count: 3 },
  ],
  devices: [{ value: 'phone', count: 9 }],
})

/** The read's answer per range; every request is recorded. */
function stubApi(answers) {
  const fetch = vi.fn(async (url) => {
    const range = new URL(String(url), 'http://x').searchParams.get('range')
    const answer = answers[range]
    if (answer instanceof Error) throw answer
    return answer ?? json({}, 500)
  })
  vi.stubGlobal('fetch', fetch)
  return fetch
}

const tile = (label) => screen.getByText(label).closest('.stat-tile')

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('AdminAnalytics', () => {
  it('says loading, not "None yet", before the first read answers', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    )
    render(<AdminAnalytics />)
    expect(screen.queryByText('None yet.')).not.toBeInTheDocument()
    expect(screen.getAllByText('Loading…')).toHaveLength(4)
  })

  it('opens on 30 days and shows zeros with the launch date when empty', async () => {
    const fetch = stubApi({ '30d': json(body(30)) })
    render(<AdminAnalytics />)
    expect(
      await screen.findByText(
        'No views yet. The beacon is live; check back tomorrow.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByText('Live since Thu 8 Oct.')).toBeInTheDocument()
    expect(String(fetch.mock.calls[0][0])).toMatch(
      /\/api\/analytics\?range=30d$/,
    )
    expect(tile('Page views')).toHaveTextContent('0')
    expect(tile('Visitors')).toHaveTextContent('0')
    expect(tile('Best day')).toHaveTextContent('No views yet')
    expect(screen.queryAllByRole('img')).toEqual([])
    expect(screen.getAllByText('None yet.')).toHaveLength(3)
    expect(document.title).toBe('Analytics · Admin · Joey Haas')
  })

  it('reads a new range when one is pressed', async () => {
    const fetch = stubApi({ '30d': json(body(30)), '7d': json(FULL) })
    render(<AdminAnalytics />)
    await screen.findByText(/beacon is live/)
    fireEvent.click(screen.getByRole('button', { name: '7d' }))
    expect(
      await screen.findByText('Mon 12 Oct · news.example.com'),
    ).toBeInTheDocument()
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(String(fetch.mock.calls[1][0])).toMatch(/range=7d$/)
    expect(screen.getByRole('button', { name: '7d' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(tile('Page views')).toHaveTextContent('9last 7 days')
    expect(tile('Views per visitor')).toHaveTextContent('2.3')
  })

  it('charts the days and lists pages, referrers and devices', async () => {
    stubApi({ '30d': json(FULL) })
    render(<AdminAnalytics />)
    const peak = await screen.findByRole('img', { name: 'Mon 12 Oct: 6 views' })
    expect(peak).toHaveClass('peak')
    const referrers = screen.getByRole('list', {
      name: 'Referrers by visitors',
    })
    expect(
      within(referrers)
        .getAllByRole('listitem')
        .map((row) => row.textContent),
    ).toEqual(['Direct / none1', 'news.example.com3'])
    expect(
      screen.getByRole('list', { name: 'Devices by views' }),
    ).toHaveTextContent('Phone9')
    expect(
      screen.getByRole('list', { name: 'Pages by views' }),
    ).toHaveTextContent('/about3')
  })

  it('says when the read fails, and when the session has ended', async () => {
    stubApi({ '30d': new TypeError('Failed to fetch'), '7d': json({}, 401) })
    render(<AdminAnalytics />)
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The analytics could not be read.',
    )
    expect(tile('Page views')).toHaveTextContent('—')
    fireEvent.click(screen.getByRole('button', { name: '7d' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Your session ended. Reload to sign in.',
    )
  })
})
