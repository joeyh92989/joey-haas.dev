import { describe, expect, it } from 'vitest'
import { finishDates, finishRows, timeWord } from './finishes.js'

describe('finishDates', () => {
  it('reads finishes, and falls back to finished_at for an old snapshot', () => {
    expect(
      finishDates({ finishes: ['2024-03-01', '2026-10-19'], finished_at: 'x' }),
    ).toEqual(['2024-03-01', '2026-10-19'])
    expect(finishDates({ finished_at: '2026-10-19' })).toEqual(['2026-10-19'])
    expect(finishDates({ finished_at: null })).toEqual([])
    expect(finishDates({ finishes: ['2026-10', null] })).toEqual([])
  })
})

describe('finishRows', () => {
  it('gives each finish its own row, numbered, with replays marked', () => {
    const rows = finishRows({
      id: 'a',
      title: 'Dredge',
      finishes: ['2024-03-01', '2026-10-19'],
      finished_at: '2026-10-19',
      times_completed: 2,
    })
    expect(
      rows.map((row) => [row.finished_at, row.finish_number, row.again]),
    ).toEqual([
      ['2024-03-01', 1, false],
      ['2026-10-19', 2, true],
    ])
    expect(rows.map((row) => row.finish_key)).toEqual([
      'a-2024-03-01',
      'a-2026-10-19',
    ])
  })

  it('counts dateless earlier completions in the numbers', () => {
    const [row] = finishRows({
      id: 'b',
      finishes: ['2026-10-19'],
      times_completed: 3,
    })
    expect(row.finish_number).toBe(3)
    expect(row.again).toBe(true)
  })
})

describe('timeWord', () => {
  it('words the ordinal', () => {
    expect(timeWord(2)).toBe('second time')
    expect(timeWord(3)).toBe('third time')
    expect(timeWord(11)).toBe('11th time')
    expect(timeWord(22)).toBe('22nd time')
  })
})
