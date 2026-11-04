import '@testing-library/jest-dom'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Outlet, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LOAD_ERROR } from '../content/status.js'
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

  it('shows the hero: plain band, cover, title, year, creator, status in words', async () => {
    stubItem()
    await renderReady()

    const hero = document.querySelector('.item-hero')
    expect(hero).not.toBeNull()
    expect(hero).not.toHaveAttribute('data-empty')
    expect(document.querySelector('.item-hero-backdrop')).toBeNull()
    expect(hero.querySelector('img')).toBeNull()
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

  it('keeps the plain band and shows the placeholder without a cover', async () => {
    stubItem({ cover_url: null })
    await renderReady()

    expect(document.querySelector('.item-hero-backdrop')).toBeNull()
    expect(document.querySelector('.item-hero')).not.toHaveAttribute(
      'data-empty',
    )
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
      within(document.querySelector('.item-tiles')).getByText(
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

  it('lists genres, then the other platforms muted', async () => {
    stubItem()
    await renderReady()

    const chips = [...document.querySelectorAll('.item-chips li')]
    expect(chips.map((chip) => chip.textContent)).toEqual([
      'Roguelike',
      'Action',
      'PC',
      'Nintendo Switch',
    ])
    expect(chips[2]).toHaveClass('item-chip-muted')
    expect(chips[0]).not.toHaveClass('item-chip-muted')
  })

  it('has no chip row when there are no genres or platforms', async () => {
    stubItem({ genres: [], platforms: [] })
    await renderReady()
    expect(document.querySelector('.item-chips')).toBeNull()
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

    const tiles = within(document.querySelector('.item-tiles'))
    expect(tiles.getByRole('img', { name: '9 out of 10' })).toBeInTheDocument()
    expect(tiles.getByText('9 / 10')).toBeInTheDocument()
    expect(tiles.getByText('93 / 100')).toBeInTheDocument()
    expect(tiles.getByText('512 votes')).toBeInTheDocument()
    expect(tiles.getByText('Finished 2 times')).toBeInTheDocument()
    expect(tiles.getByText('Jan 2, 2026 → Jun 12, 2026')).toBeInTheDocument()
  })

  it('spans the dated finishes on the Played tile', async () => {
    stubItem({ finishes: ['2024-03-09', '2026-06-12'] })
    await renderReady()
    const tiles = within(document.querySelector('.item-tiles'))
    expect(tiles.getByText('Finished 2 times')).toBeInTheDocument()
    expect(
      tiles.getByText('Last Jun 12, 2026 · first Mar 2024'),
    ).toBeInTheDocument()
  })

  it('says Finished once for one finish', async () => {
    stubItem({ times_completed: 1 })
    await renderReady()
    expect(
      within(document.querySelector('.item-tiles')).getByText('Finished once'),
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

    const tiles = within(document.querySelector('.item-tiles'))
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

  it('reports any other failure', async () => {
    stubApi({ ok: false, status: 500, json: async () => ({}) })
    renderPage()
    expect(await screen.findByText(/didn’t load/i)).toBeInTheDocument()
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
    [{ normally: 11.6, completely: 18.2 }, '≈ 12 h · 18 h to complete'],
    [{ normally: 4.4, completely: null }, '≈ 4 h'],
  ])('shows time to beat', async (timeToBeat, text) => {
    stubItem({ time_to_beat: { hastily: null, count: 3, ...timeToBeat } })
    await renderReady()
    const tiles = within(document.querySelector('.item-tiles'))
    expect(tiles.getByText('Time to beat')).toBeInTheDocument()
    expect(tiles.getByText(text)).toBeInTheDocument()
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

    expect(screen.getByText('9 / 10')).toBeInTheDocument()
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
    expect(await screen.findByText(LOAD_ERROR)).toBeInTheDocument()
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

/** The issue grid's cells, as [number, kind] in order. */
function cells() {
  return [...document.querySelectorAll('.issue-grid > *')].map((cell) => [
    cell.textContent,
    cell.dataset.k,
  ])
}

describe('Item series page (AC5)', () => {
  it('names the comic, its publisher and that it is ongoing, in comic words', async () => {
    stubSaga()
    await renderSaga()
    expect(
      screen.getByText('Comic · Image · 2012 – ongoing'),
    ).toBeInTheDocument()
    expect(document.querySelector('.item-status')).toHaveTextContent('Reading')
  })

  it('states the run, format, read marker and next issue', async () => {
    stubSaga()
    await renderSaga()
    const facts = document.querySelector('.item-facts')
    expect(facts).toHaveTextContent('7 of 8 issues so far · Gaps')
    // Followed, so refreshed nightly: no "as of".
    expect(facts).not.toHaveTextContent('as of')
    expect(facts).toHaveTextContent('Trades · Vol. 2')
    expect(facts).toHaveTextContent('#3 · 4 on the shelf unread')
    expect(facts).toHaveTextContent('#9 · Nov 12')
  })

  it('dates the run of an ongoing series nobody follows, and drops its next issue', async () => {
    stubSaga({ following: false })
    await renderSaga()
    const facts = document.querySelector('.item-facts')
    expect(facts).toHaveTextContent('as of Oct 2026')
    expect(facts).not.toHaveTextContent(SERIES.facts.next)
  })

  it('says Not started before the first issue is read', async () => {
    stubSaga({ read_to: null, read: 0 })
    await renderSaga()
    expect(document.querySelector('.item-facts')).toHaveTextContent(
      `${SERIES.facts.readTo}${SERIES.notStarted}`,
    )
  })

  it('draws one cell per released issue in its state, and the next one hatched', async () => {
    stubSaga()
    await renderSaga()
    expect(cells()).toEqual([
      ['1', 'read'],
      ['2', 'read'],
      ['3', 'read'],
      ['4', 'owned'],
      ['5', 'missing'],
      ['6', 'owned'],
      ['7', 'owned'],
      ['8', 'owned'],
      ['9', 'unreleased'],
    ])
    expect(screen.getByRole('heading', { name: /Issues/ })).toHaveTextContent(
      '#1–4, 6–8',
    )
  })

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
    expect(
      screen.queryByRole('group', { name: 'Issues I own' }),
    ).not.toBeInTheDocument()
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
    const grid = screen.getByRole('group', { name: 'Issues I own' })
    // Edition-covered issues are not toggles.
    expect(within(grid).queryByRole('button', { name: 'Issue 6' })).toBeNull()
    await userEvent.click(within(grid).getByRole('button', { name: 'Issue 5' }))
    await waitFor(() =>
      expect(document.querySelector('.item-facts')).toHaveTextContent(
        'Up to date',
      ),
    )
    expect(saved).toEqual({ issues_owned: '1-5' })
    const patch = fetch.mock.calls.find(
      ([, options]) => options?.method === 'PATCH',
    )
    expect(patch[0]).toContain(`/api/items/${ID}`)
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
