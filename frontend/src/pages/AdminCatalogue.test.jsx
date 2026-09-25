import '@testing-library/jest-dom'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Outlet, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AdminCatalogue, { runState } from './AdminCatalogue.jsx'

function run(source, fields = {}) {
  return {
    source,
    name: source,
    started_at: '2026-09-25T12:00:00Z',
    finished_at: '2026-09-25T12:01:00Z',
    ok: true,
    rows_seen: 42,
    rows_changed: 3,
    rows_retired: 0,
    items_synced: 0,
    unresolved_remaining: 0,
    short_run: false,
    errors: [],
    ...fields,
  }
}

const STATUS = {
  sources: [
    {
      source: 'super_rare',
      name: 'Super Rare Games',
      kind: 'store',
      last_run: run('super_rare'),
      consecutive_failures: 0,
      needs_attention: false,
    },
    {
      source: 'gamefairy',
      name: 'GameFairy',
      kind: 'store',
      last_run: run('gamefairy', {
        ok: false,
        errors: [{ code: 'http_error', detail: 'HTTP 500' }],
      }),
      consecutive_failures: 3,
      needs_attention: true,
    },
    {
      source: 'nscollectors',
      name: 'r/NSCollectors registry',
      kind: 'registry',
      last_run: run('nscollectors', { short_run: true }),
      consecutive_failures: 0,
      needs_attention: false,
    },
    {
      source: 'igdb_platform',
      name: 'N64 (IGDB)',
      kind: 'platform',
      last_run: null,
      consecutive_failures: 0,
      needs_attention: false,
    },
  ],
  totals: {
    live_editions: 1100,
    live_listings: 900,
    cached_games: 300,
    unresolved_keys: 142,
    pending_keys: 12,
    keys_without_platform: 4,
    disagreements: 1,
  },
}

/** Answers by URL and method; `handlers` override single routes. */
function stubApi(handlers = {}) {
  const calls = []
  const mock = vi.fn(async (url, options = {}) => {
    const path = String(url).replace(/^.*\/api/, '/api')
    const method = options.method ?? 'GET'
    calls.push({ method, path, body: options.body })
    const handler = handlers[`${method} ${path.split('?')[0]}`]
    if (handler) return handler(options)
    if (path === '/api/physical/status')
      return { ok: true, status: 200, json: async () => STATUS }
    return { ok: true, status: 200, json: async () => ({}) }
  })
  vi.stubGlobal('fetch', mock)
  return calls
}

function json(body, status = 200) {
  return { ok: status < 300, status, json: async () => body }
}

function renderPage({ signedIn = true } = {}) {
  return render(
    <MemoryRouter initialEntries={['/admin/catalogue']}>
      <Routes>
        <Route element={<Outlet context={{ signedIn }} />}>
          <Route path="admin/catalogue" element={<AdminCatalogue />} />
          <Route path="admin" element={<p>Admin home</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('runState', () => {
  it('reads a run in words', () => {
    expect(runState(null)).toBe('never run')
    expect(runState(run('x'))).toBe('ok')
    expect(runState(run('x', { short_run: true }))).toBe(
      'ok, short run — nothing retired',
    )
    expect(
      runState(
        run('x', {
          ok: false,
          errors: [
            { code: 'http_error', detail: 'a' },
            { code: 'robots_disallowed', detail: 'b' },
          ],
        }),
      ),
    ).toBe('failed, 2 errors')
    expect(
      runState(run('x', { errors: [{ code: 'info', detail: 'covers' }] })),
    ).toBe('ok')
    expect(runState(run('x', { ok: null }))).toBe('running')
  })
})

describe('AdminCatalogue', () => {
  it('shows one row per source with its state in words', async () => {
    stubApi()
    renderPage()
    const table = await screen.findByRole('table', { name: 'Sources' })
    const rows = within(table).getAllByRole('row')
    expect(rows).toHaveLength(5)
    // Registries first, then stores, then the platform ingest.
    expect(within(rows[1]).getByRole('rowheader')).toHaveTextContent(
      'r/NSCollectors registry',
    )
    expect(rows[1]).toHaveTextContent('ok, short run — nothing retired')
    const gamefairy = rows.find((row) => row.textContent.includes('GameFairy'))
    expect(gamefairy).toHaveTextContent('failed, 1 error')
    expect(gamefairy).toHaveTextContent('HTTP 500')
    expect(
      within(gamefairy).getByRole('img', { name: 'Needs attention' }),
    ).toBeInTheDocument()
    expect(rows[4]).toHaveTextContent('never run')
    expect(screen.getByText('Needs match').nextSibling).toHaveTextContent('12')
  })

  it('refreshes all stores, then reads the status again', async () => {
    const calls = stubApi({
      'POST /api/physical/refresh': () =>
        json({ runs: [], unresolved_remaining: 7 }),
    })
    renderPage()
    await screen.findByRole('table', { name: 'Sources' })
    await userEvent.click(
      screen.getByRole('button', { name: 'Refresh stores' }),
    )
    expect(await screen.findByText('7 left to resolve')).toBeInTheDocument()
    const refresh = calls.find((call) => call.path === '/api/physical/refresh')
    expect(JSON.parse(refresh.body)).toEqual({})
    expect(
      calls.filter((call) => call.path === '/api/physical/status'),
    ).toHaveLength(2)
  })

  it('refreshes one store from its row', async () => {
    const calls = stubApi({
      'POST /api/physical/refresh': () =>
        json({ runs: [], unresolved_remaining: 0 }),
    })
    renderPage()
    await userEvent.click(
      await screen.findByRole('button', { name: 'Refresh Super Rare Games' }),
    )
    await waitFor(() =>
      expect(calls.some((call) => call.path === '/api/physical/refresh')).toBe(
        true,
      ),
    )
    const refresh = calls.find((call) => call.path === '/api/physical/refresh')
    expect(JSON.parse(refresh.body)).toEqual({ stores: ['super_rare'] })
  })

  it('refreshes the registry and N64 through their routes', async () => {
    const calls = stubApi({
      'POST /api/physical/refresh-registry': () =>
        json({
          runs: [run('nscollectors', { items_synced: 2 })],
          unresolved_remaining: 3,
        }),
      'POST /api/physical/refresh-platform': () =>
        json(run('igdb_platform', { rows_seen: 234 })),
    })
    renderPage()
    await userEvent.click(
      await screen.findByRole('button', { name: 'Refresh registry' }),
    )
    expect(
      await screen.findByText('2 copies synced; 3 left to resolve'),
    ).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Refresh N64' }))
    expect(await screen.findByText('N64: 234 games')).toBeInTheDocument()
    expect(calls.map((call) => call.path)).toContain(
      '/api/physical/refresh-platform?platform_id=4',
    )
  })

  it('loops Resolve until nothing remains', async () => {
    const left = [200, 100, 0]
    const calls = stubApi({
      'POST /api/physical/resolve': () =>
        json({
          resolved: 100,
          pending: 0,
          games_fetched: 50,
          unresolved_remaining: left.shift(),
          errors: [],
        }),
    })
    renderPage()
    await userEvent.click(
      await screen.findByRole('button', { name: 'Resolve' }),
    )
    expect(
      await screen.findByText('Everything is resolved'),
    ).toBeInTheDocument()
    expect(
      calls.filter((call) => call.path === '/api/physical/resolve'),
    ).toHaveLength(3)
  })

  it('stops Resolve on an error and says why', async () => {
    const calls = stubApi({
      'POST /api/physical/resolve': () =>
        json({
          resolved: 2,
          pending: 0,
          games_fetched: 0,
          unresolved_remaining: 98,
          errors: [
            {
              code: 'igdb_rate_limited',
              detail: 'IGDB rate limit; press again',
            },
          ],
        }),
    })
    renderPage()
    await userEvent.click(
      await screen.findByRole('button', { name: 'Resolve' }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'IGDB rate limit; press again',
    )
    expect(
      calls.filter((call) => call.path === '/api/physical/resolve'),
    ).toHaveLength(1)
  })

  it('stops Resolve on a non-2xx in words', async () => {
    stubApi({
      'POST /api/physical/resolve': () => json({ detail: 'Bad gateway' }, 502),
    })
    renderPage()
    await userEvent.click(
      await screen.findByRole('button', { name: 'Resolve' }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent('Bad gateway')
  })

  it('says a refresh is already running on 409', async () => {
    stubApi({
      'POST /api/physical/refresh': () =>
        json({ detail: 'A refresh is already running' }, 409),
    })
    renderPage()
    await userEvent.click(
      await screen.findByRole('button', { name: 'Refresh stores' }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A refresh is already running',
    )
  })

  it('asks for a sign-in when the API says 401', async () => {
    stubApi({
      'GET /api/physical/status': () =>
        json({ detail: 'Not authenticated' }, 401),
    })
    renderPage({ signedIn: false })
    expect(
      await screen.findByRole('link', { name: 'Sign in' }),
    ).toHaveAttribute('href', '/admin')
  })
})
