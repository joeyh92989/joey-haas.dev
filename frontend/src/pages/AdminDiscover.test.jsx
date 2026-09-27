import '@testing-library/jest-dom'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Outlet, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AdminDiscover, { emptyWords, rankingWords } from './AdminDiscover.jsx'

function pick(id, fields = {}) {
  return {
    id,
    title: `Pick ${id}`,
    cover_url: null,
    release_date: '2021-09-23',
    release_precision: 'day',
    platform: 'Nintendo Switch',
    physical_format: 'game_card',
    format_note: null,
    reasons: [`Like Hades: Pick ${id}.`],
    score: 70,
    status: 'pending',
    store_lines: [],
    based_on_titles: ['Hades'],
    genres: ['Adventure'],
    buyable: false,
    ...fields,
  }
}

const DISCOVER = {
  generated_at: '2026-09-27T10:00:00Z',
  personalised: true,
  ranked_by: 'model',
  model_note: null,
  picks: [pick('a'), pick('b')],
}

function stubApi(handlers = {}, discover = DISCOVER) {
  const calls = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url, options = {}) => {
      const path = String(url).replace(/^.*\/api/, '/api')
      const method = options.method ?? 'GET'
      calls.push({ method, path, body: options.body })
      const handler = handlers[`${method} ${path.split('?')[0]}`]
      if (handler) return handler(options)
      if (path.startsWith('/api/recommendations?'))
        return { ok: true, status: 200, json: async () => discover }
      if (path.startsWith('/api/items?'))
        return { ok: true, status: 200, json: async () => [] }
      return { ok: true, status: 200, json: async () => ({}) }
    }),
  )
  return calls
}

function renderPage({ signedIn = true } = {}) {
  return render(
    <MemoryRouter initialEntries={['/admin/discover']}>
      <Routes>
        <Route element={<Outlet context={{ signedIn }} />}>
          <Route path="admin/discover" element={<AdminDiscover />} />
          <Route path="admin" element={<p>Admin home</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('rankingWords', () => {
  it('names Gemini, or the fallback and why', () => {
    expect(rankingWords(DISCOVER)).toBe('Ranked by Gemini.')
    expect(
      rankingWords({
        ...DISCOVER,
        ranked_by: 'template',
        model_note: "Gemini's daily quota is used up",
      }),
    ).toBe("Ranked by taste alone: Gemini's daily quota is used up.")
    expect(rankingWords({ ...DISCOVER, picks: [] })).toBeNull()
  })
})

describe('emptyWords', () => {
  it('says why a generate found nothing, else whether a batch was answered', () => {
    expect(emptyWords(DISCOVER, 'Nothing in the catalogue fits yet')).toBe(
      'Nothing to pick: Nothing in the catalogue fits yet.',
    )
    expect(emptyWords(DISCOVER, null)).toBe(
      'Nothing left to answer. Generate for more.',
    )
    expect(emptyWords({ ...DISCOVER, generated_at: null }, null)).toBe(
      'Nothing yet. Generate to read the catalogue.',
    )
  })
})

describe('AdminDiscover', () => {
  it('shows the picks with what they are based on and how they were ranked', async () => {
    stubApi()
    renderPage()
    const card = (
      await screen.findByRole('heading', { name: 'Pick a' })
    ).closest('article')
    expect(within(card).getByText('Based on: Hades')).toBeInTheDocument()
    expect(within(card).getByText('Like Hades: Pick a.')).toBeInTheDocument()
    expect(
      within(card).getByText('2021 · Nintendo Switch · Full game on cartridge'),
    ).toBeInTheDocument()
    expect(screen.getByText('Ranked by Gemini.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Needs match →' })).toHaveAttribute(
      'href',
      '/admin/catalogue',
    )
  })

  it('says why the picks were ranked without the model', async () => {
    stubApi(
      {},
      {
        ...DISCOVER,
        ranked_by: 'template',
        model_note: "Gemini's daily quota is used up",
      },
    )
    renderPage()
    expect(
      await screen.findByText(
        "Ranked by taste alone: Gemini's daily quota is used up.",
      ),
    ).toBeInTheDocument()
  })

  it('generates with the defaults: balanced, any, the collection, no key cards', async () => {
    const calls = stubApi({
      'POST /api/recommendations/generate': () => ({
        ok: true,
        status: 200,
        json: async () => ({ count: 8, ranked_by: 'model', model_note: null }),
      }),
    })
    renderPage()
    await screen.findByRole('heading', { name: 'Pick a' })
    await userEvent.click(
      screen.getByRole('button', {
        name: "Generate — uses one of today's Gemini requests",
      }),
    )
    const post = calls.find((call) => call.method === 'POST')
    expect(JSON.parse(post.body)).toEqual({
      kind: 'discover',
      popularity: 'balanced',
      window: 'any',
      platforms: null,
      include_key_cards: false,
    })
    expect(await screen.findByRole('status')).toHaveTextContent('8 picks')
  })

  it('generates with the chosen mode, window, platforms and key cards', async () => {
    const calls = stubApi({
      'POST /api/recommendations/generate': () => ({
        ok: true,
        status: 200,
        json: async () => ({ count: 1, ranked_by: 'model', model_note: null }),
      }),
    })
    renderPage()
    await screen.findByRole('heading', { name: 'Pick a' })
    await userEvent.click(screen.getByRole('radio', { name: 'Deep' }))
    await userEvent.click(screen.getByRole('radio', { name: 'Recent' }))
    await userEvent.click(screen.getByRole('button', { name: 'N64' }))
    await userEvent.click(screen.getByRole('button', { name: 'Switch' }))
    await userEvent.click(
      screen.getByRole('checkbox', { name: 'Include Game-Key Cards' }),
    )
    expect(screen.getByRole('button', { name: 'N64' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await userEvent.click(screen.getByRole('button', { name: /^Generate/ }))
    const post = calls.find((call) => call.method === 'POST')
    expect(JSON.parse(post.body)).toEqual({
      kind: 'discover',
      popularity: 'deep',
      window: 'recent',
      platforms: [4, 130],
      include_key_cards: true,
    })
    expect(await screen.findByRole('status')).toHaveTextContent('1 pick')
  })

  it('Already own posts /own and takes the card away', async () => {
    const calls = stubApi({
      'POST /api/recommendations/a/own': () => ({
        ok: true,
        status: 201,
        json: async () => ({}),
      }),
    })
    renderPage()
    await userEvent.click(
      await screen.findByRole('button', { name: 'Already own Pick a' }),
    )
    expect(
      calls.some((call) => call.path === '/api/recommendations/a/own'),
    ).toBe(true)
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Pick a' })).toBeNull(),
    )
    expect(screen.getByRole('status')).toHaveTextContent(
      'Added Pick a to the collection',
    )
  })

  it('shows a 409 as the answer it is and drops the card', async () => {
    stubApi({
      'POST /api/recommendations/b/want': () => ({
        ok: false,
        status: 409,
        json: async () => ({ detail: 'Already on your shelf' }),
      }),
    })
    renderPage()
    await userEvent.click(
      await screen.findByRole('button', { name: 'Want Pick b' }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Pick b: Already on your shelf',
    )
    expect(screen.queryByRole('heading', { name: 'Pick b' })).toBeNull()
  })

  it('asks for a few ratings when finished games have none', async () => {
    stubApi({
      'GET /api/items': () => ({
        ok: true,
        status: 200,
        json: async () => [
          {
            id: 'i1',
            type: 'game',
            title: 'Celeste',
            status: 'finished',
            rating: null,
          },
        ],
      }),
    })
    renderPage()
    expect(
      await screen.findByRole('heading', { name: 'Rate a few' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Celeste' })).toBeInTheDocument()
  })

  it('says what an empty generation found', async () => {
    let listed = DISCOVER
    stubApi({
      'POST /api/recommendations/generate': () => {
        listed = { ...DISCOVER, picks: [], ranked_by: null, model_note: null }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            count: 0,
            ranked_by: 'template',
            model_note: 'Nothing in the catalogue fits yet',
          }),
        }
      },
      'GET /api/recommendations': () => ({
        ok: true,
        status: 200,
        json: async () => listed,
      }),
    })
    renderPage()
    await screen.findByRole('heading', { name: 'Pick a' })
    await userEvent.click(screen.getByRole('button', { name: /^Generate/ }))
    expect(
      await screen.findByText(
        'Nothing to pick: Nothing in the catalogue fits yet.',
      ),
    ).toBeInTheDocument()
  })

  it('says nothing is left once every pick is answered', async () => {
    stubApi(
      {
        'POST /api/recommendations/a/skip': () => ({
          ok: true,
          status: 200,
          json: async () => ({}),
        }),
      },
      { ...DISCOVER, picks: [pick('a')] },
    )
    renderPage()
    await userEvent.click(
      await screen.findByRole('button', { name: 'Skip Pick a' }),
    )
    expect(
      await screen.findByText('Nothing left to answer. Generate for more.'),
    ).toBeInTheDocument()
  })

  it('says it has not generated yet', async () => {
    stubApi({}, { ...DISCOVER, generated_at: null, picks: [] })
    renderPage()
    expect(
      await screen.findByText('Nothing yet. Generate to read the catalogue.'),
    ).toBeInTheDocument()
  })

  it('says when the ranking is not personal yet', async () => {
    stubApi({}, { ...DISCOVER, personalised: false })
    renderPage()
    expect(
      await screen.findByText(/Ranked by the community alone/),
    ).toBeInTheDocument()
  })

  it('Want says so and takes the card away', async () => {
    stubApi({
      'POST /api/recommendations/a/want': () => ({
        ok: true,
        status: 201,
        json: async () => ({}),
      }),
    })
    renderPage()
    await userEvent.click(
      await screen.findByRole('button', { name: 'Want Pick a' }),
    )
    expect(await screen.findByRole('status')).toHaveTextContent('Wanted Pick a')
    expect(screen.queryByRole('heading', { name: 'Pick a' })).toBeNull()
  })

  it('reads Discover again after a rating', async () => {
    const calls = stubApi({
      'GET /api/items': () => ({
        ok: true,
        status: 200,
        json: async () => [
          {
            id: 'i1',
            type: 'game',
            title: 'Celeste',
            status: 'finished',
            rating: null,
          },
        ],
      }),
      'PATCH /api/items/i1': () => ({
        ok: true,
        status: 200,
        json: async () => ({}),
      }),
    })
    renderPage()
    const celeste = await screen.findByRole('group', { name: 'Celeste' })
    const reads = () =>
      calls.filter((call) => call.path.startsWith('/api/recommendations?'))
        .length
    const before = reads()
    await userEvent.click(
      within(celeste).getByRole('radio', { name: 'Rate 9 out of 10' }),
    )
    await waitFor(() => expect(reads()).toBe(before + 1))
  })

  it('asks a signed-out visitor to sign in', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 401, json: async () => ({}) })),
    )
    renderPage({ signedIn: false })
    expect(
      await screen.findByRole('link', { name: 'Sign in' }),
    ).toHaveAttribute('href', '/admin')
  })
})
