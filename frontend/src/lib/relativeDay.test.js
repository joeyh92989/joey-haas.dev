import { describe, expect, it } from 'vitest'
import { daysAgo } from './relativeDay.js'
import { dayWords } from './releaseWords.js'

describe('daysAgo', () => {
  const today = '2026-11-08'

  it('names today, yesterday and a count of days', () => {
    expect(daysAgo('2026-11-08', today)).toBe('today')
    expect(daysAgo('2026-11-07', today)).toBe('yesterday')
    expect(daysAgo('2026-11-05', today)).toBe('3 days ago')
    expect(daysAgo('2026-10-16', today)).toBe('23 days ago')
  })

  it('crosses a month and a year as calendar days', () => {
    expect(daysAgo('2026-10-31', '2026-11-01')).toBe('yesterday')
    expect(daysAgo('2025-12-31', '2026-01-02')).toBe('2 days ago')
  })

  it('reads a day after today as its date', () => {
    expect(daysAgo('2026-11-09', today)).toBe(dayWords('2026-11-09'))
  })

  it('defaults to the local day', () => {
    const now = new Date()
    const iso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    expect(daysAgo(iso)).toBe('today')
  })
})
