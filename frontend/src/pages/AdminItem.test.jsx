import '@testing-library/jest-dom'
import { render, screen, waitFor, within } from '@testing-library/react'
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

    expect(await screen.findByText(/couldn’t save/i)).toBeInTheDocument()
  })

  // The API caps favourites at four. Its 409 explains the rule; the page
  // shows that rather than a generic failure, and keeps the unsaved form.
  it('shows the server’s reason when a fifth favourite is refused', async () => {
    const detail = 'You already have 4 favorites. Remove one first.'
    stubApi({
      onWrite: () => ({
        ok: false,
        status: 409,
        json: async () => ({ detail }),
      }),
    })
    renderPage()

    await userEvent.click(await screen.findByLabelText('Favorite'))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(detail)
    expect(screen.getByLabelText('Favorite')).toBeChecked()
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
      // The type rides along so the server enriches from the source the
      // picker actually searched.
      type: 'game',
      external_source: 'igdb',
      external_id: '222',
    })
    expect(String(refresh[0])).toContain('/refresh-metadata')
    expect(refresh[1].method).toBe('POST')
  })

  it('sends the type with the link so the server enriches from the right source', async () => {
    // refresh-metadata picks its adapter from the item's stored type, while
    // the picker searched using the form's. Send only the link and those can
    // disagree: pick a film from TMDB on a row still stored as a game, and the
    // server hands a TMDB id to IGDB and writes whatever game has that number.
    const mock = stubApi()
    renderPage()

    await userEvent.selectOptions(await screen.findByLabelText('Type'), 'movie')
    await userEvent.type(screen.getByLabelText(/look up/i), 'Star Fox')
    await userEvent.click(
      await screen.findByRole('button', { name: /Star Fox/ }),
    )

    await waitFor(() => expect(writeCalls(mock)).toHaveLength(2))
    expect(JSON.parse(writeCalls(mock)[0][1].body).type).toBe('movie')
  })

  it('keeps unsaved edits when re-linking', async () => {
    // Noticing the cover is wrong halfway through correcting a title must not
    // cost the title. The refresh route already refuses to cause that loss
    // server-side; rebuilding the form from its response would reintroduce it.
    stubApi()
    renderPage()

    const title = await screen.findByLabelText('Title')
    await userEvent.clear(title)
    await userEvent.type(title, 'Star Fox 64')

    await userEvent.type(screen.getByLabelText(/look up/i), 'Star Fox')
    await userEvent.click(
      await screen.findByRole('button', { name: /Star Fox/ }),
    )

    await waitFor(() =>
      expect(screen.getByLabelText('Title')).toHaveValue('Star Fox 64'),
    )
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
      await screen.findByText(/linked, but the metadata couldn’t be fetched/i),
    ).toBeInTheDocument()
  })

  it('says so when the item does not exist', async () => {
    // A blank form for a missing id would look like an item with no data.
    stubApi({ status: 404 })
    renderPage()

    expect(await screen.findByText(/no item with that id/i)).toBeInTheDocument()
  })
})

describe('AdminItem copy fields', () => {
  it('sends only the copy fields that changed, as the API expects them', async () => {
    const mock = stubApi()
    renderPage()

    await userEvent.selectOptions(
      await screen.findByLabelText('Platform'),
      'Nintendo Switch 2',
    )
    await userEvent.selectOptions(
      screen.getByLabelText('Copy format'),
      'game_card',
    )
    await userEvent.type(screen.getByLabelText('Region'), 'eur')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      const [, options] = writeCalls(mock)[0]
      expect(JSON.parse(options.body)).toEqual({
        platform_id: 508,
        physical_format: 'game_card',
        region: 'eur',
      })
    })
  })

  it('shows a refused rule in words and keeps what was typed', async () => {
    const detail = 'That cart ID does not look like LX-XXXXX-XXX-X.'
    stubApi({
      onWrite: () => ({
        ok: false,
        status: 422,
        json: async () => ({ detail }),
      }),
    })
    renderPage()

    await userEvent.type(await screen.findByLabelText('Cart ID'), 'nope')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(detail)
    expect(screen.getByLabelText('Cart ID')).toHaveValue('nope')
  })

  it('offers completeness only for a cartridge-era platform', async () => {
    stubApi()
    renderPage()

    const platform = await screen.findByLabelText('Platform')
    expect(screen.queryByLabelText('Completeness')).not.toBeInTheDocument()

    await userEvent.selectOptions(platform, 'Nintendo 64')
    expect(screen.getByLabelText('Completeness')).toBeInTheDocument()
  })

  it('edits the acquired and release dates', async () => {
    const mock = stubApi()
    renderPage()

    const acquired = await screen.findByLabelText('Acquired')
    await userEvent.type(acquired, '2025-12-25')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(JSON.parse(writeCalls(mock)[0][1].body)).toEqual({
        acquired_at: '2025-12-25',
      }),
    )
    expect(screen.getByLabelText('Release date')).toBeInTheDocument()
  })
})

describe('AdminItem Play Next controls', () => {
  it('offers Restore only when Play Next excludes the item', async () => {
    stubApi({ item: { ...ITEM, play_next_excluded: false } })
    renderPage()
    await screen.findByDisplayValue('Star Fox')

    expect(
      screen.queryByRole('button', { name: 'Restore' }),
    ).not.toBeInTheDocument()
  })

  it('restores an excluded item and shows it restored', async () => {
    let excluded = true
    const mock = stubApi()
    // Every GET answers with the current exclusion state.
    mock.mockImplementation(async (url, options = {}) => {
      const method = options.method ?? 'GET'
      if (method === 'GET') {
        return {
          ok: true,
          status: 200,
          json: async () => ({ ...ITEM, play_next_excluded: excluded }),
        }
      }
      excluded = false
      return { ok: true, status: 204, json: async () => ({}) }
    })
    renderPage()

    expect(
      await screen.findByText('Excluded from Play Next.'),
    ).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Restore' }))

    await waitFor(() =>
      expect(
        screen.queryByText('Excluded from Play Next.'),
      ).not.toBeInTheDocument(),
    )
    const [url, options] = writeCalls(mock)[0]
    expect(String(url)).toContain('/api/picker/events/abc/never')
    expect(options.method).toBe('DELETE')
  })

  it('pins the item as Up next and reflects the result', async () => {
    const mock = stubApi()
    mock.mockImplementation(async (url, options = {}) => {
      const method = options.method ?? 'GET'
      if (method === 'GET') {
        return { ok: true, status: 200, json: async () => ITEM }
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          ...ITEM,
          pinned_at: '2026-09-23T20:00:00Z',
          status: 'active',
        }),
      }
    })
    renderPage()

    await userEvent.click(
      await screen.findByRole('button', { name: 'Pin as Up next' }),
    )

    expect(
      await screen.findByRole('button', { name: 'Unpin' }),
    ).toBeInTheDocument()
    const [url, options] = writeCalls(mock)[0]
    expect(String(url)).toContain('/api/items/abc/pin')
    expect(options.method).toBe('POST')
    // The pin moved the game to Playing, and the form shows it.
    expect(screen.getByLabelText('Status')).toHaveValue('active')
  })

  it('unpins a pinned item', async () => {
    const pinned = { ...ITEM, pinned_at: '2026-09-23T20:00:00Z' }
    const mock = stubApi({ item: pinned })
    mock.mockImplementation(async (url, options = {}) => {
      const method = options.method ?? 'GET'
      return {
        ok: true,
        status: 200,
        json: async () =>
          method === 'GET' ? pinned : { ...ITEM, pinned_at: null },
      }
    })
    renderPage()

    await userEvent.click(await screen.findByRole('button', { name: 'Unpin' }))

    expect(
      await screen.findByRole('button', { name: 'Pin as Up next' }),
    ).toBeInTheDocument()
    expect(writeCalls(mock)[0][1].method).toBe('DELETE')
  })
})

describe('AdminItem edits made while a pin is in flight', () => {
  // A cold start can hold the pin request for thirty seconds; anything typed
  // meanwhile must survive the server's answer.
  it('keeps them', async () => {
    let answer
    const mock = stubApi()
    mock.mockImplementation(async (url, options = {}) => {
      const method = options.method ?? 'GET'
      if (method === 'GET') {
        return { ok: true, status: 200, json: async () => ITEM }
      }
      return new Promise((resolve) => {
        answer = () =>
          resolve({
            ok: true,
            status: 200,
            json: async () => ({ ...ITEM, pinned_at: '2026-09-23T20:00:00Z' }),
          })
      })
    })
    renderPage()

    await userEvent.click(
      await screen.findByRole('button', { name: 'Pin as Up next' }),
    )
    await userEvent.type(screen.getByLabelText('Rating'), '8')
    answer()

    expect(
      await screen.findByRole('button', { name: 'Unpin' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Rating')).toHaveValue(8)
  })
})

describe('AdminItem edits made while a re-link is in flight', () => {
  // The refresh re-fetches from the metadata source on a free-tier backend,
  // which can hold it for thirty seconds; anything typed meanwhile must
  // survive the server's answer, whichever way it goes.

  /** Links at once, then holds the refresh until `answer` is called. */
  function stubHeldRefresh(refreshResponse) {
    let answer
    const mock = stubApi()
    mock.mockImplementation(async (url, options = {}) => {
      const method = options.method ?? 'GET'
      if (method === 'GET' && String(url).includes('search-metadata')) {
        return { ok: true, status: 200, json: async () => [CANDIDATE] }
      }
      if (method === 'GET') {
        return { ok: true, status: 200, json: async () => ITEM }
      }
      if (String(url).includes('refresh-metadata')) {
        return new Promise((resolve) => {
          answer = () => resolve(refreshResponse)
        })
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ ...ITEM, ...JSON.parse(options.body) }),
      }
    })
    return () => answer()
  }

  async function relinkThenRate() {
    await userEvent.type(await screen.findByLabelText(/look up/i), 'Star Fox')
    await userEvent.click(
      await screen.findByRole('button', { name: /Star Fox/ }),
    )
    await screen.findByText('Re-linking…')
    await userEvent.type(screen.getByLabelText('Rating'), '8')
  }

  it('keeps them when the refresh succeeds', async () => {
    const answer = stubHeldRefresh({
      ok: true,
      status: 200,
      json: async () => ({ ...ITEM, external_id: '222', year: 2026 }),
    })
    renderPage()

    await relinkThenRate()
    answer()

    expect(await screen.findByText('Saved.')).toBeInTheDocument()
    // The refreshed record landed, and the rating typed meanwhile survived it.
    expect(screen.getByLabelText('Year')).toHaveValue(2026)
    expect(screen.getByLabelText('Rating')).toHaveValue(8)
  })

  it('keeps them when the link lands but the refresh fails', async () => {
    const answer = stubHeldRefresh({
      ok: false,
      status: 502,
      json: async () => ({}),
    })
    renderPage()

    await relinkThenRate()
    answer()

    expect(
      await screen.findByText(/linked, but the metadata couldn’t be fetched/i),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Rating')).toHaveValue(8)
  })
})

describe('the registry line', () => {
  const SWITCH_2_ITEM = {
    ...ITEM,
    platform_id: 508,
    platform: 'Nintendo Switch 2',
    physical_format: 'game_card',
    format_source: 'manual',
    cart_id: null,
    region: null,
  }
  const EDITION = {
    id: 'e-1',
    region: 'USA',
    physical_format: 'game_key_card',
    format_words: 'Game-Key Card',
    cart_id: 'LP-AAC4B-USA-0',
  }
  const DISAGREES = {
    edition: EDITION,
    agrees: false,
    note:
      'r/NSCollectors lists the USA edition as Game-Key Card (LP-AAC4B-USA-0); ' +
      'you recorded full game on cartridge (manual)',
  }
  const AGREES = {
    edition: EDITION,
    agrees: true,
    note: 'Registry agrees: Game-Key Card (USA)',
  }

  /** The item, its registry note (a function of the saved item), and PATCH. */
  function stubRegistry({ item = SWITCH_2_ITEM, noteFor, patch } = {}) {
    let saved = item
    const mock = vi.fn(async (url, options = {}) => {
      const path = String(url)
      const method = options.method ?? 'GET'
      if (path.endsWith('/registry')) {
        return { ok: true, status: 200, json: async () => noteFor(saved) }
      }
      if (method === 'PATCH') {
        const answer = patch?.(JSON.parse(options.body))
        if (answer) return answer
        saved = {
          ...saved,
          physical_format: 'game_key_card',
          format_source: 'registry',
        }
        return { ok: true, status: 200, json: async () => saved }
      }
      return { ok: true, status: 200, json: async () => saved }
    })
    vi.stubGlobal('fetch', mock)
    return mock
  }

  it('says when the registry agrees', async () => {
    stubRegistry({ noteFor: () => AGREES })
    renderPage()
    expect(
      await screen.findByText('Registry agrees: Game-Key Card (USA)'),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Use registry value' }),
    ).not.toBeInTheDocument()
  })

  it('offers the registry value and turns into agreement', async () => {
    const mock = stubRegistry({
      noteFor: (saved) =>
        saved.format_source === 'registry' ? AGREES : DISAGREES,
    })
    renderPage()
    expect(await screen.findByText(DISAGREES.note)).toBeInTheDocument()
    await userEvent.click(
      screen.getByRole('button', { name: 'Use registry value' }),
    )
    expect(
      await screen.findByText('Registry agrees: Game-Key Card (USA)'),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Copy format')).toHaveValue('game_key_card')
    const [, patch] = writeCalls(mock)[0]
    expect(JSON.parse(patch.body)).toEqual({ edition_id: 'e-1' })
  })

  it('says a refused adopt in words', async () => {
    stubRegistry({
      noteFor: () => DISAGREES,
      patch: () => ({
        ok: false,
        status: 422,
        json: async () => ({
          detail: "This copy's cart ID LP-AAC4B-USA-0 decides its format",
        }),
      }),
    })
    renderPage()
    await userEvent.click(
      await screen.findByRole('button', { name: 'Use registry value' }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "This copy's cart ID LP-AAC4B-USA-0 decides its format",
    )
  })

  it('says a copy is not in the registry', async () => {
    stubRegistry({
      noteFor: () => ({
        edition: null,
        agrees: null,
        note: 'Not in the registry',
      }),
    })
    renderPage()
    expect(await screen.findByText('Not in the registry')).toBeInTheDocument()
  })

  it('is absent for other platforms', async () => {
    const mock = stubRegistry({
      item: { ...SWITCH_2_ITEM, platform_id: 130, platform: 'Nintendo Switch' },
      noteFor: () => AGREES,
    })
    renderPage()
    expect(await screen.findByDisplayValue('Star Fox')).toBeInTheDocument()
    expect(
      mock.mock.calls.some(([url]) => String(url).endsWith('/registry')),
    ).toBe(false)
  })
})

describe('AdminItem comic fields', () => {
  const COMIC = {
    ...ITEM,
    type: 'comic',
    title: 'Saga',
    external_source: 'comicvine',
    external_id: '49901',
    issues_owned: '1–54',
    editions: [{ kind: 'Trade', label: 'Vol. 1', from: 1, to: 6 }],
    read_to: 40,
    shelf_format: 'singles',
    following: true,
    comic_run: { owned: 54, released: 72 },
  }

  it('shows the run in place of the copy fields', async () => {
    stubApi({ item: COMIC })
    renderPage()
    expect(await screen.findByLabelText('Single issues I own')).toHaveValue(
      '1–54',
    )
    expect(screen.getByLabelText('Label, Vol. 1')).toHaveValue('Vol. 1')
    expect(screen.getByLabelText('From issue, Vol. 1')).toHaveValue('1')
    expect(screen.getByText(/Comic Vine lists 72 out/)).toBeInTheDocument()
    expect(screen.queryByLabelText('Cart ID')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Platform')).not.toBeInTheDocument()
    // The run card leads, with the private Skipped field under it.
    expect(screen.getByRole('heading', { name: /^The run/ })).toHaveTextContent(
      '54 of 72 · 18 missing',
    )
    expect(screen.getByLabelText(/^Skipped/)).toHaveValue('')
  })

  it('sends only the comic fields that changed', async () => {
    const mock = stubApi({ item: COMIC })
    renderPage()
    const issues = await screen.findByLabelText('Single issues I own')
    await userEvent.clear(issues)
    await userEvent.type(issues, '1-54, 60')
    await userEvent.click(
      screen.getByRole('button', { name: 'Add an edition' }),
    )
    await userEvent.type(screen.getByLabelText('Kind, edition 2'), 'Trade')
    await userEvent.type(screen.getByLabelText('Label, edition 2'), 'Vol. 2')
    await userEvent.type(screen.getByLabelText('From issue, Vol. 2'), '7')
    await userEvent.type(screen.getByLabelText('To issue, Vol. 2'), '12')
    await userEvent.click(screen.getByRole('button', { name: /save/i }))
    await waitFor(() => expect(writeCalls(mock)).toHaveLength(1))
    expect(JSON.parse(writeCalls(mock)[0][1].body)).toEqual({
      issues_owned: '1-54, 60',
      editions: [
        { kind: 'Trade', label: 'Vol. 1', from: 1, to: 6 },
        { kind: 'Trade', label: 'Vol. 2', from: 7, to: 12 },
      ],
    })
  })

  it('removes an edition row', async () => {
    const mock = stubApi({ item: COMIC })
    renderPage()
    await userEvent.click(
      await screen.findByRole('button', { name: 'Remove Vol. 1' }),
    )
    await userEvent.click(screen.getByRole('button', { name: /save/i }))
    await waitFor(() => expect(writeCalls(mock)).toHaveLength(1))
    expect(JSON.parse(writeCalls(mock)[0][1].body)).toEqual({ editions: null })
  })

  it('stops on an edition row it cannot read, sending nothing', async () => {
    const mock = stubApi({ item: COMIC })
    renderPage()
    await userEvent.click(
      await screen.findByRole('button', { name: 'Add an edition' }),
    )
    await userEvent.type(screen.getByLabelText('Label, edition 2'), 'Vol. 2')
    await userEvent.click(screen.getByRole('button', { name: /save/i }))
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Edition 2: give it a kind, a label and the issues it collects.',
    )
    expect(writeCalls(mock)).toHaveLength(0)
  })

  it('shows the API’s range error beside its field and keeps what was typed (AC13)', async () => {
    stubApi({
      item: COMIC,
      onWrite: () => ({
        ok: false,
        status: 422,
        json: async () => ({ detail: 'Issues owned: “5–2” runs backwards' }),
      }),
    })
    renderPage()
    const issues = await screen.findByLabelText('Single issues I own')
    await userEvent.clear(issues)
    await userEvent.type(issues, '5-2')
    await userEvent.click(screen.getByRole('button', { name: /save/i }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Issues owned: “5–2” runs backwards')
    expect(alert.id).toBe('comic-issues_owned-error')
    expect(issues).toHaveAttribute('aria-invalid', 'true')
    expect(issues).toHaveValue('5-2')
  })

  it('owns a missing issue on a tap and redraws before Save (AC10)', async () => {
    stubApi({ item: COMIC })
    renderPage()
    const box = await screen.findByRole('group', { name: 'Issues' })
    // 55–72 is one bundle of missing issues until it is opened.
    await userEvent.click(
      within(box).getByRole('button', { name: /^Issues 55 to 72, 18 missing/ }),
    )
    await userEvent.click(
      within(box).getByRole('button', { name: 'Issue 60, Missing' }),
    )
    expect(screen.getByLabelText('Single issues I own')).toHaveValue('1-54, 60')
    expect(
      within(box).getByRole('button', { name: 'Issue 60, Owned, unread' }),
    ).toHaveFocus()
    expect(screen.getByRole('heading', { name: /^The run/ })).toHaveTextContent(
      '55 of 72 · 17 missing',
    )
  })

  it('moves Read to here, and back one on the current marker', async () => {
    stubApi({ item: { ...COMIC, issues_owned: '7–20', read_to: 9 } })
    renderPage()
    await userEvent.click(
      await screen.findByRole('button', { name: 'Read to here' }),
    )
    const box = screen.getByRole('group', { name: 'Issues' })
    await userEvent.click(
      within(box).getByRole('button', { name: 'Issue 9, Read' }),
    )
    expect(screen.getByLabelText('Read to')).toHaveValue(8)
  })

  it('skips only an issue not held, dashed and in its lane (AC11, AC12)', async () => {
    stubApi({ item: COMIC })
    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: 'Skip' }))
    const box = screen.getByRole('group', { name: 'Issues' })
    // A book is never a button: editions are edited as rows.
    expect(within(box).queryByRole('button', { name: /Vol\. 1/ })).toBeNull()
    await userEvent.click(
      within(box).getByRole('button', { name: /^Issues 41 to 54, 14 unread/ }),
    )
    await userEvent.click(
      within(box).getByRole('button', { name: 'Issue 41, Owned, unread' }),
    )
    expect(screen.getByLabelText(/^Skipped/)).toHaveValue('')
    await userEvent.click(
      within(box).getByRole('button', { name: /^Issues 55 to 72/ }),
    )
    await userEvent.click(
      within(box).getByRole('button', { name: 'Issue 58, Missing' }),
    )
    expect(screen.getByLabelText(/^Skipped/)).toHaveValue('58')
    expect(
      within(box).getByRole('button', { name: 'Issue 58, Skipped' }),
    ).toHaveAttribute('data-k', 'skip')
    expect(
      screen.getByRole('img', { name: /^54 of 72 issues owned/ }),
    ).toHaveTextContent('Skipped private')
  })

  it('refreshes from Comic Vine, then reads the item again', async () => {
    const mock = stubApi({ item: COMIC })
    renderPage()
    await userEvent.click(
      await screen.findByRole('button', { name: 'Refresh from Comic Vine' }),
    )
    await waitFor(() =>
      expect(writeCalls(mock).map(([url]) => String(url))).toEqual([
        expect.stringMatching(/\/api\/comics\/abc\/refresh$/),
      ]),
    )
    await waitFor(() =>
      expect(
        mock.mock.calls.filter(
          ([url, options]) =>
            !options?.method && /\/api\/items\/abc$/.test(String(url)),
        ),
      ).toHaveLength(2),
    )
  })

  it('keeps an edition row typed before the refresh lands', async () => {
    const mock = stubApi({ item: COMIC })
    renderPage()
    await userEvent.click(
      await screen.findByRole('button', { name: 'Add an edition' }),
    )
    await userEvent.type(screen.getByLabelText('Label, edition 2'), 'Vol. 2')
    await userEvent.click(
      screen.getByRole('button', { name: 'Refresh from Comic Vine' }),
    )
    await waitFor(() =>
      expect(
        mock.mock.calls.filter(
          ([url, options]) =>
            !options?.method && /\/api\/items\/abc$/.test(String(url)),
        ),
      ).toHaveLength(2),
    )
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Refresh from Comic Vine' }),
      ).toBeEnabled(),
    )
    expect(screen.getByLabelText('Label, Vol. 2')).toHaveValue('Vol. 2')
  })

  it('links a saved edition to Comic Vine and shows the stored link', async () => {
    const linked = [{ ...COMIC.editions[0], cv_id: 4242 }]
    const base = stubApi({ item: COMIC })
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url, options = {}) => {
        const path = String(url)
        if (path.includes('/api/comics/issues/search')) {
          return {
            ok: true,
            status: 200,
            json: async () => [
              { cv_id: 4242, volume_name: 'Saga', number: '1', name: null },
            ],
          }
        }
        if (path.endsWith('/editions/ed-1-6/link')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ item_id: 'abc', editions: linked }),
          }
        }
        return base(url, options)
      }),
    )
    renderPage()
    await userEvent.click(
      await screen.findByRole('button', {
        name: 'Link to Comic Vine, Vol. 1',
      }),
    )
    await userEvent.type(screen.getByLabelText('Search Comic Vine'), 'saga')
    await userEvent.click(
      await screen.findByRole('button', { name: /Saga #1/ }),
    )
    expect(
      await screen.findByText('Linked to Comic Vine (issue 4242)'),
    ).toBeInTheDocument()
  })

  it('shows an existing link and disables the control on an unsaved row', async () => {
    stubApi({
      item: {
        ...COMIC,
        editions: [{ ...COMIC.editions[0], cv_id: 4242 }],
      },
    })
    renderPage()
    expect(
      await screen.findByText('Linked to Comic Vine (issue 4242)'),
    ).toBeInTheDocument()
    await userEvent.click(
      screen.getByRole('button', { name: 'Add an edition' }),
    )
    await userEvent.type(screen.getByLabelText('From issue, edition 2'), '7')
    await userEvent.type(screen.getByLabelText('To issue, edition 2'), '12')
    const buttons = screen.getAllByRole('button', {
      name: /Link to Comic Vine/,
    })
    expect(buttons[0]).toBeEnabled()
    expect(buttons[1]).toBeDisabled()
    expect(
      screen.getByText('Save the edition before linking it.'),
    ).toBeInTheDocument()
  })

  it('offers no Comic Vine refresh on a game', async () => {
    stubApi()
    renderPage()
    await screen.findByDisplayValue('Star Fox')
    expect(
      screen.queryByRole('button', { name: 'Refresh from Comic Vine' }),
    ).not.toBeInTheDocument()
  })
})

describe('AdminItem playthroughs', () => {
  const REPLAYED = {
    ...ITEM,
    status: 'finished',
    times_completed: 2,
    playthroughs: [
      {
        number: 1,
        started_on: '2024-03-01',
        finished_on: '2024-03-20',
        paused_on: null,
        outcome: 'finished',
        journal_days: 0,
        journal_minutes: 0,
      },
      {
        number: 2,
        started_on: '2026-10-03',
        finished_on: '2026-10-19',
        paused_on: null,
        outcome: 'finished',
        journal_days: 6,
        journal_minutes: 660,
      },
    ],
  }

  it('moves the status through the status route, naming Replay', async () => {
    const mock = stubApi({ item: REPLAYED })
    renderPage()

    await userEvent.selectOptions(
      await screen.findByLabelText('Status'),
      screen.getByRole('option', { name: 'Replay, starts playthrough 3' }),
    )

    await waitFor(() => {
      const [url, options] = writeCalls(mock)[0]
      expect(String(url)).toMatch(/\/api\/items\/abc\/status$/)
      expect(options.method).toBe('POST')
      expect(JSON.parse(options.body).status).toBe('active')
    })
  })

  it('no longer edits status, dates or completions in the form', async () => {
    stubApi({ item: REPLAYED })
    renderPage()
    await screen.findByDisplayValue('Star Fox')

    expect(screen.queryByLabelText('Times completed')).toBeNull()
    expect(screen.queryByLabelText('Started')).toBeNull()
    expect(screen.queryByLabelText('Finished')).toBeNull()
  })

  it('lists every run with its journal', async () => {
    stubApi({ item: REPLAYED })
    renderPage()

    expect(await screen.findByText('6 days · 11 h')).toBeInTheDocument()
    expect(screen.getByLabelText('Finished, playthrough 1')).toHaveValue(
      '2024-03-20',
    )
  })

  it('saves a corrected date for one run only', async () => {
    const mock = stubApi({ item: REPLAYED })
    renderPage()

    const input = await screen.findByLabelText('Started, playthrough 1')
    await userEvent.clear(input)
    await userEvent.type(input, '2024-02-28')
    await userEvent.click(
      screen.getByRole('button', { name: 'Save playthrough 1' }),
    )

    await waitFor(() => {
      const [url, options] = writeCalls(mock)[0]
      expect(String(url)).toMatch(/\/api\/items\/abc\/playthroughs\/1$/)
      expect(options.method).toBe('PATCH')
      expect(JSON.parse(options.body)).toEqual({ started_on: '2024-02-28' })
    })
  })

  it('deletes a closed run', async () => {
    const mock = stubApi({ item: REPLAYED })
    renderPage()

    await userEvent.click(
      await screen.findByRole('button', { name: 'Delete playthrough 2' }),
    )

    await waitFor(() => {
      const [url, options] = writeCalls(mock)[0]
      expect(String(url)).toMatch(/\/api\/items\/abc\/playthroughs\/2$/)
      expect(options.method).toBe('DELETE')
    })
  })

  it('adds a past playthrough', async () => {
    const mock = stubApi({ item: REPLAYED })
    renderPage()

    await userEvent.click(
      await screen.findByRole('button', { name: 'Add a past playthrough' }),
    )
    const group = screen.getByRole('group', { name: 'Past playthrough' })
    const [started, finished] = group.querySelectorAll('input')
    await userEvent.type(started, '2020-01-01')
    await userEvent.type(finished, '2020-02-01')
    await userEvent.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(() => {
      const [url, options] = writeCalls(mock)[0]
      expect(String(url)).toMatch(/\/api\/items\/abc\/playthroughs$/)
      expect(options.method).toBe('POST')
      expect(JSON.parse(options.body)).toEqual({
        started_on: '2020-01-01',
        finished_on: '2020-02-01',
      })
    })
  })

  it('shows the server’s reason when a move is refused', async () => {
    stubApi({
      item: REPLAYED,
      onWrite: () => ({
        ok: false,
        status: 422,
        json: async () => ({ detail: 'That date is too far from today.' }),
      }),
    })
    renderPage()

    await userEvent.selectOptions(
      await screen.findByLabelText('Status'),
      'backlog',
    )

    expect(
      await screen.findByText('That date is too far from today.'),
    ).toBeInTheDocument()
  })
})
