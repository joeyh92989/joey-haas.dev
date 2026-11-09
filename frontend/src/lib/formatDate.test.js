import { describe, expect, it } from 'vitest'
import { formatDate, ownerDay, ownerMonth, ownerYear } from './formatDate.js'

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

describe('ownerDay', () => {
  it('turns over at midnight in Denver, not UTC', () => {
    // 05:00 UTC on 9 Nov is still 8 Nov, 22:00 in Denver (MST, UTC-7).
    expect(ownerDay(Date.UTC(2026, 10, 9, 5))).toBe('2026-11-08')
    expect(ownerDay(Date.UTC(2026, 10, 9, 7))).toBe('2026-11-09')
  })

  it('follows the spring change: midnight is 07:00 UTC before, 06:00 after', () => {
    // Denver springs forward on 8 March 2026. That night is still MST.
    expect(ownerDay(Date.UTC(2026, 2, 8, 6, 59))).toBe('2026-03-07')
    expect(ownerDay(Date.UTC(2026, 2, 8, 7, 0))).toBe('2026-03-08')
    // The next midnight is MDT (UTC-6).
    expect(ownerDay(Date.UTC(2026, 2, 9, 5, 59))).toBe('2026-03-08')
    expect(ownerDay(Date.UTC(2026, 2, 9, 6, 0))).toBe('2026-03-09')
  })

  it('follows the fall change: midnight is 06:00 UTC before, 07:00 after', () => {
    // Denver falls back on 1 November 2026. That midnight is still MDT.
    expect(ownerDay(Date.UTC(2026, 10, 1, 5, 59))).toBe('2026-10-31')
    expect(ownerDay(Date.UTC(2026, 10, 1, 6, 0))).toBe('2026-11-01')
    // The next midnight is MST (UTC-7).
    expect(ownerDay(Date.UTC(2026, 10, 2, 6, 59))).toBe('2026-11-01')
    expect(ownerDay(Date.UTC(2026, 10, 2, 7, 0))).toBe('2026-11-02')
  })

  it('pads month and day', () => {
    expect(ownerDay(Date.UTC(2027, 0, 3, 12))).toBe('2027-01-03')
  })
})
