import '@testing-library/jest-dom'
import { act, render, screen } from '@testing-library/react'
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

  it('moves focus to Keep it when the question opens', async () => {
    render(<ConfirmDelete onConfirm={() => {}} />)

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))

    expect(screen.getByRole('button', { name: 'Keep it' })).toHaveFocus()
  })

  it('ignores a second click while the delete is in flight', async () => {
    let finish
    const onConfirm = vi.fn(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    render(<ConfirmDelete onConfirm={onConfirm} />)

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    const sure = screen.getByRole('button', { name: 'Delete for good' })
    await userEvent.click(sure)
    await userEvent.click(sure)

    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(sure).toBeDisabled()
    expect(sure).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByRole('button', { name: 'Keep it' })).toBeDisabled()
    await act(async () => finish())
  })

  it('brings Delete back focused when onConfirm fails', async () => {
    const onConfirm = vi.fn(() => Promise.reject(new Error('nope')))
    render(<ConfirmDelete onConfirm={onConfirm} />)

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await userEvent.click(
      screen.getByRole('button', { name: 'Delete for good' }),
    )

    const button = await screen.findByRole('button', { name: 'Delete' })
    expect(button).toHaveFocus()
  })
})
