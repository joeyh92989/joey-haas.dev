import { describe, expect, it } from 'vitest'
import { spotState, stateCounts } from './spotState.js'

describe('spotState', () => {
  it('is want for a place with no visits', () => {
    expect(spotState({ anchor: false, visit_count: 0 })).toBe('want')
  })

  it('is want when visit_count is missing', () => {
    expect(spotState({ anchor: false })).toBe('want')
    expect(spotState({ visit_count: null })).toBe('want')
  })

  it('is been for one visit or more', () => {
    expect(spotState({ anchor: false, visit_count: 1 })).toBe('been')
    expect(spotState({ visit_count: 7 })).toBe('been')
  })

  it('is null for an anchor, even with visits', () => {
    expect(spotState({ anchor: true, visit_count: 0 })).toBeNull()
    expect(spotState({ anchor: true, visit_count: 4 })).toBeNull()
  })
})

describe('stateCounts', () => {
  it('counts want and been and skips anchors', () => {
    const rows = [
      { anchor: true, visit_count: 2 },
      { anchor: true, visit_count: 0 },
      { visit_count: 0 },
      { visit_count: 0 },
      { visit_count: 3 },
    ]
    expect(stateCounts(rows)).toEqual({ want: 2, been: 1 })
  })

  it('is zero for nothing', () => {
    expect(stateCounts([])).toEqual({ want: 0, been: 0 })
    expect(stateCounts(null)).toEqual({ want: 0, been: 0 })
  })
})
