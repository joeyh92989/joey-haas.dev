import { describe, expect, it } from 'vitest'
import {
  counted,
  dayLabel,
  deviceName,
  referrerName,
  showsAllTime,
} from './analytics.js'

describe('analytics words', () => {
  it('formats a UTC day with or without its weekday', () => {
    expect(dayLabel('2026-10-12')).toBe('12 Oct')
    expect(dayLabel('2026-10-12', { weekday: true })).toBe('Mon 12 Oct')
  })

  it('names devices and the direct referrer', () => {
    expect(deviceName('phone')).toBe('Phone')
    expect(deviceName('watch')).toBe('watch')
    expect(referrerName('')).toBe('Direct / none')
    expect(referrerName('news.example.com')).toBe('news.example.com')
  })

  it('counts with the right plural', () => {
    expect(counted(1, 'view')).toBe('1 view')
    expect(counted(3, 'view')).toBe('3 views')
  })
})

describe('showsAllTime', () => {
  const now = new Date('2026-11-12T12:00:00Z')

  it('waits until counting is more than 30 days old', () => {
    expect(showsAllTime('2026-10-20', now)).toBe(false)
    expect(showsAllTime('2026-10-14', now)).toBe(false)
    expect(showsAllTime('2026-10-13', now)).toBe(true)
    expect(showsAllTime(undefined, now)).toBe(false)
  })
})
