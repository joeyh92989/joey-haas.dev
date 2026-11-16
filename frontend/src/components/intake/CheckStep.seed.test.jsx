import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
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

function step(entries) {
  fakeIntakeApi({
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
})
