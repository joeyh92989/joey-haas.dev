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
      { value: 'comic', label: 'Comics', count: 1 },
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

describe('FilterChips single-member groups', () => {
  const ONE_TYPE = [
    {
      key: 'type',
      label: 'Type',
      options: [
        { value: 'game', label: 'Games', count: 68 },
        { value: 'movie', label: 'Film & TV', count: 0 },
      ],
    },
    {
      key: 'status',
      label: 'Status',
      options: [
        { value: 'backlog', label: 'Backlog', count: 30 },
        { value: 'finished', label: 'Finished', count: 38 },
      ],
    },
  ]

  it('hides a group with one chip to choose, since it filters nothing', () => {
    render(
      <FilterChips groups={ONE_TYPE} value={NO_FILTER} onChange={() => {}} />,
    )
    expect(screen.queryByRole('group', { name: 'Type' })).toBeNull()
    expect(screen.getByRole('group', { name: 'Status' })).toBeInTheDocument()
  })

  it('keeps a group whose chip is pressed, so the filter can be undone', () => {
    render(
      <FilterChips
        groups={ONE_TYPE}
        value={{ ...NO_FILTER, type: 'game' }}
        onChange={() => {}}
      />,
    )
    expect(screen.getByRole('group', { name: 'Type' })).toBeInTheDocument()
  })

  it('shows a null-count chip always, with no count, and its class', async () => {
    const onChange = vi.fn()
    render(
      <FilterChips
        groups={[
          {
            key: 'occasion',
            label: 'Occasion',
            options: [
              { value: 'office', label: 'Office', count: null },
              { value: 'date', label: 'Date', count: null },
            ],
          },
        ]}
        toggles={[
          {
            key: 'bike',
            label: 'Bike',
            count: null,
            className: 'chip-modifier',
          },
        ]}
        togglesLabel="Getting there"
        value={{ occasion: 'office', bike: false }}
        onChange={onChange}
      />,
    )
    const bike = screen.getByRole('button', { name: 'Bike' })
    expect(bike).toHaveClass('chip', 'chip-modifier')
    expect(bike).toHaveTextContent(/^Bike$/)
    expect(screen.getByRole('button', { name: 'Date' })).toHaveTextContent(
      /^Date$/,
    )
    expect(
      screen.getByRole('group', { name: 'Getting there' }),
    ).toBeInTheDocument()
    await userEvent.click(bike)
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ bike: true }),
    )
  })

  it('disables every chip, and a press changes nothing', async () => {
    const onChange = vi.fn()
    render(
      <FilterChips
        groups={GROUPS}
        toggles={TOGGLES}
        value={NO_FILTER}
        onChange={onChange}
        disabled
      />,
    )
    expect(chip('Games')).toBeDisabled()
    expect(chip('Want')).toBeDisabled()
    await userEvent.click(chip('Games'))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('leaves chips enabled by default', () => {
    renderChips()
    expect(chip('Games')).toBeEnabled()
  })

  it('hides a chip whose count is undefined, as it hides a zero', () => {
    render(
      <FilterChips
        groups={[
          {
            key: 'type',
            label: 'Type',
            options: [
              { value: 'game', label: 'Games', count: 3 },
              { value: 'movie', label: 'Film', count: undefined },
              { value: 'comic', label: 'Comics', count: 1 },
            ],
          },
        ]}
        value={NO_FILTER}
        onChange={() => {}}
      />,
    )
    expect(
      screen.queryByRole('button', { name: /Film/ }),
    ).not.toBeInTheDocument()
  })
})

describe('FilterChips labelled', () => {
  function renderLabelled(value = NO_FILTER) {
    render(
      <FilterChips
        labelled
        groups={GROUPS}
        toggles={TOGGLES}
        value={value}
        onChange={vi.fn()}
      />,
    )
  }

  it('draws each group’s label as text and names the group by it', () => {
    renderLabelled()
    expect(screen.getByText('Type')).toBeVisible()
    expect(screen.getByRole('group', { name: 'Type' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Status' })).toBeInTheDocument()
  })

  it('puts the toggles on the first row', () => {
    renderLabelled()
    const first = screen.getByRole('group', { name: 'Type' })
    expect(first).toContainElement(screen.getByRole('button', { name: /Want/ }))
  })

  it('still hides a one-chip group', () => {
    render(
      <FilterChips
        labelled
        groups={[
          {
            key: 'platform',
            label: 'Platform',
            options: [{ value: 'a', label: 'A', count: 3 }],
          },
        ]}
        value={NO_FILTER}
        onChange={vi.fn()}
      />,
    )
    expect(screen.queryByText('Platform')).not.toBeInTheDocument()
  })

  it('leaves the default layout without a visible label', () => {
    renderChips()
    expect(document.querySelector('.ctl-label')).toBeNull()
  })
})
