import '@testing-library/jest-dom'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { axeViolations } from '../../lib/axe.test-util.js'
import { entry, fakeIntakeApi, KINDS } from '../../lib/intake.test-util.js'
import SeedCheck from './SeedCheck.jsx'

const KIND = KINDS.find((kind) => kind.key === 'garment')

const seedEntry = (id, payload = {}, extra = {}) =>
  entry(id, 'typed', {
    kind: 'garment',
    payload: {
      name: `Tee ${id}`,
      brand: 'Acme',
      color_name: 'Burgundy',
      size: 'M',
      category: 'top',
      primary_color: 'red',
      image: 'held',
      seed: { source: 'stitchfix', order_id: 'ORD-1', image_url: 'x' },
      ...payload,
    },
    photo_id: `p-${id}`,
    ...extra,
  })

/** The sitting's entries live in state, as AdminSitting keeps them. */
function Harness({ initial }) {
  const [entries, setEntries] = useState(initial)
  const replace = (next) =>
    setEntries((old) => old.map((e) => (e.id === next.id ? next : e)))
  return (
    <SeedCheck
      sitting={{ id: 's1' }}
      kind={KIND}
      entries={entries.filter((e) => e.state !== 'ignored')}
      onEntry={replace}
    />
  )
}

/** The fake API holds the same entries the page starts from. */
function show(initial, options = {}) {
  const api = fakeIntakeApi({
    ...options,
    sittings: [{ id: 's1', area: 'closet', kind: 'garment', entries: initial }],
  })
  const view = render(<Harness initial={initial} />)
  return { api, ...view }
}

afterEach(() => vi.unstubAllGlobals())

describe('SeedCheck', () => {
  it('shows each piece with its photo, its fields and where it came from', async () => {
    const { container } = show([seedEntry('e1')])
    const photo = await screen.findByRole('img', { name: 'Tee e1' })
    expect(photo).toHaveAttribute('src', '/api/intake/photos/p-e1/image')
    expect(screen.getByLabelText('Store colour')).toHaveValue('Burgundy')
    expect(screen.getByLabelText('Size')).toHaveValue('M')
    expect(screen.getByText('stitchfix · order ORD-1')).toBeInTheDocument()
    expect(screen.queryByText(/^Needs/)).not.toBeInTheDocument()
    expect(await axeViolations(container)).toEqual([])
  })

  it('says why a piece has no photo and what it still needs', async () => {
    show([
      seedEntry(
        'e1',
        {
          image: 'failed',
          image_error: 'the store answered 404',
          category: undefined,
          primary_color: undefined,
        },
        { photo_id: null },
      ),
    ])
    expect(
      await screen.findByText('No photo: the store answered 404'),
    ).toBeInTheDocument()
    expect(screen.getByText('Needs Category and Colour')).toBeInTheDocument()
  })

  it('saves an edit when its field is left, keeping the rest of the payload', async () => {
    const user = userEvent.setup()
    const { api } = show([seedEntry('e1')])
    const size = await screen.findByLabelText('Size')
    await user.clear(size)
    await user.type(size, 'L')
    await user.tab()
    await waitFor(() =>
      expect(api.calls('PATCH', /entries\/e1$/)).toHaveLength(1),
    )
    const [{ body }] = api.calls('PATCH', /entries\/e1$/)
    expect(body.payload).toMatchObject({ size: 'L', name: 'Tee e1' })
    expect(body.payload.seed.source).toBe('stitchfix')
  })

  it('does not save when nothing changed', async () => {
    const user = userEvent.setup()
    const { api } = show([seedEntry('e1')])
    await user.click(await screen.findByLabelText('Brand'))
    await user.tab()
    expect(api.calls('PATCH', /entries/)).toEqual([])
  })

  it('asks before marking a piece not owned, then drops it', async () => {
    const user = userEvent.setup()
    const { api } = show([seedEntry('e1'), seedEntry('e2')])
    await user.click(
      await screen.findByRole('button', { name: 'Don’t own this: Tee e1' }),
    )
    // The question names the piece, and nothing is sent yet.
    expect(screen.getByText(/Mark Tee e1 as not owned\?/)).toBeInTheDocument()
    expect(api.calls('POST', /not-owned/)).toEqual([])
    await user.click(screen.getByRole('button', { name: 'Yes, not owned' }))
    await waitFor(() =>
      expect(api.calls('POST', /entries\/e1\/not-owned$/)).toHaveLength(1),
    )
    await waitFor(() =>
      expect(screen.queryByRole('img', { name: 'Tee e1' })).toBeNull(),
    )
    expect(screen.getByRole('img', { name: 'Tee e2' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(
      'Tee e1 marked not owned',
    )
  })

  it('keeps the piece when the question is declined', async () => {
    const user = userEvent.setup()
    const { api } = show([seedEntry('e1')])
    await user.click(
      await screen.findByRole('button', { name: 'Don’t own this: Tee e1' }),
    )
    await user.click(screen.getByRole('button', { name: 'Keep it' }))
    expect(api.calls('POST', /not-owned/)).toEqual([])
    expect(screen.getByRole('img', { name: 'Tee e1' })).toBeInTheDocument()
  })

  it('fetches the photos of pending pieces until none waits', async () => {
    const { api } = show(
      [
        seedEntry('e1', { image: 'pending' }, { photo_id: null }),
        seedEntry('e2', { image: 'pending' }, { photo_id: null }),
      ],
      {
        seedImages: (sitting) => {
          const first = sitting.entries.find(
            (e) => e.payload.image === 'pending',
          )
          const held = { ...first, photo_id: 'p-late' }
          held.payload = { ...first.payload, image: 'held' }
          sitting.entries = sitting.entries.map((e) =>
            e.id === first.id ? held : e,
          )
          const left = sitting.entries.filter(
            (e) => e.payload.image === 'pending',
          ).length
          return { entries: [held], pending: left }
        },
      },
    )
    // One run asks again by itself until none is pending.
    expect(screen.getByText('Fetching photos · 2 left')).toBeVisible()
    await waitFor(() =>
      expect(api.calls('POST', /seed-images$/)).toHaveLength(2),
    )
    await waitFor(() =>
      expect(screen.queryByText(/Fetching photos/)).not.toBeInTheDocument(),
    )
  })

  it('stops asking when the server cannot fetch', async () => {
    const { api } = show(
      [seedEntry('e1', { image: 'pending' }, { photo_id: null })],
      { seedImages: () => ({ entries: [], pending: 1 }) },
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The photos could not be fetched',
    )
    expect(api.calls('POST', /seed-images$/)).toHaveLength(1)
  })

  it('ignores a save that answers after Don’t own this has started', async () => {
    const user = userEvent.setup()
    const { api } = show([seedEntry('e1')])
    // Hold the save's answer until the not-owned answer has been shown.
    let release
    const gate = new Promise((resolve) => (release = resolve))
    const real = api.fetch.getMockImplementation()
    api.fetch.mockImplementation(async (url, options = {}) => {
      const answer = await real(url, options)
      if (options.method !== 'PATCH') return answer
      // The answer as it was when sent, delivered late.
      const body = await answer.json()
      await gate
      return { ...answer, json: async () => body }
    })
    const size = await screen.findByLabelText('Size')
    await user.clear(size)
    await user.type(size, 'L')
    await user.tab()
    await user.click(
      await screen.findByRole('button', { name: 'Don’t own this: Tee e1' }),
    )
    await user.click(screen.getByRole('button', { name: 'Yes, not owned' }))
    await waitFor(() =>
      expect(screen.queryByRole('img', { name: 'Tee e1' })).toBeNull(),
    )
    release()
    await waitFor(() =>
      expect(api.calls('PATCH', /entries\/e1$/).length).toBeGreaterThan(0),
    )
    // The late save must not bring the piece back.
    await new Promise((resolve) => setTimeout(resolve, 150))
    expect(screen.queryByRole('img', { name: 'Tee e1' })).toBeNull()
  })
})
