import '@testing-library/jest-dom'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import MonthInReview from './MonthInReview.jsx'

const answer = vi.hoisted(() => ({
  value: { data: null, live: false, failed: false },
}))
vi.mock('../lib/useSnapshotThenLive.js', () => ({
  useSnapshotThenLive: () => answer.value,
}))
const diary = vi.hoisted(() => ({ rows: [] }))
vi.mock('../lib/usePublicDiary.js', () => ({
  usePublicDiary: () => diary.rows,
}))

function game(id, title, finishedAt) {
  return {
    id,
    type: 'game',
    title,
    wanted: false,
    favorite: false,
    rating: null,
    finished_at: finishedAt,
    cover_url: null,
    status: 'finished',
  }
}

const ITEMS = [
  game('a', 'Hades II', '2026-10-03'),
  game('b', 'Pikmin 4', '2026-08-02'),
]

const SESSIONS = [
  { item_id: 'a', title: 'Hades II', played_on: '2026-10-03', minutes: 45 },
  { item_id: 'b', title: 'Pikmin 4', played_on: '2026-10-01', minutes: null },
]

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/spine/journal/:month" element={<MonthInReview />} />
      </Routes>
    </MemoryRouter>,
  )
}

afterEach(() => {
  answer.value = { data: null, live: false, failed: false }
  diary.rows = []
})

describe('MonthInReview', () => {
  it('shows the month’s finishes, sessions by day and its neighbours', () => {
    answer.value = { data: ITEMS, live: true, failed: false }
    diary.rows = SESSIONS
    renderAt('/spine/journal/2026-10')

    expect(
      screen.getByRole('heading', { level: 1, name: 'October 2026' }),
    ).toBeInTheDocument()
    const finished = screen.getByRole('region', { name: 'Finished' })
    expect(within(finished).getByText('Hades II')).toBeInTheDocument()
    expect(within(finished).queryByText('Pikmin 4')).toBeNull()

    const played = screen.getByRole('region', { name: 'Played' })
    expect(played).toHaveTextContent(
      '2 days with a session logged, 45 minutes in all.',
    )
    expect(within(played).getByText('45 min')).toBeInTheDocument()
    const days = within(played).getAllByRole('time')
    expect(days.map((day) => day.getAttribute('datetime'))).toEqual([
      '2026-10-03',
      '2026-10-01',
    ])

    const nav = screen.getByRole('navigation', { name: 'Months' })
    expect(
      within(nav).getByRole('link', { name: /August 2026/ }),
    ).toHaveAttribute('href', '/spine/journal/2026-08')
    expect(
      within(nav).getByRole('link', { name: '2026 in review' }),
    ).toHaveAttribute('href', '/spine/year/2026')
    expect(within(nav).queryByRole('link', { name: /→/ })).toBeNull()
  })

  it('shows finishes alone when the diary is empty or failed', () => {
    answer.value = { data: ITEMS, live: true, failed: false }
    renderAt('/spine/journal/2026-10')
    expect(screen.getByRole('region', { name: 'Finished' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Played' })).toBeNull()
  })

  it('says so when a month has nothing in it', () => {
    answer.value = { data: ITEMS, live: true, failed: false }
    renderAt('/spine/journal/2026-09')
    expect(
      screen.getByText('Nothing finished or played in September 2026.'),
    ).toBeInTheDocument()
  })

  it('reports a failed load', () => {
    answer.value = { data: null, live: false, failed: true }
    renderAt('/spine/journal/2026-10')
    expect(screen.getByRole('alert')).toHaveTextContent('could not be loaded')
  })

  it.each(['2026-13', 'october', '2026-1'])(
    'treats %s as not found',
    (month) => {
      renderAt(`/spine/journal/${month}`)
      expect(screen.queryByRole('heading', { name: /2026/ })).toBeNull()
      expect(screen.queryByRole('navigation', { name: 'Months' })).toBeNull()
    },
  )
})
