import '@testing-library/jest-dom'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import PlayNext from './PlayNext.jsx'

const ITEMS = [
  {
    id: 'p1',
    title: 'Pinned Game',
    type: 'game',
    cover_url: null,
    pinned_at: '2026-09-20T12:00:00Z',
    platform_id: 508,
    platform: 'Nintendo Switch 2',
  },
  {
    id: 'a',
    title: 'Dead Cells',
    type: 'game',
    cover_url: null,
    pinned_at: null,
    platform_id: 130,
    platform: 'Nintendo Switch',
  },
]

function pick(id, title, slot, slotLabel) {
  return {
    slot,
    slot_label: slotLabel,
    score: 80,
    reasons: [`Reason for ${title}`, 'About 8 h — fits an evening'],
    item: {
      id,
      title,
      year: 2020,
      cover_url: null,
      type: 'game',
      platform: 'Nintendo Switch',
      genres: ['Indie', 'Platform', 'Action', 'Extra'],
      time_to_beat_hours: 8,
    },
  }
}

const PICKS = {
  picks: [
    pick('a', 'Dead Cells', 'best_fit', 'Best fit'),
    pick('b', 'Slay the Spire', 'short_and_sweet', 'Short and sweet'),
    pick('c', 'Old Puzzle', 'overdue_classic', 'Overdue classic'),
  ],
  candidate_count: 12,
  profile_size: 9,
}

/**
 * Routes fetch by URL and method. `picks` may be a function of the request
 * body, so a test can answer differently to different controls.
 */
function stubApi({ items = ITEMS, picks = PICKS, itemsStatus = 200 } = {}) {
  const mock = vi.fn(async (url, options = {}) => {
    const method = options.method ?? 'GET'
    const path = String(url)
    if (method === 'GET' && path.endsWith('/api/items')) {
      return {
        ok: itemsStatus === 200,
        status: itemsStatus,
        json: async () => items,
      }
    }
    if (path.endsWith('/api/picker/next')) {
      const body = JSON.parse(options.body)
      const answer = typeof picks === 'function' ? picks(body) : picks
      return { ok: true, status: 200, json: async () => answer }
    }
    return { ok: true, status: 204, json: async () => ({}) }
  })
  vi.stubGlobal('fetch', mock)
  return mock
}

function pickRequests(mock) {
  return mock.mock.calls
    .filter(([url]) => String(url).endsWith('/api/picker/next'))
    .map(([, options]) => JSON.parse(options.body))
}

function calls(mock, method, fragment) {
  return mock.mock.calls.filter(
    ([url, options]) =>
      (options?.method ?? 'GET') === method && String(url).includes(fragment),
  )
}

function renderPage() {
  return render(
    <MemoryRouter>
      <PlayNext />
    </MemoryRouter>,
  )
}

async function renderReady() {
  renderPage()
  await screen.findByText('Dead Cells', { selector: '.pick-card h2' })
}

function card(title) {
  return within(
    screen
      .getByText(title, { selector: '.pick-card h2' })
      .closest('.pick-card'),
  )
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('PlayNext', () => {
  it('asks for picks with the default controls', async () => {
    const mock = stubApi()
    await renderReady()

    expect(pickRequests(mock)[0]).toEqual({
      time: 'any',
      moods: [],
      platforms: [],
      exclude: [],
    })
  })

  it('shows three named cards with their reasons', async () => {
    stubApi()
    await renderReady()

    expect(card('Dead Cells').getByText('Best fit')).toBeInTheDocument()
    expect(
      card('Slay the Spire').getByText('Short and sweet'),
    ).toBeInTheDocument()
    expect(
      card('Dead Cells').getByText('Reason for Dead Cells'),
    ).toBeInTheDocument()
    expect(card('Dead Cells').getByText('≈ 8 h')).toBeInTheDocument()
    // Three genre chips at most.
    expect(card('Dead Cells').queryByText('Extra')).not.toBeInTheDocument()
  })

  it('sends the chosen time, moods and platforms', async () => {
    const mock = stubApi()
    await renderReady()

    await userEvent.click(screen.getByRole('button', { name: 'Evening' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cozy' }))
    await userEvent.click(screen.getByRole('button', { name: 'Brainy' }))
    await userEvent.click(
      screen.getByRole('button', { name: 'Nintendo Switch 2' }),
    )

    await waitFor(() =>
      expect(pickRequests(mock).at(-1)).toEqual({
        time: 'evening',
        moods: ['cozy', 'brainy'],
        platforms: [508],
        exclude: [],
      }),
    )
  })

  it('rerolls without the games already shown', async () => {
    const mock = stubApi()
    await renderReady()

    await userEvent.click(screen.getByRole('button', { name: 'Reroll' }))

    await waitFor(() =>
      expect(pickRequests(mock).at(-1).exclude).toEqual(['a', 'b', 'c']),
    )
  })

  it('starts the exclusions over when a control changes', async () => {
    const mock = stubApi()
    await renderReady()

    await userEvent.click(screen.getByRole('button', { name: 'Reroll' }))
    await userEvent.click(screen.getByRole('button', { name: 'Quick' }))

    await waitFor(() =>
      expect(pickRequests(mock).at(-1)).toMatchObject({
        time: 'quick',
        exclude: [],
      }),
    )
  })

  it('records Not tonight and leaves the game out of the next picks', async () => {
    const mock = stubApi()
    await renderReady()

    await userEvent.click(
      card('Slay the Spire').getByRole('button', { name: 'Not tonight' }),
    )

    await waitFor(() => {
      const [, options] = calls(mock, 'POST', '/api/picker/events')[0]
      expect(JSON.parse(options.body)).toEqual({
        item_id: 'b',
        action: 'skipped',
      })
      expect(pickRequests(mock).at(-1).exclude).toEqual(['b'])
    })
  })

  it('records Never suggest and asks again', async () => {
    const mock = stubApi()
    await renderReady()
    const before = pickRequests(mock).length

    await userEvent.click(
      card('Old Puzzle').getByRole('button', { name: 'Never suggest' }),
    )

    await waitFor(() => {
      const [, options] = calls(mock, 'POST', '/api/picker/events')[0]
      expect(JSON.parse(options.body)).toEqual({
        item_id: 'c',
        action: 'never',
      })
      expect(pickRequests(mock).length).toBe(before + 1)
    })
  })

  it('pins a pick with Play this and shows the pinned game as Up next', async () => {
    const mock = stubApi()
    await renderReady()

    expect(
      within(screen.getByRole('region', { name: 'Up next' })).getByText(
        'Pinned Game',
      ),
    ).toBeInTheDocument()

    await userEvent.click(
      card('Dead Cells').getByRole('button', { name: 'Play this' }),
    )

    await waitFor(() =>
      expect(calls(mock, 'POST', '/api/items/a/pin')).toHaveLength(1),
    )
  })

  it('unpins the Up next game', async () => {
    const mock = stubApi()
    await renderReady()

    await userEvent.click(screen.getByRole('button', { name: 'Unpin' }))

    await waitFor(() =>
      expect(calls(mock, 'DELETE', '/api/items/p1/pin')).toHaveLength(1),
    )
  })

  it('offers to drop the moods when they match nothing', async () => {
    const mock = stubApi({
      picks: (body) =>
        body.moods.length
          ? { picks: [], candidate_count: 0, profile_size: 9 }
          : PICKS,
    })
    await renderReady()

    await userEvent.click(screen.getByRole('button', { name: 'Cozy' }))
    expect(
      await screen.findByText('Nothing on the shelf matches those moods.'),
    ).toBeInTheDocument()

    await userEvent.click(
      screen.getByRole('button', { name: 'Try without moods' }),
    )

    await waitFor(() => expect(pickRequests(mock).at(-1).moods).toEqual([]))
    expect(
      await screen.findByText('Dead Cells', { selector: '.pick-card h2' }),
    ).toBeInTheDocument()
  })

  it('says so when the backlog is empty', async () => {
    stubApi({ picks: { picks: [], candidate_count: 0, profile_size: 9 } })
    renderPage()

    expect(
      await screen.findByText('Nothing in the backlog right now.'),
    ).toBeInTheDocument()
  })

  it('asks for ratings while the profile is small', async () => {
    stubApi({ picks: { ...PICKS, profile_size: 3 } })
    await renderReady()

    expect(screen.getByRole('link', { name: /rate a few/i })).toHaveAttribute(
      'href',
      '/admin/collection',
    )
  })

  it('reports a missing session', async () => {
    stubApi({ itemsStatus: 401 })
    renderPage()

    expect(await screen.findByText(/not signed in/i)).toBeInTheDocument()
  })
})

describe('PlayNext exclusions', () => {
  // The server answers with the same picks here, so a second reroll would
  // repeat them; the exclude list is capped at 200 ids server-side.
  it('never sends the same id twice', async () => {
    const mock = stubApi()
    await renderReady()

    await userEvent.click(screen.getByRole('button', { name: 'Reroll' }))
    await waitFor(() => expect(pickRequests(mock)).toHaveLength(2))
    await userEvent.click(screen.getByRole('button', { name: 'Reroll' }))

    await waitFor(() =>
      expect(pickRequests(mock).at(-1).exclude).toEqual(['a', 'b', 'c']),
    )
  })
})
