import '@testing-library/jest-dom'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Outlet, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AdminStoreList, {
  addDays,
  buildList,
  isoDay,
  radarSection,
} from './AdminStoreList.jsx'

const TODAY = new Date(2026, 9, 4) // 4 October 2026, local time

function row(id, fields = {}) {
  return {
    id,
    title: `Game ${id}`,
    platform: 'Nintendo Switch 2',
    physical_format: 'game_card',
    release_date: '2026-09-01',
    reasons: [`Reason ${id}`],
    score: 50,
    format_note: null,
    lane: 'dated',
    ...fields,
  }
}

describe('radarSection', () => {
  it('puts a released cartridge under its console', () => {
    expect(radarSection(row('a'), TODAY)).toBe('switch2')
    expect(radarSection(row('b', { platform: 'Nintendo Switch' }), TODAY)).toBe(
      'switch',
    )
    expect(radarSection(row('c', { release_date: '2026-10-04' }), TODAY)).toBe(
      'switch2',
    )
  })

  it('asks about cartridges due within 90 days and leaves later ones off', () => {
    expect(radarSection(row('a', { release_date: '2026-10-05' }), TODAY)).toBe(
      'preorder',
    )
    expect(radarSection(row('b', { release_date: '2027-01-02' }), TODAY)).toBe(
      'preorder',
    )
    expect(
      radarSection(row('c', { release_date: '2027-01-03' }), TODAY),
    ).toBeNull()
    expect(radarSection(row('d', { release_date: null }), TODAY)).toBeNull()
  })

  it('sends key cards, codes in a box and digital-only games to Skip', () => {
    expect(
      radarSection(row('a', { physical_format: 'game_key_card' }), TODAY),
    ).toBe('skip')
    expect(
      radarSection(row('b', { physical_format: 'code_in_box' }), TODAY),
    ).toBe('skip')
    expect(
      radarSection(row('c', { physical_format: null, lane: 'digital' }), TODAY),
    ).toBe('skip')
  })

  it('leaves off a physical game whose format is unknown', () => {
    expect(radarSection(row('a', { physical_format: null }), TODAY)).toBeNull()
  })
})

describe('buildList', () => {
  it('orders Top picks by score and shows each game once', () => {
    const discover = {
      picks: [row('d1', { score: 40 }), row('d2', { score: 90 })],
    }
    const radar = {
      sections: {
        suggested: [row('r1', { title: 'Game d1' })],
        dated_later: [],
        digital: [],
      },
    }
    const list = buildList(discover, radar, TODAY)
    expect(list.top.map((entry) => entry.id)).toEqual(['d2', 'd1'])
    expect(list.switch2).toEqual([])
  })

  it('orders pre-orders soonest first', () => {
    const radar = {
      sections: {
        suggested: [
          row('late', { release_date: '2026-12-01', score: 90 }),
          row('soon', { release_date: '2026-10-10', score: 10 }),
        ],
        dated_later: [],
        digital: [],
      },
    }
    expect(
      buildList({ picks: [] }, radar, TODAY).preorder.map((entry) => entry.id),
    ).toEqual(['soon', 'late'])
  })
})

const PAST = isoDay(addDays(new Date(), -30))
const SOON = isoDay(addDays(new Date(), 10))

const DISCOVER = {
  picks: [
    row('d1', {
      title: 'Omori',
      platform: 'Nintendo Switch',
      reasons: ['Because you rated Hades 10'],
      score: 80,
      lane: null,
    }),
  ],
}

const RADAR = {
  sections: {
    suggested: [
      row('r1', { title: 'Out Now Two', release_date: PAST, score: 70 }),
      row('r2', {
        title: 'Soon Cart',
        release_date: SOON,
        lane: 'preorder',
        reasons: ['Pre-order closes soon'],
      }),
    ],
    dated_later: [
      row('r3', {
        title: 'Old Cart',
        platform: 'Nintendo Switch',
        release_date: PAST,
      }),
      row('r4', {
        title: 'Key Card Game',
        physical_format: 'game_key_card',
        release_date: PAST,
        reasons: [],
        format_note: 'Full game on cartridge in EUR — Super Rare',
      }),
    ],
    digital: [
      row('r5', {
        title: 'Digital Only',
        physical_format: null,
        lane: 'digital',
        release_date: SOON,
      }),
    ],
  },
}

function json(body, status = 200) {
  return { ok: status < 300, status, json: async () => body }
}

/** Answers by method and path (query included); `handlers` override. */
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
      if (path === '/api/recommendations?kind=discover') return json(DISCOVER)
      if (path === '/api/recommendations?kind=radar') return json(RADAR)
      return json({}, 404)
    }),
  )
  return calls
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/admin/store-list']}>
      <Routes>
        <Route element={<Outlet context={{ signedIn: true }} />}>
          <Route path="admin/store-list" element={<AdminStoreList />} />
          <Route path="admin" element={<p>Admin home</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('AdminStoreList', () => {
  it('shows the five sections in order under the Game-Key Card note', async () => {
    stubApi()
    renderPage()
    const top = await screen.findByRole('region', { name: 'Top picks' })
    expect(
      screen.getByText('On Switch 2 boxes, put back Game-Key Cards.'),
    ).toBeInTheDocument()
    expect(
      screen
        .getAllByRole('heading', { level: 2 })
        .map((heading) => heading.textContent),
    ).toEqual([
      'Top picks',
      'Out now on Switch 2',
      'Out now on Switch',
      'Ask about pre-orders',
      'Skip in store',
    ])
    expect(within(top).getByText('Omori')).toBeInTheDocument()
    expect(
      within(top).getByText('Nintendo Switch · Full game on cartridge'),
    ).toBeInTheDocument()
    expect(
      within(top).getByText('Because you rated Hades 10'),
    ).toBeInTheDocument()
    const region = (name) => screen.getByRole('region', { name })
    expect(
      within(region('Out now on Switch 2')).getByText('Out Now Two'),
    ).toBeInTheDocument()
    expect(
      within(region('Out now on Switch')).getByText('Old Cart'),
    ).toBeInTheDocument()
    expect(
      within(region('Ask about pre-orders')).getByText(
        `Nintendo Switch 2 · Full game on cartridge · Out ${SOON}`,
      ),
    ).toBeInTheDocument()
    const skip = region('Skip in store')
    expect(within(skip).getByText('Key Card Game')).toBeInTheDocument()
    expect(
      within(skip).getByText('Full game on cartridge in EUR — Super Rare'),
    ).toBeInTheDocument()
    expect(
      within(skip).getByText('Nintendo Switch 2 · Digital only'),
    ).toBeInTheDocument()
    expect(document.title).toBe('Store list · Admin')
  })

  it('drops a row as soon as Got it is pressed and marks the game owned', async () => {
    let answer
    const calls = stubApi({
      'POST /api/recommendations/d1/own': () =>
        new Promise((resolve) => {
          answer = resolve
        }),
    })
    renderPage()
    await userEvent.click(
      await screen.findByRole('button', { name: 'Got it: Omori' }),
    )
    expect(screen.queryByText('Omori')).toBeNull()
    answer(json({ item_id: 'x' }, 201))
    expect(
      await screen.findByText('Added Omori to the collection'),
    ).toBeInTheDocument()
    expect(calls).toContainEqual({
      method: 'POST',
      path: '/api/recommendations/d1/own',
    })
  })

  it('brings the row back and says why when Got it fails', async () => {
    stubApi({
      'POST /api/recommendations/d1/own': () =>
        json({ detail: 'Database unavailable' }, 500),
    })
    renderPage()
    await userEvent.click(
      await screen.findByRole('button', { name: 'Got it: Omori' }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Database unavailable',
    )
    expect(screen.getByText('Omori')).toBeInTheDocument()
  })

  it('keeps an already-answered game off the list and names it', async () => {
    stubApi({
      'POST /api/recommendations/d1/own': () =>
        json({ detail: 'Already on your shelf' }, 409),
    })
    renderPage()
    await userEvent.click(
      await screen.findByRole('button', { name: 'Got it: Omori' }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Omori: Already on your shelf',
    )
    expect(screen.queryByText('Omori')).toBeNull()
  })

  it('points at Discover and Radar when there is nothing to show', async () => {
    stubApi({
      'GET /api/recommendations?kind=discover': () => json({ picks: [] }),
      'GET /api/recommendations?kind=radar': () =>
        json({ sections: { suggested: [], dated_later: [], digital: [] } }),
    })
    renderPage()
    expect(
      await screen.findByRole('link', { name: 'Discover' }),
    ).toHaveAttribute('href', '/admin/discover')
    expect(screen.getByRole('link', { name: 'Radar' })).toHaveAttribute(
      'href',
      '/admin/radar',
    )
  })

  it('asks for a sign-in when the API says 401', async () => {
    stubApi({
      'GET /api/recommendations?kind=discover': () => json({}, 401),
    })
    renderPage()
    expect(
      await screen.findByRole('link', { name: 'Sign in' }),
    ).toHaveAttribute('href', '/admin')
  })
})
