import '@testing-library/jest-dom'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AdminHistory from './AdminHistory.jsx'

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
})
