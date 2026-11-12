import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import GuessCombobox from './GuessCombobox.jsx'
import { axeViolations } from '../lib/axe.test-util.js'

const POOL = [
  {
    id: '1',
    title: 'Sea of Stars',
    platform: 'Nintendo Switch',
    year: 2023,
    cover_url: null,
  },
  {
    id: '2',
    title: 'Dredge',
    platform: 'Nintendo Switch',
    year: 2023,
    cover_url: null,
  },
  {
    id: '3',
    title: 'Seasons After Fall',
    platform: 'Nintendo Switch 2',
    year: 2016,
    cover_url: null,
  },
]

function setup(props = {}) {
  const onSubmit = vi.fn()
  const onReject = vi.fn()
  const utils = render(
    <GuessCombobox
      pool={POOL}
      excludedIds={[]}
      guessNumber={1}
      disabled={false}
      onSubmit={onSubmit}
      onReject={onReject}
      {...props}
    />,
  )
  return { ...utils, onSubmit, onReject, user: userEvent.setup() }
}

describe('GuessCombobox', () => {
  it('is a combobox that lists matching titles with platform and year', async () => {
    const { container, user } = setup()
    const input = screen.getByRole('combobox', { name: 'Your guess' })
    expect(input).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByText('Guess 1 of 6')).toBeInTheDocument()
    await user.type(input, 'sea')
    expect(input).toHaveAttribute('aria-expanded', 'true')
    const options = screen.getAllByRole('option')
    expect(options.map((o) => o.textContent)).toEqual([
      'Sea of StarsSwitch · 2023',
      'Seasons After FallSwitch 2 · 2016',
    ])
    expect(options[0]).toHaveAttribute('aria-selected', 'true')
    expect(input).toHaveAttribute('aria-activedescendant', options[0].id)
    expect(await axeViolations(container)).toEqual([])
  })

  it('is described by the count and by the ids it is given', () => {
    setup({ describedBy: 'daily-hint daily-legend' })
    const described = screen
      .getByRole('combobox', { name: 'Your guess' })
      .getAttribute('aria-describedby')
    expect(described).toMatch(/-count daily-hint daily-legend$/)
  })

  it('moves with the arrows, picks with Enter and clears', async () => {
    const { user, onSubmit } = setup()
    const input = screen.getByRole('combobox')
    await user.type(input, 'sea{ArrowDown}{Enter}')
    expect(onSubmit).toHaveBeenCalledWith(POOL[2])
    expect(input).toHaveValue('')
    expect(screen.queryByRole('option')).toBeNull()
  })

  it('wraps around and picks with the pointer', async () => {
    const { user, onSubmit } = setup()
    const input = screen.getByRole('combobox')
    await user.type(input, 'sea{ArrowUp}')
    expect(screen.getAllByRole('option')[1]).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await user.click(screen.getByRole('option', { name: /Sea of Stars/ }))
    expect(onSubmit).toHaveBeenCalledWith(POOL[0])
  })

  it('leaves out guessed titles', async () => {
    const { user } = setup({ excludedIds: ['1'] })
    await user.type(screen.getByRole('combobox'), 'sea')
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Seasons After FallSwitch 2 · 2016',
    ])
  })

  it('submits an exact title typed in full, and refuses anything else', async () => {
    const { user, onSubmit, onReject } = setup()
    const input = screen.getByRole('combobox')
    await user.type(input, 'dredge{Escape}')
    expect(screen.queryByRole('option')).toBeNull()
    await user.keyboard('{Enter}')
    expect(onSubmit).toHaveBeenCalledWith(POOL[1])
    await user.type(input, 'Hades{Escape}{Enter}')
    expect(onReject).toHaveBeenCalledTimes(1)
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('hands back the game when its title was already guessed', async () => {
    const { user, onSubmit, onReject } = setup({ excludedIds: ['3'] })
    await user.type(screen.getByRole('combobox'), 'Seasons After Fall{Enter}')
    expect(onSubmit).not.toHaveBeenCalled()
    expect(onReject).toHaveBeenCalledWith(POOL[2])
  })

  it('closes on Escape and reopens on an arrow', async () => {
    const { user } = setup()
    const input = screen.getByRole('combobox')
    await user.type(input, 'sea{Escape}')
    expect(input).toHaveAttribute('aria-expanded', 'false')
    await user.keyboard('{ArrowDown}')
    expect(input).toHaveAttribute('aria-expanded', 'true')
  })

  it('is disabled after the game', () => {
    setup({ disabled: true, guessNumber: 6 })
    expect(screen.getByRole('combobox')).toBeDisabled()
  })
})
