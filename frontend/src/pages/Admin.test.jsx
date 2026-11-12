import '@testing-library/jest-dom'
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ownerYear } from '../lib/formatDate.js'
import { localToday } from '../lib/statusMoves.js'
import AdminLayout from '../layouts/AdminLayout.jsx'
import Admin from './Admin.jsx'

vi.mock('../lib/useMediaQuery.js', () => ({ useMediaQuery: () => false }))

// Rendered under its layout, which checks the session and loads the rows.
function renderAt(path = '/admin') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<Admin />} />
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
]

const CONTINUING = {
  item_id: 'a1',
  type: 'game',
  title: 'Dredge',
  cover_url: null,
  platform: 'Switch',
  time_to_beat_hours: 12,
  playthrough: 1,
  playing_since: '2026-10-01',
  last_played_on: '2026-10-20',
  journal_hours: 6.4,
  sessions: 3,
  stale: false,
}

const status = () => ({
  sources: [
    {
      source: 'lrg',
      name: 'Limited Run',
      kind: 'store',
      last_run: { started_at: ago(1), finished_at: ago(1), ok: true },
    },
  ],
  totals: { pending_keys: 0 },
})

/** One stub per endpoint; any can be swapped for a response or a throw. */
function stubApi(routes = {}) {
  const defaults = {
    '/api/auth/me': () => json({ email: 'a@b.c' }),
    '/api/items': () => json(ITEMS),
    '/api/physical/status': () => json(status()),
    '/api/recommendations/store-list': () =>
      json({ generated_at: { radar: ago(1.5), discover: ago(1.5) } }),
    '/api/spots/status': () =>
      json({
        'weather.last_run': { at: ago(1.5), state: 'ok', hours: 156 },
        'candidates.last_run': { at: ago(30), state: 'ok', queued: 4 },
      }),
    '/snapshot/meta.json': () => json({ fetched_at: ago(3) }),
    '/api/closet/today?stored_only=true': () => json({ plan: null }),
    '/api/picker/continuing': () => json({ cards: [CONTINUING] }),
    '/api/public/next': () =>
      json({
        tonight: {
          continuing: [],
          up_next: null,
          picks: [],
          last_finish: null,
        },
        comics_this_week: [{}, {}],
      }),
    '/api/spots/plan': () =>
      json({
        suggestions: [
          { when: 'Saturday morning', name: 'Chautauqua' },
          { when: 'Sunday', name: 'Red Rocks' },
        ],
      }),
    '/api/spots': () => json([{}, {}, {}]),
    '/api/spots/candidates': () => json([{}, {}]),
    '/api/analytics?range=7d': () =>
      json({ views: 42, visitors: 7, pages: [{ value: '/daily', count: 30 }] }),
  }
  const table = { ...defaults, ...routes }
  const fetch = vi.fn(async (url, options) => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, '')
    const handler = table[path]
    if (!handler) return json({}, false)
    return handler(options)
  })
  vi.stubGlobal('fetch', fetch)
  return fetch
}

const card = (name) => screen.findByRole('region', { name })
const figureOf = (region, label) => within(region).getByText(label).nextSibling

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Admin Home', () => {
  it('titles the page Home and keeps the API and nightly state', async () => {
    stubApi()
    renderAt()
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Home' }),
    ).toBeInTheDocument()
    expect(await screen.findByText('API awake')).toBeInTheDocument()
    expect(screen.getByText(/^nightly ok · /)).toBeInTheDocument()
    expect(document.title).toBe('Home · Admin · Joey Haas')
  })

  it('leads Shelf with the game in hand, and its figures', async () => {
    stubApi()
    renderAt()
    const shelf = await card('Shelf')
    expect(
      await within(shelf).findByText('Continue: Dredge'),
    ).toBeInTheDocument()
    expect(
      within(shelf).getByText('Switch · 3 sessions · 6h'),
    ).toBeInTheDocument()
    expect(
      within(shelf).getByRole('link', { name: 'Play Next' }),
    ).toHaveAttribute('href', '/admin/play-next')
    await waitFor(() => expect(figureOf(shelf, 'Owned')).toHaveTextContent('2'))
    expect(figureOf(shelf, `Finished · ${YEAR}`)).toHaveTextContent('1')
    expect(figureOf(shelf, 'Comics this week')).toHaveTextContent('2')
  })

  it('logs tonight from the card, then reads it as logged', async () => {
    let logged = false
    const fetch = stubApi({
      '/api/items/a1/sessions': () => {
        logged = true
        return json({})
      },
      '/api/picker/continuing': () =>
        json({
          cards: [
            {
              ...CONTINUING,
              last_played_on: logged ? localToday() : '2026-10-20',
            },
          ],
        }),
    })
    renderAt()
    const shelf = await card('Shelf')
    fireEvent.click(
      await within(shelf).findByRole('button', { name: 'Log tonight' }),
    )
    expect(
      await within(shelf).findByRole('button', { name: 'Logged tonight' }),
    ).toBeDisabled()
    const post = fetch.mock.calls.find(([url]) =>
      String(url).endsWith('/api/items/a1/sessions'),
    )
    expect(JSON.parse(post[1].body)).toEqual({ played_on: localToday() })
  })

  it('keeps the card while it refetches, and posts a double press once', async () => {
    let release
    let logged = false
    const fetch = stubApi({
      '/api/items/a1/sessions': () => {
        logged = true
        return json({})
      },
      '/api/picker/continuing': () =>
        logged
          ? new Promise((resolve) => {
              release = () =>
                resolve(
                  json({
                    cards: [{ ...CONTINUING, last_played_on: localToday() }],
                  }),
                )
            })
          : json({ cards: [CONTINUING] }),
    })
    renderAt()
    const shelf = await card('Shelf')
    const button = await within(shelf).findByRole('button', {
      name: 'Log tonight',
    })
    fireEvent.click(button)
    fireEvent.click(button)
    await waitFor(() => expect(release).toBeDefined())
    // The refetch is in flight: the game and its controls stay put.
    expect(within(shelf).getByText('Continue: Dredge')).toBeInTheDocument()
    expect(
      within(shelf).getByRole('button', { name: 'Log tonight' }),
    ).toBeDisabled()
    release()
    expect(
      await within(shelf).findByRole('button', { name: 'Logged tonight' }),
    ).toBeDisabled()
    const posts = fetch.mock.calls.filter(([url]) =>
      String(url).endsWith('/api/items/a1/sessions'),
    )
    expect(posts).toHaveLength(1)
  })

  it('falls back to Up next when no game is in hand', async () => {
    stubApi({
      '/api/picker/continuing': () => json({ cards: [] }),
      '/api/public/next': () =>
        json({
          tonight: {
            continuing: [],
            up_next: {
              item_id: 'b',
              type: 'game',
              title: 'Hades',
              platform: 'Switch',
            },
            picks: [],
          },
          comics_this_week: [],
        }),
    })
    renderAt()
    const shelf = await card('Shelf')
    expect(await within(shelf).findByText('Up next: Hades')).toBeInTheDocument()
    expect(
      within(shelf).queryByRole('button', { name: 'Log tonight' }),
    ).not.toBeInTheDocument()
  })

  it('leads Denver with the weekend, and links the candidates', async () => {
    stubApi()
    renderAt()
    const denver = await card('Denver')
    expect(
      await within(denver).findByText('Saturday morning · Chautauqua'),
    ).toBeInTheDocument()
    expect(within(denver).getByText('Sunday · Red Rocks')).toBeInTheDocument()
    await waitFor(() =>
      expect(figureOf(denver, 'Spots')).toHaveTextContent('3'),
    )
    expect(figureOf(denver, 'Candidates')).toHaveTextContent('2')
    expect(
      within(denver).getByRole('link', { name: 'Review candidates' }),
    ).toHaveAttribute('href', '/admin/spots')
  })

  it('hides Denver with no spots and no weekend', async () => {
    stubApi({
      '/api/spots/plan': () => json({ suggestions: [] }),
      '/api/spots': () => json([]),
    })
    renderAt()
    await card('Shelf')
    await waitFor(() =>
      expect(
        screen.queryByRole('region', { name: 'Denver' }),
      ).not.toBeInTheDocument(),
    )
  })

  it("reads Site's traffic and sums up the jobs", async () => {
    stubApi()
    renderAt()
    const site = await card('Site')
    await waitFor(() =>
      expect(figureOf(site, 'Views · 7 days')).toHaveTextContent('42'),
    )
    expect(figureOf(site, 'Visitors')).toHaveTextContent('7')
    expect(figureOf(site, 'Top page')).toHaveTextContent('/daily')
    expect(await within(site).findByText(/jobs ok/)).toBeInTheDocument()
    expect(within(site).getByRole('link', { name: 'Jobs' })).toHaveAttribute(
      'href',
      '/admin/jobs',
    )
  })

  it('names the reads that failed, says so on the card, and keeps the page', async () => {
    stubApi({
      '/api/analytics?range=7d': () => json({}, false),
      '/api/picker/continuing': () => {
        throw new TypeError('Failed to fetch')
      },
      '/api/physical/status': () => {
        throw new TypeError('Failed to fetch')
      },
    })
    renderAt()
    expect(await screen.findByText('API unreachable')).toBeInTheDocument()
    const site = await card('Site')
    await waitFor(() =>
      expect(figureOf(site, 'Views · 7 days')).toHaveTextContent(
        "Couldn't read",
      ),
    )
    const shelf = await card('Shelf')
    expect(within(shelf).getByText("Couldn't read")).toBeInTheDocument()
    expect(
      await screen.findByText("Couldn't read: Shelf, Site."),
    ).toBeInTheDocument()
    expect(
      screen.getByText('The nightly status couldn’t be read.'),
    ).toBeInTheDocument()
  })

  it('re-runs only the failed reads with one Try again', async () => {
    let analyticsUp = false
    const fetch = stubApi({
      '/api/analytics?range=7d': () =>
        analyticsUp
          ? json({ views: 42, visitors: 7, pages: [] })
          : json({}, false),
    })
    renderAt()
    expect(await screen.findByText("Couldn't read: Site.")).toBeInTheDocument()
    const calls = (path) =>
      fetch.mock.calls.filter(([url]) => String(url).endsWith(path)).length
    expect(calls('/api/analytics?range=7d')).toBe(1)
    expect(calls('/api/spots')).toBe(1)

    analyticsUp = true
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    const site = await card('Site')
    await waitFor(() =>
      expect(figureOf(site, 'Views · 7 days')).toHaveTextContent('42'),
    )
    expect(calls('/api/analytics?range=7d')).toBe(2)
    expect(calls('/api/spots')).toBe(1)
    await waitFor(() =>
      expect(screen.queryByText(/^Couldn't read:/)).not.toBeInTheDocument(),
    )
  })

  it('keeps the Closet card when its read fails', async () => {
    stubApi({
      '/api/closet/today?stored_only=true': () => json({}, false),
    })
    renderAt()
    const closet = await card('Closet')
    expect(
      (await within(closet).findAllByText("Couldn't read")).length,
    ).toBeGreaterThan(0)
    expect(
      await screen.findByText("Couldn't read: Closet."),
    ).toBeInTheDocument()
  })

  it('lists the nightly jobs, linked to the Jobs page', async () => {
    stubApi()
    renderAt()
    const panel = await screen.findByRole('region', { name: 'Nightly jobs' })
    expect(await within(panel).findAllByRole('listitem')).toHaveLength(10)
    expect(within(panel).getByRole('link', { name: 'Jobs' })).toHaveAttribute(
      'href',
      '/admin/jobs',
    )
  })

  const TODAY = {
    plan: {
      day: '2026-11-09',
      occasion: 'office',
      bike: true,
      weather: { low: 34, high: 58 },
      lead: {
        reason: 'Calm.',
        ranked_by: 'model',
        garments: [
          { slot: 'top', id: 't1', name: 'navy oxford', primary_hex: '#223' },
          {
            slot: 'bottom',
            id: 'b1',
            name: 'grey chinos',
            primary_hex: '#888',
          },
          { slot: 'shoes', id: 's1', name: 'sneakers', primary_hex: '#eee' },
        ],
      },
      alternatives: [],
      footnote: { active: 40, fit: 22 },
    },
    worn: null,
  }
  const WORN_LEAD = TODAY.plan.lead.garments.map(({ slot, id }) => ({
    slot,
    id,
  }))

  it('leads Closet with the stored outfit, and Wore this records it', async () => {
    const fetch = stubApi({
      '/api/closet/today?stored_only=true': () => json(TODAY),
      '/api/closet/wore': (options) =>
        json({ worn: { id: 5, garments: JSON.parse(options.body).garments } }),
      '/api/closet/garments': () =>
        json({ garments: [], counts: { untagged: 3 } }),
      '/api/closet/review': () => json({ tiles: { flagged: 4 } }),
    })
    renderAt()
    const closet = await card('Closet')
    expect(
      await within(closet).findByText('navy oxford · grey chinos · sneakers'),
    ).toBeInTheDocument()
    expect(within(closet).getByText('Office · bike · 34° → 58°'))
    await waitFor(() =>
      expect(figureOf(closet, 'Untagged')).toHaveTextContent('3'),
    )
    expect(figureOf(closet, 'To review')).toHaveTextContent('4')
    expect(within(closet).getByRole('link', { name: 'Today' })).toHaveAttribute(
      'href',
      '/admin/closet/today',
    )
    fireEvent.click(within(closet).getByRole('button', { name: 'Wore this' }))
    expect(await within(closet).findByText('Worn ✓')).toBeInTheDocument()
    const [, options] = fetch.mock.calls.find(([url]) =>
      String(url).endsWith('/api/closet/wore'),
    )
    expect(JSON.parse(options.body)).toEqual({
      occasion: 'office',
      bike: true,
      source: 'planned',
      garments: [
        { slot: 'top', id: 't1' },
        { slot: 'bottom', id: 'b1' },
        { slot: 'shoes', id: 's1' },
      ],
    })
  })

  it('shows Closet as worn when today is recorded', async () => {
    stubApi({
      '/api/closet/today?stored_only=true': () =>
        json({ ...TODAY, worn: { id: 1, garments: WORN_LEAD } }),
    })
    renderAt()
    const closet = await card('Closet')
    expect(await within(closet).findByText('Worn ✓')).toBeInTheDocument()
    expect(
      within(closet).queryByRole('button', { name: 'Wore this' }),
    ).not.toBeInTheDocument()
  })

  it('says another outfit was worn when the record is not the card’s', async () => {
    stubApi({
      '/api/closet/today?stored_only=true': () =>
        json({
          ...TODAY,
          worn: {
            id: 1,
            garments: [...WORN_LEAD.slice(0, 2), { slot: 'shoes', id: 's9' }],
          },
        }),
    })
    renderAt()
    const closet = await card('Closet')
    expect(
      await within(closet).findByText('Worn today: another outfit'),
    ).toBeInTheDocument()
    expect(within(closet).queryByText('Worn ✓')).not.toBeInTheDocument()
    fireEvent.click(within(closet).getByRole('button', { name: 'Change' }))
    expect(
      within(closet).getByRole('button', { name: 'Wore this' }),
    ).toBeInTheDocument()
  })

  it('says the session ended when Wore this gets a 401', async () => {
    stubApi({
      '/api/closet/today?stored_only=true': () => json(TODAY),
      '/api/closet/wore': () => ({
        ok: false,
        status: 401,
        json: async () => ({ detail: 'Not signed in' }),
      }),
    })
    renderAt()
    const closet = await card('Closet')
    fireEvent.click(
      await within(closet).findByRole('button', { name: 'Wore this' }),
    )
    expect(await within(closet).findByRole('alert')).toHaveTextContent(
      'Your session ended',
    )
  })

  it('shows the route’s reason when Wore this is refused', async () => {
    stubApi({
      '/api/closet/today?stored_only=true': () => json(TODAY),
      '/api/closet/wore': () => ({
        ok: false,
        status: 422,
        json: async () => ({
          detail: 'Only an active garment can be worn or turned down',
        }),
      }),
    })
    renderAt()
    const closet = await card('Closet')
    fireEvent.click(
      await within(closet).findByRole('button', { name: 'Wore this' }),
    )
    expect(await within(closet).findByRole('alert')).toHaveTextContent(
      'Only an active garment can be worn or turned down',
    )
  })

  it('hides Closet when nothing is planned', async () => {
    stubApi({
      '/api/closet/today?stored_only=true': () =>
        json({ ...TODAY, plan: null }),
    })
    renderAt()
    await card('Shelf')
    await waitFor(() =>
      expect(
        screen.queryByRole('region', { name: 'Closet' }),
      ).not.toBeInTheDocument(),
    )
  })
})
