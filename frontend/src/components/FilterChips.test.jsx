import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { NO_FILTER } from '../lib/shelf.js'
import FilterChips from './FilterChips.jsx'

const GROUPS = [
  {
    key: 'type',
    label: 'Type',
    options: [
      { value: 'game', label: 'Games', count: 3 },
      { value: 'movie', label: 'Film & TV', count: 0 },
    ],
  },
  {
    key: 'status',
    label: 'Status',
    options: [
      { value: 'backlog', label: 'Backlog', count: 2 },
      { value: 'finished', label: 'Finished', count: 1 },
    ],
  },
]
const TOGGLES = [
  { key: 'wanted', label: 'Want', count: 1 },
  { key: 'unrated', label: 'Finished, unrated', count: 0 },
]

function renderChips(value = NO_FILTER) {
  const onChange = vi.fn()
  render(
    <FilterChips
      groups={GROUPS}
      toggles={TOGGLES}
      value={value}
      onChange={onChange}
    />,
  )
  return onChange
}

const chip = (name) => screen.getByRole('button', { name: new RegExp(name) })

describe('FilterChips', () => {
  it('shows each chip with its count', () => {
    renderChips()
    expect(chip('Games')).toHaveTextContent('Games 3')
    expect(chip('Backlog')).toHaveTextContent('2')
  })

  it('hides chips with nothing behind them', () => {
    renderChips()
    expect(
      screen.queryByRole('button', { name: /Film/ }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /unrated/ }),
    ).not.toBeInTheDocument()
  })

  it('reflects the selection in aria-pressed', () => {
    renderChips({ ...NO_FILTER, type: 'game', wanted: true })
    expect(chip('Games')).toHaveAttribute('aria-pressed', 'true')
    expect(chip('Backlog')).toHaveAttribute('aria-pressed', 'false')
    expect(chip('Want')).toHaveAttribute('aria-pressed', 'true')
  })

  it('selects one option per group', async () => {
    const onChange = renderChips({ ...NO_FILTER, status: 'finished' })
    await userEvent.click(chip('Backlog'))
    expect(onChange).toHaveBeenCalledWith({ ...NO_FILTER, status: 'backlog' })
  })

  // Clicking the pressed chip returns the group to its implicit All.
  it('clears a group when its pressed chip is clicked again', async () => {
    const onChange = renderChips({ ...NO_FILTER, type: 'game' })
    await userEvent.click(chip('Games'))
    expect(onChange).toHaveBeenCalledWith(NO_FILTER)
  })

  it('flips toggles independently of the groups', async () => {
    const onChange = renderChips({ ...NO_FILTER, type: 'game' })
    await userEvent.click(chip('Want'))
    expect(onChange).toHaveBeenCalledWith({
      ...NO_FILTER,
      type: 'game',
      wanted: true,
    })
  })

  // A pressed chip whose count fell to zero must stay reachable, or the
  // filter could not be undone.
  it('keeps a pressed chip visible even at zero', () => {
    renderChips({ ...NO_FILTER, unrated: true })
    expect(chip('unrated')).toHaveAttribute('aria-pressed', 'true')
  })
})
