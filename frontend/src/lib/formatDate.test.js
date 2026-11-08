import { describe, expect, it } from 'vitest'
import { formatDate, ownerMonth, ownerYear } from './formatDate.js'

describe('formatDate', () => {
  it('formats the calendar date as written, whatever the local zone', () => {
    // Without timeZone 'UTC' this reads "September 13" west of Greenwich.
    expect(formatDate('2026-09-14')).toBe('September 14, 2026')
  })
})

describe('ownerYear', () => {
  it('turns over at midnight in Denver, not at UTC midnight', () => {
    // 05:00 UTC on 1 January is still 31 December, 22:00 in Denver.
    expect(ownerYear(Date.UTC(2027, 0, 1, 5))).toBe(2026)
    expect(ownerYear(Date.UTC(2027, 0, 1, 8))).toBe(2027)
  })
})

describe('ownerMonth', () => {
  it('turns over at midnight in Denver, not UTC', () => {
    // 05:00 UTC on 1 Nov is still 31 Oct, 23:00 in Denver.
    expect(ownerMonth(Date.UTC(2026, 10, 1, 5))).toEqual({
      year: 2026,
      month: 10,
    })
    expect(ownerMonth(Date.UTC(2026, 10, 1, 7))).toEqual({
      year: 2026,
      month: 11,
    })
  })
})
