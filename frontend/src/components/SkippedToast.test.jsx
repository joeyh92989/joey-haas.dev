import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import SkippedToast from './SkippedToast.jsx'

const PICK = { item_id: 'p1', title: 'Hades II' }

describe('SkippedToast', () => {
  it('is a status that names the game, with an Undo button', async () => {
    const onUndo = vi.fn()
    render(
      <ul>
        <SkippedToast pick={PICK} onUndo={onUndo} />
      </ul>,
    )
    expect(screen.getByRole('status')).toHaveTextContent(
      'Hades II is off tonight’s list.',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(onUndo).toHaveBeenCalledWith(PICK)
  })
})
