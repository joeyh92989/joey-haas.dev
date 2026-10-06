import { describe, expect, it } from 'vitest'
import { bandCounts, groupByPlatform, sortBuyNow } from './next.js'

const row = (title, platform, release_date = null) => ({
  title,
  platform,
  release_date,
})

describe('groupByPlatform', () => {
  it('orders Switch 2, Switch, N64, then others, and drops empty groups', () => {
    const groups = groupByPlatform([
      row('a', 'Nintendo 64'),
      row('b', 'Nintendo Switch 2'),
      row('c', 'PC'),
      row('d', 'Nintendo Switch 2'),
    ])
    expect(groups.map((g) => g.platform)).toEqual([
      'Nintendo Switch 2',
      'Nintendo 64',
      'PC',
    ])
    expect(groups[0].rows.map((r) => r.title)).toEqual(['b', 'd'])
  })
})

describe('sortBuyNow', () => {
  const rows = [
    row('old', 'x', '2026-01-01'),
    row('none', 'x'),
    row('new', 'x', '2026-09-01'),
  ]
  it('keeps the server order for best match', () => {
    expect(sortBuyNow(rows, 'best').map((r) => r.title)).toEqual([
      'old',
      'none',
      'new',
    ])
  })
  it('puts the newest first and undated last', () => {
    expect(sortBuyNow(rows, 'newest').map((r) => r.title)).toEqual([
      'new',
      'old',
      'none',
    ])
  })
})

describe('bandCounts', () => {
  it('names Up next, else the first pick', () => {
    const next = {
      tonight: { up_next: null, picks: [{ title: 'Hades II' }] },
      buy_now: [{}, {}],
      preorders: [{}],
    }
    expect(bandCounts(next)).toEqual({
      tonight: 'Hades II',
      toBuy: 2,
      preorders: 1,
    })
    expect(
      bandCounts({
        ...next,
        tonight: { up_next: { title: 'Pinned' }, picks: [] },
      }).tonight,
    ).toBe('Pinned')
  })
})
