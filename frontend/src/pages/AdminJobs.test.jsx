import '@testing-library/jest-dom'
import { render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ownerYear } from '../lib/formatDate.js'
import AdminLayout from '../layouts/AdminLayout.jsx'
import AdminJobs from './AdminJobs.jsx'

vi.mock('../lib/useMediaQuery.js', () => ({ useMediaQuery: () => false }))

// Rendered under its layout, which checks the session and loads the rows.
function renderAt(path = '/admin/jobs') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/admin" element={<AdminLayout />}>
          <Route path="jobs" element={<AdminJobs />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

const HOUR = 3600 * 1000
const ago = (hours) => new Date(Date.now() - hours * HOUR).toISOString()
const json = (body, ok = true) => ({
  ok,
  status: ok ? 200 : 500,
  json: async () => body,
})
const YEAR = ownerYear()

const ITEMS = [
  {
    id: 1,
    title: 'Dredge',
    type: 'game',
    status: 'active',
    owned_format: 'cartridge',
    is_public: true,
    rating: null,
    finished_at: null,
    updated_at: ago(2),
  },
  {
    id: 2,
    title: 'Celeste',
    type: 'game',
    status: 'finished',
    owned_format: 'cartridge',
    is_public: false,
    rating: 9,
    finished_at: `${YEAR}-02-01`,
    updated_at: ago(30),
  },
  {
    id: 3,
    title: 'Hades',
    type: 'game',
    status: 'finished',
    owned_format: 'none',
    is_public: true,
    rating: null,
    finished_at: `${YEAR - 1}-05-01`,
    updated_at: ago(60),
  },
]

const status = (overrides = {}) => ({
  sources: [
    {
      source: 'lrg',
      name: 'Limited Run',
      kind: 'store',
      last_run: { started_at: ago(1), finished_at: ago(1), ok: true },
    },
  ],
  totals: { pending_keys: 210 },
  ...overrides,
})

/** One stub per endpoint; any can be swapped for a response or a throw. */
function stubApi(routes = {}) {
  const defaults = {
    '/api/auth/me': () => json({ email: 'a@b.c' }),
    '/api/items': () => json(ITEMS),
    '/api/physical/status': () => json(status()),
    '/api/recommendations/store-list': () =>
      // Older than the catalogue run's ago(1): an equal stamp ties, and the
      // milliseconds between the two calls would decide which row leads.
      json({ generated_at: { radar: ago(1.5), discover: ago(1.5) } }),
    '/api/spots/status': () =>
      json({
        'weather.last_run': { at: ago(1.5), state: 'ok', hours: 156 },
        'candidates.last_run': { at: ago(30), state: 'ok', queued: 4 },
      }),
    // Older than the newest edit, which the recent-changes test looks for.
    '/api/closet/status': () =>
      json({
        'tag.last_run': { at: ago(3), state: 'ok', ok: true },
        'plan.last_run': { at: ago(3), state: 'ok', ok: true },
        'opinion.last_run': { at: ago(3), state: 'ok', ok: true },
      }),
    '/api/intake/status': () =>
      json({
        'nightly.last_run': { at: ago(3), state: 'empty', ok: true },
      }),
    '/api/comics/status': () =>
      json({ 'issues.last_run': { at: ago(3), state: 'ok', ok: true } }),
    '/snapshot/meta.json': () => json({ fetched_at: ago(3) }),
  }
  const table = { ...defaults, ...routes }
  const fetch = vi.fn(async (url) => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, '')
    const handler = table[path]
    if (!handler) return json({}, false)
    return handler()
  })
  vi.stubGlobal('fetch', fetch)
  return fetch
}

const called = (fetch, path) =>
  fetch.mock.calls.some(([url]) => String(url).endsWith(path))

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Admin Jobs', () => {
  it('titles the page and says the API is awake and the nightly ok', async () => {
    stubApi()
    renderAt()
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Jobs' }),
    ).toBeInTheDocument()
    expect(await screen.findByText('API awake')).toBeInTheDocument()
    expect(screen.getByText(/^nightly ok · /)).toBeInTheDocument()
    expect(document.title).toBe('Jobs · Admin · Joey Haas')
  })

  it('lists the eleven nightly jobs with their state in words', async () => {
    stubApi()
    renderAt()
    const panel = await screen.findByRole('region', { name: 'Nightly jobs' })
    const rows = await within(panel).findAllByRole('listitem')
    expect(rows).toHaveLength(11)
    expect(rows[0]).toHaveTextContent('Sources refresh')
    expect(rows[0]).toHaveTextContent(/ok/)
    expect(rows[3]).toHaveTextContent('Weekend forecast')
    expect(rows[4]).toHaveTextContent('Spot finder')
    expect(rows[5]).toHaveTextContent('Closet tags')
    expect(rows[6]).toHaveTextContent('Outfit plans')
    expect(rows[7]).toHaveTextContent('Closet opinions')
    expect(rows[8]).toHaveTextContent('Intake')
    expect(rows[8]).toHaveTextContent('Nothing to read')
    expect(rows[9]).toHaveTextContent('Comic issues')
    expect(rows[9]).toHaveTextContent('Every series synced')
    expect(rows[10]).toHaveTextContent('Public snapshot')
    expect(
      within(panel).getByRole('link', { name: 'Run now: Radar' }),
    ).toHaveAttribute('href', '/admin/radar')
    expect(
      within(panel).getByRole('link', { name: 'Run now: Weekend forecast' }),
    ).toHaveAttribute('href', '/admin/weekend')
    expect(
      within(panel).getByRole('link', { name: 'Run now: Spot finder' }),
    ).toHaveAttribute('href', '/admin/spots')
    expect(
      within(panel).getByRole('link', { name: 'Run now: Outfit plans' }),
    ).toHaveAttribute('href', '/admin/closet/today')
    expect(
      within(panel).getByRole('link', { name: 'Open Review: Closet opinions' }),
    ).toHaveAttribute('href', '/admin/closet/review')
    expect(
      within(panel).getByRole('link', { name: 'Run now: Intake' }),
    ).toHaveAttribute('href', '/admin/collection/add')
    expect(
      within(rows[10]).queryByRole('link', { name: /Run now/ }),
    ).not.toBeInTheDocument()
  })

  it('names a failed forecast and reads failed in the header', async () => {
    stubApi({
      '/api/spots/status': () =>
        json({
          'weather.last_run': {
            at: ago(1),
            state: 'failed',
            note: 'NWS answered 503',
          },
          'candidates.last_run': null,
        }),
    })
    renderAt()
    const panel = await screen.findByRole('region', { name: 'Nightly jobs' })
    const rows = await within(panel).findAllByRole('listitem')
    expect(rows[3]).toHaveTextContent('Failed: NWS answered 503')
    expect(rows[4]).toHaveTextContent('First run Sunday evening')
    expect(rows[4]).toHaveTextContent('scheduled')
    expect(await screen.findByText(/^nightly failed/)).toBeInTheDocument()
  })

  it('keeps the jobs when the spots status fails, with both rows unknown', async () => {
    stubApi({ '/api/spots/status': () => json({}, false) })
    renderAt()
    const panel = await screen.findByRole('region', { name: 'Nightly jobs' })
    const rows = await within(panel).findAllByRole('listitem')
    expect(rows).toHaveLength(11)
    expect(rows[3]).toHaveTextContent('unknown')
    expect(rows[4]).toHaveTextContent('unknown')
    expect(rows[0]).toHaveTextContent(/ok/)
  })

  it('keeps the jobs when the closet status fails, with its rows unknown', async () => {
    stubApi({ '/api/closet/status': () => json({}, false) })
    renderAt()
    const panel = await screen.findByRole('region', { name: 'Nightly jobs' })
    const rows = await within(panel).findAllByRole('listitem')
    expect(rows).toHaveLength(11)
    expect(rows[5]).toHaveTextContent('unknown')
    expect(rows[6]).toHaveTextContent('unknown')
    expect(rows[4]).toHaveTextContent(/ok/)
  })

  it('names a failed source and reads failed in the header', async () => {
    stubApi({
      '/api/physical/status': () =>
        json(
          status({
            sources: [
              {
                source: 'lrg',
                name: 'Limited Run',
                kind: 'store',
                last_run: {
                  started_at: ago(1),
                  finished_at: ago(1),
                  ok: false,
                },
              },
            ],
          }),
        ),
    })
    renderAt()
    const panel = await screen.findByRole('region', { name: 'Nightly jobs' })
    expect(
      await within(panel).findByText('Failed: Limited Run'),
    ).toBeInTheDocument()
    expect(screen.getByText(/^nightly failed · /)).toBeInTheDocument()
  })

  it('links how to re-enable the schedule when nothing has run', async () => {
    stubApi({ '/api/physical/status': () => json(status({ sources: [] })) })
    renderAt()
    expect(
      await screen.findByRole('link', { name: /how to re-enable it/i }),
    ).toHaveAttribute(
      'href',
      'https://github.com/joeyh92989/joey-haas.dev#nightly-job',
    )
    expect(screen.getByText(/^nightly stale/)).toBeInTheDocument()
  })

  it('still links how to re-enable it when the last, old night failed', async () => {
    stubApi({
      '/api/physical/status': () =>
        json(
          status({
            sources: [
              {
                source: 'lrg',
                name: 'Limited Run',
                kind: 'store',
                last_run: {
                  started_at: ago(40),
                  finished_at: ago(40),
                  ok: false,
                },
              },
            ],
          }),
        ),
    })
    renderAt()
    expect(
      await screen.findByRole('link', { name: /how to re-enable it/i }),
    ).toBeInTheDocument()
    expect(screen.getByText(/^nightly failed/)).toBeInTheDocument()
  })

  it('reads the snapshot as unknown without meta.json', async () => {
    stubApi({ '/snapshot/meta.json': () => json({}, false) })
    renderAt()
    const panel = await screen.findByRole('region', { name: 'Nightly jobs' })
    const rows = await within(panel).findAllByRole('listitem')
    expect(rows[10]).toHaveTextContent('No build time recorded')
    expect(rows[10]).toHaveTextContent('unknown')
    // An unknown job does not drag the headline down.
    expect(screen.getByText(/^nightly ok · /)).toBeInTheDocument()
  })

  it('keeps the jobs when the store list fails, with generates unknown', async () => {
    stubApi({
      '/api/recommendations/store-list': () => json({}, false),
    })
    renderAt()
    const panel = await screen.findByRole('region', { name: 'Nightly jobs' })
    const rows = await within(panel).findAllByRole('listitem')
    expect(rows[1]).toHaveTextContent('Not generated yet')
    expect(rows[1]).toHaveTextContent('unknown')
  })

  it('asks for nothing else, and says so, when the status cannot be read', async () => {
    const fetch = stubApi({ '/api/physical/status': () => json({}, false) })
    renderAt()
    // The server answered, so it is up: an error, not unreachable.
    expect(await screen.findByText('API error')).toBeInTheDocument()
    expect(
      screen.getByText('The nightly status couldn’t be read.'),
    ).toBeInTheDocument()
    expect(called(fetch, '/api/recommendations/store-list')).toBe(false)
    expect(called(fetch, '/api/spots/status')).toBe(false)
    expect(screen.queryByText(/^nightly /)).not.toBeInTheDocument()
  })

  it('says the session ended when the status answers 401', async () => {
    stubApi({
      '/api/physical/status': () => ({
        ok: false,
        status: 401,
        json: async () => ({}),
      }),
    })
    renderAt()
    expect(
      await screen.findByText('Your session ended. Sign in again.'),
    ).toBeInTheDocument()
  })

  it('reads the generate times from the store list', async () => {
    stubApi({
      '/api/recommendations/store-list': () =>
        json({ generated_at: { radar: ago(40), discover: ago(2) } }),
    })
    renderAt()
    const panel = await screen.findByRole('region', { name: 'Nightly jobs' })
    const rows = await within(panel).findAllByRole('listitem')
    expect(rows[1]).toHaveTextContent('Upcoming releases')
    expect(rows[1]).toHaveTextContent('stale')
    expect(rows[2]).toHaveTextContent('Sunday evenings only')
    expect(rows[2]).toHaveTextContent('ok')
  })

  it('reads the snapshot build time from meta.json', async () => {
    stubApi({ '/snapshot/meta.json': () => json({ fetched_at: ago(40) }) })
    renderAt()
    const panel = await screen.findByRole('region', { name: 'Nightly jobs' })
    const rows = await within(panel).findAllByRole('listitem')
    expect(rows[10]).toHaveTextContent('Rebuilt nightly')
    expect(rows[10]).toHaveTextContent('stale')
  })

  it('reads a status body with no sources as no jobs, not a stopped schedule', async () => {
    stubApi({
      '/api/physical/status': () => json({ detail: 'not a status document' }),
    })
    renderAt()
    expect(
      await screen.findByText('The nightly status couldn’t be read.'),
    ).toBeInTheDocument()
    expect(screen.getByText('API awake')).toBeInTheDocument()
    expect(screen.queryByText(/how to re-enable/)).not.toBeInTheDocument()
  })

  it('keeps the page when the status request throws', async () => {
    stubApi({
      '/api/physical/status': () => {
        throw new TypeError('Failed to fetch')
      },
    })
    renderAt()
    expect(await screen.findByText('API unreachable')).toBeInTheDocument()
    expect(
      screen.getByText('The nightly status couldn’t be read.'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('region', { name: 'Recent changes' }),
    ).toBeInTheDocument()
  })

  it('lists the newest edits and runs, each linked', async () => {
    stubApi()
    renderAt()
    const panel = await screen.findByRole('region', { name: 'Recent changes' })
    const table = await within(panel).findByRole('table')
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows[0]).toHaveTextContent('Sources refresh')
    expect(rows[0]).toHaveTextContent('Ran')
    expect(within(table).getByRole('link', { name: 'Dredge' })).toHaveAttribute(
      'href',
      '/admin/collection/1',
    )
    expect(within(table).getByText('Edited · Playing')).toBeInTheDocument()
  })

  it('waits on the status before calling it unreachable', async () => {
    let release
    stubApi({
      '/api/physical/status': () =>
        new Promise((resolve) => {
          release = () => resolve(json(status()))
        }),
    })
    renderAt()
    expect(await screen.findByText('Checking the API')).toBeInTheDocument()
    await waitFor(() => expect(release).toBeTypeOf('function'))
    release()
    expect(await screen.findByText('API awake')).toBeInTheDocument()
  })
})
