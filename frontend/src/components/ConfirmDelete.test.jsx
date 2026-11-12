import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import ConfirmDelete from './ConfirmDelete.jsx'

describe('ConfirmDelete', () => {
  it('asks in place and does not delete on the first press', async () => {
    const onConfirm = vi.fn()
    render(<ConfirmDelete onConfirm={onConfirm} />)

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))

    expect(
      screen.getByRole('button', { name: 'Delete for good' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Keep it' })).toBeInTheDocument()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('calls onConfirm only from Delete for good', async () => {
    const onConfirm = vi.fn()
    render(<ConfirmDelete onConfirm={onConfirm} />)

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await userEvent.click(
      screen.getByRole('button', { name: 'Delete for good' }),
    )

    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('goes back to Delete and returns focus to it on Keep it', async () => {
    const onConfirm = vi.fn()
    render(<ConfirmDelete onConfirm={onConfirm} />)

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await userEvent.click(screen.getByRole('button', { name: 'Keep it' }))

    const button = screen.getByRole('button', { name: 'Delete' })
    expect(button).toHaveFocus()
    expect(
      screen.queryByRole('button', { name: 'Delete for good' }),
    ).not.toBeInTheDocument()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('names the subject on the Delete button when given one', () => {
    render(<ConfirmDelete onConfirm={() => {}} subject="Star Fox" />)

    expect(
      screen.getByRole('button', { name: 'Delete Star Fox' }),
    ).toBeInTheDocument()
  })
})
