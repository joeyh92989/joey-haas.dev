import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  countBy,
  filterItems,
  NO_FILTER,
  readShelfPref,
  sortItems,
  STATUS_LABEL,
  STATUS_ORDER,
  writeShelfPref,
} from './shelf.js'
import { useMediaQuery } from './useMediaQuery.js'

const A = {
  id: 'a',
  type: 'game',
  title: 'Alpha 10',
  status: 'finished',
  rating: 8,
  year: 2020,
  created_at: '2026-01-01T00:00:00Z',
  finished_at: '2026-03-01',
  wanted: false,
}
const B = {
  id: 'b',
  type: 'movie',
  title: 'alpha 9',
  status: 'backlog',
  rating: 3,
  year: 1999,
  created_at: '2026-02-01T00:00:00Z',
  finished_at: null,
  wanted: true,
}
const C = {
  id: 'c',
  type: 'game',
  title: 'Beta',
  status: 'finished',
  rating: null,
  year: null,
  created_at: null,
  finished_at: '2026-05-01',
  wanted: false,
}
const ITEMS = [A, B, C]

const ids = (items) => items.map((item) => item.id)

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('sortItems', () => {
  // Every key in both directions, with a null in each: nulls go last whichever
  // way the sort runs, so an unrated item never tops a "lowest rated" list.
  it.each([
    ['added', 'desc', ['b', 'a', 'c']],
    ['added', 'asc', ['a', 'b', 'c']],
    ['finished', 'desc', ['c', 'a', 'b']],
    ['finished', 'asc', ['a', 'c', 'b']],
    ['rating', 'desc', ['a', 'b', 'c']],
    ['rating', 'asc', ['b', 'a', 'c']],
    ['year', 'desc', ['a', 'b', 'c']],
    ['year', 'asc', ['b', 'a', 'c']],
  ])('sorts by %s %s with nulls last', (key, direction, expected) => {
    expect(ids(sortItems(ITEMS, key, direction, 1))).toEqual(expected)
  })

  // Numeric collation: "Alpha 9" before "Alpha 10", and case does not matter.
  it('sorts titles numerically and case-insensitively', () => {
    expect(ids(sortItems(ITEMS, 'title', 'asc', 1))).toEqual(['b', 'a', 'c'])
    expect(ids(sortItems(ITEMS, 'title', 'desc', 1))).toEqual(['c', 'a', 'b'])
  })

  it('puts a missing title last in both directions', () => {
    const untitled = { ...A, id: 'u', title: null }
    expect(ids(sortItems([untitled, A, C], 'title', 'asc', 1))).toEqual([
      'a',
      'c',
      'u',
    ])
    expect(ids(sortItems([untitled, A, C], 'title', 'desc', 1))).toEqual([
      'c',
      'a',
      'u',
    ])
  })

  it('reproduces the same shuffle from the same seed', () => {
    const many = Array.from({ length: 20 }, (_, n) => ({ ...A, id: `${n}` }))
    const first = ids(sortItems(many, 'random', 'asc', 42))
    const again = ids(sortItems(many, 'random', 'desc', 42))
    // Direction is ignored for random.
    expect(again).toEqual(first)
    expect([...first].sort()).toEqual(ids(many).sort())
  })

  it('shuffles differently from a different seed', () => {
    const many = Array.from({ length: 20 }, (_, n) => ({ ...A, id: `${n}` }))
    expect(ids(sortItems(many, 'random', 'asc', 42))).not.toEqual(
      ids(sortItems(many, 'random', 'asc', 43)),
    )
  })

  it('never mutates its input', () => {
    const input = [...ITEMS]
    sortItems(input, 'rating', 'asc', 1)
    sortItems(input, 'random', 'asc', 7)
    expect(input).toEqual(ITEMS)
  })
})

describe('filterItems', () => {
  const ALL = {
    type: null,
    status: null,
    platform: null,
    wanted: false,
    unrated: false,
  }

  it('matches NO_FILTER', () => {
    expect(NO_FILTER).toEqual(ALL)
  })

  it('filters by platform, alone and with other selections', () => {
    const rows = [
      { ...A, platform: 'Nintendo Switch 2' },
      { ...B, platform: 'Nintendo Switch' },
      { ...C, platform: 'Nintendo Switch 2' },
    ]
    expect(
      ids(filterItems(rows, { ...ALL, platform: 'Nintendo Switch 2' })),
    ).toEqual(['a', 'c'])
    expect(
      ids(
        filterItems(rows, {
          ...ALL,
          platform: 'Nintendo Switch 2',
          unrated: true,
        }),
      ),
    ).toEqual(['c'])
  })

  it('passes everything with nothing selected', () => {
    expect(ids(filterItems(ITEMS, ALL))).toEqual(['a', 'b', 'c'])
  })

  it('filters by type', () => {
    expect(ids(filterItems(ITEMS, { ...ALL, type: 'game' }))).toEqual([
      'a',
      'c',
    ])
  })

  it('filters by status', () => {
    expect(ids(filterItems(ITEMS, { ...ALL, status: 'backlog' }))).toEqual([
      'b',
    ])
  })

  it('filters to the want list', () => {
    expect(ids(filterItems(ITEMS, { ...ALL, wanted: true }))).toEqual(['b'])
  })

  it('filters to finished and unrated', () => {
    expect(ids(filterItems(ITEMS, { ...ALL, unrated: true }))).toEqual(['c'])
  })

  it('ANDs every selection together', () => {
    expect(
      ids(filterItems(ITEMS, { ...ALL, type: 'game', status: 'finished' })),
    ).toEqual(['a', 'c'])
    expect(
      ids(filterItems(ITEMS, { ...ALL, type: 'game', unrated: true })),
    ).toEqual(['c'])
    expect(filterItems(ITEMS, { ...ALL, type: 'game', wanted: true })).toEqual(
      [],
    )
  })
})

describe('countBy', () => {
  it('counts each value of a field', () => {
    expect(countBy(ITEMS, 'type')).toEqual({ game: 2, movie: 1 })
    expect(countBy(ITEMS, 'status')).toEqual({ finished: 2, backlog: 1 })
  })

  it('is empty for no items', () => {
    expect(countBy([], 'type')).toEqual({})
  })
})

describe('shelf preferences', () => {
  it('round-trips a value', () => {
    writeShelfPref('shelf.public.size', 'compact')
    expect(readShelfPref('shelf.public.size', 'comfortable')).toBe('compact')
    writeShelfPref('shelf.public.dim', true)
    expect(readShelfPref('shelf.public.dim', false)).toBe(true)
  })

  it('returns the fallback when nothing is stored', () => {
    expect(readShelfPref('shelf.public.size', 'comfortable')).toBe(
      'comfortable',
    )
  })

  // A hand-edited or stale value of the wrong kind must not reach the page.
  it('returns the fallback for a value of the wrong type or bad JSON', () => {
    localStorage.setItem('shelf.public.dim', '"yes"')
    expect(readShelfPref('shelf.public.dim', false)).toBe(false)
    localStorage.setItem('shelf.public.size', '{not json')
    expect(readShelfPref('shelf.public.size', 'comfortable')).toBe(
      'comfortable',
    )
  })

  // Storage throws outright in some private-browsing modes.
  it('falls back, and never throws, when storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })

    expect(() => writeShelfPref('shelf.public.size', 'compact')).not.toThrow()
    expect(readShelfPref('shelf.public.size', 'comfortable')).toBe(
      'comfortable',
    )
  })
})

describe('status vocabulary', () => {
  it('labels every status in shelf order', () => {
    expect(STATUS_ORDER).toEqual(['backlog', 'active', 'finished', 'abandoned'])
    expect(STATUS_ORDER.map((status) => STATUS_LABEL[status])).toEqual([
      'Backlog',
      'Playing',
      'Finished',
      'Abandoned',
    ])
  })
})

// Kept beside the helpers it serves: the hook is what makes viewport-dependent
// rendering testable at all, since jsdom has no matchMedia.
describe('useMediaQuery', () => {
  it('is false when matchMedia does not exist', () => {
    vi.stubGlobal('matchMedia', undefined)
    const { result } = renderHook(() => useMediaQuery('(hover: hover)'))
    expect(result.current).toBe(false)
  })

  it('reads and follows the query when matchMedia exists', () => {
    const listeners = new Set()
    const list = {
      matches: true,
      addEventListener: (_, listener) => listeners.add(listener),
      removeEventListener: (_, listener) => listeners.delete(listener),
    }
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => list),
    )

    const { result, unmount } = renderHook(() =>
      useMediaQuery('(hover: hover)'),
    )
    expect(result.current).toBe(true)

    list.matches = false
    act(() => listeners.forEach((listener) => listener()))
    expect(result.current).toBe(false)

    unmount()
    expect(listeners.size).toBe(0)
  })
})
