import '@testing-library/jest-dom'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AdminWeekend, { clock, constraintPills } from './AdminWeekend.jsx'

function day(date, name, fields = {}) {
  return {
    date,
    name,
    high: 55,
    low: 38,
    summary: 'Sunny',
    hours: [
      {
        hour: 8,
        label: '8a',
        temp_f: 38,
        precip_pct: 0,
        wind_mph: 4,
        wet: false,
        rideable: true,
      },
      {
        hour: 9,
        label: '9a',
        temp_f: 55,
        precip_pct: 0,
        wind_mph: 4,
        wet: false,
        rideable: true,
      },
    ],
    verdict: { state: 'ok', text: 'Dry all day: ride', window: '8a–9a' },
    ...fields,
  }
}

function suggestion(slot_key, spot_id, name, fields = {}) {
  return {
    slot_key,
    slot: { best: 'Best bet', new: 'Somewhere new', while: 'While you’re out' }[
      slot_key
    ],
    day: '2026-11-14',
    when: 'Saturday',
    spot_id,
    name,
    tags: ['coffee'],
    distance: '1 mi',
    reasons: ['A reason'],
    saved: false,
    ...fields,
  }
}

function plan(fields = {}) {
  return {
    today: '2026-11-09',
    week: '2026-11-14',
    days: [day('2026-11-14', 'Saturday'), day('2026-11-15', 'Sunday')],
    suggestions: [
      suggestion('best', 'corvus', 'Corvus Coffee'),
      suggestion('new', 'sloans', "Sloan's Lake"),
      suggestion('while', 'union', 'Union Station'),
    ],
    constraints: {
      kid_along: true,
      bike_if_dry: false,
      max_miles: 5,
      home_by: 17,
    },
    skips: [],
    weather: {
      at: '2026-11-09T06:00:00Z',
      state: 'ok',
      gridpoint: 'BOU/62,61',
      hours: 156,
    },
    recent_visits: [
      {
        id: 1,
        spot_id: 'corvus',
        name: 'Corvus Coffee',
        visited_on: '2026-11-01',
      },
    ],
    seed: 0,
    ...fields,
  }
}

function json(body, status = 200) {
  return { ok: status < 300, status, json: async () => body }
}

/** Answers by method and path (query included); `handlers` override. */
function stubApi(handlers = {}) {
  const calls = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url, options = {}) => {
      const path = String(url).replace(/^.*\/api/, '/api')
      const method = options.method ?? 'GET'
      calls.push({
        method,
        path,
        body: options.body && JSON.parse(options.body),
      })
      const handler = handlers[`${method} ${path}`]
      if (handler) return handler(options)
      if (method === 'GET' && path.startsWith('/api/spots/plan?')) {
        return json(plan())
      }
      if (method === 'POST' || method === 'PUT') return json({ ok: true })
      return json({}, 404)
    }),
  )
  return calls
}

function renderPage() {
  return render(
    <MemoryRouter>
      <AdminWeekend />
    </MemoryRouter>,
  )
}

const reads = (calls) =>
  calls.filter((c) => c.method === 'GET').map((c) => c.path)
const writes = (calls) => calls.filter((c) => c.method !== 'GET')

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 9, 20, 30))
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('clock and constraintPills', () => {
  it('writes hours as the strip does', () => {
    expect([9, 11, 12, 13, 22].map(clock)).toEqual([
      '9a',
      '11a',
      'noon',
      '1p',
      '10p',
    ])
  })

  it('names the set constraints in order and skips the rest', () => {
    expect(
      constraintPills({
        kid_along: true,
        bike_if_dry: true,
        max_miles: 2.5,
        home_by: 12,
      }),
    ).toEqual(['Kid along', 'Bike if dry', 'Within 2.5 mi', 'Home by noon'])
    expect(
      constraintPills({
        kid_along: false,
        bike_if_dry: false,
        max_miles: null,
        home_by: null,
      }),
    ).toEqual([])
  })
})

describe('AdminWeekend', () => {
  it('shows both days, three suggestions, the constraints and recent visits', async () => {
    const calls = stubApi()
    renderPage()
    await screen.findByRole('heading', { name: 'Saturday · Nov 14' })
    expect(reads(calls)).toEqual(['/api/spots/plan?seed=0'])
    expect(
      screen.getByRole('heading', { name: 'Sunday · Nov 15' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/Forecast from/)).toBeInTheDocument()
    expect(
      screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent),
    ).toEqual(['Corvus Coffee', "Sloan's Lake", 'Union Station'])
    expect(screen.getByText('Kid along')).toBeInTheDocument()
    expect(screen.getByText('Within 5 mi')).toBeInTheDocument()
    expect(screen.getByText('Home by 5p')).toBeInTheDocument()
    const visits = screen.getByRole('region', { name: 'Recent visits' })
    expect(within(visits).getByText('November 1, 2026')).toBeInTheDocument()
    expect(
      within(visits).getByRole('link', { name: 'Log a visit' }),
    ).toHaveAttribute('href', '/admin/spots')
  })

  it('rerolls with the next seed', async () => {
    const user = userEvent.setup()
    const calls = stubApi()
    renderPage()
    await screen.findByRole('heading', { name: 'Corvus Coffee' })
    await user.click(screen.getByRole('button', { name: 'Reroll' }))
    await vi.waitFor(() =>
      expect(reads(calls)).toEqual([
        '/api/spots/plan?seed=0',
        '/api/spots/plan?seed=1',
      ]),
    )
  })

  it('saves, unsaves and refreshes the forecast, reading the plan again after each', async () => {
    const user = userEvent.setup()
    const calls = stubApi({
      'GET /api/spots/plan?seed=0': () =>
        json(
          plan({
            suggestions: [
              suggestion('best', 'corvus', 'Corvus Coffee'),
              suggestion('new', 'sloans', "Sloan's Lake", { saved: true }),
            ],
          }),
        ),
    })
    renderPage()
    await screen.findByRole('heading', { name: 'Corvus Coffee' })
    await user.click(
      screen.getByRole('button', { name: 'Save: Corvus Coffee' }),
    )
    await user.click(
      await screen.findByRole('button', { name: "Unsave: Sloan's Lake" }),
    )
    await user.click(
      await screen.findByRole('button', { name: 'Refresh forecast' }),
    )
    await vi.waitFor(() => expect(reads(calls)).toHaveLength(4))
    expect(writes(calls)).toEqual([
      {
        method: 'POST',
        path: '/api/spots/plan/save',
        body: { slot_key: 'best', spot_id: 'corvus', day: '2026-11-14' },
      },
      {
        method: 'POST',
        path: '/api/spots/plan/unsave',
        body: { slot_key: 'new' },
      },
      { method: 'POST', path: '/api/spots/weather/refresh', body: undefined },
    ])
  })

  it('skips with an Undo that takes focus and unskips', async () => {
    const user = userEvent.setup()
    const calls = stubApi()
    renderPage()
    await screen.findByRole('heading', { name: 'Corvus Coffee' })
    await user.click(
      screen.getByRole('button', { name: 'Skip: Corvus Coffee' }),
    )
    const undo = await screen.findByRole('button', { name: 'Undo' })
    expect(screen.getByRole('status')).toHaveTextContent(
      'Corvus Coffee skipped for this weekend.',
    )
    expect(undo).toHaveFocus()
    await user.click(undo)
    await vi.waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull(),
    )
    expect(writes(calls).map((c) => [c.path, c.body])).toEqual([
      ['/api/spots/plan/skip', { spot_id: 'corvus' }],
      ['/api/spots/plan/unskip', { spot_id: 'corvus' }],
    ])
  })

  it('lists earlier skips with an Unskip each', async () => {
    const user = userEvent.setup()
    const calls = stubApi({
      'GET /api/spots/plan?seed=0': () =>
        json(plan({ skips: [{ spot_id: 'zoo', name: 'Denver Zoo' }] })),
    })
    renderPage()
    await user.click(
      await screen.findByRole('button', { name: 'Unskip: Denver Zoo' }),
    )
    await vi.waitFor(() => expect(writes(calls)).toHaveLength(1))
    expect(writes(calls)[0].body).toEqual({ spot_id: 'zoo' })
  })

  it('logs Been on the suggestion’s day once it has come, else today, without reloading', async () => {
    const user = userEvent.setup()
    const calls = stubApi({
      'GET /api/spots/plan?seed=0': () =>
        json(
          plan({
            suggestions: [
              suggestion('best', 'corvus', 'Corvus Coffee', {
                day: '2026-11-08',
              }),
              suggestion('new', 'sloans', "Sloan's Lake"),
            ],
          }),
        ),
      'POST /api/spots/corvus/visits': () =>
        json({
          id: 7,
          spot_id: 'corvus',
          visited_on: '2026-11-08',
          note: null,
        }),
      'POST /api/spots/sloans/visits': () =>
        json({
          id: 8,
          spot_id: 'sloans',
          visited_on: '2026-11-09',
          note: null,
        }),
    })
    renderPage()
    await screen.findByText("Sloan's Lake")
    await user.click(
      screen.getByRole('button', { name: 'Been: Corvus Coffee' }),
    )
    await user.click(screen.getByRole('button', { name: "Been: Sloan's Lake" }))
    await vi.waitFor(() =>
      expect(screen.getAllByText('Visited')).toHaveLength(2),
    )
    expect(writes(calls).map((c) => [c.path, c.body])).toEqual([
      ['/api/spots/corvus/visits', { visited_on: '2026-11-08' }],
      ['/api/spots/sloans/visits', { visited_on: '2026-11-09' }],
    ])
    expect(reads(calls)).toHaveLength(1)
    const visits = screen.getByRole('region', { name: 'Recent visits' })
    expect(
      within(visits)
        .getAllByRole('listitem')
        .map((li) => li.firstChild.textContent),
    ).toEqual(["Sloan's Lake", 'Corvus Coffee', 'Corvus Coffee'])
  })

  it('edits the constraints with a PUT and hands focus back to Edit', async () => {
    const user = userEvent.setup()
    const calls = stubApi()
    renderPage()
    await screen.findByRole('heading', { name: 'Corvus Coffee' })
    const edit = screen.getByRole('button', { name: 'Edit Constraints' })
    expect(edit).toHaveAttribute('aria-expanded', 'false')
    await user.click(edit)
    expect(edit).toHaveAttribute('aria-expanded', 'true')
    const form = screen.getByRole('region', { name: 'Constraints' })
    expect(within(form).getByLabelText('Kid along')).toHaveFocus()
    await user.click(within(form).getByLabelText('Kid along'))
    await user.click(within(form).getByLabelText('Bike if dry'))
    await user.clear(within(form).getByLabelText(/Within/))
    await user.selectOptions(within(form).getByLabelText('Home by'), '9')
    await user.click(
      within(form).getByRole('button', { name: 'Save constraints' }),
    )
    await vi.waitFor(() =>
      expect(screen.queryByRole('region', { name: 'Constraints' })).toBeNull(),
    )
    expect(writes(calls)).toEqual([
      {
        method: 'PUT',
        path: '/api/spots/constraints',
        body: {
          kid_along: false,
          bike_if_dry: true,
          max_miles: null,
          home_by: 9,
        },
      },
    ])
    expect(edit).toHaveFocus()
  })

  it('says when no constraints are set and no suggestion fits', async () => {
    stubApi({
      'GET /api/spots/plan?seed=0': () =>
        json(
          plan({
            suggestions: [],
            constraints: {
              kid_along: false,
              bike_if_dry: false,
              max_miles: null,
              home_by: null,
            },
            recent_visits: [],
          }),
        ),
    })
    renderPage()
    expect(await screen.findByText('No constraints set.')).toBeInTheDocument()
    expect(screen.getByText(/Nothing to suggest/)).toBeInTheDocument()
    expect(screen.getByText('No visits logged yet.')).toBeInTheDocument()
  })

  it('names a failed forecast refresh and an absent forecast', async () => {
    stubApi({
      'GET /api/spots/plan?seed=0': () =>
        json(
          plan({
            weather: {
              at: '2026-11-09T06:00:00Z',
              state: 'failed',
              note: 'NWS 503',
            },
          }),
        ),
    })
    const { unmount } = renderPage()
    expect(
      await screen.findByText(/The last forecast refresh failed/),
    ).toBeInTheDocument()
    unmount()
    stubApi({
      'GET /api/spots/plan?seed=0': () => json(plan({ weather: null })),
    })
    renderPage()
    expect(
      await screen.findByText(/No forecast yet\. It refreshes every night\./),
    ).toBeInTheDocument()
  })

  it('shows a read error, and a session error on a 401', async () => {
    stubApi({ 'GET /api/spots/plan?seed=0': () => json({}, 500) })
    const { unmount } = renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The weekend plan couldn’t be read.',
    )
    unmount()
    stubApi({ 'GET /api/spots/plan?seed=0': () => json({}, 401) })
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Your session ended. Reload to sign in.',
    )
  })

  it('offers Try again on a failed first read, then shows the plan', async () => {
    const user = userEvent.setup()
    let up = false
    stubApi({
      'GET /api/spots/plan?seed=0': () => (up ? json(plan()) : json({}, 500)),
    })
    renderPage()
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('The weekend plan couldn’t be read.')
    up = true
    await user.click(within(alert).getByRole('button', { name: 'Try again' }))
    expect(
      await screen.findByRole('heading', { name: 'Corvus Coffee' }),
    ).toBeInTheDocument()
  })

  it('shows a refused write without losing the plan', async () => {
    const user = userEvent.setup()
    stubApi({
      'POST /api/spots/weather/refresh': () =>
        json({ detail: 'A refresh is already running.' }, 409),
    })
    renderPage()
    await screen.findByRole('heading', { name: 'Corvus Coffee' })
    await user.click(screen.getByRole('button', { name: 'Refresh forecast' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Corvus Coffee' }),
    ).toBeInTheDocument()
  })

  it('reads the plan again after a failed refresh and keeps the failure shown', async () => {
    const user = userEvent.setup()
    const calls = stubApi({
      'POST /api/spots/weather/refresh': () =>
        json({ detail: 'NWS did not answer.' }, 502),
    })
    renderPage()
    await screen.findByRole('heading', { name: 'Corvus Coffee' })
    await user.click(screen.getByRole('button', { name: 'Refresh forecast' }))
    await vi.waitFor(() => expect(reads(calls)).toHaveLength(2))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'NWS did not answer.',
    )
  })

  it('keeps the skip toast in the page while it is empty', async () => {
    stubApi()
    renderPage()
    await screen.findByRole('heading', { name: 'Corvus Coffee' })
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })
})
