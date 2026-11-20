import '@testing-library/jest-dom'
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { axeViolations } from '../../lib/axe.test-util.js'
import { callsTo, fakePaste, hit } from './pasteFake.test-util.js'
import PastePlaces from './PastePlaces.jsx'

// Past outings mode (story #350). The fake mirrors the server's reading of
// dates, duplicates, the entry PATCH and the all-or-nothing commit; the
// owner's day is frozen at 2026-11-19 in the fake.

const SAVED = {
  id: 'spot-9',
  name: 'Saved Place',
  source_id: hit('Saved Place').source_id,
  lat: hit('Saved Place').lat,
  lng: hit('Saved Place').lng,
  outings: [{ id: 'visit-1', visited_on: '2022-05-01', precision: 'month' }],
}

function setup(options) {
  const api = fakePaste({ spots: [{ ...SAVED }], ...options })
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

const switchToOutings = async () => {
  fireEvent.click(await screen.findByRole('button', { name: 'Past outings' }))
}

async function addOutings(text) {
  await switchToOutings()
  fireEvent.change(await screen.findByLabelText('Outings, one per line'), {
    target: { value: text },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Add lines' }))
}

/** Every lookup is done: the Stop button is gone. */
const lookedUp = async () => {
  await screen.findByRole('button', {
    name: /^(Add (\d+ )?outings?|Close the list)$/,
  })
  await waitFor(() =>
    expect(
      screen.queryByRole('button', { name: 'Stop' }),
    ).not.toBeInTheDocument(),
  )
}

const list = (name) => screen.getByRole('list', { name })
/** The row titled `title` in the group `name` (the title is also in a hidden label). */
const inList = (name, title) =>
  within(list(name))
    .getAllByText(title)
    .find((el) => el.classList.contains('place-result-title'))
    .closest('li')
const row = (title) =>
  screen
    .getAllByText(title)
    .find((el) => el.classList.contains('place-result-title'))
    .closest('li')
const addButton = () =>
  screen.getByRole('button', { name: /^Add (\d+ )?outings?$/ })
const patches = (calls) => callsTo(calls, 'PATCH', '/api/intake/entries/')

const LINES = [
  'Union Station, June 14, 2024',
  'Saved Place, May 2022',
  'Meow Wolf, last summer',
  'Red Rocks, 2023',
].join('\n')

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('PastePlaces: past outings', () => {
  it('offers the switch, the city, and sends outings and the city with the paste', async () => {
    const { calls } = setup()
    renderPaste()
    const places = await screen.findByRole('button', { name: 'Places' })
    expect(places).toHaveAttribute('aria-pressed', 'true')
    await switchToOutings()
    expect(
      screen.getByRole('button', { name: 'Past outings' }),
    ).toHaveAttribute('aria-pressed', 'true')
    const city = screen.getByLabelText('City for new places')
    expect(
      within(city)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Denver', 'Boulder', 'Golden'])
    fireEvent.change(city, { target: { value: 'boulder' } })
    fireEvent.change(screen.getByLabelText('Outings, one per line'), {
      target: { value: 'Union Station, 2023' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add lines' }))
    await lookedUp()
    const [paste] = callsTo(calls, 'POST', '/paste')
    expect(paste.body).toEqual({
      text: 'Union Station, 2023',
      outings: true,
      city: 'boulder',
    })
  })

  it('a places paste sends no outings flag and no city', async () => {
    const { calls } = setup()
    renderPaste()
    fireEvent.change(await screen.findByLabelText('Places, one per line'), {
      target: { value: 'Union Station' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add lines' }))
    await screen.findByRole('button', { name: /^Save/ })
    const [paste] = callsTo(calls, 'POST', '/paste')
    expect(paste.body).toEqual({ text: 'Union Station' })
  })

  it('draws date chips and groups: To check, Ready, Already logged', async () => {
    setup()
    renderPaste()
    await addOutings(LINES)
    await lookedUp()
    // Ready: a day, and a year, each with the label and how exact it is.
    const union = row('Union Station')
    expect(within(union).getByText('June 14, 2024')).toBeInTheDocument()
    expect(within(union).getByText('day')).toBeInTheDocument()
    expect(within(row('Red Rocks')).getByText('2023')).toBeInTheDocument()
    expect(within(row('Red Rocks')).getByText('year')).toBeInTheDocument()
    expect(within(list('Ready')).getAllByRole('listitem')).toHaveLength(2)
    // To check: the date was not read, drawn as words.
    const meow = inList('To check', 'Meow Wolf')
    expect(within(meow).getByText('Date not read')).toBeInTheDocument()
    expect(meow).toHaveTextContent('Date not read: “last summer”.')
    // Already logged: the same place and month as an outing in History.
    const logged = inList('Already logged', 'Saved Place')
    expect(within(logged).getByText('May 2022')).toBeInTheDocument()
    expect(logged).toHaveTextContent('In History: May 2022')
    expect(
      within(logged).getByRole('button', { name: /^Add anyway/ }),
    ).toBeInTheDocument()
  })

  it('holds the Add button while a line is to check, and says what holds it', async () => {
    setup()
    renderPaste()
    await addOutings(LINES)
    await lookedUp()
    expect(addButton()).toBeDisabled()
    expect(
      screen.getByText(/1 line to check\. Nothing is added until every line/),
    ).toBeInTheDocument()
  })

  it('holds the Add button while places are not looked up yet', async () => {
    const { gate, release } = (() => {
      let release
      const gate = new Promise((resolve) => {
        release = resolve
      })
      return { gate, release }
    })()
    setup({ hold: () => gate })
    renderPaste()
    await addOutings('Union Station, 2023')
    await screen.findByRole('button', { name: 'Stop' })
    expect(addButton()).toBeDisabled()
    expect(
      screen.getByText('Adding waits until every place is looked up.'),
    ).toBeInTheDocument()
    release()
    await lookedUp()
    expect(addButton()).toBeEnabled()
  })

  it('Fix date sends only the words, and the row moves on the server reply', async () => {
    const { calls } = setup()
    renderPaste()
    await addOutings(LINES)
    await lookedUp()
    fireEvent.click(screen.getByRole('button', { name: /^Fix date/ }))
    const field = screen.getByLabelText('Date')
    expect(field).toHaveValue('last summer')
    expect(
      screen.getByText('Not read. Type a day, a month or a year.'),
    ).toBeInTheDocument()
    // A reading that fails leaves the form open on the same row.
    fireEvent.change(field, { target: { value: '6/7/24' } })
    expect(
      screen.getByText('Press Use this date and it is read.'),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Use this date' }))
    await waitFor(() =>
      expect(screen.getByLabelText('Date')).toHaveValue('6/7/24'),
    )
    await waitFor(() =>
      expect(
        screen.getByText('Not read. Type a day, a month or a year.'),
      ).toBeInTheDocument(),
    )
    fireEvent.change(screen.getByLabelText('Date'), {
      target: { value: 'July 2023' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Use this date' }))
    await waitFor(() =>
      expect(inList('Ready', 'Meow Wolf')).toBeInTheDocument(),
    )
    expect(within(row('Meow Wolf')).getByText('July 2023')).toBeInTheDocument()
    expect(within(row('Meow Wolf')).getByText('month')).toBeInTheDocument()
    // Only the words travel: never a period or a precision.
    const sent = patches(calls).map((c) => c.body)
    expect(sent).toEqual([
      { outing_date_text: '6/7/24' },
      { outing_date_text: 'July 2023' },
    ])
    expect(addButton()).toBeEnabled()
    expect(addButton()).toHaveTextContent('Add 3 outings')
  })

  it('Add anyway and Skip toggle outing_skip', async () => {
    const { calls } = setup()
    renderPaste()
    await addOutings('Saved Place, May 2022')
    await lookedUp()
    // Nothing is ready: the one line is logged, so the list can only be closed.
    expect(screen.queryByRole('button', { name: /^Add \d+ outing/ })).toBeNull()
    expect(
      screen.getByText(/Every line is skipped or left out\./),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^Add anyway/ }))
    await waitFor(() =>
      expect(inList('Ready', 'Saved Place')).toBeInTheDocument(),
    )
    expect(row('Saved Place')).toHaveTextContent('Also in History: May 2022')
    expect(addButton()).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: /^Skip/ }))
    await waitFor(() =>
      expect(inList('Already logged', 'Saved Place')).toBeInTheDocument(),
    )
    expect(patches(calls).map((c) => c.body)).toEqual([
      { outing_skip: false },
      { outing_skip: true },
    ])
  })

  it('Leave out and Put back move a line to Left out and back', async () => {
    setup()
    renderPaste()
    await addOutings('Union Station, 2023\nRed Rocks, 2021')
    await lookedUp()
    fireEvent.click(
      within(row('Red Rocks')).getByRole('button', { name: /^Edit/ }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Leave out' }))
    await waitFor(() =>
      expect(inList('Left out', 'Red Rocks')).toBeInTheDocument(),
    )
    expect(addButton()).toHaveTextContent('Add 1 outing')
    fireEvent.click(screen.getByRole('button', { name: /^Put back/ }))
    await waitFor(() =>
      expect(inList('Ready', 'Red Rocks')).toBeInTheDocument(),
    )
  })

  it('adds the outings and says how many outings and new places', async () => {
    const { calls } = setup()
    renderPaste()
    await addOutings(
      'Union Station, 2023\nUnion Station, June 2024\nSaved Place, 2020',
    )
    await lookedUp()
    expect(
      screen.getByText(/3 outings and 1 new place will be added\./),
    ).toBeInTheDocument()
    fireEvent.click(addButton())
    expect(
      await screen.findByRole('heading', {
        name: 'Added 3 outings, 1 new place.',
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByText('New places, private in Denver: Union Station.'),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'Verdict, note and kid-along are empty. Edit them in History.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open History' })).toHaveAttribute(
      'href',
      '/admin/history',
    )
    expect(callsTo(calls, 'POST', '/commit')).toHaveLength(1)
  })

  it('a refused commit says how many lines need fixing and that nothing was written', async () => {
    const { calls, spots } = setup({ refuseOutings: ['Union Station'] })
    renderPaste()
    await addOutings('Union Station, 2023\nRed Rocks, 2021')
    await lookedUp()
    const before = spots.length
    fireEvent.click(addButton())
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(
      'Nothing was added. 1 line needs fixing. Edit or leave out each one, or press Add outings to try again.',
    )
    expect(spots).toHaveLength(before)
    expect(callsTo(calls, 'POST', '/commit')).toHaveLength(1)
    // The refused row is in To check with the server's words, and is kept.
    const refused = inList('To check', 'Union Station')
    expect(refused).toHaveTextContent('Another spot took that name')
    expect(
      screen.queryByRole('heading', { name: /^Added/ }),
    ).not.toBeInTheDocument()
    // Leaving the refused line out lets the rest go through.
    fireEvent.click(within(refused).getByRole('button', { name: /^Edit/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Leave out' }))
    await waitFor(() => expect(addButton()).toBeEnabled())
    fireEvent.click(addButton())
    expect(
      await screen.findByRole('heading', {
        name: 'Added 1 outing, 1 new place.',
      }),
    ).toBeInTheDocument()
  })

  it('looks places up one at a time, as the place paste does', async () => {
    const { stats } = setup()
    renderPaste()
    await addOutings('A One, 2023\nB Two, 2022\nC Three, 2021\nD Four, 2020')
    await lookedUp()
    expect(stats.resolves).toHaveLength(4)
    expect(stats.maxInflight).toBe(1)
  })

  it('locks the switch while entries are on the page', async () => {
    setup()
    renderPaste()
    await addOutings('Union Station, 2023')
    await lookedUp()
    expect(screen.getByRole('button', { name: 'Places' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Past outings' })).toBeDisabled()
    expect(
      screen.getByText(/Finish or clear this list before changing/),
    ).toBeInTheDocument()
  })

  it('a resumed outings list comes back as outings', async () => {
    const api = fakePaste({
      sittings: [
        {
          id: 'sit-old',
          entries: [
            {
              id: '0e000000-0000-4000-8000-0000000000aa',
              state: 'ready',
              chosen: null,
              payload: {
                name: 'Union Station',
                source_line: 'Union Station, 2023',
                city: 'denver',
                lat: 39.7,
                lng: -104.9,
                outing: {
                  date_text: '2023',
                  visited_on: '2023-01-01',
                  precision: 'year',
                  skip: false,
                },
              },
            },
          ],
        },
      ],
    })
    vi.stubGlobal('fetch', api.fetch)
    renderPaste()
    fireEvent.click(
      await screen.findByRole('button', { name: /^Continue your list/ }),
    )
    expect(
      await screen.findByRole('button', { name: 'Add 1 outing' }),
    ).toBeInTheDocument()
    expect(within(row('Union Station')).getByText('2023')).toBeInTheDocument()
  })

  it('has no accessibility violations with every group on the page', async () => {
    setup()
    const { container } = renderPaste()
    await addOutings(`${LINES}\nOld Place, 2019`)
    await lookedUp()
    fireEvent.click(
      within(row('Red Rocks')).getByRole('button', { name: /^Edit/ }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Leave out' }))
    await screen.findByRole('list', { name: 'Left out' })
    expect(await axeViolations(container)).toEqual([])
  })

  it('a refused row can be edited, and does not hold the Add button', async () => {
    const { calls } = setup({ refuseOutings: ['Union Station'] })
    renderPaste()
    await addOutings('Union Station, 2023\nRed Rocks, 2021')
    await lookedUp()
    fireEvent.click(addButton())
    await screen.findByRole('alert')
    const refused = inList('To check', 'Union Station')
    expect(refused).toHaveTextContent('Another spot took that name')
    // Not held: pressing Add again is the retry (and clears the refusal).
    expect(addButton()).toBeEnabled()
    expect(addButton()).toHaveTextContent('Add 2 outings')
    fireEvent.click(within(refused).getByRole('button', { name: /^Edit/ }))
    fireEvent.change(screen.getByLabelText('Date'), {
      target: { value: 'June 2023' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Use this date' }))
    await waitFor(() =>
      expect(inList('Ready', 'Union Station')).toBeInTheDocument(),
    )
    expect(patches(calls).map((c) => c.body)).toEqual([
      { outing_date_text: 'June 2023' },
    ])
    fireEvent.click(addButton())
    await screen.findByRole('alert')
    expect(callsTo(calls, 'POST', '/commit')).toHaveLength(2)
  })

  it('a list of only skipped lines can be closed', async () => {
    const { calls } = setup()
    renderPaste()
    await addOutings('Saved Place, May 2022')
    await lookedUp()
    expect(addButton).toThrow() // no "Add outings" while nothing is added
    const close = screen.getByRole('button', { name: 'Close the list' })
    expect(close).toBeEnabled()
    fireEvent.click(close)
    expect(
      await screen.findByRole('heading', {
        name: 'Added 0 outings, 0 new places.',
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByText('1 line skipped, already logged.'),
    ).toBeInTheDocument()
    expect(callsTo(calls, 'POST', '/commit')).toHaveLength(1)
  })

  it('does not search a line that is left out', async () => {
    const { stats } = setup()
    renderPaste()
    await addOutings('Saved Place, May 2022\nUnion Station, 2023')
    await lookedUp()
    // The repeat of a logged outing is skipped from the paste: no search for it
    // beyond the one that told it was logged.
    expect(stats.resolves).toEqual(['Saved Place', 'Union Station'])
  })

  it('flags a repeat of an earlier line and says so', async () => {
    setup()
    renderPaste()
    await addOutings('Union Station, June 14, 2024\nUnion Station, 2024-06-14')
    await lookedUp()
    const repeat = inList('Already logged', 'Union Station')
    expect(repeat).toHaveTextContent('Same outing as an earlier line')
    expect(
      within(repeat).getByRole('button', { name: /^Add anyway/ }),
    ).toBeInTheDocument()
    expect(addButton()).toHaveTextContent('Add 1 outing')
  })

  it('the done summary counts only what the commit settled', async () => {
    setup({
      world: { 'unsure place': [hit('Unsure One'), hit('Unsure Two')] },
    })
    renderPaste()
    await addOutings('Union Station, 2023\nUnsure Place, someday')
    await lookedUp()
    // Date not read, and several places found: leaving it out keeps the line
    // for later (the server keeps a line still to check), so it is not "left
    // out" in the summary of what was written.
    fireEvent.click(
      within(inList('To check', 'Unsure Place')).getByRole('button', {
        name: /^Fix date/,
      }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Leave out' }))
    await waitFor(() =>
      expect(inList('Left out', 'Unsure Place')).toBeInTheDocument(),
    )
    fireEvent.click(addButton())
    expect(
      await screen.findByRole('heading', {
        name: 'Added 1 outing, 1 new place.',
      }),
    ).toBeInTheDocument()
    expect(screen.queryByText(/left out\./)).not.toBeInTheDocument()
  })

  it('waits out a lookup that holds the row, once', async () => {
    const api = setup()
    let busy = 1
    const real = api.fetch
    vi.stubGlobal(
      'fetch',
      vi.fn((url, init = {}) => {
        if (init.method === 'PATCH' && busy-- > 0) {
          return Promise.resolve({
            ok: false,
            status: 409,
            json: () =>
              Promise.resolve({
                detail: 'This place is busy. Try again in a moment.',
              }),
          })
        }
        return real(url, init)
      }),
    )
    renderPaste()
    await addOutings('Union Station, 2023')
    await lookedUp()
    fireEvent.click(
      within(row('Union Station')).getByRole('button', { name: /^Edit/ }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Leave out' }))
    await waitFor(
      () => expect(inList('Left out', 'Union Station')).toBeInTheDocument(),
      { timeout: 3000 },
    )
  })

  it('lists an entry of a state outings never make under Left out, without throwing', async () => {
    const api = fakePaste({
      sittings: [
        {
          id: 'sit-old',
          entries: ['ignored', 'ready'].map((state, at) => ({
            id: `0e000000-0000-4000-8000-0000000000b${at}`,
            state,
            chosen: null,
            payload: {
              name: `Place ${state}`,
              source_line: `Place ${state}, 2023`,
              city: 'denver',
              lat: 39.7,
              lng: -104.9,
              outing: {
                date_text: '2023',
                visited_on: '2023-01-01',
                precision: 'year',
                skip: false,
              },
            },
          })),
        },
      ],
    })
    vi.stubGlobal('fetch', api.fetch)
    renderPaste()
    fireEvent.click(
      await screen.findByRole('button', { name: /^Continue your list/ }),
    )
    expect(await inList('Left out', 'Place ignored')).toBeInTheDocument()
    expect(inList('Ready', 'Place ready')).toBeInTheDocument()
  })
})
