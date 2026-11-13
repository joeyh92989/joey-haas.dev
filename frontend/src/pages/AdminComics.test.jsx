import '@testing-library/jest-dom'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { axeViolations } from '../lib/axe.test-util.js'
import AdminComics from './AdminComics.jsx'

// A pointer device unless a test says touch: the card's controls are then in
// the document, as CardActionsShell draws them on hover.
let touch = false
vi.mock('../lib/useMediaQuery.js', () => ({
  useMediaQuery: (query) => query === '(hover: hover)' && !touch,
}))

const run = (fields = {}) => ({
  owned: 10,
  released: 10,
  missing: 0,
  state: 'complete',
  ongoing: false,
  segments: [{ kind: 'owned', length: 10 }],
  read: 10,
  unread: 0,
  read_next: null,
  owned_text: '1–10',
  ...fields,
})

const comic = (id, title, fields = {}) => ({
  id,
  type: 'comic',
  title,
  status: 'finished',
  rating: null,
  is_public: true,
  year: 2020,
  creator: 'Image',
  cover_url: null,
  external_source: 'comicvine',
  external_id: '4050',
  owned_format: 'physical',
  following: false,
  read_to: 10,
  comic_run: run(),
  created_at: '2026-10-01T00:00:00Z',
  ...fields,
})

const GAME = {
  id: 'g',
  type: 'game',
  title: 'Dredge',
  status: 'finished',
  is_public: true,
  owned_format: 'physical',
  created_at: '2026-10-01T00:00:00Z',
}

const ITEMS = [
  comic('s', 'Saga', {
    comic_run: run({
      owned: 54,
      released: 72,
      missing: 18,
      state: 'gaps',
      ongoing: true,
      segments: [
        { kind: 'owned', length: 54 },
        { kind: 'missing', length: 18 },
      ],
      read: 40,
      read_next: 41,
    }),
    read_to: 40,
    status: 'active',
    following: true,
  }),
  comic('m', 'Monstress', {
    creator: 'DC',
    is_public: false,
    status: 'backlog',
    external_id: '4051',
  }),
  GAME,
]

function stubApi({ items = ITEMS, onWrite, itemsStatus = 200 } = {}) {
  const mock = vi.fn(async (url, options = {}) => {
    const method = options.method ?? 'GET'
    if (method === 'GET' && String(url).endsWith('/api/items')) {
      return {
        ok: itemsStatus === 200,
        status: itemsStatus,
        json: async () => items,
      }
    }
    return (
      onWrite?.(String(url), options) ?? {
        ok: true,
        status: 200,
        json: async () => ({}),
      }
    )
  })
  vi.stubGlobal('fetch', mock)
  return mock
}

async function renderPage() {
  const view = render(
    <MemoryRouter>
      <AdminComics />
    </MemoryRouter>,
  )
  await waitFor(() =>
    expect(document.querySelector('.poster-grid')).not.toBeNull(),
  )
  return view
}

const titles = () =>
  [...document.querySelectorAll('.poster-grid .poster-title')].map(
    (node) => node.textContent,
  )

const writes = (mock) =>
  mock.mock.calls.filter(
    ([url, options]) =>
      (options?.method ?? 'GET') !== 'GET' &&
      !String(url).endsWith('/api/items/delete-preview'),
  )

afterEach(() => {
  touch = false
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('AdminComics', () => {
  it('lists the comic series, never a game', async () => {
    stubApi()
    await renderPage()
    expect(titles()).toEqual(['Monstress', 'Saga'])
    expect(
      screen.getByRole('heading', { level: 1, name: 'Comics' }),
    ).toBeInTheDocument()
    expect(screen.getByText('1 of 2 public')).toBeInTheDocument()
  })

  it('shows four figures and the series count', async () => {
    stubApi()
    await renderPage()
    const tiles = document.querySelector('.stat-tiles')
    expect(
      [...tiles.querySelectorAll('dt')].map((dt) => dt.textContent),
    ).toEqual(['Series', 'Issues owned', 'Missing', 'Read'])
    expect(tiles).toHaveTextContent('64')
    expect(tiles).toHaveTextContent('18')
    expect(screen.getByText('2 series')).toBeInTheDocument()
  })

  it('draws each series as a stacked card with its run', async () => {
    stubApi()
    await renderPage()
    const lanes = screen.getByRole('img', { name: /^54 of 72 issues owned/ })
    const card = lanes.closest('.poster-card')
    expect(card.querySelector('.poster-art')).toHaveAttribute('data-stacked')
    expect(card).toHaveTextContent('54/72+')
  })

  it('always tags a private series, and never a public one', async () => {
    stubApi()
    await renderPage()
    const cards = [...document.querySelectorAll('.poster-card')]
    const monstress = cards.find((card) =>
      card.textContent.includes('Monstress'),
    )
    const saga = cards.find((card) => card.textContent.includes('Saga'))
    expect(within(monstress).getByText('Private')).toBeInTheDocument()
    expect(within(saga).queryByText('Private')).toBeNull()
  })

  it('has the owner’s controls on each card: Follow, Public, cover wall, Edit', async () => {
    stubApi()
    await renderPage()
    const group = screen.getByRole('group', { name: 'Actions for Saga' })
    expect(
      within(group).getByRole('button', { name: 'Follow' }),
    ).toHaveAttribute('aria-pressed', 'true')
    expect(within(group).getByLabelText('Public: Saga')).toBeChecked()
    expect(
      within(group).getByRole('link', { name: 'Cover wall · 18 missing' }),
    ).toHaveAttribute('href', '/shelf/s/')
    expect(within(group).getByRole('link', { name: 'Edit' })).toHaveAttribute(
      'href',
      '/admin/collection/s',
    )
  })

  it('has no cover-wall link on a private series, only Edit', async () => {
    stubApi()
    await renderPage()
    const group = screen.getByRole('group', { name: 'Actions for Monstress' })
    expect(within(group).queryByRole('link', { name: /Cover wall/ })).toBeNull()
    expect(
      within(group).getByRole('link', { name: 'Edit' }),
    ).toBeInTheDocument()
  })

  it('links a private card to its edit page, not a public page that is not there', async () => {
    stubApi()
    await renderPage()
    expect(screen.getByRole('link', { name: 'Monstress' })).toHaveAttribute(
      'href',
      '/admin/collection/m',
    )
  })

  it('follows and unfollows through the comics routes', async () => {
    const mock = stubApi()
    await renderPage()
    const group = screen.getByRole('group', { name: 'Actions for Monstress' })
    await userEvent.click(within(group).getByRole('button', { name: 'Follow' }))
    await waitFor(() => expect(writes(mock)).toHaveLength(1))
    const [url, options] = writes(mock)[0]
    expect(url).toContain('/api/comics/follow')
    expect(JSON.parse(options.body)).toEqual({ external_id: '4051' })

    const saga = screen.getByRole('group', { name: 'Actions for Saga' })
    await userEvent.click(within(saga).getByRole('button', { name: 'Follow' }))
    await waitFor(() => expect(writes(mock)).toHaveLength(2))
    expect(writes(mock)[1][0]).toContain('/api/comics/unfollow')
  })

  it('publishes one series with a PATCH, and says when it fails', async () => {
    const mock = stubApi({
      onWrite: (url) =>
        url.includes('/api/items/m') ? { ok: false, status: 500 } : null,
    })
    await renderPage()
    await userEvent.click(screen.getByLabelText('Public: Monstress'))
    await waitFor(() => expect(writes(mock)).toHaveLength(1))
    expect(writes(mock)[0][1].method).toBe('PATCH')
    expect(JSON.parse(writes(mock)[0][1].body)).toEqual({ is_public: true })
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Couldn’t change that series’ visibility.',
    )
  })

  it('publishes its own series by id, never the games', async () => {
    const mock = stubApi()
    vi.stubGlobal(
      'confirm',
      vi.fn(() => true),
    )
    await renderPage()
    await userEvent.click(
      screen.getByRole('button', { name: /publish all 2/i }),
    )
    await waitFor(() => expect(writes(mock)).toHaveLength(1))
    const [url, options] = writes(mock)[0]
    expect(url).toContain('/api/items/visibility')
    expect(JSON.parse(options.body)).toEqual({
      is_public: true,
      ids: ['s', 'm'],
    })
  })

  it('refreshes comic metadata and reports the counts', async () => {
    const mock = stubApi({
      onWrite: (url) =>
        url.includes('refresh-metadata/bulk')
          ? {
              ok: true,
              status: 200,
              json: async () => ({ updated: 2, skipped: 0, failed: 0 }),
            }
          : null,
    })
    await renderPage()
    await userEvent.click(
      screen.getByRole('button', { name: 'Refresh comic metadata' }),
    )
    expect(
      await screen.findByText('Updated 2 · skipped 0 · failed 0'),
    ).toBeInTheDocument()
    expect(writes(mock)[0][0]).toContain(
      '/api/items/refresh-metadata/bulk?type=comic',
    )
  })

  it('filters by chip, including the owner’s Private chip', async () => {
    stubApi()
    await renderPage()
    expect(screen.getByRole('group', { name: 'Show' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /^Private/ }))
    expect(titles()).toEqual(['Monstress'])
    expect(localStorage.getItem('shelf.admin.comics.chip')).toBe('"private"')
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(titles()).toEqual(['Monstress', 'Saga'])
  })

  it('searches series by title', async () => {
    stubApi()
    await renderPage()
    await userEvent.type(screen.getByRole('searchbox'), 'sag')
    expect(titles()).toEqual(['Saga'])
  })

  it('says so when there are no comics, with a way to add one', async () => {
    stubApi({ items: [GAME] })
    render(
      <MemoryRouter>
        <AdminComics />
      </MemoryRouter>,
    )
    expect(
      await screen.findByText('No comics on the shelf yet.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Add comics' })).toBeInTheDocument()
  })

  it('says so when the read fails', async () => {
    stubApi({ itemsStatus: 500 })
    render(
      <MemoryRouter>
        <AdminComics />
      </MemoryRouter>,
    )
    expect(await screen.findByText(/didn’t load/i)).toBeInTheDocument()
  })

  it('links to the public Comics page', async () => {
    stubApi()
    await renderPage()
    expect(
      screen.getByRole('link', { name: /View \/shelf\/comics/ }),
    ).toHaveAttribute('href', '/shelf/comics')
  })

  it('has no axe violations', async () => {
    stubApi()
    const { container } = await renderPage()
    expect(await axeViolations(container)).toEqual([])
  })
})

describe('AdminComics delete, redo and the touch sheet', () => {
  const preview = (url) =>
    url.endsWith('/api/items/delete-preview')
      ? {
          ok: true,
          status: 200,
          json: async () => ({
            items: 1,
            playthroughs: 0,
            play_sessions: 0,
            comic_issues: 4,
            pick_events: 0,
            titles: ['Saga'],
          }),
        }
      : null

  it('deletes a series after a confirm that says what goes with it', async () => {
    // Once deleted, the list no longer holds the series, as the server's wouldn't.
    let gone = false
    const mock = stubApi({
      onWrite: (url, options) => {
        if (options.method === 'DELETE') gone = true
        return preview(url)
      },
    })
    const real = globalThis.fetch
    vi.stubGlobal('fetch', (url, options = {}) =>
      !options.method && gone && String(url).endsWith('/api/items')
        ? Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ITEMS.filter((item) => item.id !== 's'),
          })
        : real(url, options),
    )
    await renderPage()
    const group = screen.getByRole('group', { name: 'Actions for Saga' })

    await userEvent.click(
      within(group).getByRole('button', { name: 'Delete Saga' }),
    )
    expect(
      await screen.findByText('“Saga” goes with 4 issue records.'),
    ).toBeInTheDocument()
    expect(writes(mock)).toHaveLength(0)
    await userEvent.click(
      within(group).getByRole('button', { name: 'Delete Saga for good' }),
    )

    await waitFor(() => expect(writes(mock)).toHaveLength(1))
    const [url, options] = writes(mock)[0]
    expect(url).toMatch(/\/api\/items\/s$/)
    expect(options.method).toBe('DELETE')
    expect(await screen.findByText('Deleted “Saga”.')).toBeInTheDocument()
    // The button that had focus is gone: focus parks on the grid.
    await waitFor(() =>
      expect(document.querySelector('.collection-list')).toHaveFocus(),
    )
  })

  it('says so and keeps the page when a delete fails', async () => {
    stubApi({
      onWrite: (url, options) =>
        preview(url) ?? (options.method === 'DELETE' ? { ok: false } : null),
    })
    await renderPage()
    const group = screen.getByRole('group', { name: 'Actions for Saga' })
    await userEvent.click(
      within(group).getByRole('button', { name: 'Delete Saga' }),
    )
    await screen.findByText(/goes with 4 issue records/)
    await userEvent.click(
      within(group).getByRole('button', { name: 'Delete Saga for good' }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Couldn’t delete that item.',
    )
    expect(screen.queryByText('Deleted “Saga”.')).toBeNull()
  })

  it('redoes a series and goes to the sitting', async () => {
    function Where() {
      return <p data-testid="where">{useLocation().pathname}</p>
    }
    const mock = stubApi({
      onWrite: (url) =>
        preview(url) ??
        (url.endsWith('/redo')
          ? {
              ok: true,
              status: 200,
              json: async () => ({ sitting_id: 's9', entry_id: 'e9' }),
            }
          : null),
    })
    render(
      <MemoryRouter>
        <AdminComics />
        <Where />
      </MemoryRouter>,
    )
    await waitFor(() =>
      expect(document.querySelector('.poster-grid')).not.toBeNull(),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Redo Saga' }))
    await screen.findByText(/comes back as an entry in Add to match again/)
    await userEvent.click(
      screen.getByRole('button', { name: 'Yes, redo, Saga' }),
    )
    await waitFor(() =>
      expect(screen.getByTestId('where')).toHaveTextContent(
        '/admin/collection/add/s9',
      ),
    )
    expect(writes(mock)[0][0]).toMatch(/\/api\/items\/s\/redo$/)
  })

  it('puts the controls behind a … toggle on touch, as the Games card does', async () => {
    touch = true
    stubApi()
    await renderPage()
    expect(screen.queryByLabelText('Public: Saga')).toBeNull()

    await userEvent.click(
      screen.getByRole('button', { name: 'Actions for Saga' }),
    )

    const sheet = screen.getByRole('dialog', { name: 'Actions for Saga' })
    expect(within(sheet).getByLabelText('Public: Saga')).toBeInTheDocument()
    expect(
      within(sheet).getByRole('button', { name: 'Delete Saga' }),
    ).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
