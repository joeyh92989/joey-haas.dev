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
      if (method === 'GET' && path === '/api/spots/candidates') return json([])
      if (method === 'GET' && path === '/api/spots/status') return json({})
      return json({}, 404)
    }),
  )
  return calls
}

/** The page's own notice line; the add bar has a status of its own. */
async function pageNotice() {
  const all = await screen.findAllByRole('status')
  return all.find((el) => el.classList.contains('spots-notice'))
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
    expect(await pageNotice()).toHaveTextContent(
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

    expect(await pageNotice()).toHaveTextContent('Saved Denver Central Market.')
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
      'Your session ended. Sign in again.',
    )
    expect(screen.getByLabelText("Public: Sloan's Lake")).not.toBeChecked()
  })

  it('says the session ended on a 401, with no Try again', async () => {
    stubApi({ 'GET /api/spots': () => json({ detail: 'x' }, 401) })
    render(<AdminSpots />)
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Your session ended. Sign in again.',
    )
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
  })

  it('says the spots failed to load and offers Try again', async () => {
    let up = false
    stubApi({
      'GET /api/spots': () => (up ? json(SPOTS) : json({}, 500)),
    })
    render(<AdminSpots />)
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('The spots couldn’t be read.')
    expect(screen.queryByText('Loading spots…')).not.toBeInTheDocument()
    up = true
    await userEvent
      .setup()
      .click(within(alert).getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('table')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  describe('the spot finder', () => {
    function candidate(id, name, fields = {}) {
      return {
        id,
        source: 'osm',
        source_id: `node/${id}`,
        name,
        category: 'cafe',
        lat: 39.75,
        lng: -105,
        distance_m: 900,
        nearest_anchor_id: 'b',
        distance: '0.6 mi from Home · on foot',
        fit: 82,
        reason: 'Close to home, and you go to coffee places most.',
        suggested_tags: ['coffee', 'rainy-day'],
        ...fields,
      }
    }

    const QUEUE = [
      candidate('k1', 'Kaffe Landscap'),
      candidate('k2', 'Bruto', { category: 'restaurant', fit: null }),
    ]
    const LAST_RUN = {
      'candidates.last_run': {
        at: '2026-11-08T23:00:00Z',
        state: 'ok',
        found: 136,
        after_dedupe: 120,
        queued: 40,
        new: 12,
        ranked_by: 'model',
        note: null,
      },
    }

    function finderApi(handlers = {}) {
      return stubApi({
        'GET /api/spots/candidates': () => json(QUEUE),
        'GET /api/spots/status': () => json(LAST_RUN),
        ...handlers,
      })
    }

    function finder() {
      return screen.getByRole('region', { name: 'Spot finder' })
    }

    function cardNames() {
      return within(finder())
        .getAllByRole('listitem')
        .filter((item) => item.classList.contains('cand'))
        .map((item) => within(item).getByRole('heading').textContent)
    }

    it('shows the last run and the queue in order', async () => {
      finderApi()
      render(<AdminSpots />)
      await screen.findByRole('heading', { name: 'Kaffe Landscap' })
      expect(cardNames()).toEqual(['Kaffe Landscap', 'Bruto'])
      expect(within(finder()).getByText(/136 found, 12 new\./)).toBeVisible()
      expect(
        within(finder()).getByText('cafe · 0.6 mi from Home · on foot'),
      ).toBeInTheDocument()
      expect(within(finder()).getByText('82')).toBeInTheDocument()
      expect(
        within(finder()).getByText(
          'Not scored: the model didn’t answer this run.',
        ),
      ).toBeInTheDocument()
    })

    it('says so when the queue is empty and the finder never ran', async () => {
      stubApi()
      render(<AdminSpots />)
      expect(
        await within(finder()).findByText(
          'Nothing new this week. Next run Sunday.',
        ),
      ).toBeInTheDocument()
      expect(
        within(finder()).getByText('Not run yet. It runs Sunday evenings.'),
      ).toBeInTheDocument()
    })

    it('accepts with the pressed tags, adds the spot, and undoes it', async () => {
      let spots = SPOTS
      const answered = {
        candidate: QUEUE[0],
        spot_id: 'new',
      }
      const calls = finderApi({
        'GET /api/spots': () => json(spots),
        'POST /api/spots/candidates/k1/accept': () => {
          spots = [...SPOTS, spot('new', 'Kaffe Landscap')]
          return json(answered)
        },
        'POST /api/spots/candidates/restore': () => json(QUEUE[0]),
      })
      render(<AdminSpots />)
      await screen.findByRole('heading', { name: 'Kaffe Landscap' })
      const user = userEvent.setup()
      const card = screen
        .getByRole('heading', { name: 'Kaffe Landscap' })
        .closest('li')
      await user.click(within(card).getByRole('button', { name: 'Rainy day' }))
      await user.click(within(card).getByRole('button', { name: 'Kid-OK' }))
      await user.click(
        within(card).getByRole('button', {
          name: 'Accept into spots: Kaffe Landscap',
        }),
      )

      expect(calls.find((call) => call.path.endsWith('/accept')).body).toEqual({
        tags: ['coffee', 'kid-ok'],
      })
      const undo = await screen.findByRole('button', {
        name: 'Undo: Kaffe Landscap',
      })
      expect(undo).toHaveFocus()
      expect(cardNames()).toEqual(['Bruto'])
      await screen.findByRole('rowheader', { name: /Kaffe Landscap/ })

      await user.click(undo)
      expect(calls.at(-1)).toEqual({
        method: 'POST',
        path: '/api/spots/candidates/restore',
        body: answered,
      })
      expect(
        await screen.findByRole('button', {
          name: 'Accept into spots: Kaffe Landscap',
        }),
      ).toHaveFocus()
      expect(cardNames()).toEqual(['Kaffe Landscap', 'Bruto'])
      expect(rowNames()).not.toContain('Kaffe Landscap')
    })

    it('dismisses in place, with an Undo', async () => {
      finderApi({
        'POST /api/spots/candidates/k2/dismiss': () =>
          json({ candidate: QUEUE[1], spot_id: null }),
      })
      render(<AdminSpots />)
      await screen.findByRole('heading', { name: 'Bruto' })
      await userEvent
        .setup()
        .click(screen.getByRole('button', { name: 'Dismiss: Bruto' }))
      expect(
        await within(finder()).findByText('dismissed for good.'),
      ).toBeInTheDocument()
      expect(cardNames()).toEqual(['Kaffe Landscap'])
    })

    it('drops a card answered elsewhere and says so', async () => {
      finderApi({
        'POST /api/spots/candidates/k2/dismiss': () =>
          json({ detail: 'That place has already been answered' }, 409),
      })
      render(<AdminSpots />)
      await screen.findByRole('heading', { name: 'Bruto' })
      await userEvent
        .setup()
        .click(screen.getByRole('button', { name: 'Dismiss: Bruto' }))
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Bruto: That place has already been answered',
      )
      expect(cardNames()).toEqual(['Kaffe Landscap'])
      expect(
        screen.queryByRole('button', { name: 'Undo: Bruto' }),
      ).not.toBeInTheDocument()
      // The last card left, so focus goes to the one before it.
      expect(
        screen.getByRole('button', {
          name: 'Accept into spots: Kaffe Landscap',
        }),
      ).toHaveFocus()
    })

    it('runs now, then reads the queue again', async () => {
      let queue = []
      const calls = finderApi({
        'GET /api/spots/candidates': () => json(queue),
        'POST /api/spots/candidates/refresh': () => {
          queue = QUEUE
          return json(LAST_RUN['candidates.last_run'])
        },
      })
      render(<AdminSpots />)
      const user = userEvent.setup()
      await within(finder()).findByText(
        'Nothing new this week. Next run Sunday.',
      )
      await user.click(screen.getByRole('button', { name: 'Run now' }))
      await screen.findByRole('heading', { name: 'Kaffe Landscap' })
      expect(calls.map((call) => `${call.method} ${call.path}`)).toContain(
        'POST /api/spots/candidates/refresh',
      )
      expect(screen.getByRole('button', { name: 'Run now' })).toBeEnabled()
    })

    it('words a failed run', async () => {
      finderApi({
        'GET /api/spots/status': () =>
          json({
            'candidates.last_run': {
              at: '2026-11-08T23:00:00Z',
              state: 'failed',
              note: 'Overpass refused twice',
            },
          }),
      })
      render(<AdminSpots />)
      expect(
        await within(finder()).findByText(/failed: Overpass refused twice\./),
      ).toBeInTheDocument()
    })
  })
})

describe('AdminSpots add bar (story #341)', () => {
  const ROCKS = {
    kind: 'place',
    external_source: 'osm',
    external_id: 'way/1',
    source_id: 'way/1',
    title: 'Red Rocks Amphitheatre',
    address: '18300 W Alameda Pkwy, Morrison',
    category: 'Amphitheatre',
    lat: 39.665,
    lng: -105.205,
    map_url: 'https://www.openstreetmap.org/way/1',
    owned_spot_id: null,
  }
  const ARVADA = {
    ...ROCKS,
    external_id: 'way/2',
    source_id: 'way/2',
    title: 'Arvada Center',
  }

  /**
   * The page's API plus the two intake routes the bar calls: a search answers
   * from `found` by query, and an add writes a spot that the next
   * `GET /api/spots` then returns, as the server does.
   */
  function barApi(found = {}) {
    const stored = [...SPOTS]
    const calls = stubApi({
      'GET /api/spots': () => json([...stored]),
      'POST /api/intake/add': (options) => {
        const body = JSON.parse(options.body)
        const spotRow = spot(`n${stored.length}`, body.payload.name)
        stored.push(spotRow)
        stored.sort((a, b) => a.name.localeCompare(b.name))
        return json(
          { spots_new: [{ id: spotRow.id, name: spotRow.name }] },
          201,
        )
      },
    })
    const base = globalThis.fetch
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url, options = {}) => {
        const path = String(url).replace(/^.*\/api/, '/api')
        if (path.startsWith('/api/intake/search')) {
          const q = new URL(path, 'http://x').searchParams.get('query')
          return json({ results: found[q] ?? [], sources: [] })
        }
        return base(url, options)
      }),
    )
    return calls
  }

  const bar = () => screen.getByRole('region', { name: 'Add a place' })
  const marked = () => document.querySelectorAll('tr.is-marked')

  async function search(user, text) {
    const box = within(bar()).getByLabelText('Add a place by name')
    await user.clear(box)
    await user.type(box, `${text}{Enter}`)
  }

  async function addRocks(user) {
    await search(user, 'red rocks')
    await user.click(
      await within(bar()).findByRole('button', { name: 'Save place' }),
    )
  }

  it('draws the bar between the header and the finder, and Add by hand opens the form', async () => {
    barApi()
    const { container } = render(<AdminSpots />)
    await screen.findByRole('table')
    const page = container.firstChild
    const kids = [...page.children]
    expect(kids.indexOf(bar())).toBeGreaterThan(0)
    expect(kids.indexOf(bar())).toBeLessThan(
      kids.findIndex((el) => el.classList.contains('finder-layout')),
    )
    const user = userEvent.setup()
    await user.click(screen.getAllByRole('button', { name: 'Add by hand' })[0])
    expect(
      await screen.findByRole('form', { name: 'Add a spot' }),
    ).toBeVisible()
    expect(screen.getByLabelText('Name')).toHaveValue('')
  })

  it('adds a place by name and marks its new row', async () => {
    const calls = barApi({ 'red rocks': [ROCKS] })
    render(<AdminSpots />)
    await screen.findByRole('table')
    const user = userEvent.setup()
    await addRocks(user)

    await within(bar()).findByText(/Saved Red Rocks Amphitheatre as a private/)
    const row = await screen.findByRole('row', {
      name: /Red Rocks Amphitheatre/,
    })
    expect(within(row).getByText('New')).toBeInTheDocument()
    expect(row).toHaveClass('is-marked')
    expect(marked()).toHaveLength(1)
    expect(calls.filter((c) => c.path === '/api/intake/add')).toHaveLength(1)
  })

  it('shows the row in the table: clears a hiding filter, scrolls and focuses', async () => {
    barApi({ 'red rocks': [ROCKS] })
    const scroll = vi.fn()
    Element.prototype.scrollIntoView = scroll
    render(<AdminSpots />)
    await screen.findByRole('table')
    const user = userEvent.setup()
    await addRocks(user)
    const row = await screen.findByRole('row', {
      name: /Red Rocks Amphitheatre/,
    })

    const filter = screen.getByRole('searchbox', { name: 'Search spots' })
    await user.type(filter, 'zzz')
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    await user.click(
      await within(bar()).findByRole('link', { name: 'Show in table' }),
    )
    expect(filter).toHaveValue('')
    const shown = await screen.findByRole('row', {
      name: /Red Rocks Amphitheatre/,
    })
    expect(shown).toHaveFocus()
    expect(scroll).toHaveBeenCalled()
    expect(row).toBeDefined()

    // No filter: it still scrolls and focuses.
    scroll.mockClear()
    screen.getByRole('searchbox', { name: 'Search spots' }).focus()
    await user.click(within(bar()).getByRole('link', { name: 'Show in table' }))
    expect(shown).toHaveFocus()
    expect(scroll).toHaveBeenCalledTimes(1)
    delete Element.prototype.scrollIntoView
  })

  it('shows nothing, without an error, for a spot that is not in the list', async () => {
    barApi({ 'red rocks': [ROCKS] })
    render(<AdminSpots />)
    await screen.findByRole('table')
    const user = userEvent.setup()
    await addRocks(user)
    await within(bar()).findByText(/Saved Red Rocks/)
    await screen.findByRole('row', { name: /Red Rocks Amphitheatre/ })
    // The server forgets the spot: the link's read finds nothing.
    stubApi({ 'GET /api/spots': () => json(SPOTS) })
    await user.click(within(bar()).getByRole('link', { name: 'Show in table' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('carries the typed name into Add by hand after an empty search', async () => {
    barApi({ nowhere: [] })
    render(<AdminSpots />)
    await screen.findByRole('table')
    const user = userEvent.setup()
    await search(user, 'nowhere')
    await user.click(
      await within(bar()).findByRole('button', { name: 'Add by hand' }),
    )
    expect(
      await screen.findByRole('form', { name: 'Add a spot' }),
    ).toBeVisible()
    expect(screen.getByLabelText('Name')).toHaveValue('nowhere')
  })

  it('moves the New mark to the latest save and clears it on the next search', async () => {
    barApi({ 'red rocks': [ROCKS], arvada: [ARVADA] })
    render(<AdminSpots />)
    await screen.findByRole('table')
    const user = userEvent.setup()
    await addRocks(user)
    await screen.findByRole('row', { name: /Red Rocks Amphitheatre/ })

    await search(user, 'arvada')
    expect(marked()).toHaveLength(0)
    await user.click(
      await within(bar()).findByRole('button', { name: 'Save place' }),
    )
    const row = await screen.findByRole('row', { name: /Arvada Center/ })
    expect(within(row).getByText('New')).toBeInTheDocument()
    expect(marked()).toHaveLength(1)
    expect(
      within(screen.getByRole('row', { name: /Red Rocks/ })).queryByText('New'),
    ).not.toBeInTheDocument()
  })

  // Horizontal overflow at phone width cannot be measured in jsdom; it is
  // left to the screenshot review.
})
