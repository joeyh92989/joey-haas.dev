import { describe, expect, it } from 'vitest'

import {
  dayKicker,
  tripDateRange,
  tripDays,
  tripKicker,
  tripMonth,
} from './tripDates.js'

const trip = (date, end, precision) => ({ date, end, precision })

describe('tripKicker', () => {
  it('gives the month and the day count at day precision', () => {
    expect(tripKicker(trip('2026-09-12', '2026-09-23', 'day'))).toBe(
      'Sept 2026 · 12 days',
    )
    expect(tripKicker(trip('2026-06-03', '2026-06-03'))).toBe(
      'June 2026 · 1 day',
    )
  })

  it('withholds the day count below day precision', () => {
    expect(tripKicker(trip('2014-06-01', '2014-06-30', 'month'))).toBe(
      'June 2014',
    )
    expect(tripKicker(trip('2014-01-01', '2014-12-31', 'year'))).toBe('2014')
  })
})

describe('tripMonth and tripDays', () => {
  it('reads dates in UTC, so a first of the month stays in its month', () => {
    expect(tripMonth(trip('2026-10-01', '2026-10-02'))).toBe('Oct 2026')
  })

  it('counts both ends of the trip', () => {
    expect(tripDays('2026-09-28', '2026-10-03')).toBe(6)
  })
})

describe('tripDateRange', () => {
  it.each([
    [trip('2026-09-12', '2026-09-23', 'day'), '12–23 Sept 2026'],
    [trip('2026-09-28', '2026-10-03', 'day'), '28 Sept – 3 Oct 2026'],
    [trip('2026-12-28', '2027-01-03', 'day'), '28 Dec 2026 – 3 Jan 2027'],
    [trip('2026-05-02', '2026-05-02', 'day'), '2 May 2026'],
    [trip('2014-06-01', '2014-06-30', 'month'), 'June 2014'],
    [trip('2014-06-20', '2014-07-04', 'month'), 'June – July 2014'],
    [trip('2014-12-20', '2015-01-04', 'month'), 'Dec 2014 – Jan 2015'],
    [trip('2014-01-01', '2014-12-31', 'year'), '2014'],
    [trip('2014-12-20', '2015-01-04', 'year'), '2014–2015'],
  ])('%j reads %s', (input, expected) => {
    expect(tripDateRange(input)).toBe(expected)
  })
})

describe('dayKicker', () => {
  it('names one day with its weekday', () => {
    const dates = { from: '2026-09-13', to: '2026-09-13' }
    expect(dayKicker({ first: 2, last: 2, dates })).toBe('Day 2 · Sun 13 Sept')
  })

  it('spans a grouped day', () => {
    const dates = { from: '2026-09-19', to: '2026-09-20' }
    expect(dayKicker({ first: 8, last: 9, dates })).toBe(
      'Day 8–9 · Sat–Sun 19–20 Sept',
    )
  })

  it('spans a grouped day across a month', () => {
    const dates = { from: '2026-09-30', to: '2026-10-01' }
    expect(dayKicker({ first: 3, last: 4, dates })).toBe(
      'Day 3–4 · Wed–Thu 30 Sept – 1 Oct',
    )
  })

  it('is a bare day number when the trip is not dated to the day', () => {
    expect(dayKicker({ first: 3, last: 3, dates: null })).toBe('Day 3')
    expect(dayKicker({ first: 3, last: 5, dates: null })).toBe('Day 3–5')
  })
})
