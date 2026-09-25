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
    if (path.startsWith('/api/physical/needs-match'))
      return {
        ok: true,
        status: 200,
        json: async () => ({ keys: [], total: 0 }),
      }
    if (path === '/api/physical/disagreements')
      return { ok: true, status: 200, json: async () => ({ items: [] }) }
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
    expect(
      screen.getByText('Needs match', { selector: 'dt' }).nextSibling,
    ).toHaveTextContent('12')
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

const NEEDS = {
  keys: [
    {
      title_normalized: 'star fox',
      platform_id: 508,
      platform: 'Nintendo Switch 2',
      title: 'Star Fox',
      sources: ['nscollectors', 'super_rare'],
      rows: 2,
      candidates: [
        { external_id: '11', title: 'Star Fox 64', year: 1997 },
        { external_id: '12', title: 'Star Fox Zero', year: 2016 },
      ],
    },
    {
      title_normalized: 'he man',
      platform_id: 0,
      platform: null,
      title: 'He-Man and the Masters of the Universe',
      sources: ['limited_run'],
      rows: 1,
      candidates: [],
    },
  ],
  total: 2,
}

describe('Needs match', () => {
  it('lists each key with its candidates, and a platform choice only when it has none', async () => {
    stubApi({ 'GET /api/physical/needs-match': () => json(NEEDS) })
    renderPage()
    const panel = await screen.findByRole('region', { name: 'Needs match' })
    const [starFox, heMan] = await within(panel)
      .findAllByRole('listitem', {
        name: '',
      })
      .then((items) =>
        items.filter((item) => item.className === 'needs-match-row'),
      )
    expect(starFox).toHaveTextContent(
      'Nintendo Switch 2 · nscollectors, super_rare · 2 rows',
    )
    expect(
      within(starFox).getByRole('button', { name: 'Link Star Fox 64 (1997)' }),
    ).toBeInTheDocument()
    expect(within(starFox).queryByRole('combobox')).not.toBeInTheDocument()
    expect(heMan).toHaveTextContent('No platform')
    expect(
      within(heMan).getByRole('combobox', { name: /Platform for He-Man/ }),
    ).toBeInTheDocument()
  })

  it('links a stored candidate and drops the row without a reload', async () => {
    const calls = stubApi({
      'GET /api/physical/needs-match': () => json(NEEDS),
      'POST /api/physical/matches': () => json({ action: 'linked', moved: 0 }),
    })
    renderPage()
    await userEvent.click(
      await screen.findByRole('button', { name: 'Link Star Fox Zero (2016)' }),
    )
    await waitFor(() =>
      expect(
        screen.queryByText('Star Fox', { selector: 'strong' }),
      ).not.toBeInTheDocument(),
    )
    const posted = calls.find((call) => call.path === '/api/physical/matches')
    expect(JSON.parse(posted.body)).toEqual({
      title_normalized: 'star fox',
      platform_id: 508,
      igdb_id: 12,
    })
    expect(
      calls.filter((call) => call.path.startsWith('/api/physical/needs-match')),
    ).toHaveLength(1)
  })

  it('ignores a key and gives a platform-less key a platform', async () => {
    const calls = stubApi({
      'GET /api/physical/needs-match': () => json(NEEDS),
      'POST /api/physical/matches': () => json({ action: 'ok', moved: 1 }),
    })
    renderPage()
    await userEvent.selectOptions(
      await screen.findByRole('combobox', { name: /Platform for He-Man/ }),
      '130',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Set platform' }))
    await userEvent.click(
      screen.getByRole('button', { name: 'Ignore Star Fox' }),
    )
    await waitFor(() =>
      expect(
        calls.filter((call) => call.path === '/api/physical/matches'),
      ).toHaveLength(2),
    )
    const [rekey, ignore] = calls
      .filter((call) => call.path === '/api/physical/matches')
      .map((call) => JSON.parse(call.body))
    expect(rekey).toEqual({
      title_normalized: 'he man',
      platform_id: 0,
      new_platform_id: 130,
    })
    expect(ignore).toEqual({
      title_normalized: 'star fox',
      platform_id: 508,
      ignored: true,
    })
  })

  it('keeps the row and says why when a decision fails', async () => {
    stubApi({
      'GET /api/physical/needs-match': () => json(NEEDS),
      'POST /api/physical/matches': () =>
        json({ detail: 'IGDB is not configured' }, 503),
    })
    renderPage()
    await userEvent.click(
      await screen.findByRole('button', { name: 'Ignore Star Fox' }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'IGDB is not configured',
    )
    expect(
      screen.getByText('Star Fox', { selector: 'strong' }),
    ).toBeInTheDocument()
  })
})

describe('Registry disagreements', () => {
  it('lists each copy against the registry with a link to its edit page', async () => {
    stubApi({
      'GET /api/physical/disagreements': () =>
        json({
          items: [
            {
              item_id: 'i-1',
              title: 'A Game',
              region: 'USA',
              yours: 'game_card',
              yours_source: 'manual',
              registry: 'game_key_card',
              cart_id: 'LP-AAC4B-USA-0',
              note: 'n',
            },
          ],
        }),
    })
    renderPage()
    const panel = await screen.findByRole('region', {
      name: 'Registry disagreements',
    })
    expect(
      await within(panel).findByRole('link', { name: 'A Game' }),
    ).toHaveAttribute('href', '/admin/collection/i-1')
    expect(panel).toHaveTextContent(
      'Yours: full game on cartridge (manual) · Registry: Game-Key Card (LP-AAC4B-USA-0)',
    )
  })

  it('says so in one line when there are none', async () => {
    stubApi()
    renderPage()
    expect(
      await screen.findByText('No copy disagrees with the registry.'),
    ).toBeInTheDocument()
  })
})
