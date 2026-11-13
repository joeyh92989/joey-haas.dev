import { afterEach, describe, expect, it, vi } from 'vitest'
import { normalize } from './normalize.js'
import {
  GROUP_LIMIT,
  loadIndex,
  pageEntry,
  resetIndexCache,
  score,
  search,
} from './searchIndex.js'

const entry = (g, title, secondary = '') => ({
  g,
  t: normalize(title),
  s: normalize(secondary),
  title,
  sub: secondary,
  href: `/${g}/${encodeURIComponent(title)}`,
})

describe('score', () => {
  const e = entry('shelf', 'Super Mario Odyssey', 'Nintendo Switch 2017')

  it.each([
    ['super', 3],
    ['mario', 2],
    ['ario', 1],
    ['switch', 0.5],
    ['zelda', 0],
    ['', 0],
  ])('%s scores %s', (q, expected) => {
    expect(score(e, q)).toBe(expected)
  })
})

describe('search', () => {
  const pages = [
    pageEntry({ path: '/', title: 'Home', description: 'The front page' }),
    pageEntry({ path: '/about', title: 'About', description: 'Who I am' }),
  ]

  it('lists the pages alone, in order, for an empty query', () => {
    const { groups, count } = search(
      [...pages, entry('shelf', 'Hollow Knight')],
      '  ',
    )
    expect(groups.map((g) => g.key)).toEqual(['pages'])
    expect(groups[0].rows.map((r) => r.title)).toEqual(['Home', 'About'])
    expect(count).toBe(2)
  })

  it('ranks prefix over word prefix over substring over secondary', () => {
    const entries = [
      entry('shelf', 'Starfield'),
      entry('shelf', 'Halo Star'),
      entry('shelf', 'Mustard'),
      entry('shelf', 'Ostarine', ''),
      entry('shelf', 'Pikmin', 'star rated'),
    ]
    const { groups } = search(entries, 'star')
    expect(groups[0].rows.map((r) => r.title)).toEqual([
      'Starfield',
      'Halo Star',
      'Mustard',
      'Ostarine',
      'Pikmin',
    ])
  })

  it('breaks ties by group order, then title', () => {
    const entries = [
      entry('shelf', 'Zelda notes'),
      entry('posts', 'Zelda review'),
      entry('shelf', 'Zelda BOTW'),
    ]
    const { groups } = search(entries, 'zelda')
    expect(groups.map((g) => g.key)).toEqual(['posts', 'shelf'])
    expect(groups[1].rows.map((r) => r.title)).toEqual([
      'Zelda BOTW',
      'Zelda notes',
    ])
  })

  it(`caps each group at ${GROUP_LIMIT} and drops empty groups`, () => {
    const entries = Array.from({ length: 8 }, (_, i) =>
      entry('shelf', `Mario ${i}`),
    )
    const { groups, count } = search([...pages, ...entries], 'mario')
    expect(groups).toHaveLength(1)
    expect(groups[0].rows).toHaveLength(GROUP_LIMIT)
    expect(count).toBe(GROUP_LIMIT)
  })

  it('folds accents and punctuation in the query', () => {
    const { groups } = search(
      [entry('shelf', 'Pokémon Legends: Z-A')],
      'POKEMON legends z a',
    )
    expect(groups[0].rows[0].title).toBe('Pokémon Legends: Z-A')
  })

  it('finds a post by a keyword phrase', () => {
    const post = entry(
      'posts',
      'My Shelf tour',
      'shelf engineering Game-Key Card cartridge',
    )
    const { groups } = search([...pages, post], 'key card')
    expect(groups[0].rows[0]).toBe(post)
  })
})

describe('loadIndex', () => {
  afterEach(() => {
    resetIndexCache()
    vi.unstubAllGlobals()
  })

  const stubFetch = (impl) => {
    const fetch = vi.fn(impl)
    vi.stubGlobal('fetch', fetch)
    return fetch
  }

  it('returns valid entries and caches the fetch', async () => {
    const good = entry('shelf', 'Hades')
    const fetch = stubFetch(async () => ({
      ok: true,
      json: async () => ({ entries: [good, { g: 'admin', t: 'x' }] }),
    }))
    expect(await loadIndex()).toEqual({ entries: [good] })
    await loadIndex()
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledWith('/search-index.json')
  })

  it.each([
    ['a 404', async () => ({ ok: false, json: async () => ({}) })],
    ['a network error', async () => Promise.reject(new TypeError('offline'))],
    ['the wrong shape', async () => ({ ok: true, json: async () => ({}) })],
    ['bad JSON', async () => ({ ok: true, json: async () => JSON.parse('<') })],
  ])('resolves unavailable on %s and retries next time', async (_, impl) => {
    const fetch = stubFetch(impl)
    expect(await loadIndex()).toEqual({ unavailable: true })
    await loadIndex()
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})
