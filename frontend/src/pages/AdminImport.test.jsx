import '@testing-library/jest-dom'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router'
import AdminImport from './AdminImport.jsx'

const DETECTIONS = {
  detections: [
    {
      index: 0,
      detected_title: 'Dune',
      media_type: 'movie',
      detected_year: 2021,
      status: 'matched',
      confidence: 'exact',
      reason: null,
      match: {
        external_source: 'tmdb',
        external_id: '438631',
        title: 'Dune',
        year: 2021,
        thumbnail_url: 'https://image.tmdb.org/t/p/w185/a.jpg',
      },
      candidates: [
        {
          external_source: 'tmdb',
          external_id: '438631',
          title: 'Dune',
          year: 2021,
          thumbnail_url: 'https://image.tmdb.org/t/p/w185/a.jpg',
        },
        {
          external_source: 'tmdb',
          external_id: '841',
          title: 'Dune',
          year: 1984,
          thumbnail_url: 'https://image.tmdb.org/t/p/w185/b.jpg',
        },
      ],
    },
    {
      index: 1,
      detected_title: 'Blade Runer',
      media_type: 'movie',
      detected_year: null,
      status: 'matched',
      confidence: 'uncertain',
      reason: null,
      match: null,
      candidates: [],
    },
  ],
}

function renderPage() {
  return render(
    <MemoryRouter>
      <AdminImport />
    </MemoryRouter>,
  )
}

/** Routes fetch by URL so upload and commit can be asserted separately. */
function stubApi({ photos, bulk }) {
  const mock = vi.fn(async (url) => {
    if (String(url).includes('/api/import/photos')) return photos
    if (String(url).includes('/api/items/bulk')) return bulk
    throw new Error(`unexpected fetch: ${url}`)
  })
  vi.stubGlobal('fetch', mock)
  return mock
}

function okJson(body) {
  return { ok: true, status: 200, json: async () => body }
}

async function uploadAPhoto() {
  const file = new File([new Uint8Array([255, 216, 1])], 'shelf.jpg', {
    type: 'image/jpeg',
  })
  await userEvent.upload(screen.getByLabelText(/shelf photos/i), file)
  await userEvent.click(screen.getByRole('button', { name: /read photos/i }))
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('AdminImport', () => {
  it('lists every detection with its match pre-selected', async () => {
    stubApi({ photos: okJson(DETECTIONS) })
    renderPage()
    await uploadAPhoto()

    expect(await screen.findByDisplayValue('Dune')).toBeInTheDocument()
    // The unmatched row keeps what was read off the spine.
    expect(screen.getByDisplayValue('Blade Runer')).toBeInTheDocument()
  })

  it('marks an uncertain row in text, not colour alone', async () => {
    stubApi({ photos: okJson(DETECTIONS) })
    renderPage()
    await uploadAPhoto()

    expect(await screen.findByText('Check')).toBeInTheDocument()
    expect(screen.getByText('Exact')).toBeInTheDocument()
  })

  it('lets a row be switched to another candidate before import', async () => {
    const fetchMock = stubApi({
      photos: okJson(DETECTIONS),
      bulk: okJson({ created: 1, skipped_duplicates: 0, ids: ['x'] }),
    })
    renderPage()
    await uploadAPhoto()

    await userEvent.selectOptions(
      await screen.findByLabelText(/match for Dune/i),
      'tmdb:841',
    )
    // Drop the second row so only the switched one is submitted.
    await userEvent.click(screen.getByLabelText(/import Blade Runer/i))
    await userEvent.click(
      screen.getByRole('button', { name: /import 1 item/i }),
    )

    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) =>
        String(c[0]).includes('/api/items/bulk'),
      )
      expect(call).toBeTruthy()
      const sent = JSON.parse(call[1].body).items
      expect(sent).toHaveLength(1)
      expect(sent[0].external_id).toBe('841')
      expect(sent[0].year).toBe(1984)
    })
  })

  it('sends only checked rows, as physical backlog items', async () => {
    const fetchMock = stubApi({
      photos: okJson(DETECTIONS),
      bulk: okJson({ created: 2, skipped_duplicates: 0, ids: ['a', 'b'] }),
    })
    renderPage()
    await uploadAPhoto()

    await userEvent.click(
      await screen.findByRole('button', { name: /import 2 items/i }),
    )

    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) =>
        String(c[0]).includes('/api/items/bulk'),
      )
      const sent = JSON.parse(call[1].body).items
      expect(sent).toHaveLength(2)
      expect(sent.every((row) => row.owned_format === 'physical')).toBe(true)
      expect(sent.every((row) => row.status === 'backlog')).toBe(true)
      // The unmatched row goes in with no external link, not dropped.
      expect(sent[1].external_source).toBeNull()
      expect(sent[1].title).toBe('Blade Runer')
    })
  })

  it('reports how many were skipped as duplicates', async () => {
    stubApi({
      photos: okJson(DETECTIONS),
      bulk: okJson({ created: 1, skipped_duplicates: 1, ids: ['a'] }),
    })
    renderPage()
    await uploadAPhoto()
    await userEvent.click(
      await screen.findByRole('button', { name: /import 2 items/i }),
    )

    expect(await screen.findByText(/skipped 1 already/i)).toBeInTheDocument()
  })

  it('shows the extraction error rather than an empty grid', async () => {
    stubApi({
      photos: {
        ok: false,
        status: 502,
        json: async () => ({ detail: 'Extraction failed, try again.' }),
      },
    })
    renderPage()
    await uploadAPhoto()

    expect(await screen.findByText(/extraction failed/i)).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('says so when no titles could be read', async () => {
    stubApi({ photos: okJson({ detections: [] }) })
    renderPage()
    await uploadAPhoto()

    expect(
      await screen.findByText(/no titles could be read/i),
    ).toBeInTheDocument()
  })

  it('lets a row be retyped before import', async () => {
    const fetchMock = stubApi({
      photos: okJson(DETECTIONS),
      bulk: okJson({ created: 1, skipped_duplicates: 0, ids: ['a'] }),
    })
    renderPage()
    await uploadAPhoto()

    const titleField = await screen.findByLabelText(/title for Blade Runer/i)
    await userEvent.clear(titleField)
    await userEvent.type(titleField, 'Blade Runner')
    await userEvent.click(screen.getByLabelText(/import Dune/i))
    await userEvent.click(
      screen.getByRole('button', { name: /import 1 item/i }),
    )

    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) =>
        String(c[0]).includes('/api/items/bulk'),
      )
      expect(JSON.parse(call[1].body).items[0].title).toBe('Blade Runner')
    })
  })

  it('refuses to import when nothing is selected', async () => {
    stubApi({ photos: okJson(DETECTIONS) })
    renderPage()
    await uploadAPhoto()

    await userEvent.click(await screen.findByLabelText(/import Dune/i))
    await userEvent.click(screen.getByLabelText(/import Blade Runer/i))
    await userEvent.click(
      screen.getByRole('button', { name: /import 0 items/i }),
    )

    expect(await screen.findByText(/nothing is selected/i)).toBeInTheDocument()
  })

  it('sends one request per photo rather than one for the batch', async () => {
    // Three photos in one request took seven to eight minutes with no
    // feedback. Nothing was timing out; the request was simply long enough to
    // abandon, and said nothing while it ran.
    const fetchMock = stubApi({ photos: okJson(DETECTIONS) })
    renderPage()

    const files = ['a.jpg', 'b.jpg', 'c.jpg'].map(
      (name) =>
        new File([new Uint8Array([255, 216, 1])], name, { type: 'image/jpeg' }),
    )
    await userEvent.upload(screen.getByLabelText(/shelf photos/i), files)
    await userEvent.click(screen.getByRole('button', { name: /read photos/i }))

    await waitFor(() => {
      const uploads = fetchMock.mock.calls.filter((call) =>
        String(call[0]).includes('/api/import/photos'),
      )
      expect(uploads).toHaveLength(3)
    })
  })

  it('keeps detection indices unique across photos', async () => {
    // Two photos both number their detections from zero. Without an offset the
    // grid's keys collide and editing one row edits another.
    stubApi({ photos: okJson(DETECTIONS) })
    renderPage()

    const files = ['a.jpg', 'b.jpg'].map(
      (name) =>
        new File([new Uint8Array([255, 216, 1])], name, { type: 'image/jpeg' }),
    )
    await userEvent.upload(screen.getByLabelText(/shelf photos/i), files)
    await userEvent.click(screen.getByRole('button', { name: /read photos/i }))

    await waitFor(() => {
      expect(screen.getAllByDisplayValue('Dune')).toHaveLength(2)
    })

    // Counting rendered rows would not catch a collision — React mounts
    // duplicate keys anyway. Drive the failure the offset actually prevents:
    // editing the second photo's row must not rewrite the first photo's.
    const dunes = screen.getAllByDisplayValue('Dune')
    await userEvent.clear(dunes[1])
    await userEvent.type(dunes[1], 'Dune Part Two')

    expect(screen.getByDisplayValue('Dune')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Dune Part Two')).toBeInTheDocument()
  })

  it('says the extraction failed rather than blaming the photograph', async () => {
    // "Try a closer shot" is advice for a photo the model read and found
    // nothing in. Saying it when the model was overloaded sends someone to
    // re-photograph a shelf that was perfectly fine.
    stubApi({
      photos: {
        ok: false,
        status: 502,
        json: async () => ({ detail: 'Gemini is overloaded' }),
      },
    })
    renderPage()
    await uploadAPhoto()

    expect(await screen.findByText(/overloaded/i)).toBeInTheDocument()
    expect(
      screen.queryByText(/no titles could be read/i),
    ).not.toBeInTheDocument()
  })

  it('keeps the other photos when one fails', async () => {
    // The same rule the importer already applies when one source is down.
    let call = 0
    const mock = vi.fn(async (url) => {
      if (String(url).includes('/api/import/photos')) {
        call += 1
        return call === 1
          ? {
              ok: false,
              status: 502,
              json: async () => ({ detail: 'overloaded' }),
            }
          : okJson(DETECTIONS)
      }
      return okJson({})
    })
    vi.stubGlobal('fetch', mock)
    renderPage()

    const files = ['bad.jpg', 'good.jpg'].map(
      (name) =>
        new File([new Uint8Array([255, 216, 1])], name, { type: 'image/jpeg' }),
    )
    await userEvent.upload(screen.getByLabelText(/shelf photos/i), files)
    await userEvent.click(screen.getByRole('button', { name: /read photos/i }))

    // The failure is named against its photo, and the good one still lands.
    expect(await screen.findByText(/bad\.jpg/)).toBeInTheDocument()
    expect(await screen.findByDisplayValue('Dune')).toBeInTheDocument()
  })

  it('keeps the type editable so a misread shelf can be corrected', async () => {
    stubApi({ photos: okJson(DETECTIONS) })
    renderPage()
    await uploadAPhoto()

    const typeField = await screen.findByLabelText(/type for Dune/i)
    await userEvent.selectOptions(typeField, 'boardgame')
    expect(
      within(typeField).getByRole('option', { name: 'boardgame' }).selected,
    ).toBe(true)
  })
})
