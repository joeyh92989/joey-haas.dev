import '@testing-library/jest-dom'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Outlet, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiFetch } from '../lib/api.js'
import { useSnapshotThenLive } from '../lib/useSnapshotThenLive.js'
import Next from './Next.jsx'
import { ACTION_ERROR } from '../content/status.js'
import { spine } from '../content/spine.js'

vi.mock('../lib/useMediaQuery.js', () => ({ useMediaQuery: () => false }))
vi.mock('../lib/api.js', () => ({ apiFetch: vi.fn() }))
vi.mock('../lib/useSnapshotThenLive.js', () => ({
  useSnapshotThenLive: vi.fn(),
}))

const row = (title, fields = {}) => ({
  title,
  platform: 'Nintendo Switch 2',
  physical_format: 'game_card',
  release_date: null,
  release_precision: null,
  cover_url: null,
  igdb_url: null,
  reasons: [],
  top_pick: false,
  new: false,
  item_id: null,
  ...fields,
})

const NEXT = {
  generated_at: {
    picks: '2026-10-03',
    catalogue: '2026-10-04',
    radar: null,
    discover: '2026-10-04',
  },
  tonight: {
    up_next: null,
    picks: [
      {
        item_id: 'p1',
        type: 'game',
        title: 'Hades II',
        cover_url: null,
        platform: 'Nintendo Switch',
        reasons: ['A reason'],
      },
    ],
  },
  wanted: [],
  buy_now: [
    row('Old', { release_date: '2026-01-01' }),
    row('Fresh', { release_date: '2026-09-20', new: true, top_pick: true }),
    row('Cart', { platform: 'Nintendo Switch' }),
  ],
  preorders: [
    row('Soon', { release_date: '2026-10-15', release_precision: 'day' }),
  ],
  later: [],
  not_on_cartridge: [row('Digital', { physical_format: null })],
}

function mockNext(state) {
  vi.mocked(useSnapshotThenLive).mockReturnValue(state)
}

function renderPage({ signedIn } = {}) {
  return render(
    <MemoryRouter initialEntries={['/shelf/next']}>
      <Routes>
        <Route element={<Outlet context={{ signedIn }} />}>
          <Route path="/shelf/next" element={<Next />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

afterEach(() => {
  localStorage.clear()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('Next', () => {
  it('has one h1, the freshness line and every section in order', () => {
    mockNext({ data: NEXT, live: true, failed: false })
    renderPage()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'What’s next',
    )
    // The API publishes UTC days only, read at noon so no timezone moves them.
    expect(screen.getByText(/^Picks /)).toHaveTextContent(
      'Picks Sat 3 Oct · Releases checked Sun 4 Oct · Suggestions Sun 4 Oct',
    )
    const headings = screen
      .getAllByRole('heading', { level: 2 })
      .map((h) => h.textContent)
    expect(headings).toEqual([
      'Tonight',
      spine.next.sections.wanted,
      spine.next.sections.buy_now,
      spine.next.sections.preorders,
      spine.next.sections.later,
    ])
    expect(screen.getByText(spine.next.empty.wanted)).toBeInTheDocument()
    expect(screen.getByText(spine.next.empty.later)).toBeInTheDocument()
  })

  // Nothing pinned is the usual state; the day's picks are still tonight's
  // games, so the empty line would contradict the cards beneath it.
  it('says nothing is lined up only when there is no pin and no pick', () => {
    mockNext({ data: NEXT, live: true, failed: false })
    const { unmount } = renderPage()
    const tonight = screen.getByRole('region', { name: 'Tonight' })
    expect(within(tonight).getByText('Hades II')).toBeInTheDocument()
    expect(within(tonight).queryByText(spine.next.empty.upNext)).toBeNull()
    unmount()

    mockNext({
      data: { ...NEXT, tonight: { up_next: null, picks: [] } },
      live: true,
      failed: false,
    })
    renderPage()
    expect(screen.getByText(spine.next.empty.upNext)).toBeInTheDocument()
  })

  it('sets the page title', () => {
    mockNext({ data: NEXT, live: true, failed: false })
    renderPage()
    expect(document.title).toBe('What’s next · My Shelf')
  })

  it('links tonight’s picks to their item pages, with Up next first', () => {
    mockNext({
      data: {
        ...NEXT,
        tonight: {
          ...NEXT.tonight,
          up_next: {
            item_id: 'u1',
            type: 'game',
            title: 'Pinned Game',
            cover_url: null,
            platform: 'Nintendo Switch 2',
            reasons: [],
          },
        },
      },
      live: true,
      failed: false,
    })
    renderPage()
    const tonight = screen.getByRole('region', { name: 'Tonight' })
    const links = within(tonight).getAllByRole('link')
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/shelf/u1/',
      '/shelf/p1/',
    ])
    const lead = links[0].closest('article')
    expect(lead).toHaveClass('tonight-lead', 'pinned')
    expect(within(lead).getByText('Up next')).toBeInTheDocument()
    expect(within(tonight).getByText('The other picks')).toBeInTheDocument()
    expect(within(tonight).queryByText(spine.next.empty.upNext)).toBeNull()
  })

  it('groups Buy now by console and sorts by newest on request', async () => {
    mockNext({ data: NEXT, live: true, failed: false })
    renderPage()
    const buy = screen.getByRole('region', {
      name: spine.next.sections.buy_now,
    })
    expect(
      within(buy)
        .getAllByRole('heading', { level: 3 })
        .map((h) => h.textContent),
    ).toEqual(['Nintendo Switch 2', 'Nintendo Switch'])
    await userEvent.click(within(buy).getByRole('button', { name: 'Newest' }))
    const titles = within(buy)
      .getAllByText(/^(Old|Fresh)$/)
      .map((n) => n.textContent)
    expect(titles).toEqual(['Fresh', 'Old'])
    expect(localStorage.getItem('shelf.next.sort')).toBe('"newest"')
  })

  it('offers no direction for Buy now’s fixed-order sorts', () => {
    mockNext({ data: NEXT, live: true, failed: false })
    renderPage()
    const buy = screen.getByRole('region', {
      name: spine.next.sections.buy_now,
    })
    expect(within(buy).queryByRole('button', { name: /direction/i })).toBeNull()
  })

  it('restores a stored sort and ignores an unknown one', () => {
    localStorage.setItem('shelf.next.sort', '"newest"')
    mockNext({ data: NEXT, live: true, failed: false })
    const { unmount } = renderPage()
    expect(screen.getByRole('button', { name: 'Newest' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    unmount()
    localStorage.setItem('shelf.next.sort', '"price"')
    renderPage()
    expect(
      screen.getByRole('button', { name: spine.next.sorts[0].label }),
    ).toHaveAttribute('aria-pressed', 'true')
  })

  // A game can be on both Switches, so the title alone is not a row's key.
  it('shows a game listed on both Switches twice', () => {
    mockNext({
      data: {
        ...NEXT,
        buy_now: [row('Twice'), row('Twice', { platform: 'Nintendo Switch' })],
      },
      live: true,
      failed: false,
    })
    renderPage()
    const buy = screen.getByRole('region', {
      name: spine.next.sections.buy_now,
    })
    expect(within(buy).getAllByText('Twice')).toHaveLength(2)
  })

  it('keeps Not on cartridge in a details element', () => {
    mockNext({ data: NEXT, live: true, failed: false })
    const { container } = renderPage()
    const details = container.querySelector('details')
    expect(within(details).getByText(/Not on cartridge/)).toBeInTheDocument()
    expect(
      within(details).getByText(spine.next.notOnCartridge),
    ).toBeInTheDocument()
    expect(within(details).getByText('Digital')).toBeInTheDocument()
  })

  it('counts Not on cartridge only when there is something in it', () => {
    mockNext({ data: NEXT, live: true, failed: false })
    const first = renderPage()
    expect(screen.getByText('Not on cartridge (1)')).toBeInTheDocument()
    first.unmount()

    mockNext({
      data: { ...NEXT, not_on_cartridge: [] },
      live: true,
      failed: false,
    })
    renderPage()
    expect(screen.getByText('Not on cartridge')).toBeInTheDocument()
    expect(screen.queryByText(/Not on cartridge \(/)).toBeNull()
  })

  it('shows stale data when the live call failed after a snapshot', () => {
    mockNext({ data: NEXT, live: false, failed: true })
    renderPage()
    expect(
      screen.getByRole('region', { name: spine.next.sections.buy_now }),
    ).toBeInTheDocument()
    expect(screen.queryByText(spine.next.error)).toBeNull()
  })

  it('says it could not load with neither snapshot nor live data', () => {
    mockNext({ data: null, live: false, failed: true })
    renderPage()
    expect(screen.getByText(spine.next.error)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 2 })).toBeNull()
  })

  it('says it is waking the server only without a snapshot', () => {
    vi.useFakeTimers()
    mockNext({ data: null, live: false, failed: false })
    renderPage()
    expect(screen.getByRole('status')).toHaveTextContent('Loading…')
    act(() => {
      vi.advanceTimersByTime(3500)
    })
    expect(screen.getByText(/Waking the server/)).toBeInTheDocument()
  })

  it('never says it is waking the server once a snapshot has painted', () => {
    vi.useFakeTimers()
    mockNext({ data: NEXT, live: false, failed: false })
    renderPage()
    act(() => {
      vi.advanceTimersByTime(3500)
    })
    expect(screen.queryByText(/Waking the server/)).toBeNull()
  })

  // The shape check guards the snapshot and the live body; the page still
  // renders a body that slipped past it rather than going blank.
  it('renders a body missing lists and reasons without throwing', () => {
    mockNext({
      data: {
        generated_at: {},
        tonight: {
          up_next: null,
          picks: [{ item_id: 'p1', type: 'game', title: 'Bare' }],
        },
        buy_now: [],
      },
      live: true,
      failed: false,
    })
    renderPage()
    expect(screen.getByText('Bare')).toBeInTheDocument()
    expect(screen.getByText(spine.next.empty.wanted)).toBeInTheDocument()
    expect(screen.getByText('Not on cartridge')).toBeInTheDocument()
  })

  it('renders a body whose tonight is missing', () => {
    mockNext({ data: { buy_now: [] }, live: true, failed: false })
    renderPage()
    expect(screen.getByText(spine.next.empty.upNext)).toBeInTheDocument()
  })

  it('keys rows apart by IGDB link and position', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockNext({
      data: {
        ...NEXT,
        later: [
          row('Same', { igdb_url: 'https://www.igdb.com/games/a' }),
          row('Same', { igdb_url: 'https://www.igdb.com/games/b' }),
          row('Same'),
          row('Same'),
        ],
      },
      live: true,
      failed: false,
    })
    renderPage()
    const later = screen.getByRole('region', {
      name: spine.next.sections.later,
    })
    expect(within(later).getAllByText('Same')).toHaveLength(4)
    expect(
      error.mock.calls.some((call) => String(call[0]).includes('same key')),
    ).toBe(false)
  })

  it('names Buy now’s sort control for its section', () => {
    mockNext({ data: NEXT, live: true, failed: false })
    renderPage()
    expect(
      screen.getByRole('group', { name: spine.next.sortLabel }),
    ).toBeInTheDocument()
  })
})

const pick = (id, title) => ({
  item_id: id,
  type: 'game',
  title,
  cover_url: null,
  platform: 'Nintendo Switch',
  reasons: [`Reason for ${title}`],
  slot_label: 'Best fit',
})

const THREE = {
  ...NEXT,
  tonight: {
    up_next: null,
    picks: [
      pick('p1', 'Hades II'),
      pick('p2', 'Celeste'),
      pick('p3', 'Tetris'),
    ],
  },
}

/** Answers each route, or a promise of an answer; a missing one is ok. */
function mockApi(routes = {}) {
  vi.mocked(apiFetch).mockImplementation(async (path, options = {}) => {
    const key = `${options.method ?? 'GET'} ${path}`
    const answer = await (key in routes
      ? routes[key]
      : { ok: true, body: null })
    if (answer instanceof Error) throw answer
    return {
      ok: answer.ok,
      status: answer.ok ? 200 : 500,
      json: async () => answer.body,
    }
  })
}

function calls(method, path) {
  return vi
    .mocked(apiFetch)
    .mock.calls.filter(
      ([p, options = {}]) => p === path && (options.method ?? 'GET') === method,
    )
}

describe('Tonight', () => {
  afterEach(() => {
    vi.mocked(apiFetch).mockReset()
  })

  it('is read-only signed out', () => {
    mockApi()
    mockNext({ data: THREE, live: true, failed: false })
    renderPage()
    const tonight = screen.getByRole('region', { name: 'Tonight' })
    expect(within(tonight).queryByRole('button')).toBeNull()
    expect(within(tonight).queryByText(spine.next.tonight.ownerNote)).toBeNull()
    expect(within(tonight).getByText('Or instead')).toBeInTheDocument()
    expect(apiFetch).not.toHaveBeenCalled()
  })

  it('leads with the first pick and lists the rest under it', () => {
    mockApi()
    mockNext({ data: THREE, live: true, failed: false })
    renderPage({ signedIn: true })
    const tonight = screen.getByRole('region', { name: 'Tonight' })
    const lead = tonight.querySelector('.tonight-lead')
    expect(within(lead).getByText('Hades II')).toBeInTheDocument()
    const alts = within(tonight)
      .getAllByRole('listitem')
      .filter((li) => li.classList.contains('tonight-alt'))
    expect(alts.map((li) => within(li).getByRole('link').textContent)).toEqual([
      'Celeste',
      'Tetris',
    ])
    expect(
      within(tonight).getByText(spine.next.tonight.ownerNote),
    ).toBeInTheDocument()
  })

  it('shows the Just finished chip from last_finish', () => {
    mockApi()
    mockNext({
      data: {
        ...THREE,
        tonight: {
          ...THREE.tonight,
          last_finish: {
            item_id: 'f1',
            title: 'Metroid Dread',
            cover_url: null,
            finished_at: '2026-10-26',
            time_to_beat_hours: 9,
          },
        },
      },
      live: true,
      failed: false,
    })
    renderPage()
    const chip = document.querySelector('.tonight-just')
    expect(chip).toHaveTextContent(
      'Just finished Metroid Dread · Mon 26 Oct · 9 h',
    )
  })

  it('pins a pick, refetches, and moves focus to its title', async () => {
    const pinned = {
      ...THREE,
      tonight: { ...THREE.tonight, up_next: pick('p2', 'Celeste') },
    }
    mockApi({ 'GET /api/public/next': { ok: true, body: pinned } })
    mockNext({ data: THREE, live: true, failed: false })
    renderPage({ signedIn: true })
    const celeste = screen.getByRole('link', { name: 'Celeste' }).closest('li')
    await userEvent.click(
      within(celeste).getByRole('button', {
        name: `${spine.next.tonight.playInstead}: Celeste`,
      }),
    )
    expect(calls('POST', '/api/items/p2/pin')).toHaveLength(1)
    expect(calls('GET', '/api/public/next')).toHaveLength(1)
    const lead = document.querySelector('.tonight-lead')
    expect(lead).toHaveClass('pinned')
    expect(within(lead).getByText('Celeste')).toHaveFocus()
    expect(
      within(lead).getByRole('button', { name: spine.next.tonight.unpin }),
    ).toBeInTheDocument()
    expect(screen.getByText('The other picks')).toBeInTheDocument()
  })

  it('rolls a failed pin back and says so', async () => {
    mockApi({ 'POST /api/items/p1/pin': { ok: false } })
    mockNext({ data: THREE, live: true, failed: false })
    renderPage({ signedIn: true })
    await userEvent.click(
      screen.getByRole('button', { name: spine.next.tonight.play }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(ACTION_ERROR)
    expect(document.querySelector('.tonight-lead')).not.toHaveClass('pinned')
    expect(calls('GET', '/api/public/next')).toHaveLength(0)
  })

  it('unpins Up next back to the picks', async () => {
    mockApi({ 'GET /api/public/next': { ok: true, body: THREE } })
    mockNext({
      data: {
        ...THREE,
        tonight: { ...THREE.tonight, up_next: pick('p2', 'Celeste') },
      },
      live: true,
      failed: false,
    })
    renderPage({ signedIn: true })
    await userEvent.click(
      screen.getByRole('button', { name: spine.next.tonight.unpin }),
    )
    expect(calls('DELETE', '/api/items/p2/pin')).toHaveLength(1)
    const lead = document.querySelector('.tonight-lead')
    expect(lead).not.toHaveClass('pinned')
    expect(within(lead).getByText('Hades II')).toHaveFocus()
  })

  it('skips a pick once, offers Undo, and promotes the next pick', async () => {
    mockApi()
    mockNext({ data: THREE, live: true, failed: false })
    renderPage({ signedIn: true })
    const lead = document.querySelector('.tonight-lead')
    await userEvent.click(
      within(lead).getByRole('button', { name: spine.next.tonight.skip }),
    )
    const posts = calls('POST', '/api/picker/events')
    expect(posts).toHaveLength(1)
    expect(JSON.parse(posts[0][1].body)).toEqual({
      item_id: 'p1',
      action: 'skipped',
    })
    expect(screen.getByRole('status')).toHaveTextContent(
      'Hades II is off tonight’s list.',
    )
    const toast = document.querySelector('.tonight-toast')
    expect(toast).toHaveTextContent('Hades II is off tonight’s list.')
    const undo = within(toast).getByRole('button', { name: 'Undo: Hades II' })
    expect(undo).toHaveFocus()
    expect(
      within(document.querySelector('.tonight-lead')).getByText('Celeste'),
    ).toBeInTheDocument()

    await userEvent.click(undo)
    expect(calls('DELETE', '/api/picker/events/p1/skipped')).toHaveLength(1)
    expect(document.querySelector('.tonight-toast')).toBeNull()
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
    expect(screen.getByRole('link', { name: 'Hades II' })).toHaveFocus()
  })

  it('runs an Undo pressed while its skip is still saving', async () => {
    let answer
    mockApi({
      'POST /api/picker/events': new Promise((resolve) => (answer = resolve)),
    })
    mockNext({ data: THREE, live: true, failed: false })
    renderPage({ signedIn: true })
    const lead = document.querySelector('.tonight-lead')
    await userEvent.click(
      within(lead).getByRole('button', { name: spine.next.tonight.skip }),
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'Undo: Hades II' }),
    )
    expect(calls('DELETE', '/api/picker/events/p1/skipped')).toHaveLength(0)

    answer({ ok: true, body: null })
    await vi.waitFor(() =>
      expect(calls('DELETE', '/api/picker/events/p1/skipped')).toHaveLength(1),
    )
    expect(document.querySelector('.tonight-toast')).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('drops the Or instead line when only skipped cards are left', async () => {
    mockApi()
    mockNext({ data: THREE, live: true, failed: false })
    renderPage({ signedIn: true })
    for (const title of ['Hades II', 'Celeste', 'Tetris']) {
      const lead = document.querySelector('.tonight-lead')
      expect(within(lead).getByText(title)).toBeInTheDocument()
      await userEvent.click(
        within(lead).getByRole('button', { name: spine.next.tonight.skip }),
      )
    }
    expect(document.querySelectorAll('.tonight-toast')).toHaveLength(3)
    expect(screen.queryByText(spine.next.tonight.orInstead)).toBeNull()
  })

  it('leaves out games skipped earlier today', async () => {
    mockApi({
      'GET /api/picker/skipped-today': { ok: true, body: { item_ids: ['p1'] } },
    })
    mockNext({ data: THREE, live: true, failed: false })
    renderPage({ signedIn: true })
    await vi.waitFor(() =>
      expect(screen.queryByRole('link', { name: 'Hades II' })).toBeNull(),
    )
    expect(
      within(document.querySelector('.tonight-lead')).getByText('Celeste'),
    ).toBeInTheDocument()
  })
})
