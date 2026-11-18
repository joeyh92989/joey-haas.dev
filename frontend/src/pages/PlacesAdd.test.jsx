import '@testing-library/jest-dom'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { axeViolations } from '../lib/axe.test-util.js'
import PlacesAdd from './PlacesAdd.jsx'

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
const UNION = {
  ...ROCKS,
  external_id: 'way/2',
  source_id: 'way/2',
  title: 'Denver Union Station',
  address: '1701 Wynkoop St, Denver',
  category: 'Train station',
  map_url: 'https://www.openstreetmap.org/way/2',
}
const BUS = {
  ...UNION,
  external_id: 'way/3',
  source_id: 'way/3',
  title: 'Union Station Bus Concourse',
  address: '1700 Wewatta St, Denver',
}
const BOTANIC = {
  ...ROCKS,
  external_id: 'way/4',
  source_id: 'way/4',
  title: 'Denver Botanic Gardens',
  address: '1007 York St, Denver',
  owned_spot_id: 'spot-1',
}

const json = (body, status = 200) =>
  Promise.resolve({
    ok: status < 400,
    status,
    json: () => Promise.resolve(body),
  })

/**
 * A fake of the intake API. `answers` overrides a route by "METHOD path"
 * prefix; every call is kept in `calls`.
 */
function fakeApi({ search, answers = {} } = {}) {
  const calls = []
  const fetch = vi.fn((url, options = {}) => {
    const method = options.method ?? 'GET'
    const body = options.body ? JSON.parse(options.body) : undefined
    calls.push({ method, url, body })
    const key = Object.keys(answers).find((k) =>
      `${method} ${url}`.startsWith(k),
    )
    if (key) {
      const answer = answers[key]
      return typeof answer === 'function' ? answer(body) : answer
    }
    if (url === '/api/spots') {
      return json([{ city: 'denver' }, { city: 'golden' }])
    }
    if (url.startsWith('/api/intake/search')) {
      return search ? search(url) : json({ results: [], sources: [] })
    }
    if (url === '/api/intake/sittings') return json({ id: 'sit-1' }, 201)
    if (url.endsWith('/places')) return json({ id: 'entry-1' }, 201)
    if (url.startsWith('/api/intake/entries/')) return json({ id: 'entry-1' })
    if (url.endsWith('/commit')) {
      return json({
        added: 1,
        spots_new: [{ id: 'spot-9', name: lastName(calls) }],
        spots_owned: [],
      })
    }
    return json({}, 404)
  })
  vi.stubGlobal('fetch', fetch)
  return { calls, fetch }
}

/** The name a commit is for: the last place POSTed. */
function lastName(calls) {
  const posted = [...calls]
    .reverse()
    .find((c) => c.url.endsWith('/places') && c.body)
  return posted.body.chosen?.title ?? posted.body.name
}

const found =
  (...results) =>
  () =>
    json({ results, sources: [] })

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/admin/places/add']}>
      <Routes>
        <Route path="/admin/places/add" element={<PlacesAdd />} />
        <Route path="/admin/spots" element={<p>Spots page</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

const searchCalls = (calls) =>
  calls.filter((c) => c.url.startsWith('/api/intake/search'))

async function submitSearch(user, text) {
  await user.type(screen.getByLabelText('Place name'), `${text}{Enter}`)
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('PlacesAdd', () => {
  it('starts empty, with a labelled search and no list', () => {
    fakeApi()
    renderPage()
    expect(
      screen.getByRole('heading', { level: 1, name: 'Add a place' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('search')).toBeInTheDocument()
    expect(screen.getByLabelText('Place name')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('')
    expect(screen.queryByText(/Paste a list/)).not.toBeInTheDocument()
    expect(screen.queryByText('Added this visit')).not.toBeInTheDocument()
  })

  it('sends nothing while typing; submit searches once', async () => {
    const user = userEvent.setup()
    const { calls } = fakeApi({ search: found(ROCKS) })
    renderPage()
    await user.type(screen.getByLabelText('Place name'), 'Red Rocks')
    expect(searchCalls(calls)).toHaveLength(0)
    await user.click(screen.getByRole('button', { name: 'Search' }))
    await screen.findByRole('group', { name: /Details for/ })
    expect(searchCalls(calls)).toHaveLength(1)
    expect(searchCalls(calls)[0].url).toBe(
      '/api/intake/search?area=places&query=Red%20Rocks',
    )
  })

  it('disables Search while a request is in flight and says the wait', async () => {
    const user = userEvent.setup()
    let release
    const { calls } = fakeApi({
      search: () =>
        new Promise((resolve) => {
          release = () =>
            resolve({
              ok: true,
              json: async () => ({ results: [], sources: [] }),
            })
        }),
    })
    renderPage()
    await submitSearch(user, 'Red Rocks')
    const button = await screen.findByRole('button', { name: 'Searching…' })
    expect(button).toBeDisabled()
    expect(screen.getByRole('status')).toHaveTextContent(
      'Searching OpenStreetMap for “Red Rocks”. This can take a few seconds.',
    )
    await user.type(screen.getByLabelText('Place name'), '{Enter}')
    expect(searchCalls(calls)).toHaveLength(1)
    release()
    await screen.findByRole('button', { name: 'Search' })
  })

  it('opens the one result with its fields and focuses its name', async () => {
    const user = userEvent.setup()
    fakeApi({ search: found(ROCKS) })
    renderPage()
    await submitSearch(user, 'Red Rocks Amphitheatre')
    const form = await screen.findByRole('group', {
      name: 'Details for Red Rocks Amphitheatre',
    })
    expect(screen.getByRole('status')).toHaveTextContent(
      '1 place found for “Red Rocks Amphitheatre”.',
    )
    expect(within(form).getByLabelText('City')).toHaveValue('denver')
    expect(
      within(form)
        .getAllByRole('button', { pressed: false })
        .map((b) => b.textContent),
    ).toEqual([
      'Coffee',
      'Park',
      'Food',
      'Kid-OK',
      'Rainy day',
      'Bike-friendly',
    ])
    expect(within(form).getByLabelText('Blurb')).toBeInTheDocument()
    expect(
      within(form).getByLabelText(/Show on the public Denver page/),
    ).not.toBeChecked()
    await waitFor(() =>
      expect(
        screen.getByText('Red Rocks Amphitheatre', {
          selector: '.place-result-title',
        }),
      ).toHaveFocus(),
    )
    expect(
      screen.getByRole('link', { name: /View on OpenStreetMap: Red Rocks/ }),
    ).toHaveAttribute('href', ROCKS.map_url)
    expect(
      screen.getByRole('link', {
        name: 'Search by OpenStreetMap contributors',
      }),
    ).toHaveAttribute('href', 'https://www.openstreetmap.org/copyright')
  })

  it('lists several with Add, a footer and the credit, and focuses the list', async () => {
    const user = userEvent.setup()
    fakeApi({ search: found(UNION, BUS) })
    renderPage()
    await submitSearch(user, 'Union Station')
    const list = await screen.findByRole('list', {
      name: 'Results for “Union Station”',
    })
    expect(screen.getByRole('status')).toHaveTextContent(
      '2 places found for “Union Station”. Pick the one you mean.',
    )
    expect(list).toHaveFocus()
    expect(
      screen.getByRole('button', {
        name: 'Add Denver Union Station, 1701 Wynkoop St, Denver',
      }),
    ).toHaveAttribute('aria-expanded', 'false')
    const foot = screen.getByRole('group', { name: 'None of these' })
    expect(
      within(foot).getByRole('button', { name: 'Change the words' }),
    ).toBeInTheDocument()
    expect(
      within(foot).getByRole('button', { name: 'Type it by hand' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Search by OpenStreetMap contributors'),
    ).toBeInTheDocument()
  })

  it('says nothing was found and points to the two ways on', async () => {
    const user = userEvent.setup()
    fakeApi({ search: found() })
    renderPage()
    await submitSearch(user, 'Red Roks')
    const title = await screen.findByText('No place found for “Red Roks”.', {
      selector: '.empty-state-title',
    })
    await waitFor(() => expect(title).toHaveFocus())
    await user.click(screen.getByRole('button', { name: 'Change the words' }))
    expect(screen.getByLabelText('Place name')).toHaveFocus()
  })

  it('marks a saved place, links to Spots and offers no Add for it', async () => {
    const user = userEvent.setup()
    fakeApi({ search: found(BOTANIC, UNION) })
    renderPage()
    await submitSearch(user, 'Denver Botanic Gardens')
    await screen.findByRole('list')
    expect(screen.getByRole('status')).toHaveTextContent(
      '2 places found for “Denver Botanic Gardens”. You already saved one of them.',
    )
    const link = screen.getByRole('link', {
      name: /Already saved: Denver Botanic Gardens/,
    })
    expect(link).toHaveAttribute('href', '/admin/spots')
    expect(
      screen.queryByRole('button', { name: /^Add Denver Botanic Gardens/ }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /^Add Denver Union Station/ }),
    ).toBeInTheDocument()
  })

  it('shows a failed search as an alert with Try again and Type it by hand', async () => {
    const user = userEvent.setup()
    const { calls } = fakeApi({
      search: () => json({ detail: 'down' }, 500),
    })
    renderPage()
    await submitSearch(user, 'timeout')
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveClass('admin-error')
    expect(alert).toHaveTextContent(
      'The OpenStreetMap search did not answer. Nothing was saved, and “timeout” is still in the box.',
    )
    expect(screen.getByLabelText('Place name')).toHaveValue('timeout')
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(searchCalls(calls)).toHaveLength(2))
    await user.click(
      within(await screen.findByRole('alert')).getByRole('button', {
        name: 'Type it by hand',
      }),
    )
    expect(
      screen.getByRole('heading', { name: 'Type a place by hand' }),
    ).toBeInTheDocument()
  })

  it('treats a busy source with no results as a failure that says why', async () => {
    const user = userEvent.setup()
    fakeApi({
      search: () =>
        json({
          results: [],
          sources: [{ kind: 'place', state: 'busy', reason: 'Wait a second' }],
        }),
    })
    renderPage()
    await submitSearch(user, 'x')
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Wait a second')
  })

  it('makes one sitting on the first Add, saves, commits and lists the place', async () => {
    const user = userEvent.setup()
    const { calls } = fakeApi({ search: found(UNION, BUS) })
    renderPage()
    await submitSearch(user, 'Union Station')
    expect(calls.some((c) => c.url === '/api/intake/sittings')).toBe(false)
    await user.click(
      await screen.findByRole('button', { name: /^Add Denver Union Station/ }),
    )
    const form = await screen.findByRole('group', {
      name: 'Details for Denver Union Station',
    })
    expect(screen.getByRole('status')).toHaveTextContent(
      'Denver Union Station picked.',
    )
    const sittings = calls.filter((c) => c.url === '/api/intake/sittings')
    expect(sittings).toHaveLength(1)
    expect(sittings[0].body).toMatchObject({ area: 'places', kind: 'place' })
    const posted = calls.find(
      (c) => c.url === '/api/intake/sittings/sit-1/places',
    )
    expect(posted.body.result_count).toBe(2)
    expect(posted.body.chosen.source_id).toBe('way/2')

    await user.click(within(form).getByRole('button', { name: 'Coffee' }))
    await user.type(within(form).getByLabelText('Blurb'), 'Good hall')
    await user.click(
      within(form).getByLabelText(/Show on the public Denver page/),
    )
    await user.click(within(form).getByRole('button', { name: 'Save place' }))

    const heading = await screen.findByRole('heading', {
      name: 'Saved Denver Union Station',
    })
    await waitFor(() => expect(heading).toHaveFocus())
    const patch = calls.find((c) => c.method === 'PATCH')
    expect(patch.url).toBe('/api/intake/entries/entry-1')
    expect(patch.body).toEqual({
      payload: {
        city: 'denver',
        tags: ['coffee'],
        blurb: 'Good hall',
        is_public: true,
      },
      state: 'ready',
    })
    const commit = calls.find((c) => c.url.endsWith('/commit'))
    expect(commit.url).toBe('/api/intake/sittings/sit-1/commit')
    expect(commit.body.today).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(screen.getByRole('status')).toHaveTextContent(
      'Saved Denver Union Station as a private spot.',
    )
    const added = screen.getByRole('region', { name: 'Added this visit' })
    expect(within(added).getByText('Denver Union Station')).toBeInTheDocument()
    expect(
      within(added).getByText('1701 Wynkoop St, Denver'),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'View on Spots' })).toHaveAttribute(
      'href',
      '/admin/spots',
    )

    await user.click(screen.getByRole('button', { name: 'Add another' }))
    expect(screen.getByLabelText('Place name')).toHaveValue('')
    expect(screen.getByLabelText('Place name')).toHaveFocus()
    expect(
      screen.getByRole('region', { name: 'Added this visit' }),
    ).toBeInTheDocument()
  })

  it('creates the entry when the one open result is saved', async () => {
    const user = userEvent.setup()
    const { calls } = fakeApi({ search: found(ROCKS) })
    renderPage()
    await submitSearch(user, 'Red Rocks')
    await user.click(await screen.findByRole('button', { name: 'Save place' }))
    await screen.findByRole('heading', { name: 'Saved Red Rocks Amphitheatre' })
    expect(calls.filter((c) => c.url === '/api/intake/sittings')).toHaveLength(
      1,
    )
    const posted = calls.find((c) => c.url.endsWith('/places'))
    expect(posted.body.result_count).toBe(1)
  })

  it('shows the 409 on Add in the server’s words', async () => {
    const user = userEvent.setup()
    fakeApi({
      search: found(UNION, BUS),
      answers: {
        'POST /api/intake/sittings/sit-1/places': json(
          { detail: 'That place is already on your list' },
          409,
        ),
      },
    })
    renderPage()
    await submitSearch(user, 'Union Station')
    await user.click(
      await screen.findByRole('button', { name: /^Add Denver Union Station/ }),
    )
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('That place is already on your list')
    expect(alert).toHaveClass('admin-error')
  })

  it('shows a refusal at commit (422 detail) and keeps the fields open', async () => {
    const user = userEvent.setup()
    fakeApi({
      search: found(ROCKS),
      answers: {
        'POST /api/intake/sittings/sit-1/commit': json(
          { detail: '1 to fix before anything is added', refused: [] },
          422,
        ),
      },
    })
    renderPage()
    await submitSearch(user, 'Red Rocks')
    await user.click(await screen.findByRole('button', { name: 'Save place' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '1 to fix before anything is added',
    )
    expect(screen.getByRole('button', { name: 'Save place' })).toBeEnabled()
  })

  it('says so when the network fails, without a browser dialog', async () => {
    const user = userEvent.setup()
    const confirm = vi.spyOn(window, 'confirm')
    const calls = []
    vi.stubGlobal(
      'fetch',
      vi.fn((url) => {
        calls.push(url)
        if (url.startsWith('/api/intake/search'))
          return json({ results: [ROCKS], sources: [] })
        if (url === '/api/spots') return json([])
        return Promise.reject(new TypeError('offline'))
      }),
    )
    renderPage()
    await submitSearch(user, 'Red Rocks')
    await user.click(await screen.findByRole('button', { name: 'Save place' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The server did not answer; try again.',
    )
    expect(confirm).not.toHaveBeenCalled()
  })

  it('marks a place owned meanwhile as already saved', async () => {
    const user = userEvent.setup()
    fakeApi({
      search: found(ROCKS),
      answers: {
        'POST /api/intake/sittings/sit-1/commit': json({
          added: 0,
          spots_new: [],
          spots_owned: [{ id: 'spot-3', name: 'Red Rocks Amphitheatre' }],
        }),
      },
    })
    renderPage()
    await submitSearch(user, 'Red Rocks')
    await user.click(await screen.findByRole('button', { name: 'Save place' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That place is already on your list',
    )
    expect(
      screen.getByRole('link', { name: /Already saved: Red Rocks/ }),
    ).toBeInTheDocument()
  })

  it('disables the public box for another city and clears it on the way', async () => {
    const user = userEvent.setup()
    fakeApi({ search: found(ROCKS) })
    renderPage()
    await submitSearch(user, 'Red Rocks')
    const form = await screen.findByRole('group', { name: /Details for/ })
    const box = within(form).getByLabelText(/Show on the public Denver page/)
    await user.click(box)
    expect(box).toBeChecked()
    // The cities of the saved spots come from /api/spots.
    await within(form).findByRole('option', { name: 'Golden' })
    await user.selectOptions(within(form).getByLabelText('City'), 'golden')
    expect(box).toBeDisabled()
    expect(box).not.toBeChecked()
    expect(
      within(form).getByText(
        'Only a Denver place can be shown on the public page.',
      ),
    ).toBeInTheDocument()
    await user.selectOptions(within(form).getByLabelText('City'), 'denver')
    expect(box).toBeEnabled()
    await user.selectOptions(within(form).getByLabelText('City'), 'other')
    const named = within(form).getByLabelText('City name')
    await user.type(named, 'Boulder')
    expect(box).toBeDisabled()
    await user.clear(named)
    await user.type(named, 'Denver')
    expect(box).toBeEnabled()
  })

  it('types a place by hand: a collapsed panel, one POST, then Saved', async () => {
    const user = userEvent.setup()
    const { calls } = fakeApi()
    renderPage()
    expect(
      screen.queryByRole('heading', { name: 'Type a place by hand' }),
    ).not.toBeInTheDocument()
    const way = screen.getByRole('button', { name: 'Type it by hand' })
    expect(way).toHaveAttribute('aria-expanded', 'false')
    await user.click(way)
    expect(way).toHaveAttribute('aria-expanded', 'true')
    const name = screen.getByLabelText('Name')
    await waitFor(() => expect(name).toHaveFocus())
    await user.type(name, 'Cherry Creek Trail')
    await user.type(screen.getByLabelText('Coordinates'), '39.75, -104.99')
    await user.click(screen.getByRole('button', { name: 'Save place' }))
    await screen.findByRole('heading', { name: 'Saved Cherry Creek Trail' })
    const posted = calls.find((c) => c.url.endsWith('/places'))
    expect(posted.body).toMatchObject({
      name: 'Cherry Creek Trail',
      coords: '39.75, -104.99',
      city: 'denver',
      is_public: false,
    })
    expect(calls.some((c) => c.method === 'PATCH')).toBe(false)
    expect(screen.getByText('Saved, private')).toBeInTheDocument()
  })

  it('shows a coordinate refusal beside the coordinates field', async () => {
    const user = userEvent.setup()
    fakeApi({
      answers: {
        'POST /api/intake/sittings/sit-1/places': json(
          { detail: 'Latitude must be between -90 and 90' },
          422,
        ),
      },
    })
    renderPage()
    await user.click(screen.getByRole('button', { name: 'Type it by hand' }))
    await user.type(screen.getByLabelText('Name'), 'Nowhere')
    await user.type(screen.getByLabelText('Coordinates'), '999, 1')
    await user.click(screen.getByRole('button', { name: 'Save place' }))
    const coords = screen.getByLabelText('Coordinates')
    const message = await screen.findByText(
      'Latitude must be between -90 and 90',
    )
    expect(message).toHaveAttribute('role', 'alert')
    expect(coords).toHaveAttribute('aria-invalid', 'true')
    expect(coords.getAttribute('aria-describedby')).toContain(message.id)
    expect(screen.getByLabelText('Name')).toHaveValue('Nowhere')
  })

  it('has no accessibility violations in the open-row state', async () => {
    const user = userEvent.setup()
    fakeApi({ search: found(ROCKS) })
    const { container } = renderPage()
    await submitSearch(user, 'Red Rocks')
    await screen.findByRole('group', { name: /Details for/ })
    expect(await axeViolations(container)).toEqual([])
  })
})
