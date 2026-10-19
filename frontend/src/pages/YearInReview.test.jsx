import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import YearInReview from './YearInReview.jsx'

const answer = vi.hoisted(() => ({
  value: { data: null, live: false, failed: false },
}))
vi.mock('../lib/useSnapshotThenLive.js', () => ({
  useSnapshotThenLive: () => answer.value,
}))

const ITEMS = [
  {
    id: 'a',
    type: 'game',
    title: 'Hades II',
    wanted: false,
    favorite: true,
    rating: 10,
    community_score: 88,
    time_to_beat_hours: 30,
    genres: ['Roguelike'],
    finished_at: '2026-09-30',
    cover_url: null,
    status: 'finished',
  },
  {
    id: 'b',
    type: 'game',
    title: 'Pikmin 4',
    wanted: false,
    favorite: false,
    rating: 8,
    community_score: null,
    time_to_beat_hours: null,
    genres: ['Strategy'],
    finished_at: '2025-03-02',
    cover_url: null,
    status: 'finished',
  },
]

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/spine/year/:year" element={<YearInReview />} />
      </Routes>
    </MemoryRouter>,
  )
}

afterEach(() => {
  answer.value = { data: null, live: false, failed: false }
})

describe('YearInReview', () => {
  it('shows the year’s numbers, diary and the other years', () => {
    answer.value = { data: ITEMS, live: true, failed: false }
    renderAt('/spine/year/2026')

    expect(
      screen.getByRole('heading', { level: 1, name: '2026 in review' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Finished').nextSibling).toHaveTextContent('1')
    expect(screen.getByText('Hours to beat').nextSibling).toHaveTextContent(
      '30',
    )
    expect(
      screen.getByRole('img', { name: 'Sep 2026: 1 finished' }),
    ).toBeInTheDocument()
    const diary = screen.getByRole('heading', { name: 'Diary' }).nextSibling
    expect(diary).toHaveTextContent('Sep 30Hades II10/10')
    expect(screen.getByRole('link', { name: '2025' })).toHaveAttribute(
      'href',
      '/spine/year/2025',
    )
    expect(screen.getByText(/I rated 1 higher and 0 lower/)).toBeInTheDocument()
  })

  it('says so when a year has no finishes', () => {
    answer.value = { data: ITEMS, live: true, failed: false }
    renderAt('/spine/year/2023')
    expect(screen.getByText(/No finishes recorded in 2023/)).toBeInTheDocument()
    // The way back to a year that has some, as every January needs.
    expect(screen.getByRole('link', { name: 'See 2026' })).toHaveAttribute(
      'href',
      '/spine/year/2026',
    )
    expect(
      screen.getByRole('navigation', { name: 'Years' }),
    ).toBeInTheDocument()
  })

  it('reports a failed load', () => {
    answer.value = { data: null, live: false, failed: true }
    renderAt('/spine/year/2026')
    expect(screen.getByRole('alert')).toHaveTextContent('could not be loaded')
  })

  it('treats a year that is not a year as not found', () => {
    renderAt('/spine/year/latest')
    expect(screen.queryByRole('heading', { name: /in review/ })).toBeNull()
  })
})
