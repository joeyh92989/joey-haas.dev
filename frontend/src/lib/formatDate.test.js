import { describe, expect, it } from 'vitest'
import { formatDate } from './formatDate.js'

describe('formatDate', () => {
  it('formats the calendar date as written, whatever the local zone', () => {
    // Without timeZone 'UTC' this reads "September 13" west of Greenwich.
    expect(formatDate('2026-09-14')).toBe('September 14, 2026')
  })
})
