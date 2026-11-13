import '@testing-library/jest-dom'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AdminCloset from './AdminCloset.jsx'

function garment(id, name, fields = {}) {
  return {
    id,
    name,
    category: 'top',
    subtype: null,
    brand: null,
    primary_color: null,
    primary_hex: null,
    secondary_color: null,
    secondary_hex: null,
    pattern: null,
    material: null,
    warmth: 2,
    formality: 2,
    seasons: [],
    notes: null,
    acquired_on: null,
    status: 'active',
    back_on: null,
    tag_source: 'model',
    tag_attempts: 0,
    created_at: '2026-11-01T00:00:00Z',
    updated_at: '2026-11-01T00:00:00Z',
    image: `/api/closet/garments/${id}/image?v=1`,
    wears_12mo: 0,
    last_worn: null,
    ...fields,
  }
}

const GARMENTS = [
  garment('a', 'Navy oxford', { wears_12mo: 14, last_worn: '2026-11-06' }),
  garment('b', 'Grey chinos', { category: 'bottom', wears_12mo: 7 }),
  garment('c', 'Wool overcoat', {
    category: 'outer',
    warmth: 5,
    formality: 4,
    status: 'packed',
    back_on: '2027-05-01',
  }),
  garment('d', null, {
    category: null,
    status: 'untagged',
    tag_source: null,
    warmth: null,
    formality: null,
  }),
]

function closet(garments) {
  const counts = { total: garments.length }
  for (const s of ['untagged', 'active', 'packed', 'listed', 'gone'])
    counts[s] = garments.filter((g) => g.status === s).length
  return { garments, counts }
}

function json(body, status = 200) {
  return { ok: status < 300, status, json: async () => body }
}

function stubApi(handlers = {}) {
  const calls = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url, options = {}) => {
      const path = String(url).replace(/^.*\/api/, '/api')
      const method = options.method ?? 'GET'
      calls.push({ method, path, body: options.body })
      const handler = handlers[`${method} ${path}`]
      if (handler) return handler(options)
      if (method === 'GET' && path === '/api/closet/garments')
        return json(closet(GARMENTS))
      return json({}, 404)
    }),
  )
  return calls
}

function renderCloset() {
  return render(
    <MemoryRouter>
      <AdminCloset />
    </MemoryRouter>,
  )
}

const tiles = () =>
  within(screen.getByRole('list'))
    .getAllByRole('link')
    .map((link) => link.getAttribute('href'))

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('AdminCloset', () => {
  it('opens on the active and untagged garments as tiles, with the counts line', async () => {
    stubApi()
    renderCloset()
    await screen.findByRole('list')
    expect(tiles()).toEqual([
      '/admin/closet/a',
      '/admin/closet/b',
      '/admin/closet/d',
    ])
    expect(
      screen.getByText('4 pieces · 2 active · 1 packed · 1 untagged'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Navy oxford, top, Worn 14×' }),
    ).toBeInTheDocument()
  })

  it('keeps a pressed Active chip strict: untagged pieces drop out', async () => {
    stubApi()
    renderCloset()
    await screen.findByRole('list')
    await userEvent.click(screen.getByRole('button', { name: /^Packed/ }))
    await userEvent.click(screen.getByRole('button', { name: /^Active/ }))
    expect(tiles()).toEqual(['/admin/closet/a', '/admin/closet/b'])
  })

  it('filters by status, slot and the Warm toggle', async () => {
    stubApi()
    renderCloset()
    await screen.findByRole('list')
    await userEvent.click(screen.getByRole('button', { name: /Bottoms/ }))
    expect(tiles()).toEqual(['/admin/closet/b'])
    await userEvent.click(screen.getByRole('button', { name: /Bottoms/ }))
    await userEvent.click(screen.getByRole('button', { name: /^Packed/ }))
    expect(
      screen.getByRole('link', {
        name: 'Wool overcoat, outer, Packed · back in May',
      }),
    ).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /^Untagged/ }))
    expect(
      screen.getByRole('link', {
        name: 'Untagged · add details, In the tag queue',
      }),
    ).toBeInTheDocument()
    // Warm counts the whole closet: only the packed overcoat is warm.
    await userEvent.click(screen.getByRole('button', { name: /^Untagged/ }))
    await userEvent.click(screen.getByRole('button', { name: /^Warm/ }))
    expect(tiles()).toEqual(['/admin/closet/c'])
  })

  it('switches to the list and keeps the choice for the next visit', async () => {
    stubApi()
    const { unmount } = renderCloset()
    await screen.findByRole('list')
    await userEvent.click(screen.getByRole('button', { name: 'List' }))
    const table = screen.getByRole('table')
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((cell) => cell.textContent),
    ).toEqual(['Piece', 'Type', 'Wears 12 mo', 'Last worn', 'Season', 'Next'])
    expect(within(table).getByText('Nov 6')).toBeInTheDocument()
    unmount()

    renderCloset()
    expect(await screen.findByRole('table')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'List' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('has the add bar in place of ＋ Camera: type-only, ▤ Photos', async () => {
    stubApi()
    renderCloset()
    await screen.findByRole('list')
    expect(screen.getByRole('textbox', { name: 'Add' })).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Add from photos' }),
    ).toBeInTheDocument()
    expect(screen.queryByLabelText('Add garment photos')).toBeNull()
  })

  it('shows the photos waiting for tags and tags one batch on Tag now', async () => {
    const queued = [
      garment('e', null, { status: 'untagged', tag_source: null }),
      garment('f', null, { status: 'untagged', tag_source: null }),
      // Given up on: Clothes · Check asks about it, the queue does not.
      garment('g', null, {
        status: 'untagged',
        tag_source: null,
        tag_attempts: 3,
      }),
    ]
    let after = [...queued, ...GARMENTS]
    const calls = stubApi({
      'GET /api/closet/garments': () => json(closet(after)),
      'POST /api/closet/tag': () => {
        after = GARMENTS
        return json({ tagged: 2, calls: 1, note: null, remaining: 1 })
      },
    })
    renderCloset()
    const line = await screen.findByText(/photos waiting/)
    // d (untagged, never tried) and e, f: three in the queue.
    expect(line.closest('.intake-waiting')).toHaveTextContent(
      '3 photos waiting for tags',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Tag now' }))
    expect(
      await screen.findByText(/2 tagged, 1 still queued/),
    ).toBeInTheDocument()
    expect(calls.filter((c) => c.path === '/api/closet/tag')).toHaveLength(1)
  })

  describe('a slow Tag now', () => {
    beforeEach(() => vi.useFakeTimers())
    afterEach(() => vi.useRealTimers())

    const untagged = (id) =>
      garment(id, null, { status: 'untagged', tag_source: null })

    async function startTagging(queuedPieces, tagHandler, getHandler) {
      const calls = stubApi({
        'GET /api/closet/garments':
          getHandler ??
          (() => json(closet([...queuedPieces, ...GARMENTS.slice(0, 2)]))),
        'POST /api/closet/tag': tagHandler,
      })
      renderCloset()
      await act(async () => {})
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Tag now' }))
      })
      return calls
    }

    it('names the wait with the count and seconds, then says it is still working', async () => {
      await startTagging(
        [untagged('e'), untagged('f')],
        () => new Promise(() => {}),
      )
      const status = screen.getByText(/^Tagging/)
      expect(status).toHaveTextContent('Tagging 2 photos in one batch · 0 s')
      await act(async () => {
        vi.advanceTimersByTime(29_000)
      })
      expect(status).toHaveTextContent('Tagging 2 photos in one batch · 29 s')
      expect(screen.queryByText(/Still working/)).not.toBeInTheDocument()
      await act(async () => {
        vi.advanceTimersByTime(1000)
      })
      expect(status).toHaveTextContent(
        'Tagging 2 photos in one batch · 30 s Still working. This can take up to two minutes.',
      )
    })

    it('counts one batch of ten, not the whole queue', async () => {
      const many = Array.from({ length: 18 }, (_, i) => untagged(`q${i}`))
      await startTagging(many, () => new Promise(() => {}))
      expect(screen.getByText(/^Tagging/)).toHaveTextContent(
        'Tagging 10 photos in one batch · 0 s',
      )
    })

    it('shows the deadline as an alert, not in the status line', async () => {
      await startTagging([untagged('e')], () => new Promise(() => {}))
      await act(async () => {
        vi.advanceTimersByTime(195_000)
      })
      const alert = screen.getByRole('alert')
      expect(alert).toHaveTextContent(/Tagging didn’t answer in time/)
      expect(alert).toHaveClass('admin-error')
      for (const status of screen.getAllByRole('status'))
        expect(status).not.toHaveTextContent(/didn’t answer/)
    })

    it('shows the load error when the follow-up read fails', async () => {
      let reads = 0
      await startTagging(
        [untagged('e')],
        () => json({ tagged: 1, calls: 1, note: null, remaining: 0 }),
        () => {
          reads += 1
          return reads === 1
            ? json(closet([untagged('e'), ...GARMENTS.slice(0, 2)]))
            : json({}, 500)
        },
      )
      await act(async () => {})
      expect(
        screen.getByText('That didn’t load. Try again in a minute.'),
      ).toBeInTheDocument()
    })

    it('says "photo" for a single piece', async () => {
      await startTagging([untagged('e')], () => new Promise(() => {}))
      expect(screen.getByText(/^Tagging/)).toHaveTextContent(
        'Tagging 1 photo in one batch · 0 s',
      )
    })

    it('says tagging did not answer at 195 s, and that it may still finish', async () => {
      await startTagging([untagged('e')], () => new Promise(() => {}))
      await act(async () => {
        vi.advanceTimersByTime(195_000)
      })
      expect(
        screen.getByText(
          'Tagging didn’t answer in time. It may still finish, so reload to see.',
        ),
      ).toBeInTheDocument()
      expect(screen.queryByText(/Still working/)).not.toBeInTheDocument()
    })

    it('keeps its words for a network error', async () => {
      await startTagging([untagged('e')], () => {
        throw new TypeError('Failed to fetch')
      })
      expect(
        screen.getByText(
          'Tag now: tagging did not start. Check your connection',
        ),
      ).toBeInTheDocument()
    })

    it('does not update after unmount', async () => {
      await startTagging([untagged('e')], () => new Promise(() => {}))
      cleanup()
      const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
      await act(async () => {
        vi.advanceTimersByTime(170_000)
      })
      expect(errors).not.toHaveBeenCalled()
      errors.mockRestore()
    })
  })

  it('says so when tagging is already running', async () => {
    stubApi({
      'POST /api/closet/tag': () =>
        json({ detail: 'A refresh is already running' }, 409),
    })
    renderCloset()
    await userEvent.click(
      await screen.findByRole('button', { name: 'Tag now' }),
    )
    expect(
      await screen.findByText(/tagging is already running/),
    ).toBeInTheDocument()
  })

  it('shows the waiting pieces on Show them, and at once from a sitting (AC 7)', async () => {
    stubApi()
    renderCloset()
    await screen.findByRole('list')
    expect(tiles()).toContain('/admin/closet/d')
    await userEvent.click(screen.getByRole('button', { name: 'Show them' }))
    expect(tiles()).toEqual(['/admin/closet/d'])
  })

  it('opens on the untagged pieces when a sitting sends them here', async () => {
    stubApi()
    render(
      <MemoryRouter
        initialEntries={[
          { pathname: '/admin/closet', state: { closetStatus: 'untagged' } },
        ]}
      >
        <AdminCloset />
      </MemoryRouter>,
    )
    await screen.findByRole('list')
    expect(tiles()).toEqual(['/admin/closet/d'])
  })

  it('reports the badge count to the layout and a signed-out read', async () => {
    stubApi({
      'GET /api/closet/garments': () => json({ detail: 'no' }, 401),
    })
    renderCloset()
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Your session ended',
    )
  })
})
