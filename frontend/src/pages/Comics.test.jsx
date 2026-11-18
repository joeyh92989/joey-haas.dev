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
// The shelf body as the backend writes it (backend/scripts/export_public_comic_fixtures.py):
// one title of each kind.
import KINDS from '../../e2e/fixtures/snapshot/comics.json'

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
    books_owned: 9,
    volumes_missing: 4,
    issues_read: 7,
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

  it('shows the figures, with the read share as a percentage', () => {
    mockComics({ data: COMICS, live: true, failed: false })
    renderPage()
    const tiles = document.querySelector('.stat-tiles')
    expect(
      [...tiles.querySelectorAll('dt')].map((dt) => dt.textContent),
    ).toEqual([
      'Series',
      'Books owned',
      'Issues owned',
      'Missing',
      'Volumes missing',
      'Issues read',
      'Share read',
    ])
    const value = (label) =>
      screen.getByText(label, { selector: 'dt' }).parentElement
    expect(value('Issues owned')).toHaveTextContent('116')
    expect(value('Missing')).toHaveTextContent('24')
    expect(value('Share read')).toHaveTextContent('47%')
    expect(value('Books owned')).toHaveTextContent('9')
    expect(value('Volumes missing')).toHaveTextContent('4')
    expect(value('Issues read')).toHaveTextContent('7')
  })

  it('says what each new figure counts in the tile, not only on hover', () => {
    mockComics({ data: COMICS, live: true, failed: false })
    renderPage()
    const tiles = document.querySelector('.stat-tiles')
    expect(tiles).toHaveTextContent(copy.figures.booksOwnedNote)
    expect(tiles).toHaveTextContent(copy.figures.volumesMissingNote)
    expect(tiles).toHaveTextContent(copy.figures.issuesReadNote)
    expect(tiles.querySelector('[title]')).toBeNull()
  })

  it('leaves the new tiles out of a body that does not carry them', () => {
    const { books_owned, volumes_missing, issues_read, ...older } = COMICS.stats
    expect([books_owned, volumes_missing, issues_read]).toEqual([9, 4, 7])
    mockComics({
      data: { ...COMICS, stats: older },
      live: true,
      failed: false,
    })
    renderPage()
    expect(
      [...document.querySelectorAll('.stat-tiles dt')].map(
        (dt) => dt.textContent,
      ),
    ).toEqual(['Series', 'Issues owned', 'Missing', 'Share read'])
  })

  it('hides Volumes missing at 0 when no book line is on the shelf', () => {
    mockComics({
      data: { ...COMICS, stats: { ...COMICS.stats, volumes_missing: 0 } },
      live: true,
      failed: false,
    })
    renderPage()
    expect(screen.queryByText('Volumes missing')).toBeNull()
    expect(screen.getByText('Books owned')).toBeInTheDocument()
  })

  it('shows Volumes missing as 0 when a book line is on the shelf', () => {
    mockComics({
      data: {
        ...COMICS,
        series: [
          ...COMICS.series,
          series('Lantern Tales', { kind: 'book_line', volumes_owned: 2 }),
        ],
        stats: { ...COMICS.stats, volumes_missing: 0 },
      },
      live: true,
      failed: false,
    })
    renderPage()
    const tile = screen.getByText('Volumes missing', {
      selector: 'dt',
    }).parentElement
    expect(tile).toHaveTextContent('0')
  })

  it('shows a dash when nothing is on the shelf to read', () => {
    mockComics({
      data: { ...COMICS, stats: { ...COMICS.stats, read_percent: null } },
      live: true,
      failed: false,
    })
    renderPage()
    const read = screen.getByText('Share read', {
      selector: 'dt',
    }).parentElement
    expect(read).toHaveTextContent('—')
  })

  it('shows the backend fixture’s own figures', () => {
    mockComics({ data: KINDS, live: true, failed: false })
    renderPage()
    const value = (label) =>
      screen.getByText(label, { selector: 'dt' }).parentElement
    expect(value('Books owned')).toHaveTextContent(
      String(KINDS.stats.books_owned),
    )
    expect(value('Issues read')).toHaveTextContent(
      String(KINDS.stats.issues_read),
    )
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
    expect(screen.getByText('4 titles')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Clear filters' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: /^Gaps/ }))
    expect(screen.getByText('2 of 4 titles')).toBeInTheDocument()
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

  it('searches titles by title', async () => {
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

describe('Comics: the title kind and the Books and Single issues chips', () => {
  const card = (title) =>
    screen
      .getByText(title, { selector: '.poster-title' })
      .closest('.poster-card')

  it('shows each card’s kind, and which volumes are owned, in words', async () => {
    mockComics({ data: KINDS, live: true, failed: false })
    const { container } = renderPage()
    expect(card('Paper Moons')).toHaveTextContent('Run of issues')
    expect(card('Lantern Tales')).toHaveTextContent('Line of books')
    expect(card('Lantern Tales')).toHaveTextContent(
      'Vol. 1, 2 and 4, and 1 book with no number',
    )
    expect(card('Salt Road')).toHaveTextContent('Single book')
    expect(card('Harbor Lights')).toHaveTextContent('Books and issues')
    expect(card('Harbor Lights')).toHaveTextContent('Vol. 1 and 3')
    // The line's size is not stored, so no card says "of N" for books.
    expect(card('Lantern Tales')).not.toHaveTextContent(/of \d/)
    // Lanes only where issues are held.
    expect(card('Lantern Tales').querySelector('.lanes')).toBeNull()
    expect(card('Salt Road').querySelector('.lanes')).toBeNull()
    expect(card('Paper Moons').querySelector('.lanes')).not.toBeNull()
    expect(card('Harbor Lights').querySelector('.lanes')).not.toBeNull()
    expect(
      screen.getByRole('group', { name: 'Lantern Tales: Line of books' }),
    ).toBeInTheDocument()
    expect(await axeViolations(container)).toEqual([])
  })

  it('filters to Books and to Single issues, with counts, and says how many', async () => {
    mockComics({ data: KINDS, live: true, failed: false })
    renderPage()
    expect(screen.getByRole('button', { name: /^Books/ })).toHaveTextContent(
      '3',
    )
    expect(
      screen.getByRole('button', { name: /^Single issues/ }),
    ).toHaveTextContent('2')
    await userEvent.click(screen.getByRole('button', { name: /^Books/ }))
    expect(runTitles().sort()).toEqual([
      'Harbor Lights',
      'Lantern Tales',
      'Salt Road',
    ])
    expect(screen.getByText('3 of 4 titles')).toBeInTheDocument()
    await userEvent.click(
      screen.getByRole('button', { name: /^Single issues/ }),
    )
    expect(runTitles().sort()).toEqual(['Harbor Lights', 'Paper Moons'])
    expect(screen.getByText('2 of 4 titles')).toBeInTheDocument()
  })

  it('keeps the chip like the other filters: stored, restored, cleared', async () => {
    mockComics({ data: KINDS, live: true, failed: false })
    const { unmount } = renderPage()
    await userEvent.click(screen.getByRole('button', { name: /^Books/ }))
    expect(localStorage.getItem('shelf.public.comics.chip')).toBe('"books"')
    unmount()
    renderPage()
    expect(screen.getByRole('button', { name: /^Books/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(runTitles()).toHaveLength(3)
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(runTitles()).toHaveLength(4)
  })

  it('hides a chip with nothing behind it', () => {
    const runsOnly = {
      ...KINDS,
      series: KINDS.series.filter((row) => row.kind === 'run'),
    }
    mockComics({ data: runsOnly, live: true, failed: false })
    renderPage()
    expect(screen.queryByRole('button', { name: /^Books/ })).toBeNull()
    // Every title holds issues, and the chip still has something to show.
    expect(
      screen.getByRole('button', { name: /^Single issues/ }),
    ).toBeInTheDocument()
  })

  it('reads an older snapshot with no kind as runs', () => {
    mockComics({ data: COMICS, live: true, failed: false })
    renderPage()
    expect(card('Saga')).toHaveTextContent('Run of issues')
    expect(screen.queryByRole('button', { name: /^Books/ })).toBeNull()
  })
})
