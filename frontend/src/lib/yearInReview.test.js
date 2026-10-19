import { describe, expect, it } from 'vitest'
import { finishYears, yearInReview } from './yearInReview.js'

const game = (id, fields) => ({
  id,
  type: 'game',
  title: `Game ${id}`,
  wanted: false,
  favorite: false,
  rating: null,
  community_score: null,
  time_to_beat_hours: null,
  genres: [],
  finished_at: null,
  ...fields,
})

const ITEMS = [
  game('a', {
    finished_at: '2026-01-15',
    rating: 9,
    community_score: 70,
    time_to_beat_hours: 20,
    genres: ['Adventure', 'Indie'],
    favorite: true,
  }),
  game('b', {
    finished_at: '2026-03-02',
    rating: 6,
    community_score: 82,
    genres: ['Adventure'],
  }),
  game('c', { finished_at: '2026-03-20', time_to_beat_hours: 5 }),
  game('d', { finished_at: '2025-11-01', rating: 8 }),
  game('e', { finished_at: '2024-06-01', wanted: true }),
  game('f', { finished_at: '2026-04-01', type: 'movie' }),
]

describe('finishYears', () => {
  it('lists years with an owned game finished, newest first', () => {
    expect(finishYears(ITEMS)).toEqual([2026, 2025])
  })
})

describe('yearInReview', () => {
  const review = yearInReview(ITEMS, 2026)

  it('counts the year’s finished games, oldest first', () => {
    expect(review.count).toBe(3)
    expect(review.finished.map((item) => item.id)).toEqual(['a', 'b', 'c'])
  })

  it('averages the ratings it has and totals the hours it has', () => {
    expect(review.averageRating).toBe(7.5)
    expect(review.hours).toBe(25)
    expect(review.timedCount).toBe(2)
  })

  it('counts finishes per month', () => {
    expect(review.byMonth).toEqual([1, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0])
  })

  it('ranks genres by finishes, then by name', () => {
    expect(review.topGenres).toEqual([
      { genre: 'Adventure', count: 2 },
      { genre: 'Indie', count: 1 },
    ])
  })

  it('compares ratings with the community on one scale', () => {
    const { versusCommunity } = review
    expect(versusCommunity).toMatchObject({ compared: 2, higher: 1, lower: 1 })
    // 9/10 against 70/100 is 20 points; 6/10 against 82/100 is 22.
    expect(versusCommunity.furthest.item.id).toBe('b')
  })

  it('is empty for a year with no finishes', () => {
    const empty = yearInReview(ITEMS, 2023)
    expect(empty.count).toBe(0)
    expect(empty.averageRating).toBeNull()
    expect(empty.versusCommunity.furthest).toBeNull()
  })
})
