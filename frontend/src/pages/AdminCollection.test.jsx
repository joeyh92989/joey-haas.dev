import '@testing-library/jest-dom'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { localToday } from '../lib/statusTransition.js'
import AdminCollection from './AdminCollection.jsx'

// A pointer device on a wide screen: cards render the hover panel and the
// sort renders as buttons. The touch sheet is covered in
// ShelfCardActions.test.jsx.
vi.mock('../lib/useMediaQuery.js', () => ({
  useMediaQuery: (query) => query === '(hover: hover)',
}))

const ITEMS = [
  {
    id: 'a',
    type: 'game',
    title: 'Star Fox',
    status: 'backlog',
    rating: null,
    is_public: false,
    cover_url: 'https://images.igdb.com/a.jpg',
    favorite: false,
    finished_at: null,
    times_completed: 0,
    owned_format: 'physical',
    created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'b',
    type: 'movie',
    title: 'Dune',
    status: 'finished',
    rating: 9,
    is_public: true,
    cover_url: null,
    favorite: false,
    finished_at: '2025-04-01',
    times_completed: 1,
    owned_format: null,
    created_at: '2026-02-01T00:00:00Z',
  },
]

/**
 * Routes fetch by URL and method so each call can be asserted separately.
 * `onWrite` lets a test make one of them fail.
 */
function stubApi({ items = ITEMS, onWrite } = {}) {
  const mock = vi.fn(async (url, options = {}) => {
    const method = options.method ?? 'GET'
    if (method === 'GET' && String(url).endsWith('/api/items')) {
      return { ok: true, status: 200, json: async () => items }
    }
    const failure = onWrite?.(String(url), options)
    if (failure) return failure
    return { ok: true, status: 200, json: async () => ({}) }
  })
  vi.stubGlobal('fetch', mock)
  return mock
}

function renderPage() {
  return render(
    <MemoryRouter>
      <AdminCollection />
    </MemoryRouter>,
  )
}

function writeCalls(mock) {
  return mock.mock.calls.filter(
    ([, options]) => (options?.method ?? 'GET') !== 'GET',
  )
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  localStorage.clear()
})

// The table: the List view, kept for bulk work.
describe('AdminCollection', () => {
  beforeEach(() => {
    localStorage.setItem('shelf.admin.view', '"list"')
  })

  it('shows cover art for each row', async () => {
    stubApi()
    renderPage()

    await screen.findByText('Star Fox')
    // One real image; the row with no cover renders a placeholder instead.
    expect(document.querySelectorAll('.item-table img')).toHaveLength(1)
    expect(
      document.querySelectorAll('.item-table .cover-placeholder'),
    ).toHaveLength(1)
  })

  it('links each row to its detail view', async () => {
    stubApi()
    renderPage()

    const link = await screen.findByRole('link', { name: 'Star Fox' })
    expect(link).toHaveAttribute('href', '/admin/collection/a')
  })

  it('publishes one item with a PATCH', async () => {
    const mock = stubApi()
    renderPage()

    await userEvent.click(await screen.findByLabelText('Public: Star Fox'))

    await waitFor(() => {
      const call = writeCalls(mock)[0]
      expect(String(call[0])).toContain('/api/items/a')
      expect(call[1].method).toBe('PATCH')
      expect(JSON.parse(call[1].body)).toEqual({ is_public: true })
    })
  })

  it('reports a failed toggle rather than showing the item as published', async () => {
    // Showing a row as public when the save failed is worse than showing it
    // as private: the public page would disagree with the admin page.
    const mock = stubApi({
      onWrite: () => ({ ok: false, status: 500, json: async () => ({}) }),
    })
    renderPage()

    await userEvent.click(await screen.findByLabelText('Public: Star Fox'))

    expect(await screen.findByText(/could not change/i)).toBeInTheDocument()
    // No optimistic flip: the checkbox still shows the pre-toggle value. The
    // failure path returns before reloading, so this is the last state the
    // server confirmed rather than a fresh re-read.
    expect(screen.getByLabelText('Public: Star Fox')).not.toBeChecked()
    expect(mock).toHaveBeenCalled()
  })

  it('asks before publishing the whole collection', async () => {
    // The most consequential action on this page: it puts every private row
    // on a public website, including any still waiting to be corrected.
    // Deleting a single item already asks; this must not be less guarded.
    const mock = stubApi()
    vi.stubGlobal(
      'confirm',
      vi.fn(() => false),
    )
    renderPage()

    await userEvent.click(
      await screen.findByRole('button', { name: /publish all 2/i }),
    )

    expect(window.confirm).toHaveBeenCalled()
    expect(writeCalls(mock)).toHaveLength(0)
  })

  it('does not ask before hiding, which only removes things from view', async () => {
    const mock = stubApi()
    vi.stubGlobal(
      'confirm',
      vi.fn(() => false),
    )
    renderPage()

    await userEvent.click(
      await screen.findByRole('button', { name: /hide all/i }),
    )

    await waitFor(() => expect(writeCalls(mock)).toHaveLength(1))
    expect(window.confirm).not.toHaveBeenCalled()
  })

  it('publishes everything through the bulk route', async () => {
    const mock = stubApi()
    vi.stubGlobal(
      'confirm',
      vi.fn(() => true),
    )
    renderPage()

    await userEvent.click(
      await screen.findByRole('button', { name: /publish all 2/i }),
    )

    await waitFor(() => {
      const call = writeCalls(mock)[0]
      expect(String(call[0])).toContain('/api/items/visibility')
      expect(call[1].method).toBe('POST')
      expect(JSON.parse(call[1].body)).toEqual({ is_public: true })
    })
  })

  it('hides everything through the bulk route', async () => {
    const mock = stubApi()
    renderPage()

    await userEvent.click(
      await screen.findByRole('button', { name: /hide all/i }),
    )

    await waitFor(() => {
      expect(JSON.parse(writeCalls(mock)[0][1].body)).toEqual({
        is_public: false,
      })
    })
  })

  it('states how many items the bulk action affects', async () => {
    // Publishing a whole collection should be a deliberate act, not an
    // unlabelled button.
    stubApi()
    renderPage()

    expect(await screen.findByText('1 of 2 public')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /publish all 2/i }),
    ).toBeInTheDocument()
  })

  it('disables publish-all when everything is already public', async () => {
    stubApi({ items: ITEMS.map((item) => ({ ...item, is_public: true })) })
    renderPage()

    expect(
      await screen.findByRole('button', { name: /publish all 2/i }),
    ).toBeDisabled()
  })
})

describe('AdminCollection list view status', () => {
  beforeEach(() => {
    localStorage.setItem('shelf.admin.view', '"list"')
  })

  // The table's select goes through the same transition as the shelf, so a
  // finish from either view counts a completion.
  it('sends the finished transition from the table', async () => {
    const mock = stubApi()
    renderPage()

    await userEvent.selectOptions(
      await screen.findByLabelText('Status for Star Fox'),
      'finished',
    )

    await waitFor(() => {
      const call = writeCalls(mock)[0]
      expect(String(call[0])).toContain('/api/items/a')
      expect(JSON.parse(call[1].body)).toEqual({
        status: 'finished',
        finished_at: localToday(),
        times_completed: 1,
      })
    })
  })

  it('sends only the status for anything else', async () => {
    const mock = stubApi()
    renderPage()

    await userEvent.selectOptions(
      await screen.findByLabelText('Status for Dune'),
      'active',
    )

    await waitFor(() =>
      expect(JSON.parse(writeCalls(mock)[0][1].body)).toEqual({
        status: 'active',
      }),
    )
  })
})

/** The shelf card whose title is `title`. */
function card(title) {
  return within(
    screen
      .getByText(title, { selector: '.poster-grid .poster-title' })
      .closest('.poster-card'),
  )
}

async function renderShelf() {
  renderPage()
  await waitFor(() =>
    expect(document.querySelector('.poster-grid')).not.toBeNull(),
  )
}

describe('AdminCollection shelf', () => {
  it('opens on the shelf by default', async () => {
    stubApi()
    await renderShelf()

    expect(document.querySelector('.item-table')).toBeNull()
    expect(screen.getByRole('button', { name: 'Shelf' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('switches to the list and remembers it', async () => {
    stubApi()
    await renderShelf()

    await userEvent.click(screen.getByRole('button', { name: 'List' }))

    expect(document.querySelector('.item-table')).not.toBeNull()
    expect(document.querySelector('.poster-grid')).toBeNull()
    expect(localStorage.getItem('shelf.admin.view')).toBe('"list"')
  })

  it('keeps the add form, import link and bulk controls in both views', async () => {
    stubApi()
    await renderShelf()

    expect(
      screen.getByRole('link', { name: /import from photos/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /publish all 2/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /hide all/i }),
    ).toBeInTheDocument()
    expect(document.querySelector('form')).not.toBeNull()
  })

  it('computes the hero numbers from the rows', async () => {
    const year = new Date().getUTCFullYear()
    stubApi({
      items: [
        ...ITEMS,
        {
          ...ITEMS[1],
          id: 'c',
          title: 'Wanted',
          owned_format: 'none',
          status: 'finished',
          finished_at: `${year}-02-01`,
        },
      ],
    })
    await renderShelf()

    const hero = document.querySelector('.hero-numbers')
    // Star Fox (physical) and Dune (NULL) are owned; the want is not.
    expect(within(hero).getByText('Owned').nextSibling).toHaveTextContent('2')
    expect(within(hero).getByText('Finished').nextSibling).toHaveTextContent(
      '2',
    )
    expect(
      within(hero).getByText(`Finished in ${year}`).nextSibling,
    ).toHaveTextContent('1')
  })

  it('always shows the favourites row, with empty slots and a hint', async () => {
    stubApi()
    await renderShelf()

    const row = screen.getByRole('region', { name: 'Favourites' })
    expect(row.querySelectorAll('.favourite-empty')).toHaveLength(4)
    expect(within(row).getByText(/pick your favourites/i)).toBeInTheDocument()
  })

  // A private item has no public page; linking there would be a 404.
  it('links a private card to its edit page and a public one to its page', async () => {
    stubApi()
    await renderShelf()

    expect(card('Star Fox').getByRole('link')).toHaveAttribute(
      'href',
      '/admin/collection/a',
    )
    expect(card('Dune').getByRole('link')).toHaveAttribute(
      'href',
      '/collection/b',
    )
  })

  it('dims finished items by default', async () => {
    stubApi()
    await renderShelf()

    expect(
      screen.getByRole('button', { name: 'Dim finished' }),
    ).toHaveAttribute('aria-pressed', 'true')
    expect(
      screen
        .getByText('Dune', { selector: '.poster-grid .poster-title' })
        .closest('.poster-card'),
    ).toHaveAttribute('data-dimmed')
  })

  it('rates from the card', async () => {
    const mock = stubApi()
    await renderShelf()

    await userEvent.click(
      card('Star Fox').getByRole('radio', { name: 'Rate 7 out of 10' }),
    )

    await waitFor(() => {
      const call = writeCalls(mock)[0]
      expect(String(call[0])).toContain('/api/items/a')
      expect(call[1].method).toBe('PATCH')
      expect(JSON.parse(call[1].body)).toEqual({ rating: 7 })
    })
  })

  it('clears a rating from the card', async () => {
    const mock = stubApi()
    await renderShelf()

    await userEvent.click(
      card('Dune').getByRole('radio', { name: 'Clear rating' }),
    )

    await waitFor(() =>
      expect(JSON.parse(writeCalls(mock)[0][1].body)).toEqual({ rating: null }),
    )
  })

  it('favourites from the card', async () => {
    const mock = stubApi()
    await renderShelf()

    await userEvent.click(
      card('Star Fox').getByRole('button', { name: 'Favourite' }),
    )

    await waitFor(() =>
      expect(JSON.parse(writeCalls(mock)[0][1].body)).toEqual({
        favorite: true,
      }),
    )
  })

  it('finishes from the card with the transition body', async () => {
    const mock = stubApi()
    await renderShelf()

    await userEvent.selectOptions(
      card('Star Fox').getByRole('combobox', { name: 'Status for Star Fox' }),
      'finished',
    )

    await waitFor(() =>
      expect(JSON.parse(writeCalls(mock)[0][1].body)).toEqual({
        status: 'finished',
        finished_at: localToday(),
        times_completed: 1,
      }),
    )
  })

  it('publishes from the card', async () => {
    const mock = stubApi()
    await renderShelf()

    await userEvent.click(card('Star Fox').getByLabelText('Public: Star Fox'))

    await waitFor(() =>
      expect(JSON.parse(writeCalls(mock)[0][1].body)).toEqual({
        is_public: true,
      }),
    )
  })

  it('reports a failed change and keeps showing the server’s state', async () => {
    stubApi({
      onWrite: () => ({ ok: false, status: 500, json: async () => ({}) }),
    })
    await renderShelf()

    await userEvent.click(
      card('Star Fox').getByRole('radio', { name: 'Rate 7 out of 10' }),
    )

    expect(await screen.findByText(/could not update/i)).toBeInTheDocument()
    expect(
      card('Star Fox').getByRole('radio', { name: 'Rate 7 out of 10' }),
    ).toHaveAttribute('aria-checked', 'false')
  })

  it('reloads after a change so the card shows what the server saved', async () => {
    const mock = stubApi()
    await renderShelf()
    const reads = () =>
      mock.mock.calls.filter(([, options]) => !options?.method).length

    const before = reads()
    await userEvent.click(
      card('Star Fox').getByRole('button', { name: 'Favourite' }),
    )

    await waitFor(() => expect(reads()).toBe(before + 1))
  })
})

describe('AdminCollection nudge', () => {
  const UNRATED = [
    ...ITEMS,
    ...[1, 2, 3].map((n) => ({
      ...ITEMS[0],
      id: `u${n}`,
      title: `Unrated ${n}`,
      status: 'finished',
      rating: null,
    })),
  ]

  it('asks for ratings while fewer than five items are rated or favourited', async () => {
    stubApi({ items: UNRATED })
    await renderShelf()

    expect(
      screen.getByText(
        '3 finished games have no rating. Rating them is what makes Play Next work.',
      ),
    ).toBeInTheDocument()
  })

  it('is gone once five items are rated or favourited', async () => {
    const rated = [4, 5, 6, 7].map((n) => ({
      ...ITEMS[0],
      id: `r${n}`,
      title: `Rated ${n}`,
      rating: n,
    }))
    // Dune is rated; four more make five.
    stubApi({ items: [...UNRATED, ...rated] })
    await renderShelf()

    expect(screen.queryByText(/have no rating/)).not.toBeInTheDocument()
  })

  it('filters to the finished, unrated items from its chip', async () => {
    stubApi({ items: UNRATED })
    await renderShelf()

    await userEvent.click(screen.getByRole('button', { name: 'Show them' }))

    const titles = [
      ...document.querySelectorAll('.poster-grid .poster-title'),
    ].map((node) => node.textContent)
    expect(titles.sort()).toEqual(['Unrated 1', 'Unrated 2', 'Unrated 3'])
    expect(
      screen.getByRole('button', { name: /Finished, unrated/ }),
    ).toHaveAttribute('aria-pressed', 'true')
  })

  it('can be dismissed', async () => {
    stubApi({ items: UNRATED })
    await renderShelf()

    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }))

    expect(screen.queryByText(/have no rating/)).not.toBeInTheDocument()
  })
})

describe('AdminCollection favourites cap', () => {
  const FULL = 'You already have 4 favourites. Unfavourite one first.'

  /** Star Fox and Dune plus `count` favourited games. */
  function withFavourites(count) {
    return [
      ...ITEMS,
      ...Array.from({ length: count }, (_, n) => ({
        ...ITEMS[0],
        id: `f${n}`,
        title: `Favourite ${n}`,
        favorite: true,
        rating: 8,
      })),
    ]
  }

  it('refuses a fifth favourite without asking the server, and says why', async () => {
    const mock = stubApi({ items: withFavourites(4) })
    await renderShelf()

    const heart = card('Star Fox').getByRole('button', { name: 'Favourite' })
    expect(heart).toHaveAttribute('aria-disabled', 'true')

    await userEvent.click(heart)

    expect(await screen.findByRole('alert')).toHaveTextContent(FULL)
    expect(writeCalls(mock)).toHaveLength(0)
  })

  it('still unfavourites when four are set', async () => {
    const mock = stubApi({ items: withFavourites(4) })
    await renderShelf()

    await userEvent.click(
      card('Favourite 0').getByRole('button', { name: 'Favourite' }),
    )

    await waitFor(() =>
      expect(JSON.parse(writeCalls(mock)[0][1].body)).toEqual({
        favorite: false,
      }),
    )
  })

  // The server is the authority: another tab may have filled the slots
  // since this page loaded.
  it('shows the server’s message when it refuses', async () => {
    stubApi({
      items: withFavourites(3),
      onWrite: () => ({
        ok: false,
        status: 409,
        json: async () => ({ detail: FULL }),
      }),
    })
    await renderShelf()

    await userEvent.click(
      card('Star Fox').getByRole('button', { name: 'Favourite' }),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(FULL)
  })

  it('keeps the generic message for other failures', async () => {
    stubApi({
      onWrite: () => ({ ok: false, status: 500, json: async () => ({}) }),
    })
    await renderShelf()

    await userEvent.click(
      card('Star Fox').getByRole('radio', { name: 'Rate 7 out of 10' }),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not update that item.',
    )
  })

  // Rows favourited before the cap are kept; the admin row shows all of
  // them so they can be trimmed, while the public row still shows four.
  it('shows every favourite in the admin row when there are more than four', async () => {
    stubApi({ items: withFavourites(6) })
    await renderShelf()

    const row = screen.getByRole('region', { name: 'Favourites' })
    expect(within(row).getAllByRole('link')).toHaveLength(6)
    expect(
      within(row).getByText(
        '6 favourites. The public page shows four; unfavourite 2.',
      ),
    ).toBeInTheDocument()
    expect(row.querySelectorAll('.favourite-empty')).toHaveLength(0)
  })

  it('shows neither slots nor a note at exactly four', async () => {
    stubApi({ items: withFavourites(4) })
    await renderShelf()

    const row = screen.getByRole('region', { name: 'Favourites' })
    expect(within(row).getAllByRole('link')).toHaveLength(4)
    expect(row.querySelectorAll('.favourite-empty')).toHaveLength(0)
    expect(row.querySelector('.favourites-hint')).toBeNull()
  })
})
