import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import SkippedToast from './SkippedToast.jsx'

const PICK = { item_id: 'p1', title: 'Hades II' }

describe('SkippedToast', () => {
  it('names the game, with an Undo button that names it too', async () => {
    const onUndo = vi.fn()
    render(
      <ul>
        <SkippedToast pick={PICK} onUndo={onUndo} />
      </ul>,
    )
    expect(screen.getByRole('listitem')).toHaveTextContent(
      'Hades II is off tonight’s list.',
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'Undo: Hades II' }),
    )
    expect(onUndo).toHaveBeenCalledWith(PICK)
  })
})
