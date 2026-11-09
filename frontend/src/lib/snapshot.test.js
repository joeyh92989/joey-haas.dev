import { afterEach, describe, expect, it, vi } from 'vitest'
import { isValidSnapshot, readSnapshot } from './snapshot.js'

function stubFetch(impl) {
  const fetch = vi.fn(impl)
  vi.stubGlobal('fetch', fetch)
  return fetch
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('readSnapshot', () => {
  it("reads a snapshot from the site's own origin, not the API", async () => {
    const fetch = stubFetch(async () => ({
      ok: true,
      json: async () => [{ id: '1' }],
    }))
    expect(await readSnapshot('items')).toEqual([{ id: '1' }])
    expect(fetch).toHaveBeenCalledWith('/snapshot/items.json')
  })

  it('is null when the file is missing', async () => {
    stubFetch(async () => ({ ok: false, status: 404, json: async () => ({}) }))
    expect(await readSnapshot('items')).toBeNull()
  })

  // Render and Vite both answer an unknown path with the SPA's index.html.
  it('is null when the host answered with the page instead of JSON', async () => {
    stubFetch(async () => ({
      ok: true,
      json: async () => {
        throw new SyntaxError('Unexpected token <')
      },
    }))
    expect(await readSnapshot('stats')).toBeNull()
  })

  it('is null when the request throws', async () => {
    stubFetch(async () => {
      throw new TypeError('offline')
    })
    expect(await readSnapshot('items')).toBeNull()
  })

  it('is null for a body of the wrong shape', async () => {
    stubFetch(async () => ({ ok: true, json: async () => ({ total: 1 }) }))
    expect(await readSnapshot('items')).toBeNull()
    stubFetch(async () => ({ ok: true, json: async () => [] }))
    expect(await readSnapshot('stats')).toBeNull()
  })

  it('is null for an unknown name, without a request', async () => {
    const fetch = stubFetch(async () => ({ ok: true, json: async () => [] }))
    expect(await readSnapshot('../secrets')).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('is null for an inherited property name, without a request', async () => {
    const fetch = stubFetch(async () => ({ ok: true, json: async () => [] }))
    expect(await readSnapshot('constructor')).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('isValidSnapshot', () => {
  it('accepts a next body only with every list the page reads', () => {
    const next = {
      tonight: { up_next: null, picks: [] },
      wanted: [],
      buy_now: [],
      preorders: [],
      later: [],
      not_on_cartridge: [],
    }
    expect(isValidSnapshot('next', next)).toBe(true)
    expect(isValidSnapshot('next', { tonight: {}, buy_now: [] })).toBe(false)
    expect(isValidSnapshot('next', { ...next, tonight: null })).toBe(false)
    expect(isValidSnapshot('next', { ...next, tonight: { picks: 1 } })).toBe(
      false,
    )
    expect(isValidSnapshot('next', { ...next, later: {} })).toBe(false)
    // comics_this_week is optional: a snapshot from before comics paints.
    expect(isValidSnapshot('next', { ...next, comics_this_week: [] })).toBe(
      true,
    )
    expect(isValidSnapshot('next', { ...next, comics_this_week: {} })).toBe(
      false,
    )
    expect(isValidSnapshot('next', [])).toBe(false)
    expect(isValidSnapshot('nope', {})).toBe(false)
  })

  it('accepts a status body with a time or none, and integer counts', () => {
    const status = {
      refreshed_at: '2026-10-21T00:21:00Z',
      titles: 5724,
      platforms: 2,
      stores_watched: 12,
      listings: 1958,
    }
    expect(isValidSnapshot('status', status)).toBe(true)
    expect(isValidSnapshot('status', { ...status, refreshed_at: null })).toBe(
      true,
    )
    expect(isValidSnapshot('status', { ...status, refreshed_at: 1 })).toBe(
      false,
    )
    expect(isValidSnapshot('status', { ...status, titles: '5724' })).toBe(false)
    expect(isValidSnapshot('status', { ...status, listings: undefined })).toBe(
      false,
    )
    expect(isValidSnapshot('status', [])).toBe(false)
  })

  it('accepts a pick-for-me body with its games and combination lists', () => {
    const body = { games: {}, combos: { 'any|': [] } }
    expect(isValidSnapshot('pick-for-me', body)).toBe(true)
    expect(isValidSnapshot('pick-for-me', { games: {} })).toBe(false)
    expect(
      isValidSnapshot('pick-for-me', { ...body, combos: { 'any|': null } }),
    ).toBe(false)
  })

  it('accepts a site-stats body with both ranges, each with its lists', () => {
    const summary = {
      views: 12,
      visitors: 9,
      series: [],
      pages: [],
      referrers: [],
      devices: [],
    }
    const body = { thirty: summary, all: summary }
    expect(isValidSnapshot('site-stats', body)).toBe(true)
    expect(isValidSnapshot('site-stats', { thirty: summary })).toBe(false)
    expect(
      isValidSnapshot('site-stats', {
        ...body,
        all: { ...summary, pages: {} },
      }),
    ).toBe(false)
    expect(
      isValidSnapshot('site-stats', {
        ...body,
        thirty: { ...summary, views: null },
      }),
    ).toBe(false)
    expect(isValidSnapshot('site-stats', [])).toBe(false)
  })

  it('accepts a comics body with its series, stats and weeks', () => {
    const comics = {
      series: [],
      stats: { series: 0 },
      this_week: { weeks: [], later: [] },
    }
    expect(isValidSnapshot('comics', comics)).toBe(true)
    expect(isValidSnapshot('comics', { ...comics, series: {} })).toBe(false)
    expect(isValidSnapshot('comics', { ...comics, stats: null })).toBe(false)
    expect(
      isValidSnapshot('comics', { ...comics, this_week: { weeks: [] } }),
    ).toBe(false)
    expect(isValidSnapshot('comics', [])).toBe(false)
  })
})
