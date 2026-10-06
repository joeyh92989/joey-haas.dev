import { describe, expect, it } from 'vitest'
import { dayWords, releaseWords, utc } from './releaseWords.js'

function row(fields = {}) {
  return { release_date: '2026-12-04', release_precision: 'day', ...fields }
}

describe('releaseWords', () => {
  it('words a date as precisely as it is known', () => {
    expect(releaseWords(row())).toBe('Dec 4, 2026')
    expect(releaseWords(row({ release_precision: 'month' }))).toBe(
      'December 2026',
    )
    expect(
      releaseWords(
        row({ release_date: '2027-04-01', release_precision: 'quarter' }),
      ),
    ).toBe('Q2 2027')
    expect(releaseWords(row({ release_precision: 'year' }))).toBe('2026')
    expect(releaseWords(row({ release_date: null }))).toBe('Date not announced')
  })

  it('words a mid-quarter date as its quarter', () => {
    expect(
      releaseWords(
        row({ release_date: '2027-08-15', release_precision: 'quarter' }),
      ),
    ).toBe('Q3 2027')
  })
})

describe('dayWords', () => {
  it('never shifts a date-only string by a time zone', () => {
    expect(utc('2026-11-08').toISOString()).toBe('2026-11-08T00:00:00.000Z')
    expect(dayWords('2026-11-08')).toBe('Nov 8, 2026')
  })
})
