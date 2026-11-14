import { describe, expect, it } from 'vitest'
import { editionSlugs, issueState, wallTiles } from './coverWall.js'

const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i)
const issues = (count) =>
  range(1, count).map((n) => ({
    number: String(n),
    name: `Issue ${n}`,
    store_date: '2020-01-01',
    cover_url: `https://img/${n}.jpg`,
  }))
const edition = (from, to, extra = {}) => ({
  kind: 'Trade',
  label: `Vol. ${from}`,
  from_issue: from,
  to_issue: to,
  cover_url: `https://img/ed-${from}.jpg`,
  ...extra,
})
const wall = (over, open = new Set()) =>
  wallTiles(
    {
      issues: issues(20),
      editions: [],
      owned: new Set(),
      readTo: null,
      released: 20,
      nextIssue: null,
      ...over,
    },
    open,
  )

describe('editionSlugs', () => {
  it('names an edition by its range and numbers duplicates', () => {
    expect(
      editionSlugs([edition(1, 6), edition(7, 12), edition(1, 6)]),
    ).toEqual(['ed-1-6', 'ed-7-12', 'ed-1-6-2'])
  })
})

describe('issueState', () => {
  const base = { owned: new Set([1, 2]), readTo: 1, released: 5 }
  it('classifies an issue', () => {
    expect(issueState({ ...base, n: 1 })).toBe('read')
    expect(issueState({ ...base, n: 2 })).toBe('owned')
    expect(issueState({ ...base, n: 3 })).toBe('missing')
    expect(issueState({ ...base, n: 6 })).toBe('not-out')
    expect(issueState({ ...base, n: 3, skipped: new Set([3]) })).toBe('skipped')
    expect(issueState({ ...base, n: 3, skipped: new Set() })).toBe('missing')
  })

  it('calls a released issue missing even when it is the next dated one', () => {
    // On release day the API says missing; the wall must agree.
    expect(issueState({ ...base, n: 5, nextDated: 5 })).toBe('missing')
  })
})

describe('wallTiles', () => {
  it('draws each issue once', () => {
    const tiles = wall({
      editions: [edition(1, 6)],
      owned: new Set(range(1, 8)),
      released: 8,
    })
    expect(tiles.map((t) => t.kind)).toEqual(['book', 'cover', 'cover'])
    expect(tiles[0]).toMatchObject({
      slug: 'ed-1-6',
      cover_url: 'https://img/ed-1.jpg',
    })
    expect(tiles.slice(1).map((t) => t.n)).toEqual([7, 8])
  })

  it('folds 12 missing, not 11', () => {
    const owned = new Set([...range(1, 60), ...range(73, 80)])
    const folded = wall({ issues: issues(80), owned, released: 80 })
    expect(folded.filter((t) => t.kind === 'stack')).toEqual([
      { kind: 'stack', key: '61-72', from: 61, to: 72, count: 12 },
    ])
    const short = wall({
      issues: issues(80),
      owned: new Set([...range(1, 60), ...range(72, 80)]),
      released: 80,
    })
    expect(short.filter((t) => t.kind === 'stack')).toHaveLength(0)
    expect(
      short.filter((t) => t.kind === 'cover' && t.state === 'missing'),
    ).toHaveLength(11)
  })

  it('opens a stack', () => {
    const owned = new Set([...range(1, 60), ...range(73, 80)])
    const tiles = wall(
      { issues: issues(80), owned, released: 80 },
      new Set(['61-72']),
    )
    const at = tiles.findIndex((t) => t.kind === 'fold')
    expect(tiles[at]).toEqual({ kind: 'fold', key: '61-72' })
    expect(tiles.slice(at + 1, at + 13).map((t) => t.n)).toEqual(range(61, 72))
    expect(tiles.some((t) => t.kind === 'stack')).toBe(false)
  })

  it('never folds what is held', () => {
    const tiles = wall({
      issues: issues(300),
      owned: new Set(range(1, 300)),
      released: 300,
    })
    expect(tiles).toHaveLength(300)
    expect(tiles.every((t) => t.kind === 'cover')).toBe(true)
  })

  it('still draws an owned issue with no Comic Vine row', () => {
    const tiles = wall({
      issues: issues(2),
      owned: new Set([1, 2, 3]),
      released: 3,
    })
    expect(tiles[2]).toMatchObject({
      kind: 'cover',
      n: 3,
      cover_url: null,
      state: 'owned',
    })
  })

  it('adds one not-out tile last', () => {
    const tiles = wall({
      owned: new Set(range(1, 20)),
      nextIssue: { number: '21', store_date: '2026-12-02' },
    })
    expect(tiles.filter((t) => t.kind === 'not-out')).toEqual([
      { kind: 'not-out', n: 21, store_date: '2026-12-02' },
    ])
    expect(tiles[tiles.length - 1].kind).toBe('not-out')
  })

  it('draws a duplicate range once, inside the first', () => {
    const tiles = wall({
      editions: [edition(1, 6), edition(1, 6)],
      owned: new Set(range(1, 6)),
      released: 6,
    })
    expect(tiles.map((t) => t.slug)).toEqual(['ed-1-6', 'ed-1-6-2'])
    expect(tiles.every((t) => t.kind === 'book')).toBe(true)
  })

  it('keeps skips private', () => {
    const owned = new Set([1])
    const without = wall({ owned, released: 5 })
    expect(without.some((t) => t.state === 'skipped')).toBe(false)
    const withSkips = wall({ owned, released: 5, skipped: new Set([2]) })
    expect(withSkips.find((t) => t.n === 2).state).toBe('skipped')
  })
})

describe('wallTiles from the marks', () => {
  it('reads each book on its own, not up to a marker', () => {
    const tiles = wall({
      issues: issues(4),
      owned: new Set([1, 2, 3]),
      reads: new Set([2]),
      released: 4,
    })
    expect(tiles.map((t) => t.state)).toEqual([
      'owned',
      'read',
      'owned',
      'missing',
    ])
  })

  it('shows how far into a book the reading goes', () => {
    const tiles = wall({
      issues: issues(6),
      editions: [edition(1, 6)],
      owned: new Set(),
      reads: new Set([1, 2, 3]),
      released: 6,
    })
    expect(tiles[0]).toMatchObject({ kind: 'book', readTo: 3 })
  })

  it('does not fold a long missing stretch when signed in', () => {
    const tiles = wall({ owned: new Set([20]), reads: new Set(), fold: false })
    expect(tiles.some((t) => t.kind === 'stack')).toBe(false)
    expect(tiles.filter((t) => t.state === 'missing')).toHaveLength(19)
  })
})
