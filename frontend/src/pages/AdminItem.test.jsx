import '@testing-library/jest-dom'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AdminItem from './AdminItem.jsx'

const ITEM = {
  id: 'abc',
  type: 'game',
  title: 'Star Fox',
  status: 'backlog',
  rating: null,
  notes: null,
  is_public: false,
  year: 1993,
  creator: 'Nintendo EAD',
  cover_url: 'https://images.igdb.com/old.jpg',
  external_source: 'igdb',
  external_id: '111',
  favorite: false,
  started_at: null,
  finished_at: null,
  times_completed: 0,
  owned_format: 'physical',
  source_metadata: {},
}

/** What the picker's search proxy returns when re-linking. */
const CANDIDATE = {
  external_source: 'igdb',
  external_id: '222',
  title: 'Star Fox',
  year: 2026,
  thumbnail_url: 'https://images.igdb.com/new.jpg',
}

function stubApi({ item = ITEM, status = 200, onWrite } = {}) {
  const mock = vi.fn(async (url, options = {}) => {
    const method = options.method ?? 'GET'
    if (method === 'GET' && String(url).includes('search-metadata')) {
      return { ok: true, status: 200, json: async () => [CANDIDATE] }
    }
    if (method === 'GET') {
      return {
        ok: status === 200,
        status,
        json: async () => item,
      }
    }
    const failure = onWrite?.(String(url), options)
    if (failure) return failure
    return {
      ok: true,
      status: 200,
      json: async () => ({ ...item, ...JSON.parse(options.body ?? '{}') }),
    }
  })
  vi.stubGlobal('fetch', mock)
  return mock
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/admin/collection/abc']}>
      <Routes>
        <Route path="/admin/collection/:id" element={<AdminItem />} />
        <Route path="/admin/collection" element={<p>collection list</p>} />
      </Routes>
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

describe('AdminItem', () => {
  it('renders the item with its fields populated', async () => {
    stubApi()
    renderPage()

    expect(await screen.findByDisplayValue('Star Fox')).toBeInTheDocument()
    expect(screen.getByLabelText('Year')).toHaveValue(1993)
    expect(screen.getByLabelText('Format')).toHaveValue('physical')
  })

  it('shows what the item is linked to', async () => {
    stubApi()
    renderPage()

    expect(await screen.findByText(/linked to igdb #111/i)).toBeInTheDocument()
    expect(screen.getByText('Nintendo EAD')).toBeInTheDocument()
  })

  it('says plainly when an item is not linked', async () => {
    stubApi({ item: { ...ITEM, external_source: null, external_id: null } })
    renderPage()

    expect(
      await screen.findByText(/not linked to a source/i),
    ).toBeInTheDocument()
  })

  it('sends only the fields that actually changed', async () => {
    // Sending the whole form would overwrite anything the form does not
    // manage, and re-save fields nobody touched.
    const mock = stubApi()
    renderPage()

    const rating = await screen.findByLabelText('Rating')
    await userEvent.type(rating, '8')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(JSON.parse(writeCalls(mock)[0][1].body)).toEqual({ rating: 8 })
    })
  })

  it('refuses to save when nothing changed', async () => {
    const mock = stubApi()
    renderPage()

    await screen.findByDisplayValue('Star Fox')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText(/nothing has changed/i)).toBeInTheDocument()
    expect(writeCalls(mock)).toHaveLength(0)
  })

  it('reports a failed save', async () => {
    stubApi({
      onWrite: () => ({ ok: false, status: 500, json: async () => ({}) }),
    })
    renderPage()

    await userEvent.type(await screen.findByLabelText('Rating'), '8')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText(/could not save/i)).toBeInTheDocument()
  })

  it('publishes from the detail view too', async () => {
    const mock = stubApi()
    renderPage()

    await userEvent.click(await screen.findByLabelText('Public'))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(JSON.parse(writeCalls(mock)[0][1].body)).toEqual({
        is_public: true,
      })
    })
  })

  it('clears a field back to null rather than sending an empty string', async () => {
    const mock = stubApi({ item: { ...ITEM, rating: 7 } })
    renderPage()

    await userEvent.clear(await screen.findByLabelText('Rating'))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(JSON.parse(writeCalls(mock)[0][1].body)).toEqual({ rating: null })
    })
  })

  it('confirms before deleting', async () => {
    const mock = stubApi()
    vi.stubGlobal(
      'confirm',
      vi.fn(() => false),
    )
    renderPage()

    await userEvent.click(await screen.findByRole('button', { name: 'Delete' }))

    expect(window.confirm).toHaveBeenCalled()
    expect(writeCalls(mock)).toHaveLength(0)
  })

  it('deletes and returns to the collection when confirmed', async () => {
    const mock = stubApi()
    vi.stubGlobal(
      'confirm',
      vi.fn(() => true),
    )
    renderPage()

    await userEvent.click(await screen.findByRole('button', { name: 'Delete' }))

    await waitFor(() => {
      expect(writeCalls(mock)[0][1].method).toBe('DELETE')
    })
    expect(await screen.findByText('collection list')).toBeInTheDocument()
  })

  it('re-links, then re-fetches the metadata server-side', async () => {
    // The fix for Star Fox matching 1993 instead of 2026. The browser stores
    // the link; the server decides what that record means.
    const mock = stubApi()
    renderPage()

    await userEvent.type(await screen.findByLabelText(/look up/i), 'Star Fox')
    await userEvent.click(
      await screen.findByRole('button', { name: /Star Fox/ }),
    )

    await waitFor(() => expect(writeCalls(mock)).toHaveLength(2))

    const [link, refresh] = writeCalls(mock)
    expect(link[1].method).toBe('PATCH')
    expect(JSON.parse(link[1].body)).toEqual({
      external_source: 'igdb',
      external_id: '222',
    })
    expect(String(refresh[0])).toContain('/refresh-metadata')
    expect(refresh[1].method).toBe('POST')
  })

  it('never sends the title when re-linking', async () => {
    // A hand-corrected title has to survive: the refresh route deliberately
    // leaves it alone, and this must not undo that from the other side.
    const mock = stubApi()
    renderPage()

    await userEvent.type(await screen.findByLabelText(/look up/i), 'Star Fox')
    await userEvent.click(
      await screen.findByRole('button', { name: /Star Fox/ }),
    )

    await waitFor(() => expect(writeCalls(mock)).toHaveLength(2))
    expect(JSON.parse(writeCalls(mock)[0][1].body)).not.toHaveProperty('title')
  })

  it('keeps the link when the refresh fails, and says so', async () => {
    // The link is right even when enrichment is briefly unavailable.
    stubApi({
      onWrite: (url) =>
        String(url).includes('refresh-metadata')
          ? { ok: false, status: 502, json: async () => ({}) }
          : null,
    })
    renderPage()

    await userEvent.type(await screen.findByLabelText(/look up/i), 'Star Fox')
    await userEvent.click(
      await screen.findByRole('button', { name: /Star Fox/ }),
    )

    expect(
      await screen.findByText(/linked, but the metadata could not be fetched/i),
    ).toBeInTheDocument()
  })

  it('says so when the item does not exist', async () => {
    // A blank form for a missing id would look like an item with no data.
    stubApi({ status: 404 })
    renderPage()

    expect(await screen.findByText(/no item with that id/i)).toBeInTheDocument()
  })
})
