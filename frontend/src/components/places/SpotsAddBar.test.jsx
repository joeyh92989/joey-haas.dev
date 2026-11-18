import '@testing-library/jest-dom'
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { axeViolations } from '../../lib/axe.test-util.js'
import SpotsAddBar from './SpotsAddBar.jsx'

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
}
const BUS = {
  ...UNION,
  external_id: 'way/3',
  source_id: 'way/3',
  title: 'Union Station Bus Concourse',
}
const BOTANIC = {
  ...ROCKS,
  external_id: 'way/4',
  source_id: 'way/4',
  title: 'Denver Botanic Gardens',
  owned_spot_id: 'spot-9',
}

const json = (body, status = 200) =>
  Promise.resolve({
    ok: status < 400,
    status,
    json: () => Promise.resolve(body),
  })

/**
 * A fake of the two routes the bar calls, keeping the server's rules
 * (backend/intake/routes.py, commit.py): `GET /api/intake/search` answers
 * `{results, sources}`; `POST /api/intake/add` answers 201 with
 * `spots_new` when a spot was written, 200 with `spots_owned` and
 * `already_owned` when the place is owned, and 422 `{detail, refused}` when
 * the write rules refuse it (a public place outside Denver, a missing
 * position). The route has no 404 and its 409 is the catalogue's.
 */
function fakeApi({ search, answers = {} } = {}) {
  const calls = []
  const spots = []
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
    if (url.startsWith('/api/intake/search')) {
      return search ? search(url) : json({ results: [], sources: [] })
    }
    if (url === '/api/intake/add' && method === 'POST') {
      const { payload } = body
      if (typeof payload.lat !== 'number' || typeof payload.lng !== 'number') {
        const message = 'A place needs a position'
        return json({ detail: message, refused: [{ message }] }, 422)
      }
      if (payload.is_public && payload.city !== 'denver') {
        const message = 'Only a Denver place can be public'
        return json({ detail: message, refused: [{ message }] }, 422)
      }
      const owned = spots.find((s) => s.source_id === body.chosen?.source_id)
      const common = {
        issues_added: 0,
        series_grew: [],
        volumes_new: [],
        titles_created: [],
        garment_id: null,
      }
      if (owned) {
        return json(
          {
            ...common,
            added: 0,
            already_owned: 1,
            spots_new: [],
            spots_owned: [{ id: owned.id, name: owned.name }],
            created: [],
          },
          200,
        )
      }
      const spot = {
        id: `spot-${spots.length + 1}`,
        name: payload.name,
        source_id: body.chosen?.source_id,
      }
      spots.push(spot)
      return json(
        {
          ...common,
          added: 1,
          already_owned: 0,
          spots_new: [{ id: spot.id, name: spot.name }],
          spots_owned: [],
          created: [],
        },
        201,
      )
    }
    return json({}, 404)
  })
  vi.stubGlobal('fetch', fetch)
  return { calls, spots }
}

const found =
  (...results) =>
  () =>
    json({ results, sources: [] })

function setup(props = {}) {
  const handlers = {
    onSaved: vi.fn(),
    onAddByHand: vi.fn(),
    onShowInTable: vi.fn(),
    ...props,
  }
  return { ...render(<SpotsAddBar {...handlers} />), ...handlers }
}

const searchCalls = (calls) =>
  calls.filter((c) => c.url.startsWith('/api/intake/search'))
const addCalls = (calls) => calls.filter((c) => c.url === '/api/intake/add')
const query = () => screen.getByLabelText('Add a place by name')

async function submitSearch(user, text) {
  await user.type(query(), `${text}{Enter}`)
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('SpotsAddBar', () => {
  it('starts empty: a labelled search, the short hint, nothing listed', () => {
    fakeApi()
    setup()
    expect(
      screen.getByRole('search', { name: 'Add a place' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'Nothing is looked up while you type. Press Search or Enter.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('')
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })

  it('sends nothing while typing; submit makes exactly one search', async () => {
    const user = userEvent.setup()
    const { calls } = fakeApi({ search: found(ROCKS) })
    setup()
    await user.type(query(), 'Red Rocks')
    expect(calls).toHaveLength(0)
    await user.click(screen.getByRole('button', { name: 'Search' }))
    await screen.findByRole('group', { name: /Details for/ })
    expect(searchCalls(calls)).toHaveLength(1)
    expect(searchCalls(calls)[0].url).toBe(
      '/api/intake/search?area=places&query=Red%20Rocks',
    )
  })

  it('makes one request for two synchronous presses on Search', async () => {
    const { calls } = fakeApi({ search: found(ROCKS) })
    setup()
    fireEvent.change(query(), { target: { value: 'Red Rocks' } })
    const form = screen.getByRole('search')
    fireEvent.submit(form)
    fireEvent.submit(form)
    await screen.findByRole('group', { name: /Details for/ })
    expect(searchCalls(calls)).toHaveLength(1)
  })

  it('disables Search and says the wait while a request runs', async () => {
    const user = userEvent.setup()
    let release
    fakeApi({
      search: () =>
        new Promise((resolve) => {
          release = () =>
            resolve({
              ok: true,
              json: async () => ({ results: [], sources: [] }),
            })
        }),
    })
    setup()
    await submitSearch(user, 'Red Rocks')
    expect(
      await screen.findByRole('button', { name: 'Searching…' }),
    ).toBeDisabled()
    expect(screen.getByRole('status')).toHaveTextContent(
      'Searching OpenStreetMap for “Red Rocks”. This can take a few seconds.',
    )
    release()
    await screen.findByRole('button', { name: 'Search' })
  })

  it('opens the one result at once: Denver, six tags, a blurb, public off; focus on its name', async () => {
    const user = userEvent.setup()
    fakeApi({ search: found(ROCKS) })
    setup()
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
    const credit = screen.getByRole('link', {
      name: 'Search by OpenStreetMap contributors',
    })
    expect(credit).toHaveAttribute(
      'href',
      'https://www.openstreetmap.org/copyright',
    )
  })

  it('saves with one POST to /api/intake/add, then clears and calls onSaved', async () => {
    const user = userEvent.setup()
    const { calls } = fakeApi({ search: found(ROCKS) })
    const { onSaved } = setup()
    await submitSearch(user, 'Red Rocks Amphitheatre')
    const form = await screen.findByRole('group', { name: /Details for/ })
    await user.click(within(form).getByRole('button', { name: 'Park' }))
    await user.click(within(form).getByRole('button', { name: 'Coffee' }))
    await user.type(within(form).getByLabelText('Blurb'), 'Big stage')
    await user.click(within(form).getByRole('button', { name: 'Save place' }))
    await waitFor(() =>
      expect(onSaved).toHaveBeenCalledWith({
        id: 'spot-1',
        name: 'Red Rocks Amphitheatre',
      }),
    )
    expect(addCalls(calls)).toHaveLength(1)
    expect(addCalls(calls)[0]).toMatchObject({
      method: 'POST',
      body: {
        kind: 'place',
        chosen: ROCKS,
        payload: {
          name: 'Red Rocks Amphitheatre',
          lat: 39.665,
          lng: -105.205,
          city: 'denver',
          tags: ['coffee', 'park'],
          blurb: 'Big stage',
          is_public: false,
        },
      },
    })
    expect(screen.getByRole('status')).toHaveTextContent(
      'Saved Red Rocks Amphitheatre as a private spot.',
    )
    expect(query()).toHaveValue('')
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
    await waitFor(() => expect(query()).toHaveFocus())
  })

  it('says the public variant, and Show in table points at the new spot', async () => {
    const user = userEvent.setup()
    fakeApi({ search: found(ROCKS) })
    const { onShowInTable } = setup()
    await submitSearch(user, 'Red Rocks')
    await screen.findByRole('group', { name: /Details for/ })
    await user.click(screen.getByLabelText(/Show on the public Denver page/))
    await user.click(screen.getByRole('button', { name: 'Save place' }))
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        'Saved Red Rocks Amphitheatre and put it on the public Denver page.',
      ),
    )
    await user.click(screen.getByRole('link', { name: 'Show in table' }))
    expect(onShowInTable).toHaveBeenCalledWith('spot-1')
  })

  it('makes one /add for two synchronous presses on Save place', async () => {
    const user = userEvent.setup()
    const { calls } = fakeApi({ search: found(ROCKS) })
    const { onSaved } = setup()
    await submitSearch(user, 'Red Rocks')
    const save = await screen.findByRole('button', { name: 'Save place' })
    fireEvent.click(save)
    fireEvent.click(save)
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(addCalls(calls)).toHaveLength(1)
    expect(onSaved).toHaveBeenCalledTimes(1)
  })

  it('lists several with Add and a footer; Add opens one row, no request', async () => {
    const user = userEvent.setup()
    const { calls } = fakeApi({ search: found(UNION, BUS) })
    setup()
    await submitSearch(user, 'Union Station')
    const list = await screen.findByRole('list', {
      name: 'Results for “Union Station”',
    })
    expect(list).toHaveFocus()
    expect(screen.getByRole('status')).toHaveTextContent(
      '2 places found for “Union Station”. Pick the one you mean.',
    )
    const foot = screen.getByRole('group', { name: 'None of these' })
    expect(
      within(foot).getByRole('button', { name: 'Change the words' }),
    ).toBeInTheDocument()
    expect(
      within(foot).getByRole('button', { name: 'Add by hand' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Search by OpenStreetMap contributors'),
    ).toBeInTheDocument()
    await user.click(
      screen.getByRole('button', {
        name: 'Add Denver Union Station, 1701 Wynkoop St, Denver',
      }),
    )
    await screen.findByRole('group', {
      name: 'Details for Denver Union Station',
    })
    expect(screen.getByRole('status')).toHaveTextContent(
      'Denver Union Station picked.',
    )
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0)
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(
      screen.queryByRole('group', { name: /Details for/ }),
    ).not.toBeInTheDocument()
    await waitFor(() => expect(list).toHaveFocus())
  })

  it('says none with Change the words and Add by hand, carrying the typed name', async () => {
    const user = userEvent.setup()
    fakeApi({ search: found() })
    const { onAddByHand } = setup()
    await submitSearch(user, 'Red Roks')
    const title = await screen.findByText('No place found for “Red Roks”.', {
      selector: '.empty-state-title',
    })
    await waitFor(() => expect(title).toHaveFocus())
    await user.click(screen.getByRole('button', { name: 'Change the words' }))
    expect(query()).toHaveFocus()
    await user.click(screen.getByRole('button', { name: 'Add by hand' }))
    expect(onAddByHand).toHaveBeenCalledWith('Red Roks')
  })

  it('shows a failed search with its reason only when the source gives one', async () => {
    const user = userEvent.setup()
    fakeApi({
      search: () =>
        json({
          results: [],
          sources: [
            { kind: 'place', state: 'failed', reason: 'Nominatim timed out' },
          ],
        }),
    })
    const { onAddByHand } = setup()
    await submitSearch(user, 'Red Rocks')
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(
      'The OpenStreetMap search did not answer. Nothing was saved, and “Red Rocks” is still in the box.',
    )
    expect(alert).toHaveTextContent('Nominatim timed out')
    await user.click(within(alert).getByRole('button', { name: 'Add by hand' }))
    expect(onAddByHand).toHaveBeenCalledWith('Red Rocks')
  })

  it('shows a failed search with no reason line, and Try again searches once more', async () => {
    const user = userEvent.setup()
    let n = 0
    const { calls } = fakeApi({
      search: () =>
        ++n === 1
          ? json({
              results: [],
              sources: [{ kind: 'place', state: 'busy', reason: null }],
            })
          : json({ results: [ROCKS], sources: [] }),
    })
    setup()
    await submitSearch(user, 'Red Rocks')
    const alert = await screen.findByRole('alert')
    expect(alert.querySelectorAll('p.muted')).toHaveLength(0)
    await waitFor(() =>
      expect(within(alert).getByText(/did not answer/)).toHaveFocus(),
    )
    await user.click(within(alert).getByRole('button', { name: 'Try again' }))
    await screen.findByRole('group', { name: /Details for/ })
    expect(searchCalls(calls)).toHaveLength(2)
  })

  it('marks a saved place: no Add, Show in table calls its prop', async () => {
    const user = userEvent.setup()
    fakeApi({ search: found(BOTANIC, UNION) })
    const { onShowInTable } = setup()
    await submitSearch(user, 'Botanic')
    await screen.findByRole('list')
    expect(screen.getByRole('status')).toHaveTextContent(
      '2 places found for “Botanic”. You already saved one of them.',
    )
    expect(screen.getByText('Already saved')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /^Add Denver Botanic/ }),
    ).not.toBeInTheDocument()
    await user.click(
      screen.getByRole('link', {
        name: /Show in table: Denver Botanic Gardens/,
      }),
    )
    expect(onShowInTable).toHaveBeenCalledWith('spot-9')
  })

  it('shows the server words for a 422, the refused message first', async () => {
    const user = userEvent.setup()
    fakeApi({
      search: found(ROCKS),
      answers: {
        'POST /api/intake/add': json(
          {
            detail: 'Refused',
            refused: [{ message: 'Only a Denver place can be public' }],
          },
          422,
        ),
      },
    })
    const { onSaved } = setup()
    await submitSearch(user, 'Red Rocks')
    await user.click(await screen.findByRole('button', { name: 'Save place' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Only a Denver place can be public',
    )
    expect(onSaved).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Save place' })).toBeEnabled()
  })

  it('falls back to the detail of a 409, and to the page words on a network error', async () => {
    const user = userEvent.setup()
    fakeApi({
      search: found(ROCKS),
      answers: {
        'POST /api/intake/add': json({ detail: 'Try again in a moment' }, 409),
      },
    })
    setup()
    await submitSearch(user, 'Red Rocks')
    await user.click(await screen.findByRole('button', { name: 'Save place' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Try again in a moment',
    )
  })

  it('says so when the server does not answer a save', async () => {
    const user = userEvent.setup()
    fakeApi({
      search: found(ROCKS),
      answers: {
        'POST /api/intake/add': () => Promise.reject(new TypeError('offline')),
      },
    })
    setup()
    await submitSearch(user, 'Red Rocks')
    await user.click(await screen.findByRole('button', { name: 'Save place' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The server did not answer; try again.',
    )
  })

  it('marks the row saved when /add answers 200 for an owned place', async () => {
    const user = userEvent.setup()
    const { spots } = fakeApi({ search: found(ROCKS) })
    spots.push({
      id: 'spot-7',
      name: 'Red Rocks Amphitheatre',
      source_id: 'way/1',
    })
    const { onSaved } = setup()
    await submitSearch(user, 'Red Rocks')
    await user.click(await screen.findByRole('button', { name: 'Save place' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That place is already on your list',
    )
    expect(screen.getByText('Already saved')).toBeInTheDocument()
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('disables and clears the public toggle for a city other than Denver', async () => {
    const user = userEvent.setup()
    const { calls } = fakeApi({ search: found(ROCKS) })
    setup()
    await submitSearch(user, 'Red Rocks')
    const form = await screen.findByRole('group', { name: /Details for/ })
    const toggle = within(form).getByLabelText(/Show on the public Denver page/)
    await user.click(toggle)
    expect(toggle).toBeChecked()
    await user.selectOptions(within(form).getByLabelText('City'), 'boulder')
    expect(toggle).toBeDisabled()
    expect(toggle).not.toBeChecked()
    expect(
      screen.getByText('Only a Denver place can be shown on the public page.'),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Save place' }))
    await waitFor(() => expect(addCalls(calls)).toHaveLength(1))
    expect(addCalls(calls)[0].body.payload).toMatchObject({
      city: 'boulder',
      is_public: false,
    })
  })

  it('has no accessibility violations with the row open', async () => {
    const user = userEvent.setup()
    fakeApi({ search: found(ROCKS) })
    const { container } = setup()
    await submitSearch(user, 'Red Rocks')
    await screen.findByRole('group', { name: /Details for/ })
    expect(await axeViolations(container)).toEqual([])
  })
})
