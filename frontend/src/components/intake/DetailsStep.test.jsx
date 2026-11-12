import '@testing-library/jest-dom'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { entry } from '../../lib/intake.test-util.js'
import DetailsStep from './DetailsStep.jsx'

const KINDS = [{ key: 'comic', label: 'Comic', fields: [] }]

function step(payload) {
  const e = entry('e1', 'ready', {
    kind: 'comic',
    chosen: { title: 'Saga', year: 2012 },
    payload: { shelf_format: 'trades', ...payload },
  })
  return (
    <DetailsStep
      sitting={{ entries: [e] }}
      kinds={KINDS}
      onEntry={vi.fn()}
      refusals={{}}
      onCommit={vi.fn()}
      onLater={vi.fn()}
      onBack={vi.fn()}
      committing={false}
      target="the shelf"
      headingRef={{ current: null }}
    />
  )
}

const VOL1 = { kind: 'Trade', label: 'Vol. 1', from: 1, to: 6 }

describe('DetailsStep editions', () => {
  it('shows the new editions when the payload changes from outside', async () => {
    const user = userEvent.setup()
    const { rerender } = render(step({}))
    const row = screen.getByRole('group', { name: 'Saga' })
    await user.click(
      within(row).getByRole('button', { name: 'Add an edition' }),
    )
    await user.type(within(row).getByLabelText('Kind, edition 1'), 'Omni')
    rerender(step({ editions: [VOL1] }))
    expect(within(row).getByLabelText('Label, Vol. 1')).toHaveValue('Vol. 1')
    expect(within(row).queryByLabelText('Kind, edition 1')).toBeNull()
  })
})
