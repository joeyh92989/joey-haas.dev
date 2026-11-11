import '@testing-library/jest-dom'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { entry, fakeIntakeApi } from '../../lib/intake.test-util.js'
import GarmentCheck from './GarmentCheck.jsx'

const GARMENT_KIND = {
  key: 'garment',
  area: 'closet',
  label: 'Garment',
  ways_in: ['photo', 'type'],
  has_details: false,
  source_state: null,
  fields: [
    { key: 'name', label: 'Name', control: 'text', options: [] },
    {
      key: 'category',
      label: 'Slot',
      control: 'select',
      options: ['top', 'bottom', 'outer'],
    },
    {
      key: 'warmth',
      label: 'Warmth',
      control: 'select',
      options: ['1', '2', '3', '4', '5'],
    },
  ],
}

const piece = (id, extra = {}) => ({
  id,
  name: null,
  category: null,
  warmth: null,
  status: 'untagged',
  tag_source: null,
  tag_attempts: 3,
  image: `/api/closet/garments/${id}/image?v=1`,
  ...extra,
})

const GARMENTS = [
  piece('g1', { name: 'Oxford shirt' }),
  piece('g2', { name: 'Chore coat', category: 'outer' }),
  // Tagged cleanly: never asked about.
  piece('g3', {
    name: 'Jeans',
    category: 'bottom',
    status: 'active',
    tag_source: 'model',
    tag_attempts: 1,
  }),
  // Still in the queue: Tag now or the nightly takes it.
  piece('g4', { tag_attempts: 1 }),
]

const SITTING = {
  id: 'c1',
  area: 'closet',
  kind: 'garment',
  label: 'Rack',
  photos: [],
  entries: GARMENTS.map((g, n) =>
    entry(`e${n + 1}`, 'ready', { kind: 'garment', garment_id: g.id }),
  ),
}

function renderCheck(onRemoved = vi.fn()) {
  render(
    <GarmentCheck
      sitting={SITTING}
      kind={GARMENT_KIND}
      onRemoved={onRemoved}
    />,
  )
  return onRemoved
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('GarmentCheck (Clothes · Check)', () => {
  it('asks only about pieces the tagger gave up on, one at a time', async () => {
    fakeIntakeApi({ sittings: [SITTING], garments: GARMENTS })
    renderCheck()
    const heading = await screen.findByRole('heading', { name: /Check 1 of 2/ })
    expect(heading).toHaveTextContent(
      'Check 1 of 2 · 1 tagged cleanly, 1 in the tag queue',
    )
    expect(screen.getByRole('img', { name: 'Oxford shirt' })).toHaveAttribute(
      'src',
      expect.stringContaining('/api/closet/garments/g1/image'),
    )
    expect(
      screen.getByText('Check · Slot and Warmth missing'),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toHaveValue('Oxford shirt')
    expect(screen.getByLabelText('Slot')).toHaveValue('')
  })

  it('saves the fields by hand and moves to the next piece', async () => {
    const user = userEvent.setup()
    const api = fakeIntakeApi({ sittings: [SITTING], garments: GARMENTS })
    renderCheck()
    await screen.findByRole('heading', { name: /Check 1 of 2/ })
    await user.selectOptions(screen.getByLabelText('Slot'), 'top')
    await user.selectOptions(screen.getByLabelText('Warmth'), '2')
    await user.click(screen.getByRole('button', { name: 'Save and next' }))
    expect(
      await screen.findByRole('heading', { name: /Check 1 of 1/ }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toHaveValue('Chore coat')
    const [saved] = api.calls('PATCH', /\/api\/closet\/garments\/g1$/)
    expect(saved.body).toEqual({
      name: 'Oxford shirt',
      category: 'top',
      warmth: '2',
    })
  })

  it('puts a piece back in the tag queue on Tag again', async () => {
    const user = userEvent.setup()
    const api = fakeIntakeApi({ sittings: [SITTING], garments: GARMENTS })
    renderCheck()
    await screen.findByRole('heading', { name: /Check 1 of 2/ })
    await user.click(screen.getByRole('button', { name: 'Tag again' }))
    await waitFor(() =>
      expect(api.calls('POST', /\/api\/closet\/tag$/)).toHaveLength(1),
    )
    expect(api.calls('POST', /\/entries\/e1\/tag-again$/)).toHaveLength(1)
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Oxford shirt is back in the tag queue · 0 tagged, 1 still queued',
    )
    expect(screen.getByLabelText('Name')).toHaveValue('Chore coat')
  })

  it('skips without a request, and removes a photo with its garment', async () => {
    const user = userEvent.setup()
    const api = fakeIntakeApi({ sittings: [SITTING], garments: GARMENTS })
    const onRemoved = renderCheck()
    await screen.findByRole('heading', { name: /Check 1 of 2/ })
    await user.click(screen.getByRole('button', { name: 'Skip' }))
    expect(screen.getByLabelText('Name')).toHaveValue('Chore coat')
    expect(api.calls('PATCH', /garments/)).toEqual([])
    // Removing deletes the garment, so it asks once first (as Discard does).
    await user.click(screen.getByRole('button', { name: 'Remove this photo' }))
    expect(screen.getByText(/Remove Chore coat\?/)).toBeInTheDocument()
    expect(api.calls('DELETE', /garments/)).toEqual([])
    await user.click(screen.getByRole('button', { name: 'Keep it' }))
    expect(api.calls('DELETE', /garments/)).toEqual([])
    await user.click(screen.getByRole('button', { name: 'Remove this photo' }))
    await user.click(screen.getByRole('button', { name: 'Yes, remove' }))
    await waitFor(() => expect(onRemoved).toHaveBeenCalledWith('e2'))
    expect(api.calls('DELETE', /\/api\/closet\/garments\/g2$/)).toHaveLength(1)
    expect(
      within(screen.getByRole('region', { name: /Clothes/ })).getByText(
        /Nothing left to check/,
      ),
    ).toBeInTheDocument()
  })
})
