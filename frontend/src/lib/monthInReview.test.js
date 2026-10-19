import { describe, expect, it } from 'vitest'
import { monthInReview, monthName, parseMonth } from './monthInReview.js'

function game(id, finishedAt, extra = {}) {
  return {
    id,
    type: 'game',
    title: id,
    wanted: false,
    finished_at: finishedAt,
    ...extra,
  }
}

const ITEMS = [
  game('a', '2026-10-03'),
  game('b', '2026-10-01'),
  game('c', '2026-08-20'),
  game('d', '2025-12-31'),
  game('want', '2026-10-02', { wanted: true }),
  { id: 'film', type: 'film', title: 'film', finished_at: '2026-10-02' },
]

describe('parseMonth', () => {
  it('accepts a yyyy-mm month', () => {
    expect(parseMonth('2026-10')).toEqual({ year: 2026, month: 10 })
  })

  it.each(['2026-13', '2026-00', '2026-1', '26-10', '2026-10-01', '', null])(
    'rejects %s',
    (value) => {
      expect(parseMonth(value)).toBeNull()
    },
  )
})

describe('monthName', () => {
  it('names the month and year', () => {
    expect(monthName('2026-10')).toBe('October 2026')
  })
})

describe('monthInReview', () => {
  it('returns null for an invalid month', () => {
    expect(monthInReview(ITEMS, [], '2026-13')).toBeNull()
  })

  it('keeps the month’s owned game finishes, oldest first', () => {
    const review = monthInReview(ITEMS, [], '2026-10')
    expect(review.finished.map((item) => item.id)).toEqual(['b', 'a'])
    expect(review.year).toBe(2026)
  })

  it('groups the month’s sessions by day, newest day first', () => {
    const sessions = [
      { item_id: 'a', title: 'a', played_on: '2026-10-03', minutes: 45 },
      { item_id: 'b', title: 'b', played_on: '2026-10-03', minutes: null },
      { item_id: 'a', title: 'a', played_on: '2026-10-01', minutes: 30 },
      { item_id: 'c', title: 'c', played_on: '2026-09-30', minutes: 20 },
    ]
    const review = monthInReview(ITEMS, sessions, '2026-10')
    expect(review.days.map((day) => day.date)).toEqual([
      '2026-10-03',
      '2026-10-01',
    ])
    expect(review.days[0].sessions.map((row) => row.minutes)).toEqual([
      45,
      null,
    ])
    expect(review.minutes).toBe(75)
  })

  it('is empty for a month with nothing in it', () => {
    const review = monthInReview(ITEMS, [], '2026-09')
    expect(review.finished).toEqual([])
    expect(review.days).toEqual([])
    expect(review.minutes).toBe(0)
  })

  it('links the nearest months with data, across a year boundary', () => {
    const review = monthInReview(ITEMS, [], '2026-08')
    expect(review.previous).toBe('2025-12')
    expect(review.next).toBe('2026-10')
  })

  it('counts a month with only sessions as having data', () => {
    const sessions = [
      { item_id: 'a', title: 'a', played_on: '2026-09-12', minutes: 10 },
    ]
    const review = monthInReview(ITEMS, sessions, '2026-10')
    expect(review.previous).toBe('2026-09')
    expect(review.next).toBeNull()
  })

  it('has no neighbours when nothing else has data', () => {
    const review = monthInReview([game('a', '2026-10-03')], [], '2026-10')
    expect(review.previous).toBeNull()
    expect(review.next).toBeNull()
  })
})
