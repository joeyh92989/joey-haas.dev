import '@testing-library/jest-dom'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Outlet, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AdminClosetReview from './AdminClosetReview.jsx'

function garment(id, name, extra = {}) {
  return {
    id,
    name,
    category: 'top',
    brand: null,
    primary_color: 'navy',
    primary_hex: '#223344',
    material: null,
    notes: null,
    acquired_on: '2025-06-01',
    created_at: '2025-06-01T12:00:00Z',
    status: 'active',
    back_on: null,
    image: null,
    seasons: [],
    wears_12mo: 0,
    tag_source: 'model',
    tag_attempts: 1,
    ...extra,
  }
}

function card(id, name, flags, extra = {}) {
  return {
    garment: garment(id, name),
    flags: flags.map(([kind, sentence]) => ({ kind, sentence })),
    opinion: null,
    suggested: 'donate',
    back_on: '2027-05-01',
    size: 'M',
    ...extra,
  }
}

const NEVER = card('g1', 'never worn', [
  ['unworn', 'Not worn in the last twelve months.'],
  ['condition', 'Your note says “pilled”.'],
])
const LINEN = card(
  'g2',
  'linen shirt',
  [['out_of_season', 'Out of season until May: it is worn May to September.']],
  {
    opinion: 'The linen reads looser than how you dress now.',
    suggested: 'pack',
  },
)
const SHORTS = card('g3', 'shorts', [
  ['rare', 'Worn once in twelve months; your other bottoms averaged 7.'],
])

function review(extra = {}) {
  return {
    day: '2026-11-10',
    turn: { name: 'autumn', on: '2026-10-25', open: true },
    next_turn: 'late April',
    opinion_batch_on: '2026-11-08',
    banner: {
      turn: 'autumn',
      turn_on: '2026-10-25',
      season: 'summer',
      count: 2,
      until: 'May',
    },
    tiles: { active: 6, worn_30: 3, flagged: 3, gone_this_year: 1 },
    deck: [NEVER, LINEN, SHORTS],
    due_back: [],
    listed: [],
    ...extra,
  }
}

function json(body, status = 200) {
  return { ok: status < 300, status, json: async () => body }
}

/**
 * Stubs fetch with `routes`: "METHOD /path" → a function of the call (or
 * a body). Every call is recorded with its parsed JSON body.
 */
function stub(routes) {
  const calls = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url, options = {}) => {
      const method = options.method ?? 'GET'
      const path = new URL(String(url), 'http://x').pathname
      const body =
        typeof options.body === 'string' ? JSON.parse(options.body) : undefined
      const call = { method, path, body }
      calls.push(call)
      const route = routes[`${method} ${path}`]
      if (!route) return json({ detail: 'not stubbed' }, 404)
      const result = await (typeof route === 'function' ? route(call) : route)
      return result?.ok === undefined ? json(result) : result
    }),
  )
  return calls
}

/** A GET that answers each body in turn, then the last one for good. */
function reads(...bodies) {
  let index = 0
  return () => bodies[Math.min(index++, bodies.length - 1)]
}

function renderPage(setClosetReview = vi.fn()) {
  render(
    <MemoryRouter initialEntries={['/admin/closet/review']}>
      <Routes>
        <Route element={<Outlet context={{ setClosetReview }} />}>
          <Route path="/admin/closet/review" element={<AdminClosetReview />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
  return setClosetReview
}

const deck = () => screen.getByRole('region', { name: 'Flagged pieces' })
const outcome = (name) =>
  within(deck()).getByRole('button', { name: new RegExp(`^${name}`) })

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
  vi.unstubAllGlobals()
})

describe('AdminClosetReview', () => {
  it('shows the banner, the tiles and the first card of the deck', async () => {
    stub({ 'GET /api/closet/review': review() })
    const setClosetReview = renderPage()
    expect(
      await screen.findByRole('heading', { name: 'never worn' }),
    ).toBeInTheDocument()
    expect(screen.getByText('3 flagged · autumn turn')).toBeInTheDocument()
    expect(
      screen.getByText(
        'It’s the autumn turn. 2 summer pieces close their season until May.',
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Pack all 2' }),
    ).toBeInTheDocument()
    const tiles = screen.getByRole('group', { name: 'Closet figures' })
    expect(within(tiles).getByText('Active pieces')).toBeInTheDocument()
    expect(within(tiles).getByText('6')).toBeInTheDocument()
    expect(within(deck()).getByText('1 of 3 flagged')).toBeInTheDocument()
    expect(
      within(deck()).getByText('Worn 0× in 12 months · added Jun 1 · size M'),
    ).toBeInTheDocument()
    expect(setClosetReview).toHaveBeenCalledWith(3)
  })

  it('lists every flag as a sentence, the opinion last with its word', async () => {
    stub({ 'GET /api/closet/review': review({ deck: [LINEN, NEVER] }) })
    renderPage()
    await screen.findByRole('heading', { name: 'linen shirt' })
    const items = within(deck()).getAllByRole('listitem')
    expect(items.map((li) => li.textContent)).toEqual([
      'Out of season until May: it is worn May to September.',
      'Opinion: The linen reads looser than how you dress now.',
    ])
    expect(items.at(-1)).toHaveClass('evidence-opinion')
    expect(within(items.at(-1)).getByText('Opinion:')).toBeInTheDocument()
  })

  it('marks the suggested outcome', async () => {
    stub({ 'GET /api/closet/review': review({ deck: [LINEN] }) })
    renderPage()
    await screen.findByRole('heading', { name: 'linen shirt' })
    expect(outcome('Pack away')).toHaveAttribute('data-suggested', 'true')
    expect(outcome('Pack away')).toHaveAccessibleName(
      'Pack away, pick a month, suggested',
    )
    expect(outcome('Keep')).not.toHaveAttribute('data-suggested')
  })

  it('advances the deck in order after Keep, then Skip, to the empty state', async () => {
    const user = userEvent.setup()
    const calls = stub({
      'GET /api/closet/review': reads(
        review(),
        review({ deck: [LINEN, SHORTS] }),
      ),
      'POST /api/closet/garments/g1/decision': {
        undo: 'u1',
        id: 'g1',
        status: 'active',
      },
    })
    renderPage()
    await screen.findByRole('heading', { name: 'never worn' })
    await user.click(outcome('Keep'))
    expect(
      await screen.findByRole('heading', { name: 'linen shirt' }),
    ).toHaveFocus()
    expect(within(deck()).getByText('2 of 3 flagged')).toBeInTheDocument()
    expect(calls.find((c) => c.method === 'POST').body).toEqual({
      outcome: 'keep',
    })
    await user.click(within(deck()).getByRole('button', { name: 'Skip' }))
    expect(screen.getByRole('heading', { name: 'shorts' })).toHaveFocus()
    expect(within(deck()).getByText('3 of 3 flagged')).toBeInTheDocument()
    await user.click(within(deck()).getByRole('button', { name: 'Skip' }))
    expect(
      screen.getByText('Nothing to decide. Next season turn: late April.'),
    ).toBeInTheDocument()
  })

  it('packs away with the month prefilled from the season window', async () => {
    const user = userEvent.setup()
    const calls = stub({
      'GET /api/closet/review': reads(
        review({ deck: [LINEN] }),
        review({ deck: [] }),
      ),
      'POST /api/closet/garments/g2/decision': {
        undo: 'u2',
        id: 'g2',
        status: 'packed',
      },
    })
    renderPage()
    await screen.findByRole('heading', { name: 'linen shirt' })
    await user.click(outcome('Pack away'))
    const month = screen.getByLabelText('Back in')
    expect(month).toHaveValue('2027-05')
    expect(month).toHaveAttribute('min', '2026-12')
    await user.click(screen.getByRole('button', { name: 'Pack away' }))
    await screen.findByText('Nothing to decide. Next season turn: late April.')
    expect(calls.find((c) => c.method === 'POST').body).toEqual({
      outcome: 'pack',
      back_on: '2027-05-01',
    })
    expect(screen.getByRole('status')).toHaveTextContent(
      'Packed away: linen shirt',
    )
  })

  it('donates in one press', async () => {
    const user = userEvent.setup()
    const calls = stub({
      'GET /api/closet/review': reads(review(), review({ deck: [LINEN] })),
      'POST /api/closet/garments/g1/decision': {
        undo: 'u1',
        id: 'g1',
        status: 'gone',
      },
    })
    renderPage()
    await screen.findByRole('heading', { name: 'never worn' })
    await user.click(outcome('Donate'))
    await screen.findByRole('heading', { name: 'linen shirt' })
    expect(calls.find((c) => c.method === 'POST').body).toEqual({
      outcome: 'donate',
    })
  })

  it('sells through the checklist, which copies the listing', async () => {
    const user = userEvent.setup()
    const writeText = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })
    const never = {
      ...NEVER,
      garment: {
        ...NEVER.garment,
        brand: 'Uniqlo',
        material: 'cotton',
        notes: 'pilled',
      },
    }
    const calls = stub({
      'GET /api/closet/review': reads(
        review({ deck: [never] }),
        review({ deck: [], listed: [{ ...never.garment, status: 'listed' }] }),
      ),
      'POST /api/closet/garments/g1/decision': {
        undo: 'u1',
        id: 'g1',
        status: 'listed',
      },
    })
    renderPage()
    await screen.findByRole('heading', { name: 'never worn' })
    await user.click(outcome('Sell'))
    const sheet = screen.getByRole('dialog', { name: 'Sell the never worn' })
    expect(within(sheet).getByText('Uniqlo')).toBeInTheDocument()
    expect(within(sheet).getByText('pilled')).toBeInTheDocument()
    await user.click(
      within(sheet).getByRole('button', { name: 'Copy listing' }),
    )
    expect(writeText).toHaveBeenCalledWith(
      'Item: never worn\nBrand: Uniqlo\nSize: M\nCondition: pilled\nMaterial: cotton',
    )
    expect(within(sheet).getByText('Copied')).toBeInTheDocument()
    await user.click(within(sheet).getByRole('button', { name: 'List it' }))
    expect(
      await screen.findByRole('region', { name: 'Listed for sale' }),
    ).toBeInTheDocument()
    expect(calls.find((c) => c.method === 'POST').body).toEqual({
      outcome: 'sell',
    })
  })

  it('marks a listed garment sold', async () => {
    const user = userEvent.setup()
    const listed = garment('g9', 'wool coat', { status: 'listed' })
    const calls = stub({
      'GET /api/closet/review': reads(
        review({ deck: [], listed: [listed] }),
        review({ deck: [] }),
      ),
      'POST /api/closet/garments/g9/sold': {
        undo: 'u9',
        id: 'g9',
        status: 'gone',
      },
    })
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Mark sold' }))
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('Sold: wool coat'),
    )
    expect(calls.some((c) => c.path === '/api/closet/garments/g9/sold')).toBe(
      true,
    )
  })

  it('packs all from the banner and undoes it from the toast', async () => {
    const user = userEvent.setup()
    const calls = stub({
      'GET /api/closet/review': reads(
        review(),
        review({ banner: null, deck: [NEVER, SHORTS] }),
        review(),
      ),
      'POST /api/closet/pack-all': { ids: ['g2', 'g4'], undo: 'tok' },
      'POST /api/closet/undo': { ids: ['g2', 'g4'] },
    })
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Pack all 2' }))
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Packed 2 pieces',
    )
    expect(
      screen.queryByRole('region', { name: 'Season turn' }),
    ).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    await screen.findByRole('region', { name: 'Season turn' })
    expect(calls.find((c) => c.path === '/api/closet/undo').body).toEqual({
      token: 'tok',
    })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('undoes a deck decision, bringing the card back', async () => {
    const user = userEvent.setup()
    stub({
      'GET /api/closet/review': reads(
        review(),
        review({ deck: [LINEN, SHORTS] }),
        review(),
      ),
      'POST /api/closet/garments/g1/decision': {
        undo: 'u1',
        id: 'g1',
        status: 'active',
      },
      'POST /api/closet/undo': { ids: ['g1'] },
    })
    renderPage()
    await screen.findByRole('heading', { name: 'never worn' })
    await user.click(outcome('Keep'))
    await screen.findByRole('heading', { name: 'linen shirt' })
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    await screen.findByRole('heading', { name: 'never worn' })
    expect(within(deck()).getByText('1 of 3 flagged')).toBeInTheDocument()
  })

  it('unpacks what is due back', async () => {
    const user = userEvent.setup()
    const coat = garment('g7', 'wool coat', {
      status: 'packed',
      back_on: '2026-11-01',
    })
    stub({
      'GET /api/closet/review': reads(review({ due_back: [coat] }), review()),
      'POST /api/closet/unpack-all': { ids: ['g7'], undo: 'tok' },
    })
    renderPage()
    const due = await screen.findByRole('region', { name: 'Due back' })
    expect(due).toHaveTextContent('1 piece due back: wool coat.')
    await user.click(within(due).getByRole('button', { name: 'Unpack all' }))
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Unpacked 1 piece',
    )
    expect(
      screen.queryByRole('region', { name: 'Due back' }),
    ).not.toBeInTheDocument()
  })

  it('dismisses the banner on the server, and One by one only here', async () => {
    const user = userEvent.setup()
    const calls = stub({
      'GET /api/closet/review': reads(review(), review({ banner: null })),
      'POST /api/closet/review/dismiss': { turn_on: '2026-10-25' },
    })
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'One by one' }))
    expect(
      screen.queryByRole('region', { name: 'Season turn' }),
    ).not.toBeInTheDocument()
    expect(calls.filter((c) => c.method === 'POST')).toEqual([])
    expect(screen.getByRole('heading', { name: 'never worn' })).toHaveFocus()
  })

  it('shows a refused outcome in the route’s words and keeps the card', async () => {
    const user = userEvent.setup()
    stub({
      'GET /api/closet/review': review(),
      'POST /api/closet/garments/g1/decision': json(
        { detail: 'That garment is not active' },
        409,
      ),
    })
    renderPage()
    await screen.findByRole('heading', { name: 'never worn' })
    await user.click(outcome('Keep'))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That garment is not active',
    )
    expect(
      screen.getByRole('heading', { name: 'never worn' }),
    ).toBeInTheDocument()
  })

  it('leaves out the turn words when no turn is open', async () => {
    stub({
      'GET /api/closet/review': review({
        turn: { name: 'autumn', on: '2026-10-25', open: false },
        banner: null,
        deck: [],
      }),
    })
    renderPage()
    await screen.findByText('Nothing to decide. Next season turn: late April.')
    expect(screen.queryByText(/autumn turn/)).not.toBeInTheDocument()
  })
})
