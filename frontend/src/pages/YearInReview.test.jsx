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
const diary = vi.hoisted(() => ({ rows: [] }))
vi.mock('../lib/usePublicDiary.js', () => ({
  usePublicDiary: () => diary.rows,
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
  diary.rows = []
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
      screen.getByRole('link', { name: 'Sep 2026: 1 finished' }),
    ).toHaveAttribute('href', '/spine/journal/2026-09/')
    expect(
      screen.getByRole('img', { name: 'Aug 2026: 0 finished' }),
    ).toBeInTheDocument()
    const finished = screen.getByRole('heading', { name: 'Finishes' })
    expect(finished.nextSibling).toHaveTextContent('Sep 30Hades II10/10')
    expect(screen.getByRole('link', { name: '2025' })).toHaveAttribute(
      'href',
      '/spine/year/2025/',
    )
    expect(
      screen.getByText(/higher than the crowd on 1 and lower on 0/),
    ).toBeInTheDocument()
  })

  it('shows days played and the sessions from the public diary', () => {
    answer.value = { data: ITEMS, live: true, failed: false }
    diary.rows = [
      { item_id: 'a', title: 'Hades II', played_on: '2026-09-29', minutes: 60 },
      {
        item_id: 'a',
        title: 'Hades II',
        played_on: '2026-09-28',
        minutes: null,
      },
      { item_id: 'b', title: 'Pikmin 4', played_on: '2026-09-28', minutes: 30 },
    ]
    renderAt('/spine/year/2026')
    expect(screen.getByText('Days played').nextSibling).toHaveTextContent('2')
    const section = screen.getByRole('heading', {
      name: 'Played',
    }).parentElement
    expect(section).toHaveTextContent('2 days with a session logged.')
    const played = section.querySelector('ol')
    expect(played).toHaveTextContent('Sep 29Hades II60 min')
  })

  it('links a month with sessions but no finish to its journal page', () => {
    answer.value = { data: ITEMS, live: true, failed: false }
    diary.rows = [
      { item_id: 'a', title: 'Hades II', played_on: '2026-07-04', minutes: 20 },
    ]
    renderAt('/spine/year/2026')
    expect(
      screen.getByRole('link', { name: 'Jul 2026: 0 finished, played' }),
    ).toHaveAttribute('href', '/spine/journal/2026-07/')
  })

  it('says so when a year has no finishes', () => {
    answer.value = { data: ITEMS, live: true, failed: false }
    renderAt('/spine/year/2023')
    expect(screen.getByText(/No finishes recorded in 2023/)).toBeInTheDocument()
    // The way back to a year that has some, as every January needs.
    expect(screen.getByRole('link', { name: 'See 2026' })).toHaveAttribute(
      'href',
      '/spine/year/2026/',
    )
    expect(
      screen.getByRole('navigation', { name: 'Years' }),
    ).toBeInTheDocument()
  })

  it('reports a failed load', () => {
    answer.value = { data: null, live: false, failed: true }
    renderAt('/spine/year/2026')
    expect(screen.getByRole('alert')).toHaveTextContent('didn’t load')
  })

  it('treats a year that is not a year as not found', () => {
    renderAt('/spine/year/latest')
    expect(screen.queryByRole('heading', { name: /in review/ })).toBeNull()
  })
})
