import '@testing-library/jest-dom'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
    reasons: [`Reason for ${title}`],
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
function stubApi({
  items = ITEMS,
  picks = PICKS,
  itemsStatus = 200,
  continuing = [],
  skippedToday = [],
} = {}) {
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
    if (method === 'GET' && path.endsWith('/api/picker/continuing')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ cards: continuing }),
      }
    }
    if (method === 'GET' && path.endsWith('/api/picker/skipped-today')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ item_ids: skippedToday }),
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

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open')
    this.dispatchEvent(new Event('close'))
  }
})

afterEach(() => {
  delete HTMLDialogElement.prototype.showModal
  delete HTMLDialogElement.prototype.close
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('PlayNext', () => {
  it('asks for picks with the default controls', async () => {
    const mock = stubApi()
    await renderReady()

    expect(pickRequests(mock)[0]).toEqual({
      type: 'game',
      size: 'any',
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
    // Three genre chips at most.
    expect(card('Dead Cells').queryByText('Extra')).not.toBeInTheDocument()
  })

  it("offers sizes, not evenings, and shows each pick's size", async () => {
    stubApi()
    await renderReady()

    const sizes = within(screen.getByRole('group', { name: 'Size' }))
    expect(
      sizes.getAllByRole('button').map((button) => button.textContent),
    ).toEqual(['Any', 'Short under 6 h', 'Medium 6–15 h', 'Long 15 h+'])
    expect(
      sizes.getByRole('button', { name: 'Medium' }),
    ).toHaveAccessibleDescription('6–15 h')
    expect(card('Dead Cells').getByText('Medium')).toHaveClass('size-pill')
    expect(
      card('Dead Cells').getByText('about 8 h to finish'),
    ).toBeInTheDocument()
  })

  it('sends the chosen size, moods and platforms', async () => {
    const mock = stubApi()
    await renderReady()

    await userEvent.click(screen.getByRole('button', { name: 'Medium' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cozy' }))
    await userEvent.click(screen.getByRole('button', { name: 'Brainy' }))
    await userEvent.click(
      screen.getByRole('button', { name: 'Nintendo Switch 2' }),
    )

    await waitFor(() =>
      expect(pickRequests(mock).at(-1)).toEqual({
        type: 'game',
        size: 'medium',
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

  it('asks for comics or movies, without the games-only controls', async () => {
    const mock = stubApi()
    await renderReady()

    await userEvent.click(screen.getByRole('button', { name: 'Cozy' }))
    await userEvent.click(screen.getByRole('button', { name: 'Reroll' }))
    await userEvent.click(screen.getByRole('button', { name: 'Comic' }))

    await waitFor(() =>
      expect(pickRequests(mock).at(-1)).toEqual({
        type: 'comic',
        size: 'any',
        moods: [],
        platforms: [],
        exclude: [],
      }),
    )
    expect(screen.queryByRole('group', { name: 'Mood' })).toBeNull()
    expect(screen.queryByRole('group', { name: 'Platform' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Comic' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('starts the exclusions over when a control changes', async () => {
    const mock = stubApi()
    await renderReady()

    await userEvent.click(screen.getByRole('button', { name: 'Reroll' }))
    await userEvent.click(screen.getByRole('button', { name: 'Short' }))

    await waitFor(() =>
      expect(pickRequests(mock).at(-1)).toMatchObject({
        size: 'short',
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

  it('says Play this also starts the game', async () => {
    stubApi()
    await renderReady()

    expect(
      card('Dead Cells').getByRole('button', { name: 'Play this' }),
    ).toHaveAccessibleDescription('Up next · starts playing')
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

const CARD = {
  item_id: 'p1',
  type: 'game',
  title: 'Pinned Game',
  cover_url: null,
  platform: 'Nintendo Switch 2',
  time_to_beat_hours: 30,
  playthrough: 1,
  playing_since: '2026-10-24',
  last_played_on: '2026-11-07',
  journal_hours: 31,
  sessions: 9,
  stale: false,
}

describe('PlayNext with a game in hand', () => {
  it('leads with the Continue card above the controls and keeps the grid', async () => {
    stubApi({ continuing: [CARD] })
    await renderReady()
    const article = await screen.findByRole('article', { name: 'Pinned Game' })
    expect(article).toHaveClass('continue')
    expect(
      article.compareDocumentPosition(
        screen.getByRole('group', { name: 'Size' }),
      ),
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    expect(
      within(article).getByRole('link', { name: 'Pinned Game' }),
    ).toHaveAttribute('href', '/admin/collection/p1')
    expect(screen.getAllByRole('heading', { level: 2 }).length).toBeGreaterThan(
      2,
    )
    // The pinned game being played is the card, not the Up next band.
    expect(screen.queryByRole('region', { name: 'Up next' })).toBeNull()
  })

  it('shows a private game in hand too', async () => {
    stubApi({ continuing: [{ ...CARD, item_id: 'x', title: 'Private Game' }] })
    await renderReady()
    expect(
      await screen.findByRole('article', { name: 'Private Game' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Up next' })).toBeInTheDocument()
  })

  it('logs tonight with the local date and reloads', async () => {
    const mock = stubApi({ continuing: [CARD] })
    await renderReady()
    await screen.findByRole('article', { name: 'Pinned Game' })
    await userEvent.click(
      screen.getByRole('button', { name: 'Log tonight: Pinned Game' }),
    )
    await waitFor(() =>
      expect(calls(mock, 'POST', '/api/items/p1/sessions')).toHaveLength(1),
    )
    const [, options] = calls(mock, 'POST', '/api/items/p1/sessions')[0]
    const [year, month, day] = [
      new Date().getFullYear(),
      String(new Date().getMonth() + 1).padStart(2, '0'),
      String(new Date().getDate()).padStart(2, '0'),
    ]
    expect(JSON.parse(options.body)).toEqual({
      played_on: `${year}-${month}-${day}`,
    })
    await waitFor(() =>
      expect(
        calls(mock, 'GET', '/api/picker/continuing').length,
      ).toBeGreaterThan(1),
    )
  })

  it('answers Not tonight with a skip and drops the card for the day', async () => {
    const mock = stubApi({ continuing: [CARD] })
    await renderReady()
    await screen.findByRole('article', { name: 'Pinned Game' })
    await userEvent.click(
      screen.getByRole('button', { name: 'Not tonight: Pinned Game' }),
    )
    await waitFor(() =>
      expect(calls(mock, 'POST', '/api/picker/events')).toHaveLength(1),
    )
    await waitFor(() =>
      expect(screen.queryByRole('article', { name: 'Pinned Game' })).toBeNull(),
    )
  })

  it('opens Wrap up from the card and reloads once it saves', async () => {
    const mock = stubApi({ continuing: [CARD] })
    await renderReady()
    await screen.findByRole('article', { name: 'Pinned Game' })
    await userEvent.click(
      screen.getByRole('button', { name: 'Wrap up: Pinned Game' }),
    )
    const dialog = await screen.findByRole('dialog', {
      name: 'Wrap up Pinned Game',
    })
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Skip extras' }),
    )
    await waitFor(() =>
      expect(calls(mock, 'POST', '/api/items/p1/status')).toHaveLength(1),
    )
    await waitFor(() =>
      expect(
        calls(mock, 'GET', '/api/picker/continuing').length,
      ).toBeGreaterThan(1),
    )
  })

  it('keeps the pinned game as a card after Not tonight, not a band', async () => {
    stubApi({ continuing: [CARD] })
    await renderReady()
    await screen.findByRole('article', { name: 'Pinned Game' })
    await userEvent.click(
      screen.getByRole('button', { name: 'Not tonight: Pinned Game' }),
    )
    await waitFor(() =>
      expect(screen.queryByRole('article', { name: 'Pinned Game' })).toBeNull(),
    )
    // The game is still the one in hand, so the Up next band stays away.
    expect(screen.queryByRole('region', { name: 'Up next' })).toBeNull()
  })

  it('does not re-ask the picker when a session is logged', async () => {
    const mock = stubApi({ continuing: [CARD] })
    await renderReady()
    await screen.findByRole('article', { name: 'Pinned Game' })
    const before = pickRequests(mock).length
    await userEvent.click(
      screen.getByRole('button', { name: 'Log tonight: Pinned Game' }),
    )
    await waitFor(() =>
      expect(
        calls(mock, 'GET', '/api/picker/continuing').length,
      ).toBeGreaterThan(1),
    )
    expect(pickRequests(mock)).toHaveLength(before)
  })

  it('leaves out a card skipped earlier today', async () => {
    stubApi({ continuing: [CARD], skippedToday: ['p1'] })
    await renderReady()
    await waitFor(() =>
      expect(screen.queryByRole('article', { name: 'Pinned Game' })).toBeNull(),
    )
    // Still the game in hand, so still no band for it.
    expect(screen.queryByRole('region', { name: 'Up next' })).toBeNull()
  })
})
