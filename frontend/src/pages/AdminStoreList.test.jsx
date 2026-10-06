import '@testing-library/jest-dom'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Outlet, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AdminStoreList from './AdminStoreList.jsx'

function row(id, fields = {}) {
  return {
    id,
    title: `Game ${id}`,
    cover_url: null,
    igdb_url: `https://www.igdb.com/games/game-${id}`,
    release_date: '2026-09-01',
    release_precision: 'day',
    platform: 'Nintendo Switch 2',
    physical_format: 'game_card',
    format_note: null,
    reasons: [`Reason ${id}`],
    score: 50,
    status: 'pending',
    store_lines: [],
    hypes: null,
    lane: 'dated',
    top_pick: false,
    new: false,
    kind: 'radar',
    ...fields,
  }
}

const LIST = {
  generated_at: { radar: '2026-10-04T00:44:00Z', discover: null },
  catalogue: { stores_at: null, registry_at: null },
  sections: {
    buy_now: [
      row('a', { top_pick: true, kind: 'discover' }),
      row('b', { platform: 'Nintendo Switch' }),
    ],
    preorders: [row('c', { release_date: '2026-10-15' })],
    later: [],
    not_on_cartridge: [row('d', { physical_format: 'game_key_card' })],
  },
}

const EMPTY = {
  ...LIST,
  sections: { buy_now: [], preorders: [], later: [], not_on_cartridge: [] },
}

function json(body, status = 200) {
  return { ok: status < 300, status, json: async () => body }
}

/** Answers by method and path; `handlers` override. */
function stubApi(handlers = {}) {
  const calls = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url, options = {}) => {
      const path = String(url).replace(/^.*\/api/, '/api')
      const method = options.method ?? 'GET'
      calls.push({ method, path })
      const handler = handlers[`${method} ${path}`]
      if (handler) return handler(options)
      if (path === '/api/recommendations/store-list') return json(LIST)
      return json({}, 404)
    }),
  )
  return calls
}

function page(signedIn = true) {
  return (
    <MemoryRouter initialEntries={['/admin/store-list']}>
      <Routes>
        <Route element={<Outlet context={{ signedIn }} />}>
          <Route path="admin/store-list" element={<AdminStoreList />} />
          <Route path="admin" element={<p>Admin home</p>} />
        </Route>
      </Routes>
    </MemoryRouter>
  )
}

function renderPage() {
  return render(page())
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('AdminStoreList', () => {
  it('shows the non-empty server sections in order, Buy now by console', async () => {
    const calls = stubApi()
    renderPage()
    const buyNow = await screen.findByRole('region', { name: 'Buy now' })
    expect(
      screen.getByText('On Switch 2 boxes, put back Game-Key Cards.'),
    ).toBeInTheDocument()
    expect(
      screen
        .getAllByRole('heading', { level: 2 })
        .map((heading) => heading.textContent),
    ).toEqual(['Buy now', 'Pre-orders', 'Not on cartridge'])
    expect(
      within(buyNow)
        .getAllByRole('heading', { level: 3 })
        .map((heading) => heading.textContent),
    ).toEqual(['Nintendo Switch 2', 'Nintendo Switch'])
    expect(within(buyNow).getByText('Game a')).toBeInTheDocument()
    expect(within(buyNow).getByText('Top pick')).toBeInTheDocument()
    expect(within(buyNow).getByText('Reason a')).toBeInTheDocument()
    const preorders = screen.getByRole('region', { name: 'Pre-orders' })
    expect(
      within(preorders).getByText(
        /^Nintendo Switch 2 · Full game on cartridge · Out /,
      ),
    ).toBeInTheDocument()
    const skip = screen.getByRole('region', { name: 'Not on cartridge' })
    expect(within(skip).getByText('Game d')).toBeInTheDocument()
    expect(
      within(skip)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Not interested'])
    expect(
      within(buyNow)
        .getAllByRole('button')
        .map((button) => button.getAttribute('aria-label'))
        .slice(0, 3),
    ).toEqual(['Got it: Game a', 'Want: Game a', 'Not interested: Game a'])
    expect(calls).toEqual([
      { method: 'GET', path: '/api/recommendations/store-list' },
    ])
    expect(document.title).toBe('Store list · Admin')
  })

  it('drops a row as soon as Got it is pressed and marks the game owned', async () => {
    let answer
    const calls = stubApi({
      'POST /api/recommendations/a/own': () =>
        new Promise((resolve) => {
          answer = resolve
        }),
    })
    renderPage()
    await userEvent.click(
      await screen.findByRole('button', { name: 'Got it: Game a' }),
    )
    expect(screen.queryByText('Game a')).toBeNull()
    answer(json({ item_id: 'x' }, 201))
    expect(
      await screen.findByText('Added Game a to the collection'),
    ).toBeInTheDocument()
    expect(calls).toContainEqual({
      method: 'POST',
      path: '/api/recommendations/a/own',
    })
  })

  it('brings the row back and says why when Got it fails', async () => {
    stubApi({
      'POST /api/recommendations/a/own': () =>
        json({ detail: 'Database unavailable' }, 500),
    })
    renderPage()
    await userEvent.click(
      await screen.findByRole('button', { name: 'Got it: Game a' }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Database unavailable',
    )
    expect(screen.getByText('Game a')).toBeInTheDocument()
  })

  it('keeps an already-answered game off the list and names it', async () => {
    stubApi({
      'POST /api/recommendations/a/own': () =>
        json({ detail: 'Already on your shelf' }, 409),
    })
    renderPage()
    await userEvent.click(
      await screen.findByRole('button', { name: 'Got it: Game a' }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Game a: Already on your shelf',
    )
    expect(screen.queryByText('Game a')).toBeNull()
  })

  it('adds a game to the want list with Want', async () => {
    const calls = stubApi({
      'POST /api/recommendations/c/want': () => json({ item_id: 'x' }, 201),
    })
    renderPage()
    await userEvent.click(
      await screen.findByRole('button', { name: 'Want: Game c' }),
    )
    expect(screen.queryByText('Game c')).toBeNull()
    expect(
      await screen.findByText('Added Game c to the want list'),
    ).toBeInTheDocument()
    expect(calls).toContainEqual({
      method: 'POST',
      path: '/api/recommendations/c/want',
    })
    // The section had one row, so it goes with it.
    expect(screen.queryByRole('region', { name: 'Pre-orders' })).toBeNull()
  })

  it('drops a game with Not interested', async () => {
    const calls = stubApi({
      'POST /api/recommendations/d/dismiss': () => json({}, 200),
    })
    renderPage()
    await userEvent.click(
      await screen.findByRole('button', { name: 'Not interested: Game d' }),
    )
    expect(screen.queryByText('Game d')).toBeNull()
    expect(await screen.findByText('Dropped Game d')).toBeInTheDocument()
    expect(calls).toContainEqual({
      method: 'POST',
      path: '/api/recommendations/d/dismiss',
    })
  })

  it('keeps every button outside its row link', async () => {
    stubApi()
    const { container } = renderPage()
    await screen.findByRole('region', { name: 'Buy now' })
    const rows = container.querySelectorAll('.next-row')
    expect(rows).toHaveLength(4)
    for (const item of rows) {
      const link = item.querySelector('.next-row-link')
      expect(link).not.toBeNull()
      expect(link.tagName).toBe('A')
      expect(within(link).queryByRole('button')).toBeNull()
      expect(within(item).getAllByRole('button').length).toBeGreaterThan(0)
    }
  })

  it("moves focus to the next row's first action after an answer", async () => {
    stubApi({
      'POST /api/recommendations/a/own': () => json({ item_id: 'x' }, 201),
    })
    renderPage()
    await userEvent.click(
      await screen.findByRole('button', { name: 'Got it: Game a' }),
    )
    expect(screen.queryByText('Game a')).toBeNull()
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Got it: Game b' }),
    )
    await screen.findByText('Added Game a to the collection')
  })

  it('falls back to the row before when the answered row was the last', async () => {
    stubApi({
      'POST /api/recommendations/d/dismiss': () => json({}, 200),
    })
    renderPage()
    await userEvent.click(
      await screen.findByRole('button', { name: 'Not interested: Game d' }),
    )
    expect(screen.queryByText('Game d')).toBeNull()
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Got it: Game c' }),
    )
    await screen.findByText('Dropped Game d')
  })

  it('moves focus to the status line when no row is left', async () => {
    stubApi({
      'GET /api/recommendations/store-list': () =>
        json({
          ...LIST,
          sections: { ...EMPTY.sections, preorders: [row('c')] },
        }),
      'POST /api/recommendations/c/own': () => json({ item_id: 'x' }, 201),
    })
    renderPage()
    await userEvent.click(
      await screen.findByRole('button', { name: 'Got it: Game c' }),
    )
    expect(screen.queryByText('Game c')).toBeNull()
    expect(document.activeElement).toBe(screen.getByRole('status'))
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Added Game c to the collection',
    )
  })

  it('keeps focus on the next row when the answer fails and the row returns', async () => {
    stubApi({
      'POST /api/recommendations/a/own': () =>
        json({ detail: 'Database unavailable' }, 500),
    })
    renderPage()
    await userEvent.click(
      await screen.findByRole('button', { name: 'Got it: Game a' }),
    )
    await screen.findByRole('alert')
    expect(screen.getByText('Game a')).toBeInTheDocument()
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Got it: Game b' }),
    )
  })

  it('lists where to buy, with the price and any pre-order', async () => {
    stubApi({
      'GET /api/recommendations/store-list': () =>
        json({
          ...LIST,
          sections: {
            ...LIST.sections,
            buy_now: [
              row('a', {
                store_lines: [
                  {
                    store: 'Limited Run',
                    price: 59.99,
                    currency: 'USD',
                    availability: 'in_stock',
                    preorder_closes_at: null,
                    url: 'https://limitedrungames.com/a',
                  },
                  {
                    store: 'Play-Asia',
                    price: 79.5,
                    currency: 'CAD',
                    availability: 'preorder',
                    preorder_closes_at: null,
                    url: null,
                  },
                  {
                    store: 'Super Rare',
                    price: null,
                    currency: null,
                    availability: 'in_stock',
                    preorder_closes_at: null,
                    url: null,
                  },
                ],
              }),
            ],
          },
        }),
    })
    renderPage()
    const buyNow = await screen.findByRole('region', { name: 'Buy now' })
    const link = within(buyNow).getByRole('link', {
      name: 'Limited Run · $59.99',
    })
    expect(link).toHaveAttribute('href', 'https://limitedrungames.com/a')
    expect(link).toHaveAttribute('rel', 'noreferrer noopener')
    expect(
      within(buyNow).getByText('Play-Asia · 79.50 CAD · pre-order'),
    ).toBeInTheDocument()
    expect(within(buyNow).getByText('Super Rare')).toBeInTheDocument()
  })

  it("shows a row's format note, in store, whatever its reasons", async () => {
    const note = 'Full game on cartridge in EUR — Super Rare'
    stubApi({
      'GET /api/recommendations/store-list': () =>
        json({
          ...LIST,
          sections: {
            ...LIST.sections,
            preorders: [row('c', { format_note: 'Cartridge in Japan only' })],
            not_on_cartridge: [
              row('d', {
                physical_format: 'game_key_card',
                reasons: [],
                format_note: note,
              }),
            ],
          },
        }),
    })
    renderPage()
    const skip = await screen.findByRole('region', {
      name: 'Not on cartridge',
    })
    expect(within(skip).getByText(note)).toBeInTheDocument()
    const preorders = screen.getByRole('region', { name: 'Pre-orders' })
    expect(within(preorders).getByText('Reason c')).toBeInTheDocument()
    expect(
      within(preorders).getByText('Cartridge in Japan only'),
    ).toBeInTheDocument()
  })

  it('points at Discover and Radar when there is nothing to show', async () => {
    stubApi({
      'GET /api/recommendations/store-list': () => json(EMPTY),
    })
    renderPage()
    expect(
      await screen.findByRole('link', { name: 'Discover' }),
    ).toHaveAttribute('href', '/admin/discover')
    expect(screen.getByRole('link', { name: 'Radar' })).toHaveAttribute(
      'href',
      '/admin/radar',
    )
    expect(screen.queryByRole('heading', { level: 2 })).toBeNull()
    expect(screen.queryByText(/Game-Key Cards/)).toBeNull()
  })

  it('says why when the list cannot be read', async () => {
    stubApi({
      'GET /api/recommendations/store-list': () =>
        json({ detail: 'Database unavailable' }, 500),
    })
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Database unavailable',
    )
  })

  it('asks for a sign-in when the API says 401', async () => {
    stubApi({
      'GET /api/recommendations/store-list': () => json({}, 401),
    })
    renderPage()
    expect(
      await screen.findByRole('link', { name: 'Sign in' }),
    ).toHaveAttribute('href', '/admin')
  })

  it('drops a stale sign-in prompt while a new session refetches', async () => {
    stubApi({
      'GET /api/recommendations/store-list': () => json({}, 401),
    })
    const view = render(page(false))
    await screen.findByRole('link', { name: 'Sign in' })
    let answer
    const waiting = new Promise((resolve) => {
      answer = resolve
    })
    stubApi({
      'GET /api/recommendations/store-list': () => waiting,
    })
    view.rerender(page(true))
    expect(screen.getByText('Loading the list…')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Sign in' })).toBeNull()
    answer(json(LIST))
    expect(
      await screen.findByRole('heading', { name: 'Buy now' }),
    ).toBeInTheDocument()
  })
})
