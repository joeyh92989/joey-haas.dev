import '@testing-library/jest-dom'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Outlet, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { STALE_COPY } from '../content/status.js'
import { spine } from '../content/spine.js'
import { axeViolations } from '../lib/axe.test-util.js'
import { readSnapshot } from '../lib/snapshot.js'
import Item from './Item.jsx'

vi.mock('../lib/snapshot.js', () => ({ readSnapshot: vi.fn() }))

beforeEach(() => {
  vi.mocked(readSnapshot).mockReset()
  vi.mocked(readSnapshot).mockResolvedValue(null)
})

const ID = '11111111-1111-1111-1111-111111111111'

const DETAIL = {
  id: ID,
  type: 'game',
  title: 'Hades',
  year: 2020,
  creator: 'Supergiant Games',
  cover_url: 'https://images.igdb.com/hades.jpg',
  status: 'finished',
  rating: 9,
  favorite: true,
  finished_at: '2026-06-12',
  genres: ['Roguelike', 'Action'],
  community_score: 93.4,
  platforms: ['PC', 'Nintendo Switch'],
  created_at: '2026-01-01T00:00:00Z',
  wanted: false,
  description: 'Defy the god of the dead.',
  community_votes: 512,
  times_completed: 2,
  started_at: '2026-01-02',
  similar_in_collection: [
    { id: 'a', type: 'game', title: 'Dead Cells', cover_url: null },
    { id: 'b', type: 'game', title: 'Celeste', cover_url: null },
  ],
}

function stubApi(response) {
  const fetch = vi.fn(async () => response)
  vi.stubGlobal('fetch', fetch)
  return fetch
}

function stubItem(overrides = {}) {
  return stubApi({
    ok: true,
    status: 200,
    json: async () => ({ ...DETAIL, ...overrides }),
  })
}

function renderPage({ signedIn = false } = {}) {
  return render(
    <MemoryRouter initialEntries={[`/shelf/${ID}`]}>
      <Routes>
        <Route element={<Outlet context={{ signedIn }} />}>
          <Route path="/shelf/:id" element={<Item />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

async function renderReady(options) {
  renderPage(options)
  return screen.findByRole('heading', { level: 1, name: 'Hades' })
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('Item', () => {
  it('fetches the public item by its id', async () => {
    const fetch = stubItem()
    await renderReady()
    expect(fetch).toHaveBeenCalledOnce()
    expect(String(fetch.mock.calls[0][0])).toContain(`/api/public/items/${ID}`)
  })

  it('opens with the breadcrumb, then the cover, title, year, creator, status in words', async () => {
    stubItem()
    await renderReady()

    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(
      within(crumbs).getByRole('link', { name: 'My Shelf' }),
    ).toHaveAttribute('href', '/shelf')
    expect(crumbs.querySelector('[aria-current="page"]')).toHaveTextContent(
      DETAIL.title,
    )
    expect(document.querySelector('.item-hero')).toBeNull()
    expect(document.querySelector('.item-cover img')).toHaveAttribute(
      'src',
      DETAIL.cover_url,
    )
    expect(screen.getByText('2020 · Supergiant Games')).toBeInTheDocument()
    expect(
      screen.getByText('Finished twice · last Jun 2026'),
    ).toBeInTheDocument()
  })

  it('dates a single finish by its month', async () => {
    stubItem({ times_completed: 1 })
    await renderReady()
    expect(screen.getByText('Finished · June 2026')).toBeInTheDocument()
  })

  it('shows the placeholder without a cover', async () => {
    stubItem({ cover_url: null })
    await renderReady()

    expect(document.querySelector('.cover-placeholder')).not.toBeNull()
  })

  it('names other statuses in words', async () => {
    stubItem({ status: 'abandoned', finished_at: null, times_completed: 0 })
    await renderReady()
    expect(screen.getByText('Abandoned')).toBeInTheDocument()
  })

  it('dates a first playthrough from its start', async () => {
    stubItem({ status: 'active', finished_at: null, times_completed: 0 })
    await renderReady()
    expect(screen.getByText('Playing · since Jan 2, 2026')).toBeInTheDocument()
  })

  it('dates a retry from its own run, not the abandoned one', async () => {
    stubItem({
      status: 'active',
      finished_at: null,
      times_completed: 0,
      playing_since: '2026-10-30',
    })
    await renderReady()
    expect(screen.getByText('Playing · since Oct 30, 2026')).toBeInTheDocument()
  })

  it('says again for a replay in progress, not the first run’s start', async () => {
    stubItem({ status: 'active', times_completed: 1 })
    await renderReady()
    expect(document.querySelector('.item-status')).toHaveTextContent(
      /^Playing again$/,
    )
    expect(
      within(document.querySelector('.stat-tiles-figures')).getByText(
        'Playing again · last finished Jun 12, 2026',
      ),
    ).toBeInTheDocument()
  })

  it('dates a paused game from its pause', async () => {
    stubItem({
      status: 'paused',
      finished_at: null,
      times_completed: 0,
      paused_on: '2026-08-03',
    })
    await renderReady()
    expect(screen.getByText('Paused · since Aug 2026')).toBeInTheDocument()
  })

  function groups() {
    return [...document.querySelectorAll('.item-groups > div')].map((group) => [
      group.querySelector('dt').textContent,
      [...group.querySelectorAll('li')].map((chip) => [
        chip.textContent,
        chip.classList.contains('item-chip-muted'),
      ]),
    ])
  }

  it('labels the genres and the other platforms', async () => {
    stubItem()
    await renderReady()
    expect(groups()).toEqual([
      [
        'Genres',
        [
          ['Roguelike', false],
          ['Action', false],
        ],
      ],
      [
        'Also on',
        [
          ['PC', true],
          ['Nintendo Switch', true],
        ],
      ],
    ])
  })

  it('omits a group that would be empty', async () => {
    stubItem({ genres: [], platforms: [] })
    await renderReady()
    expect(document.querySelector('.item-groups')).toBeNull()
  })

  it('shows only Genres when there is no other platform', async () => {
    stubItem({ platforms: [] })
    await renderReady()
    expect(groups().map(([label]) => label)).toEqual(['Genres'])
  })

  it('clamps the description, and More and Less toggle the clamp', async () => {
    stubItem()
    await renderReady()

    const description = screen.getByText('Defy the god of the dead.')
    expect(description).toHaveClass('clamp-6')

    await userEvent.click(screen.getByRole('button', { name: 'More' }))
    expect(description).not.toHaveClass('clamp-6')

    await userEvent.click(screen.getByRole('button', { name: 'Less' }))
    expect(description).toHaveClass('clamp-6')
  })

  // Comic Vine descriptions arrive as HTML; the page shows the text, never
  // the markup, and never renders it as HTML.
  it('shows a description as text, not markup', async () => {
    stubItem({ description: '<p>An <b>issue</b> summary.</p>' })
    await renderReady()
    expect(screen.getByText('An issue summary.')).toBeInTheDocument()
    expect(document.querySelector('.item-description b')).toBeNull()
  })

  it('has no description block when the snapshot has none', async () => {
    stubItem({ description: null })
    await renderReady()
    expect(document.querySelector('.item-description')).toBeNull()
    expect(
      screen.queryByRole('button', { name: 'More' }),
    ).not.toBeInTheDocument()
  })

  it('shows the rating, community and played tiles', async () => {
    stubItem()
    await renderReady()

    const tiles = within(document.querySelector('.stat-tiles-figures'))
    expect(tiles.getByRole('img', { name: '9 out of 10' })).toBeInTheDocument()
    expect(tiles.getByRole('img', { name: '9 out of 10' })).toHaveTextContent(
      '★9',
    )
    expect(tiles.queryByText('9 / 10')).not.toBeInTheDocument()
    // The Rating already names "out of 10"; the visible suffix is not read twice.
    expect(tiles.getByText(spine.item.outOfTen)).toHaveAttribute(
      'aria-hidden',
      'true',
    )
    expect(tiles.getByText('93 / 100')).toBeInTheDocument()
    expect(tiles.getByText('512 votes')).toBeInTheDocument()
    expect(tiles.getByText('Finished 2 times')).toBeInTheDocument()
    expect(tiles.getByText('Jan 2, 2026 → Jun 12, 2026')).toBeInTheDocument()
  })

  it('spans the dated finishes on the Played tile', async () => {
    stubItem({ finishes: ['2024-03-09', '2026-06-12'] })
    await renderReady()
    const tiles = within(document.querySelector('.stat-tiles-figures'))
    expect(tiles.getByText('Finished 2 times')).toBeInTheDocument()
    expect(
      tiles.getByText('Last Jun 12, 2026 · first Mar 2024'),
    ).toBeInTheDocument()
  })

  it('says Finished once for one finish', async () => {
    stubItem({ times_completed: 1 })
    await renderReady()
    expect(
      within(document.querySelector('.stat-tiles-figures')).getByText(
        'Finished once',
      ),
    ).toBeInTheDocument()
  })

  it('says Not rated, hides Community, and hides Played when there is nothing to show', async () => {
    stubItem({
      rating: null,
      community_score: null,
      times_completed: 0,
      started_at: null,
      finished_at: null,
      status: 'backlog',
    })
    await renderReady()

    const tiles = within(document.querySelector('.stat-tiles-figures'))
    expect(tiles.getByText('Not rated')).toBeInTheDocument()
    expect(tiles.queryByText('Community')).not.toBeInTheDocument()
    expect(tiles.queryByText('Played')).not.toBeInTheDocument()
  })

  it('shows more from this shelf as linked cards', async () => {
    stubItem()
    await renderReady()

    const strip = screen.getByRole('region', { name: 'More from this shelf' })
    expect(
      within(strip).getByRole('link', { name: 'Dead Cells' }),
    ).toHaveAttribute('href', '/shelf/a/')
    expect(within(strip).getAllByRole('link')).toHaveLength(2)
  })

  it('has no strip when nothing is similar', async () => {
    stubItem({ similar_in_collection: [] })
    await renderReady()
    expect(
      screen.queryByRole('region', { name: 'More from this shelf' }),
    ).not.toBeInTheDocument()
  })

  it('renders NotFound on a 404', async () => {
    stubApi({
      ok: false,
      status: 404,
      json: async () => ({ detail: 'Not found' }),
    })
    renderPage()
    expect(
      await screen.findByRole('heading', { name: 'Not found' }),
    ).toBeInTheDocument()
  })

  it('reports any other failure, with a heading', async () => {
    stubApi({ ok: false, status: 500, json: async () => ({}) })
    renderPage()
    expect(await screen.findByText(/didn’t load/i)).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })

  it('keeps the same breadcrumb while loading and when it failed', async () => {
    stubApi({ ok: false, status: 500, json: async () => ({}) })
    renderPage()
    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(within(crumbs).getByRole('link', { name: 'My Shelf' })).toBeVisible()
    await screen.findByText(/didn’t load/i)
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeVisible()
  })

  it('shows the item after Try again', async () => {
    const answers = [
      { ok: false, status: 500, json: async () => ({}) },
      { ok: true, status: 200, json: async () => DETAIL },
    ]
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => (answers.length > 1 ? answers.shift() : answers[0])),
    )
    renderPage()
    await userEvent.click(
      await screen.findByRole('button', { name: 'Try again' }),
    )
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Hades' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('announces the cold start while the server wakes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    )
    renderPage()

    expect(screen.getByText('Loading…')).toBeInTheDocument()
    await waitFor(
      () => expect(screen.getByText(/waking the server/i)).toBeInTheDocument(),
      { timeout: 4000 },
    )
  })

  it('links to the edit page when signed in', async () => {
    stubItem()
    await renderReady({ signedIn: true })
    expect(screen.getByRole('link', { name: 'Edit' })).toHaveAttribute(
      'href',
      `/admin/collection/${ID}`,
    )
  })

  // The layout already knows; the page must not ask the API again.
  it('shows no edit link, and makes no session check, when signed out', async () => {
    const fetch = stubItem()
    await renderReady()
    expect(screen.queryByRole('link', { name: 'Edit' })).not.toBeInTheDocument()
    expect(fetch.mock.calls.map((call) => String(call[0]))).not.toContainEqual(
      expect.stringContaining('/api/auth/me'),
    )
  })

  it('renders outside the layout without throwing', async () => {
    stubItem()
    render(
      <MemoryRouter initialEntries={[`/shelf/${ID}`]}>
        <Routes>
          <Route path="/shelf/:id" element={<Item />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Hades' }),
    ).toBeInTheDocument()
  })
})

describe('Item title', () => {
  beforeEach(() => {
    document.title = 'Stale'
  })

  it('is My Shelf until the item is known', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    )
    renderPage()
    expect(document.title).toBe('My Shelf · Joey Haas')
  })

  it('names the item once it loads', async () => {
    stubItem()
    await renderReady()
    // The title is set by a passive effect, which React flushes after the
    // commit that put the heading on screen: wait for it, don't read it.
    await waitFor(() => expect(document.title).toBe('Hades · My Shelf'))
  })

  it('names the item from the snapshot while the server wakes', async () => {
    vi.mocked(readSnapshot).mockResolvedValue([
      {
        id: ID,
        type: 'game',
        title: 'Hades',
        cover_url: null,
        genres: [],
        platforms: [],
      },
    ])
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    )
    renderPage()
    await waitFor(() => expect(document.title).toBe('Hades · My Shelf'))
  })

  it('leaves the title to NotFound on a 404', async () => {
    stubApi({ ok: false, status: 404, json: async () => ({}) })
    renderPage()
    await screen.findByRole('heading', { name: 'Not found' })
    await waitFor(() => expect(document.title).toBe('Not found · Joey Haas'))
  })
})

describe('Item copy details', () => {
  const COPY = {
    platform: 'Nintendo Switch',
    platforms: ['PC', 'Nintendo Switch', 'PlayStation 4'],
    themes: ['Fantasy'],
    physical_format: 'game_card',
    completeness: 'cib',
  }

  function chips() {
    return [...document.querySelectorAll('.item-chips li')].map((chip) => [
      chip.textContent,
      chip.classList.contains('item-chip-muted'),
    ])
  }

  it('keeps the game in the chips and the copy on its own line', async () => {
    stubItem(COPY)
    await renderReady()

    expect(chips()).toEqual([
      ['Roguelike', false],
      ['Action', false],
      ['Fantasy', true],
      ['PC', true],
      ['PlayStation 4', true],
    ])
    // The owned platform is not an "Also on" chip.
    const alsoOn = [...document.querySelectorAll('.item-groups > div')][1]
    expect(alsoOn.textContent).not.toMatch(/Nintendo Switch/)
    expect(
      screen.getByText(
        'My copy: Nintendo Switch · Full game on cartridge · Complete in box',
      ),
    ).toBeInTheDocument()
  })

  it.each([
    ['game_key_card', 'Game-Key Card'],
    ['code_in_box', 'Code in a box'],
    ['disc', 'Disc'],
  ])('names a %s copy', async (format, label) => {
    stubItem({ ...COPY, physical_format: format })
    await renderReady()
    expect(
      screen.getByText(`My copy: Nintendo Switch · ${label} · Complete in box`),
    ).toBeInTheDocument()
  })

  it('says a Switch 2 copy with no recorded format is unrecorded', async () => {
    stubItem({ ...COPY, platform: 'Nintendo Switch 2', physical_format: null })
    await renderReady()
    expect(
      screen.getByText(
        'My copy: Nintendo Switch 2 · Format not recorded · Complete in box',
      ),
    ).toBeInTheDocument()
  })

  it('leaves the format out of My copy for another platform with no format', async () => {
    stubItem({ ...COPY, physical_format: null, completeness: null })
    await renderReady()
    expect(screen.getByText('My copy: Nintendo Switch')).toBeInTheDocument()
    expect(screen.queryByText(/Format not recorded/)).toBeNull()
  })

  it.each([
    [
      { normally: 11.6, completely: 18.2 },
      [
        ['Main story', '≈ 12 h'],
        ['To complete', '18 h'],
      ],
    ],
    [{ normally: 4.4, completely: null }, [['Main story', '≈ 4 h']]],
    [{ normally: null, completely: 18.2 }, [['To complete', '18 h']]],
  ])('shows time to beat with named figures', async (timeToBeat, figures) => {
    stubItem({ time_to_beat: { hastily: null, count: 3, ...timeToBeat } })
    await renderReady()
    const tiles = within(document.querySelector('.stat-tiles-figures'))
    expect(tiles.getByText('Time to beat')).toBeInTheDocument()
    const rows = [...document.querySelectorAll('.item-ttb')].map((row) => [
      row.children[0].textContent,
      row.children[1].textContent,
    ])
    expect(rows).toEqual(figures)
  })

  it('has no time-to-beat tile without data', async () => {
    stubItem({ time_to_beat: null })
    await renderReady()
    expect(screen.queryByText('Time to beat')).not.toBeInTheDocument()
  })
})

describe('Item voice and copy', () => {
  it.each([false, true])(
    'reads My rating (signed in: %s)',
    async (signedIn) => {
      stubItem()
      await renderReady({ signedIn })
      expect(screen.getByText('My rating')).toBeInTheDocument()
      expect(screen.queryByText('Your rating')).toBeNull()
    },
  )

  it('says what platform a wanted game is wanted for', async () => {
    stubItem({ wanted: true, platform: 'Nintendo Switch 2' })
    await renderReady()
    expect(screen.getByText('Wanted for Nintendo Switch 2')).toBeInTheDocument()
    expect(screen.queryByText(/^My copy/)).toBeNull()
  })

  it('says a wanted game with no platform is on the want list', async () => {
    stubItem({ wanted: true, platform: null })
    await renderReady()
    expect(screen.getByText('On my want list')).toBeInTheDocument()
  })
})

describe('Item snapshot preview', () => {
  const ROW = {
    id: ID,
    type: 'game',
    title: 'Hades',
    year: 2020,
    creator: 'Supergiant Games',
    cover_url: 'https://images.igdb.com/hades.jpg',
    status: 'finished',
    rating: 9,
    favorite: true,
    finished_at: '2026-06-12',
    genres: ['Roguelike', 'Action'],
    community_score: 93.4,
    platforms: ['PC', 'Nintendo Switch'],
    created_at: '2026-01-01T00:00:00Z',
    wanted: false,
    platform: 'Nintendo Switch',
    physical_format: 'game_card',
    completeness: null,
    pinned: false,
  }

  it('paints the card fields from the snapshot while the server wakes', async () => {
    vi.mocked(readSnapshot).mockResolvedValue([ROW])
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    )
    await renderReady()

    expect(screen.getByRole('img', { name: '9 out of 10' })).toHaveTextContent(
      '★9',
    )
    expect(
      screen.getByText('My copy: Nintendo Switch · Full game on cartridge'),
    ).toBeInTheDocument()
    expect(screen.queryByText('Defy the god of the dead.')).toBeNull()
    expect(screen.queryByText('Community')).toBeNull()
    expect(screen.queryByText(/waking the server/i)).toBeNull()
  })

  it('adds the detail when the API answers', async () => {
    vi.mocked(readSnapshot).mockResolvedValue([ROW])
    stubItem()
    await renderReady()
    expect(
      await screen.findByText('Defy the god of the dead.'),
    ).toBeInTheDocument()
  })

  it('believes the API over the snapshot about a removed item', async () => {
    vi.mocked(readSnapshot).mockResolvedValue([ROW])
    stubApi({ ok: false, status: 404, json: async () => ({}) })
    renderPage()
    expect(
      await screen.findByRole('heading', { name: 'Not found' }),
    ).toBeInTheDocument()
  })

  it('keeps the painted fields when the detail fails', async () => {
    vi.mocked(readSnapshot).mockResolvedValue([ROW])
    stubApi({ ok: false, status: 500, json: async () => ({}) })
    await renderReady()
    expect(await screen.findByText(STALE_COPY)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
    // The preview stays up with a note; the error page would replace it.
    expect(
      screen.getByRole('heading', { level: 1, name: 'Hades' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

const SAGA = {
  ...DETAIL,
  type: 'comic',
  title: 'Saga',
  year: 2012,
  creator: 'Image',
  status: 'active',
  rating: null,
  favorite: false,
  finished_at: null,
  genres: [],
  community_score: null,
  platforms: [],
  description: '<p>An epic space opera.</p>',
  community_votes: null,
  times_completed: 0,
  started_at: null,
  similar_in_collection: [],
  comic: {
    publisher: 'Image',
    owned_text: '1–4, 6–8',
    released: 8,
    ongoing: true,
    run_state: 'gaps',
    missing: 1,
    segments: [
      { kind: 'owned', length: 4 },
      { kind: 'missing', length: 1 },
      { kind: 'owned', length: 3 },
    ],
    read_to: 3,
    read: 3,
    editions: [{ kind: 'TPB', label: 'Vol. 2', from_issue: 6, to_issue: 8 }],
    next_issue: { number: '9', store_date: '2026-11-12' },
    following: true,
    shelf_format: 'trades',
    as_of: '2026-10-30',
  },
}

const SERIES = spine.comics.series

function stubSaga(comic = {}) {
  return stubItem({ ...SAGA, comic: { ...SAGA.comic, ...comic } })
}

async function renderSaga(options) {
  renderPage(options)
  return screen.findByRole('heading', { level: 1, name: 'Saga' })
}

/** The run box's tiles, as [text, kind] in order. */
function tiles() {
  return [...document.querySelectorAll('.run-box > *')].map((tile) => [
    tile.textContent,
    tile.dataset.k,
  ])
}

const box = () => document.querySelector('.run-box')

describe('Item series page (AC5)', () => {
  it('names the comic, its publisher and that it is ongoing, in comic words', async () => {
    stubSaga()
    await renderSaga()
    expect(
      screen.getByText('Comic · Image · 2012 – ongoing'),
    ).toBeInTheDocument()
    expect(document.querySelector('.item-status')).toHaveTextContent('Reading')
  })

  it('puts a series under Comics in the trail, as its issue pages do', async () => {
    stubSaga()
    await renderSaga()
    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(
      within(crumbs).getByRole('link', { name: 'Comics' }),
    ).toHaveAttribute('href', '/shelf/comics')
    expect(crumbs.querySelector('[aria-current="page"]')).toHaveTextContent(
      'Saga',
    )
  })

  it('states the run with its pill, then what is next', async () => {
    stubSaga()
    await renderSaga()
    const sum = document.querySelector('.comic-sum')
    expect(sum).toHaveTextContent('7 of 8+ 1 missing')
    // Followed, so refreshed nightly: no "as of".
    expect(sum).toHaveTextContent('Trades')
    expect(sum).not.toHaveTextContent('as of')
    const next = screen.getByRole('region', { name: 'What’s next' })
    expect(next).toHaveTextContent('Next to read#44 unread')
    expect(next).toHaveTextContent('First gap#51 missing')
    expect(next).toHaveTextContent('Next out#9Nov 12')
  })

  it('names the edition the next issue to read is in', async () => {
    stubSaga({ read_to: 5, read: 4 })
    await renderSaga()
    expect(
      screen.getByRole('region', { name: 'What’s next' }),
    ).toHaveTextContent('Next to read#6in Vol. 2')
  })

  it('dates the run of an ongoing series nobody follows', async () => {
    stubSaga({ following: false })
    await renderSaga()
    expect(document.querySelector('.comic-sum')).toHaveTextContent(
      'as of Oct 2026',
    )
  })

  it('shows Next out only with a dated next issue (AC8)', async () => {
    stubSaga({ next_issue: null })
    await renderSaga()
    expect(
      screen.getByRole('region', { name: 'What’s next' }),
    ).not.toHaveTextContent('Next out')
  })

  it('says All read, and the run state with no gaps', async () => {
    stubSaga({
      owned_text: '1–8',
      missing: 0,
      run_state: 'up_to_date',
      read_to: 8,
      read: 8,
    })
    await renderSaga()
    const next = screen.getByRole('region', { name: 'What’s next' })
    expect(next).toHaveTextContent('ReadingAll readthrough #8')
    expect(next).toHaveTextContent('RunUp to date8 of 8+')
  })

  it('draws a short run as its box: an edition as one book, no lanes', async () => {
    stubSaga()
    await renderSaga()
    expect(tiles()).toEqual([
      ['1', 'read'],
      ['2', 'read'],
      ['3', 'read'],
      ['4', 'owned'],
      ['5', 'missing'],
      ['Vol. 26–8', 'owned'],
      ['9', 'upcoming'],
    ])
    // Twelve issues or fewer: the cells already show everything.
    expect(document.querySelector('.lanes')).toBeNull()
    expect(document.querySelector('.comic-sentence')).toHaveTextContent(
      'I own #1–4, 6–8 and have read to #3.',
    )
  })

  it('draws the lanes above the box for a longer run', async () => {
    stubSaga({ owned_text: '1–30', released: 40, missing: 10 })
    await renderSaga()
    expect(
      screen.getByRole('img', {
        name: '30 of 40 issues owned, 10 missing, series still coming out, read to number 3',
      }),
    ).toBeInTheDocument()
  })

  it('puts the run before the editions and About (AC7)', async () => {
    stubSaga()
    await renderSaga()
    const order = [...document.querySelectorAll('.item-card h2')].map(
      (heading) => heading.textContent,
    )
    expect(order).toEqual(['The run', SERIES.editions, SERIES.about])
  })

  it.each([
    [
      'a want',
      { owned_text: '', editions: [], released: 58 },
      { wanted: true },
      'Nothing owned yet. 58 issues are out so far.',
    ],
    [
      'a run with no issues recorded',
      { owned_text: '', editions: [] },
      {},
      'On the shelf, but which issues isn’t recorded yet.',
    ],
  ])(
    'draws a dashed box and no run card for %s',
    async (_, comic, item, text) => {
      stubItem({ ...SAGA, ...item, comic: { ...SAGA.comic, ...comic } })
      await renderSaga()
      expect(document.querySelector('.comic-empty')).toHaveTextContent(text)
      expect(screen.queryByRole('heading', { name: 'The run' })).toBeNull()
    },
  )

  it('lists the editions with what each collects', async () => {
    stubSaga()
    await renderSaga()
    const editions = screen.getByRole('region', { name: SERIES.editions })
    expect(editions).toHaveTextContent('TPB')
    expect(editions).toHaveTextContent('Vol. 2')
    expect(editions).toHaveTextContent('collects #6–8')
  })

  it('has no Editions card without editions', async () => {
    stubSaga({ editions: [] })
    await renderSaga()
    expect(
      screen.queryByRole('region', { name: SERIES.editions }),
    ).not.toBeInTheDocument()
  })

  it('shows About as text and credits Comic Vine', async () => {
    stubSaga()
    await renderSaga()
    const about = screen.getByRole('region', { name: SERIES.about })
    expect(about).toHaveTextContent('An epic space opera.')
    expect(
      within(about).getByRole('link', { name: 'Comic Vine' }),
    ).toHaveAttribute('href', 'https://comicvine.gamespot.com/')
    expect(document.querySelector('.item-attribution')).toHaveTextContent(
      'Comic data from Comic Vine.',
    )
  })

  it('is decoration when signed out: no toggles', async () => {
    stubSaga()
    await renderSaga()
    expect(within(box()).queryAllByRole('button')).toHaveLength(0)
  })

  it('toggles an issue when signed in, from the owner’s own ranges', async () => {
    let saved = null
    const fetch = vi.fn(async (url, options = {}) => {
      if (options.method === 'PATCH') {
        saved = JSON.parse(options.body)
        return { ok: true, status: 200, json: async () => ({}) }
      }
      if (url.includes('/api/public/')) {
        const comic = saved
          ? {
              ...SAGA.comic,
              owned_text: '1–8',
              missing: 0,
              run_state: 'up_to_date',
            }
          : SAGA.comic
        return { ok: true, status: 200, json: async () => ({ ...SAGA, comic }) }
      }
      // The admin row: singles 1–4 only, the edition's 6–8 not in it.
      return {
        ok: true,
        status: 200,
        json: async () => ({ issues_owned: '1–4' }),
      }
    })
    vi.stubGlobal('fetch', fetch)
    await renderSaga({ signedIn: true })
    const grid = box()
    // Edition-covered issues are inside their book, not toggles.
    expect(within(grid).queryByRole('button', { name: 'Issue 6' })).toBeNull()
    await userEvent.click(within(grid).getByRole('button', { name: 'Issue 5' }))
    await waitFor(() =>
      expect(document.querySelector('.comic-sum')).toHaveTextContent(
        'Up to date',
      ),
    )
    expect(saved).toEqual({ issues_owned: '1-5' })
    const patch = fetch.mock.calls.find(
      ([, options]) => options?.method === 'PATCH',
    )
    expect(patch[0]).toContain(`/api/items/${ID}`)
  })

  it('drops a private skip when a toggle owns that issue', async () => {
    let saved = null
    const fetch = vi.fn(async (url, options = {}) => {
      if (options.method === 'PATCH') {
        saved = JSON.parse(options.body)
        return { ok: true, status: 200, json: async () => ({}) }
      }
      if (url.includes('/api/public/')) {
        return { ok: true, status: 200, json: async () => SAGA }
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ issues_owned: '1–4', issues_skipped: '5' }),
      }
    })
    vi.stubGlobal('fetch', fetch)
    await renderSaga({ signedIn: true })
    await userEvent.click(
      within(box()).getByRole('button', { name: 'Issue 5' }),
    )
    await waitFor(() => expect(saved).not.toBeNull())
    expect(saved).toEqual({ issues_owned: '1-5', issues_skipped: '' })
  })

  it('says so when a toggle fails, and keeps the grid', async () => {
    const fetch = vi.fn(async (url, options = {}) => {
      if (options.method === 'PATCH') {
        return { ok: false, status: 422, json: async () => ({}) }
      }
      if (url.includes('/api/public/')) {
        return { ok: true, status: 200, json: async () => SAGA }
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ issues_owned: '1–4' }),
      }
    })
    vi.stubGlobal('fetch', fetch)
    await renderSaga({ signedIn: true })
    await userEvent.click(screen.getByRole('button', { name: 'Issue 5' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(SERIES.saveError)
    expect(screen.getByRole('button', { name: 'Issue 5' })).toBeEnabled()
  })

  it('has no axe violations, signed out or in', async () => {
    stubSaga()
    const { container, unmount } = renderPage()
    await screen.findByRole('heading', { level: 1, name: 'Saga' })
    expect(await axeViolations(container)).toEqual([])
    unmount()
    const signedIn = renderPage({ signedIn: true })
    await screen.findByRole('heading', { level: 1, name: 'Saga' })
    expect(await axeViolations(signedIn.container)).toEqual([])
  })
})

describe('Item cover wall', () => {
  const ROWS = Array.from({ length: 8 }, (_, i) => ({
    number: String(i + 1),
    name: null,
    store_date: '2020-01-01',
    cover_url: null,
  }))

  function stubWall(issues) {
    const fetch = vi.fn(async (url) => {
      const body = String(url).endsWith('/issues')
        ? { series_title: 'Saga', publisher: 'Image', issues, editions: [] }
        : SAGA
      return { ok: true, status: 200, json: async () => body }
    })
    vi.stubGlobal('fetch', fetch)
    return fetch
  }

  it('draws the wall in place of the run box when the series has issue rows', async () => {
    const fetch = stubWall(ROWS)
    await renderSaga()
    expect(
      await screen.findByRole('heading', { name: 'Every book in the run' }),
    ).toBeInTheDocument()
    expect(
      fetch.mock.calls.some(([url]) =>
        String(url).endsWith(`/api/public/items/${ID}/issues`),
      ),
    ).toBe(true)
    expect(document.querySelector('.run-box')).toBeNull()
    expect(
      screen.getByRole('link', { name: 'Saga #5, Missing' }),
    ).toHaveAttribute('href', `/shelf/${ID}/5/`)
  })

  it("signed in, marks the owner's skipped issues from the row already fetched", async () => {
    const fetch = vi.fn(async (url) => {
      const text = String(url)
      const body = text.endsWith('/issues')
        ? {
            series_title: 'Saga',
            publisher: 'Image',
            issues: ROWS,
            editions: [],
          }
        : text.includes('/api/public/')
          ? SAGA
          : { issues_owned: '1–4', issues_skipped: '5', playthroughs: [] }
      return { ok: true, status: 200, json: async () => body }
    })
    vi.stubGlobal('fetch', fetch)
    await renderSaga({ signedIn: true })
    expect(
      await screen.findByRole('link', { name: 'Saga #5, Skipped' }),
    ).toBeInTheDocument()
    expect(
      fetch.mock.calls.filter(([url]) => !String(url).includes('/api/public/')),
    ).toHaveLength(1)
  })

  it('signed out, never shows a skipped issue', async () => {
    stubWall(ROWS)
    await renderSaga()
    expect(
      await screen.findByRole('link', { name: 'Saga #5, Missing' }),
    ).toBeInTheDocument()
  })

  it('keeps the run box, toggle mode included, when the issue list is empty', async () => {
    stubWall([])
    await renderSaga({ signedIn: true })
    expect(
      screen.queryByRole('heading', { name: 'Every book in the run' }),
    ).toBeNull()
    expect(
      await screen.findByRole('button', { name: 'Issue 5' }),
    ).toBeInTheDocument()
  })

  it('has no toggle cells on the series page once the wall is there', async () => {
    stubWall(ROWS)
    await renderSaga({ signedIn: true })
    await screen.findByRole('heading', { name: 'Every book in the run' })
    expect(screen.queryByRole('button', { name: 'Issue 5' })).toBeNull()
    expect(document.querySelector('.run-box')).toBeNull()
  })
})

describe('Item playthroughs', () => {
  const RUNS = [
    {
      number: 2,
      started_on: '2026-05-01',
      finished_on: '2026-06-12',
      paused_on: null,
      outcome: 'finished',
      journal_days: 6,
      journal_minutes: 660,
    },
    {
      number: 1,
      started_on: '2026-01-02',
      finished_on: '2026-02-01',
      paused_on: null,
      outcome: 'finished',
      journal_days: 0,
      journal_minutes: 0,
    },
  ]

  function stubBoth() {
    const fetch = vi.fn(async (url) => ({
      ok: true,
      status: 200,
      json: async () =>
        String(url).includes('/api/public/')
          ? DETAIL
          : { ...DETAIL, playthroughs: RUNS },
    }))
    vi.stubGlobal('fetch', fetch)
    return fetch
  }

  it('shows the owner a read-only table, pointing at the edit page', async () => {
    stubBoth()
    await renderReady({ signedIn: true })

    const section = await screen.findByRole('region', { name: 'Playthroughs' })
    const rows = within(section).getAllByRole('row').slice(1)
    expect(rows.map((row) => row.cells[0].textContent)).toEqual(['1', '2'])
    expect(within(rows[1]).getByText('6 days · 11 h')).toBeInTheDocument()
    expect(within(section).queryByRole('textbox')).toBeNull()
    expect(within(section).queryByRole('button')).toBeNull()
    expect(
      within(section).getByRole('link', { name: 'edit page' }),
    ).toHaveAttribute('href', `/admin/collection/${ID}`)
  })

  it('never asks the admin API, or shows the table, for a visitor', async () => {
    const fetch = stubBoth()
    await renderReady()

    expect(fetch).toHaveBeenCalledOnce()
    expect(screen.queryByRole('region', { name: 'Playthroughs' })).toBeNull()
  })
})

describe('Item for a comic in comic words', () => {
  const RUN = {
    number: 1,
    started_on: '2026-05-01',
    finished_on: null,
    paused_on: null,
    outcome: null,
    journal_days: 0,
    journal_minutes: 0,
  }

  it('says Reads, Reading and Read, never the game words', async () => {
    const owned = { ...SAGA, times_completed: 1, playthroughs: [RUN] }
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url) => ({
        ok: true,
        status: 200,
        json: async () => (String(url).includes('/api/public/') ? SAGA : owned),
      })),
    )
    renderPage({ signedIn: true })
    await screen.findByRole('heading', { level: 1, name: 'Saga' })

    const section = await screen.findByRole('region', { name: 'Reads' })
    expect(
      within(section).getByRole('heading', { name: 'Reads' }),
    ).toBeVisible()
    expect(within(section).getByText('Reading')).toBeInTheDocument()
    expect(screen.queryByText('Playthroughs')).toBeNull()
    expect(screen.queryByText('Played')).toBeNull()
    expect(screen.queryByText(/Playing/)).toBeNull()
  })
})
