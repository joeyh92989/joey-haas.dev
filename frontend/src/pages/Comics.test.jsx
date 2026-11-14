import '@testing-library/jest-dom'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { axeViolations } from '../lib/axe.test-util.js'
import { flaky } from '../lib/flaky.test-util.js'
import { useSnapshotThenLive } from '../lib/useSnapshotThenLive.js'
import { LOAD_ERROR, STALE_COPY, WAKING } from '../content/status.js'
import { spine } from '../content/spine.js'
import Comics from './Comics.jsx'

vi.mock('../lib/useMediaQuery.js', () => ({ useMediaQuery: () => false }))
vi.mock('../lib/useSnapshotThenLive.js', () => ({
  useSnapshotThenLive: vi.fn(),
}))

const copy = spine.comics

const series = (title, fields = {}) => ({
  item_id: `id-${title}`,
  title,
  publisher: 'Image',
  year: 2020,
  cover_url: null,
  ongoing: false,
  following: false,
  wanted: false,
  shelf_format: 'singles',
  edition_labels: [],
  owned: 10,
  released: 10,
  missing: 0,
  run_state: 'complete',
  segments: [{ kind: 'owned', length: 10 }],
  status: 'finished',
  rating: null,
  read_to: 10,
  read: 10,
  next_issue: null,
  created_at: '2026-10-01T00:00:00Z',
  ...fields,
})

const ROWS = [
  series('Saga', {
    ongoing: true,
    following: true,
    owned: 54,
    released: 72,
    missing: 18,
    run_state: 'gaps',
    segments: [
      { kind: 'owned', length: 54 },
      { kind: 'missing', length: 18 },
    ],
    status: 'active',
    read: 40,
    read_to: 40,
    next_issue: { number: '73', store_date: '2026-11-12' },
  }),
  series('Absolute Batman', {
    publisher: 'DC',
    ongoing: true,
    following: true,
    owned: 12,
    released: 12,
    run_state: 'up_to_date',
    status: 'backlog',
    read: 3,
    read_to: 3,
    next_issue: { number: '13', store_date: '2026-11-05' },
  }),
  series('Monstress', {
    owned: 50,
    released: 56,
    missing: 6,
    run_state: 'gaps',
  }),
  series('Paper Girls', {
    publisher: 'DC',
    wanted: true,
    owned: 0,
    missing: 0,
    run_state: null,
    segments: [],
    status: 'backlog',
    read: 0,
    read_to: null,
  }),
]

const months = Array.from({ length: 12 }, (_, i) => ({
  month: `2026-${String(i + 1).padStart(2, '0')}-01`,
  count: i === 9 ? 4 : 0,
}))

const COMICS = {
  series: ROWS,
  stats: {
    series: 3,
    issues_owned: 116,
    missing: 24,
    read_percent: 47,
    runs: { complete: 0, up_to_date: 1, gaps: 2, wanted: 1 },
    by_status: { active: 1, backlog: 1, finished: 1 },
    publishers: [
      { publisher: 'Image', count: 2 },
      { publisher: 'DC', count: 1 },
    ],
    added_by_month: months,
  },
  this_week: {
    weeks: [
      {
        start: '2026-11-02',
        this_week: true,
        rows: [
          {
            item_id: 'id-Absolute Batman',
            title: 'Absolute Batman',
            publisher: 'DC',
            number: '13',
            store_date: '2026-11-05',
            cover_url: null,
            owned_text: '1–12',
            released: 12,
          },
        ],
      },
      { start: '2026-11-09', this_week: false, rows: [] },
    ],
    later: [{ item_id: 'id-Saga', title: 'Saga' }],
  },
}

function mockComics(state) {
  vi.mocked(useSnapshotThenLive).mockReturnValue(state)
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/shelf/comics']}>
      <Routes>
        <Route path="/shelf/comics" element={<Comics />} />
      </Routes>
    </MemoryRouter>,
  )
}

/** The series titles in the grid, in order. */
function runTitles() {
  return [...document.querySelectorAll('.poster-grid .poster-title')].map(
    (node) => node.textContent,
  )
}

afterEach(() => {
  localStorage.clear()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('Comics', () => {
  it('reads the comics snapshot, then live', () => {
    mockComics({ data: COMICS, live: false, failed: false })
    renderPage()
    expect(useSnapshotThenLive).toHaveBeenCalledWith('comics')
    expect(
      screen.getByRole('heading', { level: 1, name: copy.title }),
    ).toBeInTheDocument()
  })

  it('has one h1, under the area band, with no breadcrumb', () => {
    mockComics({ data: COMICS, live: true, failed: false })
    renderPage()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.queryByRole('navigation', { name: 'Breadcrumb' })).toBeNull()
    expect(
      screen.getByRole('navigation', { name: 'My Shelf sections' }),
    ).toBeInTheDocument()
  })

  it('shows four figures, with the read share as a percentage', () => {
    mockComics({ data: COMICS, live: true, failed: false })
    renderPage()
    const tiles = document.querySelector('.stat-tiles')
    expect(
      [...tiles.querySelectorAll('dt')].map((dt) => dt.textContent),
    ).toEqual(['Series', 'Issues owned', 'Missing', 'Read'])
    expect(tiles).toHaveTextContent('116')
    expect(tiles).toHaveTextContent('24')
    expect(tiles).toHaveTextContent('47%')
  })

  it('shows a dash when nothing is on the shelf to read', () => {
    mockComics({
      data: { ...COMICS, stats: { ...COMICS.stats, read_percent: null } },
      live: true,
      failed: false,
    })
    renderPage()
    const read = screen.getByText('Read', { selector: 'dt' }).parentElement
    expect(read).toHaveTextContent('—')
  })

  it('leaves Out this week to What’s next', () => {
    mockComics({ data: COMICS, live: true, failed: false })
    renderPage()
    expect(screen.queryByRole('region', { name: /Out this week/ })).toBeNull()
    expect(screen.queryByText('Absolute Batman #13')).toBeNull()
  })

  it('draws one grid of stacked covers with lanes, and no list view', () => {
    mockComics({ data: COMICS, live: true, failed: false })
    renderPage()
    expect(document.querySelector('.series-list')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Covers' })).toBeNull()
    const lanes = screen.getByRole('img', { name: /^54 of 72 issues owned/ })
    const card = lanes.closest('.poster-card')
    expect(card).toHaveTextContent('54/72+')
    // AC2: no badge on the cover; the lanes sit outside the link.
    expect(lanes.closest('a')).toBeNull()
    expect(card.querySelector('.poster-art')).toHaveAttribute('data-stacked')
    expect(card.querySelector('.run-badge')).toBeNull()
    expect(screen.getByRole('img', { name: 'Reading' })).toBeInTheDocument()
  })

  it('labels the filter rows and the sort', () => {
    mockComics({ data: COMICS, live: true, failed: false })
    renderPage()
    expect(screen.getByRole('group', { name: 'Show' })).toBeInTheDocument()
    expect(
      screen.getByRole('group', { name: copy.chips.publisher }),
    ).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Sort' })).toBeInTheDocument()
  })

  it('counts the series in the result bar, and Clear filters only while filtered', async () => {
    mockComics({ data: COMICS, live: true, failed: false })
    renderPage()
    expect(screen.getByText('4 series')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Clear filters' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: /^Gaps/ }))
    expect(screen.getByText('2 of 4 series')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(runTitles()).toHaveLength(4)
  })

  it('keeps the run charts under an Overview heading', () => {
    mockComics({ data: COMICS, live: true, failed: false })
    renderPage()
    const overview = screen.getByRole('region', { name: 'Overview' })
    expect(within(overview).getByText('Publishers')).toBeInTheDocument()
    expect(within(overview).getByText('Added')).toBeInTheDocument()
  })

  it('opens on the API’s order: dated next issues first', () => {
    mockComics({ data: COMICS, live: true, failed: false })
    renderPage()
    expect(runTitles()).toEqual([
      'Absolute Batman',
      'Saga',
      'Monstress',
      'Paper Girls',
    ])
  })

  it('sorts by missing issues and remembers it (AC4, S6)', async () => {
    mockComics({ data: COMICS, live: true, failed: false })
    renderPage()
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Sort' }),
      'missing',
    )
    expect(runTitles()).toEqual([
      'Saga',
      'Monstress',
      'Absolute Batman',
      'Paper Girls',
    ])
    expect(localStorage.getItem('shelf.public.comics.sort')).toBe('"missing"')
  })

  it('filters by a chip, counts each one and remembers it (AC4, S6)', async () => {
    mockComics({ data: COMICS, live: true, failed: false })
    renderPage()
    const gaps = screen.getByRole('button', { name: /^Gaps/ })
    expect(gaps).toHaveTextContent('2')
    await userEvent.click(gaps)
    expect(gaps).toHaveAttribute('aria-pressed', 'true')
    expect(runTitles()).toEqual(['Saga', 'Monstress'])
    expect(localStorage.getItem('shelf.public.comics.chip')).toBe('"gaps"')
  })

  it('hides a chip with nothing behind it', () => {
    mockComics({
      data: { ...COMICS, series: ROWS.filter((row) => !row.wanted) },
      live: true,
      failed: false,
    })
    renderPage()
    const chips = screen.getByRole('group', { name: 'Show' })
    expect(
      within(chips).queryByRole('button', { name: /^Want/ }),
    ).not.toBeInTheDocument()
    expect(
      within(chips).getByRole('button', { name: /^Gaps/ }),
    ).toBeInTheDocument()
  })

  it('filters by publisher without remembering it', async () => {
    mockComics({ data: COMICS, live: true, failed: false })
    renderPage()
    const publishers = screen.getByRole('group', { name: copy.chips.publisher })
    await userEvent.click(
      within(publishers).getByRole('button', { name: /^DC/ }),
    )
    expect(runTitles()).toEqual(['Absolute Batman', 'Paper Girls'])
    expect(localStorage.length).toBe(0)
  })

  describe('tags', () => {
    const tagged = {
      ...COMICS,
      series: [
        { ...ROWS[0], tags: [{ group: 'genre', tag: 'sci-fi' }] },
        {
          ...ROWS[1],
          tags: [
            { group: 'genre', tag: 'superhero' },
            { group: 'form', tag: 'ongoing' },
          ],
        },
        {
          ...ROWS[2],
          tags: [
            { group: 'genre', tag: 'horror' },
            { group: 'form', tag: 'mini-series' },
          ],
        },
        { ...ROWS[3], tags: [{ group: 'based_on', tag: 'original' }] },
      ],
    }

    it('offers Genre and Form chip groups, not Based on', () => {
      mockComics({ data: tagged, live: true, failed: false })
      renderPage()
      expect(screen.getByRole('group', { name: 'Genre' })).toBeInTheDocument()
      expect(screen.getByRole('group', { name: 'Form' })).toBeInTheDocument()
      expect(screen.queryByRole('group', { name: 'Based on' })).toBeNull()
    })

    it('filters by a genre and undoes it', async () => {
      mockComics({ data: tagged, live: true, failed: false })
      renderPage()
      const genre = screen.getByRole('group', { name: 'Genre' })
      const horror = within(genre).getByRole('button', { name: /^Horror/ })
      await userEvent.click(horror)
      expect(runTitles()).toEqual(['Monstress'])
      await userEvent.click(horror)
      expect(runTitles()).toHaveLength(4)
    })

    it('leaves the groups out while no series is tagged', () => {
      mockComics({ data: COMICS, live: true, failed: false })
      renderPage()
      expect(screen.queryByRole('group', { name: 'Genre' })).toBeNull()
      expect(screen.queryByRole('group', { name: 'Form' })).toBeNull()
    })
  })

  it('keeps a pressed publisher’s chip when live rows drop it', async () => {
    mockComics({ data: COMICS, live: false, failed: false })
    const { rerender } = renderPage()
    const publishers = screen.getByRole('group', { name: copy.chips.publisher })
    await userEvent.click(
      within(publishers).getByRole('button', { name: /^DC/ }),
    )
    mockComics({
      data: { ...COMICS, series: ROWS.filter((row) => row.publisher !== 'DC') },
      live: true,
      failed: false,
    })
    rerender(
      <MemoryRouter initialEntries={['/shelf/comics']}>
        <Routes>
          <Route path="/shelf/comics" element={<Comics />} />
        </Routes>
      </MemoryRouter>,
    )
    const dc = within(
      screen.getByRole('group', { name: copy.chips.publisher }),
    ).getByRole('button', { name: /^DC/ })
    expect(dc).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(dc)
    expect(runTitles()).toEqual(['Saga', 'Monstress'])
  })

  it('restores a stored chip and sort, and ignores a stale one', () => {
    localStorage.setItem('shelf.public.comics.chip', '"want"')
    localStorage.setItem('shelf.public.comics.sort', '"price"')
    mockComics({ data: COMICS, live: true, failed: false })
    renderPage()
    expect(screen.getByRole('button', { name: /^Want/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('combobox', { name: 'Sort' })).toHaveValue('next')
    expect(document.querySelector('.poster-grid')).toBeInTheDocument()
  })

  it('searches series by title', async () => {
    mockComics({ data: COMICS, live: true, failed: false })
    renderPage()
    await userEvent.type(screen.getByRole('searchbox'), 'mon')
    expect(runTitles()).toEqual(['Monstress'])
  })

  it('says so when the filters leave nothing', async () => {
    mockComics({ data: COMICS, live: true, failed: false })
    renderPage()
    await userEvent.type(screen.getByRole('searchbox'), 'zzz')
    expect(screen.getByText(copy.noMatch)).toBeInTheDocument()
  })

  it('says so when there are no comics', () => {
    mockComics({
      data: { ...COMICS, series: [] },
      live: true,
      failed: false,
    })
    renderPage()
    expect(screen.getByText(copy.empty)).toBeInTheDocument()
  })

  it('wakes the server after three seconds with no snapshot', () => {
    vi.useFakeTimers()
    mockComics({ data: null, live: false, failed: false })
    renderPage()
    expect(screen.getByRole('status')).toHaveTextContent('Loading…')
    act(() => vi.advanceTimersByTime(3000))
    expect(screen.getByRole('status')).toHaveTextContent(WAKING)
  })

  it('says so when nothing loads', () => {
    mockComics({ data: null, live: false, failed: true })
    renderPage()
    expect(screen.getByRole('alert')).toHaveTextContent(LOAD_ERROR)
  })

  it('keeps its heading when nothing loads, and Try again brings the shelf', async () => {
    vi.mocked(useSnapshotThenLive).mockImplementation(
      flaky({ data: COMICS, live: true }),
    )
    renderPage()
    expect(
      screen.getByRole('heading', { level: 1, name: copy.title }),
    ).toBeInTheDocument()
    expect(screen.queryByText(copy.empty)).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getAllByText('Saga').length).toBeGreaterThan(0)
    expect(
      screen.getByRole('heading', { level: 1, name: copy.title }),
    ).toBeInTheDocument()
  })

  it('shows the quiet stale line over a painted snapshot', () => {
    mockComics({ data: COMICS, live: false, failed: true, retry: vi.fn() })
    renderPage()
    expect(screen.getByRole('status')).toHaveTextContent(STALE_COPY)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('credits Comic Vine', () => {
    mockComics({ data: COMICS, live: true, failed: false })
    renderPage()
    expect(screen.getByRole('link', { name: 'Comic Vine' })).toHaveAttribute(
      'href',
      'https://comicvine.gamespot.com/',
    )
  })

  it('has no axe violations', async () => {
    mockComics({ data: COMICS, live: true, failed: false })
    const { container } = renderPage()
    expect(await axeViolations(container)).toEqual([])
  })
})
