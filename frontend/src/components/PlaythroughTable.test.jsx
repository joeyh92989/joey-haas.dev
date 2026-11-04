import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import PlaythroughTable, {
  formatDay,
  journalText,
  outcomeLabel,
} from './PlaythroughTable.jsx'

const RUNS = [
  {
    number: 2,
    started_on: '2026-10-03',
    finished_on: null,
    paused_on: '2026-10-20',
    outcome: null,
    journal_days: 1,
    journal_minutes: 40,
  },
  {
    number: 1,
    started_on: null,
    finished_on: '2024-03-20',
    paused_on: null,
    outcome: 'finished',
    journal_days: 0,
    journal_minutes: 0,
  },
]

describe('PlaythroughTable', () => {
  it('lists runs oldest first, read-only, with no inputs', () => {
    render(<PlaythroughTable runs={RUNS} />)
    const rows = screen.getAllByRole('row').slice(1)
    expect(rows[0]).toHaveTextContent('1')
    expect(rows[0]).toHaveTextContent('20 Mar 2024')
    expect(rows[1]).toHaveTextContent('Paused')
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(document.querySelector('input')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('offers no delete for the open run', () => {
    render(<PlaythroughTable runs={RUNS} editable />)
    expect(
      screen.getByRole('button', { name: 'Delete playthrough 1' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Delete playthrough 2' }),
    ).toBeNull()
  })

  it('says when there is nothing yet', () => {
    render(<PlaythroughTable runs={[]} />)
    expect(screen.getByText('No playthroughs yet.')).toBeInTheDocument()
  })
})

describe('the cell text', () => {
  it('keeps a refused past run open with what was typed', async () => {
    const onAdd = vi.fn().mockResolvedValue(false)
    render(<PlaythroughTable runs={RUNS} editable onAdd={onAdd} />)
    await userEvent.click(screen.getByText('Add a past playthrough'))
    const started = screen.getByLabelText('Started')
    await userEvent.type(started, '2026-02-01')
    await userEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(onAdd).toHaveBeenCalledWith({
      started_on: '2026-02-01',
      finished_on: null,
    })
    expect(screen.getByLabelText('Started')).toHaveValue('2026-02-01')
  })

  it('closes the past-run form once it is saved', async () => {
    const onAdd = vi.fn().mockResolvedValue(true)
    render(<PlaythroughTable runs={RUNS} editable onAdd={onAdd} />)
    await userEvent.click(screen.getByText('Add a past playthrough'))
    await userEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(
      screen.queryByRole('group', { name: 'Past playthrough' }),
    ).not.toBeInTheDocument()
  })

  it('formats a day, or a dash', () => {
    expect(formatDay('2026-10-19')).toBe('19 Oct 2026')
    expect(formatDay(null)).toBe('—')
  })

  it('names an open run by whether it is paused', () => {
    expect(outcomeLabel({ outcome: null, paused_on: null })).toBe('Playing')
    expect(outcomeLabel({ outcome: null, paused_on: '2026-10-01' })).toBe(
      'Paused',
    )
    expect(outcomeLabel({ outcome: 'abandoned' })).toBe('Abandoned')
  })

  it('sums the journal in days and hours', () => {
    expect(journalText({ journal_days: 6, journal_minutes: 660 })).toBe(
      '6 days · 11 h',
    )
    expect(journalText({ journal_days: 1, journal_minutes: 40 })).toBe(
      '1 day · 40 min',
    )
    expect(journalText({ journal_days: 2, journal_minutes: 0 })).toBe('2 days')
    expect(journalText({ journal_days: 0, journal_minutes: 0 })).toBe('—')
  })
})
