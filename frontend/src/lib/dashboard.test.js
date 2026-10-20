import { describe, expect, it } from 'vitest'
import { dashboardCounts, recentChanges } from './dashboard.js'

const item = (overrides) => ({
  id: 1,
  title: 'Game',
  type: 'game',
  status: 'backlog',
  owned_format: 'cartridge',
  is_public: false,
  rating: null,
  finished_at: null,
  updated_at: '2026-10-01T00:00:00Z',
  ...overrides,
})

describe('dashboardCounts', () => {
  const items = [
    item({ id: 1, is_public: true }),
    item({ id: 2, owned_format: null }),
    item({ id: 3, owned_format: 'none', is_public: true }),
    item({
      id: 4,
      status: 'finished',
      rating: 8,
      finished_at: '2026-03-01',
      is_public: true,
    }),
    item({ id: 5, status: 'finished', rating: 9, finished_at: '2025-12-31' }),
    item({ id: 6, status: 'finished', finished_at: '2026-07-04' }),
    item({ id: 7, status: 'finished', type: 'book', owned_format: 'none' }),
  ]

  it('counts owned like the Shelf, public and hidden', () => {
    const counts = dashboardCounts(items, 2026)
    // Every row but the two marked "none"; a blank format still counts.
    expect(counts.owned).toBe(5)
    expect(counts.ownedPublic).toBe(2)
    expect(counts.ownedHidden).toBe(3)
  })

  it('counts finished this year and all time, and averages the ratings', () => {
    const counts = dashboardCounts(items, 2026)
    expect(counts.finished).toBe(4)
    expect(counts.finishedThisYear).toBe(2)
    expect(counts.averageRating).toBe(8.5)
  })

  it('counts finished games without a rating, for Rate a few', () => {
    expect(dashboardCounts(items, 2026).unrated).toBe(1)
  })

  it('has no average with nothing rated', () => {
    expect(dashboardCounts([], 2026)).toEqual({
      owned: 0,
      ownedPublic: 0,
      ownedHidden: 0,
      finished: 0,
      finishedThisYear: 0,
      averageRating: null,
      unrated: 0,
    })
  })
})

describe('recentChanges', () => {
  const jobs = [
    {
      key: 'catalog',
      label: 'Catalog refresh',
      at: Date.parse('2026-10-03T00:40:00Z'),
      summary: 'Failed: Limited Run',
      state: 'failed',
      runNow: '/admin/catalogue',
    },
    {
      key: 'radar',
      label: 'Radar',
      at: Date.parse('2026-10-04T00:44:00Z'),
      summary: 'Upcoming releases',
      state: 'ok',
      runNow: '/admin/radar',
    },
    {
      key: 'snapshot',
      label: 'Public snapshot',
      at: Date.parse('2026-10-05T00:50:00Z'),
      summary: 'Built when public data changes',
      state: 'ok',
      runNow: null,
    },
  ]

  it('merges edits and runs, newest first, leaving out the snapshot', () => {
    const changes = recentChanges(
      [
        item({
          id: 1,
          title: 'Dredge',
          status: 'active',
          updated_at: '2026-10-02T09:00:00Z',
        }),
        item({ id: 2, title: 'Celeste', updated_at: '2026-10-06T09:00:00Z' }),
        item({ id: 3, title: 'Bad date', updated_at: null }),
      ],
      jobs,
    )
    expect(changes.map((change) => [change.title, change.change])).toEqual([
      ['Celeste', 'Edited · Backlog'],
      ['Radar', 'Ran'],
      ['Catalog refresh', 'Failed: Limited Run'],
      ['Dredge', 'Edited · Playing'],
    ])
    expect(changes[0].to).toBe('/admin/collection/2')
    expect(changes[1].to).toBe('/admin/radar')
  })

  it('keeps the newest few', () => {
    const many = Array.from({ length: 9 }, (_, index) =>
      item({ id: index, updated_at: `2026-10-0${index + 1}T00:00:00Z` }),
    )
    const changes = recentChanges(many, [], 3)
    expect(changes.map((change) => change.key)).toEqual([
      'item-8',
      'item-7',
      'item-6',
    ])
  })
})
