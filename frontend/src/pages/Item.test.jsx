import '@testing-library/jest-dom'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Outlet, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Item from './Item.jsx'

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
    <MemoryRouter initialEntries={[`/collection/${ID}`]}>
      <Routes>
        <Route element={<Outlet context={{ signedIn }} />}>
          <Route path="/collection/:id" element={<Item />} />
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

  it('shows the hero: blurred band, cover, title, year, creator, status in words', async () => {
    stubItem()
    await renderReady()

    const hero = document.querySelector('.item-hero')
    expect(hero.querySelector('.item-hero-backdrop')).toHaveAttribute(
      'src',
      DETAIL.cover_url,
    )
    expect(screen.getByText('2020 · Supergiant Games')).toBeInTheDocument()
    expect(screen.getByText('Finished · June 2026')).toBeInTheDocument()
  })

  it('falls back to a plain band and the placeholder without a cover', async () => {
    stubItem({ cover_url: null })
    await renderReady()

    expect(document.querySelector('.item-hero-backdrop')).toBeNull()
    expect(document.querySelector('.item-hero')).toHaveAttribute('data-empty')
    expect(document.querySelector('.cover-placeholder')).not.toBeNull()
  })

  it('names other statuses in words', async () => {
    stubItem({ status: 'active', finished_at: null })
    await renderReady()
    expect(screen.getByText('Playing')).toBeInTheDocument()
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
    ).toHaveAttribute('href', '/collection/a')
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
    expect(await screen.findByText(/could not be loaded/i)).toBeInTheDocument()
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
      <MemoryRouter initialEntries={[`/collection/${ID}`]}>
        <Routes>
          <Route path="/collection/:id" element={<Item />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Hades' }),
    ).toBeInTheDocument()
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

  it('orders the chips: own platform, genres, themes, other platforms, format, completeness', async () => {
    stubItem(COPY)
    await renderReady()

    expect(chips()).toEqual([
      ['Nintendo Switch', false],
      ['Roguelike', false],
      ['Action', false],
      ['Fantasy', true],
      ['PC', true],
      ['PlayStation 4', true],
      ['Full game on cartridge', false],
      ['Complete in box', false],
    ])
  })

  it.each([
    ['game_key_card', 'Game-Key Card'],
    ['code_in_box', 'Code in a box'],
    ['disc', 'Disc'],
  ])('names a %s copy', async (format, label) => {
    stubItem({ ...COPY, physical_format: format })
    await renderReady()
    expect(screen.getByText(label)).toBeInTheDocument()
  })

  it('says a Switch 2 copy with no recorded format is unrecorded', async () => {
    stubItem({ ...COPY, platform: 'Nintendo Switch 2', physical_format: null })
    await renderReady()
    expect(screen.getByText('Format not recorded')).toBeInTheDocument()
  })

  it('has no format chip for another platform with no format', async () => {
    stubItem({ ...COPY, physical_format: null, completeness: null })
    await renderReady()
    expect(chips().map(([text]) => text)).not.toContain('Format not recorded')
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
