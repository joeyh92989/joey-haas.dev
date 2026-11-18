import '@testing-library/jest-dom'
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { axeViolations } from '../../lib/axe.test-util.js'
import { callsTo, fakePaste, hit } from './pasteFake.test-util.js'
import PastePlaces from './PastePlaces.jsx'

const GOOGLE =
  'https://www.google.com/maps/place/Confluence+Park/@39.7546,-105.0078,17z'
const OSM =
  'https://www.openstreetmap.org/?mlat=39.7392&mlon=-104.9849#map=17/39.7392/-104.9849'
const SHORT = 'https://maps.app.goo.gl/8Kq2ZxYb7TnW4VdR9'

function setup(options) {
  const api = fakePaste(options)
  vi.stubGlobal('fetch', api.fetch)
  return api
}

function renderPaste() {
  return render(
    <MemoryRouter>
      <PastePlaces cities={['boulder', 'golden']} />
    </MemoryRouter>,
  )
}

const box = () => screen.findByLabelText('Places, one per line')

async function typeLines(text) {
  fireEvent.change(await box(), { target: { value: text } })
}

async function addLines(text) {
  await typeLines(text)
  fireEvent.click(screen.getByRole('button', { name: 'Add lines' }))
}

/** Every lookup is done: the Stop button and the meter are gone. */
const lookedUp = async () => {
  await screen.findByRole('button', { name: /^Save/ })
  await waitFor(() =>
    expect(
      screen.queryByRole('button', { name: 'Stop' }),
    ).not.toBeInTheDocument(),
  )
}

const group = (name) =>
  screen.getByRole('button', { name: new RegExp(`^${name}`) })
const list = (name) => screen.getByRole('list', { name })
const row = (title) =>
  screen
    .getAllByText(title)
    .find((el) => el.classList.contains('place-result-title'))
    .closest('li')
/** What the live region says now. */
const said = (text) =>
  waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(text))
/** A gate a test opens: lookups wait on it, so a state under test stays put. */
function gateOf() {
  let release
  const gate = new Promise((resolve) => {
    release = resolve
  })
  return { gate, release }
}
const slow = () => new Promise((resolve) => setTimeout(resolve, 8))
const resolves = (calls) => callsTo(calls, 'POST', '/resolve')

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('PastePlaces: paste', () => {
  it('sends nothing while typing, and counts the lines in the box', async () => {
    const { calls } = setup()
    renderPaste()
    await typeLines('Red Rocks\n\nUnion Station\n')
    expect(screen.getByText('2 lines')).toBeInTheDocument()
    expect(callsTo(calls, 'POST', '/paste')).toHaveLength(0)
    expect(callsTo(calls, 'POST', '/sittings')).toHaveLength(0)
  })

  it('says how many lines the box holds past 200', async () => {
    setup()
    renderPaste()
    await typeLines(Array.from({ length: 214 }, (_, i) => `P${i}`).join('\n'))
    expect(
      screen.getByText(
        '214 lines in the box. Only the first 200 will be added.',
      ),
    ).toBeVisible()
  })

  it('shows the counts after adding, and the pasted text on request', async () => {
    const user = userEvent.setup()
    setup()
    renderPaste()
    await addLines('Red Rocks\n\nred   rocks\nUnion Station\n')
    expect(
      await screen.findByText(
        '2 lines added. 1 blank line and 1 duplicate line ignored.',
      ),
    ).toBeInTheDocument()
    await user.click(
      screen.getByRole('button', { name: 'Show the pasted text' }),
    )
    expect(screen.getByLabelText('The pasted text')).toHaveTextContent(
      'Red Rocks',
    )
    await lookedUp()
  })

  it('shows the lines over the limit in the summary', async () => {
    setup()
    renderPaste()
    await addLines(Array.from({ length: 203 }, (_, i) => `P${i}`).join('\n'))
    expect(
      await screen.findByText(
        /200 lines added\. 3 lines over the limit were dropped\./,
      ),
    ).toBeInTheDocument()
  })

  it('refuses a box with no usable line, beside the field, without a request', async () => {
    const { calls } = setup()
    renderPaste()
    await addLines('\n   \n\n')
    const message = await screen.findByText(
      'Nothing was added. All 3 lines were blank.',
    )
    expect(message).toHaveAttribute('role', 'alert')
    expect(screen.getByLabelText('Places, one per line')).toHaveAttribute(
      'aria-invalid',
      'true',
    )
    expect(callsTo(calls, 'POST', '/paste')).toHaveLength(0)
    fireEvent.change(screen.getByLabelText('Places, one per line'), {
      target: { value: '' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add lines' }))
    expect(
      await screen.findByText('Paste at least one line first.'),
    ).toBeInTheDocument()
  })

  it('keeps the lines in the box and shows the failure when the paste fails', async () => {
    const api = setup()
    const real = api.fetch.getMockImplementation()
    api.fetch.mockImplementation((url, init) =>
      url.endsWith('/paste')
        ? Promise.reject(new TypeError('down'))
        : real(url, init),
    )
    renderPaste()
    await addLines('Red Rocks')
    const alert = await screen.findByText(
      /The server did not answer; try again\. Nothing was added/,
    )
    expect(alert.closest('[role=alert]')).toBeInTheDocument()
    expect(screen.getByLabelText('Places, one per line')).toHaveValue(
      'Red Rocks',
    )
  })
})

describe('PastePlaces: what each line becomes', () => {
  const world = {
    'red rocks': [hit('Red Rocks Amphitheatre')],
    'union station': [
      hit('Denver Union Station'),
      hit('Union Station LA'),
      hit('Washington Union Station'),
    ],
    'tacos near federal': [],
    'wash park': [hit('Washington Park')],
    'washington park': [hit('Washington Park')],
    'denver botanic gardens': [
      hit('Denver Botanic Gardens', { owned_spot_id: 'spot-9' }),
    ],
  }

  async function reviewed(extra = {}) {
    const api = setup({ world, fails: { 'meow wolf': 2 }, ...extra })
    const view = renderPaste()
    await addLines(
      [
        'Red Rocks',
        GOOGLE,
        OSM,
        SHORT,
        'Union Station',
        'Washington Park',
        'Wash Park',
        'Denver Botanic Gardens',
        'Tacos near Federal',
        'Meow Wolf',
        'x'.repeat(320),
      ].join('\n'),
    )
    await lookedUp()
    return { ...api, container: view.container }
  }

  it('groups the list by outcome, to check first', async () => {
    await reviewed()
    const headings = screen
      .getAllByRole('heading', { level: 3 })
      .map((h) => h.textContent)
    expect(headings).toEqual([
      'To check 6',
      'Ready 3',
      'Already saved 1',
      'Same place as another line 1',
    ])
    expect(
      screen.getByText(
        '3 ready to save, 6 to check, 1 already saved, 1 the same place as another line.',
      ),
    ).toBeInTheDocument()
  })

  it('lists a link with coordinates and a name as ready, with where it came from', async () => {
    await reviewed()
    expect(
      within(list('Ready')).getAllByText('Confluence Park').length,
    ).toBeGreaterThan(0)
    expect(
      within(row('Confluence Park')).getByText('From a Google Maps link'),
    ).toBeInTheDocument()
    expect(
      within(row('Red Rocks Amphitheatre')).getByText('Pasted as “Red Rocks”'),
    ).toBeInTheDocument()
  })

  it('draws a coordinate link with no name as a row that needs one, never ready', async () => {
    await reviewed()
    const needs = row('Place at 39.7392, -104.9849')
    expect(list('To check')).toContainElement(needs)
    expect(within(needs).getByText('Needs a name.')).toBeInTheDocument()
    expect(list('Ready')).not.toHaveTextContent('Place at 39.7392')
  })

  it('draws a short link, a long line, a failed row, several and none as check rows', async () => {
    await reviewed()
    const check = within(list('To check'))
    expect(
      check.getByText('Short link, could not be read.'),
    ).toBeInTheDocument()
    expect(check.getByText('Too long to read.')).toBeInTheDocument()
    expect(check.getByText('Search did not answer.')).toBeInTheDocument()
    expect(
      check.getByText('3 places found. Pick the one you mean.'),
    ).toBeInTheDocument()
    expect(check.getByText('No place found.')).toBeInTheDocument()
  })

  it('lists an already saved place and a same-place duplicate, the latter folded', async () => {
    const user = userEvent.setup()
    await reviewed()
    expect(
      within(list('Already saved')).getByText('Denver Botanic Gardens'),
    ).toBeInTheDocument()
    expect(group('Same place as another line')).toHaveAttribute(
      'aria-expanded',
      'false',
    )
    await user.click(group('Same place as another line'))
    expect(
      within(list('Same place as another line')).getByText('Washington Park'),
    ).toBeInTheDocument()
  })

  it('has no accessibility violations in the review state', async () => {
    const { container } = await reviewed()
    expect(await axeViolations(container)).toEqual([])
  })
})

describe('PastePlaces: the lookup queue', () => {
  const NAMES = [
    'Aspen Grove',
    'Birch Hollow',
    'Cedar Point',
    'Dune Field',
    'Elk Meadow',
  ]

  it('has one lookup in flight at a time, in the order pasted', async () => {
    const { stats } = setup({ hold: slow })
    renderPaste()
    await addLines(NAMES.join('\n'))
    await lookedUp()
    expect(stats.resolves).toEqual(NAMES)
    expect(stats.maxInflight).toBe(1)
  })

  it('shows the progress, with a meter that has values', async () => {
    let release
    const gate = new Promise((resolve) => {
      release = resolve
    })
    setup({ hold: () => gate })
    renderPaste()
    await addLines(NAMES.join('\n'))
    expect(
      await screen.findByText('Looking up 1 of 5, “Aspen Grove”.'),
    ).toBeInTheDocument()
    const meter = screen.getByRole('progressbar', { name: 'Lookups done' })
    expect(meter).toHaveAttribute('max', '5')
    expect(meter).toHaveAttribute('value', '0')
    expect(
      screen.getByText(
        'About a second for each name. If you reload the page, it carries on from here.',
      ),
    ).toBeInTheDocument()
    release()
    await lookedUp()
  })

  it('stops after the lookup in flight, saves what is ready, and goes on at Continue', async () => {
    const user = userEvent.setup()
    let release
    let gated = true
    const gate = new Promise((resolve) => {
      release = resolve
    })
    const { stats } = setup({ hold: () => (gated ? gate : slow()) })
    renderPaste()
    await addLines(NAMES.join('\n'))
    await screen.findByText(/Looking up 1 of 5/)
    await user.click(screen.getByRole('button', { name: 'Stop' }))
    gated = false
    release()
    await screen.findByRole('button', { name: 'Continue' })
    await waitFor(() =>
      expect(
        screen.getByText(
          'Stopped after 1 of 5. 4 lines are not looked up yet.',
        ),
      ).toBeInTheDocument(),
    )
    expect(stats.resolves).toEqual(['Aspen Grove'])
    expect(screen.getByRole('button', { name: 'Save 1 place' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await lookedUp()
    expect(stats.resolves).toEqual(NAMES)
    expect(stats.maxInflight).toBe(1)
  })

  it('keeps Save off while lookups run', async () => {
    let release
    const gate = new Promise((resolve) => {
      release = resolve
    })
    setup({ hold: () => gate })
    renderPaste()
    await addLines(NAMES.join('\n'))
    await screen.findByText(/Looking up/)
    expect(screen.getByRole('button', { name: /^Save/ })).toBeDisabled()
    expect(
      screen.getByText('Press Stop to save what is ready so far.'),
    ).toBeInTheDocument()
    release()
    await lookedUp()
    expect(screen.getByRole('button', { name: 'Save 5 places' })).toBeEnabled()
  })

  it('makes no call after the page is left', async () => {
    let release
    const gate = new Promise((resolve) => {
      release = resolve
    })
    const { calls } = setup({ hold: () => gate })
    const view = renderPaste()
    await addLines(NAMES.join('\n'))
    await screen.findByText(/Looking up 1 of 5/)
    expect(resolves(calls)).toHaveLength(1)
    view.unmount()
    release()
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 60))
    })
    expect(resolves(calls)).toHaveLength(1)
  })

  it('waits a second and tries once more when the entry is being looked up', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const { calls } = setup({ busy: { 'aspen grove': 1 } })
    renderPaste()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10)
    })
    fireEvent.change(screen.getByLabelText('Places, one per line'), {
      target: { value: 'Aspen Grove\nBirch Hollow' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add lines' }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10)
    })
    expect(resolves(calls)).toHaveLength(1)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(980)
    })
    expect(resolves(calls)).toHaveLength(1)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(40)
    })
    expect(resolves(calls)).toHaveLength(3)
    expect(
      screen.queryByRole('button', { name: 'Stop' }),
    ).not.toBeInTheDocument()
  })

  it('leaves an entry that stays busy to Try again, and goes on with the others', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const { calls } = setup({ busy: { 'aspen grove': 2 } })
    renderPaste()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10)
    })
    fireEvent.change(screen.getByLabelText('Places, one per line'), {
      target: { value: 'Aspen Grove\nBirch Hollow' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add lines' }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500)
    })
    // Aspen Grove: two 409s (the first call and its one retry); Birch Hollow: one.
    expect(resolves(calls)).toHaveLength(3)
    expect(
      within(list('To check')).getByText('Search did not answer.'),
    ).toBeInTheDocument()
    expect(list('Ready')).toContainElement(row('Birch Hollow'))
  })

  it('marks a line the network dropped as failed, after one retry, without stopping the rest', async () => {
    const { calls } = setup({ netFail: ['birch hollow'] })
    renderPaste()
    await addLines(NAMES.slice(0, 3).join('\n'))
    await lookedUp()
    expect(
      resolves(calls).filter((c) => c.url.includes('entry-2')),
    ).toHaveLength(2)
    expect(
      within(list('To check')).getByText('Search did not answer.'),
    ).toBeInTheDocument()
    expect(within(list('Ready')).getAllByRole('listitem')).toHaveLength(2)
  })

  it('keeps one lookup in flight when Try again is pressed while the walk runs', async () => {
    const user = userEvent.setup()
    const { gate, release } = gateOf()
    // The last name is held, so the walk is still running when Try again is pressed.
    const { stats } = setup({
      hold: (entry) => (entry.payload.name === 'Elk Meadow' ? gate : null),
      netFail: ['aspen grove'],
    })
    renderPaste()
    await addLines(NAMES.join('\n'))
    const retry = await screen.findByRole('button', { name: /^Try again/ })
    await waitFor(() => expect(stats.resolves).toContain('Elk Meadow'))
    expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument()
    await user.click(retry)
    release()
    await lookedUp()
    expect(stats.maxInflight).toBe(1)
    // Two calls for the walk (one retry), two more for the press.
    expect(stats.resolves.filter((n) => n === 'Aspen Grove')).toHaveLength(4)
  })

  it('retries a failed line from Try again', async () => {
    const user = userEvent.setup()
    const api = setup({ fails: { 'birch hollow': 2 } })
    renderPaste()
    await addLines(NAMES.slice(0, 3).join('\n'))
    await lookedUp()
    await user.click(screen.getByRole('button', { name: /^Try again/ }))
    await waitFor(() =>
      expect(
        screen.queryByText('Search did not answer.'),
      ).not.toBeInTheDocument(),
    )
    expect(within(list('Ready')).getAllByRole('listitem')).toHaveLength(3)
    expect(api.stats.maxInflight).toBe(1)
  })
})

describe('PastePlaces: fixing a row', () => {
  const world = {
    'union station': [
      hit('Denver Union Station'),
      hit('Union Station LA', { owned_spot_id: 'spot-3' }),
      hit('Washington Union Station'),
    ],
    'tacos near federal': [],
    'union station denver': [hit('Denver Union Station')],
  }

  async function review(text, extra) {
    const api = setup({ world, ...extra })
    const view = renderPaste()
    await addLines(text)
    await lookedUp()
    return { ...api, view }
  }

  it('picks one of several through the pick route, sending only the index', async () => {
    const user = userEvent.setup()
    const { calls } = await review('Union Station')
    await user.click(screen.getByRole('button', { name: /^Pick/ }))
    const form = screen.getByRole('group', { name: 'Fix Union Station' })
    expect(within(form).getByText('Already saved')).toBeInTheDocument()
    expect(
      within(form).getAllByRole('button', { name: /^Pick / }),
    ).toHaveLength(2)
    await user.click(
      within(form).getByRole('button', {
        name: /^Pick Washington Union Station/,
      }),
    )
    const pick = callsTo(calls, 'POST', '/pick')
    expect(pick).toHaveLength(1)
    expect(pick[0].body).toEqual({ index: 2 })
    await said('Washington Union Station picked. It is ready to save.')
    expect(list('Ready')).toContainElement(row('Washington Union Station'))
  })

  it('moves focus to the row that came back after a pick', async () => {
    const user = userEvent.setup()
    await review('Union Station')
    await user.click(screen.getByRole('button', { name: /^Pick/ }))
    await user.click(
      screen.getByRole('button', { name: /^Pick Denver Union Station/ }),
    )
    await waitFor(() =>
      expect(
        within(row('Denver Union Station')).getByRole('button', {
          name: /^Details/,
        }),
      ).toHaveFocus(),
    )
  })

  it('renames a line with no place found and looks it up again', async () => {
    const user = userEvent.setup()
    const { calls } = await review('Tacos near Federal')
    await user.click(screen.getByRole('button', { name: /^Rename/ }))
    const field = screen.getByLabelText('Name')
    expect(field).toHaveValue('Tacos near Federal')
    expect(
      screen.getAllByRole('link', {
        name: 'Search by OpenStreetMap contributors',
      }).length,
    ).toBeGreaterThan(0)
    await user.clear(field)
    await user.type(field, 'Union Station Denver')
    await user.click(screen.getByRole('button', { name: 'Search again' }))
    await waitFor(() => expect(list('Ready')).toBeInTheDocument())
    const patches = callsTo(calls, 'PATCH', '/entries/')
    expect(patches[0].body).toEqual({
      payload: { name: 'Union Station Denver' },
    })
    expect(resolves(calls)).toHaveLength(2)
    await said('Denver Union Station found. It is ready to save.')
  })

  it('searches again as it is, without a rename, when the name did not change', async () => {
    const user = userEvent.setup()
    const { calls } = await review('Tacos near Federal')
    await user.click(screen.getByRole('button', { name: /^Rename/ }))
    await user.click(screen.getByRole('button', { name: 'Search again' }))
    await waitFor(() => expect(resolves(calls)).toHaveLength(2))
    expect(callsTo(calls, 'PATCH', '/entries/')).toHaveLength(0)
  })

  it('refuses an empty name beside the field', async () => {
    const user = userEvent.setup()
    const { calls } = await review(SHORT)
    await user.click(screen.getByRole('button', { name: /^Type the name/ }))
    await user.click(screen.getByRole('button', { name: 'Search' }))
    expect(screen.getByText('Type a name first.')).toHaveAttribute(
      'role',
      'alert',
    )
    expect(callsTo(calls, 'PATCH', '/entries/')).toHaveLength(0)
  })

  it('names a short link, then searches the name it was given', async () => {
    const user = userEvent.setup()
    const { calls } = await review(SHORT)
    expect(
      screen.getByText('Short link, could not be read.'),
    ).toBeInTheDocument()
    expect(resolves(calls)).toHaveLength(0)
    await user.click(screen.getByRole('button', { name: /^Type the name/ }))
    await user.type(screen.getByLabelText('Place name'), 'Union Station Denver')
    await user.click(screen.getByRole('button', { name: 'Search' }))
    await waitFor(() => expect(list('Ready')).toBeInTheDocument())
    expect(callsTo(calls, 'PATCH', '/entries/')[0].body).toEqual({
      payload: { name: 'Union Station Denver' },
    })
    expect(resolves(calls)).toHaveLength(1)
  })

  it('names a coordinate line and marks it ready, without a search', async () => {
    const user = userEvent.setup()
    const { calls } = await review(OSM)
    await user.click(screen.getByRole('button', { name: /^Name it/ }))
    await user.type(screen.getByLabelText('Name'), 'City Park')
    await user.click(screen.getByRole('button', { name: 'Use this name' }))
    await said('City Park is ready to save.')
    const patches = callsTo(calls, 'PATCH', '/entries/').map((c) => c.body)
    expect(patches).toEqual([
      { payload: { name: 'City Park' } },
      { state: 'ready' },
    ])
    expect(resolves(calls)).toHaveLength(0)
    expect(list('Ready')).toContainElement(row('City Park'))
    await waitFor(() =>
      expect(
        within(row('City Park')).getByRole('button', { name: /^Details/ }),
      ).toHaveFocus(),
    )
  })

  it('shows the server refusal when a named line cannot be marked ready', async () => {
    const user = userEvent.setup()
    const { fetch } = await review(OSM)
    const real = fetch.getMockImplementation()
    fetch.mockImplementation((url, init) =>
      init?.body?.includes('"state"')
        ? Promise.resolve({
            ok: false,
            status: 422,
            json: () =>
              Promise.resolve({ detail: 'This place has no coordinates yet' }),
          })
        : real(url, init),
    )
    await user.click(screen.getByRole('button', { name: /^Name it/ }))
    await user.type(screen.getByLabelText('Name'), 'City Park')
    await user.click(screen.getByRole('button', { name: 'Use this name' }))
    expect(
      await screen.findByText('This place has no coordinates yet'),
    ).toHaveAttribute('role', 'alert')
  })
})

describe('PastePlaces: ready rows', () => {
  it('opens the #340 fields, and a place outside Denver cannot be public', async () => {
    const user = userEvent.setup()
    setup()
    renderPaste()
    await addLines(GOOGLE)
    await lookedUp()
    await user.click(screen.getByRole('button', { name: /^Details/ }))
    const form = screen.getByRole('group', {
      name: 'Details for Confluence Park',
    })
    const toggle = within(form).getByRole('checkbox', {
      name: 'Show on the public Denver page',
    })
    expect(toggle).toBeEnabled()
    await user.click(toggle)
    expect(
      within(row('Confluence Park')).getByText('Denver, public'),
    ).toBeInTheDocument()
    await user.selectOptions(within(form).getByLabelText('City'), 'boulder')
    expect(toggle).toBeDisabled()
    expect(toggle).not.toBeChecked()
    expect(
      within(form).getByText(
        'Only a Denver place can be shown on the public page.',
      ),
    ).toBeInTheDocument()
    expect(
      within(row('Confluence Park')).getByText('Boulder, private'),
    ).toBeInTheDocument()
  })

  it('leaves a place out, lists it as left out, and puts it back', async () => {
    const user = userEvent.setup()
    const { calls } = setup()
    renderPaste()
    await addLines(`${GOOGLE}\nRed Rocks`)
    await lookedUp()
    expect(
      screen.getByRole('button', { name: 'Save 2 places' }),
    ).toBeInTheDocument()
    await user.click(
      within(row('Confluence Park')).getByRole('button', { name: /^Details/ }),
    )
    await user.click(screen.getByRole('button', { name: /^Leave out/ }))
    expect(callsTo(calls, 'PATCH', '/entries/').at(-1).body).toEqual({
      state: 'check',
    })
    await said('Confluence Park left out. It will not be saved.')
    expect(list('To check')).toContainElement(row('Confluence Park'))
    expect(
      within(row('Confluence Park')).getByText('Left out. Not saved.'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Save 1 place' }),
    ).toBeInTheDocument()
    await user.click(
      within(row('Confluence Park')).getByRole('button', { name: /^Put back/ }),
    )
    expect(callsTo(calls, 'PATCH', '/entries/').at(-1).body).toEqual({
      state: 'ready',
    })
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Save 2 places' }),
      ).toBeInTheDocument(),
    )
    expect(list('Ready')).toContainElement(row('Confluence Park'))
  })
})

describe('PastePlaces: save', () => {
  const world = { 'tacos near federal': [] }

  it('saves only the ready places, says what happened, and keeps the lines to check', async () => {
    const user = userEvent.setup()
    const { calls, spots, sittings } = setup({
      world,
      spots: [
        { id: 'spot-9', source_id: hit('Denver Botanic Gardens').source_id },
      ],
    })
    renderPaste()
    await addLines(
      `Red Rocks\n${GOOGLE}\nDenver Botanic Gardens\nTacos near Federal\n${SHORT}`,
    )
    await lookedUp()
    expect(screen.getByRole('button', { name: 'Save 2 places' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'Save 2 places' }))
    const commit = callsTo(calls, 'POST', '/commit')
    expect(commit).toHaveLength(1)
    expect(commit[0].body.today).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(
      spots
        .filter((s) => s.id !== 'spot-9')
        .map((s) => s.name)
        .sort(),
    ).toEqual(['Confluence Park', 'Red Rocks'])
    const heading = await screen.findByRole('heading', {
      name: 'Saved 2 places',
    })
    expect(heading).toHaveFocus()
    expect(
      screen.getByText('They are private spots. Only you can see them.'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('2 still to check. They stay in the list below.'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('1 already saved, not saved again.'),
    ).toBeInTheDocument()
    // The two lines to check are still listed; the sitting is kept.
    expect(within(list('To check')).getAllByRole('listitem')).toHaveLength(2)
    expect(sittings.size).toBe(1)
    const added = screen.getByRole('region', { name: 'Added this visit' })
    expect(within(added).getByText('Confluence Park')).toBeInTheDocument()
    expect(within(added).getAllByText('Saved, private')).toHaveLength(2)
  })

  it('sends a ready place the owner changed, and counts the public ones', async () => {
    const user = userEvent.setup()
    const { calls } = setup()
    renderPaste()
    await addLines(GOOGLE)
    await lookedUp()
    await user.click(screen.getByRole('button', { name: /^Details/ }))
    await user.click(screen.getByRole('button', { name: 'Park' }))
    await user.click(
      screen.getByRole('checkbox', { name: 'Show on the public Denver page' }),
    )
    await user.click(screen.getByRole('button', { name: 'Save 1 place' }))
    await screen.findByRole('heading', { name: 'Saved 1 place' })
    const patch = callsTo(calls, 'PATCH', '/entries/')
    expect(patch[0].body.payload).toEqual({
      city: 'denver',
      tags: ['park'],
      blurb: null,
      is_public: true,
    })
    expect(patch[0].body.state).toBeUndefined()
    expect(
      screen.getByText('It is on the public Denver page.'),
    ).toBeInTheDocument()
    expect(screen.getByText('Saved, public')).toBeInTheDocument()
  })

  it('adds another list to the same sitting while lines are still to check', async () => {
    const user = userEvent.setup()
    const { calls } = setup({ world })
    renderPaste()
    await addLines('Red Rocks\nTacos near Federal')
    await lookedUp()
    await user.click(screen.getByRole('button', { name: 'Save 1 place' }))
    await user.click(
      await screen.findByRole('button', { name: 'Add another list' }),
    )
    expect(screen.getByLabelText('Places, one per line')).toHaveFocus()
    // A line already in the sitting is a duplicate, whatever its case.
    await typeLines('tacos NEAR federal')
    fireEvent.click(screen.getByRole('button', { name: 'Add lines' }))
    expect(
      await screen.findByText(
        'Nothing was added. Every line is already in the list.',
      ),
    ).toBeInTheDocument()
    await typeLines('Union Station Denver')
    fireEvent.click(screen.getByRole('button', { name: 'Add lines' }))
    await screen.findByText(/1 line added\./)
    await lookedUp()
    expect(
      calls.filter(
        (c) => c.method === 'POST' && c.url === '/api/intake/sittings',
      ),
    ).toHaveLength(1)
    const pastes = callsTo(calls, 'POST', '/paste')
    expect(new Set(pastes.map((c) => c.url)).size).toBe(1)
    expect(within(list('To check')).getAllByRole('listitem')).toHaveLength(1)
    expect(list('Ready')).toContainElement(row('Union Station Denver'))
  })

  it('starts a new sitting for the next list when nothing was left to check', async () => {
    const user = userEvent.setup()
    const { calls, sittings } = setup()
    renderPaste()
    await addLines('Red Rocks')
    await lookedUp()
    await user.click(screen.getByRole('button', { name: 'Save 1 place' }))
    await user.click(
      await screen.findByRole('button', { name: 'Add another list' }),
    )
    expect(sittings.size).toBe(0)
    expect(
      screen.queryByRole('button', { name: /^Save/ }),
    ).not.toBeInTheDocument()
    await typeLines('Birch Hollow')
    fireEvent.click(screen.getByRole('button', { name: 'Add lines' }))
    await lookedUp()
    const made = callsTo(calls, 'POST', '/api/intake/sittings').filter(
      (c) => c.url === '/api/intake/sittings',
    )
    expect(made).toHaveLength(2)
  })

  it('shows the first refusal of the commit and keeps the list', async () => {
    const user = userEvent.setup()
    setup({
      refuse: 'The place Red Rocks is outside Denver and cannot be public',
    })
    renderPaste()
    await addLines('Red Rocks')
    await lookedUp()
    await user.click(screen.getByRole('button', { name: 'Save 1 place' }))
    const alert = await screen.findByText(
      'The place Red Rocks is outside Denver and cannot be public',
    )
    expect(alert).toHaveAttribute('role', 'alert')
    expect(screen.getByRole('button', { name: 'Save 1 place' })).toBeEnabled()
    expect(list('Ready')).toContainElement(row('Red Rocks'))
  })
})

describe('PastePlaces: coming back to a list', () => {
  const pasted = (id, name, state = 'reading') => ({
    id,
    state,
    payload: {
      name,
      source_line: name,
      city: 'denver',
      tags: [],
      blurb: null,
      is_public: false,
      ...(state === 'reading' ? { attempts: 0 } : { lat: 39.7, lng: -105 }),
    },
    chosen: null,
  })

  it('offers to continue an open pasted list, and carries on looking up its lines', async () => {
    const user = userEvent.setup()
    const { stats } = setup({
      sittings: [
        {
          id: 'old',
          entries: [
            pasted('e1', 'Aspen Grove'),
            pasted('e2', 'Birch Hollow'),
            pasted('e3', 'Cedar Point', 'ready'),
          ],
        },
      ],
    })
    renderPaste()
    expect(
      await screen.findByText(
        'You started a list with 3 lines and did not finish it.',
      ),
    ).toBeInTheDocument()
    expect(
      screen.queryByLabelText('Places, one per line'),
    ).not.toBeInTheDocument()
    await user.click(
      screen.getByRole('button', { name: 'Continue your list (3 lines)' }),
    )
    await lookedUp()
    expect(stats.resolves).toEqual(['Aspen Grove', 'Birch Hollow'])
    expect(screen.getByText('Your list has 3 lines.')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Save 3 places' }),
    ).toBeInTheDocument()
  })

  it('starts a new list only after an inline confirmation, and deletes the old sitting', async () => {
    const user = userEvent.setup()
    const { calls, sittings } = setup({
      sittings: [{ id: 'old', entries: [pasted('e1', 'Aspen Grove')] }],
    })
    renderPaste()
    await user.click(
      await screen.findByRole('button', { name: 'Start a new list' }),
    )
    expect(callsTo(calls, 'DELETE', '/sittings')).toHaveLength(0)
    expect(screen.getByText(/The old list is deleted/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Keep it' }))
    expect(callsTo(calls, 'DELETE', '/sittings')).toHaveLength(0)
    await user.click(screen.getByRole('button', { name: 'Start a new list' }))
    await user.click(
      screen.getByRole('button', { name: 'Discard the old list' }),
    )
    expect(await screen.findByLabelText('Places, one per line')).toHaveFocus()
    expect(callsTo(calls, 'DELETE', '/sittings').map((c) => c.url)).toEqual([
      '/api/intake/sittings/old',
    ])
    expect(sittings.size).toBe(0)
  })

  it('ignores a places sitting that is not a pasted list, and never deletes it', async () => {
    const search = {
      id: 'search',
      entries: [
        {
          id: 's1',
          state: 'check',
          payload: { name: 'Red Rocks', lat: 1, lng: 2 },
          chosen: null,
        },
      ],
    }
    const { calls, sittings } = setup({ sittings: [search] })
    renderPaste()
    expect(
      await screen.findByLabelText('Places, one per line'),
    ).toBeInTheDocument()
    expect(screen.queryByText(/You started a list/)).not.toBeInTheDocument()
    expect(callsTo(calls, 'DELETE', '/sittings')).toHaveLength(0)
    expect(sittings.has('search')).toBe(true)
  })

  const searchLeftover = {
    id: 'newer-search',
    entries: [
      { id: 's1', state: 'check', payload: { name: 'X' }, chosen: null },
    ],
  }

  it('skips an empty sitting and a search leftover to find an older pasted list', async () => {
    const user = userEvent.setup()
    const { calls } = setup({
      sittings: [
        { id: 'older-paste', entries: [pasted('e1', 'Aspen Grove')] },
        searchLeftover,
        { id: 'newest-empty', entries: [] },
      ],
    })
    renderPaste()
    expect(
      await screen.findByText(
        'You started a list with 1 line and did not finish it.',
      ),
    ).toBeInTheDocument()
    expect(callsTo(calls, 'GET', '/sittings/newer-search')).toHaveLength(1)
    expect(callsTo(calls, 'GET', '/sittings/older-paste')).toHaveLength(1)
    expect(callsTo(calls, 'GET', '/sittings/newest-empty')).toHaveLength(0)
    await user.click(
      screen.getByRole('button', { name: 'Continue your list (1 line)' }),
    )
    await lookedUp()
  })

  it('offers the newest pasted list when two are open', async () => {
    const { calls } = setup({
      sittings: [
        { id: 'older-paste', entries: [pasted('e1', 'Aspen Grove')] },
        { id: 'newer-paste', entries: [pasted('e2', 'Birch Hollow')] },
      ],
    })
    renderPaste()
    await screen.findByText(/You started a list/)
    expect(callsTo(calls, 'GET', '/sittings/older-paste')).toHaveLength(0)
  })

  it('looks through the newest five open sittings and no further', async () => {
    const leftovers = Array.from({ length: 5 }, (_, i) => ({
      ...searchLeftover,
      id: `left-${i}`,
    }))
    const { calls } = setup({
      sittings: [
        { id: 'sixth-paste', entries: [pasted('e1', 'Aspen Grove')] },
        ...leftovers,
      ],
    })
    renderPaste()
    expect(
      await screen.findByLabelText('Places, one per line'),
    ).toBeInTheDocument()
    expect(callsTo(calls, 'GET', '/sittings/sixth-paste')).toHaveLength(0)
    expect(callsTo(calls, 'DELETE', '/sittings')).toHaveLength(0)
  })
})

describe('PastePlaces: a long list', () => {
  const names = Array.from({ length: 100 }, (_, i) => `Place ${i + 1}`)

  it('stays usable at 100 lines: groups fold, ten rows show, Show all opens the rest', async () => {
    const user = userEvent.setup()
    const world = { 'place 7': [], 'place 8': [], 'place 9': [] }
    setup({ world })
    renderPaste()
    await addLines(names.join('\n'))
    await lookedUp()
    expect(
      await screen.findByText('97 ready to save, 3 to check.'),
    ).toBeInTheDocument()
    expect(group('Ready')).toHaveAttribute('aria-expanded', 'false')
    expect(group('To check')).toHaveAttribute('aria-expanded', 'true')
    await user.click(group('Ready'))
    expect(within(list('Ready')).getAllByRole('listitem')).toHaveLength(10)
    await user.click(screen.getByRole('button', { name: /^Show all 97/ }))
    expect(within(list('Ready')).getAllByRole('listitem')).toHaveLength(97)
    await user.click(screen.getByRole('button', { name: /^Show fewer/ }))
    expect(within(list('Ready')).getAllByRole('listitem')).toHaveLength(10)
    expect(screen.getByRole('button', { name: 'Save 97 places' })).toBeEnabled()
  }, 60000)
})

describe('PastePlaces: one request for a double press', () => {
  it('sends one paste for two presses of Add lines in the same tick', async () => {
    const { calls } = setup()
    renderPaste()
    await typeLines('Aspen Grove')
    const button = screen.getByRole('button', { name: 'Add lines' })
    act(() => {
      fireEvent.click(button)
      fireEvent.click(button)
    })
    await lookedUp()
    expect(callsTo(calls, 'POST', '/paste')).toHaveLength(1)
  })

  it('sends one commit for two presses of Save in the same tick', async () => {
    const { calls } = setup()
    renderPaste()
    await addLines('Aspen Grove')
    await lookedUp()
    const button = screen.getByRole('button', { name: 'Save 1 place' })
    act(() => {
      fireEvent.click(button)
      fireEvent.click(button)
    })
    await screen.findByRole('heading', { name: 'Saved 1 place' })
    expect(callsTo(calls, 'POST', '/commit')).toHaveLength(1)
  })
})

describe('PastePlaces: focus and the live region', () => {
  it('moves focus to Stop when lookups start, and to Save when there are none', async () => {
    const user = userEvent.setup()
    const { gate, release } = gateOf()
    setup({ hold: () => gate })
    renderPaste()
    await addLines('Aspen Grove\nBirch Hollow')
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Stop' })).toHaveFocus(),
    )
    release()
    await lookedUp()
    await user.click(screen.getByRole('button', { name: 'Save 2 places' }))
    await screen.findByRole('heading', { name: 'Saved 2 places' })
    await user.click(screen.getByRole('button', { name: 'Add another list' }))
    await typeLines(GOOGLE)
    fireEvent.click(screen.getByRole('button', { name: 'Add lines' }))
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Save 1 place' }),
      ).toHaveFocus(),
    )
  })

  it('speaks every tenth lookup and the end, not every line', async () => {
    setup()
    renderPaste()
    const status = () => screen.getByRole('status')
    await addLines(
      Array.from({ length: 23 }, (_, i) => `Spot ${i + 1}`).join('\n'),
    )
    const heard = new Set()
    await waitFor(() => {
      heard.add(status().textContent)
      expect(
        screen.queryByRole('button', { name: 'Stop' }),
      ).not.toBeInTheDocument()
    })
    await lookedUp()
    heard.add(status().textContent)
    expect(
      [...heard]
        .filter(Boolean)
        .every((t) =>
          /^(10|20) of 23 looked up\.$|^All lines are looked up\.$/.test(t),
        ),
    ).toBe(true)
    expect(status()).toHaveTextContent('All lines are looked up.')
  })

  it('names every control', async () => {
    setup({ world: { 'union station': [hit('A'), hit('B')] } })
    const { container } = renderPaste()
    await addLines(`Union Station\n${GOOGLE}`)
    await lookedUp()
    for (const control of container.querySelectorAll(
      'button, input, select, textarea',
    )) {
      expect(
        control.getAttribute('aria-label') ||
          control.textContent ||
          control.labels?.length,
      ).toBeTruthy()
    }
    expect(await axeViolations(container)).toEqual([])
  })
})

describe('PastePlaces: fix round 1', () => {
  const names = (n, prefix = 'Spot') =>
    Array.from({ length: n }, (_, i) => `${prefix} ${i + 1}`)

  it('offers Try again, and Continue, on a renamed line whose search failed once', async () => {
    const user = userEvent.setup()
    const { stats } = setup({ fails: { 'union station denver': 1 } })
    renderPaste()
    await addLines(SHORT)
    await lookedUp()
    await user.click(screen.getByRole('button', { name: /^Type the name/ }))
    await user.type(screen.getByLabelText('Place name'), 'Union Station Denver')
    await user.click(screen.getByRole('button', { name: 'Search' }))
    // The search failed once: the line waits, and says so where it can be found.
    await screen.findByRole('list', { name: 'Not looked up yet' })
    const waitingRow = row('Union Station Denver')
    expect(list('Not looked up yet')).toContainElement(waitingRow)
    expect(
      within(waitingRow).getByRole('button', { name: /^Try again/ }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument()
    await user.click(
      within(waitingRow).getByRole('button', { name: /^Try again/ }),
    )
    await waitFor(() => expect(list('Ready')).toBeInTheDocument())
    expect(stats.resolves).toEqual([
      'Union Station Denver',
      'Union Station Denver',
    ])
  })

  it('draws a too-long plain line and a too-long URL as too long, not as a short link', async () => {
    const user = userEvent.setup()
    setup()
    renderPaste()
    await addLines(
      [`https://example.com/${'x'.repeat(400)}`, 'y'.repeat(320), SHORT].join(
        '\n',
      ),
    )
    await lookedUp()
    const check = within(list('To check'))
    expect(check.getAllByText('Too long to read.')).toHaveLength(2)
    expect(check.getAllByText('Short link, could not be read.')).toHaveLength(1)
    const longRows = check.getAllByText('Too long to read.')
    await user.click(
      within(longRows[0].closest('li')).getByRole('button', {
        name: /^Type the name/,
      }),
    )
    expect(
      screen.getByText('This line is too long to read. Type the place name.'),
    ).toBeInTheDocument()
    expect(
      screen.queryByText(/never follows short links/),
    ).not.toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toHaveValue('')
  })

  it('reads a long Google Maps place link', async () => {
    setup()
    renderPaste()
    const url = `${GOOGLE}/data=${'!4m6!3m5!1s0x876c7ed1a6f2a8cd'.repeat(24)}`
    expect(url.length).toBeGreaterThan(600)
    await addLines(url)
    await lookedUp()
    expect(list('Ready')).toContainElement(row('Confluence Park'))
  })

  it('says a found place that could not be used needs another name', async () => {
    const user = userEvent.setup()
    setup({ world: { 'bad place': [hit('Bad Place', { lat: 999 })] } })
    renderPaste()
    await addLines('Bad Place')
    await lookedUp()
    expect(
      within(list('To check')).getByText('The place found could not be used.'),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^Rename/ }))
    expect(
      screen.getByText(
        'The place OpenStreetMap found could not be used. Change the name and search again.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByText(/latitude/)).not.toBeInTheDocument()
  })

  it('dedupes a double press on Try again to one lookup', async () => {
    const { stats, calls } = setup({ fails: { 'birch hollow': 2 } })
    renderPaste()
    await addLines('Aspen Grove\nBirch Hollow')
    await lookedUp()
    expect(stats.resolves.filter((n) => n === 'Birch Hollow')).toHaveLength(2)
    const before = resolves(calls).length
    const button = screen.getByRole('button', { name: /^Try again/ })
    act(() => {
      fireEvent.click(button)
      fireEvent.click(button)
    })
    await waitFor(() => expect(list('Ready')).toBeInTheDocument())
    expect(stats.resolves.filter((n) => n === 'Birch Hollow')).toHaveLength(3)
    // One resolve call, and no refusal for a second one on a settled entry.
    expect(resolves(calls)).toHaveLength(before + 1)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('gives each of two same-named places its own address and flag', async () => {
    const user = userEvent.setup()
    setup()
    renderPaste()
    const park = (lat, lng) =>
      `https://www.google.com/maps/place/Park/@${lat},${lng},17z`
    await addLines(`${park(39.1, -105.1)}\n${park(39.9, -105.9)}`)
    await lookedUp()
    const [first, second] = within(list('Ready')).getAllByRole('listitem')
    await user.click(within(second).getByRole('button', { name: /^Details/ }))
    await user.click(
      screen.getByRole('checkbox', { name: 'Show on the public Denver page' }),
    )
    expect(first).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Save 2 places' }))
    const added = await screen.findByRole('region', {
      name: 'Added this visit',
    })
    const items = within(added).getAllByRole('listitem')
    expect(items.map((li) => li.textContent)).toEqual([
      expect.stringContaining('39.1000, -105.1000'),
      expect.stringContaining('39.9000, -105.9000'),
    ])
    expect(within(items[0]).getByText('Saved, private')).toBeInTheDocument()
    expect(within(items[1]).getByText('Saved, public')).toBeInTheDocument()
  })

  it('caps "Added this visit" and opens it with Show all', async () => {
    const user = userEvent.setup()
    setup()
    renderPaste()
    await addLines(names(12).join('\n'))
    await lookedUp()
    await user.click(screen.getByRole('button', { name: 'Save 12 places' }))
    const added = await screen.findByRole('region', {
      name: 'Added this visit',
    })
    expect(within(added).getAllByRole('listitem')).toHaveLength(10)
    await user.click(
      within(added).getByRole('button', { name: /^Show all 12/ }),
    )
    expect(within(added).getAllByRole('listitem')).toHaveLength(12)
  })

  it('speaks the tenth lookup even after a row action said something', async () => {
    const user = userEvent.setup()
    const four = gateOf()
    const eleven = gateOf()
    setup({
      hold: (entry) => {
        if (entry.payload.name === 'Spot 4') return four.gate
        if (entry.payload.name === 'Spot 11') return eleven.gate
        return null
      },
    })
    renderPaste()
    await addLines(names(12).join('\n'))
    await waitFor(() =>
      expect(screen.getAllByRole('listitem').length).toBeGreaterThan(0),
    )
    await user.click(
      (await screen.findAllByRole('button', { name: /^Details/ }))[0],
    )
    await user.click(screen.getByRole('button', { name: /^Leave out/ }))
    await said('left out. It will not be saved.')
    four.release()
    await said('10 of 12 looked up.')
    eleven.release()
    await said('All lines are looked up.')
  })

  it('shows Continue in the saved state while lines are still not looked up', async () => {
    const user = userEvent.setup()
    const { gate, release } = gateOf()
    let gated = true
    setup({
      hold: (entry) => (gated && entry.payload.name === 'Spot 2' ? gate : null),
    })
    renderPaste()
    await addLines(names(3).join('\n'))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument(),
    )
    await user.click(screen.getByRole('button', { name: 'Stop' }))
    gated = false
    release()
    await user.click(
      await screen.findByRole('button', { name: 'Save 2 places' }),
    )
    await screen.findByRole('heading', { name: /^Saved/ })
    expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Add another list' }),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Stop' }),
      ).not.toBeInTheDocument(),
    )
    expect(list('Ready')).toBeInTheDocument()
  })

  it('refuses a paste over 80,000 characters before sending it', async () => {
    const { calls } = setup()
    renderPaste()
    await addLines('a'.repeat(80001))
    expect(
      await screen.findByText(/The box holds more than 80,000 characters/),
    ).toHaveAttribute('role', 'alert')
    expect(callsTo(calls, 'POST', '/paste')).toHaveLength(0)
  })

  it('words a server refusal of the text plainly', async () => {
    const api = setup()
    const real = api.fetch.getMockImplementation()
    api.fetch.mockImplementation((url, init) =>
      url.endsWith('/paste')
        ? Promise.resolve({
            ok: false,
            status: 422,
            json: () =>
              Promise.resolve({
                detail: [
                  { msg: 'String should have at most 80000 characters' },
                ],
              }),
          })
        : real(url, init),
    )
    renderPaste()
    await addLines('Aspen Grove')
    expect(
      await screen.findByText(
        'The server did not accept that text. Check the lines and try again.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByText(/String should/)).not.toBeInTheDocument()
  })

  it('keeps one lookup in flight when Continue is pressed while a lookup is in flight after Stop', async () => {
    const user = userEvent.setup()
    const { gate, release } = gateOf()
    let gated = true
    const { stats } = setup({
      hold: (entry) => (gated && entry.payload.name === 'Spot 1' ? gate : null),
    })
    renderPaste()
    await addLines(names(4).join('\n'))
    await waitFor(() => expect(stats.resolves).toEqual(['Spot 1']))
    await user.click(screen.getByRole('button', { name: 'Stop' }))
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    gated = false
    release()
    await lookedUp()
    expect(stats.maxInflight).toBe(1)
    expect(stats.resolves).toEqual(names(4))
  })

  it('shows a coordinate line that is already saved under Already saved', async () => {
    setup({
      spots: [
        { id: 'spot-4', name: 'Confluence Park', lat: 39.7546, lng: -105.0078 },
      ],
    })
    renderPaste()
    await addLines(`${GOOGLE}\nAspen Grove`)
    await lookedUp()
    expect(
      within(list('Already saved')).getByText('Confluence Park'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Save 1 place' }),
    ).toBeInTheDocument()
  })

  it('shows the server answer when nothing is left to add', async () => {
    const user = userEvent.setup()
    setup({ nothing: true })
    renderPaste()
    await addLines('Aspen Grove')
    await lookedUp()
    await user.click(screen.getByRole('button', { name: 'Save 1 place' }))
    expect(await screen.findByText('Nothing to add')).toHaveAttribute(
      'role',
      'alert',
    )
  })

  it('sends one pick for two presses of Pick, and one PATCH for two presses of Leave out', async () => {
    const user = userEvent.setup()
    const { calls } = setup({
      world: {
        'union station': [hit('Denver Union Station'), hit('LA Union Station')],
      },
    })
    renderPaste()
    await addLines(`Union Station\n${GOOGLE}`)
    await lookedUp()
    await user.click(screen.getByRole('button', { name: /^Pick/ }))
    const pickButton = screen.getByRole('button', { name: /^Pick Denver/ })
    act(() => {
      fireEvent.click(pickButton)
      fireEvent.click(pickButton)
    })
    await waitFor(() => expect(callsTo(calls, 'POST', '/pick')).toHaveLength(1))
    await screen.findByRole('button', { name: 'Save 2 places' })
    await user.click(
      within(row('Confluence Park')).getByRole('button', { name: /^Details/ }),
    )
    const leave = screen.getByRole('button', { name: /^Leave out/ })
    act(() => {
      fireEvent.click(leave)
      fireEvent.click(leave)
    })
    await screen.findByRole('button', { name: /^Put back/ })
    expect(
      callsTo(calls, 'PATCH', '/entries/').filter(
        (c) => c.body.state === 'check',
      ),
    ).toHaveLength(1)
  })
})
