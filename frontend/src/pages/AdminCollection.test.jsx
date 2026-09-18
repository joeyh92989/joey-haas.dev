import '@testing-library/jest-dom'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AdminCollection from './AdminCollection.jsx'

const ITEMS = [
  {
    id: 'a',
    type: 'game',
    title: 'Star Fox',
    status: 'backlog',
    rating: null,
    is_public: false,
    cover_url: 'https://images.igdb.com/a.jpg',
  },
  {
    id: 'b',
    type: 'movie',
    title: 'Dune',
    status: 'finished',
    rating: 9,
    is_public: true,
    cover_url: null,
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
})

describe('AdminCollection', () => {
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
    // The list is re-read from the server, so the checkbox shows its state.
    expect(screen.getByLabelText('Public: Star Fox')).not.toBeChecked()
    expect(mock).toHaveBeenCalled()
  })

  it('publishes everything through the bulk route', async () => {
    const mock = stubApi()
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
