import '@testing-library/jest-dom'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { flaky } from '../lib/flaky.test-util.js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DIARY_FAILED } from '../content/status.js'
import YearInReview from './YearInReview.jsx'
import { axeViolations } from '../lib/axe.test-util.js'

const answer = vi.hoisted(() => ({
  value: { data: null, live: false, failed: false },
}))
vi.mock('../lib/useSnapshotThenLive.js', () => ({
  useSnapshotThenLive: () =>
    typeof answer.value === 'function' ? answer.value() : answer.value,
}))
const diary = vi.hoisted(() => ({ rows: [], failed: false, retry: vi.fn() }))
vi.mock('../lib/usePublicDiary.js', () => ({
  usePublicDiaryState: () => ({
    sessions: diary.rows,
    settled: true,
    failed: diary.failed,
    retry: diary.retry,
  }),
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
        <Route path="/shelf/year/:year" element={<YearInReview />} />
      </Routes>
    </MemoryRouter>,
  )
}

afterEach(() => {
  answer.value = { data: null, live: false, failed: false }
  diary.rows = []
  diary.failed = false
})

describe('YearInReview', () => {
  it('lists a game finished twice in the year twice, the second as again', () => {
    answer.value = {
      data: [
        {
          ...ITEMS[0],
          finishes: ['2026-02-10', '2026-09-30'],
          times_completed: 2,
        },
      ],
      live: true,
      failed: false,
    }
    renderAt('/shelf/year/2026')

    const rows = screen
      .getByRole('heading', { name: 'Finishes' })
      .nextSibling.querySelectorAll('li')
    expect([...rows].map((row) => row.textContent)).toEqual([
      'Sep 30Hades II again10/10',
      'Feb 10Hades II10/10',
    ])
  })

  it('shows a cover for each finish, and a placeholder without one', () => {
    answer.value = {
      data: [
        { ...ITEMS[0], cover_url: 'https://img.test/hades.jpg' },
        { ...ITEMS[1], finished_at: '2026-03-02', cover_url: null },
      ],
      live: true,
      failed: false,
    }
    renderAt('/shelf/year/2026')
    const rows = screen
      .getByRole('heading', { name: 'Finishes' })
      .nextSibling.querySelectorAll('li')
    expect(rows[0].querySelector('img')).toHaveAttribute(
      'src',
      'https://img.test/hades.jpg',
    )
    expect(rows[1].querySelector('img')).toBeNull()
    expect(rows[1].querySelector('.cover-placeholder')).not.toBeNull()
    expect(rows[1].children).toHaveLength(3)
  })

  it('keeps the again tag inside the title cell', () => {
    answer.value = {
      data: [
        {
          ...ITEMS[0],
          finishes: ['2026-02-10', '2026-09-30'],
          times_completed: 2,
        },
      ],
      live: true,
      failed: false,
    }
    renderAt('/shelf/year/2026')

    const row = screen
      .getByRole('heading', { name: 'Finishes' })
      .nextSibling.querySelector('li')
    expect(row.children).toHaveLength(3)
    expect(row.children[1]).toContainElement(within(row).getByText('again'))
    expect(row.children[1]).toContainElement(
      within(row).getByRole('link', { name: 'Hades II' }),
    )
  })

  it('shows the year’s numbers, diary and the other years', () => {
    answer.value = { data: ITEMS, live: true, failed: false }
    renderAt('/shelf/year/2026')

    expect(
      screen.getByRole('heading', { level: 1, name: '2026 in review' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Finished').nextSibling).toHaveTextContent('1')
    expect(screen.getByText('Hours to beat').nextSibling).toHaveTextContent(
      '30',
    )
    expect(
      screen.getByRole('link', { name: 'Sep 2026: 1 finished' }),
    ).toHaveAttribute('href', '/shelf/journal/2026-09/')
    expect(
      screen.getByRole('img', { name: 'Aug 2026: 0 finished' }),
    ).toBeInTheDocument()
    const finished = screen.getByRole('heading', { name: 'Finishes' })
    expect(finished.nextSibling).toHaveTextContent('Sep 30Hades II10/10')
    expect(screen.getByRole('link', { name: '2025' })).toHaveAttribute(
      'href',
      '/shelf/year/2025/',
    )
    expect(
      screen.getByText(/higher than the crowd on 1 and lower on 0/),
    ).toBeInTheDocument()
  })

  it('counts rated finishes in the plural, and one in the singular', () => {
    answer.value = {
      data: [
        ITEMS[0],
        {
          ...ITEMS[1],
          id: 'c',
          title: 'Pentiment',
          community_score: 85,
          finished_at: '2026-05-01',
        },
      ],
      live: true,
      failed: false,
    }
    const { unmount } = renderAt('/shelf/year/2026')
    expect(
      screen.getByText(/Of 2 rated finishes with an IGDB community score/),
    ).toBeInTheDocument()
    unmount()

    answer.value = { data: ITEMS, live: true, failed: false }
    renderAt('/shelf/year/2026')
    expect(
      screen.getByText(/Of 1 rated finish with an IGDB community score/),
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
    renderAt('/shelf/year/2026')
    expect(screen.getByText('Days played').nextSibling).toHaveTextContent('2')
    const section = screen.getByRole('heading', {
      name: 'Played',
    }).parentElement
    expect(section).toHaveTextContent('2 days with a session logged.')
    const played = section.querySelector('ol')
    expect(played).toHaveTextContent('Sep 29Hades II60 min')
  })

  it('says the diary did not load, with Try again, where Played would be', async () => {
    answer.value = { data: ITEMS, live: true, failed: false }
    diary.failed = true
    diary.retry = vi.fn()
    renderAt('/shelf/year/2026')
    expect(screen.getByRole('alert')).toHaveTextContent(DIARY_FAILED)
    expect(screen.queryByRole('heading', { name: 'Played' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(diary.retry).toHaveBeenCalledTimes(1)
  })

  it('links a month with sessions but no finish to its journal page', () => {
    answer.value = { data: ITEMS, live: true, failed: false }
    diary.rows = [
      { item_id: 'a', title: 'Hades II', played_on: '2026-07-04', minutes: 20 },
    ]
    renderAt('/shelf/year/2026')
    expect(
      screen.getByRole('link', { name: 'Jul 2026: 0 finished, played' }),
    ).toHaveAttribute('href', '/shelf/journal/2026-07/')
  })

  it('says so when a year has no finishes', () => {
    answer.value = { data: ITEMS, live: true, failed: false }
    renderAt('/shelf/year/2023')
    expect(screen.getByText(/No finishes recorded in 2023/)).toBeInTheDocument()
    // The way back to a year that has some, as every January needs.
    expect(screen.getByRole('link', { name: 'See 2026' })).toHaveAttribute(
      'href',
      '/shelf/year/2026/',
    )
    expect(
      screen.getByRole('navigation', { name: 'Years' }),
    ).toBeInTheDocument()
  })

  it('reports a failed load', () => {
    answer.value = { data: null, live: false, failed: true }
    renderAt('/shelf/year/2026')
    expect(screen.getByRole('alert')).toHaveTextContent('didn’t load')
    expect(
      screen.getByRole('heading', { level: 1, name: '2026 in review' }),
    ).toBeInTheDocument()
  })

  it('shows the year after Try again', async () => {
    answer.value = flaky({ data: ITEMS, live: true })
    renderAt('/shelf/year/2026')
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getAllByText('Hades II').length).toBeGreaterThan(0)
  })

  it('treats a year that is not a year as not found', () => {
    renderAt('/shelf/year/latest')
    expect(screen.queryByRole('heading', { name: /in review/ })).toBeNull()
  })

  it('has no axe violations', async () => {
    answer.value = { data: ITEMS, live: true, failed: false }
    const { container } = renderAt('/shelf/year/2026')
    expect(await axeViolations(container)).toEqual([])
  })
})
