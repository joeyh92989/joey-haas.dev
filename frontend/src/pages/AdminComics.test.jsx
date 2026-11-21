import { adminCopy } from '../content/adminCopy.js'
import '@testing-library/jest-dom'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent } from '@testing-library/react'
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
      issues_read: 12,
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

  it('shows the figures and the series count', async () => {
    stubApi()
    await renderPage()
    const tiles = document.querySelector('.stat-tiles')
    expect(
      [...tiles.querySelectorAll('dt')].map((dt) => dt.textContent),
    ).toEqual([
      'Series',
      'Books owned',
      'Issues owned',
      'Missing',
      'Issues read',
      'Share read',
    ])
    // Issues read is the read marks (12), not the read-to count (40).
    expect(
      screen.getByText('Issues read', { selector: 'dt' }).parentElement,
    ).toHaveTextContent('12')
    expect(tiles).toHaveTextContent('64')
    expect(tiles).toHaveTextContent('18')
    expect(screen.getByText('2 titles')).toBeInTheDocument()
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
      within(group).getByRole('button', { name: adminCopy.comics.follow }),
    ).toHaveAttribute('aria-pressed', 'true')
    expect(within(group).getByLabelText('Public: Saga')).toBeChecked()
    expect(
      within(group).getByRole('link', { name: 'Cover wall · 18 missing' }),
    ).toHaveAttribute('href', '/shelf/s/')
    expect(
      within(group).getByRole('link', { name: adminCopy.comics.edit }),
    ).toHaveAttribute('href', '/admin/shelf/comics/s')
  })

  it('has no cover-wall link on a private series, only Edit', async () => {
    stubApi()
    await renderPage()
    const group = screen.getByRole('group', { name: 'Actions for Monstress' })
    expect(within(group).queryByRole('link', { name: /Cover wall/ })).toBeNull()
    expect(
      within(group).getByRole('link', { name: adminCopy.comics.edit }),
    ).toBeInTheDocument()
  })

  it('links a private card to its edit page, not a public page that is not there', async () => {
    stubApi()
    await renderPage()
    expect(screen.getByRole('link', { name: /^Monstress/ })).toHaveAttribute(
      'href',
      '/admin/shelf/comics/m',
    )
  })

  it('follows and unfollows through the comics routes', async () => {
    const mock = stubApi()
    await renderPage()
    const group = screen.getByRole('group', { name: 'Actions for Monstress' })
    await userEvent.click(
      within(group).getByRole('button', { name: adminCopy.comics.follow }),
    )
    await waitFor(() => expect(writes(mock)).toHaveLength(1))
    const [url, options] = writes(mock)[0]
    expect(url).toContain('/api/comics/follow')
    expect(JSON.parse(options.body)).toEqual({ external_id: '4051' })

    const saga = screen.getByRole('group', { name: 'Actions for Saga' })
    await userEvent.click(
      within(saga).getByRole('button', { name: adminCopy.comics.follow }),
    )
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

  it('publishes its own series by id, never the games, once confirmed', async () => {
    const mock = stubApi()
    const confirmSpy = vi.fn(() => true)
    vi.stubGlobal('confirm', confirmSpy)
    await renderPage()
    await userEvent.click(
      screen.getByRole('button', { name: /publish all 2/i }),
    )
    expect(
      screen.getByText('Publish 2 comic series to My Shelf?'),
    ).toBeInTheDocument()
    expect(writes(mock)).toHaveLength(0)
    await userEvent.click(screen.getByRole('button', { name: /yes, publish/i }))
    await waitFor(() => expect(writes(mock)).toHaveLength(1))
    const [url, options] = writes(mock)[0]
    expect(url).toContain('/api/items/visibility')
    expect(JSON.parse(options.body)).toEqual({
      is_public: true,
      ids: ['s', 'm'],
    })
    expect(confirmSpy).not.toHaveBeenCalled()
  })

  it('does nothing when the owner says Keep it', async () => {
    const mock = stubApi()
    await renderPage()
    await userEvent.click(
      screen.getByRole('button', { name: /publish all 2/i }),
    )
    await userEvent.click(screen.getByRole('button', { name: /keep/i }))
    expect(screen.queryByText(/to My Shelf\?/)).not.toBeInTheDocument()
    expect(writes(mock)).toHaveLength(0)
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
      screen.getByRole('button', { name: adminCopy.comics.refreshMetadata }),
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
    expect(
      screen.getByRole('link', { name: adminCopy.comics.addComics }),
    ).toBeInTheDocument()
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
    // jsdom has no showModal; the sheet is a native modal dialog (Sheet).
    HTMLDialogElement.prototype.showModal = function () {
      this.setAttribute('open', '')
    }
    HTMLDialogElement.prototype.close = function () {
      this.removeAttribute('open')
      this.dispatchEvent(new Event('close'))
    }
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
    fireEvent(sheet, new Event('cancel', { cancelable: true }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('AdminComics tags', () => {
  const tagged = [
    comic('s', 'Saga', {
      tags: [
        { group: 'genre', tag: 'sci-fi' },
        { group: 'form', tag: 'ongoing' },
      ],
    }),
    comic('m', 'Monstress', {
      is_public: false,
      tags: [
        { group: 'genre', tag: 'horror' },
        { group: 'form', tag: 'mini-series' },
      ],
    }),
    comic('b', 'Batman', {
      tags: [{ group: 'based_on', tag: 'original' }],
    }),
  ]

  it('offers Genre and Form chip groups, not Based on, counting private series', async () => {
    stubApi({ items: tagged })
    await renderPage()
    const genre = screen.getByRole('group', { name: 'Genre' })
    expect(
      within(genre).getByRole('button', { name: 'Horror 1' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Form' })).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Based on' })).toBeNull()
  })

  it('filters by a genre, undoes it, and clears with Clear filters', async () => {
    stubApi({ items: tagged })
    await renderPage()
    const horror = within(
      screen.getByRole('group', { name: 'Genre' }),
    ).getByRole('button', { name: /^Horror/ })
    await userEvent.click(horror)
    expect(titles()).toEqual(['Monstress'])
    await userEvent.click(horror)
    expect(titles()).toHaveLength(3)
    await userEvent.click(horror)
    await userEvent.click(screen.getByRole('button', { name: /Clear filters/ }))
    expect(titles()).toHaveLength(3)
  })

  it('leaves the groups out while no series is tagged', async () => {
    stubApi()
    await renderPage()
    expect(screen.queryByRole('group', { name: 'Genre' })).toBeNull()
    expect(screen.queryByRole('group', { name: 'Form' })).toBeNull()
  })
})

describe('AdminComics: the title kind and the Books and Single issues chips', () => {
  const books = (fields) => ({
    owned: 0,
    released: 0,
    missing: 0,
    state: 'unrecorded',
    segments: [],
    read: 0,
    unread: 0,
    ...fields,
  })
  const kinds = [
    comic('r', 'Paper Moons', {
      comic_run: run({ kind: 'run', volumes_owned: 0, volume_numbers: [] }),
    }),
    comic('l', 'Lantern Tales', {
      is_public: false,
      comic_run: books({
        kind: 'book_line',
        volumes_owned: 3,
        volume_numbers: [1, 2, 4],
      }),
    }),
    comic('o', 'Salt Road', {
      comic_run: books({
        kind: 'single_book',
        volumes_owned: 1,
        volume_numbers: [3],
      }),
    }),
    comic('b', 'Harbor Lights', {
      comic_run: run({
        kind: 'both',
        volumes_owned: 2,
        volume_numbers: [1, 3],
      }),
    }),
  ]
  const card = (title) =>
    screen
      .getByText(title, { selector: '.poster-title' })
      .closest('.poster-card')

  it('says the same kind words as the public card, with volumes', async () => {
    stubApi({ items: kinds })
    await renderPage()
    expect(card('Paper Moons')).toHaveTextContent('Run of issues')
    expect(card('Lantern Tales')).toHaveTextContent('Line of books')
    expect(card('Lantern Tales')).toHaveTextContent('Vol. 1, 2 and 4')
    expect(card('Salt Road')).toHaveTextContent('Single book')
    expect(card('Salt Road')).toHaveTextContent('Vol. 3')
    expect(card('Harbor Lights')).toHaveTextContent('Books and issues')
    expect(card('Harbor Lights')).toHaveTextContent('Vol. 1 and 3')
    expect(card('Lantern Tales').querySelector('.lanes')).toBeNull()
    expect(card('Harbor Lights').querySelector('.lanes')).not.toBeNull()
    expect(
      screen.getByRole('group', { name: 'Lantern Tales: Line of books' }),
    ).toBeInTheDocument()
  })

  it('reads a row from an API without a kind as a run', async () => {
    stubApi()
    await renderPage()
    expect(card('Saga')).toHaveTextContent('Run of issues')
    expect(screen.queryByRole('button', { name: /^Books/ })).toBeNull()
  })

  it('filters to Books and Single issues and keeps the chip like the others', async () => {
    stubApi({ items: kinds })
    const { unmount } = await renderPage()
    expect(screen.getByRole('button', { name: /^Books/ })).toHaveTextContent(
      '3',
    )
    await userEvent.click(screen.getByRole('button', { name: /^Books/ }))
    expect(titles().sort()).toEqual([
      'Harbor Lights',
      'Lantern Tales',
      'Salt Road',
    ])
    expect(screen.getByText('3 of 4 titles')).toBeInTheDocument()
    expect(localStorage.getItem('shelf.admin.comics.chip')).toBe('"books"')
    unmount()
    await renderPage()
    expect(screen.getByRole('button', { name: /^Books/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await userEvent.click(
      screen.getByRole('button', { name: /^Single issues/ }),
    )
    expect(titles().sort()).toEqual(['Harbor Lights', 'Paper Moons'])
  })
})

// The design-system look (#532, slice b).
describe('AdminComics look (#532 b)', () => {
  const RING = 'focus-visible:outline-solid'
  const PHONE_TARGET = 'max-[700px]:min-h-11'

  it('draws each series as a record card numbered over the whole shelf', async () => {
    stubApi()
    await renderPage()
    const number = (title) =>
      within(
        screen
          .getByText(title, { selector: '.poster-grid .poster-title' })
          .closest('.poster-card'),
      ).getByText(/^No\. \d{3}$/).textContent
    // Both were added at the same moment: the id breaks the tie.
    expect(number('Monstress')).toBe('No. 001')
    expect(number('Saga')).toBe('No. 002')
  })

  it('keeps the owner controls beside the card link, never inside it', async () => {
    stubApi()
    await renderPage()
    const saga = screen
      .getByText('Saga', { selector: '.poster-grid .poster-title' })
      .closest('.poster-card')
    expect(
      saga.querySelector('a.poster-link').querySelector('button, input'),
    ).toBeNull()
    expect(
      within(saga).getByRole('group', { name: 'Actions for Saga' }),
    ).toBeInTheDocument()
  })

  it('draws the header actions as buttons with a ring and a phone target', async () => {
    stubApi()
    await renderPage()
    const header = screen.getByRole('heading', { level: 1 }).parentElement
      .parentElement
    const controls = [
      within(header).getByRole('link', { name: adminCopy.comics.addComics }),
      within(header).getByRole('button', { name: adminCopy.comics.hideAll }),
      within(header).getByRole('button', {
        name: adminCopy.comics.refreshMetadata,
      }),
    ]
    for (const control of controls) {
      expect(control.className, control.outerHTML).toContain(RING)
      expect(control.className, control.outerHTML).toContain(PHONE_TARGET)
      expect(control).not.toHaveClass('btn')
    }
  })

  it('draws Follow with a filled pressed state and a phone target', async () => {
    stubApi()
    await renderPage()
    const follow = within(
      screen
        .getByText('Saga', { selector: '.poster-grid .poster-title' })
        .closest('.poster-card'),
    ).getByRole('button', { name: adminCopy.comics.follow })
    expect(follow).toHaveAttribute('aria-pressed', 'true')
    expect(follow.className).toContain('aria-pressed:bg-foreground')
    expect(follow.className).toContain('aria-pressed:font-semibold')
    expect(follow.className).toContain(PHONE_TARGET)
  })

  it('searches with the shared Input', async () => {
    stubApi()
    await renderPage()
    expect(screen.getByRole('searchbox')).toHaveAttribute('data-slot', 'input')
  })

  it('arms Publish all in a neutral style and Delete in the destructive one', async () => {
    stubApi()
    await renderPage()
    await userEvent.click(screen.getByRole('button', { name: 'Publish all 2' }))
    const yes = await screen.findByRole('button', { name: /Yes, publish/ })
    expect(yes.className).not.toMatch(/(^| )text-destructive/)
    await userEvent.click(screen.getByRole('button', { name: /^Keep / }))
    await userEvent.click(screen.getByRole('button', { name: 'Delete Saga' }))
    const sure = await screen.findByRole('button', { name: /for good/ })
    expect(sure.className).toMatch(/(^| )text-destructive/)
  })

  it('makes the Public checkbox label a 24px target', async () => {
    stubApi()
    await renderPage()
    const box = screen.getByRole('checkbox', { name: 'Public: Saga' })
    expect(box.closest('label').className).toContain('min-h-6')
  })
})
