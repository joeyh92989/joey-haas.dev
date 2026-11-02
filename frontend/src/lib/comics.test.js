import { describe, expect, it } from 'vitest'
import {
  chipCounts,
  compactRanges,
  editionCoverage,
  expandRanges,
  filterComics,
  publishersByCount,
  runCount,
  runLabel,
  searchComics,
  shortDate,
  sortComics,
} from './comics.js'

const row = (overrides) => ({
  item_id: overrides.title,
  publisher: null,
  following: false,
  wanted: false,
  run_state: 'gaps',
  owned: 3,
  read: 3,
  missing: 0,
  next_issue: null,
  ...overrides,
})

describe('ranges', () => {
  it('expands the canonical en dash and a typed hyphen alike', () => {
    expect(expandRanges('1–3, 5, 7-8')).toEqual([1, 2, 3, 5, 7, 8])
    expect(expandRanges('')).toEqual([])
    expect(expandRanges(null)).toEqual([])
  })

  it('compacts numbers into hyphenated ranges, deduplicated', () => {
    expect(compactRanges([5, 1, 2, 3, 3, 9, 10])).toBe('1-3, 5, 9-10')
    expect(compactRanges([])).toBe('')
  })

  it('round-trips through the two', () => {
    expect(expandRanges(compactRanges([1, 2, 4, 6, 7]))).toEqual([
      1, 2, 4, 6, 7,
    ])
  })

  it('maps each covered issue to the first edition that collects it', () => {
    const covered = editionCoverage([
      { label: 'Vol. 1', from_issue: 1, to_issue: 6 },
      { label: 'Omnibus', from_issue: 5, to_issue: 12 },
    ])
    expect(covered.get(5)).toBe('Vol. 1')
    expect(covered.get(7)).toBe('Omnibus')
    expect(covered.has(13)).toBe(false)
  })
})

describe('labels', () => {
  it('says owned of released, and ongoing with a plus', () => {
    const run = { owned: 54, released: 72, ongoing: true }
    expect(runLabel(run)).toBe('54 of 72 issues owned, ongoing')
    expect(runCount(run)).toBe('54 / 72+')
    expect(runCount(run, '/')).toBe('54/72+')
    expect(runLabel({ owned: 1, released: 1, ongoing: false })).toBe(
      '1 of 1 issue owned',
    )
  })

  it('dates in UTC, so a week never shifts a day', () => {
    expect(shortDate('2026-11-11')).toBe('Nov 11')
  })
})

describe('chips, search and sorts', () => {
  const rows = [
    row({ title: 'Saga', publisher: 'Image', following: true, read: 1 }),
    row({ title: 'Monstress', publisher: 'Image', run_state: 'complete' }),
    row({ title: 'Hellboy', publisher: 'Dark Horse', missing: 4 }),
    row({ title: 'Want me', wanted: true, run_state: null }),
  ]

  it('counts and filters by chip and publisher', () => {
    expect(chipCounts(rows)).toEqual({
      all: 4,
      following: 1,
      gaps: 2,
      unread: 1,
      want: 1,
    })
    expect(filterComics(rows, 'gaps', 'Image').map((r) => r.title)).toEqual([
      'Saga',
    ])
    expect(filterComics(rows, 'nonsense')).toHaveLength(4)
  })

  it('lists publishers most first and ignores unknown ones', () => {
    expect(publishersByCount(rows)).toEqual([
      { publisher: 'Image', count: 2 },
      { publisher: 'Dark Horse', count: 1 },
    ])
  })

  it('searches titles ignoring case', () => {
    expect(searchComics(rows, ' SAG ').map((r) => r.title)).toEqual(['Saga'])
    expect(searchComics(rows, '')).toBe(rows)
  })

  it('sorts as the API does', () => {
    const dated = [
      row({
        title: 'B',
        next_issue: { number: '2', store_date: '2026-11-18' },
      }),
      row({ title: 'A' }),
      row({
        title: 'C',
        next_issue: { number: '9', store_date: '2026-11-11' },
      }),
    ]
    expect(sortComics(dated, 'next').map((r) => r.title)).toEqual([
      'C',
      'B',
      'A',
    ])
    expect(sortComics(rows, 'publisher').map((r) => r.title)).toEqual([
      'Hellboy',
      'Monstress',
      'Saga',
      'Want me',
    ])
    expect(sortComics(rows, 'missing')[0].title).toBe('Hellboy')
  })
})
