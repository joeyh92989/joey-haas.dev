import '@testing-library/jest-dom'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AdminClosetToday from './AdminClosetToday.jsx'

function tile(slot, id, name, extra = {}) {
  return {
    slot,
    id,
    name,
    primary_hex: '#334455',
    secondary_hex: null,
    image: null,
    qualifier: 'worn 2× this month',
    transient: false,
    ...extra,
  }
}

const LEAD = {
  garments: [
    tile('top', 't1', 'navy oxford'),
    tile('bottom', 'b1', 'grey chinos'),
    tile('shoes', 's1', 'white sneakers'),
  ],
  reason: 'Navy and grey keep it calm.',
  ranked_by: 'model',
}
const ALT_A = {
  garments: [
    tile('top', 't2', 'grey tee'),
    tile('bottom', 'b2', 'jeans'),
    tile('shoes', 's1', 'white sneakers'),
  ],
  reason: 'Easy for a mild day.',
  ranked_by: 'model',
}
const ALT_B = {
  garments: [
    tile('top', 't3', 'white tee'),
    tile('bottom', 'b2', 'jeans'),
    tile('shoes', 's2', 'loafers'),
  ],
  reason: 'Template pick.',
  ranked_by: 'template',
}

function plan(extra = {}) {
  return {
    day: '2026-11-09',
    occasion: 'office',
    bike: false,
    planned_at: '2026-11-09T06:30:00Z', // the night before in Denver
    ranked_by: 'model',
    model_note: null,
    weather: {
      low: 34,
      high: 58,
      swing: 24,
      wet: false,
      snow: false,
      forecast: true,
      sentence: 'Cold morning, mild afternoon.',
      hours: [
        { label: '7a', temp: 34 },
        { label: '12p', temp: 52 },
      ],
    },
    lead: LEAD,
    alternatives: [ALT_A, ALT_B],
    footnote: { active: 40, fit: 22, skipped_recent: 3 },
    lock: null,
    ...extra,
  }
}

function answer(extra = {}, planExtra = {}) {
  return {
    plan: plan(planExtra),
    planned_just_now: false,
    worn: null,
    defaults: { occasion: 'office', bike: false },
    occasions: ['office', 'wfh', 'date', 'weekend', 'travel', 'event'],
    ...extra,
  }
}

function json(body, status = 200) {
  return { ok: status < 300, status, json: async () => body }
}

/** `POST /api/closet/wore` as the route answers: the outfit it recorded. */
const recordWore = (call) =>
  json(
    {
      worn: {
        id: 9,
        source: call.body.source,
        garments: call.body.garments,
      },
    },
    201,
  )

/** Today's record of the stored lead, as `worn` on the route's answer. */
const WORN_LEAD = {
  id: 3,
  source: 'planned',
  garments: LEAD.garments.map((g) => ({ slot: g.slot, id: g.id })),
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
        typeof options.body === 'string'
          ? JSON.parse(options.body)
          : options.body
      const call = { method, url: String(url), path, body }
      calls.push(call)
      const route = routes[`${method} ${path}`]
      if (!route) return json({ detail: 'not stubbed' }, 404)
      const result = await (typeof route === 'function' ? route(call) : route)
      return result?.ok === undefined ? json(result) : result
    }),
  )
  return calls
}

function renderPage() {
  return render(
    <MemoryRouter>
      <AdminClosetToday />
    </MemoryRouter>,
  )
}

const card = () => screen.getByRole('region', { name: 'Wear this' })

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
  localStorage.clear()
})

describe('AdminClosetToday', () => {
  it('shows the weather, the lead, two alternatives and the footnote', async () => {
    stub({ 'GET /api/closet/today': answer() })
    renderPage()
    expect(await screen.findByText('navy oxford')).toBeInTheDocument()
    expect(
      screen.getByText('Monday, Nov 9 · planned last night'),
    ).toBeInTheDocument()
    const weather = screen.getByRole('region', { name: 'Weather' })
    expect(weather).toHaveTextContent('34°')
    expect(weather).toHaveTextContent('58°')
    expect(weather).toHaveTextContent('Cold morning, mild afternoon.')
    expect(within(card()).getByText('Navy and grey keep it calm.'))
    const alts = screen.getByRole('list', { name: 'Alternatives' })
    expect(within(alts).getAllByRole('listitem')).toHaveLength(2)
    expect(within(alts).getByText('grey tee · jeans · white sneakers'))
    expect(
      screen.getByText(
        '40 active · 22 fit today · 3 skipped as worn this week · planned last night',
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Office' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('says "picked without the model" for a template outfit', async () => {
    stub({
      'GET /api/closet/today': answer(
        {},
        {
          ranked_by: 'template',
          model_note: "Gemini's daily quota is used up",
          lead: { ...LEAD, ranked_by: 'template', reason: '' },
        },
      ),
    })
    renderPage()
    await screen.findByText('navy oxford')
    expect(
      within(card()).getByText('picked without the model'),
    ).toBeInTheDocument()
    const alts = screen.getByRole('list', { name: 'Alternatives' })
    expect(
      within(alts).getByText('Template pick. Picked without the model.'),
    ).toBeInTheDocument()
    expect(
      screen.getByText("Model: Gemini's daily quota is used up"),
    ).toBeInTheDocument()
  })

  it('reads the chip’s stored plan when an occasion or Bike is pressed', async () => {
    const calls = stub({
      'GET /api/closet/today': (call) =>
        call.url.includes('occasion=date')
          ? answer({}, { occasion: 'date', bike: call.url.endsWith('true') })
          : answer(),
    })
    renderPage()
    await screen.findByText('navy oxford')
    await userEvent.click(screen.getByRole('button', { name: 'Date' }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Date' })).toHaveAttribute(
        'aria-pressed',
        'true',
      ),
    )
    expect(calls.at(-1).url).toMatch(/occasion=date&bike=false$/)
    await userEvent.click(screen.getByRole('button', { name: 'Bike' }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Bike' })).toHaveAttribute(
        'aria-pressed',
        'true',
      ),
    )
    // The pressed occasion stays when Bike is pressed.
    expect(calls.at(-1).url).toMatch(/occasion=date&bike=true$/)
    expect(calls.every((c) => c.method === 'GET')).toBe(true)
  })

  it('builds around a garment, and a second press unlocks', async () => {
    const calls = stub({
      'GET /api/closet/today': answer(),
      'POST /api/closet/plan': answer(
        { planned_just_now: true },
        { lock: 't1', alternatives: [ALT_B] },
      ),
    })
    renderPage()
    await screen.findByText('navy oxford')
    const pill = screen.getByRole('button', {
      name: 'Build around the navy oxford',
    })
    expect(pill).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(pill)
    // The name says what the pill shows: Built around once it is pressed.
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Built around the navy oxford' }),
      ).toHaveAttribute('aria-pressed', 'true'),
    )
    expect(calls.at(-1)).toMatchObject({
      method: 'POST',
      path: '/api/closet/plan',
      body: { occasion: 'office', bike: false, lock: 't1' },
    })
    expect(screen.getAllByText(/planned just now/)).toHaveLength(2)

    await userEvent.click(
      screen.getByRole('button', { name: 'Built around the navy oxford' }),
    )
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Build around the navy oxford' }),
      ).toHaveAttribute('aria-pressed', 'false'),
    )
    expect(calls.at(-1)).toMatchObject({
      method: 'GET',
      path: '/api/closet/today',
    })
  })

  it('records Not this with its reason and shows the new plan', async () => {
    const calls = stub({
      'GET /api/closet/today': answer(),
      'POST /api/closet/plan': answer(
        { planned_just_now: true },
        { lead: ALT_A, alternatives: [ALT_B] },
      ),
    })
    renderPage()
    await screen.findByText('navy oxford')
    const ask = screen.getByRole('button', { name: 'Not this…' })
    await userEvent.click(ask)
    expect(ask).toHaveAttribute('aria-expanded', 'true')
    const reasons = screen.getByRole('group', { name: 'Why not this' })
    await userEvent.click(
      within(reasons).getByRole('button', { name: 'Too warm' }),
    )
    await waitFor(() =>
      expect(within(card()).getByText('grey tee')).toBeInTheDocument(),
    )
    expect(calls.at(-1).body).toEqual({
      occasion: 'office',
      bike: false,
      not_this: 'too_warm',
      declined: [
        { slot: 'top', id: 't1' },
        { slot: 'bottom', id: 'b1' },
        { slot: 'shoes', id: 's1' },
      ],
    })
  })

  it('Not this turns down the swapped outfit on screen, not the stored one', async () => {
    const calls = stub({
      'GET /api/closet/today': answer(),
      'GET /api/closet/candidates': {
        slot: 'top',
        candidates: [tile('top', 't9', 'flannel')],
      },
      'POST /api/closet/plan': answer(
        { planned_just_now: true },
        { lead: ALT_A, alternatives: [] },
      ),
    })
    renderPage()
    await screen.findByText('navy oxford')
    await userEvent.click(screen.getByRole('button', { name: 'Swap a piece' }))
    const sheet = await screen.findByRole('dialog')
    await userEvent.click(
      await within(sheet).findByRole('button', { name: /flannel/ }),
    )
    await waitFor(() =>
      expect(within(card()).getByText('flannel')).toBeInTheDocument(),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Not this…' }))
    await userEvent.click(screen.getByRole('button', { name: 'Too warm' }))
    await waitFor(() =>
      expect(within(card()).getByText('grey tee')).toBeInTheDocument(),
    )
    expect(calls.at(-1).body.declined).toEqual([
      { slot: 'top', id: 't9' },
      { slot: 'bottom', id: 'b1' },
      { slot: 'shoes', id: 's1' },
    ])
  })

  it('Not this on a Build around plan keeps the lock', async () => {
    const calls = stub({
      'GET /api/closet/today': answer({}, { lock: 't1' }),
      'POST /api/closet/plan': answer({}, { lock: 't1', lead: LEAD }),
    })
    renderPage()
    await screen.findByText('navy oxford')
    await userEvent.click(screen.getByRole('button', { name: 'Not this…' }))
    await userEvent.click(screen.getByRole('button', { name: 'Too formal' }))
    await waitFor(() => expect(calls.at(-1).path).toBe('/api/closet/plan'))
    expect(calls.at(-1).body).toMatchObject({
      not_this: 'too_formal',
      lock: 't1',
    })
  })

  it('keeps a locked template plan’s reason, and the swap note on it', async () => {
    stub({
      'GET /api/closet/today': answer(
        {},
        {
          ranked_by: 'template',
          lock: 't1',
          lead: {
            ...LEAD,
            ranked_by: 'template',
            reason: 'You locked the navy oxford.',
          },
        },
      ),
      'GET /api/closet/candidates': {
        slot: 'top',
        candidates: [tile('top', 't9', 'flannel')],
      },
    })
    renderPage()
    await screen.findByText('navy oxford')
    expect(
      await within(card()).findByText(
        'You locked the navy oxford. Picked without the model.',
      ),
    ).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Swap a piece' }))
    const sheet = await screen.findByRole('dialog')
    await userEvent.click(
      await within(sheet).findByRole('button', { name: /flannel/ }),
    )
    expect(
      await within(card()).findByText(
        'You locked the navy oxford. (you swapped the top) · picked without the model',
      ),
    ).toBeInTheDocument()
  })

  it('swaps one piece on the page and wears it as swapped', async () => {
    const calls = stub({
      'GET /api/closet/today': answer(),
      'GET /api/closet/candidates': (call) =>
        call.url.includes('slot=shoes')
          ? {
              slot: 'shoes',
              candidates: [
                tile('shoes', 's1', 'white sneakers'),
                tile('shoes', 's2', 'loafers', { qualifier: 'not worn yet' }),
              ],
            }
          : { slot: 'top', candidates: [tile('top', 't1', 'navy oxford')] },
      'POST /api/closet/wore': recordWore,
    })
    renderPage()
    await screen.findByText('navy oxford')
    await userEvent.click(screen.getByRole('button', { name: 'Swap a piece' }))
    const sheet = await screen.findByRole('dialog')
    expect(
      await within(sheet).findByText('Nothing else fits this slot today.'),
    ).toBeInTheDocument()
    await userEvent.click(within(sheet).getByRole('button', { name: 'Shoes' }))
    // The current shoes are not offered.
    const loafers = await within(sheet).findByRole('button', {
      name: /loafers/,
    })
    expect(
      within(sheet).queryByRole('button', { name: /white sneakers/ }),
    ).not.toBeInTheDocument()
    await userEvent.click(loafers)
    await waitFor(() =>
      expect(within(card()).getByText('loafers')).toBeInTheDocument(),
    )
    expect(within(card()).queryByText('white sneakers')).not.toBeInTheDocument()
    expect(
      within(card()).getByText(
        'Navy and grey keep it calm. (you swapped the shoes)',
      ),
    ).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Wore this' }))
    expect(await screen.findByText('Worn ✓')).toBeInTheDocument()
    expect(calls.at(-1).body).toEqual({
      occasion: 'office',
      bike: false,
      source: 'swapped',
      garments: [
        { slot: 'top', id: 't1' },
        { slot: 'bottom', id: 'b1' },
        { slot: 'shoes', id: 's2' },
      ],
    })
  })

  it('Wore this shows "Worn ✓ · Change", and Change offers the actions again', async () => {
    const calls = stub({
      'GET /api/closet/today': answer(),
      'POST /api/closet/wore': recordWore,
    })
    renderPage()
    await screen.findByText('navy oxford')
    await userEvent.click(screen.getByRole('button', { name: 'Wore this' }))
    expect(await within(card()).findByText('Worn ✓')).toBeInTheDocument()
    expect(calls.at(-1).body.source).toBe('planned')
    expect(
      screen.queryByRole('button', { name: 'Wore this' }),
    ).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Change' }))
    expect(
      screen.getByRole('button', { name: 'Wore this' }),
    ).toBeInTheDocument()
  })

  it('opens already worn when today was recorded', async () => {
    stub({ 'GET /api/closet/today': answer({ worn: WORN_LEAD }) })
    renderPage()
    expect(await screen.findByText('Worn ✓')).toBeInTheDocument()
  })

  it('wears an alternative instead, recorded as one', async () => {
    const calls = stub({
      'GET /api/closet/today': answer(),
      'POST /api/closet/wore': recordWore,
    })
    renderPage()
    await screen.findByText('navy oxford')
    const alts = screen.getByRole('list', { name: 'Alternatives' })
    await userEvent.click(
      within(alts).getAllByRole('button', { name: 'Wear this instead' })[0],
    )
    expect(within(card()).getByText('grey tee')).toBeInTheDocument()
    // The old lead takes the alternative's place.
    expect(
      within(alts).getByText('navy oxford · grey chinos · white sneakers'),
    ).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Wore this' }))
    await screen.findByText('Worn ✓')
    expect(calls.at(-1).body).toMatchObject({
      source: 'alternative',
      garments: [
        { slot: 'top', id: 't2' },
        { slot: 'bottom', id: 'b2' },
        { slot: 'shoes', id: 's1' },
      ],
    })
  })

  it('matches a garment from the closet by building around it', async () => {
    const calls = stub({
      'GET /api/closet/today': answer(),
      'GET /api/closet/garments': {
        garments: [
          { id: 'b2', name: 'jeans', category: 'bottom', status: 'active' },
          { id: 'x', name: 'packed coat', category: 'outer', status: 'packed' },
          { id: 'u', name: null, category: null, status: 'untagged' },
        ],
        counts: {},
      },
      'POST /api/closet/plan': answer({}, { lock: 'b2', lead: ALT_A }),
    })
    renderPage()
    await screen.findByText('navy oxford')
    await userEvent.click(screen.getByRole('button', { name: 'Match this…' }))
    const sheet = await screen.findByRole('dialog')
    await userEvent.click(
      within(sheet).getByRole('button', { name: 'From the closet' }),
    )
    const pick = await within(sheet).findByRole('button', { name: /jeans/ })
    expect(within(sheet).queryByText('packed coat')).not.toBeInTheDocument()
    await userEvent.click(pick)
    await waitFor(() =>
      expect(within(card()).getByText('grey tee')).toBeInTheDocument(),
    )
    expect(calls.at(-1).body).toEqual({
      occasion: 'office',
      bike: false,
      lock: 'b2',
    })
  })

  it('matches a photo, then saves the piece as owned and wears it', async () => {
    const shirt = tile('top', 'match', 'green shirt', {
      transient: true,
      qualifier: 'not owned',
    })
    const matched = {
      garments: [shirt, LEAD.garments[1], LEAD.garments[2]],
      reason: 'Built around the green shirt from your photo. Earthy.',
      ranked_by: 'model',
    }
    const attributes = { category: 'top', name: 'green shirt' }
    const calls = stub({
      'GET /api/closet/today': answer(),
      'POST /api/closet/match': answer(
        { planned_just_now: true },
        { lead: matched, alternatives: [], match: attributes },
      ),
      'POST /api/closet/garments/from-match': json(
        { id: 'g77', name: 'green shirt', image: null },
        201,
      ),
      'POST /api/closet/wore': recordWore,
    })
    renderPage()
    await screen.findByText('navy oxford')
    await userEvent.click(screen.getByRole('button', { name: 'Match this…' }))
    const sheet = await screen.findByRole('dialog')
    const file = new File(['x'], 'shirt.jpg', { type: 'image/jpeg' })
    // The input is visually hidden: its label carries the focus ring.
    expect(
      within(sheet).getByText('From a photo').closest('label'),
    ).toHaveClass('btn-file')
    await userEvent.upload(within(sheet).getByLabelText('From a photo'), file)
    expect(await within(card()).findByText('green shirt')).toBeInTheDocument()
    const match = calls.find((c) => c.path === '/api/closet/match')
    expect(match.body.get('photo')).toBe(file)
    expect(match.body.get('occasion')).toBe('office')
    // A piece not owned cannot be recorded as worn.
    expect(screen.getByRole('button', { name: 'Wore this' })).toBeDisabled()
    expect(
      screen.queryByRole('button', { name: 'Build around the green shirt' }),
    ).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Save as owned' }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Wore this' })).toBeEnabled(),
    )
    const save = calls.find((c) => c.path === '/api/closet/garments/from-match')
    expect(save.body.get('photo')).toBe(file)
    expect(JSON.parse(save.body.get('attributes'))).toEqual(attributes)
    expect(within(card()).getByText('not worn yet')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Wore this' }))
    await screen.findByText('Worn ✓')
    expect(calls.at(-1).body).toMatchObject({
      source: 'own',
      garments: [
        { slot: 'top', id: 'g77' },
        { slot: 'bottom', id: 'b1' },
        { slot: 'shoes', id: 's1' },
      ],
    })
  })

  it('shows the model note when there is nothing to wear', async () => {
    stub({
      'GET /api/closet/today': answer(
        {},
        { lead: null, alternatives: [], model_note: 'Nothing fits the day' },
      ),
    })
    renderPage()
    expect(await screen.findByText('Nothing fits the day')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Wore this' }),
    ).not.toBeInTheDocument()
  })

  it('says the session ended on a 401', async () => {
    stub({ 'GET /api/closet/today': json({}, 401) })
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Your session ended',
    )
  })

  it('says another outfit was worn when the record is not the lead', async () => {
    stub({
      'GET /api/closet/today': answer({
        worn: {
          id: 3,
          source: 'planned',
          garments: [
            { slot: 'top', id: 't2' },
            { slot: 'bottom', id: 'b2' },
            { slot: 'shoes', id: 's1' },
          ],
        },
      }),
    })
    renderPage()
    await screen.findByText('navy oxford')
    expect(
      await within(card()).findByText('Worn today: another outfit'),
    ).toBeInTheDocument()
    expect(within(card()).queryByText('Worn ✓')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Change' }))
    expect(screen.getByRole('button', { name: 'Wore this' })).toBeEnabled()
  })

  it('after Wore this, a chip with another lead says another outfit', async () => {
    let worn = null
    stub({
      'GET /api/closet/today': (call) =>
        call.url.includes('occasion=date')
          ? answer({ worn }, { occasion: 'date', lead: ALT_A })
          : answer({ worn }),
      'POST /api/closet/wore': (call) => {
        worn = { id: 9, source: 'planned', garments: call.body.garments }
        return json({ worn }, 201)
      },
    })
    renderPage()
    await screen.findByText('navy oxford')
    await userEvent.click(screen.getByRole('button', { name: 'Wore this' }))
    expect(await within(card()).findByText('Worn ✓')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Date' }))
    expect(
      await within(card()).findByText('Worn today: another outfit'),
    ).toBeInTheDocument()
    expect(within(card()).getByText('grey tee')).toBeInTheDocument()
  })

  it('keeps one status line and says what is running', async () => {
    let finish
    stub({
      'GET /api/closet/today': answer(),
      'POST /api/closet/wore': (call) =>
        new Promise((resolve) => {
          finish = () => resolve(recordWore(call))
        }),
    })
    renderPage()
    await screen.findByText('navy oxford')
    const status = screen.getByRole('status')
    expect(status).toHaveTextContent(/^$/)
    await userEvent.click(screen.getByRole('button', { name: 'Wore this' }))
    expect(status).toHaveTextContent('Recording…')
    // The chips are disabled, not silently ignored, while it runs.
    expect(screen.getByRole('button', { name: 'Date' })).toBeDisabled()
    finish()
    await within(card()).findByText('Worn ✓')
    expect(screen.getByRole('status')).toBe(status)
    expect(status).toHaveTextContent(/^$/)
    expect(screen.getByRole('button', { name: 'Date' })).toBeEnabled()
  })

  it('says it may be waking the server or planning on a slow first load', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      stub({ 'GET /api/closet/today': () => new Promise(() => {}) })
      renderPage()
      expect(screen.getByText('Loading…')).toBeInTheDocument()
      await act(async () => {
        vi.advanceTimersByTime(3000)
      })
      expect(
        screen.getByText('Waking the server or planning…'),
      ).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('moves focus to the card once a From the closet plan lands', async () => {
    stub({
      'GET /api/closet/today': answer(),
      'GET /api/closet/garments': {
        garments: [
          { id: 'b2', name: 'jeans', category: 'bottom', status: 'active' },
        ],
        counts: {},
      },
      'POST /api/closet/plan': answer({}, { lock: 'b2', lead: ALT_A }),
    })
    renderPage()
    await screen.findByText('navy oxford')
    await userEvent.click(screen.getByRole('button', { name: 'Match this…' }))
    const sheet = await screen.findByRole('dialog')
    await userEvent.click(
      within(sheet).getByRole('button', { name: 'From the closet' }),
    )
    await userEvent.click(
      await within(sheet).findByRole('button', { name: /jeans/ }),
    )
    await waitFor(() =>
      expect(within(card()).getByText('grey tee')).toBeInTheDocument(),
    )
    await waitFor(() =>
      expect(document.activeElement).toHaveTextContent('Wear this'),
    )
    expect(document.activeElement).toHaveAttribute('id', 'today-wear')
  })

  it('disables Save as owned while another request runs', async () => {
    const shirt = tile('top', 'match', 'green shirt', {
      transient: true,
      qualifier: 'not owned',
    })
    stub({
      'GET /api/closet/today': answer(),
      'POST /api/closet/match': answer(
        {},
        {
          lead: { ...LEAD, garments: [shirt, ...LEAD.garments.slice(1)] },
          alternatives: [],
          match: { category: 'top' },
        },
      ),
      'POST /api/closet/plan': () => new Promise(() => {}),
    })
    renderPage()
    await screen.findByText('navy oxford')
    await userEvent.click(screen.getByRole('button', { name: 'Match this…' }))
    const sheet = await screen.findByRole('dialog')
    await userEvent.upload(
      within(sheet).getByLabelText('From a photo'),
      new File(['x'], 'shirt.jpg', { type: 'image/jpeg' }),
    )
    const save = await screen.findByRole('button', { name: 'Save as owned' })
    expect(save).toBeEnabled()
    await userEvent.click(
      screen.getByRole('button', { name: 'Build around the grey chinos' }),
    )
    expect(screen.getByRole('button', { name: 'Save as owned' })).toBeDisabled()
  })

  it('gives alternatives with the same pieces their own keys', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      stub({
        'GET /api/closet/today': answer({}, { alternatives: [ALT_A, ALT_A] }),
      })
      renderPage()
      await screen.findByText('navy oxford')
      expect(
        errors.mock.calls.some((args) => String(args[0]).includes('same key')),
      ).toBe(false)
    } finally {
      errors.mockRestore()
    }
  })

  it('records a swapped alternative as swapped', async () => {
    const calls = stub({
      'GET /api/closet/today': answer(),
      'GET /api/closet/candidates': {
        slot: 'top',
        candidates: [tile('top', 't9', 'flannel')],
      },
      'POST /api/closet/wore': recordWore,
    })
    renderPage()
    await screen.findByText('navy oxford')
    const alts = screen.getByRole('list', { name: 'Alternatives' })
    await userEvent.click(
      within(alts).getAllByRole('button', { name: 'Wear this instead' })[0],
    )
    await userEvent.click(screen.getByRole('button', { name: 'Swap a piece' }))
    const sheet = await screen.findByRole('dialog')
    await userEvent.click(
      await within(sheet).findByRole('button', { name: /flannel/ }),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Wore this' }))
    await within(card()).findByText('Worn ✓')
    expect(calls.at(-1).body.source).toBe('swapped')
  })
})
