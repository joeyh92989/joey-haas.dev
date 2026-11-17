import '@testing-library/jest-dom'
import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { entry, fakeIntakeApi, KINDS } from '../../lib/intake.test-util.js'
import CheckStep from './CheckStep.jsx'

const seedPiece = (id, state = 'typed') =>
  entry(id, state, {
    kind: 'garment',
    photo_id: `p-${id}`,
    payload: {
      name: `Tee ${id}`,
      category: 'top',
      primary_color: 'red',
      image: 'held',
      seed: { source: 'duer', order_id: 'O1' },
    },
  })

function step(entries, options = {}) {
  const api = fakeIntakeApi({
    ...options,
    garments: [],
    sittings: [{ id: 's1', area: 'closet', kind: 'garment', entries }],
  })
  render(
    <CheckStep
      sitting={{
        id: 's1',
        area: 'closet',
        kind: 'garment',
        photos: [],
        entries,
      }}
      kinds={KINDS}
      onEntry={vi.fn()}
      onBack={vi.fn()}
      onNext={vi.fn()}
      next="Add 2 to the closet"
      headingRef={{ current: null }}
    />,
  )
  return api
}

afterEach(() => vi.unstubAllGlobals())

describe('Check for a closet sitting from a file', () => {
  it('shows a card for each piece and says what happens to them next', async () => {
    step([seedPiece('e1'), seedPiece('e2')])
    expect(await screen.findByText('From the file · 2')).toBeVisible()
    expect(screen.getAllByRole('img')).toHaveLength(2)
    expect(screen.getByText(/wait in the tag queue/)).toBeVisible()
  })

  it('does not show a piece that was removed or marked not owned', async () => {
    step([seedPiece('e1'), seedPiece('e2', 'ignored')])
    expect(await screen.findByText('From the file · 1')).toBeVisible()
    expect(screen.queryByRole('img', { name: 'Tee e2' })).toBeNull()
  })

  it('keeps the photographed pieces’ check for a sitting with none from a file', async () => {
    step([])
    expect(
      await screen.findByText(/Nothing left to check one at a time/),
    ).toBeVisible()
    expect(screen.queryByText(/From the file/)).toBeNull()
  })

  it('shows pasted links as link cards, with the link hint', async () => {
    const linkPiece = entry('l1', 'typed', {
      kind: 'garment',
      photo_id: 'p-l1',
      candidates: [],
      payload: {
        name: 'Linked Tee',
        image: 'held',
        link: { url: 'https://shop.test/products/t', state: 'resolved' },
        seed: { source: 'link' },
      },
    })
    step([linkPiece])
    expect(await screen.findByText('From links · 1')).toBeVisible()
    expect(screen.queryByText(/From the file/)).toBeNull()
    expect(
      screen.getByText(/Pieces from links wait in the tag queue/),
    ).toBeVisible()
  })

  it('runs one photo loop for a sitting with file and link pieces', async () => {
    const pending = (id, extra) =>
      entry(id, 'typed', {
        kind: 'garment',
        photo_id: null,
        candidates: [],
        payload: {
          name: id,
          image: 'pending',
          seed: { source: 'duer', image_url: `https://cdn.test/${id}.jpg` },
          ...extra,
        },
      })
    const api = step(
      [
        pending('f1'),
        pending('l1', {
          link: { url: 'https://shop.test/p', state: 'resolved' },
        }),
      ],
      { seedImages: () => ({ entries: [], pending: 0 }) },
    )
    expect(await screen.findByText('From the file · 1')).toBeVisible()
    expect(screen.getByText('From links · 1')).toBeVisible()
    await waitFor(() =>
      expect(api.calls('POST', /seed-images$/)).toHaveLength(1),
    )
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(api.calls('POST', /seed-images$/)).toHaveLength(1)
  })
})
