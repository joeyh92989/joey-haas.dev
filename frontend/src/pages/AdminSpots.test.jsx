import '@testing-library/jest-dom'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AdminSpots from './AdminSpots.jsx'

const media = { phone: false }
vi.mock('../lib/useMediaQuery.js', () => ({
  useMediaQuery: (query) => query === '(max-width: 700px)' && media.phone,
}))

function spot(id, name, fields = {}) {
  return {
    id,
    name,
    slug: id,
    lat: 39.75,
    lng: -104.99,
    neighbourhood: null,
    blurb: null,
    tags: [],
    anchor: false,
    is_public: false,
    city: 'denver',
    source: null,
    source_id: null,
    last_visit: null,
    visit_count: 0,
    ...fields,
  }
}

const SPOTS = [
  spot('a', 'Corvus Coffee', {
    tags: ['coffee', 'rainy-day'],
    neighbourhood: 'South Broadway',
    is_public: true,
    last_visit: '2026-11-01',
    visit_count: 3,
  }),
  spot('b', 'Home', { anchor: true }),
  spot('c', "Sloan's Lake", { tags: ['park', 'kid-ok'] }),
]

function json(body, status = 200) {
  return { ok: status < 300, status, json: async () => body }
}

/** Answers by method and path; `handlers` override. */
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
      if (method === 'GET' && path === '/api/spots') return json(SPOTS)
      return json({}, 404)
    }),
  )
  return calls
}

function rowNames() {
  return screen
    .getAllByRole('rowheader')
    .map((cell) => cell.firstChild.textContent)
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 9, 20, 30))
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  media.phone = false
})

describe('AdminSpots', () => {
  it('lists every spot with tags, last visit and the public counts', async () => {
    stubApi()
    render(<AdminSpots />)
    await screen.findByRole('table')
    expect(rowNames()).toEqual(['Corvus Coffee', 'Home', "Sloan's Lake"])
    expect(
      screen.getAllByRole('columnheader').map((cell) => cell.textContent),
    ).toEqual(['Spot', 'Tags', 'Last visit', 'Public', 'Actions'])
    const corvus = screen.getByRole('row', { name: /Corvus Coffee/ })
    expect(within(corvus).getByText('Coffee')).toBeInTheDocument()
    expect(within(corvus).getByText('Rainy day')).toBeInTheDocument()
    expect(within(corvus).getByText('3 visits')).toBeInTheDocument()
    expect(within(corvus).getByLabelText('Public: Corvus Coffee')).toBeChecked()
    expect(
      within(screen.getByRole('row', { name: /Home/ })).getByText('Anchor'),
    ).toBeInTheDocument()
    expect(screen.getByText('Public 1')).toBeInTheDocument()
    expect(screen.getByText('Private 2')).toBeInTheDocument()
  })

  it('drops the Last visit column on a phone', async () => {
    media.phone = true
    stubApi()
    render(<AdminSpots />)
    await screen.findByRole('table')
    expect(
      screen.getAllByRole('columnheader').map((cell) => cell.textContent),
    ).toEqual(['Spot', 'Tags', 'Public', 'Actions'])
  })

  it('filters by name, neighbourhood and tag label', async () => {
    stubApi()
    render(<AdminSpots />)
    await screen.findByRole('table')
    const user = userEvent.setup()
    const search = screen.getByRole('searchbox', { name: 'Search spots' })

    await user.type(search, 'kid-ok')
    expect(rowNames()).toEqual(["Sloan's Lake"])
    await user.clear(search)
    await user.type(search, 'rainy day')
    expect(rowNames()).toEqual(['Corvus Coffee'])
    await user.clear(search)
    await user.type(search, 'broadway')
    expect(rowNames()).toEqual(['Corvus Coffee'])
    await user.clear(search)
    await user.type(search, 'nowhere')
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.getByText('No spot matches that search.')).toBeInTheDocument()
  })

  it('publishes a spot from its switch', async () => {
    const calls = stubApi({
      'PATCH /api/spots/c': () => json({ ...SPOTS[2], is_public: true }),
    })
    render(<AdminSpots />)
    await screen.findByRole('table')
    await userEvent.setup().click(screen.getByLabelText("Public: Sloan's Lake"))

    expect(calls.at(-1)).toEqual({
      method: 'PATCH',
      path: '/api/spots/c',
      body: { is_public: true },
    })
    expect(await screen.findByText('Public 2')).toBeInTheDocument()
    expect(screen.getByLabelText("Public: Sloan's Lake")).toBeChecked()
  })

  it('logs a visit on the owner’s local day', async () => {
    const calls = stubApi({
      'POST /api/spots/b/visits': () =>
        json(
          { id: 'v', spot_id: 'b', visited_on: '2026-11-09', note: null },
          201,
        ),
    })
    render(<AdminSpots />)
    await screen.findByRole('table')
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Log a visit to Home' }))

    expect(calls.at(-1)).toEqual({
      method: 'POST',
      path: '/api/spots/b/visits',
      body: { visited_on: '2026-11-09' },
    })
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Logged a visit to Home today.',
    )
    expect(
      within(screen.getByRole('row', { name: /Home/ })).getByText(
        'November 9, 2026',
      ),
    ).toBeInTheDocument()
  })

  it('adds a spot by hand and lists it in name order', async () => {
    stubApi({
      'POST /api/spots': () => json(spot('d', 'Denver Central Market'), 201),
    })
    render(<AdminSpots />)
    await screen.findByRole('table')
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Add by hand' }))
    const form = screen.getByRole('form', { name: 'Add a spot' })
    await user.type(
      within(form).getByLabelText('Name'),
      'Denver Central Market',
    )
    await user.type(
      within(form).getByLabelText('Coordinates'),
      '39.76, -104.98',
    )
    await user.click(within(form).getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Saved Denver Central Market.',
    )
    expect(screen.queryByRole('form')).not.toBeInTheDocument()
    expect(rowNames()).toEqual([
      'Corvus Coffee',
      'Denver Central Market',
      'Home',
      "Sloan's Lake",
    ])
  })

  it('opens Edit prefilled with the spot', async () => {
    stubApi()
    render(<AdminSpots />)
    await screen.findByRole('table')
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Edit Corvus Coffee' }))
    const form = screen.getByRole('form', { name: 'Edit spot' })
    expect(within(form).getByLabelText('Name')).toHaveValue('Corvus Coffee')
  })

  it('gives focus to the form, and back to its opener when it closes', async () => {
    stubApi()
    render(<AdminSpots />)
    await screen.findByRole('table')
    const user = userEvent.setup()
    const edit = screen.getByRole('button', { name: 'Edit Corvus Coffee' })
    await user.click(edit)
    expect(screen.getByRole('heading', { name: 'Edit spot' })).toHaveFocus()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(edit).toHaveFocus()

    const add = screen.getByRole('button', { name: 'Add by hand' })
    await user.click(add)
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(add).toHaveFocus()
  })

  it('lists the spots in a panel titled All spots', async () => {
    stubApi()
    render(<AdminSpots />)
    await screen.findByRole('table')
    const panel = screen.getByRole('region', { name: 'All spots' })
    expect(within(panel).getByRole('table')).toBeInTheDocument()
    expect(within(panel).getByText('Public 1')).toBeInTheDocument()
  })

  it('says the session ended when a write is refused with a 401', async () => {
    stubApi({ 'PATCH /api/spots/c': () => json({ detail: 'x' }, 401) })
    render(<AdminSpots />)
    await screen.findByRole('table')
    await userEvent.setup().click(screen.getByLabelText("Public: Sloan's Lake"))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Your session ended. Reload to sign in.',
    )
    expect(screen.getByLabelText("Public: Sloan's Lake")).not.toBeChecked()
  })

  it('says the session ended on a 401', async () => {
    stubApi({ 'GET /api/spots': () => json({ detail: 'x' }, 401) })
    render(<AdminSpots />)
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Your session ended. Reload to sign in.',
    )
  })
})
