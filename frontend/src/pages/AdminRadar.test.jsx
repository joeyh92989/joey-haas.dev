import '@testing-library/jest-dom'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Outlet, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AdminRadar, { ago, byMonth, releaseWords } from './AdminRadar.jsx'

function row(id, fields = {}) {
  return {
    id,
    title: `Game ${id}`,
    cover_url: null,
    release_date: '2026-12-04',
    release_precision: 'day',
    platform: 'Nintendo Switch 2',
    physical_format: 'game_card',
    format_note: null,
    reasons: ['IGDB lists it beside Dredge ♥'],
    score: 70,
    status: 'pending',
    store_lines: [],
    hypes: 20,
    lane: 'dated',
    ...fields,
  }
}

const RADAR = {
  generated_at: '2026-09-27T10:00:00Z',
  personalised: true,
  catalogue: { stores_at: '2026-09-26T10:00:00Z', registry_at: null },
  sections: {
    suggested: [
      row('a'),
      row('b', {
        title: 'Preordered',
        lane: 'preorder',
        store_lines: [
          {
            store: 'Limited Run Games',
            price: '59.99',
            currency: 'USD',
            availability: 'preorder',
            preorder_closes_at: '2026-11-08',
            url: 'https://example.test/b',
          },
        ],
      }),
    ],
    dated_later: [row('c', { title: 'Next Year', release_precision: 'year' })],
    digital: [
      row('d', {
        title: 'Digital Only',
        physical_format: null,
        format_note: 'no physical edition announced',
        lane: 'digital',
      }),
    ],
  },
}

const WATCHING = [
  {
    item: {
      id: 'i1',
      title: 'Watched One',
      cover_url: null,
      platform: 'Nintendo Switch 2',
      release_date: '2027-02-01',
      physical_format: 'game_card',
    },
    preorder: null,
  },
]

function stubApi(handlers = {}) {
  const calls = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url, options = {}) => {
      const path = String(url).replace(/^.*\/api/, '/api')
      const method = options.method ?? 'GET'
      calls.push({ method, path, body: options.body })
      const handler = handlers[`${method} ${path.split('?')[0]}`]
      if (handler) return handler(options)
      if (path.startsWith('/api/recommendations?'))
        return { ok: true, status: 200, json: async () => RADAR }
      if (path === '/api/recommendations/watching')
        return { ok: true, status: 200, json: async () => WATCHING }
      return { ok: true, status: 200, json: async () => ({}) }
    }),
  )
  return calls
}

function renderPage({ signedIn = true } = {}) {
  return render(
    <MemoryRouter initialEntries={['/admin/radar']}>
      <Routes>
        <Route element={<Outlet context={{ signedIn }} />}>
          <Route path="admin/radar" element={<AdminRadar />} />
          <Route path="admin" element={<p>Admin home</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('helpers', () => {
  it('words a date as precisely as it is known', () => {
    expect(releaseWords(row('x'))).toBe('Dec 4, 2026')
    expect(releaseWords(row('x', { release_precision: 'month' }))).toBe(
      'December 2026',
    )
    expect(
      releaseWords(
        row('x', { release_date: '2027-04-01', release_precision: 'quarter' }),
      ),
    ).toBe('Q2 2027')
    expect(releaseWords(row('x', { release_precision: 'year' }))).toBe('2026')
    expect(releaseWords(row('x', { release_date: null }))).toBe(
      'Date not announced',
    )
  })

  it('says how long ago', () => {
    const now = Date.parse('2026-09-27T12:00:00Z')
    expect(ago(null, now)).toBe('never')
    expect(ago('2026-09-27T10:00:00Z', now)).toBe('2 h ago')
    expect(ago('2026-09-20T12:00:00Z', now)).toBe('7 d ago')
  })

  it('groups by month with open pre-orders first', () => {
    const groups = byMonth(RADAR.sections.suggested)
    expect(groups.map(([month]) => month)).toEqual(['December 2026'])
    expect(groups[0][1].map((entry) => entry.id)).toEqual(['b', 'a'])
  })
})

describe('AdminRadar', () => {
  it('shows watching, suggested, dated later and a closed digital section', async () => {
    stubApi()
    renderPage()
    expect(await screen.findByText('Watched One')).toBeInTheDocument()
    expect(screen.getByText('Preordered')).toBeInTheDocument()
    expect(screen.getByText('Next Year')).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Limited Run Games' }),
    ).toHaveAttribute('href', 'https://example.test/b')
    const digital = screen.getByText(/Digital so far/).closest('details')
    expect(digital).not.toHaveAttribute('open')
    expect(
      within(digital).getByText('Digital Only', { selector: 'h3' }),
    ).toBeInTheDocument()
  })

  it('generates with the key-card choice and reads the radar again', async () => {
    const calls = stubApi({
      'POST /api/recommendations/generate': () => ({
        ok: true,
        status: 200,
        json: async () => ({
          batch_id: 'x',
          counts: { suggested: 2, dated_later: 1, digital: 1 },
          digital_error: 'IGDB is not configured',
        }),
      }),
    })
    renderPage()
    await screen.findByText('Preordered')
    await userEvent.click(screen.getByLabelText('Include Game-Key Cards'))
    await userEvent.click(screen.getByRole('button', { name: 'Generate' }))

    const post = calls.find((call) => call.method === 'POST')
    expect(JSON.parse(post.body)).toEqual({
      kind: 'radar',
      include_key_cards: true,
    })
    expect(await screen.findByRole('status')).toHaveTextContent(
      '2 suggested, 1 dated later, 1 digital so far',
    )
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Digital so far is missing: IGDB is not configured',
    )
    await waitFor(() =>
      expect(
        calls.filter((call) => call.path.startsWith('/api/recommendations?')),
      ).toHaveLength(2),
    )
  })

  it('removes a card when the owner answers', async () => {
    const calls = stubApi()
    renderPage()
    await screen.findByText('Next Year')
    const card = screen.getByText('Next Year').closest('article')
    await userEvent.click(within(card).getByRole('button', { name: 'Skip' }))
    await waitFor(() =>
      expect(screen.queryByText('Next Year')).not.toBeInTheDocument(),
    )
    expect(calls).toContainEqual(
      expect.objectContaining({
        method: 'POST',
        path: '/api/recommendations/c/skip',
      }),
    )
  })

  it('says a watched game is already on the shelf, not a refresh', async () => {
    stubApi({
      'POST /api/recommendations/a/watch': () => ({
        ok: false,
        status: 409,
        json: async () => ({ detail: 'Already on your shelf' }),
      }),
    })
    renderPage()
    await screen.findByText('Game a')
    const card = screen.getByText('Game a').closest('article')
    await userEvent.click(within(card).getByRole('button', { name: 'Watch' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Game a is already on your shelf',
    )
  })

  it('says when it is ranked by anticipation, not taste', async () => {
    stubApi({
      'GET /api/recommendations': () => ({
        ok: true,
        status: 200,
        json: async () => ({ ...RADAR, personalised: false }),
      }),
    })
    renderPage()
    expect(
      await screen.findByText(/Ranked by anticipation/),
    ).toBeInTheDocument()
  })

  it('asks to sign in when signed out', async () => {
    stubApi({
      'GET /api/recommendations': () => ({
        ok: false,
        status: 401,
        json: async () => ({}),
      }),
    })
    renderPage({ signedIn: false })
    expect(await screen.findByRole('link', { name: 'Sign in' })).toBeVisible()
  })
})
