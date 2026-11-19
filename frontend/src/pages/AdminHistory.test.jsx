import '@testing-library/jest-dom'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AdminHistory from './AdminHistory.jsx'

// The real sheet is its own suite's job; here it only reports its outcomes.
vi.mock('../components/LogOutingSheet.jsx', () => ({
  default: ({ onSaved, onMaybeSaved }) => (
    <>
      <button
        type="button"
        onClick={() => onSaved({ spot: { name: 'Sweet Cow' }, created: false })}
      >
        fake saved
      </button>
      <button type="button" onClick={() => onMaybeSaved()}>
        fake maybe
      </button>
    </>
  ),
}))

const outing = (id, visited_on, more = {}) => ({
  id,
  spot_id: id,
  spot_name: `Place ${id}`,
  neighbourhood: 'Highland',
  city: 'denver',
  visited_on,
  precision: 'day',
  title: null,
  verdict: 'fine',
  kid_along: null,
  note: null,
  ...more,
})

const DATA = {
  year: { year: 2026, outings: 15, places: 13, loved: 7 },
  outings: [
    outing(1, '2026-11-14', {
      title: 'Avalanche',
      verdict: 'loved',
      kid_along: true,
      note: '<b>Park at Auraria</b>',
    }),
    outing(2, '2026-11-08', { verdict: null, kid_along: false }),
    outing(3, '2026-09-01', { precision: 'month' }),
    outing(4, '2024-01-01', { precision: 'year', verdict: 'not_again' }),
  ],
}

function reply(status, body) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  })
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/admin/history']}>
      <Routes>
        <Route path="/admin/history" element={<AdminHistory />} />
      </Routes>
    </MemoryRouter>,
  )
}

let fetchMock
beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

describe('AdminHistory', () => {
  it('shows the counts line, groups, precision words, verdicts and the kid pill', async () => {
    fetchMock.mockImplementation(() => reply(200, DATA))
    renderPage()
    expect(
      await screen.findByText('2026 so far: 15 outings, 13 places, 7 loved.'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { level: 2, name: /November 2026/ }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { level: 2, name: /^2024/ }),
    ).toBeInTheDocument()
    expect(screen.getByText('Sat, Nov 14')).toBeInTheDocument()
    expect(screen.getByText('Some time in September 2026')).toBeInTheDocument()
    expect(screen.getByText('Some time in 2024')).toBeInTheDocument()
    expect(screen.getByText('Loved')).toBeInTheDocument()
    expect(screen.getByText('No verdict')).toBeInTheDocument()
    expect(screen.getByText('Not again')).toBeInTheDocument()
    // Only the one row with kid_along true has the pill.
    expect(screen.getAllByText('Kid came along')).toHaveLength(1)
    // A title heads its row; a missing one falls back to the place.
    expect(screen.getByText('Avalanche')).toBeInTheDocument()
    expect(screen.getByText('Place 2')).toBeInTheDocument()
  })

  it('renders the note as text, not markup', async () => {
    fetchMock.mockImplementation(() => reply(200, DATA))
    const { container } = renderPage()
    await screen.findByText(/Park at Auraria/)
    expect(container.querySelector('.history-note b')).toBeNull()
    expect(screen.getByText(/<b>Park at Auraria<\/b>/)).toBeInTheDocument()
  })

  it('shows the empty state with Log an outing, and no counts line', async () => {
    fetchMock.mockImplementation(() =>
      reply(200, {
        year: { year: 2026, outings: 0, places: 0, loved: 0 },
        outings: [],
      }),
    )
    renderPage()
    expect(
      await screen.findByText('No outings logged yet.'),
    ).toBeInTheDocument()
    expect(screen.queryByText(/so far/)).toBeNull()
    expect(
      screen.getAllByRole('button', { name: 'Log an outing' }),
    ).toHaveLength(2)
  })

  it('says loading first, then fails with Try again and no counts', async () => {
    fetchMock.mockImplementationOnce(() => reply(500, {}))
    renderPage()
    expect(screen.getByText('Loading…')).toBeInTheDocument()
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('could not be read')
    expect(screen.queryByText(/so far/)).toBeNull()
    fetchMock.mockImplementation(() => reply(200, DATA))
    await userEvent.click(
      within(alert).getByRole('button', { name: 'Try again' }),
    )
    await waitFor(() =>
      expect(screen.getByText('Sat, Nov 14')).toBeInTheDocument(),
    )
  })

  it('says the session ended on a 401, without Try again', async () => {
    fetchMock.mockImplementation(() => reply(401, {}))
    renderPage()
    const alert = await screen.findByRole('alert')
    expect(within(alert).queryByRole('button')).toBeNull()
  })

  const EMPTY = {
    year: { year: 2026, outings: 0, places: 0, loved: 0 },
    outings: [],
  }

  it('an empty page, saved, then a failed reread shows the failure and Try again', async () => {
    fetchMock.mockImplementation(() => reply(200, EMPTY))
    renderPage()
    await screen.findByText('No outings logged yet.')
    fetchMock.mockImplementation(() => reply(500, {}))
    await userEvent.click(screen.getByRole('button', { name: 'fake saved' }))
    expect(await screen.findByText(/could not be read/)).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Try again' }),
    ).toBeInTheDocument()
    fetchMock.mockImplementation(() => reply(200, DATA))
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Sat, Nov 14')).toBeInTheDocument()
    expect(screen.queryByText(/could not be read/)).toBeNull()
  })

  it('an empty page, then a reread that ends the session, says so', async () => {
    fetchMock.mockImplementation(() => reply(200, EMPTY))
    renderPage()
    await screen.findByText('No outings logged yet.')
    fetchMock.mockImplementation(() => reply(401, {}))
    await userEvent.click(screen.getByRole('button', { name: 'fake saved' }))
    const alert = await screen.findByRole('alert')
    expect(within(alert).queryByRole('button')).toBeNull()
  })

  it('data on screen, then a reread that ends the session, says so', async () => {
    fetchMock.mockImplementation(() => reply(200, DATA))
    renderPage()
    await screen.findByText('Sat, Nov 14')
    fetchMock.mockImplementation(() => reply(403, {}))
    await userEvent.click(screen.getByRole('button', { name: 'fake maybe' }))
    const alert = await screen.findByRole('alert')
    expect(within(alert).queryByRole('button')).toBeNull()
    expect(screen.getByText('Sat, Nov 14')).toBeInTheDocument()
  })

  it('a maybe-saved reread clears the earlier saved notice', async () => {
    fetchMock.mockImplementation(() => reply(200, DATA))
    renderPage()
    await screen.findByText('Sat, Nov 14')
    await userEvent.click(screen.getByRole('button', { name: 'fake saved' }))
    expect(
      await screen.findByText(/Logged an outing at Sweet Cow/),
    ).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'fake maybe' }))
    expect(screen.queryByText(/Logged an outing at/)).toBeNull()
  })
})

describe('AdminHistory filters', () => {
  const FILTERED = {
    year: { year: 2026, outings: 5, places: 5, loved: 2 },
    outings: [
      outing(1, '2026-11-14', {
        spot_name: 'Ball Arena',
        verdict: 'loved',
        kid_along: true,
        tags: ['food', 'kid-ok'],
      }),
      outing(2, '2026-10-24', {
        spot_name: 'Chautauqua',
        city: 'boulder',
        verdict: 'loved',
        kid_along: true,
        tags: ['park', 'kid-ok'],
      }),
      outing(3, '2026-10-10', {
        spot_name: 'Pearl Street',
        city: 'boulder',
        verdict: 'not_again',
        kid_along: false,
        tags: ['food'],
      }),
      outing(4, '2025-06-01', {
        spot_name: 'Meow Wolf',
        precision: 'month',
        verdict: 'fine',
        kid_along: true,
        tags: ['kid-ok'],
      }),
      outing(5, '2026-09-12', {
        spot_name: 'Boxcar',
        city: 'boulder',
        verdict: 'fine',
        kid_along: false,
        tags: ['coffee'],
      }),
    ],
  }

  beforeEach(() => {
    HTMLDialogElement.prototype.showModal = function () {
      this.setAttribute('open', '')
    }
    HTMLDialogElement.prototype.close = function () {
      this.removeAttribute('open')
      this.dispatchEvent(new Event('close'))
    }
    fetchMock.mockImplementation(() => reply(200, FILTERED))
  })
  afterEach(() => {
    delete HTMLDialogElement.prototype.showModal
    delete HTMLDialogElement.prototype.close
  })

  let here
  function Where() {
    const location = useLocation()
    here = location.pathname + location.search
    return null
  }

  function renderAt(url) {
    return render(
      <MemoryRouter initialEntries={[url]}>
        <Where />
        <Routes>
          <Route path="/admin/history" element={<AdminHistory />} />
        </Routes>
      </MemoryRouter>,
    )
  }

  const strip = () => screen.getByRole('group', { name: 'Filters' })
  const sheet = () => screen.getByRole('dialog')

  async function openSheet() {
    await userEvent.click(screen.getByRole('button', { name: /^Filters/ }))
    return sheet()
  }

  it('shows no result line and the server counts with no filter on', async () => {
    renderAt('/admin/history')
    expect(
      await screen.findByText('2026 so far: 5 outings, 5 places, 2 loved.'),
    ).toBeInTheDocument()
    expect(within(strip()).queryByText(/ of 5 outings/)).toBeNull()
    expect(
      within(strip()).queryByRole('button', { name: /^Remove filter/ }),
    ).toBeNull()
  })

  it('reads the filters from the URL, shows chips and recounts the header', async () => {
    renderAt('/admin/history?city=boulder&verdict=loved&kid=1')
    expect(
      await screen.findByText('2026, filtered: 1 outing, 1 place, 1 loved.'),
    ).toBeInTheDocument()
    expect(within(strip()).getByText('1 of 5 outings')).toBeInTheDocument()
    expect(
      within(strip()).getByRole('button', {
        name: 'Remove filter. City: Boulder',
      }),
    ).toBeInTheDocument()
    expect(
      within(strip()).getByRole('button', {
        name: 'Remove filter. Verdict: Loved',
      }),
    ).toBeInTheDocument()
    expect(
      within(strip()).getByRole('button', {
        name: 'Remove filter. Kid came along',
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /^Filters 3/ }),
    ).toBeInTheDocument()
    expect(screen.getByText('Chautauqua')).toBeInTheDocument()
    expect(screen.queryByText('Ball Arena')).toBeNull()
  })

  it('header counts only the outings in the page year', async () => {
    renderAt('/admin/history?tag=kid-ok')
    // Three kid-ok outings match, one is from 2025.
    expect(
      await screen.findByText('2026, filtered: 2 outings, 2 places, 2 loved.'),
    ).toBeInTheDocument()
    expect(within(strip()).getByText('3 of 5 outings')).toBeInTheDocument()
  })

  it('ignores an unknown value in the URL and leaves it there', async () => {
    renderAt('/admin/history?city=paris&tag=nope&verdict=meh&kid=2')
    await screen.findByText('Ball Arena')
    expect(screen.getAllByRole('listitem')).toHaveLength(5)
    expect(within(strip()).queryByText(/ of 5 outings/)).toBeNull()
    expect(here).toBe('/admin/history?city=paris&tag=nope&verdict=meh&kid=2')
  })

  it('choosing a chip in the sheet writes the URL, replacing history', async () => {
    renderAt('/admin/history?x=1')
    await screen.findByText('Ball Arena')
    const dialog = await openSheet()
    await userEvent.click(
      within(dialog).getByRole('button', { name: /^Boulder/ }),
    )
    expect(here).toBe('/admin/history?x=1&city=boulder')
    await userEvent.click(
      within(dialog).getByRole('button', { name: /^Loved/ }),
    )
    expect(here).toBe('/admin/history?x=1&city=boulder&verdict=loved')
    expect(
      within(dialog).getByRole('button', { name: 'Show 1 outing' }),
    ).toBeInTheDocument()
  })

  it('the sheet lists only choices that exist, with unfiltered counts', async () => {
    renderAt('/admin/history')
    await screen.findByText('Ball Arena')
    const dialog = await openSheet()
    const city = within(within(dialog).getByRole('group', { name: 'City' }))
    expect(city.getByRole('button', { name: 'Denver 2' })).toBeInTheDocument()
    expect(city.getByRole('button', { name: 'Boulder 3' })).toBeInTheDocument()
    expect(city.queryByRole('button', { name: /Golden/ })).toBeNull()
    const tag = within(within(dialog).getByRole('group', { name: 'Tag' }))
    expect(tag.getByRole('button', { name: 'Coffee 1' })).toBeInTheDocument()
    expect(tag.queryByRole('button', { name: /Bike/ })).toBeNull()
    const verdict = within(
      within(dialog).getByRole('group', { name: 'Verdict' }),
    )
    expect(verdict.getAllByRole('button')).toHaveLength(3)
    expect(
      within(dialog).getByRole('button', { name: 'Came along 3' }),
    ).toBeInTheDocument()
  })

  it('the Kid toggle writes kid=1 and clears again', async () => {
    renderAt('/admin/history')
    await screen.findByText('Ball Arena')
    const dialog = await openSheet()
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Came along 3' }),
    )
    expect(here).toBe('/admin/history?kid=1')
    expect(
      within(dialog).getByRole('button', { name: 'Came along 3' }),
    ).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Came along 3' }),
    )
    expect(here).toBe('/admin/history')
  })

  it('removing a chip updates the URL and the list', async () => {
    renderAt('/admin/history?city=boulder&tag=food')
    await screen.findByText('Pearl Street')
    expect(screen.queryByText('Chautauqua')).toBeNull()
    await userEvent.click(
      within(strip()).getByRole('button', {
        name: 'Remove filter. Tag: Food',
      }),
    )
    expect(here).toBe('/admin/history?city=boulder')
    expect(screen.getByText('Chautauqua')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Filters/ })).toHaveFocus()
  })

  it('the result line clears every filter', async () => {
    renderAt('/admin/history?city=boulder&kid=1&spot=2')
    await screen.findByText('1 of 5 outings')
    await userEvent.click(
      within(strip()).getByRole('button', { name: 'Clear filters' }),
    )
    expect(here).toBe('/admin/history')
    expect(screen.getAllByRole('listitem')).toHaveLength(5)
  })

  it('shows the Place chip from ?spot= and filters to that spot', async () => {
    renderAt('/admin/history?spot=4')
    expect(await screen.findByText('Meow Wolf')).toBeInTheDocument()
    expect(screen.queryByText('Ball Arena')).toBeNull()
    expect(
      within(strip()).getByRole('button', {
        name: 'Remove filter. Place: Meow Wolf',
      }),
    ).toBeInTheDocument()
  })

  it('says "this place" for a spot with no outings and offers Clear filters', async () => {
    renderAt('/admin/history?spot=zzz')
    expect(
      await screen.findByText('No outings match these filters.'),
    ).toBeInTheDocument()
    expect(screen.getByText('Place: this place.')).toBeInTheDocument()
    expect(within(strip()).getByText('0 of 5 outings')).toBeInTheDocument()
    // The empty state owns the clear button, so the result line has none.
    expect(
      within(strip()).queryByRole('button', { name: 'Clear filters' }),
    ).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(here).toBe('/admin/history')
    expect(await screen.findByText('Ball Arena')).toBeInTheDocument()
    expect(screen.queryByText('No outings match these filters.')).toBeNull()
  })

  it('names the active filters when nothing matches', async () => {
    renderAt('/admin/history?city=denver&verdict=not_again')
    await screen.findByText('No outings match these filters.')
    expect(
      screen.getByText('City: Denver, Verdict: Not again.'),
    ).toBeInTheDocument()
    expect(screen.getByText(/^2026, filtered: 0 outings/)).toBeInTheDocument()
  })

  it('has no filter strip while there are no outings at all', async () => {
    fetchMock.mockImplementation(() =>
      reply(200, {
        year: { year: 2026, outings: 0, places: 0, loved: 0 },
        outings: [],
      }),
    )
    renderAt('/admin/history')
    await screen.findByText('No outings logged yet.')
    expect(screen.queryByRole('button', { name: /^Filters/ })).toBeNull()
  })

  it('Clear filters in the sheet clears them and Show closes it', async () => {
    renderAt('/admin/history?city=boulder')
    await screen.findByText('Chautauqua')
    const dialog = await openSheet()
    expect(
      within(dialog).getByRole('button', { name: 'Show 3 outings' }),
    ).toBeInTheDocument()
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Clear filters' }),
    )
    expect(here).toBe('/admin/history')
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Show 5 outings' }),
    )
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
