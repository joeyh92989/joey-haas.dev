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

  it('reads the picks and radar snapshots as lists', async () => {
    stubFetch(async () => ({ ok: true, json: async () => [] }))
    expect(await readSnapshot('picks')).toEqual([])
    expect(await readSnapshot('radar')).toEqual([])
  })
})

describe('isValidSnapshot', () => {
  it('accepts a next body only with its sections', () => {
    expect(isValidSnapshot('next', { tonight: {}, buy_now: [] })).toBe(true)
    expect(isValidSnapshot('next', [])).toBe(false)
    expect(isValidSnapshot('nope', {})).toBe(false)
  })
})
